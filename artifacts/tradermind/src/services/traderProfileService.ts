/**
 * traderProfileService.ts — Personal Trader Profile, Behavioral Evolution & Adaptive Coaching Engine
 * Prompt 18: Pure computation functions, no UI/DB dependencies.
 * Heavily leverages edgeAnalyticsService for base analytics.
 */
import { Trade } from '../db/database';
import { isWin, isLoss, isClosed, toDateStr } from '../lib/tradeHelpers';
import {
  computeEdgeAnalytics,
  computeExtendedAnalytics,
  ClassifiedTrade,
  SliceMetrics,
  ConfidenceLevel,
  getConfidence,
  DEFAULT_SESSIONS,
  PERSIAN_DAYS,
  EdgeAnalyticsResult,
  ExtendedAnalyticsResult,
  CONFIDENCE_FA,
} from './edgeAnalyticsService';

// ── Correction / Privacy Control ───────────────────────────────────────────

export interface InsightCorrection {
  action: 'reject' | 'irrelevant';
  note?: string;
  correctedAt: number;
}

// ── Behavioral Patterns ────────────────────────────────────────────────────

export type BehaviorTrend = 'improving' | 'worsening' | 'stable' | 'emerging' | 'resolving' | 'insufficient';

export const BEHAVIOR_TREND_FA: Record<BehaviorTrend, string> = {
  improving: 'در حال بهبود', worsening: 'در حال بدتر شدن', stable: 'ثابت',
  emerging: 'تازه ظهور یافته', resolving: 'در حال رفع', insufficient: 'داده ناکافی',
};
export const BEHAVIOR_TREND_COLOR: Record<BehaviorTrend, string> = {
  improving: 'text-emerald-400', worsening: 'text-rose-400', stable: 'text-muted-foreground',
  emerging: 'text-blue-400', resolving: 'text-emerald-400', insufficient: 'text-muted-foreground/50',
};
export const BEHAVIOR_TREND_BG: Record<BehaviorTrend, string> = {
  improving: 'bg-emerald-500/10', worsening: 'bg-rose-500/10', stable: 'bg-muted/20',
  emerging: 'bg-blue-500/10', resolving: 'bg-emerald-500/10', insufficient: 'bg-muted/10',
};

export interface BehavioralPattern {
  id: string;
  name: string;
  icon: string;
  frequency: number;
  totalTrades: number;
  rate: number;
  impactOnR: number | null;        // avgR_flagged − avgR_not_flagged
  winRateFlagged: number;
  winRateNotFlagged: number;
  earlyRate: number | null;        // rate in first 1/3 of trades
  middleRate: number | null;
  recentRate: number | null;       // rate in last 1/3
  trend: BehaviorTrend;
  firstObservedAt: number | null;
  lastObservedAt: number | null;
  relatedSymbols: string[];
  relatedSessions: string[];
  confidence: ConfidenceLevel;
}

// ── Strengths & Weaknesses ─────────────────────────────────────────────────

export interface StrengthItem {
  id: string;
  type: 'strength' | 'weakness' | 'watchlist';
  category: 'session' | 'symbol' | 'setup' | 'execution' | 'behavior' | 'day' | 'regime' | 'direction';
  title: string;
  description: string;
  evidence: { label: string; value: string }[];
  avgR: number | null;
  winRate: number;
  count: number;
  confidence: ConfidenceLevel;
  trend: 'improving' | 'worsening' | 'stable' | 'new';
  isRejected: boolean;
  isIrrelevant: boolean;
}

// ── Performance Evolution ──────────────────────────────────────────────────

export type PerformanceTrend = 'improving' | 'stable' | 'declining' | 'volatile' | 'insufficient';

export const PERF_TREND_FA: Record<PerformanceTrend, string> = {
  improving: 'در حال بهبود', stable: 'پایدار', declining: 'در حال افت',
  volatile: 'ناپایدار', insufficient: 'داده ناکافی',
};

export interface PerformancePeriod {
  label: string;
  count: number;
  winRate: number;
  avgR: number | null;
  totalR: number | null;
  profitFactor: number | null;
  avgAdherence: number | null;
  drawdown: number | null;
}

// ── Style Tendencies ───────────────────────────────────────────────────────

export interface StyleTendency {
  id: string;
  title: string;
  description: string;
  evidence: string;
  score: number; // 0–100: strength of this tendency
  confidence: ConfidenceLevel;
  isRejected: boolean;
}

// ── Edge Evolution ─────────────────────────────────────────────────────────

export type EdgeTrend = 'emerging' | 'strengthening' | 'stable' | 'weakening' | 'disappearing' | 'insufficient';

export const EDGE_TREND_FA: Record<EdgeTrend, string> = {
  emerging: 'در حال ظهور', strengthening: 'در حال تقویت', stable: 'پایدار',
  weakening: 'در حال تضعیف', disappearing: 'در حال محو', insufficient: 'داده ناکافی',
};
export const EDGE_TREND_COLOR: Record<EdgeTrend, string> = {
  emerging: 'text-blue-400', strengthening: 'text-emerald-400', stable: 'text-muted-foreground',
  weakening: 'text-amber-400', disappearing: 'text-rose-400', insufficient: 'text-muted-foreground/40',
};
export const EDGE_TREND_BG: Record<EdgeTrend, string> = {
  emerging: 'bg-blue-500/10', strengthening: 'bg-emerald-500/10', stable: 'bg-muted/20',
  weakening: 'bg-amber-500/10', disappearing: 'bg-rose-500/10', insufficient: 'bg-muted/10',
};

export interface EdgeEvolutionItem {
  id: string;
  dimType: 'session' | 'symbol' | 'setup' | 'day' | 'direction';
  dimLabel: string;
  color: string;
  fullCount: number;
  fullAvgR: number | null;
  fullWinRate: number;
  recentCount: number;
  recentAvgR: number | null;
  recentWinRate: number;
  trend: EdgeTrend;
  confidence: ConfidenceLevel;
}

// ── Coaching Insights ──────────────────────────────────────────────────────

export interface CoachingInsight {
  id: string;
  type: 'strength' | 'weakness' | 'improvement' | 'warning' | 'info';
  priority: 'high' | 'medium' | 'low';
  title: string;
  body: string;
  evidence: { label: string; value: string }[];
  confidence: ConfidenceLevel;
  isRejected: boolean;
  isAccepted: boolean;
  isIrrelevant: boolean;
}

// ── Development Timeline ───────────────────────────────────────────────────

export interface DevelopmentEvent {
  id: string;
  periodLabel: string;
  type: 'strength' | 'weakness' | 'improvement' | 'warning' | 'style';
  title: string;
  description: string;
}

// ── Pre-Trade Checklist ────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  question: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

// ── Post-Trade Feedback ────────────────────────────────────────────────────

export interface PostTradeFeedback {
  behaviorObservations: { flag: string; name: string; historicalImpact: string }[];
  entryTimingNote: string | null;
  slNote: string | null;
  similarTradesNote: string | null;
  overallObservation: string;
  confidence: ConfidenceLevel;
}

// ── NL Answer ─────────────────────────────────────────────────────────────

export interface ProfileNLAnswer {
  question: string;
  answer: string;
  evidence: { label: string; value: string }[];
  confidence: ConfidenceLevel;
}

export const PROFILE_NL_QUESTIONS = [
  'قوی‌ترین نقاط من چیست؟',
  'کدام اشتباهات را بیشترین تکرار دارم؟',
  'آیا در حال پیشرفت هستم؟',
  'اخیراً چه چیزی در معامله‌گری من تغییر کرده؟',
  'بهترین شرایط معاملاتی برای من کدام است؟',
  'به چه چیزی بر اساس تاریخچه‌ام باید توجه کنم؟',
  'کدام رفتار بیشترین بهبود را داشته؟',
  'بزرگ‌ترین ضعف تکراری من الان چیست؟',
  'در کدام سشن بهترین عملکرد را دارم؟',
  'سبک معاملاتی من چگونه توصیف می‌شود؟',
];

// ── Main Profile Result ────────────────────────────────────────────────────

export interface TraderProfileData {
  computedAt: number;
  tradeCount: number;
  closedCount: number;
  dateRange: { from: string; to: string } | null;

  overallMetrics: SliceMetrics;
  maxDrawdown: number | null;

