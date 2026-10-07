/**
 * analyticsEngine.ts — موتور مرکزی تحلیل معاملاتی TraderMind
 *
 * هدف: یک نقطه ورود واحد که:
 *   ۱. فقط یک بار از DB می‌خواند
 *   ۲. داده را به تمام سرویس‌های موجود می‌دهد
 *   ۳. نتیجه‌ی ترکیب‌یافته‌ای بر می‌گرداند
 *
 * قوانین:
 * - این فایل «جایگزین» سرویس‌های موجود نمی‌شود — آنها را فراخوانی می‌کند.
 * - هیچ منطق محاسباتی جدیدی اینجا نوشته نمی‌شود؛ همه چیز از سرویس‌های موجود می‌آید.
 * - صفحاتی که نیاز به تمام معیارها دارند می‌توانند از `computeFullAnalytics` استفاده کنند
 *   به جای فراخوانی جداگانه ۵ سرویس مختلف.
 */

import { db, Trade, DailyJournal, Strategy } from '../db/database';
import {
  calcBaseMetrics, getPerformanceProfile, getByDay, getByHour, getBySession,
  getBySymbol, getBySetup, getBestCombos, getProcessQuality, detectMistakes,
  detectStrengths, getOvertradingAnalysis, getTradingStyle, getEvolution,
  getPerfInsights, getScorecard, getDecisionQualityAnalysis, getSessionDiscipline,
  getBehavioralTimeline, getLearningProgress,
  BaseMetrics,
} from './performanceService';
import { computeAnalytics, filterTradesByRange, TimeRangeKey, AnalyticsData } from './analyticsService';
import { isWin, isClosed, getNetPnl, getResolvedR } from '../lib/tradeHelpers';
import { computeTraderProfile } from './traderProfileService';
import { getTradingDateKey } from '../lib/tradingTime';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngineInput {
  trades: Trade[];
  journals: DailyJournal[];
  strategies: Strategy[];
}

export interface CoreMetrics {
  base: BaseMetrics;
  byDay: ReturnType<typeof getByDay>;
  byHour: ReturnType<typeof getByHour>;
  bySession: ReturnType<typeof getBySession>;
  bySymbol: ReturnType<typeof getBySymbol>;
  bySetup: ReturnType<typeof getBySetup>;
  bestCombos: ReturnType<typeof getBestCombos>;
  processQuality: ReturnType<typeof getProcessQuality>;
  mistakes: ReturnType<typeof detectMistakes>;
  strengths: ReturnType<typeof detectStrengths>;
  overtrading: ReturnType<typeof getOvertradingAnalysis>;
  tradingStyle: ReturnType<typeof getTradingStyle>;
  evolution: ReturnType<typeof getEvolution>;
  insights: ReturnType<typeof getPerfInsights>;
  scorecard: ReturnType<typeof getScorecard>;
  decisionQuality: ReturnType<typeof getDecisionQualityAnalysis>;
  sessionDiscipline: ReturnType<typeof getSessionDiscipline>;
  behavioralTimeline: ReturnType<typeof getBehavioralTimeline>;
  learningProgress: ReturnType<typeof getLearningProgress>;
}

export interface FullAnalyticsResult {
  // داده‌های خام (برای عبور به توابع دیگر)
  trades: Trade[];
  journals: DailyJournal[];
  strategies: Strategy[];
  closedTrades: Trade[];
  // نتایج ترکیبی
  core: CoreMetrics;
  analytics: AnalyticsData;
  profile: Awaited<ReturnType<typeof computeTraderProfile>>;
  // آمار خلاصه
  meta: {
    totalTrades: number;
    closedCount: number;
    openCount: number;
    tradingDays: number;
    firstTradeAt: number | null;
    lastTradeAt: number | null;
    journaledDays: number;
    reviewedCount: number;
  };
}

// ── بارگذاری داده از DB ───────────────────────────────────────────────────────

/**
 * بارگذاری تمام داده‌های لازم از Dexie در یک مرحله موازی.
 * این تابع را مستقیماً در هیچ کجا نباید چندین بار فراخوانی کرد —
 * از `useEngineData` hook استفاده کنید که این را cache می‌کند.
 *
 * PART 1 / Prompt 3: از Repository استفاده می‌کند — بدون full-table scan مستقیم.
 */
export async function loadEngineInput(): Promise<EngineInput> {
  // import dynamic برای جلوگیری از circular dependency
  const { getAllTradesForAnalytics } = await import('../core/repositories/tradeRepository');
  const [trades, journals, strategies] = await Promise.all([
    getAllTradesForAnalytics(),
    db.dailyJournals.orderBy('date').toArray(),
    db.strategies.toArray(),
  ]);
  return { trades, journals, strategies };
}

// ── محاسبه Core Metrics (از performanceService) ───────────────────────────────

/**
 * محاسبه تمام معیارهای عملکردی با یک بار pass داده.
 * همه توابع pure هستند — هیچ DB call اضافه‌ای وجود ندارد.
 */
