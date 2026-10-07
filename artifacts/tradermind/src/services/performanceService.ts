/**
 * performanceService.ts — Offline Personal Trading Performance & Behavioral Analytics Engine
 * Prompt 25 — Pure calculation functions, no DB access, completely offline.
 */
import { Trade, PostTradeReviewData } from '../db/database';
import { avg, median, stdDev, toDateStr, isWin, isLoss, isBreakEven, isClosed, getPTR, flagCount, getNetPnl, getResolvedR, getCloseTime } from '../lib/tradeHelpers';
import { computeProfitFactor } from '../core/metrics/profitFactor';
import { getTradingDateParts, getTradingMonthKey } from '../lib/tradingTime';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function weekKey(ts: number): string {
  // هفتهٔ ISO-8601 (سال-هفته)؛ نسخهٔ قبلی «هفتهٔ ماه» می‌داد و هفته‌های ماه‌های مختلف را در هم می‌ریخت
  const p = getTradingDateParts(ts);
  const d = new Date(Date.UTC(p.year, p.month, p.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // پنجشنبهٔ همان هفته
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function monthKey(ts: number): string {
  return getTradingMonthKey(ts);
}
function getR(t: Trade): number | null { return getResolvedR(t); }

function dateRange(trades: Trade[]): string {
  if (!trades.length) return '—';
  const sorted = [...trades].sort((a, b) => a.openedAt - b.openedAt);
  const from = toDateStr(sorted[0].openedAt);
  const to = toDateStr(sorted[sorted.length - 1].openedAt);
  return from === to ? from : `${from} → ${to}`;
}

// ─────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────
export interface BaseMetrics {
  count: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  winRate: number | null;
  avgR: number | null;
  medianR: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  maxWin: number | null;
  maxLoss: number | null;
  totalPnL: number | null;
  sampleWarning: boolean;
}

export function calcBaseMetrics(trades: Trade[]): BaseMetrics {
  const closed = trades.filter(isClosed);
  const wins = closed.filter(isWin);
  const losses = closed.filter(isLoss);
  const breakEvens = closed.filter(isBreakEven);
  const Rs = closed.filter(t => getR(t) !== null).map(t => getR(t)!);
  const winRs = wins.filter(t => getR(t) !== null).map(t => getR(t)!);
  const lossRs = losses.filter(t => getR(t) !== null).map(t => getR(t)!);
  const winRate = closed.length > 0 ? wins.length / closed.length : null;
  const avgWin = avg(winRs);
  const avgLoss = avg(lossRs);
  // Expectancy = میانگین R همهٔ معاملات دارای R (سربه‌سرها صفر‌اند و در مخرج می‌مانند)
  const expectancy = Rs.length ? avg(Rs) : null;
  const nets = closed.map(getNetPnl).filter((v): v is number => v !== null);
  return {
    count: closed.length, winCount: wins.length, lossCount: losses.length, breakEvenCount: breakEvens.length,
    winRate, avgR: avg(Rs), medianR: median(Rs), expectancy,
    profitFactor: computeProfitFactor(closed).profitFactor,
    avgWin, avgLoss,
    maxWin: winRs.length ? Math.max(...winRs) : null,
    maxLoss: lossRs.length ? Math.min(...lossRs) : null,
    totalPnL: nets.reduce((s, v) => s + v, 0),
    sampleWarning: closed.length < 20,
  };
}

// ─────────────────────────────────────────────────────────────────
// 1. Personal Performance Profile
// ─────────────────────────────────────────────────────────────────
export interface PerformanceProfile extends BaseMetrics {
  avgRisk: number | null;
  riskConsistency: number | null; // CV = stdDev/mean
  maxDrawdownPct: number | null;
  tradeFrequency: number | null;  // trades/week
  dateRange: string;
  holdingTimeAvgMin: number | null;
  completedReviews: number;
  reviewRate: number | null;
}

export function getPerformanceProfile(trades: Trade[]): PerformanceProfile {
  const base = calcBaseMetrics(trades);
  const closed = trades.filter(isClosed);
  const risks = closed.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
  const cv = risks.length >= 2 && (avg(risks) ?? 0) > 0 ? (stdDev(risks)! / avg(risks)!) : null;
  const holdings = closed.filter(t => t.closedAt !== null && t.closedAt >= t.openedAt).map(t => (t.closedAt! - t.openedAt) / 60000);
  const withReview = trades.filter(t => { try { const r = JSON.parse(t.postTradeReview) as PostTradeReviewData; return r.completedAt > 0; } catch { return false; } });
  let maxDD = 0, peak = 0, equity = 0;
  [...closed].sort((a, b) => getCloseTime(a) - getCloseTime(b)).forEach(t => {
    equity += (getR(t) ?? 0);
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  });
  // trades per week
  let freq: number | null = null;
  if (closed.length >= 2) {
    const opened = closed.map(t => t.openedAt);
    const span = (Math.max(...opened) - Math.min(...opened)) / (7 * 86400000);
    freq = span > 0 ? closed.length / span : null;
  }
  return {
    ...base, avgRisk: avg(risks), riskConsistency: cv,
    maxDrawdownPct: maxDD > 0 ? maxDD * 100 : null,
    tradeFrequency: freq, dateRange: dateRange(trades),
    holdingTimeAvgMin: avg(holdings),
    completedReviews: withReview.length,
    reviewRate: trades.length > 0 ? withReview.length / trades.length : null,
  };
}

// ─────────────────────────────────────────────────────────────────
// 2. Performance By Day of Week
// ─────────────────────────────────────────────────────────────────
export interface DayPerf extends BaseMetrics {
  dayNum: number;  // 0=Mon..4=Fri (local UTC day)
  dayName: string;
}

const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export function getByDay(trades: Trade[]): DayPerf[] {
  const byDay = new Map<number, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const d = getTradingDateParts(t.openedAt).dayOfWeek;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(t);
  });
  return [0, 1, 2, 3, 4, 5, 6].filter(d => byDay.has(d)).map(d => ({
    ...calcBaseMetrics(byDay.get(d)!), dayNum: d, dayName: DAY_NAMES[d],
  })).sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────
// 3. Performance By Hour of Day
// ─────────────────────────────────────────────────────────────────
export interface HourPerf extends BaseMetrics { hour: number; label: string; }

export function getByHour(trades: Trade[]): HourPerf[] {
  const byHour = new Map<number, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const h = getTradingDateParts(t.openedAt).hour;
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h)!.push(t);
  });
  return [...byHour.entries()].map(([h, ts]) => ({
    ...calcBaseMetrics(ts), hour: h,
    label: `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`,
  })).sort((a, b) => a.hour - b.hour);
}