  bestSession: string | null;
  worstSession: string | null;
  bestDay: string | null;
  worstDay: string | null;
  bestHour: string | null;
  bestSymbol: string | null;
  worstSymbol: string | null;

  avgAdherence: number | null;
  avgHoldingMinutes: number | null;

  behavioralPatterns: BehavioralPattern[];
  strengths: StrengthItem[];
  weaknesses: StrengthItem[];
  watchlist: StrengthItem[];

  periods: PerformancePeriod[];
  performanceTrend: PerformanceTrend;
  performanceTrendDesc: string;

  styleTendencies: StyleTendency[];
  edgeEvolution: EdgeEvolutionItem[];
  coachingInsights: CoachingInsight[];
  developmentEvents: DevelopmentEvent[];

  edgeResult: EdgeAnalyticsResult;
  extendedResult: ExtendedAnalyticsResult;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function parseSafe<T>(json: string | null | undefined, fb: T): T {
  try { return json ? JSON.parse(json) : fb; } catch { return fb; }
}

function avgR(ts: ClassifiedTrade[]): number | null {
  const w = ts.filter(t => isClosed(t) && t.rMultiple != null);
  if (!w.length) return null;
  return w.reduce((s, t) => s + t.rMultiple!, 0) / w.length;
}

function winRate(ts: ClassifiedTrade[]): number {
  const c = ts.filter(isClosed);
  return c.length ? (c.filter(isWin).length / c.length) * 100 : 0;
}

function pfactor(ts: ClassifiedTrade[]): number | null {
  const c = ts.filter(isClosed);
  const wr = c.filter(t => isWin(t) && t.rMultiple != null).map(t => t.rMultiple!);
  const lr = c.filter(t => isLoss(t) && t.rMultiple != null).map(t => Math.abs(t.rMultiple!));
  const sumL = lr.reduce((a, b) => a + b, 0);
  if (!lr.length || sumL === 0) return null;
  return wr.reduce((a, b) => a + b, 0) / sumL;
}

function maxDD(sorted: ClassifiedTrade[]): number | null {
  const w = sorted.filter(t => isClosed(t) && t.rMultiple != null);
  if (!w.length) return null;
  let peak = 0, dd = 0, cum = 0;
  for (const t of w) {
    cum += t.rMultiple!;
    if (cum > peak) peak = cum;
    const d = peak - cum;
    if (d > dd) dd = d;
  }
  return dd;
}

function avgAdherenceFn(ts: ClassifiedTrade[]): number | null {
  const w = ts.filter(t => t.adherenceScore != null);
  if (!w.length) return null;
  return w.reduce((s, t) => s + t.adherenceScore!, 0) / w.length;
}

// ── Behavioral Patterns ────────────────────────────────────────────────────

const BEHAVIOR_DEFS = [
  { id: 'fomo',             name: 'FOMO',              icon: '⚡', source: 'flag' },
  { id: 'hesitation',       name: 'تردید',             icon: '⏳', source: 'flag' },
  { id: 'fear',             name: 'ترس',               icon: '😰', source: 'flag' },
  { id: 'impatience',       name: 'بی‌صبری',            icon: '🏃', source: 'flag' },
  { id: 'overconfidence',   name: 'اعتماد کاذب',       icon: '🎯', source: 'flag' },
  { id: 'revenge-trading',  name: 'معامله انتقامی',    icon: '🔥', source: 'flag' },
  { id: 'uncertainty',      name: 'عدم اطمینان',        icon: '❓', source: 'flag' },
  { id: 'sl-moved',         name: 'جابجایی SL',        icon: '🔴', source: 'sl' },
  { id: 'closed-early',     name: 'خروج زودهنگام',     icon: '🚪', source: 'early' },
];

function computeBehavioralPatterns(classified: ClassifiedTrade[]): BehavioralPattern[] {
  const closed = classified.filter(isClosed);
  if (!closed.length) return [];

  // Split closed trades into 3 equal periods
  const third = Math.floor(closed.length / 3);
  const periods = [
    closed.slice(0, third),
    closed.slice(third, third * 2),
    closed.slice(third * 2),
  ];

  return BEHAVIOR_DEFS.map(def => {
    const getFlagged = (ts: ClassifiedTrade[]): ClassifiedTrade[] => {
      if (def.source === 'flag')  return ts.filter(t => t._behaviorFlags.includes(def.id));
      if (def.source === 'sl')    return ts.filter(t => t._slMoved);
      if (def.source === 'early') return ts.filter(t => t._closedEarly);
      return [];
    };

    const flagged   = getFlagged(closed);
    const notFlagged = closed.filter(t => !flagged.includes(t));

    if (!flagged.length) return null;

    const aR_f  = avgR(flagged);
    const aR_nf = avgR(notFlagged);
    const impactOnR = aR_f != null && aR_nf != null ? aR_f - aR_nf : null;

    const periodRates = periods.map(p => {
      const f = getFlagged(p);
      return p.length > 0 ? (f.length / p.length) * 100 : null;
    });

    const getTrend = (rates: (number | null)[]): BehaviorTrend => {
      const [e, , r] = rates;
      if (e == null || r == null || closed.length < 9) return 'insufficient';
      const delta = r - e;
      if (Math.abs(delta) < 5) return 'stable';
      if (delta < -8) return 'resolving';
      if (delta > 8)  return 'worsening';
      if (e < 3 && r >= 8) return 'emerging';
      return 'stable';
    };

    // Related context
    const relatedSymbols = [...new Set(flagged.map(t => t.symbol))].slice(0, 3);
    const relatedSessions = [...new Set(flagged.flatMap(t => t._sessionIds).filter(s => s !== 'off'))].slice(0, 3);

    const flaggedDates = flagged.map(t => t.openedAt).sort((a, b) => a - b);

    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      frequency: flagged.length,
      totalTrades: closed.length,
      rate: (flagged.length / closed.length) * 100,
      impactOnR,
      winRateFlagged:    winRate(flagged),
      winRateNotFlagged: winRate(notFlagged),
      earlyRate:   periodRates[0],
      middleRate:  periodRates[1],
      recentRate:  periodRates[2],
      trend: getTrend(periodRates),
      firstObservedAt: flaggedDates[0] ?? null,
      lastObservedAt:  flaggedDates[flaggedDates.length - 1] ?? null,
      relatedSymbols,
      relatedSessions,
      confidence: getConfidence(flagged.length),
    };
  }).filter(Boolean) as BehavioralPattern[];
}

// ── Strengths & Weaknesses ─────────────────────────────────────────────────