export function computeCoreMetrics(trades: Trade[], overtradingThreshold = 4): CoreMetrics {
  return {
    base:              calcBaseMetrics(trades),
    byDay:             getByDay(trades),
    byHour:            getByHour(trades),
    bySession:         getBySession(trades),
    bySymbol:          getBySymbol(trades),
    bySetup:           getBySetup(trades),
    bestCombos:        getBestCombos(trades),
    processQuality:    getProcessQuality(trades),
    mistakes:          detectMistakes(trades),
    strengths:         detectStrengths(trades),
    overtrading:       getOvertradingAnalysis(trades, overtradingThreshold),
    tradingStyle:      getTradingStyle(trades),
    evolution:         getEvolution(trades),
    insights:          getPerfInsights(trades),
    scorecard:         getScorecard(trades),
    decisionQuality:   getDecisionQualityAnalysis(trades),
    sessionDiscipline: getSessionDiscipline(trades, []),
    behavioralTimeline:getBehavioralTimeline(trades),
    learningProgress:  getLearningProgress(trades, []),
  };
}

// ── محاسبه کامل همه ماژول‌ها ─────────────────────────────────────────────────

/**
 * ورودی می‌گیرد و خروجی کامل از تمام سرویس‌ها برمی‌گرداند.
 * صفحه‌هایی که نیاز به چندین ماژول دارند باید از این استفاده کنند.
 */
export async function computeFullAnalytics(
  input: EngineInput,
  timeRange: TimeRangeKey = 'all' as TimeRangeKey,
): Promise<FullAnalyticsResult> {
  const { trades, journals, strategies } = input;
  const closedTrades = trades.filter(isClosed);

  // همه محاسبات به صورت موازی
  const [core, analytics, profile] = await Promise.all([
    Promise.resolve(computeCoreMetrics(trades)),
    Promise.resolve(computeAnalytics(trades, journals, strategies)),
    computeTraderProfile(trades, strategies.map(s => ({ id: s.id, name: s.name }))),
  ]);

  // متا
  const sorted = [...closedTrades].sort((a, b) => a.openedAt - b.openedAt);
  const tradingDays = new Set(closedTrades.map(t => getTradingDateKey(t.openedAt))).size;
  const journaledDates = new Set(journals.map(j => j.date));
  const journaledDays = [...new Set(closedTrades.map(t => getTradingDateKey(t.openedAt)))]
    .filter(d => journaledDates.has(d)).length;
  const reviewedCount = closedTrades.filter(t => {
    try { const r = JSON.parse(t.postTradeReview); return r?.completedAt > 0; } catch { return false; }
  }).length;

  return {
    trades, journals, strategies, closedTrades,
    core, analytics, profile,
    meta: {
      totalTrades: trades.length,
      closedCount: closedTrades.length,
      openCount: trades.filter(t => t.status === 'open').length,
      tradingDays,
      firstTradeAt: sorted[0]?.openedAt ?? null,
      lastTradeAt: sorted[sorted.length - 1]?.openedAt ?? null,
      journaledDays,
      reviewedCount,
    },
  };
}

// ── فیلتر با بازه زمانی ───────────────────────────────────────────────────────

/**
 * فیلتر داده بر اساس بازه زمانی و محاسبه مجدد.
 * برای Dashboard با time-range picker مفید است.
 */
export function computeCoreMetricsForRange(
  allTrades: Trade[],
  from: number,
  to: number,
): CoreMetrics {
  const filtered = allTrades.filter(t => t.openedAt >= from && t.openedAt <= to);
  return computeCoreMetrics(filtered);
}

// ── Helpers عمومی ─────────────────────────────────────────────────────────────

/** فهرست تمام نمادها از معاملات بسته */
export function getUniqueSymbols(trades: Trade[]): string[] {
  return [...new Set(trades.filter(isClosed).map(t => t.symbol))].sort();
}

/** فهرست تمام استراتژی‌ها از معاملات */
export function getUniqueStrategies(trades: Trade[]): string[] {
  return [...new Set(trades.map(t => t.strategyId).filter(Boolean) as string[])];
}

/** فهرست تمام تایم‌فریم‌ها از معاملات */
export function getUniqueTimeframes(trades: Trade[]): string[] {
  return [...new Set(trades.map(t => t.tradingSession).filter(Boolean) as string[])];
}

/** خلاصه سریع برای Dashboard header cards — بدون DB call */
export function getQuickSummary(trades: Trade[]) {
  const closed = trades.filter(isClosed);
  const wins = closed.filter(isWin);
  const Rs = closed.map(getResolvedR).filter((r): r is number => r !== null);
  const nets = closed.map(getNetPnl).filter((v): v is number => v !== null);
  const winRate = closed.length > 0 ? wins.length / closed.length : null;
  const avgR = Rs.length > 0 ? Rs.reduce((s, v) => s + v, 0) / Rs.length : null;
  const totalPnL = nets.length > 0 ? nets.reduce((s, v) => s + v, 0) : null;
  return { total: closed.length, wins: wins.length, winRate, avgR, totalPnL };
}
