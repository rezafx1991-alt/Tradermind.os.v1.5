/**
 * psychologyService.ts — سرویس تحلیل روانشناسی معامله‌گر
 *
 * [Refactor] همه توابع اکنون pure هستند: داده را به عنوان پارامتر می‌گیرند.
 * هیچ db.* call در این فایل وجود ندارد.
 * DB call یک بار توسط analyticsEngine یا hook انجام می‌شود و نتیجه پاس می‌شود.
 *
 * Import hierarchy:
 *   db (یک بار) → analyticsEngine → psychologyService (pure)
 */
import { Trade, DailyJournal, PostTradeReviewData, BehaviorFlag } from '../db/database';
import {
  detectMistakes, detectStrengths, getProcessQuality,
  getByDay, getByHour, getBySession, getOvertradingAnalysis,
  BehaviorPattern, calcBaseMetrics,
} from './performanceService';
import {
  avg, stdDev, toDateStr,
  isClosed, isWin,
  getPTR, flagCount,
} from '../lib/tradeHelpers';
import { getTradingMonthKey } from '../lib/tradingTime';

// ── ۱. تحلیل عملکرد ذهنی ─────────────────────────────────────────────────

export interface MentalStatePoint {
  level: number;
  tradeCount: number;
  winRate: number | null;
  avgR: number | null;
  avgRisk: number | null;
  sampleSize: number;
}

export interface DailyMentalRecord {
  date: string;
  mood: number;
  energy: number;
  focus: number;
  stress: number;
  trades: Trade[];
  winRate: number | null;
  avgR: number | null;
  tradeCount: number;
  avgRisk: number | null;
}

export interface MentalPerfData {
  byMood: MentalStatePoint[];
  byEnergy: MentalStatePoint[];
  byFocus: MentalStatePoint[];
  byStress: MentalStatePoint[];
  dailyRecords: DailyMentalRecord[];
  tradeCountCorrelation: { count: number; winRate: number | null; avgR: number | null }[];
  optimalMood: number | null;
  optimalEnergy: number | null;
  optimalFocus: number | null;
  warningStress: number | null;
  journaledDays: number;
  totalTradingDays: number;
  coverageRate: number;
}