// ─────────────────────────────────────────────────────────────────
// 4. Performance By Session
// ─────────────────────────────────────────────────────────────────
export interface SessionPerf extends BaseMetrics {
  session: string;
  label: string;
  topSetup: string | null;
}

const SESSION_LABELS: Record<string, string> = {
  'london': 'لندن', 'new-york': 'نیویورک', 'asia': 'آسیا',
  'overlap': 'اوورلپ', 'other': 'سایر',
};

export function getBySession(trades: Trade[]): SessionPerf[] {
  const bySession = new Map<string, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const s = t.tradingSession || 'other';
    if (!bySession.has(s)) bySession.set(s, []);
    bySession.get(s)!.push(t);
  });
  return [...bySession.entries()].map(([session, ts]) => {
    const setupCounts = new Map<string, number>();
    ts.forEach(t => { if (t.setupType) setupCounts.set(t.setupType, (setupCounts.get(t.setupType) ?? 0) + 1); });
    const topSetup = [...setupCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { ...calcBaseMetrics(ts), session, label: SESSION_LABELS[session] ?? session, topSetup };
  }).sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────
// 5. Performance By Symbol
// ─────────────────────────────────────────────────────────────────
export interface SymbolPerf extends BaseMetrics {
  symbol: string;
  bestSetup: string | null;
  worstSetup: string | null;
  bestSession: string | null;
}

export function getBySymbol(trades: Trade[]): SymbolPerf[] {
  const bySymbol = new Map<string, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, []);
    bySymbol.get(t.symbol)!.push(t);
  });
  return [...bySymbol.entries()].map(([symbol, ts]) => {
    const setupR = new Map<string, number[]>();
    const sessionR = new Map<string, number[]>();
    ts.forEach(t => {
      if (t.setupType && getR(t) !== null) {
        if (!setupR.has(t.setupType)) setupR.set(t.setupType, []);
        setupR.get(t.setupType)!.push(getR(t)!);
      }
      if (t.tradingSession && getR(t) !== null) {
        if (!sessionR.has(t.tradingSession)) sessionR.set(t.tradingSession, []);
        sessionR.get(t.tradingSession)!.push(getR(t)!);
      }
    });
    const setupAvgs = [...setupR.entries()].map(([s, rs]) => [s, avg(rs)!] as [string, number]).sort((a, b) => b[1] - a[1]);
    const sessionAvgs = [...sessionR.entries()].map(([s, rs]) => [s, avg(rs)!] as [string, number]).sort((a, b) => b[1] - a[1]);
    return {
      ...calcBaseMetrics(ts), symbol,
      bestSetup: setupAvgs[0]?.[0] ?? null,
      worstSetup: setupAvgs[setupAvgs.length - 1]?.[0] ?? null,
      bestSession: sessionAvgs[0]?.[0] ?? null,
    };
  }).sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────
// 6. Performance By Setup
// ─────────────────────────────────────────────────────────────────
export interface SetupPerf extends BaseMetrics {
  setup: string;
  label: string;
  topSession: string | null;
}

export function getBySetup(trades: Trade[]): SetupPerf[] {
  const bySetup = new Map<string, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const s = t.setupType || 'custom';
    if (!bySetup.has(s)) bySetup.set(s, []);
    bySetup.get(s)!.push(t);
  });
  return [...bySetup.entries()].map(([setup, ts]) => {
    const sessionR = new Map<string, number[]>();
    ts.forEach(t => {
      if (t.tradingSession && getR(t) !== null) {
        if (!sessionR.has(t.tradingSession)) sessionR.set(t.tradingSession, []);
        sessionR.get(t.tradingSession)!.push(getR(t)!);
      }
    });
    const topSession = [...sessionR.entries()]
      .map(([s, rs]) => [s, avg(rs)!] as [string, number])
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { ...calcBaseMetrics(ts), setup, label: setup, topSession };
  }).sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────────────
// 7. Multi-Dimensional Combos
// ─────────────────────────────────────────────────────────────────
export interface ComboPerf extends BaseMetrics {
  key: string;
  label: string;
  dim1: string;
  dim2: string;
}

export function getBestCombos(trades: Trade[], minSample = 3): ComboPerf[] {
  const combos = new Map<string, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const pairs: [string, string][] = [
      [t.symbol || '?', t.setupType || '?'],
      [t.symbol || '?', t.tradingSession || '?'],
      [t.setupType || '?', t.tradingSession || '?'],
    ];
    pairs.forEach(([d1, d2]) => {
      const key = `${d1}|${d2}`;
      if (!combos.has(key)) combos.set(key, []);
      combos.get(key)!.push(t);
    });
  });
  return [...combos.entries()]
    .filter(([, ts]) => ts.length >= minSample)
    .map(([key, ts]) => {
      const [d1, d2] = key.split('|');
      return { ...calcBaseMetrics(ts), key, label: `${d1} + ${SESSION_LABELS[d2] ?? d2}`, dim1: d1, dim2: d2 };
    })
    .filter(c => c.avgR !== null)
    .sort((a, b) => (b.avgR ?? -99) - (a.avgR ?? -99))
    .slice(0, 15);
}

// ─────────────────────────────────────────────────────────────────
// 8. Process Quality Score
// ─────────────────────────────────────────────────────────────────
export interface ProcessComponent { label: string; score: number; max: number; description: string; }
export interface ProcessQuality {
  total: number; grade: string;
  components: ProcessComponent[];
  sampleWarning: boolean;
  reviewedCount: number;
}

