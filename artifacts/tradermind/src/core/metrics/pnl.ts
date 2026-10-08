/**
 * pnl.ts — محاسبات PnL (Profit & Loss)
 * PART 5 / Prompt 3 — Core Metrics Service
 *
 * قانون: هیچ سرویس دیگری نباید این فرمول‌ها را مجدداً پیاده کند.
 *
 * قرارداد: همهٔ مقادیر بر پایهٔ «سود/زیان خالص» (getNetPnl) هستند،
 * یعنی سود ناخالص منهای کارمزد، کمیسیون و اسپرد.
 * ترتیب زمانی همیشه بر اساس زمان «بسته شدن» معامله است.
 */

import type { Trade } from '../../db/database';
import { isClosed, getNetPnl, getCloseTime } from '../../lib/tradeHelpers';

/** نقطه منحنی PnL */
export interface PnlPoint {
  index: number;
  tradeId: string;
  symbol: string;
  pnl: number;
  cumulative: number;
  date: number; // timestamp
}

/** معاملات بسته با سود/زیان معتبر، به ترتیب زمان بسته شدن */
function closedWithPnl(trades: Trade[]): Array<{ trade: Trade; net: number }> {
  return trades
    .filter(isClosed)
    .map(trade => ({ trade, net: getNetPnl(trade) }))
    .filter((x): x is { trade: Trade; net: number } => x.net !== null)
    .sort((a, b) => getCloseTime(a.trade) - getCloseTime(b.trade));
}

/** محاسبه PnL تجمعی */
export function computePnlCurve(trades: Trade[]): PnlPoint[] {
  let cumulative = 0;
  return closedWithPnl(trades).map(({ trade, net }, i) => {
    cumulative += net;
    return {
      index: i + 1,
      tradeId: trade.id,
      symbol: trade.symbol,
      pnl: net,
      cumulative,
      date: getCloseTime(trade),
    };
  });
}

/** مجموع PnL خالص */
export function computeTotalPnl(trades: Trade[]): number {
  return closedWithPnl(trades).reduce((sum, x) => sum + x.net, 0);
}

/** بیشترین سود در یک معامله */
export function computeMaxWin(trades: Trade[]): number | null {
  const vals = closedWithPnl(trades).map(x => x.net).filter(v => v > 0);
  return vals.length ? vals.reduce((m, v) => (v > m ? v : m), vals[0]) : null;
}

/** بیشترین ضرر در یک معامله */
export function computeMaxLoss(trades: Trade[]): number | null {
  const vals = closedWithPnl(trades).map(x => x.net).filter(v => v < 0);
  return vals.length ? vals.reduce((m, v) => (v < m ? v : m), vals[0]) : null;
}

/**
 * حداکثر drawdown — از قله تا کف.
 *
 * - `absolute`: بیشترین افت از قله (به واحد پول).
 * - `percentage`: همان افت نسبت به «قلهٔ همان لحظه» (نه قلهٔ پایان دوره)،
 *   و فقط وقتی پایه‌ی مثبت برای سرمایه وجود داشته باشد.
 *
 * @param initialEquity موجودی اولیه حساب (پیش‌فرض ۰ = فقط منحنی تجمعی سود)
 */
export function computeMaxDrawdown(
  trades: Trade[],
  initialEquity = 0,
): { absolute: number; percentage: number | null } {
  let equity = initialEquity;
  let peak = initialEquity;
  let maxDD = 0;
  let maxDDPct: number | null = null;

  for (const { net } of closedWithPnl(trades)) {
    equity += net;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    if (dd > 0 && peak > 0) {
      const ddPct = (dd / peak) * 100;
      if (maxDDPct === null || ddPct > maxDDPct) maxDDPct = ddPct;
    }
  }

  return { absolute: maxDD, percentage: maxDDPct };
}

/** نسبت میانگین سود به میانگین ضرر (Avg Win / Avg Loss) */
export function computeRiskRewardRatio(trades: Trade[]): number | null {
  const nets = closedWithPnl(trades).map(x => x.net);
  const wins = nets.filter(v => v > 0);
  const losses = nets.filter(v => v < 0);

  if (!wins.length || !losses.length) return null;

  const avgWin = wins.reduce((s, v) => s + v, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length);

  return avgLoss > 0 ? avgWin / avgLoss : null;
}