/** pure — بدون DB call */
export function analyzeMentalPerformance(
  allTrades: Trade[],
  journals: DailyJournal[],
): MentalPerfData {
  const trades = allTrades.filter(isClosed);

  const tradesByDate = new Map<string, Trade[]>();
  trades.forEach(t => {
    const d = toDateStr(t.openedAt);
    if (!tradesByDate.has(d)) tradesByDate.set(d, []);
    tradesByDate.get(d)!.push(t);
  });
  const totalTradingDays = tradesByDate.size;

  const dailyRecords: DailyMentalRecord[] = [];
  const journalMap = new Map<string, DailyJournal>();
  journals.forEach(j => journalMap.set(j.date, j));

  for (const [date, dayTrades] of tradesByDate) {
    const j = journalMap.get(date);
    if (!j) continue;

    let mood = j.mood ?? 3;
    let energy = j.energyLevel ?? 5;
    let focus = j.focusLevel ?? 5;
    let stress = j.stressLevel ?? 3;
    try {
      const pts = JSON.parse(j.preTradingState);
      if (pts.mood)   mood   = pts.mood;
      if (pts.energy) energy = pts.energy;
      if (pts.focus)  focus  = pts.focus;
      if (pts.stress) stress = pts.stress;
    } catch { /* ignore */ }

    const closed = dayTrades;
    const wins = closed.filter(isWin).length;
    const withR    = closed.filter(t => t.rMultiple !== null);
    const withRisk = closed.filter(t => t.riskPercentage !== null);

    dailyRecords.push({
      date,
      mood: Math.round(mood), energy: Math.round(energy),
      focus: Math.round(focus), stress: Math.round(stress),
      trades: dayTrades,
      tradeCount: closed.length,
      winRate: closed.length > 0 ? wins / closed.length : null,
      avgR:    avg(withR.map(t => t.rMultiple!)),
      avgRisk: avg(withRisk.map(t => t.riskPercentage!)),
    });
  }

  function buildLevelPoints(
    records: DailyMentalRecord[],
    getter: (r: DailyMentalRecord) => number,
    clamp: [number, number] = [1, 10],
    buckets = 5,
  ): MentalStatePoint[] {
    const groups = new Map<number, DailyMentalRecord[]>();
    for (let b = 1; b <= buckets; b++) groups.set(b, []);
    records.forEach(r => {
      const raw = getter(r);
      const norm = Math.min(buckets, Math.max(1,
        Math.round(((raw - clamp[0]) / (clamp[1] - clamp[0])) * (buckets - 1) + 1)));
      groups.get(norm)!.push(r);
    });
    return [...groups.entries()].map(([level, recs]) => {
      const allT   = recs.flatMap(r => r.trades);
      const wins   = allT.filter(isWin).length;
      const withR  = allT.filter(t => t.rMultiple !== null);
      const wRisk  = allT.filter(t => t.riskPercentage !== null);
      return {
        level,
        sampleSize: recs.length,
        tradeCount: recs.length > 0 ? allT.length / recs.length : 0,
        winRate: allT.length > 0 ? wins / allT.length : null,
        avgR:    avg(withR.map(t => t.rMultiple!)),
        avgRisk: avg(wRisk.map(t => t.riskPercentage!)),
      };
    });
  }

  const byMood   = buildLevelPoints(dailyRecords, r => r.mood,   [1, 5]);
  const byEnergy = buildLevelPoints(dailyRecords, r => r.energy, [1, 10]);
  const byFocus  = buildLevelPoints(dailyRecords, r => r.focus,  [1, 10]);
  const byStress = buildLevelPoints(dailyRecords, r => r.stress, [1, 5]);

  const best = (pts: MentalStatePoint[]) =>
    pts.filter(p => p.sampleSize >= 2 && p.winRate !== null).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  const worst = (pts: MentalStatePoint[]) =>
    pts.filter(p => p.sampleSize >= 2 && p.winRate !== null).sort((a, b) => (a.winRate ?? 1) - (b.winRate ?? 1))[0];

  const countGroups = new Map<number, DailyMentalRecord[]>();
  dailyRecords.forEach(r => {
    const c = Math.min(r.tradeCount, 6);
    if (!countGroups.has(c)) countGroups.set(c, []);
    countGroups.get(c)!.push(r);
  });
  const tradeCountCorrelation = [...countGroups.entries()].sort(([a], [b]) => a - b).map(([count, recs]) => {
    const allT  = recs.flatMap(r => r.trades);
    const wins  = allT.filter(isWin).length;
    const withR = allT.filter(t => t.rMultiple !== null);
    return { count, winRate: allT.length > 0 ? wins / allT.length : null, avgR: avg(withR.map(t => t.rMultiple!)) };
  });

  const bm = best(byMood); const be = best(byEnergy); const bf = best(byFocus); const ws = worst(byStress);
  return {
    byMood, byEnergy, byFocus, byStress, dailyRecords, tradeCountCorrelation,
    optimalMood:   bm ? bm.level : null,
    optimalEnergy: be ? be.level : null,
    optimalFocus:  bf ? bf.level : null,
    warningStress: ws ? ws.level : null,
    journaledDays: dailyRecords.length,
    totalTradingDays,
    coverageRate: totalTradingDays > 0 ? dailyRecords.length / totalTradingDays : 0,
  };
}

// ── ۲. اشتباهات تکرارشونده + روند ────────────────────────────────────────

export interface MistakeTrend extends BehaviorPattern {
  firstHalfCount: number;
  secondHalfCount: number;
  trend: 'improving' | 'worsening' | 'stable';
  trendLabel: string;
  trendDelta: number;
  monthlyFreq: { month: string; count: number }[];
  emotionCorrelations: { emotion: string; count: number }[];
}

function checkPatternMatch(id: string, t: Trade): boolean {
  try {
    const ptr = getPTR(t);
    switch (id) {
      case 'sl-moved':       return t.slMoved === true;
      case 'early-exit':     return ptr?.closedEarly === true;
      case 'risk-increased': return ptr?.riskIncreased === true;
      case 'no-confirm':     return ptr?.enteredWithConfirmation === false;
      case 'fomo':           return ptr?.behaviorFlags?.includes('fomo') ?? false;
      case 'revenge':        return ptr?.behaviorFlags?.includes('revenge-trading') ?? false;
      case 'low-adherence':  return t.adherenceRating === 'not' || t.adherenceRating === 'partially';
      default:               return false;
    }
  } catch { return false; }
}