export function getProcessQuality(trades: Trade[]): ProcessQuality {
  const closed = trades.filter(isClosed);
  const reviewed = closed.filter(t => { try { const r = getPTR(t); return r && r.completedAt > 0; } catch { return false; } });
  if (reviewed.length === 0) {
    return { total: 0, grade: 'N/A', components: [], sampleWarning: true, reviewedCount: 0 };
  }
  const ptrs = reviewed.map(t => getPTR(t)!);
  const n = ptrs.length;

  const planFollowed = ptrs.filter(r => r.entryFollowedPlan === true).length;
  const withConfirmation = ptrs.filter(r => r.enteredWithConfirmation === true).length;
  const slRespected = ptrs.filter(r => r.slRespected === true).length;
  const riskIncreased = ptrs.filter(r => r.riskIncreased === true).length;
  const closedEarly = ptrs.filter(r => r.closedEarly === true).length;
  const htfOk = ptrs.filter(r => r.htfAnalysisCorrect === true).length;
  const avgTradeQ = avg(ptrs.filter(r => r.tradeQualityScore !== null).map(r => r.tradeQualityScore!));
  const avgExecQ = avg(ptrs.filter(r => r.executionQualityScore !== null).map(r => r.executionQualityScore!));
  const avgRiskQ = avg(ptrs.filter(r => r.riskMgmtQualityScore !== null).map(r => r.riskMgmtQualityScore!));

  const components: ProcessComponent[] = [
    {
      label: 'پیروی از پلن ورود', max: 100,
      score: n > 0 ? Math.round(planFollowed / n * 100) : 0,
      description: `${planFollowed} از ${n} معامله طبق پلن وارد شد`,
    },
    {
      label: 'ورود با تأیید', max: 100,
      score: n > 0 ? Math.round(withConfirmation / n * 100) : 0,
      description: `${withConfirmation} از ${n} معامله با تأیید وارد شد`,
    },
    {
      label: 'احترام به حد ضرر', max: 100,
      score: n > 0 ? Math.round(slRespected / n * 100) : 0,
      description: `${slRespected} از ${n} معامله حد ضرر رعایت شد`,
    },
    {
      label: 'کنترل ریسک', max: 100,
      score: n > 0 ? Math.round((1 - riskIncreased / n) * 100) : 0,
      description: `${riskIncreased} معامله با افزایش ریسک ناخواسته`,
    },
    {
      label: 'تحلیل چارچوب بالاتر', max: 100,
      score: n > 0 ? Math.round(htfOk / n * 100) : 0,
      description: `${htfOk} از ${n} تحلیل HTF درست بود`,
    },
    {
      label: 'کیفیت اجرا (میانگین)', max: 100,
      score: avgExecQ !== null ? Math.round((avgExecQ / 5) * 100) : 0,
      description: `امتیاز میانگین اجرا: ${avgExecQ?.toFixed(1) ?? '—'}/5`,
    },
    {
      label: 'کیفیت مدیریت ریسک', max: 100,
      score: avgRiskQ !== null ? Math.round((avgRiskQ / 5) * 100) : 0,
      description: `امتیاز میانگین مدیریت: ${avgRiskQ?.toFixed(1) ?? '—'}/5`,
    },
    {
      label: 'کیفیت کلی معامله', max: 100,
      score: avgTradeQ !== null ? Math.round((avgTradeQ / 5) * 100) : 0,
      description: `امتیاز میانگین کیفیت: ${avgTradeQ?.toFixed(1) ?? '—'}/5`,
    },
  ];

  const total = Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';
  return { total, grade, components, sampleWarning: reviewed.length < 10, reviewedCount: reviewed.length };
}

// ─────────────────────────────────────────────────────────────────
// 9. Behavior Pattern Detection
// ─────────────────────────────────────────────────────────────────
export interface BehaviorPattern {
  id: string; type: 'mistake' | 'strength'; title: string; description: string;
  count: number; pct: number; avgOutcome: number | null;
  severity: 'high' | 'medium' | 'low';
}

