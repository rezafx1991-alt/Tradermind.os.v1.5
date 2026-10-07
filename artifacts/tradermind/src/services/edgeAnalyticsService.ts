/**
 * edgeAnalyticsService.ts — Deep Multi-Dimensional Analytics Engine (Prompt 17)
 * Pure functions, no UI or Dexie dependencies.
 */
import { Trade } from '../db/database';
import { isWin, isLoss, isClosed, median } from '../lib/tradeHelpers';
import { getTradingDateKey, getTradingDateParts } from '../lib/tradingTime';

// ── Session Definitions ────────────────────────────────────────────────────

export interface SessionDef {
  id: string;
  name: string;
  nameEn: string;
  startUTC: number; // hour, inclusive
  endUTC: number;   // hour, exclusive
  color: string;
  isOverlap?: boolean;
}

export const DEFAULT_SESSIONS: SessionDef[] = [
  { id: 'asian',     name: 'آسیا',          nameEn: 'Asian',             startUTC: 1,  endUTC: 9,  color: '#f59e0b' },
  { id: 'london',    name: 'لندن',           nameEn: 'London',            startUTC: 7,  endUTC: 16, color: '#3b82f6' },
  { id: 'newyork',   name: 'نیویورک',        nameEn: 'New York',          startUTC: 12, endUTC: 21, color: '#10b981' },
  { id: 'london-ny', name: 'اوورلپ لندن/NY', nameEn: 'London/NY Overlap', startUTC: 12, endUTC: 16, color: '#8b5cf6', isOverlap: true },
];

// ── Types ─────────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'insufficient' | 'weak' | 'moderate' | 'strong';

export function getConfidence(closedCount: number): ConfidenceLevel {
  if (closedCount < 5)  return 'insufficient';
  if (closedCount < 15) return 'weak';
  if (closedCount < 30) return 'moderate';
  return 'strong';
}

export const CONFIDENCE_FA: Record<ConfidenceLevel, string> = {
  insufficient: 'داده ناکافی',
  weak:         'ضعیف',
  moderate:     'متوسط',
  strong:       'قوی',
};

export const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  insufficient: 'text-muted-foreground',
  weak:         'text-amber-400',
  moderate:     'text-blue-400',
  strong:       'text-emerald-400',
};

export interface SliceMetrics {
  count: number;
  closedCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgR: number | null;
  medianR: number | null;
  totalR: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  avgHoldingMinutes: number | null;
  bestR: number | null;
  worstR: number | null;
  confidence: ConfidenceLevel;
}

export interface ClassifiedTrade extends Trade {
  _sessionIds: string[];
  _dayOfWeek: number;
  _hourUTC: number;
  _hourLocal: number;       // ساعت محلی بر اساس timezone انتخابی
  _dateLocal: string;       // تاریخ محلی YYYY-MM-DD بر اساس timezone انتخابی
  _holdingMinutes: number | null;
  _behaviorFlags: string[];
  _entryTiming: string | null;
  _mfe: number | null;
  _mae: number | null;
  _setup: string | null;
  _marketRegime: string | null;
  _lossCategory: string | null;
  _slMoved: boolean;
  _closedEarly: boolean;
  _strategy: string | null;
}

export interface DaySlice       { day: number; name: string; metrics: SliceMetrics; }
export interface HourSlice      { hour: number; label: string; metrics: SliceMetrics; }
export interface SessionSlice   { sessionId: string; name: string; color: string; isOverlap: boolean; metrics: SliceMetrics; }
export interface DaySessionCell { day: number; dayName: string; sessionId: string; sessionName: string; metrics: SliceMetrics; }
export interface SymbolSlice    { symbol: string; metrics: SliceMetrics; bestSession: string | null; bestDay: string | null; }
export interface DirectionSlice { direction: string; name: string; metrics: SliceMetrics; }

export interface ComboSlice {
  dimensions: { key: string; value: string }[];
  label: string;
  metrics: SliceMetrics;
}

export interface EdgeInsight {
  id: string;
  type: 'strength' | 'weakness' | 'tendency' | 'warning';
  strength: 'edge' | 'possible' | 'early-signal' | 'insufficient';
  title: string;
  description: string;
  evidence: { label: string; value: string }[];
  tradeCount: number;
  avgR: number | null;
  winRate: number;
  confidence: ConfidenceLevel;
}

export interface BehaviorSlice {
  id: string;
  name: string;
  icon: string;
  count: number;
  total: number;
  rate: number;
  metrics: SliceMetrics;
}

export interface HoldingBucket {
  label: string;
  minMin: number;
  maxMin: number | null;
  metrics: SliceMetrics;
}

export interface CalendarDay {
  date: string;
  dayOfWeek: number;
  trades: number;
  totalR: number | null;
  wins: number;
  losses: number;
  sessions: string[];
}

export interface HistoricalComparison {
  period: string;
  count: number;
  winRate: number;
  avgR: number | null;
  totalR: number | null;
}