/** pure — بدون DB call */
export function analyzeRecurringMistakeTrends(allTrades: Trade[]): MistakeTrend[] {
  const trades = allTrades.filter(isClosed);
  const sorted = [...trades].sort((a, b) => a.openedAt - b.openedAt);
  if (sorted.length < 6) return [];

  const mid = Math.floor(sorted.length / 2);
  const firstHalf  = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const allMistakes    = detectMistakes(trades);
  const firstMistakes  = detectMistakes(firstHalf);
  const secondMistakes = detectMistakes(secondHalf);

  function buildMonthlyFreq(pattern: BehaviorPattern): { month: string; count: number }[] {
    const byMonth = new Map<string, number>();
    trades.forEach(t => {
      if (checkPatternMatch(pattern.id, t)) {
        const m = getTradingMonthKey(t.openedAt);
        byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
      }
    });
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
  }

  function buildEmotionCorr(pattern: BehaviorPattern): { emotion: string; count: number }[] {
    const em = new Map<string, number>();
    trades.forEach(t => {
      if (!checkPatternMatch(pattern.id, t)) return;
      try {
        (JSON.parse(t.emotions) as string[]).forEach(e => em.set(e, (em.get(e) ?? 0) + 1));
      } catch { /* ignore */ }
    });
    return [...em.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([emotion, count]) => ({ emotion, count }));
  }

  return allMistakes.map(m => {
    const first  = firstMistakes.find(x => x.id === m.id);
    const second = secondMistakes.find(x => x.id === m.id);
    const fp = first?.pct ?? 0;
    const sp = second?.pct ?? 0;
    const delta = sp - fp;
    const trend: MistakeTrend['trend'] = Math.abs(delta) < 0.03 ? 'stable' : delta < 0 ? 'improving' : 'worsening';
    const trendLabel = trend === 'improving'
      ? `بهتر شده (${Math.abs(Math.round(delta * 100))}٪ کاهش)`
      : trend === 'worsening'
      ? `بدتر شده (${Math.abs(Math.round(delta * 100))}٪ افزایش)` : 'ثابت مانده';
    return {
      ...m,
      firstHalfCount:  first?.count ?? 0,
      secondHalfCount: second?.count ?? 0,
      trend, trendLabel, trendDelta: delta,
      monthlyFreq:        buildMonthlyFreq(m),
      emotionCorrelations: buildEmotionCorr(m),
    };
  });
}

// ── ۳. امتیاز انضباط معاملاتی (۰–۱۰۰) ──────────────────────────────────

export interface DisciplineComponent {
  id: string;
  label: string;
  labelFa: string;
  score: number;
  grade: string;
  description: string;
  details: string[];
  color: string;
}

export interface DisciplineScoreResult {
  total: number;
  grade: string;
  label: string;
  components: DisciplineComponent[];
  sampleWarning: boolean;
  closedCount: number;
  suggestions: string[];
}

function toGrade(score: number): string {
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
}