export function detectMistakes(trades: Trade[]): BehaviorPattern[] {
  const closed = trades.filter(isClosed);
  if (closed.length < 5) return [];
  const n = closed.length;
  const patterns: BehaviorPattern[] = [];

  // SL moved against position
  const slMoved = closed.filter(t => t.slMoved === true);
  if (slMoved.length > 0) patterns.push({
    id: 'sl-moved', type: 'mistake', title: 'جابجایی حد ضرر',
    description: `در ${slMoved.length} معامله (${Math.round(slMoved.length/n*100)}%) حد ضرر جابجا شد`,
    count: slMoved.length, pct: slMoved.length / n,
    avgOutcome: avg(slMoved.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: slMoved.length / n > 0.2 ? 'high' : slMoved.length / n > 0.1 ? 'medium' : 'low',
  });

  // Early exit
  const earlyExit = closed.filter(t => { try { return getPTR(t)?.closedEarly === true; } catch { return false; } });
  if (earlyExit.length > 0) patterns.push({
    id: 'early-exit', type: 'mistake', title: 'خروج زود هنگام',
    description: `در ${earlyExit.length} معامله قبل از رسیدن به تارگت بسته شد`,
    count: earlyExit.length, pct: earlyExit.length / n,
    avgOutcome: avg(earlyExit.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: earlyExit.length / n > 0.25 ? 'high' : earlyExit.length / n > 0.12 ? 'medium' : 'low',
  });

  // Risk increased during trade
  const riskUp = closed.filter(t => { try { return getPTR(t)?.riskIncreased === true; } catch { return false; } });
  if (riskUp.length > 0) patterns.push({
    id: 'risk-increased', type: 'mistake', title: 'افزایش ریسک در حین معامله',
    description: `${riskUp.length} معامله با افزایش ریسک ناخواسته`,
    count: riskUp.length, pct: riskUp.length / n,
    avgOutcome: avg(riskUp.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: riskUp.length / n > 0.15 ? 'high' : 'medium',
  });

  // No confirmation entry
  const noConfirm = closed.filter(t => { try { return getPTR(t)?.enteredWithConfirmation === false; } catch { return false; } });
  if (noConfirm.length > 0) patterns.push({
    id: 'no-confirm', type: 'mistake', title: 'ورود بدون تأیید',
    description: `${noConfirm.length} معامله بدون تأیید وارد شد`,
    count: noConfirm.length, pct: noConfirm.length / n,
    avgOutcome: avg(noConfirm.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: noConfirm.length / n > 0.2 ? 'high' : 'medium',
  });

  // FOMO flags
  const fomo = flagCount(closed, 'fomo');
  if (fomo > 0) patterns.push({
    id: 'fomo', type: 'mistake', title: 'ترس از دست دادن (FOMO)',
    description: `${fomo} معامله با پرچم FOMO ثبت شده`,
    count: fomo, pct: fomo / n,
    avgOutcome: null, severity: fomo / n > 0.15 ? 'high' : 'medium',
  });

  // Revenge trading
  const revenge = flagCount(closed, 'revenge-trading');
  if (revenge > 0) patterns.push({
    id: 'revenge', type: 'mistake', title: 'معامله انتقامی',
    description: `${revenge} معامله با پرچم انتقام`,
    count: revenge, pct: revenge / n,
    avgOutcome: null, severity: 'high',
  });

  // Low adherence
  const poor = closed.filter(t => t.adherenceRating === 'not' || t.adherenceRating === 'partially');
  if (poor.length > 0) patterns.push({
    id: 'low-adherence', type: 'mistake', title: 'عدم پیروی از قوانین',
    description: `${poor.length} معامله با رعایت پایین یا عدم رعایت قوانین`,
    count: poor.length, pct: poor.length / n,
    avgOutcome: avg(poor.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: poor.length / n > 0.3 ? 'high' : poor.length / n > 0.15 ? 'medium' : 'low',
  });

  return patterns.sort((a, b) => b.count - a.count);
}

export function detectStrengths(trades: Trade[]): BehaviorPattern[] {
  const closed = trades.filter(isClosed);
  if (closed.length < 5) return [];
  const n = closed.length;
  const strengths: BehaviorPattern[] = [];

  // High adherence
  const fullAdherence = closed.filter(t => t.adherenceRating === 'fully' || t.adherenceRating === 'mostly');
  if (fullAdherence.length > 0) strengths.push({
    id: 'high-adherence', type: 'strength', title: 'پیروی مداوم از قوانین',
    description: `${fullAdherence.length} معامله (${Math.round(fullAdherence.length/n*100)}%) با رعایت کامل یا بیشتر قوانین`,
    count: fullAdherence.length, pct: fullAdherence.length / n,
    avgOutcome: avg(fullAdherence.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: fullAdherence.length / n > 0.7 ? 'high' : 'medium',
  });

  // Confirmation discipline
  const withConfirm = closed.filter(t => { try { return getPTR(t)?.enteredWithConfirmation === true; } catch { return false; } });
  if (withConfirm.length > 0) strengths.push({
    id: 'confirmation-discipline', type: 'strength', title: 'انضباط در تأیید ورود',
    description: `${withConfirm.length} معامله با تأیید کامل وارد شده`,
    count: withConfirm.length, pct: withConfirm.length / n,
    avgOutcome: avg(withConfirm.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: withConfirm.length / n > 0.6 ? 'high' : 'medium',
  });

  // SL respected
  const slRespected = closed.filter(t => { try { return getPTR(t)?.slRespected === true; } catch { return false; } });
  if (slRespected.length > 0) strengths.push({
    id: 'sl-discipline', type: 'strength', title: 'احترام به حد ضرر',
    description: `${slRespected.length} معامله با رعایت دقیق حد ضرر`,
    count: slRespected.length, pct: slRespected.length / n,
    avgOutcome: null, severity: slRespected.length / n > 0.75 ? 'high' : 'medium',
  });

  // Review completion
  const reviewed = closed.filter(t => { try { const r = getPTR(t); return r && r.completedAt > 0; } catch { return false; } });
  if (reviewed.length > 0 && reviewed.length / n > 0.5) strengths.push({
    id: 'review-discipline', type: 'strength', title: 'عادت ریویو پس از معامله',
    description: `${reviewed.length} از ${n} معامله ریویو کامل دارد`,
    count: reviewed.length, pct: reviewed.length / n,
    avgOutcome: null, severity: reviewed.length / n > 0.8 ? 'high' : 'medium',
  });

  // HTF analysis
  const htfGood = closed.filter(t => { try { return getPTR(t)?.htfAnalysisCorrect === true; } catch { return false; } });
  if (htfGood.length > 0) strengths.push({
    id: 'htf-analysis', type: 'strength', title: 'تحلیل چارچوب بالاتر دقیق',
    description: `${htfGood.length} معامله با تحلیل صحیح HTF`,
    count: htfGood.length, pct: htfGood.length / n,
    avgOutcome: avg(htfGood.filter(t => getR(t) !== null).map(t => getR(t)!)),
    severity: 'medium',
  });

  return strengths.sort((a, b) => b.pct - a.pct);
}

// ─────────────────────────────────────────────────────────────────
// 10. Overtrading Analysis
// ─────────────────────────────────────────────────────────────────
export interface OvertradingDay {
  date: string; count: number; avgR: number | null; winRate: number | null;
}
export interface OvertradingAnalysis {
  avgTradesPerDay: number; maxTradesInDay: number;
  daysOverThreshold: number; overtradingDays: OvertradingDay[];
  threshold: number; tradingDays: number;
}

export function getOvertradingAnalysis(trades: Trade[], threshold = 3): OvertradingAnalysis {
  const byDate = new Map<string, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const d = toDateStr(t.openedAt);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(t);
  });
  const days = [...byDate.entries()];
  const over = days.filter(([, ts]) => ts.length > threshold).map(([date, ts]) => ({
    date, count: ts.length,
    avgR: avg(ts.filter(t => getR(t) !== null).map(t => getR(t)!)),
    winRate: ts.length > 0 ? ts.filter(isWin).length / ts.length : null,
  })).sort((a, b) => b.count - a.count);
  return {
    avgTradesPerDay: days.length > 0 ? days.reduce((s, [, ts]) => s + ts.length, 0) / days.length : 0,
    maxTradesInDay: days.reduce((m, [, ts]) => Math.max(m, ts.length), 0),
    daysOverThreshold: over.length, overtradingDays: over, threshold, tradingDays: days.length,
  };
}

// ─────────────────────────────────────────────────────────────────
// 11. Trading Style Profile
// ─────────────────────────────────────────────────────────────────
export interface TradingStyleProfile {
  avgHoldingMinutes: number | null;
  medianHoldingMinutes: number | null;
  topSetup: string | null;
  topSession: string | null;
  topSymbol: string | null;
  avgRisk: number | null;
  tradeFrequency: string;
  managementStyle: string;
  description: string;
}

export function getTradingStyle(trades: Trade[]): TradingStyleProfile {
  const closed = trades.filter(isClosed);
  const holdings = closed.filter(t => t.closedAt).map(t => (t.closedAt! - t.openedAt) / 60000);
  const setupCounts = new Map<string, number>();
  const sessionCounts = new Map<string, number>();
  const symbolCounts = new Map<string, number>();
  closed.forEach(t => {
    if (t.setupType) setupCounts.set(t.setupType, (setupCounts.get(t.setupType) ?? 0) + 1);
    if (t.tradingSession) sessionCounts.set(t.tradingSession, (sessionCounts.get(t.tradingSession) ?? 0) + 1);
    symbolCounts.set(t.symbol, (symbolCounts.get(t.symbol) ?? 0) + 1);
  });
  const topSetup = [...setupCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topSession = [...sessionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topSymbol = [...symbolCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const avgH = avg(holdings);
  const medH = median(holdings);
  const risks = closed.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
  const slMovedCount = closed.filter(t => t.slMoved).length;
  const partialCount = closed.filter(t => t.partialClose).length;
  const earlyExits = closed.filter(t => { try { return getPTR(t)?.closedEarly === true; } catch { return false; } }).length;
  const managementStyle = partialCount / (closed.length || 1) > 0.3 ? 'مدیریت فعال (خروج بخشی)'
    : slMovedCount / (closed.length || 1) > 0.2 ? 'مدیریت دقیق حد ضرر'
    : earlyExits / (closed.length || 1) > 0.25 ? 'تمایل به خروج زودهنگام'
    : 'مدیریت ثابت';
  const byDate = new Map<string, boolean>();
  closed.forEach(t => byDate.set(toDateStr(t.openedAt), true));
  const tradeFrequency = byDate.size === 0 ? 'نامشخص'
    : closed.length / byDate.size > 3 ? 'پرتکرار (بیش از ۳ در روز)'
    : closed.length / byDate.size > 1.5 ? 'متوسط (۱–۳ در روز)'
    : 'کم‌تکرار (کمتر از ۲ در روز)';
  const descParts = [];
  if (topSession) descParts.push(`سشن ترجیحی: ${SESSION_LABELS[topSession] ?? topSession}`);
  if (topSetup) descParts.push(`سبک ترجیحی: ${topSetup}`);
  if (topSymbol) descParts.push(`نماد اصلی: ${topSymbol}`);
  if (avgH !== null) descParts.push(`میانگین نگهداری: ${avgH < 60 ? `${avgH.toFixed(0)} دقیقه` : `${(avgH / 60).toFixed(1)} ساعت`}`);
  return {
    avgHoldingMinutes: avgH, medianHoldingMinutes: medH,
    topSetup, topSession, topSymbol, avgRisk: avg(risks),
    tradeFrequency, managementStyle, description: descParts.join(' | ') || 'داده کافی برای پروفایل وجود ندارد',
  };
}

// ─────────────────────────────────────────────────────────────────
// 12. Performance Evolution
// ─────────────────────────────────────────────────────────────────
export interface PeriodPerf extends BaseMetrics {
  periodKey: string; periodLabel: string;
}

export function getEvolution(trades: Trade[], granularity: 'week' | 'month' | 'quarter' = 'month'): PeriodPerf[] {
  const byPeriod = new Map<string, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const key = granularity === 'week' ? weekKey(t.openedAt) : monthKey(t.openedAt);
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key)!.push(t);
  });
  return [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, ts]) => ({
    ...calcBaseMetrics(ts), periodKey: key, periodLabel: key,
  }));
}

// ─────────────────────────────────────────────────────────────────
// 13. Performance Scorecard
// ─────────────────────────────────────────────────────────────────
export interface ScorecardComponent {
  label: string; score: number; description: string; details: string;
}
export interface Scorecard {
  total: number; grade: string; components: ScorecardComponent[]; sampleWarning: boolean;
}

export function getScorecard(trades: Trade[]): Scorecard {
  const closed = trades.filter(isClosed);
  const base = calcBaseMetrics(trades);
  const pq = getProcessQuality(trades);
  const mistakes = detectMistakes(trades);
  const strengths = detectStrengths(trades);
  const risks = closed.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!);
  const cv = risks.length >= 2 && (avg(risks) ?? 0) > 0 ? (stdDev(risks)! / avg(risks)!) : null;

  // Financial performance: expectancy + win rate + R
  const finScore = (() => {
    let s = 50;
    if (base.winRate !== null) s += (base.winRate - 0.4) * 50;
    if (base.expectancy !== null) s += Math.min(20, base.expectancy * 20);
    if (base.avgR !== null) s += Math.min(10, base.avgR * 10);
    return Math.max(0, Math.min(100, s));
  })();

  // Risk management: consistency
  const riskScore = cv !== null
    ? Math.max(0, Math.min(100, 100 - cv * 60))
    : 50;

  // Process discipline: from process quality
  const processScore = pq.total > 0 ? pq.total : 50;

  // Rule adherence: from adherence ratings
  const with_rating = closed.filter(t => t.adherenceRating !== null);
  const adherenceScore = with_rating.length > 0
    ? with_rating.reduce((s, t) => s + ({'fully': 100, 'mostly': 75, 'partially': 40, 'not': 0}[t.adherenceRating!] ?? 50), 0) / with_rating.length
    : 50;

  // Behavior: fewer mistakes = better
  const totalMistakePct = mistakes.reduce((s, m) => s + m.pct, 0);
  const behaviorScore = Math.max(0, Math.min(100, 100 - totalMistakePct * 80));

  // Learning: completed reviews + strengths detected
  const reviewRate = closed.length > 0 ? trades.filter(t => { try { const r = getPTR(t); return r && r.completedAt > 0; } catch { return false; } }).length / closed.length : 0;
  const learningScore = Math.min(100, reviewRate * 100 * 0.7 + Math.min(30, strengths.length * 10));

  const components: ScorecardComponent[] = [
    { label: 'عملکرد مالی', score: Math.round(finScore), description: 'بر اساس انتظار، نرخ برد و R میانگین', details: `نرخ برد: ${base.winRate !== null ? (base.winRate*100).toFixed(0)+'%' : '—'} | انتظار: ${base.expectancy?.toFixed(2) ?? '—'}R` },
    { label: 'مدیریت ریسک', score: Math.round(riskScore), description: 'ثبات ریسک (ضریب تغییرات)', details: cv !== null ? `CV = ${(cv*100).toFixed(0)}%` : 'داده ریسک کافی نیست' },
    { label: 'انضباط پروسه', score: Math.round(processScore), description: 'کیفیت فرآیند معامله‌گری', details: `بر اساس ${pq.reviewedCount} ریویو تکمیل‌شده` },
    { label: 'رعایت قوانین', score: Math.round(adherenceScore), description: 'امتیاز پیروی از قوانین شخصی', details: `${with_rating.length} معامله با امتیاز رعایت` },
    { label: 'رفتار معامله‌گری', score: Math.round(behaviorScore), description: 'کمتر بودن اشتباهات تکراری', details: `${mistakes.length} الگوی اشتباه شناسایی شد` },
    { label: 'پیشرفت یادگیری', score: Math.round(learningScore), description: 'ریویو، درس‌گیری و شناخت نقاط قوت', details: `نرخ ریویو: ${(reviewRate*100).toFixed(0)}%` },
  ];

  const total = Math.round(components.reduce((s, c) => s + c.score, 0) / components.length);
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';
  return { total, grade, components, sampleWarning: closed.length < 20 };
}

// ─────────────────────────────────────────────────────────────────
// 14. Coaching Insights
// ─────────────────────────────────────────────────────────────────
export interface PerfInsight {
  id: string; title: string; description: string; evidence: string;
  examples: number; confidence: 'high' | 'medium' | 'low';
  category: 'strength' | 'warning' | 'opportunity';
  dateRange: string;
}

export function getPerfInsights(trades: Trade[]): PerfInsight[] {
  const closed = trades.filter(isClosed);
  if (closed.length < 5) return [];
  const insights: PerfInsight[] = [];
  const dr = dateRange(closed);

  // Best session
  const bySession = getBySession(trades);
  if (bySession.length >= 2 && !bySession[0].sampleWarning) {
    const best = bySession[0];
    insights.push({ id: 'best-session', title: `بهترین سشن: ${best.label}`,
      description: `بیشترین معاملات شما (${best.count}) در سشن ${best.label} انجام شده با میانگین ${best.avgR?.toFixed(2) ?? '—'}R`,
      evidence: `نرخ برد ${best.winRate !== null ? (best.winRate*100).toFixed(0)+'%' : '—'}`, examples: best.count,
      confidence: best.count >= 10 ? 'high' : 'medium', category: 'strength', dateRange: dr });
  }

  // Best setup
  const bySetup = getBySetup(trades).filter(s => !s.sampleWarning && s.avgR !== null);
  if (bySetup.length >= 2) {
    const best = bySetup[0];
    insights.push({ id: 'best-setup', title: `بهترین سبک: ${best.label}`,
      description: `سبک ${best.label} با ${best.count} معامله میانگین ${best.avgR?.toFixed(2)}R دارد`,
      evidence: `نرخ برد: ${best.winRate !== null ? (best.winRate*100).toFixed(0)+'%' : '—'}`, examples: best.count,
      confidence: best.count >= 10 ? 'high' : 'medium', category: 'strength', dateRange: dr });
    if (bySetup.length > 1) {
      const worst = bySetup[bySetup.length - 1];
      if ((worst.avgR ?? 0) < 0) insights.push({ id: 'worst-setup', title: `ضعیف‌ترین سبک: ${worst.label}`,
        description: `سبک ${worst.label} میانگین ${worst.avgR?.toFixed(2)}R دارد`,
        evidence: `${worst.lossCount} از ${worst.count} معامله با ضرر`, examples: worst.count,
        confidence: worst.count >= 8 ? 'high' : 'medium', category: 'warning', dateRange: dr });
    }
  }

  // Best symbol
  const bySymbol = getBySymbol(trades).filter(s => s.count >= 5 && s.avgR !== null);
  if (bySymbol.length >= 2) {
    const best = bySymbol.sort((a, b) => (b.avgR ?? -99) - (a.avgR ?? -99))[0];
    if ((best.avgR ?? 0) > 0) insights.push({ id: 'best-symbol', title: `بهترین نماد: ${best.symbol}`,
      description: `${best.symbol} با میانگین ${best.avgR?.toFixed(2)}R بهترین عملکرد را دارد`,
      evidence: `${best.winCount} برد از ${best.count} معامله`, examples: best.count,
      confidence: best.count >= 10 ? 'high' : 'medium', category: 'strength', dateRange: dr });
  }

  // SL discipline warning
  const slMovedPct = closed.filter(t => t.slMoved).length / closed.length;
  if (slMovedPct > 0.15) insights.push({ id: 'sl-moved-warning', title: 'توجه: جابجایی مکرر حد ضرر',
    description: `در ${(slMovedPct*100).toFixed(0)}% معاملات حد ضرر جابجا شده که می‌تواند ریسک را افزایش دهد`,
    evidence: `${closed.filter(t => t.slMoved).length} معامله از ${closed.length}`, examples: closed.filter(t => t.slMoved).length,
    confidence: slMovedPct > 0.3 ? 'high' : 'medium', category: 'warning', dateRange: dr });

  // Post-win risk escalation
  const withWins = closed.filter(t => isWin(t));
  if (withWins.length >= 5) {
    const afterWinTrades = closed.filter((t, i) => i > 0 && isWin(closed[i - 1]));
    const normalAvgRisk = avg(closed.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!));
    const afterWinRisk = avg(afterWinTrades.filter(t => t.riskPercentage !== null).map(t => t.riskPercentage!));
    if (normalAvgRisk && afterWinRisk && afterWinRisk > normalAvgRisk * 1.2) {
      insights.push({ id: 'post-win-risk', title: 'افزایش ریسک پس از برد',
        description: `ریسک پس از برد (${afterWinRisk.toFixed(1)}%) بالاتر از میانگین (${normalAvgRisk.toFixed(1)}%) است`,
        evidence: `${afterWinTrades.length} معامله بررسی شد`, examples: afterWinTrades.length,
        confidence: afterWinTrades.length >= 10 ? 'high' : 'medium', category: 'warning', dateRange: dr });
    }
  }

  // Best combo
  const combos = getBestCombos(trades);
  if (combos.length > 0 && !combos[0].sampleWarning) {
    const best = combos[0];
    insights.push({ id: 'best-combo', title: `قوی‌ترین ترکیب: ${best.label}`,
      description: `ترکیب ${best.label} با میانگین ${best.avgR?.toFixed(2)}R بهترین نتیجه را دارد`,
      evidence: `${best.count} معامله`, examples: best.count,
      confidence: best.count >= 8 ? 'high' : 'medium', category: 'strength', dateRange: dr });
  }

  return insights.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────
// 15. Performance Review Data (Weekly / Monthly)
// ─────────────────────────────────────────────────────────────────
export interface ReviewPeriod {
  key: string; label: string;
  metrics: BaseMetrics; processQuality: ProcessQuality;
  mistakes: BehaviorPattern[]; strengths: BehaviorPattern[];
  topSetup: string | null; topSession: string | null;
}

export function generateReview(trades: Trade[], periodKey: string, type: 'weekly' | 'monthly'): ReviewPeriod {
  const filtered = trades.filter(t => {
    const k = type === 'weekly' ? weekKey(t.openedAt) : monthKey(t.openedAt);
    return k === periodKey;
  });
  const bySetup = getBySetup(filtered);
  const bySession = getBySession(filtered);
  return {
    key: periodKey, label: periodKey,
    metrics: calcBaseMetrics(filtered),
    processQuality: getProcessQuality(filtered),
    mistakes: detectMistakes(filtered),
    strengths: detectStrengths(filtered),
    topSetup: bySetup[0]?.setup ?? null,
    topSession: bySession[0]?.session ?? null,
  };
}

export function getReviewPeriods(trades: Trade[], type: 'weekly' | 'monthly'): string[] {
  const keys = new Set<string>();
  trades.filter(isClosed).forEach(t => keys.add(type === 'weekly' ? weekKey(t.openedAt) : monthKey(t.openedAt)));
  return [...keys].sort().reverse();
}

// ─────────────────────────────────────────────────────────────────
// 16. Decision Quality Analysis — جدا از نتیجه مالی (Section 9 of Prompt 25)
// ─────────────────────────────────────────────────────────────────
export interface DecisionQualityBucket {
  level: string; label: string;
  count: number; pct: number;
  avgR: number | null; winRate: number | null;
  sampleWarning: boolean;
}
export interface DecisionQualityAnalysis {
  buckets: DecisionQualityBucket[];
  avgScore: number | null;
  /** آیا تصمیم‌های باکیفیت‌تر نتایج بهتری دارند؟ */
  goodDecisionLift: number | null;   // avgR(good) - avgR(poor)
  luckyWinCount: number;             // بردهای شانسی (تصمیم بد، نتیجه خوب)
  goodLossCount: number;             // ضررهای با تصمیم خوب
  sampleWarning: boolean;
}

export function getDecisionQualityAnalysis(trades: Trade[]): DecisionQualityAnalysis {
  const closed = trades.filter(isClosed);
  const withPTR = closed.filter(t => {
    const ptr = getPTR(t);
    return ptr && (ptr.tradeQualityScore !== null || ptr.executionQualityScore !== null);
  });

  if (withPTR.length === 0) {
    return { buckets: [], avgScore: null, goodDecisionLift: null, luckyWinCount: 0, goodLossCount: 0, sampleWarning: true };
  }

  // Composite decision score: avg of available 1-5 quality scores → scale to 0-100
  function compositeScore(t: Trade): number | null {
    const ptr = getPTR(t);
    if (!ptr) return null;
    const scores = [ptr.tradeQualityScore, ptr.executionQualityScore, ptr.analysisQualityScore, ptr.riskMgmtQualityScore]
      .filter((s): s is number => s !== null);
    if (!scores.length) return null;
    return (scores.reduce((a, b) => a + b, 0) / scores.length / 5) * 100;
  }

  const scored = withPTR.map(t => ({ t, score: compositeScore(t) })).filter(x => x.score !== null) as { t: Trade; score: number }[];

  const BUCKETS = [
    { level: 'excellent', label: 'عالی (۸۰–۱۰۰)', min: 80 },
    { level: 'good',      label: 'خوب (۶۰–۷۹)',  min: 60 },
    { level: 'acceptable',label: 'قابل قبول (۴۰–۵۹)', min: 40 },
    { level: 'poor',      label: 'ضعیف (۲۰–۳۹)', min: 20 },
    { level: 'violation', label: 'نقض قوانین (<۲۰)', min: 0 },
  ];

  const buckets: DecisionQualityBucket[] = [];
  for (let i = 0; i < BUCKETS.length; i++) {
    const def = BUCKETS[i];
    const maxVal = i === 0 ? 100 : BUCKETS[i - 1].min;
    const ts = scored.filter(x => x.score >= def.min && x.score < maxVal).map(x => x.t);
    if (ts.length === 0) continue;
    const rs = ts.filter(t => getR(t) !== null).map(t => getR(t)!);
    buckets.push({
      level: def.level, label: def.label,
      count: ts.length, pct: ts.length / scored.length,
      avgR: avg(rs),
      winRate: ts.length > 0 ? ts.filter(isWin).length / ts.length : null,
      sampleWarning: ts.length < 5,
    });
  }

  const goodDecision = scored.filter(x => x.score >= 60).map(x => x.t);
  const poorDecision = scored.filter(x => x.score < 40).map(x => x.t);
  const goodAvgR = avg(goodDecision.filter(t => getR(t) !== null).map(t => getR(t)!));
  const poorAvgR = avg(poorDecision.filter(t => getR(t) !== null).map(t => getR(t)!));
  const lift = goodAvgR !== null && poorAvgR !== null ? goodAvgR - poorAvgR : null;

  const avgScore = avg(scored.map(x => x.score));

  // Lucky wins: low quality score but winning outcome
  const luckyWin = closed.filter(t => { const ptr = getPTR(t); return ptr?.luckyWin === true; }).length;
  // Good losses: high quality score but losing outcome
  const goodLoss = scored.filter(x => x.score >= 60 && isLoss(x.t)).length;

  return { buckets, avgScore, goodDecisionLift: lift, luckyWinCount: luckyWin, goodLossCount: goodLoss, sampleWarning: scored.length < 10 };
}

// ─────────────────────────────────────────────────────────────────
// 17. Session Discipline Analysis (Section 16 of Prompt 25)
// ─────────────────────────────────────────────────────────────────
export interface SessionDisciplineEntry {
  session: string; label: string;
  count: number; avgR: number | null; winRate: number | null;
  isPreferred: boolean; sampleWarning: boolean;
}
export interface SessionDisciplineData {
  preferredSessions: string[];
  tradesInside: number;
  tradesOutside: number;
  pctInside: number | null;
  avgRInside: number | null;
  avgROutside: number | null;
  winRateInside: number | null;
  winRateOutside: number | null;
  breakdown: SessionDisciplineEntry[];
}

export function getSessionDiscipline(trades: Trade[], preferredSessions: string[]): SessionDisciplineData {
  const closed = trades.filter(isClosed);
  const hasSession = closed.filter(t => t.tradingSession);

  const inside  = hasSession.filter(t => preferredSessions.includes(t.tradingSession!));
  const outside = hasSession.filter(t => !preferredSessions.includes(t.tradingSession!));

  const sessionMap = new Map<string, Trade[]>();
  hasSession.forEach(t => {
    const s = t.tradingSession!;
    if (!sessionMap.has(s)) sessionMap.set(s, []);
    sessionMap.get(s)!.push(t);
  });

  const breakdown: SessionDisciplineEntry[] = [...sessionMap.entries()].map(([session, ts]) => {
    const rs = ts.filter(t => getR(t) !== null).map(t => getR(t)!);
    return {
      session, label: SESSION_LABELS[session] ?? session,
      count: ts.length, avgR: avg(rs),
      winRate: ts.length > 0 ? ts.filter(isWin).length / ts.length : null,
      isPreferred: preferredSessions.includes(session),
      sampleWarning: ts.length < 5,
    };
  }).sort((a, b) => b.count - a.count);

  const insideRs  = inside.filter(t => getR(t) !== null).map(t => getR(t)!);
  const outsideRs = outside.filter(t => getR(t) !== null).map(t => getR(t)!);
  const total = inside.length + outside.length;

  return {
    preferredSessions,
    tradesInside: inside.length, tradesOutside: outside.length,
    pctInside: total > 0 ? inside.length / total : null,
    avgRInside: avg(insideRs), avgROutside: avg(outsideRs),
    winRateInside:  inside.length  > 0 ? inside.filter(isWin).length  / inside.length  : null,
    winRateOutside: outside.length > 0 ? outside.filter(isWin).length / outside.length : null,
    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────
// 18. Behavioral Timeline (Section 28 of Prompt 25)
// ─────────────────────────────────────────────────────────────────
export interface BehavioralTimelineEntry {
  period: string;
  count: number; avgR: number | null; winRate: number | null;
  topMistake: string | null;
  topStrength: string | null;
  mistakeCount: number;
  strengthCount: number;
  sampleWarning: boolean;
}

export function getBehavioralTimeline(
  trades: Trade[],
  granularity: 'week' | 'month' = 'month',
): BehavioralTimelineEntry[] {
  const byPeriod = new Map<string, Trade[]>();
  trades.filter(isClosed).forEach(t => {
    const key = granularity === 'week' ? weekKey(t.openedAt) : monthKey(t.openedAt);
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key)!.push(t);
  });

  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, ts]) => {
      const base = calcBaseMetrics(ts);
      const mistakes  = detectMistakes(ts);
      const strengths = detectStrengths(ts);
      return {
        period,
        count: ts.length,
        avgR: base.avgR,
        winRate: base.winRate,
        topMistake:  mistakes[0]?.title  ?? null,
        topStrength: strengths[0]?.title ?? null,
        mistakeCount:  mistakes.length,
        strengthCount: strengths.length,
        sampleWarning: ts.length < 5,
      };
    });
}