function computeStrengthsWeaknesses(
  edgeResult: EdgeAnalyticsResult,
  extResult: ExtendedAnalyticsResult,
  patterns: BehavioralPattern[],
  corrections: Record<string, InsightCorrection>,
): { strengths: StrengthItem[]; weaknesses: StrengthItem[]; watchlist: StrengthItem[] } {
  const items: StrengthItem[] = [];
  const oAR = edgeResult.overallMetrics.avgR ?? 0;
  const oWR = edgeResult.overallMetrics.winRate;

  function addItem(item: Omit<StrengthItem, 'isRejected' | 'isIrrelevant'>) {
    const c = corrections[item.id];
    items.push({ ...item, isRejected: c?.action === 'reject', isIrrelevant: c?.action === 'irrelevant' });
  }

  // Sessions
  edgeResult.sessionSlices.filter(s => !s.isOverlap && s.metrics.confidence !== 'insufficient').forEach(s => {
    const ar = s.metrics.avgR ?? 0;
    if (ar > oAR + 0.2 && s.metrics.winRate > oWR + 8) {
      addItem({
        id: `session-strength-${s.sessionId}`, type: 'strength', category: 'session',
        title: `عملکرد قوی در سشن ${s.name}`,
        description: `بر اساس داده‌های ثبت‌شده، سشن ${s.name} به‌طور تاریخی بهترین نتایج را داده.`,
        evidence: [
          { label: 'سشن', value: s.name },
          { label: 'معاملات', value: `${s.metrics.count}` },
          { label: 'میانگین R', value: `${ar.toFixed(2)}R` },
          { label: 'درصد برد', value: `${s.metrics.winRate.toFixed(0)}٪` },
          { label: 'مقایسه با میانگین', value: `+${(ar - oAR).toFixed(2)}R بالاتر` },
        ],
        avgR: ar, winRate: s.metrics.winRate, count: s.metrics.count,
        confidence: s.metrics.confidence, trend: 'stable',
      });
    } else if (ar < oAR - 0.2 && s.metrics.confidence !== 'insufficient') {
      addItem({
        id: `session-weak-${s.sessionId}`, type: 'weakness', category: 'session',
        title: `عملکرد ضعیف در سشن ${s.name}`,
        description: `تاریخچه نشان می‌دهد عملکرد در سشن ${s.name} پایین‌تر از میانگین بوده.`,
        evidence: [
          { label: 'سشن', value: s.name },
          { label: 'معاملات', value: `${s.metrics.count}` },
          { label: 'میانگین R', value: `${ar.toFixed(2)}R` },
          { label: 'مقایسه با میانگین', value: `${(ar - oAR).toFixed(2)}R پایین‌تر` },
        ],
        avgR: ar, winRate: s.metrics.winRate, count: s.metrics.count,
        confidence: s.metrics.confidence, trend: 'stable',
      });
    }
  });

  // Symbols
  edgeResult.symbolSlices.filter(s => s.metrics.confidence !== 'insufficient').forEach(s => {
    const ar = s.metrics.avgR ?? 0;
    if (ar > oAR + 0.25 && s.metrics.winRate > oWR + 5) {
      addItem({
        id: `symbol-strength-${s.symbol}`, type: 'strength', category: 'symbol',
        title: `نماد ${s.symbol} — عملکرد قوی`,
        description: `نماد ${s.symbol} به‌طور تاریخی بهترین عملکرد را در پرتفولیو داشته.`,
        evidence: [
          { label: 'نماد', value: s.symbol },
          { label: 'معاملات', value: `${s.metrics.count}` },
          { label: 'میانگین R', value: `${ar.toFixed(2)}R` },
          { label: 'درصد برد', value: `${s.metrics.winRate.toFixed(0)}٪` },
        ],
        avgR: ar, winRate: s.metrics.winRate, count: s.metrics.count,
        confidence: s.metrics.confidence, trend: 'stable',
      });
    } else if (ar < oAR - 0.25 && s.metrics.confidence !== 'insufficient') {
      addItem({
        id: `symbol-weak-${s.symbol}`, type: 'weakness', category: 'symbol',
        title: `نماد ${s.symbol} — عملکرد ضعیف`,
        description: `نماد ${s.symbol} به‌طور تاریخی عملکرد پایین‌تری داشته.`,
        evidence: [
          { label: 'نماد', value: s.symbol },
          { label: 'معاملات', value: `${s.metrics.count}` },
          { label: 'میانگین R', value: `${ar.toFixed(2)}R` },
        ],
        avgR: ar, winRate: s.metrics.winRate, count: s.metrics.count,
        confidence: s.metrics.confidence, trend: 'stable',
      });
    }
  });

  // Days
  edgeResult.daySlices.filter(d => d.metrics.confidence !== 'insufficient').forEach(d => {
    const ar = d.metrics.avgR ?? 0;
    if (ar > oAR + 0.3) {
      addItem({
        id: `day-strength-${d.day}`, type: 'strength', category: 'day',
        title: `روز ${d.name} — عملکرد تاریخی قوی`,
        description: `روز ${d.name} به‌طور تاریخی بالاترین میانگین R را داشته.`,
        evidence: [
          { label: 'روز', value: d.name }, { label: 'معاملات', value: `${d.metrics.count}` },
          { label: 'میانگین R', value: `${ar.toFixed(2)}R` },
          { label: 'درصد برد', value: `${d.metrics.winRate.toFixed(0)}٪` },
        ],
        avgR: ar, winRate: d.metrics.winRate, count: d.metrics.count,
        confidence: d.metrics.confidence, trend: 'stable',
      });
    } else if (ar < oAR - 0.3) {
      addItem({
        id: `day-weak-${d.day}`, type: 'weakness', category: 'day',
        title: `روز ${d.name} — عملکرد تاریخی ضعیف`,
        description: `روز ${d.name} به‌طور تاریخی ضعیف‌ترین عملکرد را داشته.`,
        evidence: [
          { label: 'روز', value: d.name }, { label: 'معاملات', value: `${d.metrics.count}` },
          { label: 'میانگین R', value: `${ar.toFixed(2)}R` },
        ],
        avgR: ar, winRate: d.metrics.winRate, count: d.metrics.count,
        confidence: d.metrics.confidence, trend: 'stable',
      });
    }
  });

  // Direction
  if (edgeResult.directionSlices.length === 2) {
    const [a, b] = edgeResult.directionSlices.sort((x, y) => (y.metrics.avgR??-99) - (x.metrics.avgR??-99));
    if ((a.metrics.avgR??0) > (b.metrics.avgR??0) + 0.2 && a.metrics.confidence !== 'insufficient') {
      addItem({
        id: `dir-strength-${a.direction}`, type: 'strength', category: 'direction',
        title: `${a.name} — عملکرد تاریخی بهتر`,
        description: `معاملات ${a.name} به‌طور تاریخی نتایج بهتری نسبت به ${b.name} داشته.`,
        evidence: [
          { label: 'جهت برتر', value: a.name }, { label: 'میانگین R', value: `${(a.metrics.avgR??0).toFixed(2)}R` },
          { label: 'مقایسه', value: `Long: ${edgeResult.directionSlices.find(d=>d.direction==='long')?.metrics.avgR?.toFixed(2)??'—'}R / Short: ${edgeResult.directionSlices.find(d=>d.direction==='short')?.metrics.avgR?.toFixed(2)??'—'}R` },
        ],
        avgR: a.metrics.avgR, winRate: a.metrics.winRate, count: a.metrics.count,
        confidence: a.metrics.confidence, trend: 'stable',
      });
    }
  }

  // Setup strengths (from extended)
  extResult.setupSlices.filter(s => s.metrics.confidence !== 'insufficient').forEach(s => {
    const ar = s.metrics.avgR ?? 0;
    if (ar > oAR + 0.2) {
      addItem({
        id: `setup-strength-${s.setup}`, type: 'strength', category: 'setup',
        title: `ست‌آپ "${s.setup}" — عملکرد قوی`,
        description: `ست‌آپ ${s.setup} به‌طور تاریخی بالاتر از میانگین بوده.`,
        evidence: [
          { label: 'ست‌آپ', value: s.setup }, { label: 'معاملات', value: `${s.metrics.count}` },
          { label: 'میانگین R', value: `${ar.toFixed(2)}R` },
          ...(s.bestSession ? [{ label: 'بهترین سشن', value: s.bestSession }] : []),
        ],
        avgR: ar, winRate: s.metrics.winRate, count: s.metrics.count,
        confidence: s.metrics.confidence, trend: 'stable',
      });
    }
  });

  // Behavioral weaknesses
  patterns.filter(p => p.rate > 10 && p.trend !== 'resolving').forEach(p => {
    const impact = p.impactOnR != null && p.impactOnR < -0.1
      ? `این رفتار با کاهش میانگین R به اندازه ${Math.abs(p.impactOnR).toFixed(2)}R همراه بوده.`
      : `این رفتار در ${p.frequency} معامله مشاهده شده.`;
    addItem({
      id: `behavior-weak-${p.id}`, type: p.rate > 20 ? 'weakness' : 'watchlist', category: 'behavior',
      title: `رفتار تکراری: ${p.name} (${p.rate.toFixed(0)}٪ معاملات)`,
      description: impact,
      evidence: [
        { label: 'دفعات', value: `${p.frequency} معامله` },
        { label: 'نرخ', value: `${p.rate.toFixed(0)}٪ معاملات` },
        ...(p.impactOnR != null ? [{ label: 'اثر بر R', value: `${p.impactOnR > 0 ? '+' : ''}${p.impactOnR.toFixed(2)}R` }] : []),
        { label: 'روند', value: BEHAVIOR_TREND_FA[p.trend] },
      ],
      avgR: p.impactOnR, winRate: p.winRateFlagged, count: p.frequency,
      confidence: p.confidence, trend: p.trend === 'worsening' ? 'worsening' : p.trend === 'resolving' ? 'improving' : 'stable',
    });
  });

  // High adherence → execution strength
  const adherenceScores = extResult.entryTimingSlices.filter(t => t.timing === 'on-time');
  if (adherenceScores.length && (adherenceScores[0].metrics.avgR ?? 0) > oAR + 0.15) {
    addItem({
      id: 'exec-strength-timing', type: 'strength', category: 'execution',
      title: 'ورود به‌موقع — عملکرد بهتر',
      description: 'معاملاتی که با تایمینگ درست وارد شده‌اید نتایج بهتری داشته.',
      evidence: [
        { label: 'معاملات به‌موقع', value: `${adherenceScores[0].metrics.count}` },
        { label: 'میانگین R', value: `${adherenceScores[0].metrics.avgR?.toFixed(2)}R` },
      ],
      avgR: adherenceScores[0].metrics.avgR, winRate: adherenceScores[0].metrics.winRate,
      count: adherenceScores[0].metrics.count, confidence: adherenceScores[0].metrics.confidence, trend: 'stable',
    });
  }

  const strengths  = items.filter(i => i.type === 'strength');
  const weaknesses = items.filter(i => i.type === 'weakness');
  const watchlist  = items.filter(i => i.type === 'watchlist');
  return { strengths, weaknesses, watchlist };
}

