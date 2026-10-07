/** ── Live Trade Monitoring Types — Prompt 16 ─────────────────────────── */

export type LiveTradeState =
  | 'planned' | 'pending' | 'entered' | 'developing'
  | 'in-profit' | 'in-drawdown' | 'near-stop-loss'
  | 'near-take-profit' | 'partial-exit' | 'breakeven' | 'closed';

export type TradeEventType =
  | 'plan-snapshot' | 'entry' | 'screenshot' | 'observation'
  | 'sl-modify' | 'tp-modify' | 'partial-exit' | 'state-change'
  | 'management-action' | 'plan-note' | 'r-update' | 'close';

// ── Core event ─────────────────────────────────────────────────────

export interface TradeEvent {
  id: string;
  type: TradeEventType;
  timestamp: number;
  price: number | null;
  rMultiple: number | null;
  note: string | null;
  screenshotDataUrl: string | null;
  timeframe: string | null;
  state: LiveTradeState | null;
}

// ── Immutable original plan snapshot ──────────────────────────────

export interface TradePlan {
  originalAnalysis: string;
  plannedEntry: number;
  actualEntry: number | null;
  stopLoss: number;
  takeProfit: number | null;
  expectedDirection: 'long' | 'short';
  expectedBehavior: string;
  invalidationCondition: string;
  expectedConfirmation: string;
  plannedRisk: number | null;
  plannedPositionSize: number | null;
  plannedRR: number | null;
  createdAt: number;
}

// ── Scenario tracking ─────────────────────────────────────────────

export interface TradeScenario {
  id: string;
  type: 'primary' | 'alternative' | 'invalidation';
  description: string;
  status: 'pending' | 'developing' | 'consistent' | 'inconsistent' | 'triggered';
  notes: string | null;
  updatedAt: number;
}

// ── R progression ─────────────────────────────────────────────────

export interface RProgressionPoint {
  timestamp: number;
  price: number;
  rMultiple: number;
  note: string | null;
}

// ── Plan drift ────────────────────────────────────────────────────

export interface PlanDeviation {
  id: string;
  field: string;
  label: string;
  original: string;
  current: string;
  detectedAt: number;
}

// ── Insights ──────────────────────────────────────────────────────

export type InsightCategory =
  | 'plan-alignment' | 'historical-similarity'
  | 'market-development' | 'behavior-observation' | 'data-confidence';

export interface LiveInsight {
  id: string;
  category: InsightCategory;
  text: string;
  confidence: 'low' | 'medium' | 'high';
  generatedAt: number;
}

// ── Behavior ──────────────────────────────────────────────────────

export type BehaviorPattern =
  | 'sl-widened' | 'early-close' | 'tp-reduced'
  | 'sl-to-be' | 'partial-exit' | 'added-position';

export interface BehaviorObservation {
  id: string;
  pattern: BehaviorPattern;
  description: string;
  historicalCount: number;
  detectedAt: number;
}

// ── Historical comparisons ────────────────────────────────────────

export interface HistoricalComparison {
  tradeId: string;
  symbol: string;
  direction: 'long' | 'short';
  result: string;
  rMultiple: number | null;
  similarity: string;
  openedAt: number;
  whatHappened: string;
}

// ── Root live monitoring model ────────────────────────────────────

export interface LiveMonitoringData {
  state: LiveTradeState;
  stateHistory: Array<{
    state: LiveTradeState;
    timestamp: number;
    price: number | null;
    reason: string | null;
  }>;
  planSnapshot: TradePlan | null;
  scenarios: TradeScenario[];
  events: TradeEvent[];
  rProgression: RProgressionPoint[];
  maxFavorableExcursion: number | null;
  maxAdverseExcursion: number | null;
  planDeviations: PlanDeviation[];
  behaviorObservations: BehaviorObservation[];
  historicalComparisons: HistoricalComparison[];
  liveInsights: LiveInsight[];
  lastUpdatedAt: number;
}

export function defaultLiveMonitoring(overrides?: Partial<LiveMonitoringData>): LiveMonitoringData {
  return {
    state: 'entered',
    stateHistory: [],
    planSnapshot: null,
    scenarios: [],
    events: [],
    rProgression: [],
    maxFavorableExcursion: null,
    maxAdverseExcursion: null,
    planDeviations: [],
    behaviorObservations: [],
    historicalComparisons: [],
    liveInsights: [],
    lastUpdatedAt: Date.now(),
    ...overrides,
  };
}

// ── Labels (Persian) ──────────────────────────────────────────────

export const LIVE_STATE_LABELS: Record<LiveTradeState, string> = {
  planned: 'برنامه‌ریزی',
  pending: 'در انتظار',
  entered: 'وارد شده',
  developing: 'در جریان',
  'in-profit': 'در سود',
  'in-drawdown': 'در ضرر موقت',
  'near-stop-loss': 'نزدیک استاپ',
  'near-take-profit': 'نزدیک هدف',
  'partial-exit': 'خروج جزئی',
  breakeven: 'سربه‌سر',
  closed: 'بسته شده',
};

export const LIVE_STATE_COLORS: Record<LiveTradeState, string> = {
  planned:           'bg-slate-500/20 text-slate-400 border-slate-500/30',
  pending:           'bg-amber-500/20 text-amber-400 border-amber-500/30',
  entered:           'bg-blue-500/20 text-blue-400 border-blue-500/30',
  developing:        'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'in-profit':       'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'in-drawdown':     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'near-stop-loss':  'bg-red-500/20 text-red-400 border-red-500/30',
  'near-take-profit':'bg-teal-500/20 text-teal-400 border-teal-500/30',
  'partial-exit':    'bg-purple-500/20 text-purple-400 border-purple-500/30',
  breakeven:         'bg-sky-500/20 text-sky-400 border-sky-500/30',
  closed:            'bg-muted text-muted-foreground border-border',
};

export const EVENT_ICONS: Record<TradeEventType, string> = {
  'plan-snapshot': '📋',
  entry:           '🟢',
  screenshot:      '📸',
  observation:     '👁',
  'sl-modify':     '🔴',
  'tp-modify':     '🎯',
  'partial-exit':  '📤',
  'state-change':  '🔄',
  'management-action': '⚙️',
  'plan-note':     '📝',
  'r-update':      '📊',
  close:           '🔒',
};

export const EVENT_LABELS: Record<TradeEventType, string> = {
  'plan-snapshot': 'اسنپ پلن',
  entry:           'ورود',
  screenshot:      'اسکرین‌شات',
  observation:     'مشاهده بازار',
  'sl-modify':     'تغییر استاپ',
  'tp-modify':     'تغییر هدف',
  'partial-exit':  'خروج جزئی',
  'state-change':  'تغییر وضعیت',
  'management-action': 'اقدام مدیریتی',
  'plan-note':     'یادداشت پلن',
  'r-update':      'آپدیت R',
  close:           'بسته شدن',
};

export const SCENARIO_TYPE_LABELS: Record<TradeScenario['type'], string> = {
  primary:     'سناریو اصلی',
  alternative: 'سناریو جایگزین',
  invalidation: 'شرط باطل‌شدن',
};

export const SCENARIO_STATUS_LABELS: Record<TradeScenario['status'], string> = {
  pending:      'در انتظار',
  developing:   'در حال توسعه',
  consistent:   'سازگار',
  inconsistent: 'ناسازگار',
  triggered:    'فعال شد',
};