// ─────────────────────────────────────────────────────────────────
// 19. Learning Progress (Sections 19/20 of Prompt 25)
// ─────────────────────────────────────────────────────────────────
export interface LessonTrackEntry {
  noteId: string; title: string; createdAt: number;
  tradesBeforeCount: number; tradesAfterCount: number;
  avgRBefore: number | null; avgRAfter: number | null;
  /** avgRAfter - avgRBefore: مثبت = بهبود */
  improvement: number | null;
  winRateBefore: number | null; winRateAfter: number | null;
}

export function getLearningProgress(
  trades: Trade[],
  rules: Array<{ id: string; title: string; createdAt: number }>,
): LessonTrackEntry[] {
  const closed = [...trades.filter(isClosed)].sort((a, b) => a.openedAt - b.openedAt);
  if (!closed.length || !rules.length) return [];

  return rules.map(rule => {
    const before = closed.filter(t => t.openedAt < rule.createdAt);
    const after  = closed.filter(t => t.openedAt >= rule.createdAt);

    const rBefore = before.filter(t => getR(t) !== null).map(t => getR(t)!);
    const rAfter  = after.filter(t => getR(t) !== null).map(t => getR(t)!);

    const avgBefore = avg(rBefore);
    const avgAfter  = avg(rAfter);

    return {
      noteId: rule.id, title: rule.title, createdAt: rule.createdAt,
      tradesBeforeCount: before.length, tradesAfterCount: after.length,
      avgRBefore: avgBefore, avgRAfter: avgAfter,
      improvement: avgBefore !== null && avgAfter !== null ? avgAfter - avgBefore : null,
      winRateBefore: before.length > 0 ? before.filter(isWin).length / before.length : null,
      winRateAfter:  after.length  > 0 ? after.filter(isWin).length  / after.length  : null,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}