// ── Performance Evolution ──────────────────────────────────────────────────

function computePerformanceEvolution(
  sortedClosed: ClassifiedTrade[],
  allTrades: Trade[],
): { periods: PerformancePeriod[]; performanceTrend: PerformanceTrend; performanceTrendDesc: string } {
  const now = Date.now();
  const days30ago  = now - 30  * 86400_000;
  const days90ago  = now - 90  * 86400_000;
  const days180ago = now - 180 * 86400_000;

  function periodMetrics(ts: ClassifiedTrade[], label: string): PerformancePeriod {
    const withR = ts.filter(t => t.rMultiple != null);
    const totalR = withR.reduce((s, t) => s + t.rMultiple!, 0);
    return {
      label,
      count:        ts.length,
      winRate:      winRate(ts),
      avgR:         withR.length ? totalR / withR.length : null,
      totalR:       withR.length ? totalR : null,
      profitFactor: pfactor(ts),
      avgAdherence: avgAdherenceFn(ts),
      drawdown:     maxDD(ts),
    };
  }

  const periods: PerformancePeriod[] = [
    periodMetrics(sortedClosed, 'همه زمان‌ها'),
    ...(sortedClosed.filter(t => (t.closedAt??t.openedAt) >= days30ago).length > 0
      ? [periodMetrics(sortedClosed.filter(t => (t.closedAt??t.openedAt) >= days30ago), '۳۰ روز اخیر')] : []),
    ...(sortedClosed.filter(t => (t.closedAt??t.openedAt) >= days90ago && (t.closedAt??t.openedAt) < days30ago).length > 0
      ? [periodMetrics(sortedClosed.filter(t => (t.closedAt??t.openedAt) >= days90ago && (t.closedAt??t.openedAt) < days30ago), '۳۰–۹۰ روز پیش')] : []),
    ...(sortedClosed.length >= 10  ? [periodMetrics(sortedClosed.slice(-10),  'آخرین ۱۰')] : []),
    ...(sortedClosed.length >= 20  ? [periodMetrics(sortedClosed.slice(-20),  'آخرین ۲۰')] : []),
    ...(sortedClosed.length >= 50  ? [periodMetrics(sortedClosed.slice(-50),  'آخرین ۵۰')] : []),
    ...(sortedClosed.length >= 100 ? [periodMetrics(sortedClosed.slice(-100), 'آخرین ۱۰۰')] : []),
  ];

  // Trend: compare last 20 vs prev 20
  let performanceTrend: PerformanceTrend = 'insufficient';
  let performanceTrendDesc = 'داده کافی برای تشخیص روند عملکرد وجود ندارد.';
  if (sortedClosed.length >= 20) {
    const recent  = sortedClosed.slice(-20);
    const prev    = sortedClosed.slice(-40, -20);
    const rAR  = avgR(recent);
    const pAR  = prev.length >= 10 ? avgR(prev) : null;
    const rWR  = winRate(recent);
    const pWR  = prev.length >= 10 ? winRate(prev) : 0;

    if (rAR != null && pAR != null) {
      const deltaR = rAR - pAR;
      const deltaW = rWR - pWR;
      if (deltaR > 0.1 && deltaW > 5)       { performanceTrend = 'improving'; performanceTrendDesc = `میانگین R در ۲۰ معامله اخیر ${rAR.toFixed(2)} در مقابل ${pAR.toFixed(2)} قبل از آن — روند صعودی.`; }
      else if (deltaR < -0.1 && deltaW < -5) { performanceTrend = 'declining'; performanceTrendDesc = `میانگین R در ۲۰ معامله اخیر ${rAR.toFixed(2)} در مقابل ${pAR.toFixed(2)} قبل — روند نزولی.`; }
      else if (Math.abs(deltaR) > 0.15)      { performanceTrend = 'volatile';  performanceTrendDesc = `نوسان در عملکرد مشاهده می‌شود. میانگین R اخیر: ${rAR.toFixed(2)}.`; }
      else                                    { performanceTrend = 'stable';    performanceTrendDesc = `عملکرد پایدار. میانگین R اخیر: ${rAR.toFixed(2)}، مشابه دوره قبل (${pAR.toFixed(2)}).`; }
    } else if (rAR != null) {
      performanceTrend = 'stable';
      performanceTrendDesc = `میانگین R در ۲۰ معامله اخیر: ${rAR.toFixed(2)}.`;
    }
  }

  return { periods, performanceTrend, performanceTrendDesc };
}

// ── Style Tendencies ───────────────────────────────────────────────────────

function computeStyleTendencies(
  classified: ClassifiedTrade[],
  corrections: Record<string, InsightCorrection>,
): StyleTendency[] {
  const closed = classified.filter(isClosed);
  if (!closed.length) return [];

  const items: StyleTendency[] = [];

  function addStyle(t: Omit<StyleTendency, 'isRejected'>) {
    const c = corrections[t.id];
    items.push({ ...t, isRejected: c?.action === 'reject' });
  }

  // Holding time → scalper/intraday/swing
  const withHolding = closed.filter(t => t._holdingMinutes != null);
  if (withHolding.length >= 5) {
    const avgH = withHolding.reduce((s,t) => s + t._holdingMinutes!, 0) / withHolding.length;
    if (avgH < 30) {
      addStyle({ id: 'style-scalper', title: 'اسکالپر', score: Math.min(100, Math.round((30 - avgH) / 30 * 100)),
        description: 'زمان نگهداری میانگین کمتر از ۳۰ دقیقه است.',
        evidence: `میانگین نگهداری: ${avgH.toFixed(0)} دقیقه`, confidence: getConfidence(withHolding.length) });
    } else if (avgH < 240) {
      addStyle({ id: 'style-intraday', title: 'اینتراروزی', score: 80,
        description: 'اکثر معاملات در بازه ۳۰ دقیقه تا ۴ ساعت بسته می‌شوند.',
        evidence: `میانگین نگهداری: ${(avgH/60).toFixed(1)} ساعت`, confidence: getConfidence(withHolding.length) });
    } else {
      addStyle({ id: 'style-swing', title: 'سوئینگ', score: 75,
        description: 'زمان نگهداری میانگین بیش از ۴ ساعت است.',
        evidence: `میانگین نگهداری: ${(avgH/60).toFixed(1)} ساعت`, confidence: getConfidence(withHolding.length) });
    }
  }

  // Setup patterns → reversal vs continuation
  const setupTags = closed.flatMap(t => {
    const tags = parseSafe<string[]>(t.tags, []);
    return tags.map(t => t.toLowerCase());
  });
  const reversalCount = setupTags.filter(t => ['reversal', 'counter-trend', 'countertrend'].some(k => t.includes(k))).length;
  const continuationCount = setupTags.filter(t => ['continuation', 'trend', 'strong-trend', 'impulse'].some(k => t.includes(k))).length;
  const totalTagged = reversalCount + continuationCount;
  if (totalTagged >= 3) {
    if (reversalCount > continuationCount * 1.5) {
      addStyle({ id: 'style-reversal', title: 'ریورسال‌محور', score: Math.min(100, Math.round(reversalCount / totalTagged * 100)),
        description: 'بیشتر ست‌آپ‌های ثبت‌شده ریورسال بوده‌اند.',
        evidence: `${reversalCount} از ${totalTagged} ست‌آپ دارای برچسب ریورسال`, confidence: getConfidence(totalTagged) });
    } else if (continuationCount > reversalCount * 1.5) {
      addStyle({ id: 'style-trend', title: 'ترند-فالووینگ', score: Math.min(100, Math.round(continuationCount / totalTagged * 100)),
        description: 'بیشتر ست‌آپ‌های ثبت‌شده دنبال‌کننده ترند بوده‌اند.',
        evidence: `${continuationCount} از ${totalTagged} ست‌آپ دارای برچسب کانتینیویشن/ترند`, confidence: getConfidence(totalTagged) });
    }
  }

  // Trade frequency → selective vs active
  const allTrades = classified;
  if (allTrades.length >= 5) {
    const firstTs = allTrades[0].openedAt;
    const lastTs  = allTrades[allTrades.length-1].openedAt;
    const weeks   = Math.max(1, (lastTs - firstTs) / (7 * 86400_000));
    const tradePerWeek = allTrades.length / weeks;
    if (tradePerWeek < 2) {
      addStyle({ id: 'style-selective', title: 'انتخابگر', score: 80,
        description: 'کمتر از ۲ معامله در هفته — رویکرد انتخابی.',
        evidence: `میانگین ${tradePerWeek.toFixed(1)} معامله در هفته`, confidence: getConfidence(allTrades.length) });
    } else if (tradePerWeek > 7) {
      addStyle({ id: 'style-active', title: 'فعال', score: 80,
        description: 'بیش از ۷ معامله در هفته — رویکرد فعال.',
        evidence: `میانگین ${tradePerWeek.toFixed(1)} معامله در هفته`, confidence: getConfidence(allTrades.length) });
    }
  }

  // Symbol diversity
  const symbols = [...new Set(classified.map(t => t.symbol))];
  if (symbols.length === 1) {
    addStyle({ id: 'style-focused', title: 'متمرکز (یک نماد)', score: 90,
      description: `تمام معاملات روی نماد ${symbols[0]} انجام شده.`,
      evidence: `فقط ${symbols[0]}`, confidence: getConfidence(closed.length) });
  } else if (symbols.length <= 2) {
    addStyle({ id: 'style-focused2', title: 'متمرکز (چند نماد)', score: 75,
      description: `معاملات عمدتاً روی ${symbols.slice(0,3).join('، ')} متمرکز است.`,
      evidence: `${symbols.length} نماد`, confidence: getConfidence(closed.length) });
  }

  return items;
}