/** pure — بدون DB call */
export function computeDisciplineScore(allTrades: Trade[]): DisciplineScoreResult {
  const trades = allTrades;
  const closed = trades.filter(isClosed);
  const n = closed.length;

  if (n < 5) {
    return {
      total: 0, grade: 'N/A', label: 'داده کافی نیست',
      components: [], sampleWarning: true, closedCount: n,
      suggestions: ['حداقل ۵ معامله بسته برای محاسبه امتیاز نیاز است.'],
    };
  }

  const ptrs = closed.map(t => getPTR(t)).filter(Boolean) as PostTradeReviewData[];
  const pn = ptrs.length;

  // ── مدیریت سرمایه
  const risks    = closed.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
  const riskMean = avg(risks) ?? 0;
  const riskCV   = risks.length >= 3 ? (stdDev(risks)! / (riskMean || 1)) : null;
  const slRespectedRate  = pn > 0 ? ptrs.filter(r => r.slRespected === true).length / pn : null;
  const riskIncreasedRate = pn > 0 ? ptrs.filter(r => r.riskIncreased === true).length / pn : 0;
  const slMovedRate = closed.filter(t => t.slMoved).length / n;

  let capitalScore = 50;
  if (riskCV !== null) capitalScore += Math.min(35, Math.round((1 - Math.min(riskCV, 1)) * 35));
  if (slRespectedRate !== null) capitalScore += Math.round(slRespectedRate * 30);
  capitalScore -= Math.round(riskIncreasedRate * 15);
  capitalScore -= Math.round(slMovedRate * 15);
  capitalScore = Math.max(0, Math.min(100, capitalScore));

  const capitalDetails = [
    risks.length >= 2 ? `ثبات ریسک: ${riskCV !== null ? (riskCV * 100).toFixed(0) + '٪ پراکندگی' : 'نامشخص'}` : 'داده ریسک کافی نیست',
    slRespectedRate !== null ? `رعایت حد ضرر: ${Math.round(slRespectedRate * 100)}٪` : 'ریویو کافی نیست',
    `جابجایی حد ضرر: ${Math.round(slMovedRate * 100)}٪ معاملات`,
  ];

  // ── رعایت استراتژی
  const adherenceRatings = closed.filter(t => t.adherenceRating !== null);
  const adherenceAvg = adherenceRatings.length > 0
    ? adherenceRatings.reduce((s, t) => s + ({ fully: 100, mostly: 75, partially: 40, not: 0 }[t.adherenceRating!] ?? 50), 0) / adherenceRatings.length
    : null;
  const planFollowedRate = pn > 0 ? ptrs.filter(r => r.entryFollowedPlan === true).length / pn : null;
  const confirmRate      = pn > 0 ? ptrs.filter(r => r.enteredWithConfirmation === true).length / pn : null;

  let stratScore = 50;
  if (adherenceAvg !== null) stratScore = Math.round(adherenceAvg * 0.5 + stratScore * 0.5);
  if (planFollowedRate !== null) stratScore += Math.round((planFollowedRate - 0.5) * 30);
  if (confirmRate !== null) stratScore += Math.round((confirmRate - 0.5) * 20);
  stratScore = Math.max(0, Math.min(100, stratScore));

  const stratDetails = [
    adherenceAvg !== null ? `میانگین رعایت قوانین: ${Math.round(adherenceAvg)}٪` : 'امتیاز رعایت موجود نیست',
    planFollowedRate !== null ? `پیروی از پلن ورود: ${Math.round(planFollowedRate * 100)}٪` : '',
    confirmRate !== null ? `ورود با تأیید: ${Math.round(confirmRate * 100)}٪` : '',
  ].filter(Boolean);

  // ── کنترل احساسات
  const revengeCount = flagCount(closed, 'revenge-trading');
  const fomoCount    = flagCount(closed, 'fomo');
  const fearCount    = flagCount(closed, 'fear');
  const impatience   = flagCount(closed, 'impatience');
  const overconf     = flagCount(closed, 'overconfidence');

  const negativeEmotionTrades = closed.filter(t => {
    try {
      const e = JSON.parse(t.emotions) as string[];
      return e.some(x => ['FOMO', 'Fearful', 'Anxious', 'Frustrated', 'Revenge Trading', 'Overconfident'].includes(x));
    } catch { return false; }
  });
  const negEmRate      = n > 0 ? negativeEmotionTrades.length / n : 0;
  const revRate        = n > 0 ? revengeCount / n : 0;
  const fomoRate       = n > 0 ? fomoCount / n : 0;
  const totalBadFlags  = (revengeCount + fomoCount + fearCount + impatience + overconf) / (n || 1);

  let emotionScore = 100;
  emotionScore -= Math.round(revRate * 50);
  emotionScore -= Math.round(fomoRate * 30);
  emotionScore -= Math.round(negEmRate * 20);
  emotionScore -= Math.round(totalBadFlags * 20);
  emotionScore = Math.max(0, Math.min(100, emotionScore));

  const emotionDetails = [
    `معامله انتقامی: ${revengeCount} مورد (${Math.round(revRate * 100)}٪)`,
    `FOMO: ${fomoCount} مورد (${Math.round(fomoRate * 100)}٪)`,
    `معاملات با احساس منفی: ${Math.round(negEmRate * 100)}٪`,
  ];

  // ── نظم معاملاتی
  const overtradingAnalysis = getOvertradingAnalysis(trades, 4);
  const overtradingRate = overtradingAnalysis.tradingDays > 0
    ? overtradingAnalysis.daysOverThreshold / overtradingAnalysis.tradingDays : 0;
  const reviewRate = closed.length > 0
    ? trades.filter(t => { try { const r = getPTR(t); return r && r.completedAt > 0; } catch { return false; } }).length / closed.length
    : 0;
  const earlyExitRate = pn > 0 ? ptrs.filter(r => r.closedEarly === true).length / pn : 0;

  const byDate = new Map<string, number>();
  closed.forEach(t => { const d = toDateStr(t.openedAt); byDate.set(d, (byDate.get(d) ?? 0) + 1); });
  const dailyCounts = [...byDate.values()];
  const countCV = dailyCounts.length >= 3 ? (stdDev(dailyCounts)! / (avg(dailyCounts) || 1)) : null;

  let disciplineScore = 100;
  disciplineScore -= Math.round(overtradingRate * 30);
  disciplineScore += Math.round(reviewRate * 30) - 15;
  disciplineScore -= Math.round(earlyExitRate * 20);
  if (countCV !== null) disciplineScore -= Math.round(Math.min(countCV, 1) * 15);
  disciplineScore = Math.max(0, Math.min(100, disciplineScore));

  const disciplineDetails = [
    `روزهای پرمعامله: ${overtradingAnalysis.daysOverThreshold} از ${overtradingAnalysis.tradingDays} روز`,
    `نرخ ریویو پس از معامله: ${Math.round(reviewRate * 100)}٪`,
    `خروج زود هنگام: ${Math.round(earlyExitRate * 100)}٪`,
  ];

  const components: DisciplineComponent[] = [
    { id: 'capital',    label: 'Capital Mgmt', labelFa: 'مدیریت سرمایه',   score: capitalScore,    grade: toGrade(capitalScore),    description: 'ثبات ریسک، رعایت حد ضرر، عدم افزایش ریسک',         details: capitalDetails,    color: '#3b82f6' },
    { id: 'strategy',   label: 'Strategy',     labelFa: 'رعایت استراتژی',   score: stratScore,      grade: toGrade(stratScore),      description: 'پیروی از قوانین، ورود با تأیید، عدم انحراف از پلن', details: stratDetails,      color: '#8b5cf6' },
    { id: 'emotion',    label: 'Emotions',     labelFa: 'کنترل احساسات',    score: emotionScore,    grade: toGrade(emotionScore),    description: 'فقدان معامله انتقامی، FOMO، ترس و اضطراب',           details: emotionDetails,    color: '#f97316' },
    { id: 'discipline', label: 'Discipline',   labelFa: 'نظم معاملاتی',     score: disciplineScore, grade: toGrade(disciplineScore), description: 'عدم overtrade، ریویو مداوم، ثبات تعداد معاملات',    details: disciplineDetails, color: '#22c55e' },
  ];

  const total = Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);
  const grade = toGrade(total);
  const label = total >= 85 ? 'عالی' : total >= 70 ? 'خوب' : total >= 55 ? 'متوسط' : total >= 40 ? 'نیاز به بهبود' : 'ضعیف';

  const suggestions: string[] = [];
  const worst = [...components].sort((a, b) => a.score - b.score)[0];
  if (worst.score < 60) {
    if (worst.id === 'capital')    suggestions.push('ریسک را در هر معامله ثابت نگه دارید و هرگز حد ضرر را در جهت نامطلوب جابجا نکنید.');
    if (worst.id === 'strategy')   suggestions.push('قبل از ورود به معامله، چک‌لیست استراتژی را مرور کنید و بدون تأیید وارد نشوید.');
    if (worst.id === 'emotion')    suggestions.push('هر روز احساسات خود را قبل از معامله ثبت کنید. اگر احساس FOMO یا خشم دارید، معامله نکنید.');
    if (worst.id === 'discipline') suggestions.push('سقف روزانه تعداد معاملات برای خودتان تعیین کنید و بعد از هر معامله ریویو کوتاه بنویسید.');
  }
  if (reviewRate < 0.3)      suggestions.push('عادت ریویو روزانه برای بهبود سریع‌تر ضروری است — حداقل برای هر معامله ۳ جمله بنویسید.');
  if (revengeCount > 2)      suggestions.push('معامله انتقامی الگوی خطرناکی است. بعد از ضرر، ۱ ساعت از بازار فاصله بگیرید.');
  if (overtradingRate > 0.3) suggestions.push('Overtrading تله بزرگی است. روزهایی که زیاد معامله می‌کنید بدترین عملکرد را دارید.');

  return { total, grade, label, components, sampleWarning: n < 20, closedCount: n, suggestions };
}

