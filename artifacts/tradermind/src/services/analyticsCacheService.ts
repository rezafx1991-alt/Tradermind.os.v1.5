/**
 * analyticsCacheService.ts — PART 4 / Prompt 3
 *
 * کش نتایج analytics برای جلوگیری از محاسبه مجدد.
 * Cache در حافظه (Map) نگه‌داری می‌شود و با هر تغییر در DB invalidate می‌شود.
 */

import { Trade, DailyJournal, Strategy } from '../db/database';
import { getAllTradesForAnalytics } from '../core/repositories/tradeRepository';
import { isWin, isLoss, isClosed, getNetPnl, getResolvedR } from '../lib/tradeHelpers';
import { computeProfitFactor } from '../core/metrics/profitFactor';
import { computeExpectancy } from '../core/metrics/expectancy';
import { getTradingDateKey } from '../lib/tradingTime';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DailyStats {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnl: number;
  totalR: number | null;
}

export interface SymbolStats {
  symbol: string;
  trades: number;
  wins: number;
  winRate: number | null;
  totalPnl: number;
  avgR: number | null;
}

export interface SessionStats {
  session: string;
  trades: number;
  wins: number;
  winRate: number | null;
  totalPnl: number;
}

export interface CachedAnalytics {
  // آمار کلی
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winRate: number | null;
  lossRate: number | null;
  profitFactor: number | null;
  averageR: number | null;
  expectancy: number | null;
  totalPnl: number;
  // آمار تفکیکی
  dailyStats: DailyStats[];
  symbolStats: SymbolStats[];
  sessionStats: SessionStats[];
  // متا
  computedAt: number;
  tradeCount: number;   // برای تشخیص stale بودن
}

// ── Cache State ────────────────────────────────────────────────────────────────

let _cache: CachedAnalytics | null = null;
let _isComputing = false;
let _computePromise: Promise<CachedAnalytics> | null = null;

// ── Compute ────────────────────────────────────────────────────────────────────

async function computeAnalyticsCache(): Promise<CachedAnalytics> {
  const trades = await getAllTradesForAnalytics();
  const closed = trades.filter(isClosed);
  const wins = closed.filter(isWin);
  const losses = closed.filter(isLoss);
  const n = closed.length;

  // آمار پایه — همه از موتور مرکزی (سود خالص، علامت‌محور)
  const profitFactor = computeProfitFactor(closed).profitFactor;
  const exp = computeExpectancy(closed);
  const Rs = closed.map(getResolvedR).filter((r): r is number => r !== null);
  const averageR = Rs.length ? Rs.reduce((s, v) => s + v, 0) / Rs.length : null;

  const winRate = n > 0 ? wins.length / n : null;
  const lossRate = n > 0 ? losses.length / n : null;
  const expectancy = exp.expectancy;
  const totalPnl = closed.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0);

  // Daily stats
  const byDay = new Map<string, { trades: Trade[] }>();
  for (const t of closed) {
    const date = getTradingDateKey(t.openedAt);
    if (!byDay.has(date)) byDay.set(date, { trades: [] });
    byDay.get(date)!.trades.push(t);
  }
  const dailyStats: DailyStats[] = [...byDay.entries()].map(([date, { trades: dt }]) => {
    const dWins = dt.filter(isWin);
    const dRs = dt.map(getResolvedR).filter((r): r is number => r !== null);
    return {
      date,
      trades: dt.length,
      wins: dWins.length,
      losses: dt.filter(isLoss).length,
      winRate: dt.length > 0 ? dWins.length / dt.length : null,
      totalPnl: dt.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0),
      totalR: dRs.length ? dRs.reduce((s, v) => s + v, 0) : null,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  // Symbol stats
  const bySymbol = new Map<string, Trade[]>();
  for (const t of closed) {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  }
  const symbolStats: SymbolStats[] = [...bySymbol.entries()].map(([symbol, st]) => {
    const sWins = st.filter(isWin);
    const sRs = st.map(getResolvedR).filter((r): r is number => r !== null);
    return {
      symbol,
      trades: st.length,
      wins: sWins.length,
      winRate: st.length > 0 ? sWins.length / st.length : null,
      totalPnl: st.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0),
      avgR: sRs.length ? sRs.reduce((s, v) => s + v, 0) / sRs.length : null,
    };
  }).sort((a, b) => b.trades - a.trades);

  // Session stats
  const bySession = new Map<string, Trade[]>();
  for (const t of closed) {
    const session = t.tradingSession ?? 'unknown';
    if (!bySession.has(session)) bySession.set(session, []);
    bySession.get(session)!.push(t);
  }
  const sessionStats: SessionStats[] = [...bySession.entries()].map(([session, st]) => {
    const sWins = st.filter(isWin);
    return {
      session,
      trades: st.length,
      wins: sWins.length,
      winRate: st.length > 0 ? sWins.length / st.length : null,
      totalPnl: st.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0),
    };
  });

  return {
    totalTrades: trades.length,
    closedTrades: n,
    openTrades: trades.filter(t => t.status === 'open').length,
    winRate,
    lossRate,
    profitFactor,
    averageR,
    expectancy,
    totalPnl,
    dailyStats,
    symbolStats,
    sessionStats,
    computedAt: Date.now(),
    tradeCount: trades.length,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * دریافت analytics از cache.
 * اگر cache خالی باشد، محاسبه می‌کند.
 */
export async function getCachedAnalytics(): Promise<CachedAnalytics> {
  if (_cache) return _cache;

  // اگر درحال محاسبه است، منتظر می‌ماند
  if (_computePromise) return _computePromise;

  _isComputing = true;
  _computePromise = computeAnalyticsCache()
    .then(result => {
      _cache = result;
      _isComputing = false;
      _computePromise = null;
      return result;
    })
    .catch(err => {
      _isComputing = false;
      _computePromise = null;
      throw err;
    });

  return _computePromise;
}

/**
 * Invalidate cache — بعد از هر تغییر در DB فراخوانی شود:
 * - ایجاد معامله
 * - ویرایش معامله
 * - حذف معامله
 * - import
 * - restore backup
 */
export function invalidateAnalyticsCache(): void {
  _cache = null;
  _computePromise = null;
  _isComputing = false;
}

/** آیا cache فعال است؟ */
export function isCacheValid(): boolean {
  return _cache !== null;
}

/** زمان آخرین محاسبه */
export function getCacheAge(): number | null {
  return _cache ? Date.now() - _cache.computedAt : null;
}

/** دریافت آمار سریع بدون محاسبه کامل */
export function getQuickStats(): Pick<CachedAnalytics, 'totalTrades' | 'winRate' | 'totalPnl'> | null {
  if (!_cache) return null;
  return {
    totalTrades: _cache.totalTrades,
    winRate: _cache.winRate,
    totalPnl: _cache.totalPnl,
  };
}