// ── Edge Evolution ─────────────────────────────────────────────────────────

function computeEdgeEvolution(classified: ClassifiedTrade[]): EdgeEvolutionItem[] {
  const closed = classified.filter(isClosed).sort((a,b) => (a.closedAt??a.openedAt)-(b.closedAt??b.openedAt));
  if (closed.length < 10) return [];

  const half = Math.floor(closed.length / 2);
  const early  = closed.slice(0, half);
  const recent = closed.slice(half);

  const items: EdgeEvolutionItem[] = [];

  function getEdgeTrend(eAR: number | null, rAR: number | null, eCnt: number, rCnt: number): EdgeTrend {
    if (eCnt < 3 || rCnt < 3) return 'insufficient';
    if (eAR == null || rAR == null) return 'insufficient';
    const delta = rAR - eAR;
    if (eCnt < 3 && rCnt >= 3)    return 'emerging';
    if (delta > 0.25)              return 'strengthening';
    if (delta < -0.25)             return 'weakening';
    if (rCnt < 3 && eCnt >= 3)    return 'disappearing';
    return 'stable';
  }

  // Sessions
  DEFAULT_SESSIONS.filter(s => !s.isOverlap).forEach(sess => {
    const eFull   = closed.filter(t => t._sessionIds.includes(sess.id));
    const eEarly  = early.filter(t => t._sessionIds.includes(sess.id));
    const eRecent = recent.filter(t => t._sessionIds.includes(sess.id));
    if (eFull.length < 3) return;
    const eAR = avgR(eEarly), rAR = avgR(eRecent);
    const trend = getEdgeTrend(eAR, rAR, eEarly.length, eRecent.length);
    items.push({
      id: `edge-session-${sess.id}`, dimType: 'session', dimLabel: sess.name, color: sess.color,
      fullCount: eFull.length, fullAvgR: avgR(eFull), fullWinRate: winRate(eFull),
      recentCount: eRecent.length, recentAvgR: rAR, recentWinRate: winRate(eRecent),
      trend, confidence: getConfidence(eRecent.length),
    });
  });

  // Symbols
  [...new Set(closed.map(t => t.symbol))].forEach(sym => {
    const eFull   = closed.filter(t => t.symbol === sym);
    const eEarly  = early.filter(t => t.symbol === sym);
    const eRecent = recent.filter(t => t.symbol === sym);
    if (eFull.length < 3) return;
    const eAR = avgR(eEarly), rAR = avgR(eRecent);
    const trend = getEdgeTrend(eAR, rAR, eEarly.length, eRecent.length);
    items.push({
      id: `edge-symbol-${sym}`, dimType: 'symbol', dimLabel: sym, color: '#6366f1',
      fullCount: eFull.length, fullAvgR: avgR(eFull), fullWinRate: winRate(eFull),
      recentCount: eRecent.length, recentAvgR: rAR, recentWinRate: winRate(eRecent),
      trend, confidence: getConfidence(eRecent.length),
    });
  });

  // Direction
  ['long','short'].forEach(dir => {
    const eFull   = closed.filter(t => t.direction === dir);
    const eEarly  = early.filter(t => t.direction === dir);
    const eRecent = recent.filter(t => t.direction === dir);
    if (eFull.length < 3) return;
    const eAR = avgR(eEarly), rAR = avgR(eRecent);
    const trend = getEdgeTrend(eAR, rAR, eEarly.length, eRecent.length);
    items.push({
      id: `edge-dir-${dir}`, dimType: 'direction', dimLabel: dir === 'long' ? 'خرید (Long)' : 'فروش (Short)', color: dir === 'long' ? '#10b981' : '#ef4444',
      fullCount: eFull.length, fullAvgR: avgR(eFull), fullWinRate: winRate(eFull),
      recentCount: eRecent.length, recentAvgR: rAR, recentWinRate: winRate(eRecent),
      trend, confidence: getConfidence(eRecent.length),
    });
  });

  return items.filter(i => i.trend !== 'insufficient');
}

// ── Coaching Insights ──────────────────────────────────────────────────────

