/**
 * insightsService.ts
 * استخراج بینش‌های خودکار از داده‌های معاملات
 * هیچ تغییری در دیتابیس نمی‌دهد — فقط read-only است
 */
import { db } from '../db/database';
import { isWin, isLoss } from '../lib/tradeHelpers';
import { getTradingDateParts } from '../lib/tradingTime';

export type InsightSeverity = 'critical' | 'warning' | 'positive' | 'info';

export interface AutoInsight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  dataPoints: number;
  category: string;
  metric?: string; // مقدار کلیدی برای نمایش
}

const DAY_NAMES = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
const SESSION_NAMES: Record<string, string> = {
  london: 'لندن', 'new-york': 'نیویورک', asia: 'آسیا',
  overlap: 'اورلپ', other: 'سایر',
};

const NEGATIVE_EMOTIONS = new Set([
  'FOMO', 'Fearful', 'Anxious', 'Frustrated',
  'Revenge Trading', 'Overconfident', 'Tired', 'Distracted',
]);

function winRate(wins: number, total: number) {
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

function lossRate(losses: number, total: number) {
  return total > 0 ? Math.round((losses / total) * 100) : 0;
}

export const insightsService = {
  async generateAutoInsights(): Promise<AutoInsight[]> {
    const allTrades = await db.trades.where('status').equals('closed').toArray();
    if (allTrades.length < 3) return [];

    const insights: AutoInsight[] = [];

    // ── ۱. تحلیل ساعت معاملاتی ────────────────────────────────────────
    const byHour: Record<number, { wins: number; losses: number }> = {};
    allTrades.forEach(t => {
      const h = getTradingDateParts(t.openedAt).hour;
      if (!byHour[h]) byHour[h] = { wins: 0, losses: 0 };
      if (t.result === 'win' || t.result === 'partial-win') byHour[h].wins++;
      if (t.result === 'loss' || t.result === 'partial-loss') byHour[h].losses++;
    });

    const hourEntries = Object.entries(byHour)
      .filter(([, v]) => v.wins + v.losses >= 3)
      .map(([h, v]) => ({
        hour: Number(h),
        total: v.wins + v.losses,
        wins: v.wins,
        losses: v.losses,
        lossRate: lossRate(v.losses, v.wins + v.losses),
        winRate: winRate(v.wins, v.wins + v.losses),
      }));

    if (hourEntries.length > 0) {
      const worst = [...hourEntries].sort((a, b) => b.lossRate - a.lossRate)[0];
      if (worst.lossRate > 60) {
        insights.push({
          id: 'worst-hour',
          title: `ساعت ${worst.hour}:00 — پرضررترین ساعت`,
          description: `در ساعت ${worst.hour}:00 تا ${worst.hour + 1}:00، نرخ ضرر شما ${worst.lossRate}٪ است. از ${worst.total} معامله، ${worst.losses} معامله ضررده بوده.`,
          severity: worst.lossRate > 75 ? 'critical' : 'warning',
          dataPoints: worst.total,
          category: 'زمان‌بندی',
          metric: `${worst.lossRate}٪ ضرر`,
        });
      }

      const best = [...hourEntries].sort((a, b) => b.winRate - a.winRate)[0];
      if (best.winRate > 65) {
        insights.push({
          id: 'best-hour',
          title: `ساعت ${best.hour}:00 — بهترین ساعت معاملاتی`,
          description: `در ساعت ${best.hour}:00 تا ${best.hour + 1}:00، نرخ برد شما ${best.winRate}٪ است. از ${best.total} معامله، ${best.wins} معامله سودده بوده.`,
          severity: 'positive',
          dataPoints: best.total,
          category: 'زمان‌بندی',
          metric: `${best.winRate}٪ برد`,
        });
      }
    }

    // ── ۲. تحلیل روز هفته ────────────────────────────────────────────
    const byDay: Record<number, { wins: number; losses: number }> = {};
    allTrades.forEach(t => {
      const d = getTradingDateParts(t.openedAt).dayOfWeek;
      if (!byDay[d]) byDay[d] = { wins: 0, losses: 0 };
      if (t.result === 'win' || t.result === 'partial-win') byDay[d].wins++;
      if (t.result === 'loss' || t.result === 'partial-loss') byDay[d].losses++;
    });

    const dayEntries = Object.entries(byDay)
      .filter(([, v]) => v.wins + v.losses >= 3)
      .map(([d, v]) => ({
        day: Number(d),
        name: DAY_NAMES[Number(d)],
        total: v.wins + v.losses,
        wins: v.wins,
        losses: v.losses,
        lossRate: lossRate(v.losses, v.wins + v.losses),
        winRate: winRate(v.wins, v.wins + v.losses),
      }));

    if (dayEntries.length > 0) {
      const worstDay = [...dayEntries].sort((a, b) => b.lossRate - a.lossRate)[0];
      if (worstDay.lossRate > 60) {
        insights.push({
          id: 'worst-day',
          title: `${worstDay.name} — پرضررترین روز هفته`,
          description: `در روز ${worstDay.name} نرخ ضرر شما ${worstDay.lossRate}٪ است (${worstDay.losses} ضرر از ${worstDay.total} معامله). احتیاط بیشتری لازم است.`,
          severity: worstDay.lossRate > 75 ? 'critical' : 'warning',
          dataPoints: worstDay.total,
          category: 'زمان‌بندی',
          metric: `${worstDay.lossRate}٪ ضرر`,
        });
      }

      const bestDay = [...dayEntries].sort((a, b) => b.winRate - a.winRate)[0];
      if (bestDay.winRate > 65) {
        insights.push({
          id: 'best-day',
          title: `${bestDay.name} — بهترین روز هفته برای معامله`,
          description: `در روز ${bestDay.name} نرخ برد شما ${bestDay.winRate}٪ است (${bestDay.wins} برد از ${bestDay.total} معامله).`,
          severity: 'positive',
          dataPoints: bestDay.total,
          category: 'زمان‌بندی',
          metric: `${bestDay.winRate}٪ برد`,
        });
      }
    }

    // ── ۳. سلسله‌های ضرر متوالی ─────────────────────────────────────
    const sorted = [...allTrades].sort((a, b) => a.openedAt - b.openedAt);
    let maxStreak = 0;
    let curStreak = 0;
    let afterStreakWins = 0;
    let afterStreakTotal = 0;
    let countingAfter = false;
    let streakThreshold = 3;

    for (const t of sorted) {
      if (isLoss(t)) {
        curStreak++;
        if (curStreak > maxStreak) maxStreak = curStreak;
        if (curStreak >= streakThreshold) countingAfter = false;
      } else {
        if (curStreak >= streakThreshold) countingAfter = true;
        if (countingAfter && isWin(t)) {
          afterStreakWins++;
          afterStreakTotal++;
        } else if (countingAfter) {
          afterStreakTotal++;
        }
        curStreak = 0;
      }
    }

    if (maxStreak >= streakThreshold) {
      const afterWR = afterStreakTotal > 0
        ? Math.round((afterStreakWins / afterStreakTotal) * 100)
        : null;
      insights.push({
        id: 'consecutive-losses',
        title: `سلسله ضرر: ${maxStreak} معامله ضررده پشت سر هم`,
        description: afterWR !== null
          ? `بیشترین سلسله ضرر متوالی شما ${maxStreak} معامله بوده. نرخ برد بلافاصله بعد از آن: ${afterWR}٪. پس از ${streakThreshold} ضرر متوالی، وقفه گرفتن توصیه می‌شود.`
          : `بیشترین سلسله ضرر متوالی شما ${maxStreak} معامله است. پس از ${streakThreshold} ضرر پشت سر هم، باید معاملات را متوقف کنید.`,
        severity: maxStreak >= 5 ? 'critical' : 'warning',
        dataPoints: maxStreak,
        category: 'رفتار',
        metric: `${maxStreak} ضرر پیاپی`,
      });
    }

    // ── ۴. تحلیل احساسات ────────────────────────────────────────────
    const emotionMap: Record<string, { wins: number; losses: number }> = {};
    allTrades.forEach(t => {
      try {
        const emotions = JSON.parse(t.emotions) as string[];
        emotions.forEach(e => {
          if (!emotionMap[e]) emotionMap[e] = { wins: 0, losses: 0 };
          if (t.result === 'win' || t.result === 'partial-win') emotionMap[e].wins++;
          if (t.result === 'loss' || t.result === 'partial-loss') emotionMap[e].losses++;
        });
      } catch { /* ignore */ }
    });

    // بدترین احساس منفی
    const negEmotions = Object.entries(emotionMap)
      .filter(([e, v]) => NEGATIVE_EMOTIONS.has(e) && v.wins + v.losses >= 3)
      .map(([e, v]) => ({ emotion: e, total: v.wins + v.losses, wins: v.wins, losses: v.losses,
        lr: lossRate(v.losses, v.wins + v.losses) }))
      .sort((a, b) => b.lr - a.lr);

    if (negEmotions.length > 0 && negEmotions[0].lr > 55) {
      const e = negEmotions[0];
      insights.push({
        id: `emotion-${e.emotion}`,
        title: `احساس "${e.emotion}" — نرخ ضرر ${e.lr}٪`,
        description: `هنگام معامله با احساس "${e.emotion}"، نرخ ضرر شما ${e.lr}٪ است. از ${e.total} معامله در این وضعیت، ${e.losses} مورد ضررده بوده. توصیه: اگر این احساس دارید، معامله نکنید.`,
        severity: e.lr > 70 ? 'critical' : 'warning',
        dataPoints: e.total,
        category: 'رفتار',
        metric: `${e.lr}٪ ضرر`,
      });
    }

    // احساس مثبت
    const posEmotions = Object.entries(emotionMap)
      .filter(([e, v]) => !NEGATIVE_EMOTIONS.has(e) && v.wins + v.losses >= 3)
      .map(([e, v]) => ({ emotion: e, total: v.wins + v.losses, wins: v.wins, losses: v.losses,
        wr: winRate(v.wins, v.wins + v.losses) }))
      .sort((a, b) => b.wr - a.wr);

    if (posEmotions.length > 0 && posEmotions[0].wr > 65) {
      const e = posEmotions[0];
      insights.push({
        id: `emotion-pos-${e.emotion}`,
        title: `احساس "${e.emotion}" — بهترین حالت روانی`,
        description: `هنگام معامله با احساس "${e.emotion}"، نرخ برد شما ${e.wr}٪ است. سعی کنید در این حالت ذهنی بیشتر معامله کنید.`,
        severity: 'positive',
        dataPoints: e.total,
        category: 'رفتار',
        metric: `${e.wr}٪ برد`,
      });
    }

    // ── ۵. تحلیل استراتژی‌ها ───────────────────────────────────────
    const strategyIds = [...new Set(allTrades.map(t => t.strategyId).filter(Boolean) as string[])];
    if (strategyIds.length > 0) {
      const strategies = await db.strategies.toArray();
      const stratMap: Record<string, string> = {};
      strategies.forEach(s => { stratMap[s.id] = s.name; });

      const stratStats = strategyIds
        .map(sid => {
          const sTrades = allTrades.filter(t => t.strategyId === sid);
          if (sTrades.length < 3) return null;
          const wins = sTrades.filter(t => t.result === 'win' || t.result === 'partial-win').length;
          const losses = sTrades.filter(t => t.result === 'loss' || t.result === 'partial-loss').length;
          const totalR = sTrades.reduce((acc, t) => acc + (t.rMultiple || 0), 0);
          const avgR = sTrades.filter(t => t.rMultiple !== null).length > 0
            ? totalR / sTrades.filter(t => t.rMultiple !== null).length : 0;
          return { id: sid, name: stratMap[sid] || sid, total: sTrades.length,
            wins, losses, wr: winRate(wins, sTrades.length), avgR };
        })
        .filter(Boolean) as { id: string; name: string; total: number; wins: number; losses: number; wr: number; avgR: number }[];

      if (stratStats.length >= 2) {
        const best = [...stratStats].sort((a, b) => b.wr - a.wr)[0];
        const worst = [...stratStats].sort((a, b) => a.wr - b.wr)[0];

        if (best && best.wr > 55) {
          insights.push({
            id: 'best-strategy',
            title: `بهترین استراتژی: ${best.name}`,
            description: `استراتژی "${best.name}" با نرخ برد ${best.wr}٪ و میانگین R برابر ${best.avgR.toFixed(2)} بهترین عملکرد را داشته (${best.wins} برد از ${best.total} معامله).`,
            severity: 'positive',
            dataPoints: best.total,
            category: 'استراتژی',
            metric: `${best.wr}٪ برد`,
          });
        }

        if (worst && worst.id !== best?.id && worst.wr < 40) {
          insights.push({
            id: 'worst-strategy',
            title: `استراتژی کم‌بازده: ${worst.name}`,
            description: `استراتژی "${worst.name}" با نرخ برد تنها ${worst.wr}٪ ضعیف‌ترین عملکرد را داشته. بازبینی یا توقف استفاده از آن توصیه می‌شود.`,
            severity: worst.wr < 30 ? 'critical' : 'warning',
            dataPoints: worst.total,
            category: 'استراتژی',
            metric: `${worst.wr}٪ برد`,
          });
        }
      }
    }

    // ── ۶. تحلیل پیروی از قوانین ──────────────────────────────────
    const fullyAdh = allTrades.filter(t => t.adherenceRating === 'fully');
    const notAdh = allTrades.filter(t => t.adherenceRating === 'not');

    if (fullyAdh.length >= 3 && notAdh.length >= 3) {
      const adhWR = winRate(fullyAdh.filter(t => t.result === 'win' || t.result === 'partial-win').length, fullyAdh.length);
      const notAdhWR = winRate(notAdh.filter(t => t.result === 'win' || t.result === 'partial-win').length, notAdh.length);
      const diff = adhWR - notAdhWR;

      if (diff > 10) {
        insights.push({
          id: 'adherence-impact',
          title: `پیروی از قوانین: ${diff}٪ بهبود نرخ برد`,
          description: `وقتی کاملاً از قوانین پیروی می‌کنید نرخ برد ${adhWR}٪ است، اما وقتی پیروی نمی‌کنید تنها ${notAdhWR}٪ است. این ${diff}٪ تفاوت اهمیت انضباط را نشان می‌دهد.`,
          severity: 'positive',
          dataPoints: fullyAdh.length + notAdh.length,
          category: 'انضباط',
          metric: `+${diff}٪ با پیروی`,
        });
      } else if (diff < -5) {
        insights.push({
          id: 'adherence-not-helping',
          title: 'پیروی از قوانین بررسی نیاز دارد',
          description: `نرخ برد با پیروی کامل (${adhWR}٪) و بدون پیروی (${notAdhWR}٪) تفاوت قابل توجهی ندارد. قوانین استراتژی نیاز به بازبینی دارند.`,
          severity: 'info',
          dataPoints: fullyAdh.length + notAdh.length,
          category: 'انضباط',
          metric: `${adhWR}٪ vs ${notAdhWR}٪`,
        });
      }
    }

    // ── ۷. تحلیل R-Multiple ─────────────────────────────────────────
    const withR = allTrades.filter(t => t.rMultiple !== null);
    if (withR.length >= 5) {
      const avgR = withR.reduce((acc, t) => acc + (t.rMultiple || 0), 0) / withR.length;
      if (avgR < -0.3) {
        insights.push({
          id: 'avg-r-negative',
          title: `میانگین R منفی: ${avgR.toFixed(2)}R`,
          description: `میانگین R معاملات شما ${avgR.toFixed(2)} است. مدیریت خروج و نسبت ریسک/ریوارد نیاز به بررسی دارد. هدف حداقل ۱R مثبت باشد.`,
          severity: avgR < -0.7 ? 'critical' : 'warning',
          dataPoints: withR.length,
          category: 'مدیریت ریسک',
          metric: `${avgR.toFixed(2)}R`,
        });
      } else if (avgR > 0.8) {
        insights.push({
          id: 'avg-r-positive',
          title: `میانگین R عالی: ${avgR.toFixed(2)}R`,
          description: `میانگین R معاملات شما ${avgR.toFixed(2)} است. مدیریت ریسک و خروج شما در سطح خوبی قرار دارد.`,
          severity: 'positive',
          dataPoints: withR.length,
          category: 'مدیریت ریسک',
          metric: `${avgR.toFixed(2)}R`,
        });
      }
    }

    // ── ۸. تحلیل سشن معاملاتی ───────────────────────────────────────
    const bySess: Record<string, { wins: number; losses: number }> = {};
    allTrades.forEach(t => {
      if (!t.tradingSession) return;
      if (!bySess[t.tradingSession]) bySess[t.tradingSession] = { wins: 0, losses: 0 };
      if (t.result === 'win' || t.result === 'partial-win') bySess[t.tradingSession].wins++;
      if (t.result === 'loss' || t.result === 'partial-loss') bySess[t.tradingSession].losses++;
    });

    const sessEntries = Object.entries(bySess)
      .filter(([, v]) => v.wins + v.losses >= 3)
      .map(([s, v]) => ({ sess: s, name: SESSION_NAMES[s] || s,
        total: v.wins + v.losses, wins: v.wins, losses: v.losses,
        wr: winRate(v.wins, v.wins + v.losses) }));

    if (sessEntries.length >= 2) {
      const bestSess = [...sessEntries].sort((a, b) => b.wr - a.wr)[0];
      if (bestSess.wr > 60) {
        insights.push({
          id: 'best-session',
          title: `سشن ${bestSess.name} — بهترین سشن معاملاتی`,
          description: `در سشن ${bestSess.name} نرخ برد شما ${bestSess.wr}٪ است (${bestSess.wins} برد از ${bestSess.total} معامله). این بهترین پنجره زمانی برای معامله شماست.`,
          severity: 'positive',
          dataPoints: bestSess.total,
          category: 'سشن',
          metric: `${bestSess.wr}٪ برد`,
        });
      }
    }

    // ── ۹. نسبت معاملات با نوت ─────────────────────────────────────
    const withLesson = allTrades.filter(t => t.lesson && t.lesson.trim().length > 0);
    const noLesson = allTrades.filter(t => !t.lesson || t.lesson.trim().length === 0);

    if (withLesson.length >= 3 && noLesson.length >= 3) {
      const lessonWR = winRate(
        withLesson.filter(t => t.result === 'win' || t.result === 'partial-win').length,
        withLesson.length
      );
      const noLessonWR = winRate(
        noLesson.filter(t => t.result === 'win' || t.result === 'partial-win').length,
        noLesson.length
      );
      if (Math.abs(lessonWR - noLessonWR) > 5) {
        const better = lessonWR > noLessonWR;
        insights.push({
          id: 'lesson-impact',
          title: better
            ? `ثبت درس‌آموخته: ${lessonWR - noLessonWR}٪ بهبود عملکرد`
            : 'معاملاتی که درس داشتند بررسی شود',
          description: better
            ? `معاملاتی که درس‌آموخته ثبت کرده‌اید نرخ برد ${lessonWR}٪ دارند، در مقابل ${noLessonWR}٪ برای بقیه. یادگیری فعال مؤثر است.`
            : `معاملاتی که درس‌آموخته ثبت کرده‌اید نرخ برد ${lessonWR}٪ دارند. این معاملات نیاز به بررسی بیشتر دارند.`,
          severity: better ? 'positive' : 'info',
          dataPoints: withLesson.length + noLesson.length,
          category: 'یادگیری',
          metric: better ? `+${lessonWR - noLessonWR}٪` : `${lessonWR}٪ برد`,
        });
      }
    }

    return insights;
  },
};
