/**
 * analytics.worker.ts — PART 6 / Prompt 3
 *
 * Web Worker برای محاسبات سنگین analytics روی thread جداگانه.
 * جلوگیری از freeze شدن UI هنگام محاسبه.
 *
 * ارتباط: postMessage → Worker → Result → React State
 */

import type { Trade } from '../db/database';
import { isWin, isClosed, getNetPnl, getCloseTime, getResolvedR, avg, median, stdDev } from '../lib/tradeHelpers';
import { getTradingDateParts } from '../lib/tradingTime';
import type { TradingTimeConfig } from '../lib/tradingTime';
import { computeExpectancy } from '../core/metrics/expectancy';
import { computeProfitFactor } from '../core/metrics/profitFactor';
import { computeRiskMetrics } from '../core/metrics/riskMetrics';
import { computeMaxDrawdown } from '../core/metrics/pnl';

// ── Message Types ─────────────────────────────────────────────────────────────

export type WorkerRequest =
  | { type: 'COMPUTE_EDGE'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_PERFORMANCE'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_RISK'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_STATISTICS'; trades: Trade[]; timeConfig?: TradingTimeConfig }
  | { type: 'COMPUTE_ALL'; trades: Trade[]; timeConfig?: TradingTimeConfig };

export type WorkerResponse =
  | { type: 'EDGE_RESULT'; data: EdgeAnalyticsResult }
  | { type: 'PERFORMANCE_RESULT'; data: PerformanceResult }
  | { type: 'RISK_RESULT'; data: RiskResult }
  | { type: 'STATISTICS_RESULT'; data: StatisticsResult }
  | { type: 'ALL_RESULT'; data: { edge: EdgeAnalyticsResult; performance: PerformanceResult; risk: RiskResult; statistics: StatisticsResult } }
  | { type: 'ERROR'; message: string };

// ── Result Types ──────────────────────────────────────────────────────────────

export interface EdgeAnalyticsResult {
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  avgR: number | null;
  bestSymbol: string | null;
  bestSession: string | null;
  bestDayOfWeek: string | null;
  bySymbol: { symbol: string; winRate: number | null; count: number }[];
  bySession: { session: string; winRate: number | null; count: number }[];
}

export interface PerformanceResult {
  totalPnl: number;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;
  pnlCurve: { index: number; cumulative: number }[];
}

export interface RiskResult {
  avgRisk: number | null;
  maxRisk: number | null;
  riskConsistency: number | null;
  kellyPct: number | null;
  sharpeRatio: number | null;
  rMultipleDistribution: { r: string; count: number }[];
}

export interface StatisticsResult {
  medianR: number | null;
  stdDevR: number | null;
  skewness: number | null;
  kurtosis: number | null;
  sampleSize: number;
  confidenceInterval: { lower: number; upper: number } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** مقدار بحرانی t دو‌دامنه ۹۵٪ برای df کوچک؛ برای df بزرگ ≈ ۱٫۹۶ */
const T_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
};
function tCritical95(df: number): number {
  if (df <= 0) return Number.NaN;
  if (df <= 30) return T_95[df];
  if (df <= 60) return 2.0;
  return 1.96;
}

/** بهترین گروه: ترجیحاً با حداقل نمونه ۳، بر اساس winRate و سپس تعداد */
function pickBest<T extends { winRate: number | null; count: number }>(items: T[]): T | null {
  const withData = items.filter(i => i.count > 0 && i.winRate !== null);
  if (!withData.length) return null;
  const pool = withData.filter(i => i.count >= 3);
  const candidates = pool.length ? pool : withData;
  return [...candidates].sort((a, b) => (b.winRate! - a.winRate!) || (b.count - a.count))[0];
}

// ── Computation Functions ─────────────────────────────────────────────────────

function computeEdge(trades: Trade[], timeConfig?: TradingTimeConfig): EdgeAnalyticsResult {
  const closed = trades.filter(isClosed);
  const n = closed.length;
  const winRate = n > 0 ? closed.filter(isWin).length / n : null;

  const exp = computeExpectancy(closed);
  const pf = computeProfitFactor(closed);
  const avgR = avg(closed.map(getResolvedR).filter((r): r is number => r !== null));

  // By symbol
  const symbolMap = new Map<string, Trade[]>();
  for (const t of closed) {
    if (!symbolMap.has(t.symbol)) symbolMap.set(t.symbol, []);
    symbolMap.get(t.symbol)!.push(t);
  }
  const allSymbols = [...symbolMap.entries()].map(([symbol, ts]) => ({
    symbol,
    winRate: ts.length > 0 ? ts.filter(isWin).length / ts.length : null,
    count: ts.length,
  }));
  const bestSymbol = pickBest(allSymbols)?.symbol ?? null;
  const bySymbol = [...allSymbols].sort((a, b) => b.count - a.count).slice(0, 10);

  // By session
  const sessionMap = new Map<string, Trade[]>();
  for (const t of closed) {
    const s = t.tradingSession ?? 'unknown';
    if (!sessionMap.has(s)) sessionMap.set(s, []);
    sessionMap.get(s)!.push(t);
  }
  const bySession = [...sessionMap.entries()].map(([session, ts]) => ({
    session,
    winRate: ts.length > 0 ? ts.filter(isWin).length / ts.length : null,
    count: ts.length,
  }));
  const knownSessions = bySession.filter(s => s.session !== 'unknown');
  const bestSession = (pickBest(knownSessions) ?? pickBest(bySession))?.session ?? null;

  // Best day of week
  const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const dayStats = DAYS.map((day, i) => {
    const dt = closed.filter(t => getTradingDateParts(t.openedAt, timeConfig).dayOfWeek === i);
    return { day, count: dt.length, winRate: dt.length > 0 ? dt.filter(isWin).length / dt.length : null };
  });
  const bestDayOfWeek = pickBest(dayStats)?.day ?? null;

  return {
    winRate,
    expectancy: exp.expectancy,
    profitFactor: pf.profitFactor,
    avgR,
    bestSymbol,
    bestSession,
    bestDayOfWeek,
    bySymbol,
    bySession,
  };
}

function computePerformance(trades: Trade[]): PerformanceResult {
  // سود/زیان خالص، به ترتیب زمان بسته شدن
  const closed = trades
    .filter(isClosed)
    .map(t => ({ t, net: getNetPnl(t) }))
    .filter((x): x is { t: Trade; net: number } => x.net !== null)
    .sort((a, b) => getCloseTime(a.t) - getCloseTime(b.t));

  let equity = 0;
  const pnlCurve: { index: number; cumulative: number }[] = [];
  for (let i = 0; i < closed.length; i++) {
    equity += closed[i].net;
    pnlCurve.push({ index: i + 1, cumulative: equity });
  }

  // Consecutive wins/losses
  let maxCW = 0, maxCL = 0, cw = 0, cl = 0;
  for (const { net } of closed) {
    if (net > 0) { cw++; cl = 0; maxCW = Math.max(maxCW, cw); }
    else if (net < 0) { cl++; cw = 0; maxCL = Math.max(maxCL, cl); }
    else { cw = 0; cl = 0; }
  }

  const winPnls = closed.map(x => x.net).filter(v => v > 0);
  const lossPnls = closed.map(x => x.net).filter(v => v < 0);
  const drawdown = computeMaxDrawdown(trades);

  return {
    totalPnl: equity,
    maxDrawdown: drawdown.absolute,
    maxDrawdownPct: drawdown.percentage,
    avgWin: avg(winPnls),
    avgLoss: avg(lossPnls),
    largestWin: winPnls.length ? winPnls.reduce((m, v) => (v > m ? v : m), winPnls[0]) : null,
    largestLoss: lossPnls.length ? lossPnls.reduce((m, v) => (v < m ? v : m), lossPnls[0]) : null,
    consecutiveWins: maxCW,
    consecutiveLosses: maxCL,
    pnlCurve,
  };
}

function computeRisk(trades: Trade[]): RiskResult {
  const closed = trades.filter(isClosed);
  const risks = closed
    .filter(t => typeof t.riskPercentage === 'number' && Number.isFinite(t.riskPercentage))
    .map(t => t.riskPercentage as number);
  const m = computeRiskMetrics(closed);

  return {
    avgRisk: m.avgRiskPct,
    maxRisk: risks.length ? risks.reduce((mx, v) => (v > mx ? v : mx), risks[0]) : null,
    riskConsistency: m.riskConsistency,
    kellyPct: m.kellyPct,
    sharpeRatio: m.sharpeRatio,
    rMultipleDistribution: m.rMultipleDistribution,
  };
}

function computeStatistics(trades: Trade[]): StatisticsResult {
  const closed = trades.filter(isClosed);
  const Rs = closed.map(getResolvedR).filter((r): r is number => r !== null);
  const n = Rs.length;
  const m = avg(Rs);
  const sd = stdDev(Rs);          // انحراف معیار نمونه (n-1) برای بازهٔ اطمینان
  const med = median(Rs);

  // چولگی و کشیدگی با گشتاورهای جامعه (m3/m2^1.5 و m4/m2^2 − 3)
  let skewness: number | null = null;
  let kurtosis: number | null = null;
  if (m !== null && n >= 3) {
    const m2 = Rs.reduce((s, v) => s + (v - m) ** 2, 0) / n;
    if (m2 > 0) {
      const m3 = Rs.reduce((s, v) => s + (v - m) ** 3, 0) / n;
      skewness = m3 / Math.pow(m2, 1.5);
      if (n >= 4) {
        const m4 = Rs.reduce((s, v) => s + (v - m) ** 4, 0) / n;
        kurtosis = m4 / (m2 * m2) - 3;
      }
    }
  }

  // بازهٔ اطمینان ۹۵٪ میانگین R با توزیع t (برای نمونه‌های کوچک دقیق‌تر از ۱٫۹۶)
  let confidenceInterval: { lower: number; upper: number } | null = null;
  if (m !== null && sd !== null && n >= 5) {
    const se = sd / Math.sqrt(n);
    const t = tCritical95(n - 1);
    confidenceInterval = { lower: m - t * se, upper: m + t * se };
  }

  return { medianR: med, stdDevR: sd, skewness, kurtosis, sampleSize: n, confidenceInterval };
}

// ── Worker Message Handler ─────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const { type, trades } = event.data;
    switch (type) {
      case 'COMPUTE_EDGE':
        self.postMessage({ type: 'EDGE_RESULT', data: computeEdge(trades, event.data.timeConfig) } as WorkerResponse);
        break;
      case 'COMPUTE_PERFORMANCE':
        self.postMessage({ type: 'PERFORMANCE_RESULT', data: computePerformance(trades) } as WorkerResponse);
        break;
      case 'COMPUTE_RISK':
        self.postMessage({ type: 'RISK_RESULT', data: computeRisk(trades) } as WorkerResponse);
        break;
      case 'COMPUTE_STATISTICS':
        self.postMessage({ type: 'STATISTICS_RESULT', data: computeStatistics(trades) } as WorkerResponse);
        break;
      case 'COMPUTE_ALL':
        self.postMessage({
          type: 'ALL_RESULT',
          data: {
          edge: computeEdge(trades, event.data.timeConfig),
            performance: computePerformance(trades),
            risk: computeRisk(trades),
            statistics: computeStatistics(trades),
          },
        } as WorkerResponse);
        break;
      default:
        self.postMessage({ type: 'ERROR', message: `Unknown type: ${(event.data as any).type}` } as WorkerResponse);
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err instanceof Error ? err.message : String(err) } as WorkerResponse);
  }
};