export interface EdgeAnalyticsResult {
  classified:           ClassifiedTrade[];
  overallMetrics:       SliceMetrics;
  daySlices:            DaySlice[];
  hourSlices:           HourSlice[];
  sessionSlices:        SessionSlice[];
  daySessionMatrix:     DaySessionCell[];
  symbolSlices:         SymbolSlice[];
  directionSlices:      DirectionSlice[];
  strategySlices:       { strategyId: string | null; name: string; metrics: SliceMetrics }[];
  holdingBuckets:       HoldingBucket[];
  behaviorSlices:       BehaviorSlice[];
  topCombos:            ComboSlice[];
  weakCombos:           ComboSlice[];
  edgeInsights:         EdgeInsight[];
  calendarMonths:       CalendarMonth[];
  historicalComparison: HistoricalComparison[];
  timezoneOffsetHours:  number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

export const PERSIAN_DAYS  = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
export const SHORT_DAYS    = ['ی','د','س','چ','پ','ج','ش'];
export const PERSIAN_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export const GREGORIAN_MONTHS = ['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];

function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }

function calcMetrics(trades: ClassifiedTrade[]): SliceMetrics {
  const closed  = trades.filter(isClosed);
  const wins    = closed.filter(isWin);
  const losses  = closed.filter(isLoss);
  const be      = closed.filter(t => t.result === 'breakeven');
  const withR   = closed.filter(t => t.rMultiple != null);
  const rValues = withR.map(t => t.rMultiple!);
  const avgR    = withR.length ? sum(rValues) / withR.length : null;
  const totalR  = withR.length ? sum(rValues) : null;
  const winR    = wins.filter(t => t.rMultiple != null).map(t => t.rMultiple!);
  const lossR   = losses.filter(t => t.rMultiple != null).map(t => Math.abs(t.rMultiple!));
  const pf      = lossR.length && sum(lossR) !== 0 ? sum(winR) / sum(lossR) : null;
  const holdsMin = trades.filter(t => t._holdingMinutes != null).map(t => t._holdingMinutes!);
  return {
    count:             trades.length,
    closedCount:       closed.length,
    wins:              wins.length,
    losses:            losses.length,
    breakeven:         be.length,
    winRate:           closed.length ? (wins.length / closed.length) * 100 : 0,
    avgR,
    medianR:           median(rValues),
    totalR,
    expectancy:        avgR,
    profitFactor:      pf,
    avgHoldingMinutes: holdsMin.length ? sum(holdsMin) / holdsMin.length : null,
    bestR:             rValues.length ? Math.max(...rValues) : null,
    worstR:            rValues.length ? Math.min(...rValues) : null,
    confidence:        getConfidence(closed.length),
  };
}

function parseSafe<T>(json: string | null | undefined, fallback: T): T {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

function getSessionsForHour(hourUTC: number, sessions: SessionDef[]): string[] {
  return sessions
    .filter(s => s.id !== 'off' && hourUTC >= s.startUTC && hourUTC < s.endUTC)
    .map(s => s.id);
}

function getHourInTz(ts: number, offsetHours: number): number {
  return Math.floor(((ts / 3600000 + offsetHours) % 24 + 24)) % 24;
}

// ── Trade Classification ───────────────────────────────────────────────────

export function classifyTrades(
  trades: Trade[],
  strategies: { id: string; name: string }[],
  sessions: SessionDef = DEFAULT_SESSIONS as unknown as SessionDef,
  timezoneOffsetHours = 0,
): ClassifiedTrade[] {
  const sessionList = DEFAULT_SESSIONS;
  const stratMap = new Map(strategies.map(s => [s.id, s.name]));

  return trades.map(t => {
    const d     = new Date(t.openedAt);
    const hourUTC     = d.getUTCHours();
    const dayOfWeek   = d.getUTCDay(); // 0=Sun
    const sessionIds  = getSessionsForHour(hourUTC, sessionList);
    if (!sessionIds.length) sessionIds.push('off');

    // ── ساعت و تاریخ محلی بر اساس timezone انتخابی ─────────────────
    const hourLocal = getHourInTz(t.openedAt, timezoneOffsetHours);
    const adjustedMs = t.openedAt + timezoneOffsetHours * 3_600_000;
    const dLocal = new Date(adjustedMs);
    const dateLocal = `${dLocal.getUTCFullYear()}-${String(dLocal.getUTCMonth()+1).padStart(2,'0')}-${String(dLocal.getUTCDate()).padStart(2,'0')}`;

    const holdingMinutes = t.closedAt ? Math.round((t.closedAt - t.openedAt) / 60000) : null;

    // PostTradeReview extraction
    const ptr = parseSafe<Record<string, unknown>>(t.postTradeReview, {});
    const behaviorFlags = (ptr.behaviorFlags as string[]) ?? [];
    const entryTiming   = (ptr.entryTiming as string) ?? null;
    const slMoved       = !!(ptr.slMoved);
    const closedEarly   = !!(ptr.closedEarly);
    const lossCategory  = (ptr.lossCategory as string) ?? null;

    // LiveMonitoring MFE/MAE
    const lm = parseSafe<Record<string, unknown>>(t.liveMonitoring, {});
    const mfe = (lm.maxFavorableExcursion as number) ?? null;
    const mae = (lm.maxAdverseExcursion as number) ?? null;

    // Tags → setup + market regime
    const tags = parseSafe<string[]>(t.tags, []);
    const regimeKeywords = ['trending','ranging','volatile','range','trend','expansion','compression','reversal','breakout','sideways'];
    const setupKeywords  = ['retracement','pullback','continuation','reversal','breakout','fakeout','liquidity','orderblock','fvg','pinbar','engulfing','ict','smc'];
    const marketRegime = tags.find(tag => regimeKeywords.some(k => tag.toLowerCase().includes(k))) ?? null;
    const setup        = tags.find(tag => setupKeywords.some(k => tag.toLowerCase().includes(k))) ?? null;

    return {
      ...t,
      _sessionIds:   sessionIds,
      _dayOfWeek:    dayOfWeek,
      _hourUTC:      hourUTC,
      _hourLocal:    hourLocal,
      _dateLocal:    dateLocal,
      _holdingMinutes: holdingMinutes,
      _behaviorFlags: behaviorFlags,
      _entryTiming:  entryTiming,
      _mfe:          mfe,
      _mae:          mae,
      _setup:        setup,
      _marketRegime: marketRegime,
      _lossCategory: lossCategory,
      _slMoved:      slMoved,
      _closedEarly:  closedEarly,
      _strategy:     t.strategyId ? (stratMap.get(t.strategyId) ?? t.strategyId) : null,
    } as ClassifiedTrade;
  });
}

// ── Slice helpers ──────────────────────────────────────────────────────────

function sliceByKey<K>(
  trades: ClassifiedTrade[],
  keyFn: (t: ClassifiedTrade) => K | null,
  labelFn: (k: K) => string,
): Map<K, { label: string; trades: ClassifiedTrade[] }> {
  const map = new Map<K, { label: string; trades: ClassifiedTrade[] }>();
  trades.forEach(t => {
    const k = keyFn(t);
    if (k == null) return;
    if (!map.has(k)) map.set(k, { label: labelFn(k), trades: [] });
    map.get(k)!.trades.push(t);
  });
  return map;
}

// ── Main Analytics Computation ─────────────────────────────────────────────

export function computeEdgeAnalytics(
  trades: Trade[],
  strategies: { id: string; name: string }[],
  timezoneOffsetHours = 0,
): EdgeAnalyticsResult {
  const classified = classifyTrades(trades, strategies, undefined as unknown as SessionDef, timezoneOffsetHours);
  const overallMetrics = calcMetrics(classified);

  // ── Day of Week ──────────────────────────────────────────────────────────
  const dayGroups = sliceByKey(classified, t => t._dayOfWeek, d => PERSIAN_DAYS[d]);
  const daySlices: DaySlice[] = [6, 0, 1, 2, 3, 4, 5]
    .map(d => ({
      day:     d,
      name:    PERSIAN_DAYS[d],
      metrics: calcMetrics(dayGroups.get(d)?.trades ?? []),
    }))
    .filter(s => s.metrics.count > 0);

  // ── Hourly (بر اساس timezone محلی) ──────────────────────────────────────
  const hourGroups = new Map<number, ClassifiedTrade[]>();
  classified.forEach(t => {
    const h = t._hourLocal;
    if (!hourGroups.has(h)) hourGroups.set(h, []);
    hourGroups.get(h)!.push(t);
  });
  const hourSlices: HourSlice[] = Array.from(hourGroups.entries())
    .map(([h, ts]) => ({
      hour:    h,
      label:   `${String(h).padStart(2,'0')}:00`,
      metrics: calcMetrics(ts),
    }))
    .sort((a, b) => a.hour - b.hour);

  // ── Sessions ─────────────────────────────────────────────────────────────
  const sessionSlices: SessionSlice[] = DEFAULT_SESSIONS.map(s => {
    const ts = classified.filter(t => t._sessionIds.includes(s.id));
    return { sessionId: s.id, name: s.name, color: s.color, isOverlap: !!s.isOverlap, metrics: calcMetrics(ts) };
  }).filter(s => s.metrics.count > 0);

  // ── Day × Session matrix ──────────────────────────────────────────────────
  const daySessionMatrix: DaySessionCell[] = [];
  [6, 0, 1, 2, 3, 4, 5].forEach(day => {
    DEFAULT_SESSIONS.filter(s => !s.isOverlap).forEach(s => {
      const ts = classified.filter(t => t._dayOfWeek === day && t._sessionIds.includes(s.id));
      if (!ts.length) return;
      daySessionMatrix.push({
        day, dayName: PERSIAN_DAYS[day],
        sessionId: s.id, sessionName: s.name,
        metrics: calcMetrics(ts),
      });
    });
  });

  // ── Symbol slices ─────────────────────────────────────────────────────────
  const symbolGroups = sliceByKey(classified, t => t.symbol, s => s);
  const symbolSlices: SymbolSlice[] = Array.from(symbolGroups.entries()).map(([sym, { trades: ts }]) => {
    const symTradesC = ts as ClassifiedTrade[];
    // best session
    const symSessionMetrics = DEFAULT_SESSIONS
      .filter(s => !s.isOverlap)
      .map(s => ({ id: s.id, name: s.name, m: calcMetrics(symTradesC.filter(t => t._sessionIds.includes(s.id))) }))
      .filter(x => x.m.confidence !== 'insufficient')
      .sort((a, b) => (b.m.avgR ?? -99) - (a.m.avgR ?? -99));
    const bestSession = symSessionMetrics[0]?.name ?? null;
    const symDayMetrics = [6,0,1,2,3,4,5].map(d => ({
      d, name: PERSIAN_DAYS[d],
      m: calcMetrics(symTradesC.filter(t => t._dayOfWeek === d)),
    })).filter(x => x.m.confidence !== 'insufficient').sort((a,b) => (b.m.avgR??-99)-(a.m.avgR??-99));
    const bestDay = symDayMetrics[0]?.name ?? null;
    return { symbol: sym, metrics: calcMetrics(symTradesC), bestSession, bestDay };
  }).sort((a, b) => b.metrics.count - a.metrics.count);

  // ── Direction ─────────────────────────────────────────────────────────────
  const dirGroups = sliceByKey(classified, t => t.direction, d => d === 'long' ? 'خرید (Long)' : 'فروش (Short)');
  const directionSlices: DirectionSlice[] = Array.from(dirGroups.entries()).map(([dir, { label, trades: ts }]) => ({
    direction: dir, name: label, metrics: calcMetrics(ts as ClassifiedTrade[]),
  }));

  // ── Strategy × Time ───────────────────────────────────────────────────────
  const stratGroups = sliceByKey(classified, t => t._strategy ?? '__none__', s => s === '__none__' ? 'بدون استراتژی' : s);
  const strategySlices = Array.from(stratGroups.entries()).map(([id, { label, trades: ts }]) => ({
    strategyId: id === '__none__' ? null : id,
    name: label,
    metrics: calcMetrics(ts as ClassifiedTrade[]),
  })).sort((a, b) => b.metrics.count - a.metrics.count);

  // ── Holding Time ──────────────────────────────────────────────────────────
  const HOLDING_BUCKETS: { label: string; minMin: number; maxMin: number | null }[] = [
    { label: '< ۵ دقیقه',    minMin: 0,    maxMin: 5 },
    { label: '۵–۱۵ دقیقه',   minMin: 5,    maxMin: 15 },
    { label: '۱۵–۳۰ دقیقه',  minMin: 15,   maxMin: 30 },
    { label: '۳۰–۶۰ دقیقه',  minMin: 30,   maxMin: 60 },
    { label: '۱–۴ ساعت',     minMin: 60,   maxMin: 240 },
    { label: '۴–۱۲ ساعت',    minMin: 240,  maxMin: 720 },
    { label: '> ۱۲ ساعت',    minMin: 720,  maxMin: null },
  ];
  const holdingBuckets: HoldingBucket[] = HOLDING_BUCKETS.map(b => {
    const ts = classified.filter(t =>
      t._holdingMinutes != null &&
      t._holdingMinutes >= b.minMin &&
      (b.maxMin == null || t._holdingMinutes < b.maxMin),
    );
    return { ...b, metrics: calcMetrics(ts) };
  }).filter(b => b.metrics.count > 0);

  // ── Behavioral Analysis ───────────────────────────────────────────────────
  const BEHAVIOR_DEFS = [
    { id: 'fomo',         name: 'FOMO',            icon: '⚡' },
    { id: 'hesitation',   name: 'تردید',           icon: '⏳' },
    { id: 'fear',         name: 'ترس',             icon: '😰' },
    { id: 'impatience',   name: 'بی‌صبری',          icon: '🏃' },
    { id: 'overconfidence', name: 'اعتماد کاذب',    icon: '🎯' },
    { id: 'revenge-trading', name: 'معامله انتقامی', icon: '🔥' },
    { id: 'uncertainty',  name: 'عدم اطمینان',      icon: '❓' },
    { id: 'sl-moved',     name: 'جابجایی SL',       icon: '🔴' },
    { id: 'closed-early', name: 'خروج زودهنگام',    icon: '🚪' },
  ];
  const total = classified.filter(isClosed).length;
  const behaviorSlices: BehaviorSlice[] = BEHAVIOR_DEFS.map(b => {
    let flagged: ClassifiedTrade[];
    if (b.id === 'sl-moved')     flagged = classified.filter(t => t._slMoved && isClosed(t));
    else if (b.id === 'closed-early') flagged = classified.filter(t => t._closedEarly && isClosed(t));
    else flagged = classified.filter(t => t._behaviorFlags.includes(b.id) && isClosed(t));
    const notFlagged = classified.filter(t => !flagged.includes(t) && isClosed(t));
    const flaggedC = flagged as ClassifiedTrade[];
    const combined = [...flaggedC, ...notFlagged.filter(t => notFlagged.includes(t))];
    return {
      id: b.id, name: b.name, icon: b.icon,
      count: flagged.length, total,
      rate: total ? (flagged.length / total) * 100 : 0,
      metrics: calcMetrics(flaggedC),
    };
  }).filter(b => b.count > 0);

  // ── Combination Analysis ───────────────────────────────────────────────────
  const combos: ComboSlice[] = [];
  const MIN_COMBO_TRADES = 3;

  // Day × Session
  daySessionMatrix.forEach(cell => {
    if (cell.metrics.closedCount < MIN_COMBO_TRADES) return;
    combos.push({
      dimensions: [{ key: 'روز', value: cell.dayName }, { key: 'سشن', value: cell.sessionName }],
      label: `${cell.dayName} / ${cell.sessionName}`,
      metrics: cell.metrics,
    });
  });

  // Symbol × Session
  symbolSlices.forEach(sym => {
    DEFAULT_SESSIONS.filter(s => !s.isOverlap).forEach(s => {
      const ts = classified.filter(t => t.symbol === sym.symbol && t._sessionIds.includes(s.id));
      if (ts.length < MIN_COMBO_TRADES) return;
      const m = calcMetrics(ts);
      combos.push({
        dimensions: [{ key: 'نماد', value: sym.symbol }, { key: 'سشن', value: s.name }],
        label: `${sym.symbol} / ${s.name}`,
        metrics: m,
      });
    });
  });

  // Symbol × Day
  symbolSlices.forEach(sym => {
    [6,0,1,2,3,4,5].forEach(d => {
      const ts = classified.filter(t => t.symbol === sym.symbol && t._dayOfWeek === d);
      if (ts.length < MIN_COMBO_TRADES) return;
      const m = calcMetrics(ts);
      combos.push({
        dimensions: [{ key: 'نماد', value: sym.symbol }, { key: 'روز', value: PERSIAN_DAYS[d] }],
        label: `${sym.symbol} / ${PERSIAN_DAYS[d]}`,
        metrics: m,
      });
    });
  });

  // Direction × Session
  ['long', 'short'].forEach(dir => {
    DEFAULT_SESSIONS.filter(s => !s.isOverlap).forEach(s => {
      const ts = classified.filter(t => t.direction === dir && t._sessionIds.includes(s.id));
      if (ts.length < MIN_COMBO_TRADES) return;
      const m = calcMetrics(ts);
      combos.push({
        dimensions: [{ key: 'جهت', value: dir === 'long' ? 'خرید' : 'فروش' }, { key: 'سشن', value: s.name }],
        label: `${dir === 'long' ? 'خرید' : 'فروش'} / ${s.name}`,
        metrics: m,
      });
    });
  });

  // Direction × Day  (Prompt 17 §13)
  ['long', 'short'].forEach(dir => {
    [6, 0, 1, 2, 3, 4, 5].forEach(d => {
      const ts = classified.filter(t => t.direction === dir && t._dayOfWeek === d);
      if (ts.length < MIN_COMBO_TRADES) return;
      const m = calcMetrics(ts);
      combos.push({
        dimensions: [{ key: 'جهت', value: dir === 'long' ? 'خرید' : 'فروش' }, { key: 'روز', value: PERSIAN_DAYS[d] }],
        label: `${dir === 'long' ? 'خرید' : 'فروش'} / ${PERSIAN_DAYS[d]}`,
        metrics: m,
      });
    });
  });

  // Direction × Hour  (Prompt 17 §13)
  ['long', 'short'].forEach(dir => {
    const dirTrades = classified.filter(t => t.direction === dir);
    const hourSet = new Set(dirTrades.map(t => t._hourLocal));
    hourSet.forEach(h => {
      const ts = dirTrades.filter(t => t._hourLocal === h);
      if (ts.length < MIN_COMBO_TRADES) return;
      const m = calcMetrics(ts);
      combos.push({
        dimensions: [{ key: 'جهت', value: dir === 'long' ? 'خرید' : 'فروش' }, { key: 'ساعت', value: `${String(h).padStart(2,'0')}:00` }],
        label: `${dir === 'long' ? 'خرید' : 'فروش'} / ${String(h).padStart(2,'0')}:00`,
        metrics: m,
      });
    });
  });

  // Remove duplicates and sort
  const deduped = Array.from(new Map(combos.map(c => [c.label, c])).values());
  const withR = deduped.filter(c => c.metrics.avgR != null && c.metrics.confidence !== 'insufficient');
  const topCombos  = withR.filter(c => (c.metrics.avgR ?? 0) > (overallMetrics.avgR ?? 0) + 0.1)
    .sort((a, b) => (b.metrics.avgR ?? 0) - (a.metrics.avgR ?? 0)).slice(0, 8);
  const weakCombos = withR.filter(c => (c.metrics.avgR ?? 0) < (overallMetrics.avgR ?? 0) - 0.1)
    .sort((a, b) => (a.metrics.avgR ?? 0) - (b.metrics.avgR ?? 0)).slice(0, 5);

  // ── Personal Edge Insights ─────────────────────────────────────────────────
  const edgeInsights: EdgeInsight[] = [];
  const oAR = overallMetrics.avgR ?? 0;
  const oWR = overallMetrics.winRate;

  function addInsight(
    type: EdgeInsight['type'], title: string, description: string,
    evidence: EdgeInsight['evidence'], tradeCount: number, avgR: number | null, winRate: number,
    confidence: ConfidenceLevel,
  ) {
    let strength: EdgeInsight['strength'];
    if (confidence === 'insufficient') strength = 'insufficient';
    else if (confidence === 'weak') strength = 'early-signal';
    else if (avgR != null && avgR > oAR + 0.3 && winRate > oWR + 10 && confidence === 'strong') strength = 'edge';
    else if (avgR != null && Math.abs((avgR ?? 0) - oAR) > 0.15) strength = 'possible';
    else strength = 'early-signal';
    edgeInsights.push({ id: crypto.randomUUID(), type, strength, title, description, evidence, tradeCount, avgR, winRate, confidence });
  }

  // Best session
  const bestSession = sessionSlices.filter(s => !s.isOverlap && s.metrics.confidence !== 'insufficient')
    .sort((a, b) => (b.metrics.avgR ?? -99) - (a.metrics.avgR ?? -99))[0];
  const worstSession = sessionSlices.filter(s => !s.isOverlap && s.metrics.confidence !== 'insufficient')
    .sort((a, b) => (a.metrics.avgR ?? 99) - (b.metrics.avgR ?? 99))[0];
  if (bestSession && worstSession && bestSession.sessionId !== worstSession.sessionId) {
    addInsight('strength', `بهترین عملکرد در سشن ${bestSession.name}`,
      `بر اساس داده‌های ثبت‌شده، عملکرد تاریخی شما در سشن ${bestSession.name} بهتر از سایر سشن‌ها بوده است.`,
      [
        { label: 'سشن', value: bestSession.name },
        { label: 'معاملات', value: `${bestSession.metrics.count}` },
        { label: 'میانگین R', value: bestSession.metrics.avgR?.toFixed(2) ?? '—' },
        { label: 'درصد برد', value: `${bestSession.metrics.winRate.toFixed(0)}٪` },
      ],
      bestSession.metrics.count, bestSession.metrics.avgR, bestSession.metrics.winRate, bestSession.metrics.confidence,
    );
  }

  // Best day
  const bestDay = daySlices.filter(d => d.metrics.confidence !== 'insufficient')
    .sort((a, b) => (b.metrics.avgR ?? -99) - (a.metrics.avgR ?? -99))[0];
  if (bestDay && (bestDay.metrics.avgR ?? 0) > oAR + 0.1) {
    addInsight('strength', `روز ${bestDay.name} قوی‌ترین روز`,
      `عملکرد تاریخی شما در روز ${bestDay.name} بالاتر از میانگین کلی بوده است.`,
      [
        { label: 'روز', value: bestDay.name },
        { label: 'معاملات', value: `${bestDay.metrics.count}` },
        { label: 'میانگین R', value: bestDay.metrics.avgR?.toFixed(2) ?? '—' },
        { label: 'درصد برد', value: `${bestDay.metrics.winRate.toFixed(0)}٪` },
      ],
      bestDay.metrics.count, bestDay.metrics.avgR, bestDay.metrics.winRate, bestDay.metrics.confidence,
    );
  }

  // Worst day
  const worstDay = daySlices.filter(d => d.metrics.confidence !== 'insufficient')
    .sort((a, b) => (a.metrics.avgR ?? 99) - (b.metrics.avgR ?? 99))[0];
  if (worstDay && (worstDay.metrics.avgR ?? 0) < oAR - 0.15) {
    addInsight('weakness', `روز ${worstDay.name} ضعیف‌ترین روز`,
      `عملکرد تاریخی شما در روز ${worstDay.name} پایین‌تر از میانگین کلی بوده است.`,
      [
        { label: 'روز', value: worstDay.name },
        { label: 'معاملات', value: `${worstDay.metrics.count}` },
        { label: 'میانگین R', value: worstDay.metrics.avgR?.toFixed(2) ?? '—' },
        { label: 'درصد برد', value: `${worstDay.metrics.winRate.toFixed(0)}٪` },
      ],
      worstDay.metrics.count, worstDay.metrics.avgR, worstDay.metrics.winRate, worstDay.metrics.confidence,
    );
  }

  // Top combo insights
  topCombos.slice(0, 3).forEach(c => {
    addInsight('tendency', `ترکیب قوی: ${c.label}`,
      `ترکیب ${c.label} به‌طور تاریخی عملکرد بهتری نسبت به میانگین کلی داشته است.`,
      [
        { label: 'شرایط', value: c.label },
        { label: 'معاملات', value: `${c.metrics.count}` },
        { label: 'میانگین R', value: c.metrics.avgR?.toFixed(2) ?? '—' },
        { label: 'درصد برد', value: `${c.metrics.winRate.toFixed(0)}٪` },
      ],
      c.metrics.count, c.metrics.avgR, c.metrics.winRate, c.metrics.confidence,
    );
  });

  // Behavior warnings
  const slMovedTrades = classified.filter(t => t._slMoved && isClosed(t));
  if (slMovedTrades.length >= 5) {
    const m = calcMetrics(slMovedTrades);
    addInsight('warning', 'جابجایی حد ضرر: اثر تاریخی',
      `در ${slMovedTrades.length} معامله حد ضرر جابجا شده. عملکرد این معاملات نسبت به بقیه قابل مقایسه است.`,
      [
        { label: 'تعداد', value: `${slMovedTrades.length}` },
        { label: 'میانگین R', value: m.avgR?.toFixed(2) ?? '—' },
        { label: 'مقایسه با کل', value: `کل: ${oAR.toFixed(2)}R` },
      ],
      slMovedTrades.length, m.avgR, m.winRate, m.confidence,
    );
  }

  // Direction insight
  if (directionSlices.length === 2) {
    const long  = directionSlices.find(d => d.direction === 'long');
    const short = directionSlices.find(d => d.direction === 'short');
    if (long && short && long.metrics.confidence !== 'insufficient' && short.metrics.confidence !== 'insufficient') {
      const better = (long.metrics.avgR ?? 0) > (short.metrics.avgR ?? 0) ? long : short;
      addInsight('tendency',
        `معاملات ${better.name} بهتر عمل کرده`,
        `بر اساس داده‌های ثبت‌شده، معاملات ${better.name} میانگین R بالاتری داشته‌اند.`,
        [
          { label: 'جهت', value: better.name },
          { label: 'معاملات', value: `${better.metrics.count}` },
          { label: 'میانگین R', value: better.metrics.avgR?.toFixed(2) ?? '—' },
          { label: 'مقایسه', value: `Long: ${long.metrics.avgR?.toFixed(2) ?? '—'}R / Short: ${short.metrics.avgR?.toFixed(2) ?? '—'}R` },
        ],
        better.metrics.count, better.metrics.avgR, better.metrics.winRate, better.metrics.confidence,
      );
    }
  }

  if (edgeInsights.length === 0 && classified.length < 10) {
    edgeInsights.push({
      id: 'no-data', type: 'tendency', strength: 'insufficient',
      title: 'داده‌های کافی موجود نیست',
      description: 'برای کشف مزیت‌های شخصی به حداقل ۱۰ معامله ثبت‌شده نیاز است. به معامله‌گری ادامه دهید.',
      evidence: [], tradeCount: classified.length, avgR: null, winRate: 0, confidence: 'insufficient',
    });
  }

  // ── Calendar (از _dateLocal استفاده می‌کند تا timezone درست باشد) ────────
  const calendarMap = new Map<string, CalendarDay>();
  classified.forEach(t => {
    const dateStr = t._dateLocal;
    if (!calendarMap.has(dateStr)) {
      // dayOfWeek هم بر اساس timezone محلی محاسبه می‌شود
      const adjustedMs = t.openedAt + timezoneOffsetHours * 3_600_000;
      const dLocal = new Date(adjustedMs);
      calendarMap.set(dateStr, {
        date: dateStr, dayOfWeek: dLocal.getUTCDay(), trades: 0,
        totalR: null, wins: 0, losses: 0, sessions: [],
      });
    }
    const day = calendarMap.get(dateStr)!;
    day.trades++;
    if (t.rMultiple != null) day.totalR = (day.totalR ?? 0) + t.rMultiple;
    if (isWin(t))  day.wins++;
    if (isLoss(t)) day.losses++;
    t._sessionIds.forEach(s => { if (!day.sessions.includes(s)) day.sessions.push(s); });
  });

  const calendarDays = Array.from(calendarMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const monthMap = new Map<string, CalendarMonth>();
  calendarDays.forEach(cd => {
    const [y, m] = cd.date.split('-').map(Number);
    const key = `${y}-${m}`;
    if (!monthMap.has(key)) monthMap.set(key, { year: y, month: m, days: [] });
    monthMap.get(key)!.days.push(cd);
  });
  const calendarMonths = Array.from(monthMap.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month).slice(-6);

  // ── Historical Comparison ──────────────────────────────────────────────────
  const sorted = [...classified.filter(isClosed)].sort((a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt));
  const historicalComparison: HistoricalComparison[] = [
    { period: 'همه زمان‌ها',    trades: classified },
    { period: 'آخرین ۵۰',       trades: classified.slice(-50) },
    { period: 'آخرین ۲۰',       trades: classified.slice(-20) },
    { period: 'آخرین ۱۰',       trades: classified.slice(-10) },
  ].filter(p => p.trades.length > 0).map(p => {
    const m = calcMetrics(p.trades);
    return { period: p.period, count: m.closedCount, winRate: m.winRate, avgR: m.avgR, totalR: m.totalR };
  });

  return {
    classified, overallMetrics, daySlices, hourSlices, sessionSlices, daySessionMatrix,
    symbolSlices, directionSlices, strategySlices, holdingBuckets, behaviorSlices,
    topCombos, weakCombos, edgeInsights, calendarMonths, historicalComparison,
    timezoneOffsetHours,
  };
}

// ── Natural Language Query ────────────────────────────────────────────────────

export interface NLAnswer {
  question: string;
  answer: string;
  evidence: { label: string; value: string }[];
  confidence: ConfidenceLevel;
}

const NL_QUESTIONS = [
  'بهترین روز معاملاتی من کدام است؟',
  'در کدام سشن بهتر معامله می‌کنم؟',
  'در اوورلپ لندن/NY چطور عمل می‌کنم؟',
  'بهترین ساعت‌های معاملاتی من کدامند؟',
  'کدام نماد بهترین عملکرد را دارد؟',
  'معاملات Long یا Short بهتر عمل کرده‌اند؟',
  'بیشترین اشتباهات رفتاری من چیست؟',
  'بهترین ترکیب شرایط برای من کدام است؟',
  'در کدام ساعت بیشترین اشتباه را می‌کنم؟',
  'کدام استراتژی بهترین عملکرد را دارد؟',
];

export { NL_QUESTIONS };

export function answerNLQuestion(question: string, result: EdgeAnalyticsResult): NLAnswer {
  const q = question.toLowerCase();

  // Best day
  if (q.includes('روز') && (q.includes('بهترین') || q.includes('بهتر'))) {
    const best = [...result.daySlices].sort((a, b) => (b.metrics.avgR??-99) - (a.metrics.avgR??-99))[0];
    if (!best || best.metrics.confidence === 'insufficient') {
      return { question, answer: 'داده کافی برای تشخیص بهترین روز وجود ندارد.', evidence: [], confidence: 'insufficient' };
    }
    return {
      question, confidence: best.metrics.confidence,
      answer: `بر اساس داده‌های ثبت‌شده، روز ${best.name} با میانگین ${best.metrics.avgR?.toFixed(2)}R و درصد برد ${best.metrics.winRate.toFixed(0)}٪ بهترین عملکرد را داشته است.`,
      evidence: [
        { label: 'روز', value: best.name },
        { label: 'معاملات', value: `${best.metrics.count}` },
        { label: 'میانگین R', value: best.metrics.avgR?.toFixed(2) ?? '—' },
        { label: 'درصد برد', value: `${best.metrics.winRate.toFixed(0)}٪` },
      ],
    };
  }

  // Best session
  if (q.includes('سشن') || q.includes('session') || q.includes('لندن') || q.includes('نیویورک') || q.includes('آسیا')) {
    const nonOverlap = result.sessionSlices.filter(s => !s.isOverlap && s.metrics.confidence !== 'insufficient');
    if (!nonOverlap.length) return { question, answer: 'داده کافی برای مقایسه سشن‌ها وجود ندارد.', evidence: [], confidence: 'insufficient' };
    const best = [...nonOverlap].sort((a, b) => (b.metrics.avgR??-99) - (a.metrics.avgR??-99))[0];
    if (q.includes('اوورلپ') || q.includes('overlap')) {
      const overlap = result.sessionSlices.find(s => s.isOverlap);
      if (overlap && overlap.metrics.confidence !== 'insufficient') {
        return {
          question, confidence: overlap.metrics.confidence,
          answer: `در اوورلپ لندن/NY: ${overlap.metrics.count} معامله، میانگین ${overlap.metrics.avgR?.toFixed(2)}R، درصد برد ${overlap.metrics.winRate.toFixed(0)}٪.`,
          evidence: [
            { label: 'سشن', value: overlap.name }, { label: 'معاملات', value: `${overlap.metrics.count}` },
            { label: 'میانگین R', value: overlap.metrics.avgR?.toFixed(2) ?? '—' },
          ],
        };
      }
      return { question, answer: 'داده کافی برای اوورلپ وجود ندارد.', evidence: [], confidence: 'insufficient' };
    }
    return {
      question, confidence: best.metrics.confidence,
      answer: `سشن ${best.name} با میانگین ${best.metrics.avgR?.toFixed(2)}R بهترین عملکرد را داشته است.`,
      evidence: nonOverlap.map(s => ({ label: s.name, value: `${s.metrics.avgR?.toFixed(2) ?? '—'}R (${s.metrics.count} معامله)` })),
    };
  }

  // Best symbol
  if (q.includes('نماد')) {
    const best = result.symbolSlices.filter(s => s.metrics.confidence !== 'insufficient').sort((a,b) => (b.metrics.avgR??-99) - (a.metrics.avgR??-99))[0];
    if (!best) return { question, answer: 'داده کافی برای مقایسه نمادها وجود ندارد.', evidence: [], confidence: 'insufficient' };
    return {
      question, confidence: best.metrics.confidence,
      answer: `نماد ${best.symbol} با میانگین ${best.metrics.avgR?.toFixed(2)}R بهترین عملکرد را داشته است.`,
      evidence: result.symbolSlices.slice(0,5).map(s => ({ label: s.symbol, value: `${s.metrics.avgR?.toFixed(2) ?? '—'}R (${s.metrics.count} معامله)` })),
    };
  }

  // Long vs Short
  if (q.includes('long') || q.includes('short') || q.includes('خرید') || q.includes('فروش') || q.includes('جهت')) {
    const d = result.directionSlices;
    if (!d.length) return { question, answer: 'داده کافی وجود ندارد.', evidence: [], confidence: 'insufficient' };
    const better = d.reduce((a,b) => (b.metrics.avgR??-99) > (a.metrics.avgR??-99) ? b : a);
    return {
      question, confidence: better.metrics.confidence,
      answer: `معاملات ${better.name} با میانگین ${better.metrics.avgR?.toFixed(2)}R بهتر عمل کرده‌اند.`,
      evidence: d.map(x => ({ label: x.name, value: `${x.metrics.avgR?.toFixed(2) ?? '—'}R (${x.metrics.count} معامله)` })),
    };
  }

  // Mistakes
  if (q.includes('اشتباه') || q.includes('رفتار') || q.includes('مشکل')) {
    const topBehavior = result.behaviorSlices.sort((a,b) => b.count - a.count)[0];
    if (!topBehavior) return { question, answer: 'هیچ الگوی رفتاری ثبت‌شده‌ای پیدا نشد.', evidence: [], confidence: 'insufficient' };
    return {
      question, confidence: getConfidence(topBehavior.count),
      answer: `پرتکرارترین رفتار: ${topBehavior.name} در ${topBehavior.count} معامله (${topBehavior.rate.toFixed(0)}٪ معاملات).`,
      evidence: result.behaviorSlices.slice(0,5).map(b => ({ label: b.name, value: `${b.count} بار (${b.rate.toFixed(0)}٪)` })),
    };
  }

  // Best hour
  if (q.includes('ساعت') || q.includes('hour')) {
    const hoursSorted = result.hourSlices.filter(h => h.metrics.confidence !== 'insufficient').sort((a,b) => (b.metrics.avgR??-99)-(a.metrics.avgR??-99));
    if (!hoursSorted.length) return { question, answer: 'داده کافی برای تحلیل ساعتی وجود ندارد.', evidence: [], confidence: 'insufficient' };
    const best = hoursSorted[0];
    const worst = [...hoursSorted].sort((a,b) => (a.metrics.avgR??99)-(b.metrics.avgR??99))[0];
    return {
      question, confidence: best.metrics.confidence,
      answer: `بهترین ساعت: ${best.label} با میانگین ${best.metrics.avgR?.toFixed(2)}R. ضعیف‌ترین: ${worst.label} با ${worst.metrics.avgR?.toFixed(2)}R.`,
      evidence: hoursSorted.slice(0,5).map(h => ({ label: h.label, value: `${h.metrics.avgR?.toFixed(2)??'—'}R (${h.metrics.count}×)` })),
    };
  }

  // Best strategy
  if (q.includes('استراتژی')) {
    const best = result.strategySlices.filter(s => s.metrics.confidence !== 'insufficient').sort((a,b) => (b.metrics.avgR??-99)-(a.metrics.avgR??-99))[0];
    if (!best) return { question, answer: 'داده کافی برای مقایسه استراتژی‌ها وجود ندارد.', evidence: [], confidence: 'insufficient' };
    return {
      question, confidence: best.metrics.confidence,
      answer: `استراتژی «${best.name}» با میانگین ${best.metrics.avgR?.toFixed(2)}R بهترین عملکرد را داشته است.`,
      evidence: result.strategySlices.slice(0,5).map(s => ({ label: s.name, value: `${s.metrics.avgR?.toFixed(2)??'—'}R (${s.metrics.count} معامله)` })),
    };
  }

  // Best combo
  if (q.includes('ترکیب') || q.includes('بهترین شرایط')) {
    const best = result.topCombos[0];
    if (!best) return { question, answer: 'هنوز داده کافی برای تحلیل ترکیبی وجود ندارد.', evidence: [], confidence: 'insufficient' };
    return {
      question, confidence: best.metrics.confidence,
      answer: `بهترین ترکیب تاریخی: ${best.label} با میانگین ${best.metrics.avgR?.toFixed(2)}R در ${best.metrics.count} معامله.`,
      evidence: result.topCombos.slice(0,5).map(c => ({ label: c.label, value: `${c.metrics.avgR?.toFixed(2)??'—'}R (${c.metrics.count}×)` })),
    };
  }

  return {
    question, confidence: 'insufficient',
    answer: 'این سوال را نمی‌توانم با داده‌های موجود پاسخ دهم. سوالات پیشنهادی را امتحان کنید.',
    evidence: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENDED ANALYTICS — covers gaps: Day×Hour, Setup×Time, Market Regime,
// Entry Timing, MAE/MFE, Risk/Reward, Strategy×Session/Day, 3-Dim Combos
// ═══════════════════════════════════════════════════════════════════════════════

export interface DayHourCell {
  day: number; dayName: string; hour: number; label: string;
  metrics: SliceMetrics;
}

export interface SetupSlice {
  setup: string;
  metrics: SliceMetrics;
  bestSession: string | null;
  bestDay: string | null;
}

export interface RegimeSlice {
  regime: string;
  metrics: SliceMetrics;
}

export interface EntryTimingSlice {
  timing: string;
  name: string;
  metrics: SliceMetrics;
}

export interface MAEMFEPoint {
  symbol: string; result: string;
  mfe: number; mae: number; rMultiple: number | null;
}

export interface MAEMFEData {
  avgMFE: number | null;
  avgMAE: number | null;
  avgMFEWinners: number | null;
  avgMFELosers:  number | null;
  avgMAEWinners: number | null;
  avgMAELosers:  number | null;
  dataCount: number;
  points: MAEMFEPoint[];
  avgMFEBySession: { sessionId: string; name: string; color: string; avgMFE: number | null; count: number }[];
}

export interface RiskRewardData {
  avgPlannedRR: number | null;
  avgActualRR:  number | null;
  avgRiskPct:   number | null;
  planVsActual: { total: number; plannedHigher: number; actualHigher: number; equal: number };
  rrBySession:  { sessionId: string; name: string; color: string; avgActualRR: number | null; count: number }[];
  rrByDay:      { day: number; name: string; avgActualRR: number | null; count: number }[];
}

export interface StrategyTimeBreakdown {
  strategyId: string | null;
  name: string;
  bySession: { sessionId: string; name: string; color: string; metrics: SliceMetrics }[];
  byDay:     { day: number;      name: string;             metrics: SliceMetrics }[];
}

export interface ExtendedAnalyticsResult {
  dayHourMatrix:       DayHourCell[];
  setupSlices:         SetupSlice[];
  regimeSlices:        RegimeSlice[];
  entryTimingSlices:   EntryTimingSlice[];
  maemfe:              MAEMFEData;
  riskReward:          RiskRewardData;
  strategyBreakdowns:  StrategyTimeBreakdown[];
  triCombos:           ComboSlice[];
}

export function computeExtendedAnalytics(
  classified: ClassifiedTrade[],
): ExtendedAnalyticsResult {

  // ── Day × Hour matrix (از _hourLocal برای timezone درست) ─────────────────
  const dhMap = new Map<string, ClassifiedTrade[]>();
  classified.forEach(t => {
    const k = `${t._dayOfWeek}-${t._hourLocal}`;
    if (!dhMap.has(k)) dhMap.set(k, []);
    dhMap.get(k)!.push(t);
  });
  const dayHourMatrix: DayHourCell[] = [];
  dhMap.forEach((ts, k) => {
    if (ts.length < 2) return;
    const [d, h] = k.split('-').map(Number);
    dayHourMatrix.push({
      day: d, dayName: PERSIAN_DAYS[d],
      hour: h, label: `${String(h).padStart(2,'0')}:00`,
      metrics: calcMetrics(ts),
    });
  });

  // ── Setup × Time ───────────────────────────────────────────────────────────
  const setupGroups = new Map<string, ClassifiedTrade[]>();
  classified.forEach(t => {
    if (!t._setup) return;
    if (!setupGroups.has(t._setup)) setupGroups.set(t._setup, []);
    setupGroups.get(t._setup)!.push(t);
  });
  const setupSlices: SetupSlice[] = Array.from(setupGroups.entries()).map(([setup, ts]) => {
    const bestSess = DEFAULT_SESSIONS.filter(s => !s.isOverlap)
      .map(s => ({ name: s.name, m: calcMetrics(ts.filter(t => t._sessionIds.includes(s.id))) }))
      .filter(x => x.m.closedCount >= 2)
      .sort((a, b) => (b.m.avgR??-99) - (a.m.avgR??-99))[0]?.name ?? null;
    const bestDay = [6,0,1,2,3,4,5]
      .map(d => ({ name: PERSIAN_DAYS[d], m: calcMetrics(ts.filter(t => t._dayOfWeek === d)) }))
      .filter(x => x.m.closedCount >= 2)
      .sort((a,b) => (b.m.avgR??-99)-(a.m.avgR??-99))[0]?.name ?? null;
    return { setup, metrics: calcMetrics(ts), bestSession: bestSess, bestDay };
  }).sort((a, b) => b.metrics.count - a.metrics.count);

  // ── Market Regime ──────────────────────────────────────────────────────────
  const regimeGroups = new Map<string, ClassifiedTrade[]>();
  classified.forEach(t => {
    if (!t._marketRegime) return;
    if (!regimeGroups.has(t._marketRegime)) regimeGroups.set(t._marketRegime, []);
    regimeGroups.get(t._marketRegime)!.push(t);
  });
  const regimeSlices: RegimeSlice[] = Array.from(regimeGroups.entries())
    .map(([regime, ts]) => ({ regime, metrics: calcMetrics(ts) }))
    .sort((a, b) => b.metrics.count - a.metrics.count);

  // ── Entry Timing ───────────────────────────────────────────────────────────
  const TIMING_FA: Record<string, string> = {
    early: 'ورود زودهنگام', 'on-time': 'ورود به موقع', late: 'ورود دیرهنگام', chased: 'ورود دنباله‌دار',
  };
  const timingGroups = new Map<string, ClassifiedTrade[]>();
  classified.forEach(t => {
    if (!t._entryTiming) return;
    if (!timingGroups.has(t._entryTiming)) timingGroups.set(t._entryTiming, []);
    timingGroups.get(t._entryTiming)!.push(t);
  });
  const entryTimingSlices: EntryTimingSlice[] = Array.from(timingGroups.entries()).map(([timing, ts]) => ({
    timing, name: TIMING_FA[timing] ?? timing, metrics: calcMetrics(ts),
  }));

  // ── MAE / MFE ──────────────────────────────────────────────────────────────
  function avgOf(arr: ClassifiedTrade[], fn: (t: ClassifiedTrade) => number | null): number | null {
    const vals = arr.map(fn).filter(v => v != null) as number[];
    return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
  }
  const withMFEMAE = classified.filter(t => t._mfe != null || t._mae != null);
  const winners = classified.filter(t => isClosed(t) && isWin(t));
  const losers  = classified.filter(t => isClosed(t) && isLoss(t));
  const maemfe: MAEMFEData = {
    avgMFE:        avgOf(classified, t => t._mfe),
    avgMAE:        avgOf(classified, t => t._mae),
    avgMFEWinners: avgOf(winners, t => t._mfe),
    avgMFELosers:  avgOf(losers,  t => t._mfe),
    avgMAEWinners: avgOf(winners, t => t._mae),
    avgMAELosers:  avgOf(losers,  t => t._mae),
    dataCount:     withMFEMAE.length,
    avgMFEBySession: DEFAULT_SESSIONS.filter(s => !s.isOverlap).map(s => {
      const ts = classified.filter(t => t._sessionIds.includes(s.id));
      return { sessionId: s.id, name: s.name, color: s.color, avgMFE: avgOf(ts, t => t._mfe), count: ts.length };
    }).filter(x => x.count > 0),
    points: withMFEMAE
      .filter(t => t._mfe != null && t._mae != null)
      .slice(0, 100)
      .map(t => ({ symbol: t.symbol, result: t.result, mfe: t._mfe!, mae: t._mae!, rMultiple: t.rMultiple })),
  };

  // ── Risk & Reward ──────────────────────────────────────────────────────────
  function plannedRR(t: ClassifiedTrade): number | null {
    if (t.takeProfit == null || t.stopLoss == null) return null;
    const tpDist = Math.abs(t.takeProfit - t.entryPrice);
    const slDist = Math.abs(t.stopLoss   - t.entryPrice);
    return slDist > 0 ? tpDist / slDist : null;
  }
  const withPlanR   = classified.filter(t => plannedRR(t) != null);
  const withActualR = classified.filter(t => t.rMultiple != null);
  const both = classified.filter(t => plannedRR(t) != null && t.rMultiple != null);
  const riskReward: RiskRewardData = {
    avgPlannedRR: withPlanR.length ? withPlanR.reduce((s,t) => s+(plannedRR(t)??0),0)/withPlanR.length : null,
    avgActualRR:  withActualR.length ? withActualR.reduce((s,t) => s+(t.rMultiple??0),0)/withActualR.length : null,
    avgRiskPct:   (() => {
      const w = classified.filter(t => t.riskPercentage != null);
      return w.length ? w.reduce((s,t) => s+(t.riskPercentage!),0)/w.length : null;
    })(),
    planVsActual: {
      total:         both.length,
      plannedHigher: both.filter(t => (plannedRR(t)??0) > (t.rMultiple??0)).length,
      actualHigher:  both.filter(t => (t.rMultiple??0) > (plannedRR(t)??0)).length,
      equal:         both.filter(t => Math.abs((plannedRR(t)??0) - (t.rMultiple??0)) < 0.05).length,
    },
    rrBySession: DEFAULT_SESSIONS.filter(s => !s.isOverlap).map(s => {
      const ts = classified.filter(t => t._sessionIds.includes(s.id));
      return { sessionId: s.id, name: s.name, color: s.color, avgActualRR: calcMetrics(ts).avgR, count: ts.length };
    }).filter(x => x.count > 0),
    rrByDay: [6,0,1,2,3,4,5].map(d => {
      const ts = classified.filter(t => t._dayOfWeek === d);
      return { day: d, name: PERSIAN_DAYS[d], avgActualRR: calcMetrics(ts).avgR, count: ts.length };
    }).filter(x => x.count > 0),
  };

  // ── Strategy × Session / Day ───────────────────────────────────────────────
  const stratGroups2 = new Map<string, ClassifiedTrade[]>();
  classified.forEach(t => {
    const k = t._strategy ?? '__none__';
    if (!stratGroups2.has(k)) stratGroups2.set(k, []);
    stratGroups2.get(k)!.push(t);
  });
  const strategyBreakdowns: StrategyTimeBreakdown[] = Array.from(stratGroups2.entries()).map(([k, ts]) => ({
    strategyId: k === '__none__' ? null : k,
    name: k === '__none__' ? 'بدون استراتژی' : k,
    bySession: DEFAULT_SESSIONS.filter(s => !s.isOverlap).map(s => ({
      sessionId: s.id, name: s.name, color: s.color,
      metrics: calcMetrics(ts.filter(t => t._sessionIds.includes(s.id))),
    })).filter(x => x.metrics.count > 0),
    byDay: [6,0,1,2,3,4,5].map(d => ({
      day: d, name: PERSIAN_DAYS[d],
      metrics: calcMetrics(ts.filter(t => t._dayOfWeek === d)),
    })).filter(x => x.metrics.count > 0),
  }));

  // ── 3-Dimension Combos ─────────────────────────────────────────────────────
  const MIN3 = 3;
  const triCombos: ComboSlice[] = [];
  const symbols   = Array.from(new Set(classified.map(t => t.symbol)));
  const setupList = Array.from(new Set(classified.map(t => t._setup).filter(Boolean))) as string[];

  // Day + Session + Symbol
  [6,0,1,2,3,4,5].forEach(day => {
    DEFAULT_SESSIONS.filter(s => !s.isOverlap).forEach(sess => {
      symbols.forEach(sym => {
        const ts = classified.filter(t => t._dayOfWeek===day && t._sessionIds.includes(sess.id) && t.symbol===sym);
        if (ts.length < MIN3) return;
        triCombos.push({
          dimensions: [{ key:'روز',value:PERSIAN_DAYS[day]},{key:'سشن',value:sess.name},{key:'نماد',value:sym}],
          label: `${PERSIAN_DAYS[day]} / ${sess.name} / ${sym}`,
          metrics: calcMetrics(ts),
        });
      });
    });
  });

  // Symbol + Setup + Session
  symbols.forEach(sym => {
    setupList.forEach(setup => {
      DEFAULT_SESSIONS.filter(s => !s.isOverlap).forEach(sess => {
        const ts = classified.filter(t => t.symbol===sym && t._setup===setup && t._sessionIds.includes(sess.id));
        if (ts.length < MIN3) return;
        triCombos.push({
          dimensions: [{key:'نماد',value:sym},{key:'ست‌آپ',value:setup},{key:'سشن',value:sess.name}],
          label: `${sym} / ${setup} / ${sess.name}`,
          metrics: calcMetrics(ts),
        });
      });
    });
  });

  return { dayHourMatrix, setupSlices, regimeSlices, entryTimingSlices, maemfe, riskReward, strategyBreakdowns, triCombos };
}

// calendar filter helper
export function filterCalendarMonths(
  months: CalendarMonth[],
  classified: ClassifiedTrade[],
  filters: { symbol?: string; strategyId?: string; direction?: string; sessionId?: string },
): CalendarMonth[] {
  if (!filters.symbol && !filters.strategyId && !filters.direction && !filters.sessionId) return months;
  const filteredIds = new Set(
    classified.filter(t =>
      (!filters.symbol    || t.symbol     === filters.symbol) &&
      (!filters.direction || t.direction  === filters.direction) &&
      (!filters.strategyId|| t._strategy  === filters.strategyId) &&
      (!filters.sessionId || t._sessionIds.includes(filters.sessionId)),
    ).map(t => t.id),
  );
  // rebuild calendar from filtered trades (از _dateLocal برای timezone درست)
  const calendarMap = new Map<string, CalendarDay>();
  classified.filter(t => filteredIds.has(t.id)).forEach(t => {
    const dateStr = t._dateLocal;
    if (!calendarMap.has(dateStr)) {
      calendarMap.set(dateStr, { date: dateStr, dayOfWeek: getTradingDateParts(t.openedAt).dayOfWeek, trades: 0, totalR: null, wins: 0, losses: 0, sessions: [] });
    }
    const day = calendarMap.get(dateStr)!;
    day.trades++;
    if (t.rMultiple != null) day.totalR = (day.totalR??0) + t.rMultiple;
    if (isWin(t))  day.wins++;
    if (isLoss(t)) day.losses++;
    t._sessionIds.forEach(s => { if (!day.sessions.includes(s)) day.sessions.push(s); });
  });
  const calDays = Array.from(calendarMap.values()).sort((a,b) => a.date.localeCompare(b.date));
  const monthMap = new Map<string, CalendarMonth>();
  calDays.forEach(cd => {
    const [y, m] = cd.date.split('-').map(Number);
    const key = `${y}-${m}`;
    if (!monthMap.has(key)) monthMap.set(key, { year: y, month: m, days: [] });
    monthMap.get(key)!.days.push(cd);
  });
  return Array.from(monthMap.values()).sort((a,b) => a.year!==b.year ? a.year-b.year : a.month-b.month).slice(-6);
}