// ── ۴. گزارش هوشمند ──────────────────────────────────────────────────────

export interface SmartReportItem {
  icon: string;
  title: string;
  description: string;
  evidence: string;
  priority: 'high' | 'medium' | 'low';
}

export interface SmartReport {
  positives: SmartReportItem[];
  negatives: SmartReportItem[];
  suggestions: SmartReportItem[];
  overallHealth: number;
  healthLabel: string;
  summary: string;
  generatedAt: number;
  tradingDays: number;
  closedTrades: number;
}

/** pure — بدون DB call */
export function generateSmartReport(allTrades: Trade[], journals: DailyJournal[]): SmartReport {
  const trades = allTrades;
  const closed = trades.filter(isClosed);
  const n = closed.length;
  const base = calcBaseMetrics(trades);

  const mistakes   = detectMistakes(trades);
  const strengths  = detectStrengths(trades);
  const pq         = getProcessQuality(trades);
  const byDay      = getByDay(trades);
  const byHour     = getByHour(trades);
  const bySession  = getBySession(trades);
  const overtrading = getOvertradingAnalysis(trades, 4);

  const positives:   SmartReportItem[] = [];
  const negatives:   SmartReportItem[] = [];
  const suggestions: SmartReportItem[] = [];

  // ── مثبت‌ها
  strengths.forEach(s => positives.push({
    icon: '✅', title: s.title, description: s.description,
    evidence: s.avgOutcome !== null ? `میانگین R: ${s.avgOutcome.toFixed(2)}` : `${Math.round(s.pct * 100)}٪ معاملات`,
    priority: s.pct > 0.6 ? 'high' : s.pct > 0.3 ? 'medium' : 'low',
  }));

  const bestSess = bySession.filter(s => s.winRate !== null && s.count >= 3).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  if (bestSess && (bestSess.winRate ?? 0) > 0.55) positives.push({ icon: '⏰', title: `بهترین سشن: ${bestSess.label}`, description: `در سشن ${bestSess.label} با نرخ برد ${Math.round((bestSess.winRate ?? 0) * 100)}٪ بهترین عملکرد را دارید.`, evidence: `${bestSess.count} معامله، میانگین ${bestSess.avgR?.toFixed(2) ?? '—'}R`, priority: 'medium' });

  const bestDay = byDay.filter(d => d.winRate !== null && d.count >= 3).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  if (bestDay && (bestDay.winRate ?? 0) > 0.55) positives.push({ icon: '📅', title: `بهترین روز: ${bestDay.dayName}`, description: `روز ${bestDay.dayName} با نرخ برد ${Math.round((bestDay.winRate ?? 0) * 100)}٪ بهترین روز هفته‌ی شماست.`, evidence: `${bestDay.count} معامله در این روز`, priority: 'medium' });

  if (base.expectancy !== null && base.expectancy > 0.3) positives.push({ icon: '📈', title: `انتظار مثبت: ${base.expectancy.toFixed(2)}R`, description: 'میانگین سود هر معامله از نظر ریسک/ریوارد مثبت است. این یک مزیت معاملاتی واقعی است.', evidence: `بر اساس ${n} معامله بسته`, priority: 'high' });
  if (base.winRate !== null && base.winRate > 0.55) positives.push({ icon: '🏆', title: `نرخ برد قوی: ${Math.round(base.winRate * 100)}٪`, description: 'بیشتر از نیمی از معاملات شما به سود ختم می‌شود.', evidence: `${base.winCount} برد از ${n} معامله`, priority: 'high' });

  const reviewRate = n > 0 ? trades.filter(t => { try { const r = getPTR(t); return r && r.completedAt > 0; } catch { return false; } }).length / n : 0;
  if (reviewRate > 0.6) positives.push({ icon: '📝', title: 'عادت ریویو قوی', description: `در ${Math.round(reviewRate * 100)}٪ معاملات ریویو کامل دارید. این عادت برتری بزرگی است.`, evidence: `${Math.round(reviewRate * n)} ریویو از ${n} معامله`, priority: 'high' });

  // ── منفی‌ها
  mistakes.filter(m => m.severity === 'high' || m.pct > 0.15).forEach(m => negatives.push({
    icon: m.id === 'revenge' ? '😡' : m.id === 'fomo' ? '😰' : m.id === 'sl-moved' ? '🚨' : '⚠️',
    title: m.title, description: m.description,
    evidence: m.avgOutcome !== null ? `میانگین R این معاملات: ${m.avgOutcome.toFixed(2)}` : `${Math.round(m.pct * 100)}٪ معاملات`,
    priority: m.severity === 'high' ? 'high' : 'medium',
  }));

  const worstDay = byDay.filter(d => d.winRate !== null && d.count >= 3).sort((a, b) => (a.winRate ?? 1) - (b.winRate ?? 1))[0];
  if (worstDay && (worstDay.winRate ?? 1) < 0.4) negatives.push({ icon: '📉', title: `ضعیف‌ترین روز: ${worstDay.dayName}`, description: `روز ${worstDay.dayName} با نرخ برد فقط ${Math.round((worstDay.winRate ?? 0) * 100)}٪ بدترین عملکرد هفتگی شماست.`, evidence: `${worstDay.count} معامله، اغلب ضررده`, priority: 'medium' });

  if (overtrading.daysOverThreshold > 0 && overtrading.daysOverThreshold / overtrading.tradingDays > 0.2) {
    const ovDays = overtrading.overtradingDays.filter(d => d.avgR !== null);
    const avgROvr = avg(ovDays.map(d => d.avgR!));
    negatives.push({ icon: '🔄', title: 'Overtrading', description: `در ${overtrading.daysOverThreshold} روز از ${overtrading.tradingDays} روز معاملاتی بیش از ۴ معامله انجام دادید.`, evidence: avgROvr !== null ? `میانگین R در روزهای پرمعامله: ${avgROvr.toFixed(2)}` : `${overtrading.maxTradesInDay} معامله بیشترین در یک روز`, priority: 'high' });
  }
  if (pq.total > 0 && pq.total < 55) negatives.push({ icon: '📊', title: `کیفیت پروسه پایین: ${pq.total}٪`, description: 'بررسی ریویوهای معاملاتی نشان می‌دهد فرآیند معامله‌گری نیاز به بهبود دارد.', evidence: `بر اساس ${pq.reviewedCount} ریویو کامل شده`, priority: 'medium' });

  const worstHour = byHour.filter(h => h.winRate !== null && h.count >= 3).sort((a, b) => (a.winRate ?? 1) - (b.winRate ?? 1))[0];
  if (worstHour && (worstHour.winRate ?? 1) < 0.35) negatives.push({ icon: '🕐', title: `بدترین ساعت: ${worstHour.label}`, description: `در ساعت ${worstHour.label} نرخ برد شما فقط ${Math.round((worstHour.winRate ?? 0) * 100)}٪ است.`, evidence: `${worstHour.count} معامله در این بازه زمانی`, priority: 'medium' });
  if (base.winRate !== null && base.winRate < 0.4 && n >= 10) negatives.push({ icon: '❌', title: `نرخ برد پایین: ${Math.round(base.winRate * 100)}٪`, description: 'کمتر از ۴۰٪ معاملات به سود ختم می‌شود. بررسی کیفیت ستاپ‌ها ضروری است.', evidence: `${base.lossCount} ضرر از ${n} معامله بسته`, priority: 'high' });

  // ── پیشنهادها
  const pri = (p: SmartReportItem) => p.priority === 'high' ? 0 : p.priority === 'medium' ? 1 : 2;
  const topNeg = [...negatives].sort((a, b) => pri(a) - pri(b)).slice(0, 5);
  const ruleMap: Record<string, SmartReportItem> = {
    'جابجایی حد ضرر':         { icon: '💡', title: 'قانون آهنین: حد ضرر را جابجا نکنید',    description: 'هر بار که حد ضرر را در جهت نامطلوب جابجا می‌کنید، زیان خود را افزایش می‌دهید.',        evidence: '', priority: 'high' },
    'Overtrading':             { icon: '💡', title: 'سقف روزانه ۳ معامله تعیین کنید',         description: 'بعد از ۳ معامله در روز، سیستم خود را ببندید.',                                          evidence: '', priority: 'high' },
    'معامله انتقامی':          { icon: '💡', title: 'پروتکل «فاصله بعد از ضرر» اجرا کنید',   description: 'بعد از هر ضرر، حداقل ۴۵ دقیقه از بازار فاصله بگیرید.',                                 evidence: '', priority: 'high' },
    'ترس از دست دادن (FOMO)': { icon: '💡', title: 'فهرست شرایط الزامی برای ورود بنویسید',   description: 'قبل از ورود، هر شرط لازم را تیک بزنید. اگر یک شرط نبود، معامله نکنید.',               evidence: '', priority: 'high' },
    'خروج زود هنگام':          { icon: '💡', title: 'هنگام باز بودن معامله نمودار را نبینید',  description: 'بسیاری از خروج‌های زودهنگام به دلیل نگاه کردن مداوم رخ می‌دهند.',                      evidence: '', priority: 'medium' },
    'عدم پیروی از قوانین':     { icon: '💡', title: 'چک‌لیست ورود را قبل از هر معامله مرور کنید', description: 'چک‌لیست فیزیکی می‌تواند پیروی از قوانین را ۳۰٪ بهبود دهد.',                       evidence: '', priority: 'high' },
  };
  topNeg.forEach(neg => {
    const rule = Object.entries(ruleMap).find(([key]) => neg.title.includes(key));
    if (rule) suggestions.push({ ...rule[1], evidence: `بر اساس مشکل: ${neg.title}` });
  });

  if (journals.length < 5) suggestions.push({ icon: '📔', title: 'ژورنال روزانه ذهنی بنویسید', description: 'ثبت حال روزانه (خلق، انرژی، فوکوس) به شما کمک می‌کند بفهمید چه روزهایی برای معامله مناسب نیستید.', evidence: `تا کنون ${journals.length} ورودی ژورنال ثبت شده`, priority: 'high' });
  if (reviewRate < 0.4) suggestions.push({ icon: '📝', title: 'ریویو بعد از هر معامله را عادت کنید', description: 'حتی ۳ جمله کوتاه بعد از معامله سرعت یادگیری را دو برابر می‌کند.', evidence: `نرخ ریویو فعلی: ${Math.round(reviewRate * 100)}٪`, priority: 'medium' });

  const bestHour = byHour.filter(h => h.winRate !== null && h.count >= 3).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  if (bestHour && (bestHour.winRate ?? 0) > 0.6) suggestions.push({ icon: '⏱️', title: `ساعت ${bestHour.label} را اولویت دهید`, description: `در این بازه زمانی نرخ برد ${Math.round((bestHour.winRate ?? 0) * 100)}٪ دارید.`, evidence: `${bestHour.count} معامله با نرخ برد بالا`, priority: 'medium' });

  const posScore   = Math.min(50, positives.filter(p => p.priority === 'high').length * 10 + positives.filter(p => p.priority === 'medium').length * 5);
  const negPenalty = Math.min(50, negatives.filter(p => p.priority === 'high').length * 15 + negatives.filter(p => p.priority === 'medium').length * 7);
  const overallHealth = Math.max(0, Math.min(100, 50 + posScore - negPenalty));
  const healthLabel = overallHealth >= 80 ? 'عالی' : overallHealth >= 65 ? 'خوب' : overallHealth >= 45 ? 'متوسط' : overallHealth >= 25 ? 'نیاز به توجه' : 'بحرانی';

  const winRateStr = base.winRate !== null ? `${Math.round(base.winRate * 100)}٪` : 'نامشخص';
  const avgRStr    = base.avgR !== null ? `${base.avgR.toFixed(2)}R` : 'نامشخص';
  const summary    = `بر اساس ${n} معامله بسته، نرخ برد شما ${winRateStr} و میانگین R برابر ${avgRStr} است. ${positives.length} رفتار مثبت و ${negatives.length} رفتار منفی شناسایی شد. مهم‌ترین حوزه بهبود: ${topNeg[0]?.title ?? 'داده کافی نیست'}.`;
  const tradingDays = new Set(closed.map(t => toDateStr(t.openedAt))).size;

  return {
    positives:   positives.sort((a, b) => pri(a) - pri(b)),
    negatives:   negatives.sort((a, b) => pri(a) - pri(b)),
    suggestions: suggestions.slice(0, 6),
    overallHealth, healthLabel, summary,
    generatedAt: Date.now(), tradingDays, closedTrades: n,
  };
}