function computeCoachingInsights(
  edgeResult: EdgeAnalyticsResult,
  patterns: BehavioralPattern[],
  strengths: StrengthItem[],
  weaknesses: StrengthItem[],
  periods: PerformancePeriod[],
  edgeEvolution: EdgeEvolutionItem[],
  corrections: Record<string, InsightCorrection>,
): CoachingInsight[] {
  const insights: CoachingInsight[] = [];
  let idCounter = 0;

  function addInsight(ins: Omit<CoachingInsight, 'isRejected' | 'isAccepted' | 'isIrrelevant'>) {
    const c = corrections[ins.id];
    insights.push({ ...ins, isRejected: c?.action === 'reject', isAccepted: false, isIrrelevant: c?.action === 'irrelevant' });
    idCounter++;
  }

  // Top strength
  const topStrength = strengths.filter(s => s.confidence !== 'insufficient').sort((a,b) => (b.avgR??-99)-(a.avgR??-99))[0];
  if (topStrength) {
    addInsight({ id: 'coach-top-strength', type: 'strength', priority: 'high',
      title: topStrength.title,
      body: `داده‌های تاریخی نشان می‌دهد: ${topStrength.description}`,
      evidence: topStrength.evidence, confidence: topStrength.confidence });
  }

  // Top weakness
  const topWeakness = weaknesses.filter(w => w.confidence !== 'insufficient').sort((a,b) => (a.avgR??99)-(b.avgR??99))[0];
  if (topWeakness) {
    addInsight({ id: 'coach-top-weakness', type: 'weakness', priority: 'high',
      title: topWeakness.title,
      body: topWeakness.description,
      evidence: topWeakness.evidence, confidence: topWeakness.confidence });
  }

  // Performance trend insight
  if (periods.length >= 2) {
    const recent = periods.find(p => p.label === 'آخرین ۲۰');
    const all    = periods.find(p => p.label === 'همه زمان‌ها');
    if (recent && all && recent.avgR != null && all.avgR != null) {
      const delta = recent.avgR - all.avgR;
      if (delta > 0.1) {
        addInsight({ id: 'coach-perf-improving', type: 'improvement', priority: 'medium',
          title: 'عملکرد اخیر بالاتر از میانگین کلی',
          body: `میانگین R در ۲۰ معامله اخیر (${recent.avgR.toFixed(2)}R) از میانگین کلی (${all.avgR.toFixed(2)}R) بالاتر است.`,
          evidence: [
            { label: 'میانگین ۲۰ اخیر', value: `${recent.avgR.toFixed(2)}R` },
            { label: 'میانگین کلی', value: `${all.avgR.toFixed(2)}R` },
            { label: 'تفاوت', value: `+${delta.toFixed(2)}R` },
          ], confidence: getConfidence(recent.count) });
      } else if (delta < -0.1) {
        addInsight({ id: 'coach-perf-declining', type: 'warning', priority: 'high',
          title: 'عملکرد اخیر پایین‌تر از میانگین کلی',
          body: `میانگین R در ۲۰ معامله اخیر (${recent.avgR.toFixed(2)}R) از میانگین کلی (${all.avgR.toFixed(2)}R) پایین‌تر است.`,
          evidence: [
            { label: 'میانگین ۲۰ اخیر', value: `${recent.avgR.toFixed(2)}R` },
            { label: 'میانگین کلی', value: `${all.avgR.toFixed(2)}R` },
            { label: 'تفاوت', value: `${delta.toFixed(2)}R` },
          ], confidence: getConfidence(recent.count) });
      }
    }
  }

  // Improving behavior
  const improvingPattern = patterns.filter(p => p.trend === 'resolving' || p.trend === 'improving').sort((a,b) => b.frequency-a.frequency)[0];
  if (improvingPattern) {
    addInsight({ id: `coach-behav-improving-${improvingPattern.id}`, type: 'improvement', priority: 'medium',
      title: `${improvingPattern.name}: روند بهبود مشاهده می‌شود`,
      body: `نرخ ${improvingPattern.name} از ${improvingPattern.earlyRate?.toFixed(0)??'—'}٪ (ابتدا) به ${improvingPattern.recentRate?.toFixed(0)??'—'}٪ (اخیر) کاهش یافته.`,
      evidence: [
        { label: 'نرخ اولیه', value: `${improvingPattern.earlyRate?.toFixed(0)??'—'}٪` },
        { label: 'نرخ اخیر', value: `${improvingPattern.recentRate?.toFixed(0)??'—'}٪` },
        { label: 'تعداد', value: `${improvingPattern.frequency} بار` },
      ], confidence: improvingPattern.confidence });
  }

  // Worsening behavior
  const worsePattern = patterns.filter(p => p.trend === 'worsening' || p.trend === 'emerging').sort((a,b) => b.frequency-a.frequency)[0];
  if (worsePattern) {
    addInsight({ id: `coach-behav-worsening-${worsePattern.id}`, type: 'warning', priority: 'high',
      title: `${worsePattern.name}: افزایش اخیر مشاهده می‌شود`,
      body: `داده‌های اخیر افزایش ${worsePattern.name} را نشان می‌دهد. نرخ: ${worsePattern.earlyRate?.toFixed(0)??'—'}٪ → ${worsePattern.recentRate?.toFixed(0)??'—'}٪.`,
      evidence: [
        { label: 'نرخ اولیه', value: `${worsePattern.earlyRate?.toFixed(0)??'—'}٪` },
        { label: 'نرخ اخیر', value: `${worsePattern.recentRate?.toFixed(0)??'—'}٪` },
        { label: 'اثر بر R', value: worsePattern.impactOnR != null ? `${worsePattern.impactOnR.toFixed(2)}R` : '—' },
      ], confidence: worsePattern.confidence });
  }

  // Edge evolution
  const strengthening = edgeEvolution.filter(e => e.trend === 'strengthening')[0];
  if (strengthening) {
    addInsight({ id: `coach-edge-${strengthening.id}`, type: 'improvement', priority: 'medium',
      title: `${strengthening.dimLabel}: مزیت در حال تقویت`,
      body: `عملکرد در ${strengthening.dimLabel} در دوره اخیر بهبود یافته.`,
      evidence: [
        { label: 'میانگین R کلی', value: `${strengthening.fullAvgR?.toFixed(2)??'—'}R` },
        { label: 'میانگین R اخیر', value: `${strengthening.recentAvgR?.toFixed(2)??'—'}R` },
        { label: 'معاملات اخیر', value: `${strengthening.recentCount}` },
      ], confidence: strengthening.confidence });
  }
  const weakening = edgeEvolution.filter(e => e.trend === 'weakening')[0];
  if (weakening) {
    addInsight({ id: `coach-edge-weak-${weakening.id}`, type: 'warning', priority: 'medium',
      title: `${weakening.dimLabel}: مزیت در حال تضعیف`,
      body: `عملکرد در ${weakening.dimLabel} در دوره اخیر کاهش یافته. مراقبت توصیه می‌شود.`,
      evidence: [
        { label: 'میانگین R کلی', value: `${weakening.fullAvgR?.toFixed(2)??'—'}R` },
        { label: 'میانگین R اخیر', value: `${weakening.recentAvgR?.toFixed(2)??'—'}R` },
      ], confidence: weakening.confidence });
  }

  // SL moved warning
  const slMoved = patterns.find(p => p.id === 'sl-moved');
  if (slMoved && slMoved.rate > 15) {
    addInsight({ id: 'coach-sl-moved', type: 'warning', priority: 'high',
      title: 'جابجایی مکرر حد ضرر',
      body: `در ${slMoved.frequency} معامله (${slMoved.rate.toFixed(0)}٪) حد ضرر جابجا شده. ${slMoved.impactOnR != null && slMoved.impactOnR < 0 ? `این رفتار با افت ${Math.abs(slMoved.impactOnR).toFixed(2)}R همراه بوده.` : ''}`,
      evidence: [
        { label: 'تعداد', value: `${slMoved.frequency}` },
        { label: 'نرخ', value: `${slMoved.rate.toFixed(0)}٪` },
        { label: 'روند', value: BEHAVIOR_TREND_FA[slMoved.trend] },
      ], confidence: slMoved.confidence });
  }

  return insights.slice(0, 8); // Max 8 insights
}

// ── Development Timeline ───────────────────────────────────────────────────

function computeDevelopmentEvents(
  sorted: ClassifiedTrade[],
  patterns: BehavioralPattern[],
  edgeEvolution: EdgeEvolutionItem[],
): DevelopmentEvent[] {
  const events: DevelopmentEvent[] = [];

  if (!sorted.length) return events;

  const third = Math.floor(sorted.length / 3);
  const periods = [
    { label: 'دوره اول', trades: sorted.slice(0, third) },
    { label: 'دوره میانی', trades: sorted.slice(third, third * 2) },
    { label: 'دوره اخیر', trades: sorted.slice(third * 2) },
  ];

  // Performance change across periods
  periods.forEach((p, i) => {
    if (!p.trades.length) return;
    const ar = avgR(p.trades);
    const wr = winRate(p.trades);
    const pRange = p.trades.length >= 2
      ? `${toDateStr(p.trades[0].openedAt)} تا ${toDateStr(p.trades[p.trades.length-1].openedAt)}`
      : toDateStr(p.trades[0].openedAt);

    if (ar != null && ar > 0.5) {
      events.push({ id: `perf-strong-${i}`, periodLabel: p.label, type: 'strength',
        title: `عملکرد قوی در ${p.label}`,
        description: `میانگین R: ${ar.toFixed(2)}, درصد برد: ${wr.toFixed(0)}٪ — ${pRange}` });
    }
  });

  // Behavioral changes
  patterns.filter(p => p.trend === 'resolving').forEach(pat => {
    events.push({ id: `behav-resolving-${pat.id}`, periodLabel: 'روند بهبود', type: 'improvement',
      title: `کاهش ${pat.name}`,
      description: `نرخ ${pat.name} از ${pat.earlyRate?.toFixed(0)??'—'}٪ به ${pat.recentRate?.toFixed(0)??'—'}٪ رسیده.` });
  });
  patterns.filter(p => p.trend === 'worsening').forEach(pat => {
    events.push({ id: `behav-worse-${pat.id}`, periodLabel: 'روند نگران‌کننده', type: 'warning',
      title: `افزایش ${pat.name}`,
      description: `نرخ ${pat.name} از ${pat.earlyRate?.toFixed(0)??'—'}٪ به ${pat.recentRate?.toFixed(0)??'—'}٪ رسیده.` });
  });

  // Edge changes
  edgeEvolution.filter(e => e.trend === 'strengthening').forEach(e => {
    events.push({ id: `edge-str-${e.id}`, periodLabel: 'تقویت مزیت', type: 'strength',
      title: `مزیت ${e.dimLabel} تقویت شده`,
      description: `میانگین R: کلی ${e.fullAvgR?.toFixed(2)??'—'}R → اخیر ${e.recentAvgR?.toFixed(2)??'—'}R` });
  });
  edgeEvolution.filter(e => e.trend === 'weakening').forEach(e => {
    events.push({ id: `edge-weak-${e.id}`, periodLabel: 'تضعیف مزیت', type: 'warning',
      title: `مزیت ${e.dimLabel} تضعیف شده`,
      description: `میانگین R: کلی ${e.fullAvgR?.toFixed(2)??'—'}R → اخیر ${e.recentAvgR?.toFixed(2)??'—'}R` });
  });

  return events.slice(0, 12);
}

