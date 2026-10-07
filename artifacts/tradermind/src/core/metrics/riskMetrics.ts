/**
 * riskMetrics.ts — محاسبات ریسک
 * PART 5 / Prompt 3 — Core Metrics Service
 */

import type { Trade } from '../../db/database';
import { isClosed, getResolvedR, avg, median, stdDev } from '../../lib/tradeHelpers';

export interface RiskMetricsResult {
  avgR: number | null;
  medianR: number | null;
  stdDevR: number | null;
  avgRiskPct: number | null;
  riskConsistency: number | null;   // CV٪ = stdDev/mean×۱۰۰ (کمتر = بهتر)
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  kellyPct: number | null;          // Kelly Criterion (٪)
  rMultipleDistribution: { r: string; count: number }[];
}

/** گرد کردن به نزدیک‌ترین ۰.۵ به‌صورت متقارن (بدون «-0.0» و بدون تفاوت بین مثبت و منفی) */
export function roundToHalf(r: number): number {
  const rounded = (Math.sign(r) * Math.round(Math.abs(r) * 2)) / 2;
  return rounded === 0 ? 0 : rounded;
}

/** انحراف معیار رو به پایین (Downside Deviation) حول هدف صفر، روی همهٔ مشاهدات */
export function downsideDeviation(values: number[], target = 0): number | null {
  if (!values.length) return null;
  const sumSq = values.reduce((s, v) => s + (v < target ? (v - target) ** 2 : 0), 0);
  return Math.sqrt(sumSq / values.length);
}

/**
 * Kelly = W − (1−W)/B
 *  W = نرخ برد (معاملات سربه‌سر از نمونه حذف می‌شوند)
 *  B = میانگین R سودها ÷ میانگین قدرمطلق R زیان‌ها
 */
export function kellyFraction(rs: number[]): number | null {
  const wins = rs.filter(r => r > 0);
  const losses = rs.filter(r => r < 0);
  if (!wins.length || !losses.length) return null;
  const w = wins.length / (wins.length + losses.length);
  const avgWin = avg(wins)!;
  const avgLoss = Math.abs(avg(losses)!);
  if (avgLoss <= 0) return null;
  const b = avgWin / avgLoss;
  return w - (1 - w) / b;
}

export function computeRiskMetrics(trades: Trade[]): RiskMetricsResult {
  const closed = trades.filter(isClosed);
  const Rs = closed.map(getResolvedR).filter((r): r is number => r !== null);
  const risks = closed
    .filter(t => typeof t.riskPercentage === 'number' && Number.isFinite(t.riskPercentage))
    .map(t => t.riskPercentage as number);

  const avgRVal = avg(Rs);
  const stdDevR = stdDev(Rs);
  const avgRiskPct = avg(risks);
  const riskSd = stdDev(risks);

  // Risk Consistency (CV) — صفر یعنی ریسک دقیقاً ثابت بوده است
  const riskConsistency = avgRiskPct !== null && avgRiskPct > 0 && riskSd !== null
    ? (riskSd / avgRiskPct) * 100
    : null;

  // Sharpe Ratio (ساده‌شده در سطح معامله: میانگین R ÷ انحراف معیار R)
  const sharpeRatio = avgRVal !== null && stdDevR !== null && stdDevR > 0
    ? avgRVal / stdDevR
    : null;

  // Sortino Ratio (انحراف رو به پایین حول صفر روی همهٔ معاملات)
  const dd = downsideDeviation(Rs);
  const sortinoRatio = avgRVal !== null && dd !== null && dd > 0
    ? avgRVal / dd
    : null;

  // Kelly Criterion
  const kelly = kellyFraction(Rs);
  const kellyPct = kelly !== null ? kelly * 100 : null;

  // توزیع R-Multiple در bucket‌های ۰.۵
  const buckets = new Map<string, number>();
  for (const r of Rs) {
    const bucket = roundToHalf(r).toFixed(1);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const rMultipleDistribution = [...buckets.entries()]
    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
    .map(([r, count]) => ({ r, count }));

  return {
    avgR: avgRVal,
    medianR: median(Rs),
    stdDevR,
    avgRiskPct,
    riskConsistency,
    sharpeRatio,
    sortinoRatio,
    kellyPct,
    rMultipleDistribution,
  };
}
