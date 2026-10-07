/**
 * expectancy.ts — محاسبه Expectancy
 * PART 5 / Prompt 3 — Core Metrics Service
 *
 * Expectancy = میانگین نتیجهٔ هر معامله (برحسب R یا پول).
 * این معادل (WinRate × AvgWin) + (LossRate × AvgLoss) است، با این تفاوت که
 * فقط روی معاملاتی محاسبه می‌شود که مقدار معتبر دارند؛ پس نبودِ R در بعضی
 * معاملات، نرخ‌ها را به‌اشتباه با مخرج متفاوت ترکیب نمی‌کند.
 * نتیجه مثبت یعنی سیستم سودده است.
 */

import type { Trade } from '../../db/database';
import { isClosed, isWin, isLoss, getNetPnl, getResolvedR, avg } from '../../lib/tradeHelpers';

export interface ExpectancyResult {
  expectancy: number | null;        // بر حسب R (میانگین R همهٔ معاملات دارای R)
  expectancyPnl: number | null;     // بر حسب مقدار مالی خالص
  avgWinR: number | null;
  avgLossR: number | null;          // منفی
  avgWinPnl: number | null;
  avgLossPnl: number | null;        // منفی
  winRate: number | null;
  lossRate: number | null;
  sampleSize: number;               // تعداد معاملات بسته
  rSampleSize: number;              // تعداد معاملات دارای R معتبر
  pnlSampleSize: number;            // تعداد معاملات دارای سود/زیان معتبر
}

/** محاسبه Expectancy */
export function computeExpectancy(trades: Trade[]): ExpectancyResult {
  const closed = trades.filter(isClosed);
  const n = closed.length;

  const winRate = n > 0 ? closed.filter(isWin).length / n : null;
  const lossRate = n > 0 ? closed.filter(isLoss).length / n : null;

  // R-based
  const rs = closed
    .map(t => ({ t, r: getResolvedR(t) }))
    .filter((x): x is { t: Trade; r: number } => x.r !== null);
  const winRs = rs.filter(x => x.r > 0).map(x => x.r);
  const lossRs = rs.filter(x => x.r < 0).map(x => x.r);
  const avgWinR = avg(winRs);
  const avgLossR = avg(lossRs);
  const expectancy = rs.length ? avg(rs.map(x => x.r)) : null;

  // PnL-based
  const pnls = closed
    .map(getNetPnl)
    .filter((v): v is number => v !== null);
  const winPnls = pnls.filter(v => v > 0);
  const lossPnls = pnls.filter(v => v < 0);
  const avgWinPnl = avg(winPnls);
  const avgLossPnl = avg(lossPnls);
  const expectancyPnl = pnls.length ? avg(pnls) : null;

  return {
    expectancy,
    expectancyPnl,
    avgWinR,
    avgLossR,
    avgWinPnl,
    avgLossPnl,
    winRate,
    lossRate,
    sampleSize: n,
    rSampleSize: rs.length,
    pnlSampleSize: pnls.length,
  };
}