// ── Empty Profile ──────────────────────────────────────────────────────────

function emptyProfile(edgeResult: EdgeAnalyticsResult, extResult: ExtendedAnalyticsResult): TraderProfileData {
  return {
    computedAt: Date.now(), tradeCount: 0, closedCount: 0, dateRange: null,
    overallMetrics: edgeResult.overallMetrics, maxDrawdown: null,
    bestSession: null, worstSession: null, bestDay: null, worstDay: null, bestHour: null, bestSymbol: null, worstSymbol: null,
    avgAdherence: null, avgHoldingMinutes: null,
    behavioralPatterns: [], strengths: [], weaknesses: [], watchlist: [],
    periods: [], performanceTrend: 'insufficient', performanceTrendDesc: 'داده کافی وجود ندارد.',
    styleTendencies: [], edgeEvolution: [], coachingInsights: [], developmentEvents: [],
    edgeResult, extendedResult: extResult,
  };
}

// ── Main Entry Point ───────────────────────────────────────────────────────

export function computeTraderProfile(
  trades: Trade[],
  strategies: { id: string; name: string }[],
  timezoneOffsetHours = 0,
  corrections: Record<string, InsightCorrection> = {},
): TraderProfileData {
  const edgeResult    = computeEdgeAnalytics(trades, strategies, timezoneOffsetHours);
  const extendedResult = computeExtendedAnalytics(edgeResult.classified);
  const classified    = edgeResult.classified;
  const closed        = classified.filter(isClosed).sort((a,b) => (a.closedAt??a.openedAt)-(b.closedAt??b.openedAt));

  if (closed.length === 0) return emptyProfile(edgeResult, extendedResult);

  const firstTs = closed[0].openedAt;
  const lastTs  = closed[closed.length-1].openedAt;
  const dateRange = { from: toDateStr(firstTs), to: toDateStr(lastTs) };

  const behavioralPatterns = computeBehavioralPatterns(classified);
  const { strengths, weaknesses, watchlist } = computeStrengthsWeaknesses(edgeResult, extendedResult, behavioralPatterns, corrections);
  const { periods, performanceTrend, performanceTrendDesc } = computePerformanceEvolution(closed, trades);
  const styleTendencies = computeStyleTendencies(classified, corrections);
  const edgeEvolution   = computeEdgeEvolution(classified);
  const developmentEvents = computeDevelopmentEvents(closed, behavioralPatterns, edgeEvolution);
  const coachingInsights  = computeCoachingInsights(edgeResult, behavioralPatterns, strengths, weaknesses, periods, edgeEvolution, corrections);

  const bestSessionObj  = edgeResult.sessionSlices.filter(s => !s.isOverlap && s.metrics.confidence !== 'insufficient').sort((a,b) => (b.metrics.avgR??-99)-(a.metrics.avgR??-99))[0];
  const worstSessionObj = edgeResult.sessionSlices.filter(s => !s.isOverlap && s.metrics.confidence !== 'insufficient').sort((a,b) => (a.metrics.avgR??99)-(b.metrics.avgR??99))[0];
  const bestDayObj      = edgeResult.daySlices.filter(d => d.metrics.confidence !== 'insufficient').sort((a,b) => (b.metrics.avgR??-99)-(a.metrics.avgR??-99))[0];
  const worstDayObj     = edgeResult.daySlices.filter(d => d.metrics.confidence !== 'insufficient').sort((a,b) => (a.metrics.avgR??99)-(b.metrics.avgR??99))[0];
  const bestHourObj     = edgeResult.hourSlices.filter(h => h.metrics.confidence !== 'insufficient').sort((a,b) => (b.metrics.avgR??-99)-(a.metrics.avgR??-99))[0];
  const bestSymbolObj   = edgeResult.symbolSlices.filter(s => s.metrics.confidence !== 'insufficient').sort((a,b) => (b.metrics.avgR??-99)-(a.metrics.avgR??-99))[0];
  const worstSymbolObj  = edgeResult.symbolSlices.filter(s => s.metrics.confidence !== 'insufficient').sort((a,b) => (a.metrics.avgR??99)-(b.metrics.avgR??99))[0];

  const withAdherence = classified.filter(t => t.adherenceScore != null);
  const withHolding   = classified.filter(t => t._holdingMinutes != null);

  return {
    computedAt: Date.now(),
    tradeCount: classified.length,
    closedCount: closed.length,
    dateRange,
    overallMetrics: edgeResult.overallMetrics,
    maxDrawdown: maxDD(closed),
    bestSession:  bestSessionObj?.name  ?? null,
    worstSession: worstSessionObj?.name ?? null,
    bestDay:      bestDayObj?.name      ?? null,
    worstDay:     worstDayObj?.name     ?? null,
    bestHour:     bestHourObj?.label    ?? null,
    bestSymbol:   bestSymbolObj?.symbol ?? null,
    worstSymbol:  worstSymbolObj?.symbol ?? null,
    avgAdherence:      withAdherence.length ? withAdherence.reduce((s,t) => s+t.adherenceScore!,0)/withAdherence.length : null,
    avgHoldingMinutes: withHolding.length   ? withHolding.reduce((s,t) => s+t._holdingMinutes!,0)/withHolding.length   : null,
    behavioralPatterns,
    strengths,
    weaknesses,
    watchlist,
    periods,
    performanceTrend,
    performanceTrendDesc,
    styleTendencies,
    edgeEvolution,
    coachingInsights,
    developmentEvents,
    edgeResult,
    extendedResult,
  };
}

// ── NL Q&A ────────────────────────────────────────────────────────────────

