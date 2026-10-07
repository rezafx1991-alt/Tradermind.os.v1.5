/**
 * winRate.ts — محاسبات Win Rate
 * PART 5 / Prompt 3 — Core Metrics Service
 *
 * برد/باخت/سربه‌سر بر اساس علامت سود خالص تعیین می‌شود (getOutcome).
 * Win Rate = برد ÷ همهٔ معاملات بسته (سربه‌سر در مخرج می‌ماند).
 */

import type { Trade } from '../../db/database';
import { isClosed, isWin, isLoss, isBreakEven, getCloseTime } from '../../lib/tradeHelpers';
import { getTradingDateParts } from '../../lib/tradingTime';

export interface WinRateResult {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;  // 0-1
  lossRate: number | null; // 0-1
}

/** محاسبه نرخ برد/باخت */
export function computeWinRate(trades: Trade[]): WinRateResult {
  const closed = trades.filter(isClosed);
  const wins = closed.filter(isWin);
  const losses = closed.filter(isLoss);
  const breakeven = closed.filter(isBreakEven);

  const total = closed.length;
  return {
    total,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: total > 0 ? wins.length / total : null,
    lossRate: total > 0 ? losses.length / total : null,
  };
}

/** Win Rate برای یک نماد خاص */
export function computeWinRateForSymbol(trades: Trade[], symbol: string): WinRateResult {
  return computeWinRate(trades.filter(t => t.symbol === symbol));
}

/** Win Rate برای یک استراتژی خاص */
export function computeWinRateForStrategy(trades: Trade[], strategyId: string): WinRateResult {
  return computeWinRate(trades.filter(t => t.strategyId === strategyId));
}

/** Win Rate به تفکیک روز هفته */
export function computeWinRateByDayOfWeek(trades: Trade[]): Array<{
  day: number;
  dayName: string;
  total: number;
  winRate: number | null;
}> {
  const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const closed = trades.filter(isClosed);

  return DAYS.map((dayName, day) => {
    const dayTrades = closed.filter(t => getTradingDateParts(t.openedAt).dayOfWeek === day);
    const wins = dayTrades.filter(isWin);
    return {
      day,
      dayName,
      total: dayTrades.length,
      winRate: dayTrades.length > 0 ? wins.length / dayTrades.length : null,
    };
  });
}

/** Win Rate در معاملات اخیر (برای نمایش روند) — جدیدترین‌ها بر اساس زمان بسته شدن */
export function computeRecentWinRate(trades: Trade[], last = 5): number | null {
  const closed = trades
    .filter(isClosed)
    .sort((a, b) => getCloseTime(b) - getCloseTime(a))
    .slice(0, last);

  if (!closed.length) return null;
  const wins = closed.filter(isWin);
  return wins.length / closed.length;
}
