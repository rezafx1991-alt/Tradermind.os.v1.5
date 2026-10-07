/**
 * riskService.ts — Offline Personal Risk Management Engine (Prompt 24)
 * Pure calculation functions — no DB access, all offline.
 */

import { Trade } from '../db/database';
import { avg, median, stdDev, isWin, isLoss, isClosed, getNetPnl, getResolvedR } from '../lib/tradeHelpers';
import { getTradingDateKey, getTradingDateParts, getTradingMonthKey } from '../lib/tradingTime';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type RiskUnit = 'percentage' | 'fixed' | 'r-multiple';

export interface SessionRule {
  session: string;
  maxRiskPct: number;
}

export interface SetupRule {
  setup: string;
  maxRiskPct: number;
}

export interface RiskProfileData {
  id: string;
  defaultRiskPct: number | null;
  maxRiskPct: number | null;
  maxDailyRiskPct: number | null;
  maxWeeklyRiskPct: number | null;
  maxTradesPerDay: number | null;
  maxConsecutiveLosses: number | null;
  maxDrawdownPct: number | null;
  minRR: number | null;
  accountBalance: number | null;
  accountEquity: number | null;
  currency: string;
  riskUnit: RiskUnit;
  sessionRules: string | null;
  setupRules: string | null;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

export function tradeRiskPct(t: Trade): number | null {
  return t.riskPercentage ?? null;
}

export function tradeRMultiple(t: Trade): number | null {
  // R ذخیره‌شده، وگرنه سود «خالص» ÷ ریسک مالی (سود صفر هم معتبر است)
  return getResolvedR(t);
}

/** کدام روز هفته UTC+3:30 (تهران) — 0=شنبه...6=جمعه */
export function dayOfWeekIR(ts: number): number {
  // 0=یکشنبه ... 6=شنبه؛ ترتیب با Date و نمودارهای دیگر یکسان است.
  return getTradingDateParts(ts).dayOfWeek;
}

export const DAY_LABELS_FA: Record<number, string> = {
  0: 'یکشنبه', 1: 'دوشنبه', 2: 'سه‌شنبه', 3: 'چهارشنبه',
  4: 'پنج‌شنبه', 5: 'جمعه', 6: 'شنبه',
};
export const DAY_LABELS_EN: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

export function dateStr(ts: number): string {
  return getTradingDateKey(ts);
}

export function weekKey(ts: number): string {
  const p = getTradingDateParts(ts);
  const d = new Date(Date.UTC(p.year, p.month, p.day));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  // کلید را مستقیم از اجزای UTC می‌سازیم؛ عبور از getTradingDateKey در منطقه‌های زمانی
  // منفی (مثل آمریکا) تاریخ را یک روز عقب می‌برد.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const SESSION_LABELS: Record<string, string> = {
  asian: 'آسیا',
  london: 'لندن',
  'new-york': 'نیویورک',
  overlap: 'همپوشانی',
  other: 'سایر',
};

// ─────────────────────────────────────────────────────────────────
// 1. Risk Consistency
// ─────────────────────────────────────────────────────────────────

export interface RiskConsistency {
  count: number;
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
  cv: number | null; // coefficient of variation
  smallSample: boolean;
}

export function getRiskConsistency(trades: Trade[]): RiskConsistency {
  const risks = trades
    .filter(t => isClosed(t) && t.riskPercentage !== null && t.riskPercentage! > 0)
    .map(t => t.riskPercentage!);
  const n = risks.length;
  if (!n) return { count: 0, avg: null, median: null, min: null, max: null, stdDev: null, cv: null, smallSample: true };
  const a = avg(risks)!;
  const sd = stdDev(risks);
  const sorted = [...risks].sort((a, b) => a - b);
  return {
    count: n,
    avg: a,
    median: median(risks),
    min: sorted[0],
    max: sorted[n - 1],
    stdDev: sd,
    cv: (sd !== null && a > 0) ? sd / a : null,
    smallSample: n < 10,
  };
}

// ─────────────────────────────────────────────────────────────────
// 2. Daily Risk Exposure
// ─────────────────────────────────────────────────────────────────

export interface DailyRiskExposure {
  date: string;
  tradeCount: number;
  totalRiskPct: number | null;
  totalRiskAmt: number | null;
  totalPnl: number | null;
  totalLoss: number | null;
  violations: number;
  maxRiskPct: number | null; // single highest risk trade
}

export function getDailyRiskExposure(
  trades: Trade[],
  dateStr_: string,
  profile: RiskProfileData | null,
): DailyRiskExposure {
  const dayTrades = trades.filter(t => dateStr(t.openedAt) === dateStr_);
  const closed = dayTrades.filter(isClosed);
  const pnls = closed.map(getNetPnl).filter((v): v is number => v !== null);
  const risks = dayTrades.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
  const amts = dayTrades.filter(t => t.riskAmount !== null).map(t => t.riskAmount!);
  const losses = closed.map(getNetPnl).filter((v): v is number => v !== null && v < 0);
  const maxRisk = profile?.maxRiskPct ?? null;
  const violations = maxRisk !== null ? dayTrades.filter(t => (t.riskPercentage ?? 0) > maxRisk).length : 0;
  return {
    date: dateStr_,
    tradeCount: dayTrades.length,
    totalRiskPct: risks.length ? risks.reduce((s, v) => s + v, 0) : null,
    totalRiskAmt: amts.length ? amts.reduce((s, v) => s + v, 0) : null,
    totalPnl: pnls.length ? pnls.reduce((s, v) => s + v, 0) : null,
    totalLoss: losses.length ? losses.reduce((s, v) => s + v, 0) : null,
    violations,
    maxRiskPct: risks.length ? Math.max(...risks) : null,
  };
}

export function getAllDailyExposures(trades: Trade[], profile: RiskProfileData | null): DailyRiskExposure[] {
  const dates = [...new Set(trades.map(t => dateStr(t.openedAt)))].sort();
  return dates.map(d => getDailyRiskExposure(trades, d, profile));
}

// ─────────────────────────────────────────────────────────────────
// 3. Weekly Risk Exposure
// ─────────────────────────────────────────────────────────────────

export interface WeeklyRiskExposure {
  weekStart: string;
  tradeCount: number;
  totalRiskPct: number | null;
  totalRiskAmt: number | null;
  totalPnl: number | null;
  totalLoss: number | null;
  avgRiskPct: number | null;
  maxRiskPct: number | null;
  violations: number;
  riskEscalation: boolean; // risk increased as week progressed
}

export function getWeeklyRiskExposures(trades: Trade[], profile: RiskProfileData | null): WeeklyRiskExposure[] {
  const byWeek = new Map<string, Trade[]>();
  trades.forEach(t => {
    const wk = weekKey(t.openedAt);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(t);
  });
  const maxRisk = profile?.maxRiskPct ?? null;
  return [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([wk, wt0]) => {
    // رصد روند ریسک نیازمند ترتیب زمانی است (ورودی ممکن است جدیدترین-اول باشد)
    const wt = [...wt0].sort((a, b) => a.openedAt - b.openedAt);
    const risks = wt.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
    const amts = wt.filter(t => t.riskAmount !== null).map(t => t.riskAmount!);
    const pnls = wt.map(getNetPnl).filter((v): v is number => v !== null);
    const losses = wt.map(getNetPnl).filter((v): v is number => v !== null && v < 0);
    const violations = maxRisk !== null ? wt.filter(t => (t.riskPercentage ?? 0) > maxRisk).length : 0;
    // رصد افزایش ریسک طی هفته
    let escalation = false;
    if (risks.length >= 3) {
      const firstHalf = avg(risks.slice(0, Math.floor(risks.length / 2)))!;
      const secondHalf = avg(risks.slice(Math.floor(risks.length / 2)))!;
      escalation = secondHalf > firstHalf * 1.2;
    }
    return {
      weekStart: wk,
      tradeCount: wt.length,
      totalRiskPct: risks.length ? risks.reduce((s, v) => s + v, 0) : null,
      totalRiskAmt: amts.length ? amts.reduce((s, v) => s + v, 0) : null,
      totalPnl: pnls.length ? pnls.reduce((s, v) => s + v, 0) : null,
      totalLoss: losses.length ? losses.reduce((s, v) => s + v, 0) : null,
      avgRiskPct: avg(risks),
      maxRiskPct: risks.length ? Math.max(...risks) : null,
      violations,
      riskEscalation: escalation,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 4. Risk by Day of Week
// ─────────────────────────────────────────────────────────────────

export interface DayOfWeekRisk {
  day: number;
  label: string;
  count: number;
  avgRisk: number | null;
  medianRisk: number | null;
  avgR: number | null;
  winRate: number | null;
  avgLoss: number | null;
  maxLoss: number | null;
  violations: number;
  smallSample: boolean;
}

export function getRiskByDayOfWeek(trades: Trade[], profile: RiskProfileData | null): DayOfWeekRisk[] {
  const maxRisk = profile?.maxRiskPct ?? null;
  return [1, 2, 3, 4, 5].map(day => { // Mon=1 ... Fri=5
    const dt = trades.filter(t => getTradingDateParts(t.openedAt).dayOfWeek === day);
    const risks = dt.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
    const rs = dt.filter(t => tradeRMultiple(t) !== null).map(t => tradeRMultiple(t)!);
    const closed = dt.filter(isClosed);
    const wins = closed.filter(isWin).length;
    const losses = dt.map(getNetPnl).filter((v): v is number => v !== null && v < 0);
    const violations = maxRisk !== null ? dt.filter(t => (t.riskPercentage ?? 0) > maxRisk).length : 0;
    return {
      day,
      label: ['', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'][day],
      count: dt.length,
      avgRisk: avg(risks),
      medianRisk: median(risks),
      avgR: avg(rs),
      winRate: closed.length > 0 ? wins / closed.length : null,
      avgLoss: avg(losses),
      maxLoss: losses.length ? Math.min(...losses) : null,
      violations,
      smallSample: dt.length < 5,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 5. Risk by Session
// ─────────────────────────────────────────────────────────────────

export interface SessionRisk {
  session: string;
  label: string;
  count: number;
  avgRisk: number | null;
  avgR: number | null;
  winRate: number | null;
  avgLoss: number | null;
  maxLoss: number | null;
  violations: number;
  smallSample: boolean;
}

export function getRiskBySession(trades: Trade[], profile: RiskProfileData | null): SessionRisk[] {
  const sessions = ['asian', 'london', 'new-york', 'overlap', 'other'];
  const maxRisk = profile?.maxRiskPct ?? null;
  return sessions.map(sess => {
    const st = trades.filter(t => {
      const ts = t.tradingSession ?? 'other';
      return ts === sess || (sess === 'other' && !sessions.slice(0, -1).includes(ts));
    });
    const risks = st.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
    const rs = st.filter(t => tradeRMultiple(t) !== null).map(t => tradeRMultiple(t)!);
    const closed = st.filter(isClosed);
    const wins = closed.filter(isWin).length;
    const losses = st.map(getNetPnl).filter((v): v is number => v !== null && v < 0);
    const violations = maxRisk !== null ? st.filter(t => (t.riskPercentage ?? 0) > maxRisk).length : 0;
    return {
      session: sess,
      label: SESSION_LABELS[sess] ?? sess,
      count: st.length,
      avgRisk: avg(risks),
      avgR: avg(rs),
      winRate: closed.length > 0 ? wins / closed.length : null,
      avgLoss: avg(losses),
      maxLoss: losses.length ? Math.min(...losses) : null,
      violations,
      smallSample: st.length < 5,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// 6. Post-Loss Behavior (Section 11)
// ─────────────────────────────────────────────────────────────────

export interface PostStreakBehavior {
  afterCount: number;
  label: string;
  examples: number;
  avgRiskBefore: number | null;
  avgRiskAfter: number | null;
  riskRatio: number | null; // >1 means increased
  avgFrequencyChange: number | null; // نسبت تعداد معاملات بعد/قبل در همان روز
  smallSample: boolean;
}

export function getPostLossBehavior(trades: Trade[]): PostStreakBehavior[] {
  const sorted = [...trades].filter(isClosed).sort((a, b) => a.openedAt - b.openedAt);
  const overallAvgRisk = avg(sorted.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!));

  function analyzeAfterNLosses(n: number): PostStreakBehavior {
    const nextTrades: Trade[] = [];
    for (let i = n; i < sorted.length; i++) {
      const prev = sorted.slice(i - n, i);
      const allLoss = prev.every(isLoss);
      if (allLoss && (i === 0 || sorted[i - n - 1]?.result !== 'loss')) {
        nextTrades.push(sorted[i]);
      }
    }
    const nextRisks = nextTrades.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
    const afterAvg = avg(nextRisks);
    return {
      afterCount: n,
      label: `بعد از ${n} ضرر متوالی`,
      examples: nextTrades.length,
      avgRiskBefore: overallAvgRisk,
      avgRiskAfter: afterAvg,
      riskRatio: afterAvg !== null && overallAvgRisk !== null && overallAvgRisk > 0
        ? afterAvg / overallAvgRisk : null,
      avgFrequencyChange: null,
      smallSample: nextTrades.length < 5,
    };
  }

  return [1, 2, 3].map(n => analyzeAfterNLosses(n));
}

// ─────────────────────────────────────────────────────────────────
// 7. Post-Win Behavior (Section 12)
// ─────────────────────────────────────────────────────────────────

export function getPostWinBehavior(trades: Trade[]): PostStreakBehavior[] {
  const sorted = [...trades].filter(isClosed).sort((a, b) => a.openedAt - b.openedAt);
  const overallAvgRisk = avg(sorted.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!));

  function analyzeAfterNWins(n: number): PostStreakBehavior {
    const nextTrades: Trade[] = [];
    for (let i = n; i < sorted.length; i++) {
      const prev = sorted.slice(i - n, i);
      const allWin = prev.every(isWin);
      if (allWin && (i === 0 || sorted[i - n - 1]?.result !== 'win')) {
        nextTrades.push(sorted[i]);
      }
    }
    const nextRisks = nextTrades.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
    const afterAvg = avg(nextRisks);
    return {
      afterCount: n,
      label: `بعد از ${n} سود متوالی`,
      examples: nextTrades.length,
      avgRiskBefore: overallAvgRisk,
      avgRiskAfter: afterAvg,
      riskRatio: afterAvg !== null && overallAvgRisk !== null && overallAvgRisk > 0
        ? afterAvg / overallAvgRisk : null,
      avgFrequencyChange: null,
      smallSample: nextTrades.length < 5,
    };
  }

  return [1, 2, 3].map(n => analyzeAfterNWins(n));
}

// ─────────────────────────────────────────────────────────────────
// 8. Drawdown Analysis (Section 15)
// ─────────────────────────────────────────────────────────────────

export interface DrawdownPoint {
  date: string;
  equity: number;
  drawdownPct: number;
}

export interface DrawdownAnalysis {
  currentDrawdownPct: number;
  maxDrawdownPct: number;
  maxDrawdownDate: string | null;
  recoveryDate: string | null;
  recoveryDays: number | null;
  currentConsecutiveLosses: number;
  isInDrawdown: boolean;
  tradesInMaxDD: number;
  avgRiskDuringMaxDD: number | null;
  curve: DrawdownPoint[];
  smallSample: boolean;
}

export function getDrawdownAnalysis(trades: Trade[], startEquity: number): DrawdownAnalysis {
  const sorted = [...trades]
    .filter(t => isClosed(t) && t.closedAt !== null)
    .sort((a, b) => a.closedAt! - b.closedAt!);

  if (!sorted.length) {
    return {
      currentDrawdownPct: 0, maxDrawdownPct: 0, maxDrawdownDate: null,
      recoveryDate: null, recoveryDays: null, currentConsecutiveLosses: 0,
      isInDrawdown: false, tradesInMaxDD: 0, avgRiskDuringMaxDD: null,
      curve: [], smallSample: true,
    };
  }

  let equity = startEquity;
  let peak = startEquity;
  let maxDD = 0;
  let maxDDDate: string | null = null;
  let ddStart: string | null = null;
  let recoveryDate: string | null = null;
  let maxDDStart: string | null = null;
  const curve: DrawdownPoint[] = [];

  sorted.forEach(t => {
    equity += getNetPnl(t) ?? 0;
    if (equity > peak) {
      if (ddStart && !recoveryDate) recoveryDate = dateStr(t.closedAt!);
      peak = equity;
      ddStart = null;
    }
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > 0 && ddStart === null) ddStart = dateStr(t.closedAt!);
    if (dd > maxDD) {
      maxDD = dd;
      maxDDDate = dateStr(t.closedAt!);
      maxDDStart = ddStart;
    }
    curve.push({ date: dateStr(t.closedAt!), equity, drawdownPct: dd });
  });

  const currentDD = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

  // Current consecutive losses
  let consLoss = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (isLoss(sorted[i])) consLoss++;
    else break;
  }

  // Trades during max DD period
  const tradesInDD = maxDDStart && maxDDDate
    ? sorted.filter(t => {
        const d = dateStr(t.closedAt!);
        return d >= maxDDStart! && d <= maxDDDate!;
      })
    : [];

  // Recovery days
  let recovDays: number | null = null;
  if (maxDDDate && recoveryDate) {
    recovDays = Math.round((new Date(recoveryDate).getTime() - new Date(maxDDDate).getTime()) / 86400000);
  }

  return {
    currentDrawdownPct: currentDD,
    maxDrawdownPct: maxDD,
    maxDrawdownDate: maxDDDate,
    recoveryDate: recoveryDate,
    recoveryDays: recovDays,
    currentConsecutiveLosses: consLoss,
    isInDrawdown: currentDD > 0,
    tradesInMaxDD: tradesInDD.length,
    avgRiskDuringMaxDD: avg(tradesInDD.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!)),
    curve,
    smallSample: sorted.length < 10,
  };
}

// ─────────────────────────────────────────────────────────────────
// 9. R:R Analysis (Section 16)
// ─────────────────────────────────────────────────────────────────

export interface RRAnalysis {
  count: number;
  avgPlannedRR: number | null;
  avgActualRR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  rrDeviation: number | null; // (actual - planned) / planned
  bySession: { session: string; label: string; avgPlanned: number | null; avgActual: number | null; count: number }[];
  byDayOfWeek: { day: number; label: string; avgPlanned: number | null; avgActual: number | null; count: number }[];
}

export function getRRAnalysis(trades: Trade[]): RRAnalysis {
  const closed = trades.filter(isClosed);
  const withPlanned = closed.filter(t => t.plannedRR !== null);
  const withActual = closed.filter(t => tradeRMultiple(t) !== null);
  const wins = closed.filter(isWin);
  const losses = closed.filter(isLoss);

  const avgP = avg(withPlanned.map(t => t.plannedRR!));
  const avgA = avg(withActual.map(t => tradeRMultiple(t)!));

  const sessions = ['asian', 'london', 'new-york', 'overlap', 'other'];
  const bySession = sessions.map(sess => {
    const st = closed.filter(t => (t.tradingSession ?? 'other') === sess || (sess === 'other' && !['asian','london','new-york','overlap'].includes(t.tradingSession ?? '')));
    return {
      session: sess,
      label: SESSION_LABELS[sess] ?? sess,
      avgPlanned: avg(st.filter(t => t.plannedRR !== null).map(t => t.plannedRR!)),
      avgActual: avg(st.filter(t => tradeRMultiple(t) !== null).map(t => tradeRMultiple(t)!)),
      count: st.length,
    };
  }).filter(s => s.count > 0);

  const byDayOfWeek = [1,2,3,4,5].map(day => {
    const dt = closed.filter(t => getTradingDateParts(t.openedAt).dayOfWeek === day);
    return {
      day,
      label: ['', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'][day],
      avgPlanned: avg(dt.filter(t => t.plannedRR !== null).map(t => t.plannedRR!)),
      avgActual: avg(dt.filter(t => tradeRMultiple(t) !== null).map(t => tradeRMultiple(t)!)),
      count: dt.length,
    };
  }).filter(d => d.count > 0);

  return {
    count: closed.length,
    avgPlannedRR: avgP,
    avgActualRR: avgA,
    avgWinR: avg(wins.filter(t => tradeRMultiple(t) !== null).map(t => tradeRMultiple(t)!)),
    avgLossR: avg(losses.filter(t => tradeRMultiple(t) !== null).map(t => tradeRMultiple(t)!)),
    rrDeviation: avgP !== null && avgA !== null && avgP > 0 ? (avgA - avgP) / avgP : null,
    bySession,
    byDayOfWeek,
  };
}

// ─────────────────────────────────────────────────────────────────
// 10. Stop Loss Behavior (Section 17)
// ─────────────────────────────────────────────────────────────────

export interface SLBehaviorAnalysis {
  totalTrades: number;
  slMovedCount: number;
  slMovedPct: number | null;
  avgSLDistance: number | null; // |entry - sl| / entry * 100
  avgPlannedSLDist: number | null;
  avgActualSLDist: number | null;
  slExpansionCount: number; // slMoved AND actual SL farther than planned
  removedSLCount: number;
  smallSample: boolean;
}

export function getSLBehavior(trades: Trade[]): SLBehaviorAnalysis {
  const closed = trades.filter(isClosed);
  const n = closed.length;

  const slMovedCount = closed.filter(t => t.slMoved === true).length;
  const slDists = closed
    .filter(t => t.entryPrice > 0 && t.stopLoss > 0)
    .map(t => Math.abs(t.entryPrice - t.stopLoss) / t.entryPrice * 100);
  const plannedDists = closed
    .filter(t => t.plannedEntry !== null && t.plannedSL !== null && t.plannedEntry! > 0 && t.plannedSL! > 0)
    .map(t => Math.abs(t.plannedEntry! - t.plannedSL!) / t.plannedEntry! * 100);

  // Expansion: actual SL farther than planned (stop moved against trader)
  const expansionTrades = closed.filter(t => {
    if (!t.slMoved || !t.plannedEntry || !t.plannedSL || !t.entryPrice || !t.stopLoss) return false;
    const plannedDist = Math.abs(t.plannedEntry - t.plannedSL);
    const actualDist = Math.abs(t.entryPrice - t.stopLoss);
    return actualDist > plannedDist * 1.1;
  });

  return {
    totalTrades: n,
    slMovedCount,
    slMovedPct: n > 0 ? slMovedCount / n : null,
    avgSLDistance: avg(slDists),
    avgPlannedSLDist: avg(plannedDists),
    avgActualSLDist: avg(slDists),
    slExpansionCount: expansionTrades.length,
    removedSLCount: 0, // cannot detect without explicit flag
    smallSample: n < 10,
  };
}

// ─────────────────────────────────────────────────────────────────
// 11. Take Profit Behavior (Section 18)
// ─────────────────────────────────────────────────────────────────

export interface TPBehaviorAnalysis {
  totalTrades: number;
  tpMovedCount: number;
  tpMovedPct: number | null;
  partialCloseCount: number;
  earlyExitCount: number; // manualExit === true
  avgPlannedTPDist: number | null;
  avgActualRR: number | null;
  avgPlannedRR: number | null;
  earlyExitWinRate: number | null;
  smallSample: boolean;
}

export function getTPBehavior(trades: Trade[]): TPBehaviorAnalysis {
  const closed = trades.filter(isClosed);
  const n = closed.length;
  const tpMovedCount = closed.filter(t => t.tpMoved === true).length;
  const partialCount = closed.filter(t => t.partialClose === true).length;
  const earlyExits = closed.filter(t => t.manualExit === true);
  const earlyWins = earlyExits.filter(isWin).length;
  const plannedTPDists = closed
    .filter(t => t.plannedEntry !== null && t.plannedTP !== null && t.plannedEntry! > 0 && t.plannedTP! > 0)
    .map(t => Math.abs(t.plannedTP! - t.plannedEntry!) / t.plannedEntry! * 100);
  return {
    totalTrades: n,
    tpMovedCount,
    tpMovedPct: n > 0 ? tpMovedCount / n : null,
    partialCloseCount: partialCount,
    earlyExitCount: earlyExits.length,
    avgPlannedTPDist: avg(plannedTPDists),
    avgActualRR: avg(closed.filter(t => tradeRMultiple(t) !== null).map(t => tradeRMultiple(t)!)),
    avgPlannedRR: avg(closed.filter(t => t.plannedRR !== null).map(t => t.plannedRR!)),
    earlyExitWinRate: earlyExits.length > 0 ? earlyWins / earlyExits.length : null,
    smallSample: n < 10,
  };
}

// ─────────────────────────────────────────────────────────────────
// 12. Position Size Behavior (Section 19)
// ─────────────────────────────────────────────────────────────────

export interface PosSizeBehavior {
  count: number;
  avgSize: number | null;
  stdDev: number | null;
  cv: number | null;
  avgAfterWin: number | null;
  avgAfterLoss: number | null;
  sizeRatioAfterWin: number | null; // >1 = increased
  sizeRatioAfterLoss: number | null;
  bySymbol: { symbol: string; avgSize: number; count: number }[];
  smallSample: boolean;
}

export function getPosSizeBehavior(trades: Trade[]): PosSizeBehavior {
  const closed = trades.filter(t => isClosed(t) && t.positionSize !== null);
  const sizes = closed.map(t => t.positionSize!);
  const avgAll = avg(sizes);
  const sorted = [...closed].sort((a, b) => a.openedAt - b.openedAt);

  // After win / after loss
  const afterWin: number[] = [];
  const afterLoss: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.positionSize === null) continue;
    if (isWin(prev)) afterWin.push(curr.positionSize);
    else if (isLoss(prev)) afterLoss.push(curr.positionSize);
  }

  // By symbol
  const bySymbolMap = new Map<string, number[]>();
  closed.forEach(t => {
    if (!bySymbolMap.has(t.symbol)) bySymbolMap.set(t.symbol, []);
    bySymbolMap.get(t.symbol)!.push(t.positionSize!);
  });
  const bySymbol = [...bySymbolMap.entries()].map(([sym, szs]) => ({
    symbol: sym, avgSize: avg(szs)!, count: szs.length,
  })).sort((a, b) => b.count - a.count);

  const sd = stdDev(sizes);
  const avgW = avg(afterWin);
  const avgL = avg(afterLoss);

  return {
    count: closed.length,
    avgSize: avgAll,
    stdDev: sd,
    cv: sd !== null && avgAll !== null && avgAll > 0 ? sd / avgAll : null,
    avgAfterWin: avgW,
    avgAfterLoss: avgL,
    sizeRatioAfterWin: avgW !== null && avgAll !== null && avgAll > 0 ? avgW / avgAll : null,
    sizeRatioAfterLoss: avgL !== null && avgAll !== null && avgAll > 0 ? avgL / avgAll : null,
    bySymbol,
    smallSample: closed.length < 10,
  };
}

// ─────────────────────────────────────────────────────────────────
// 13. Planned vs Actual Risk (Section 6)
// ─────────────────────────────────────────────────────────────────

export interface PlannedVsActual {
  count: number; // trades with both planned and actual data
  avgPlannedRisk: number | null;
  avgActualRisk: number | null;
  avgDeviation: number | null; // (actual - planned) / planned
  overPlanCount: number; // actual > planned * 1.1
  underPlanCount: number;
  onPlanCount: number;
  positionSizeDeviation: number | null;
  slDeviationCount: number;
  smallSample: boolean;
}

export function getPlannedVsActual(trades: Trade[]): PlannedVsActual {
  const closed = trades.filter(isClosed);
  const withBoth = closed.filter(t => t.plannedRisk !== null && t.riskPercentage !== null);
  const deviations = withBoth.map(t => (t.riskPercentage! - t.plannedRisk!) / (t.plannedRisk! || 1));
  const overPlan = withBoth.filter(t => t.riskPercentage! > t.plannedRisk! * 1.1).length;
  const underPlan = withBoth.filter(t => t.riskPercentage! < t.plannedRisk! * 0.9).length;
  const onPlan = withBoth.length - overPlan - underPlan;

  const withBothSize = closed.filter(t => t.plannedPositionSize !== null && t.positionSize !== null);
  const sizeDevs = withBothSize.map(t => (t.positionSize! - t.plannedPositionSize!) / (t.plannedPositionSize! || 1));

  const slDevCount = closed.filter(t => t.slMoved === true).length;

  return {
    count: withBoth.length,
    avgPlannedRisk: avg(withBoth.map(t => t.plannedRisk!)),
    avgActualRisk: avg(withBoth.map(t => t.riskPercentage!)),
    avgDeviation: avg(deviations),
    overPlanCount: overPlan,
    underPlanCount: underPlan,
    onPlanCount: onPlan,
    positionSizeDeviation: avg(sizeDevs),
    slDeviationCount: slDevCount,
    smallSample: withBoth.length < 5,
  };
}

// ─────────────────────────────────────────────────────────────────
// 14. Risk Quality Score (Section 23)
// ─────────────────────────────────────────────────────────────────

export interface QualityScoreComponent {
  label: string;
  score: number; // 0-100
  weight: number; // 0-1
  description: string;
  sampleSize: number;
}

export interface RiskQualityScore {
  total: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: QualityScoreComponent[];
  smallSample: boolean;
}

export function getRiskQualityScore(trades: Trade[], profile: RiskProfileData | null): RiskQualityScore {
  const closed = trades.filter(isClosed);
  const n = closed.length;

  const components: QualityScoreComponent[] = [];

  // C1: Rule adherence (25%) — % of trades within max risk per trade
  const maxRisk = profile?.maxRiskPct ?? null;
  if (maxRisk !== null && n > 0) {
    const compliant = closed.filter(t => t.riskPercentage === null || t.riskPercentage <= maxRisk).length;
    components.push({
      label: 'رعایت قانون ریسک', score: (compliant / n) * 100, weight: 0.25,
      description: `${compliant} از ${n} معامله در محدوده مجاز ریسک بود`,
      sampleSize: n,
    });
  } else {
    components.push({ label: 'رعایت قانون ریسک', score: 50, weight: 0.25, description: 'محدودیت ریسک تعریف نشده', sampleSize: n });
  }

  // C2: Position size consistency (20%) — based on CV
  const psb = getPosSizeBehavior(closed);
  const cvScore = psb.cv !== null ? Math.max(0, 100 - psb.cv * 100) : 50;
  components.push({
    label: 'ثبات حجم معامله', score: cvScore, weight: 0.20,
    description: psb.cv !== null
      ? `ضریب تغییرات حجم: ${(psb.cv * 100).toFixed(0)}%${psb.cv > 0.5 ? ' — پراکندگی بالا' : ''}`
      : 'داده کافی نیست',
    sampleSize: psb.count,
  });

  // C3: SL discipline (20%) — % trades where SL was NOT moved
  const slb = getSLBehavior(closed);
  const slScore = slb.totalTrades > 0
    ? Math.max(0, 100 - (slb.slMovedPct ?? 0) * 150)
    : 50;
  components.push({
    label: 'انضباط حد ضرر', score: slScore, weight: 0.20,
    description: slb.totalTrades > 0
      ? `حد ضرر در ${(( slb.slMovedPct ?? 0) * 100).toFixed(0)}% معاملات جابجا شد`
      : 'داده کافی نیست',
    sampleSize: slb.totalTrades,
  });

  // C4: Planned vs actual (20%)
  const pva = getPlannedVsActual(closed);
  const pvaScore = pva.count > 0
    ? (pva.onPlanCount / pva.count) * 100
    : 50;
  components.push({
    label: 'تطابق برنامه با اجرا', score: pvaScore, weight: 0.20,
    description: pva.count > 0
      ? `${pva.onPlanCount} از ${pva.count} معامله با برنامه مطابقت داشت`
      : 'داده برنامه‌ریزی ریسک کافی نیست',
    sampleSize: pva.count,
  });

  // C5: Drawdown behavior (15%)
  const startEq = profile?.accountEquity ?? profile?.accountBalance ?? 10000;
  const dda = getDrawdownAnalysis(closed, startEq);
  const maxDDLimit = profile?.maxDrawdownPct ?? 20;
  const ddScore = Math.max(0, 100 - (dda.maxDrawdownPct / maxDDLimit) * 100);
  components.push({
    label: 'کنترل افت سرمایه', score: ddScore, weight: 0.15,
    description: `بیشترین افت: ${dda.maxDrawdownPct.toFixed(1)}% (محدوده مجاز: ${maxDDLimit}%)`,
    sampleSize: n,
  });

  const total = components.reduce((sum, c) => sum + c.score * c.weight, 0);
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (total >= 85) grade = 'A';
  else if (total >= 70) grade = 'B';
  else if (total >= 55) grade = 'C';
  else if (total >= 40) grade = 'D';

  return { total, grade, components, smallSample: n < 10 };
}

// ─────────────────────────────────────────────────────────────────
// 15. Personal Risk Insights (Section 24)
// ─────────────────────────────────────────────────────────────────

export type InsightConfidence = 'low' | 'medium' | 'high';

export interface RiskInsight {
  id: string;
  title: string;
  description: string;
  evidence: string;
  examples: number;
  dateRange: string;
  confidence: InsightConfidence;
  type: 'post-loss' | 'post-win' | 'session' | 'day' | 'sl-behavior' | 'tp-behavior' | 'position-size' | 'consistency' | 'drawdown';
}

export function getRiskInsights(trades: Trade[], profile: RiskProfileData | null): RiskInsight[] {
  const closed = trades.filter(isClosed).sort((a, b) => a.openedAt - b.openedAt);
  const insights: RiskInsight[] = [];
  const dateRangeStr = closed.length > 1
    ? `${new Date(closed[0].openedAt).toLocaleDateString('fa-IR')} تا ${new Date(closed[closed.length - 1].openedAt).toLocaleDateString('fa-IR')}`
    : 'کافی نیست';

  // Insight 1: Post-loss risk increase
  const plb = getPostLossBehavior(closed);
  plb.forEach(b => {
    if (b.examples >= 3 && b.riskRatio !== null && b.riskRatio > 1.15) {
      insights.push({
        id: `post-loss-${b.afterCount}`,
        title: `افزایش ریسک ${b.afterCount === 1 ? 'پس از ضرر' : `پس از ${b.afterCount} ضرر متوالی`}`,
        description: `میانگین ریسک شما بعد از ${b.afterCount} ضرر متوالی ${((b.riskRatio - 1) * 100).toFixed(0)}% بیشتر از میانگین کلی بود.`,
        evidence: `میانگین کلی: ${b.avgRiskBefore?.toFixed(2)}% ← بعد از ${b.afterCount} ضرر: ${b.avgRiskAfter?.toFixed(2)}%`,
        examples: b.examples,
        dateRange: dateRangeStr,
        confidence: b.examples >= 8 ? 'high' : b.examples >= 5 ? 'medium' : 'low',
        type: 'post-loss',
      });
    }
  });

  // Insight 2: Post-win risk increase
  const pwb = getPostWinBehavior(closed);
  pwb.forEach(b => {
    if (b.examples >= 3 && b.riskRatio !== null && b.riskRatio > 1.15) {
      insights.push({
        id: `post-win-${b.afterCount}`,
        title: `افزایش ریسک پس از ${b.afterCount} سود متوالی`,
        description: `میانگین ریسک شما بعد از ${b.afterCount} سود متوالی ${((b.riskRatio - 1) * 100).toFixed(0)}% بیشتر از میانگین کلی بود.`,
        evidence: `میانگین کلی: ${b.avgRiskBefore?.toFixed(2)}% ← بعد از ${b.afterCount} سود: ${b.avgRiskAfter?.toFixed(2)}%`,
        examples: b.examples,
        dateRange: dateRangeStr,
        confidence: b.examples >= 8 ? 'high' : b.examples >= 5 ? 'medium' : 'low',
        type: 'post-win',
      });
    }
  });

  // Insight 3: SL movement
  const slb = getSLBehavior(closed);
  if (slb.totalTrades >= 5 && slb.slMovedPct !== null && slb.slMovedPct > 0.1) {
    insights.push({
      id: 'sl-movement',
      title: 'جابجایی مکرر حد ضرر',
      description: `حد ضرر در ${(slb.slMovedPct * 100).toFixed(0)}% معاملات جابجا شد.`,
      evidence: `${slb.slMovedCount} از ${slb.totalTrades} معامله با تغییر حد ضرر همراه بود`,
      examples: slb.slMovedCount,
      dateRange: dateRangeStr,
      confidence: slb.totalTrades >= 20 ? 'high' : slb.totalTrades >= 10 ? 'medium' : 'low',
      type: 'sl-behavior',
    });
  }

  // Insight 4: Position size inconsistency
  const psb = getPosSizeBehavior(closed);
  if (psb.count >= 5 && psb.cv !== null && psb.cv > 0.4) {
    insights.push({
      id: 'size-inconsistency',
      title: 'ناسازگاری در حجم معاملات',
      description: `ضریب تغییرات حجم معاملات ${(psb.cv * 100).toFixed(0)}% بود که نشان‌دهنده ناسازگاری در اندازه‌گیری موقعیت است.`,
      evidence: `میانگین: ${psb.avgSize?.toFixed(2)} — انحراف معیار: ${psb.stdDev?.toFixed(2)}`,
      examples: psb.count,
      dateRange: dateRangeStr,
      confidence: psb.count >= 20 ? 'high' : psb.count >= 10 ? 'medium' : 'low',
      type: 'position-size',
    });
  }

  // Insight 5: Session-based risk differences
  const sessionRisks = getRiskBySession(closed, profile);
  const sessWithData = sessionRisks.filter(s => s.count >= 5 && s.avgRisk !== null);
  if (sessWithData.length >= 2) {
    const sorted = [...sessWithData].sort((a, b) => (b.avgRisk ?? 0) - (a.avgRisk ?? 0));
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    if (highest.avgRisk !== null && lowest.avgRisk !== null && highest.avgRisk > lowest.avgRisk * 1.3) {
      insights.push({
        id: 'session-risk-diff',
        title: `ریسک بالاتر در سشن ${highest.label}`,
        description: `میانگین ریسک در سشن ${highest.label} (${highest.avgRisk.toFixed(2)}%) در مقایسه با سشن ${lowest.label} (${lowest.avgRisk.toFixed(2)}%) بالاتر است.`,
        evidence: `${highest.label}: ${highest.avgRisk.toFixed(2)}% | ${lowest.label}: ${lowest.avgRisk.toFixed(2)}%`,
        examples: highest.count,
        dateRange: dateRangeStr,
        confidence: highest.count >= 10 ? 'medium' : 'low',
        type: 'session',
      });
    }
  }

  return insights;
}

// ─────────────────────────────────────────────────────────────────
// 16. Detect Risk Violations
// ─────────────────────────────────────────────────────────────────

export interface DetectedViolation {
  ruleType: string;
  ruleLabel: string;
  plannedValue: number | null;
  actualValue: number | null;
  deviation: number | null;
}

export function detectTradeViolations(
  trade: Trade,
  profile: RiskProfileData | null,
  sameDayTrades: Trade[],
): DetectedViolation[] {
  if (!profile) return [];
  const violations: DetectedViolation[] = [];

  // Max per trade
  if (profile.maxRiskPct !== null && trade.riskPercentage !== null) {
    if (trade.riskPercentage > profile.maxRiskPct) {
      violations.push({
        ruleType: 'max-per-trade',
        ruleLabel: `ریسک بیش از حد مجاز (${profile.maxRiskPct}%)`,
        plannedValue: profile.maxRiskPct,
        actualValue: trade.riskPercentage,
        deviation: ((trade.riskPercentage - profile.maxRiskPct) / profile.maxRiskPct) * 100,
      });
    }
  }

  // Max daily risk
  if (profile.maxDailyRiskPct !== null) {
    const dayRisk = sameDayTrades
      .filter(t => t.id !== trade.id)
      .reduce((s, t) => s + (t.riskPercentage ?? 0), 0) + (trade.riskPercentage ?? 0);
    if (dayRisk > profile.maxDailyRiskPct) {
      violations.push({
        ruleType: 'max-daily',
        ruleLabel: `ریسک روزانه از ${profile.maxDailyRiskPct}% بیشتر شد`,
        plannedValue: profile.maxDailyRiskPct,
        actualValue: dayRisk,
        deviation: ((dayRisk - profile.maxDailyRiskPct) / profile.maxDailyRiskPct) * 100,
      });
    }
  }

  // Max trades per day
  if (profile.maxTradesPerDay !== null) {
    const todayCount = sameDayTrades.length + 1;
    if (todayCount > profile.maxTradesPerDay) {
      violations.push({
        ruleType: 'max-trades-per-day',
        ruleLabel: `تعداد معاملات روزانه از ${profile.maxTradesPerDay} بیشتر شد`,
        plannedValue: profile.maxTradesPerDay,
        actualValue: todayCount,
        deviation: null,
      });
    }
  }

  // Min R:R
  if (profile.minRR !== null && trade.plannedRR !== null) {
    if (trade.plannedRR < profile.minRR) {
      violations.push({
        ruleType: 'min-rr',
        ruleLabel: `نسبت ریوارد به ریسک زیر ${profile.minRR}`,
        plannedValue: profile.minRR,
        actualValue: trade.plannedRR,
        deviation: null,
      });
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────
// 17. Pre-Trade Risk Calculator (Section 4)
// ─────────────────────────────────────────────────────────────────

export interface PreTradeRiskCalc {
  slDistance: number | null;
  slDistancePct: number | null;
  monetaryRisk: number | null;
  percentageRisk: number | null;
  positionSize: number | null;
  potentialReward: number | null;
  plannedRR: number | null;
  missingFields: string[];
  warning: string | null;
}

export function calculatePreTradeRisk(params: {
  accountEquity: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskPct: number | null;
  riskAmount: number | null;
  positionSize: number | null;
  pointValue?: number; // pip/point value for forex (default 1)
}): PreTradeRiskCalc {
  const { accountEquity, entryPrice, stopLoss, takeProfit, riskPct, riskAmount } = params;
  const missing: string[] = [];
  if (!entryPrice) missing.push('قیمت ورود');
  if (!stopLoss) missing.push('حد ضرر');

  if (missing.length) {
    return {
      slDistance: null, slDistancePct: null, monetaryRisk: null, percentageRisk: null,
      positionSize: null, potentialReward: null, plannedRR: null, missingFields: missing,
      warning: 'محاسبه ریسک با داده‌های موجود امکان‌پذیر نیست.',
    };
  }

  const slDist = Math.abs(entryPrice! - stopLoss!);
  const slDistPct = (slDist / entryPrice!) * 100;

  let monRisk: number | null = null;
  let pctRisk: number | null = null;
  let posSz: number | null = null;

  if (riskAmount !== null) {
    monRisk = riskAmount;
    if (accountEquity) pctRisk = (riskAmount / accountEquity) * 100;
    if (slDist > 0) posSz = riskAmount / slDist;
  } else if (riskPct !== null && accountEquity) {
    monRisk = (riskPct / 100) * accountEquity;
    pctRisk = riskPct;
    if (slDist > 0) posSz = monRisk / slDist;
  } else if (params.positionSize !== null) {
    posSz = params.positionSize;
    monRisk = slDist * posSz;
    if (accountEquity) pctRisk = (monRisk / accountEquity) * 100;
  } else {
    missing.push('ریسک مقداری یا درصدی');
  }

  let potRew: number | null = null;
  let rr: number | null = null;
  if (takeProfit !== null && entryPrice !== null) {
    const tpDist = Math.abs(takeProfit - entryPrice);
    potRew = (posSz ?? 1) * tpDist;
    if (slDist > 0) rr = tpDist / slDist;
  }

  return {
    slDistance: slDist,
    slDistancePct: slDistPct,
    monetaryRisk: monRisk,
    percentageRisk: pctRisk,
    positionSize: posSz,
    potentialReward: potRew,
    plannedRR: rr,
    missingFields: missing,
    warning: missing.length > 0 ? 'برخی فیلدها برای محاسبه کامل نیاز است.' : null,
  };
}

// ─────────────────────────────────────────────────────────────────
// 18. Pre-Trade Risk Briefing (Section 25)
// ─────────────────────────────────────────────────────────────────

export interface PreTradeBriefing {
  defaultRisk: number | null;
  todayRiskUsed: number | null;
  todayRiskLimit: number | null;
  todayTradeCount: number;
  todayTradeLimit: number | null;
  weeklyRiskUsed: number | null;
  weeklyRiskLimit: number | null;
  currentConsecutiveLosses: number;
  maxConsecutiveLossLimit: number | null;
  currentDrawdownPct: number;
  maxDrawdownLimit: number | null;
  historicalAvgRiskInSetup: number | null;
  historicalAvgRiskInSession: number | null;
  setupSampleSize: number;
  sessionSampleSize: number;
  warnings: string[];
}

export function getPreTradeBriefing(
  allTrades: Trade[],
  profile: RiskProfileData | null,
  todayStr: string,
  setup: string | null,
  session: string | null,
): PreTradeBriefing {
  const todayTrades = allTrades.filter(t => dateStr(t.openedAt) === todayStr);
  const todayRisk = todayTrades.reduce((s, t) => s + (t.riskPercentage ?? 0), 0);

  const thisWeek = weekKey(Date.now());
  const weekTrades = allTrades.filter(t => weekKey(t.openedAt) === thisWeek);
  const weekRisk = weekTrades.reduce((s, t) => s + (t.riskPercentage ?? 0), 0);

  const closed = allTrades.filter(isClosed).sort((a, b) => a.openedAt - b.openedAt);
  let consLoss = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    if (isLoss(closed[i])) consLoss++;
    else break;
  }

  const startEq = profile?.accountEquity ?? profile?.accountBalance ?? 10000;
  const dda = getDrawdownAnalysis(closed, startEq);

  // Setup-specific history
  const setupTrades = setup ? closed.filter(t => t.setupType === setup) : [];
  const sessionTrades = session ? closed.filter(t => t.tradingSession === session) : [];

  const warnings: string[] = [];
  if (profile) {
    if (profile.maxDailyRiskPct !== null && todayRisk >= profile.maxDailyRiskPct * 0.8)
      warnings.push(`ریسک روزانه به ${todayRisk.toFixed(1)}% رسیده — محدودیت: ${profile.maxDailyRiskPct}%`);
    if (profile.maxConsecutiveLosses !== null && consLoss >= profile.maxConsecutiveLosses)
      warnings.push(`${consLoss} ضرر متوالی — مرور قوانین توصیه می‌شود`);
    if (profile.maxDrawdownPct !== null && dda.currentDrawdownPct >= profile.maxDrawdownPct * 0.8)
      warnings.push(`افت سرمایه فعلی ${dda.currentDrawdownPct.toFixed(1)}% — محدودیت: ${profile.maxDrawdownPct}%`);
  }

  return {
    defaultRisk: profile?.defaultRiskPct ?? null,
    todayRiskUsed: todayTrades.length > 0 ? todayRisk : null,
    todayRiskLimit: profile?.maxDailyRiskPct ?? null,
    todayTradeCount: todayTrades.length,
    todayTradeLimit: profile?.maxTradesPerDay ?? null,
    weeklyRiskUsed: weekTrades.length > 0 ? weekRisk : null,
    weeklyRiskLimit: profile?.maxWeeklyRiskPct ?? null,
    currentConsecutiveLosses: consLoss,
    maxConsecutiveLossLimit: profile?.maxConsecutiveLosses ?? null,
    currentDrawdownPct: dda.currentDrawdownPct,
    maxDrawdownLimit: profile?.maxDrawdownPct ?? null,
    historicalAvgRiskInSetup: avg(setupTrades.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!)),
    historicalAvgRiskInSession: avg(sessionTrades.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!)),
    setupSampleSize: setupTrades.length,
    sessionSampleSize: sessionTrades.length,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────
// 18b. Batch Violation Scanner — اسکن همه معاملات یکجا
// ─────────────────────────────────────────────────────────────────

export interface ScannedViolation {
  tradeId: string;
  tradeDate: string;
  ruleType: string;
  ruleLabel: string;
  plannedValue: number | null;
  actualValue: number | null;
  deviation: number | null;
}

export function scanAllViolations(trades: Trade[], profile: RiskProfileData | null): ScannedViolation[] {
  if (!profile) return [];
  const result: ScannedViolation[] = [];
  const byDate = new Map<string, Trade[]>();
  trades.forEach(t => {
    const d = dateStr(t.openedAt);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(t);
  });

  trades.forEach(trade => {
    const tradeDate = dateStr(trade.openedAt);
    const sameDayTrades = byDate.get(tradeDate)!;
    const violations = detectTradeViolations(trade, profile, sameDayTrades.filter(t => t.id !== trade.id));
    violations.forEach(v => {
      result.push({ tradeId: trade.id, tradeDate, ...v });
    });
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────
// 19. Risk Heatmap Data (Section 22)
// ─────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  key: string;
  label: string;
  count: number;
  avgRisk: number | null;
  winRate: number | null;
  violations: number;
}

export function getRiskHeatmapBySymbol(trades: Trade[], profile: RiskProfileData | null): HeatmapCell[] {
  const bySymbol = new Map<string, Trade[]>();
  trades.forEach(t => {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  });
  const maxRisk = profile?.maxRiskPct ?? null;
  return [...bySymbol.entries()].map(([sym, ts]) => {
    const closed = ts.filter(isClosed);
    const wins = closed.filter(isWin).length;
    const violations = maxRisk !== null ? ts.filter(t => (t.riskPercentage ?? 0) > maxRisk).length : 0;
    return {
      key: sym,
      label: sym,
      count: ts.length,
      avgRisk: avg(ts.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!)),
      winRate: closed.length > 0 ? wins / closed.length : null,
      violations,
    };
  }).sort((a, b) => b.count - a.count);
}