export function answerProfileQuestion(question: string, profile: TraderProfileData): ProfileNLAnswer {
  const q = question.toLowerCase();

  const noData = (q: string): ProfileNLAnswer => ({ question: q, answer: 'داده کافی برای پاسخ به این سوال وجود ندارد.', evidence: [], confidence: 'insufficient' });

  if (q.includes('قوی') || q.includes('نقاط قوت') || q.includes('بهترین')) {
    const top3 = profile.strengths.filter(s => !s.isRejected).slice(0, 3);
    if (!top3.length) return noData(question);
    return { question, confidence: top3[0].confidence,
      answer: `قوی‌ترین نقاط شما: ${top3.map(s => s.title).join('، ')}.`,
      evidence: top3.flatMap(s => s.evidence.slice(0,2)) };
  }

  if (q.includes('اشتباه') || q.includes('تکرار') || q.includes('ضعف')) {
    const topBehav = profile.behavioralPatterns.sort((a,b) => b.rate - a.rate)[0];
    const topWeak  = profile.weaknesses.filter(w => !w.isRejected)[0];
    if (!topBehav && !topWeak) return noData(question);
    const answers = [];
    if (topBehav) answers.push(`${topBehav.name} (${topBehav.rate.toFixed(0)}٪ معاملات)`);
    if (topWeak)  answers.push(topWeak.title);
    return { question, confidence: topBehav?.confidence ?? 'weak',
      answer: `پرتکرارترین رفتار: ${answers.join('، ')}.`,
      evidence: [
        ...(topBehav ? [{ label: topBehav.name, value: `${topBehav.frequency} بار (${topBehav.rate.toFixed(0)}٪)` }] : []),
        ...(topWeak ? topWeak.evidence.slice(0,2) : []),
      ] };
  }

  if (q.includes('پیشرفت') || q.includes('بهبود') || q.includes('تغییر')) {
    return { question, confidence: getConfidence(profile.closedCount),
      answer: profile.performanceTrendDesc,
      evidence: profile.periods.slice(0,3).map(p => ({ label: p.label, value: `${p.avgR?.toFixed(2)??'—'}R (${p.count} معامله)` })) };
  }

  if (q.includes('سشن') || q.includes('بهترین شرایط')) {
    if (!profile.bestSession) return noData(question);
    return { question, confidence: getConfidence(profile.closedCount),
      answer: `بهترین شرایط تاریخی: سشن ${profile.bestSession}${profile.bestDay ? `، روز ${profile.bestDay}` : ''}${profile.bestSymbol ? `، نماد ${profile.bestSymbol}` : ''}.`,
      evidence: [
        { label: 'بهترین سشن', value: profile.bestSession ?? '—' },
        { label: 'بهترین روز', value: profile.bestDay ?? '—' },
        { label: 'بهترین نماد', value: profile.bestSymbol ?? '—' },
      ] };
  }

  if (q.includes('سبک') || q.includes('چگونه معامله')) {
    const top = profile.styleTendencies.filter(s => !s.isRejected)[0];
    if (!top) return noData(question);
    return { question, confidence: top.confidence,
      answer: `بر اساس تاریخچه، سبک معاملاتی شما عمدتاً «${top.title}» است. ${top.description}`,
      evidence: profile.styleTendencies.filter(s => !s.isRejected).map(s => ({ label: s.title, value: `امتیاز: ${s.score}` })) };
  }

  return { question, confidence: 'insufficient',
    answer: 'این سوال را نمی‌توانم با داده‌های موجود پاسخ دهم. سوالات پیشنهادی را امتحان کنید.',
    evidence: [] };
}

// ── Pre-Trade Checklist ────────────────────────────────────────────────────

export function generatePreTradeChecklist(
  symbol: string,
  sessionId: string,
  profile: TraderProfileData,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  // Core checks
  items.push({ id: 'cl-htf', question: 'آیا تحلیل تایم‌فریم بالاتر کامل شده؟', reason: 'تأیید تایم‌فریم بالا ضروری است.', priority: 'high' });

  // Session-based
  const sess = DEFAULT_SESSIONS.find(s => s.id === sessionId);
  if (sess) {
    const sessPerf = profile.edgeResult.sessionSlices.find(s => s.sessionId === sessionId);
    if (sessPerf && (sessPerf.metrics.avgR ?? 0) < (profile.overallMetrics.avgR ?? 0) - 0.2) {
      items.push({ id: 'cl-session', question: `آیا مطمئن هستید که سشن ${sess.name} برای این معامله مناسب است؟`, reason: `داده‌های تاریخی نشان می‌دهد عملکرد شما در سشن ${sess.name} پایین‌تر از میانگین بوده.`, priority: 'high' });
    }
  }

  // Symbol-based
  const symPerf = profile.edgeResult.symbolSlices.find(s => s.symbol === symbol);
  if (symPerf && (symPerf.metrics.avgR ?? 0) < (profile.overallMetrics.avgR ?? 0) - 0.2) {
    items.push({ id: 'cl-symbol', question: `آیا شرایط ${symbol} برای این ست‌آپ مناسب است؟`, reason: `عملکرد تاریخی شما روی ${symbol} پایین‌تر از میانگین بوده.`, priority: 'medium' });
  }

  // Behavioral checks
  const fomoPattern = profile.behavioralPatterns.find(p => p.id === 'fomo');
  if (fomoPattern && fomoPattern.rate > 10) {
    items.push({ id: 'cl-fomo', question: 'آیا این ورود بر اساس تأیید واقعی است، نه فشار بازار؟', reason: `FOMO در ${fomoPattern.rate.toFixed(0)}٪ معاملات مشاهده شده.`, priority: 'high' });
  }

  const earlyEntry = profile.behavioralPatterns.find(p => p.id === 'hesitation' || p.id === 'impatience');
  if (earlyEntry && earlyEntry.rate > 10) {
    items.push({ id: 'cl-early', question: 'آیا تأیید ورود کامل شده؟', reason: `ورود ناقص در ${earlyEntry.rate.toFixed(0)}٪ معاملات مشاهده شده.`, priority: 'high' });
  }

  const slMoved = profile.behavioralPatterns.find(p => p.id === 'sl-moved');
  if (slMoved && slMoved.rate > 10) {
    items.push({ id: 'cl-sl', question: 'آیا حد ضرر دقیق تعریف شده و جابجایی آن ممنوع است؟', reason: `جابجایی SL در ${slMoved.rate.toFixed(0)}٪ معاملات مشاهده شده.`, priority: 'high' });
  }

  items.push({ id: 'cl-risk', question: 'آیا ریسک این معامله در محدوده تاریخی شما است؟', reason: 'مدیریت ریسک منسجم.', priority: 'medium' });
  items.push({ id: 'cl-plan', question: 'آیا پلن کامل (ورود، خروج، حد ضرر) تعریف شده؟', reason: 'پیروی از پلن با عملکرد بهتر همراه است.', priority: 'medium' });

  return items;
}

// ── Post-Trade Feedback ────────────────────────────────────────────────────

export function generatePostTradeFeedback(
  tradeTags: string[],
  behaviorFlags: string[],
  slMoved: boolean,
  closedEarly: boolean,
  profile: TraderProfileData,
): PostTradeFeedback {
  const observations: PostTradeFeedback['behaviorObservations'] = [];

  const BEHAV_FA: Record<string, string> = {
    fomo: 'FOMO', hesitation: 'تردید', fear: 'ترس', impatience: 'بی‌صبری',
    overconfidence: 'اعتماد کاذب', 'revenge-trading': 'معامله انتقامی', uncertainty: 'عدم اطمینان',
  };

  behaviorFlags.forEach(flag => {
    const hist = profile.behavioralPatterns.find(p => p.id === flag);
    if (hist) {
      const impact = hist.impactOnR != null
        ? `تاریخاً این رفتار با ${hist.impactOnR > 0 ? '+' : ''}${hist.impactOnR.toFixed(2)}R همراه بوده.`
        : `این رفتار در ${hist.frequency} معامله قبلی مشاهده شده.`;
      observations.push({ flag, name: BEHAV_FA[flag] ?? flag, historicalImpact: impact });
    }
  });

  if (slMoved) {
    const hist = profile.behavioralPatterns.find(p => p.id === 'sl-moved');
    observations.push({ flag: 'sl-moved', name: 'جابجایی SL', historicalImpact: hist ? `این رفتار در ${hist.rate.toFixed(0)}٪ معاملات تاریخی مشاهده شده.` : 'جابجایی SL ثبت شده.' });
  }
  if (closedEarly) {
    const hist = profile.behavioralPatterns.find(p => p.id === 'closed-early');
    observations.push({ flag: 'closed-early', name: 'خروج زودهنگام', historicalImpact: hist ? `این رفتار در ${hist.rate.toFixed(0)}٪ معاملات تاریخی مشاهده شده.` : 'خروج زودهنگام ثبت شده.' });
  }

  const overallComment = observations.length === 0
    ? 'این معامله الگوی رفتاری خاصی ثبت نکرده. پروفایل رفتاری شما به‌روز خواهد شد.'
    : `${observations.length} رفتار در این معامله مشاهده شد که با تاریخچه شما مطابقت دارد.`;

  return {
    behaviorObservations: observations,
    entryTimingNote: null,
    slNote: slMoved ? 'جابجایی SL در این معامله ثبت شد.' : null,
    similarTradesNote: null,
    overallObservation: overallComment,
    confidence: getConfidence(profile.closedCount),
  };
}
