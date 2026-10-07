/**
 * profitFactor.ts — محاسبه Profit Factor
 * PART 5 / Prompt 3 — Core Metrics Service
 *
 * Profit Factor = مجموع سودهای خالص / قدرمطلق مجموع زیان‌های خالص
 * بالای ۱ یعنی سودده، بالای ۱.۵ عالی.
 *
 * سود و زیان از «علامت عدد» تعیین می‌شود، نه از برچسب result؛
 * پس معامله‌ای که برچسبش win است ولی بعد از هزینه ضرر شده، درست
 * در سمت زیان‌ها حساب می‌شود.
 */

import type { Trade } from '../../db/database';
import { isClosed, getNetPnl, getResolvedR } from '../../lib/tradeHelpers';

export interface ProfitFactorResult {
  profitFactor: number | null;
  profitFactorR: number | null;   // بر اساس R
  totalWinPnl: number;
  totalLossPnl: number;           // قدرمطلق (مثبت)
  totalWinR: number;
  totalLossR: number;             // قدرمطلق (مثبت)
  grade: 'excellent' | 'good' | 'average' | 'poor' | 'insufficient';
}

export function computeProfitFactor(trades: Trade[]): ProfitFactorResult {
  const closed = trades.filter(isClosed);

  let totalWinPnl = 0;
  let totalLossPnl = 0;
  let totalWinR = 0;
  let totalLossR = 0;

  for (const t of closed) {
    const net = getNetPnl(t);
    if (net !== null) {
      if (net > 0) totalWinPnl += net;
      else if (net < 0) totalLossPnl += -net;
    }
    const r = getResolvedR(t);
    if (r !== null) {
      if (r > 0) totalWinR += r;
      else if (r < 0) totalLossR += -r;
    }
  }

  const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : null;
  const profitFactorR = totalLossR > 0 ? totalWinR / totalLossR : null;

  const grade = (() => {
    if (profitFactor === null) return 'insufficient';
    if (profitFactor >= 2.0) return 'excellent';
    if (profitFactor >= 1.5) return 'good';
    if (profitFactor >= 1.0) return 'average';
    return 'poor';
  })();

  return {
    profitFactor,
    profitFactorR,
    totalWinPnl,
    totalLossPnl,
    totalWinR,
    totalLossR,
    grade,
  };
}
