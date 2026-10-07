import Dexie, { Table } from 'dexie';

// ── کمک: تبدیل Base64 dataUrl به Blob ──────────────────────────────────────
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

/** بازسازی dataUrl از Blob برای نمایش در <img src="..."> */
export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  colorTag: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Phase {
  id: string;
  strategyId: string;
  name: string;
  description: string;
  order: number;
}

export interface Rule {
  id: string;
  stepId: string;
  title: string;
  description: string;
  type: 'checkbox' | 'text' | 'textarea' | 'number' | 'select' | 'multi-select' | 'date' | 'image' | 'conditional';
  required: boolean;
  order: number;
  options: string; // JSON string[]
  /** متن شرط و اقدام برای Ruleهای «اگر… آنگاه…» */
  condition?: string;
  action?: string;
}

export interface Step {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  type: 'checkbox' | 'text' | 'textarea' | 'rating' | 'number' | 'select' | 'multi-select' | 'date' | 'image';
  required: boolean;
  order: number;
  options: string; // JSON string of string[]
  hint: string | null;
}

export interface AnalysisSession {
  id: string;
  strategyId: string;
  title: string | null;
  status: 'in-progress' | 'completed' | 'abandoned';
  startedAt: number;
  completedAt: number | null;
  currentPhaseId: string | null;
  currentStepId: string | null;
  stepResults: string; // JSON Record<stepId, {value: any, answeredAt: number}>
  notes: string | null;
  tradeId: string | null;
  finalDecision: string | null; // JSON {choice: 'execute'|'no-trade'|'wait'|'cancelled', reason: string}
}

export interface Trade {
  id: string;
  sessionId: string | null;
  /** Session-based journal link. Kept separate from sessionId, which belongs to AnalysisSession. */
  journalSessionId?: string | null;
  /** آخرین تحلیل (Analysis Event) که این معامله بر پایهٔ آن باز شد — اختیاری */
  analysisEventId?: string | null;
  /** تریگر ۱ دقیقه‌ای ورود (JournalTriggerEvent) — اختیاری */
  triggerEventId?: string | null;
  strategyId: string | null;
  accountId: string | null;   // حساب معاملاتی
  boxId: string | null;        // باکس معاملاتی
  symbol: string;
  market: string | null;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number | null;
  positionSize: number | null;
  riskPercentage: number | null;
  riskAmount: number | null;
  rMultiple: number | null;
  result: 'win' | 'loss' | 'breakeven' | 'partial-win' | 'partial-loss' | 'open' | 'cancelled';
  profitLoss: number | null;
  fees: number | null;
  commission?: number | null;   // کمیسیون جدا از سایر هزینه‌ها
  spread?: number | null;       // هزینه اسپرد به واحد ارز حساب
  /** سواپ (علامت‌دار): منفی = هزینه، مثبت = درآمد. به سود خالص اضافه می‌شود. */
  swap?: number | null;
  status: 'open' | 'closed' | 'cancelled';
  openedAt: number;
  closedAt: number | null;
  reasonForExit: string | null;
  emotions: string; // JSON string[]
  emotionNotes: string | null;
  notes: string | null;
  screenshots: string; // JSON {id,label,dataUrl,type,linkedTo}[]
  adherenceScore: number | null;
  adherenceRating: 'fully' | 'mostly' | 'partially' | 'not' | null;
  adherenceNotes: string | null;
  review: string; // JSON {didWell,didWrong,learned,wouldTakeAgain,validSetup}
  postTradeReview: string; // JSON PostTradeReviewData — ریویوی ساختاریافته پس از معامله
  tags: string; // JSON string[]
  createdAt: number;
  // Prompt 16 — Live monitoring data (JSON LiveMonitoringData)
  liveMonitoring: string | null;
  // ── Prompt 23 — Extended fields ─────────────────────────────────────────
  // Planned trade
  plannedEntry: number | null;
  plannedSL: number | null;
  plannedTP: number | null;
  plannedRR: number | null;
  plannedRisk: number | null;
  plannedPositionSize: number | null;
  // Trade context
  tradingSession: string | null;   // 'london' | 'new-york' | 'asia' | 'overlap' | 'other'
  setupType: string | null;        // 'break-and-retest' | 'fvg' | 'liquidity-grab' | ...
  timezone: string | null;
  entryReason: string | null;      // free-text reason for entry
  lesson: string | null;           // post-trade lesson (separate from review)
  // Management
  slMoved: boolean | null;
  tpMoved: boolean | null;
  partialClose: boolean | null;
  addedToPosition: boolean | null;
  reducedPosition: boolean | null;
  manualExit: boolean | null;
  managementReason: string | null;
  // Multi-timeframe analysis (JSON MTFAnalysis)
  mtfAnalysis: string | null;
  // Briefing پیش از معامله، قابل ویرایش و ذخیره در backup
  preTradeBriefing?: string | null;
}

/** ── Multi-Timeframe Analysis ─────────────────────────────────────── */
export interface MTFScenario {
  id: string;
  direction: 'long' | 'short' | 'both';
  timeframe: string;
  trigger: string;
  invalidation: string;
  action: string;
  enabled: boolean;
}

export interface MTFTimeframeAnalysis {
  screenshotId: string | null;
  bias: string;
  structure: string;
  context: string;
  confirmation: string;
  importantLevels: string;
  notes: string;
}

export interface MTFAnalysis {
  '4H': MTFTimeframeAnalysis;
  '15M': MTFTimeframeAnalysis;
  '5M': MTFTimeframeAnalysis;
  '1M': MTFTimeframeAnalysis;
  scenarios?: MTFScenario[];
}

export const defaultMTFTimeframe: MTFTimeframeAnalysis = {
  screenshotId: null, bias: '', structure: '', context: '',
  confirmation: '', importantLevels: '', notes: '',
};

export const defaultMTFAnalysis: MTFAnalysis = {
  '4H': { ...defaultMTFTimeframe },
  '15M': { ...defaultMTFTimeframe },
  '5M': { ...defaultMTFTimeframe },
  '1M': { ...defaultMTFTimeframe },
};

/** ── Trade Event (for timeline) ───────────────────────────────────── */
export type TradeEventType =
  | 'entry' | 'exit' | 'sl-move' | 'tp-move'
  | 'partial-close' | 'add-to-position' | 'reduce-position'
  | 'manual-exit' | 'note' | 'screenshot';

export interface TradeEvent {
  id: string;
  tradeId: string;
  eventType: TradeEventType;
  timestamp: number;        // user-entered time of event
  description: string;
  price: number | null;     // price at event if applicable
  data: string | null;      // JSON for additional data
  createdAt: number;
}

/** ── Trade Version (for data versioning) ──────────────────────────── */
export interface TradeVersionChange {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface TradeVersion {
  id: string;
  tradeId: string;
  changedAt: number;
  changes: string;    // JSON TradeVersionChange[]
  snapshot: string;   // JSON snapshot of full trade at this point
}

/** ── Post-Trade Review Data ───────────────────────────────────────── */

export type DirectionalAccuracy = 'correct' | 'incorrect' | 'partial';
export type TimingAccuracy = 'early' | 'on-time' | 'late';
export type EntryAccuracy = 'precise' | 'acceptable' | 'poor';
export type ExitAccuracy = 'at-target' | 'early' | 'late';
export type EntryTiming = 'early' | 'on-time' | 'late' | 'chased';
export type LossCategory = 'valid-setup' | 'invalid-setup' | 'execution-error' | 'timing-error' | 'regime-mismatch' | 'unexpected';
export type BehaviorFlag = 'hesitation' | 'fear' | 'fomo' | 'impatience' | 'overconfidence' | 'revenge-trading' | 'uncertainty';

export interface DetectedPattern {
  label: string;
  count: number;
  total: number;
  rate: number;          // درصد
  evidence: string;      // توضیح
  recommendation: string;
  severity: 'low' | 'medium' | 'high';
}

export interface UserCorrection {
  field: string;
  label: string;
  originalValue: string;
  correctedValue: string;
  reason: string;
  correctedAt: number;
}

export interface PostTradeAIAnalysis {
  generatedAt: number;
  expectationVsReality: string;    // مقایسه انتظار و واقعیت
  executionAssessment: string;     // ارزیابی اجرا
  qualitySeparation: string;       // کیفیت جدا از نتیجه
  keyFindings: string[];           // یافته‌های کلیدی
  repeatedMistakes: DetectedPattern[];
  successfulBehaviors: DetectedPattern[];
  knowledgeUpdates: string[];      // چه چیزی یاد گرفتیم
  summary: string;                 // خلاصه کلی
}

export interface PostTradeReviewData {
  completedAt: number;

  // بخش ۱: انتظار در مقابل واقعیت
  expectationText: string;
  actualBehaviorText: string;
  directionalAccuracy: DirectionalAccuracy | null;
  timingAccuracy: TimingAccuracy | null;
  entryAccuracy: EntryAccuracy | null;
  exitAccuracy: ExitAccuracy | null;
  retracementAccuracy: 'accurate' | 'deeper-than-expected' | 'shallower' | null;
  confirmationAccuracy: 'valid' | 'invalid' | 'partial' | null;

  // بخش ۲: بررسی تحلیل بازار
  htfAnalysisCorrect: boolean | null;
  m15StructureCorrect: boolean | null;
  m5SetupCorrect: boolean | null;
  m1EntryValid: boolean | null;
  analysisNotes: string;

  // بخش ۳: بررسی اجرا
  entryFollowedPlan: boolean | null;
  entryTiming: EntryTiming | null;
  enteredWithConfirmation: boolean | null;
  executionNotes: string;

  // بخش ۴: مدیریت ریسک
  slRespected: boolean | null;
  slMoved: boolean | null;          // SL را در جهت نامطلوب جابجا کرد
  riskIncreased: boolean | null;    // ریسک را افزایش داد
  closedEarly: boolean | null;      // خیلی زود بست
  heldTooLong: boolean | null;      // خیلی دیر بست
  riskNotes: string;

  // بخش ۵: رفتار بازار
  marketAsExpected: boolean | null;
  unexpectedEvent: boolean | null;
  priceEnteredRange: boolean | null;
  deeperRetracement: boolean | null;
  marketBehaviorNotes: string;

  // بخش ۶: کیفیت معامله (جدا از نتیجه)
  tradeQualityScore: number | null;       // 1-5: آیا پلن را دنبال کرد؟
  analysisQualityScore: number | null;    // 1-5: آیا تحلیل درست بود؟
  executionQualityScore: number | null;   // 1-5: آیا اجرا بر اساس پلن بود؟
  riskMgmtQualityScore: number | null;    // 1-5: آیا مدیریت ریسک درست بود؟

  // طبقه‌بندی ضرر
  lossCategory: LossCategory | null;
  luckyWin: boolean | null;              // برد شانسی (اجرای بد ولی نتیجه خوب)

  // بخش ۷: زمینه رفتاری
  behaviorFlags: BehaviorFlag[];
  behaviorNotes: string;

  // بخش ۸: تأمل کاربر
  userReflection: string;

  // بخش ۹: تحلیل خودکار (محاسبه‌شده)
  aiAnalysis: PostTradeAIAnalysis | null;

  // تصحیح‌های کاربر بر AI
  userCorrections: UserCorrection[];
}

export const defaultPostTradeReview: PostTradeReviewData = {
  completedAt: 0,
  expectationText: '', actualBehaviorText: '',
  directionalAccuracy: null, timingAccuracy: null, entryAccuracy: null,
  exitAccuracy: null, retracementAccuracy: null, confirmationAccuracy: null,
  htfAnalysisCorrect: null, m15StructureCorrect: null,
  m5SetupCorrect: null, m1EntryValid: null, analysisNotes: '',
  entryFollowedPlan: null, entryTiming: null, enteredWithConfirmation: null, executionNotes: '',
  slRespected: null, slMoved: null, riskIncreased: null,
  closedEarly: null, heldTooLong: null, riskNotes: '',
  marketAsExpected: null, unexpectedEvent: null,
  priceEnteredRange: null, deeperRetracement: null, marketBehaviorNotes: '',
  tradeQualityScore: null, analysisQualityScore: null,
  executionQualityScore: null, riskMgmtQualityScore: null,
  lossCategory: null, luckyWin: null,
  behaviorFlags: [], behaviorNotes: '',
  userReflection: '',
  aiAnalysis: null,
  userCorrections: [],
};

/** ── Learning Audit Trail ────────────────────────────────────────── */

export type AuditEntryType = 'mistake-detected' | 'behavior-detected' | 'pattern-confirmed' | 'pattern-contradicted' | 'knowledge-updated' | 'review-completed';

export interface LearningAuditEntry {
  id: string;
  tradeId: string;
  type: AuditEntryType;
  description: string;           // توضیح انسانی
  detail: string;                // JSON — جزئیات
  supportingTradeIds: string;    // JSON string[]
  createdAt: number;
}

/** ── Profile Snapshot (Prompt 18 — نسخه‌سازی پروفایل) ───────────── */

export interface ProfileSnapshot {
  id: string;
  label: string;             // e.g. "فروردین ۱۴۰۴" or user-defined
  data: string;              // JSON TraderProfileData
  tradeCount: number;
  closedCount: number;
  createdAt: number;
}

/** ── Profile Correction (Prompt 18 — کنترل کاربر بر بینش‌ها) ──────── */

export interface ProfileCorrection {
  id: string;                // insightId — primary key
  action: 'reject' | 'irrelevant';
  note?: string;
  correctedAt: number;
}

/** ── SymbolProfile ────────────────────────────────────────────────── */

export interface SymbolProfile {
  id: string;
  symbol: string;
  assetClass: string;
  notes: string | null;
  updatedAt: number;
}

/** ── DailyJournal ────────────────────────────────────────────────── */

export interface PreTradingState {
  mood: number;
  energy: number;
  focus: number;
  stress: number;
  readiness: number;
  notes: string;
}

export interface EndOfDayReview {
  didWell: string;
  didWrong: string;
  learned: string;
  followedRules: 'fully' | 'mostly' | 'partially' | 'not' | null;
}

export interface DailyJournal {
  id: string;
  date: string;
  mood: number;
  energyLevel: number;
  focusLevel: number;
  stressLevel: number;
  emotions: string;
  importantEventsToday: string | null;
  importantEventsYesterday: string | null;
  preTradingState: string;
  endOfDayReview: string;
  notes: string;
  energy?: number | null;
  lessons?: string | null;
  improvements?: string | null;
  tags: string;
  createdAt: number;
  updatedAt: number;
}

/** ── Knowledge Note (Prompt 20) ──────────────────────────────────── */

export type NoteImportance = 'critical' | 'high' | 'medium' | 'low';
export type NoteSource = 'manual' | 'ai-generated' | 'ai-assisted' | 'imported';
export type NoteStatus = 'new' | 'under-review' | 'confirmed' | 'active' | 'weakening' | 'outdated' | 'archived';
export type ReviewFrequency = 'daily' | 'weekly' | 'monthly' | 'as-needed';

export interface NoteEvidence {
  supportingTradeIds: string[];
  sampleSize: number;
  dateRange: [number, number] | null;
  avgResult: number | null;
  confidence: 'low' | 'moderate' | 'high';
  description: string;
}

export interface NoteUserFeedback {
  rating: 'correct' | 'incorrect' | 'partial' | 'not-relevant' | 'important' | 'not-important';
  note: string;
  ratedAt: number;
}

export interface KnowledgeNote {
  id: string;
  title: string;
  content: string;
  category: string;
  importance: NoteImportance;
  color: string;
  tags: string;                // JSON string[]
  relatedSymbols: string;      // JSON string[]
  relatedSetups: string;       // JSON string[]
  relatedStrategies: string;   // JSON string[]
  relatedSessions: string;     // JSON string[] ('london'|'newyork'|'asian'|'custom')
  relatedMarketRegimes: string; // JSON string[]
  relatedTimeframes: string;   // JSON string[]
  relatedDays: string;         // JSON number[] (0=Sun…6=Sat)
  source: NoteSource;
  status: NoteStatus;
  isActive: boolean;
  isPinned: boolean;
  isRule: boolean;
  reviewCount: number;
  lastReviewedAt: number | null;
  nextReviewAt: number | null;
  reviewFrequency: ReviewFrequency;
  userFeedback: string | null; // JSON NoteUserFeedback
  evidence: string | null;     // JSON NoteEvidence
  requireConfirmation: boolean;
  snoozedUntil: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  isDefault: boolean;
  createdAt: number;
}

export const DEFAULT_NOTE_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
};

export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  'trading-rules':      '#3b82f6',
  'entry-rules':        '#22c55e',
  'exit-rules':         '#f97316',
  'risk-management':    '#ef4444',
  'market-observations':'#8b5cf6',
  'setup-reminders':    '#eab308',
  'symbol-reminders':   '#14b8a6',
  'session-reminders':  '#06b6d4',
  'mistakes':           '#dc2626',
  'strengths':          '#16a34a',
  'lessons-learned':    '#2563eb',
  'ai-insights':        '#7c3aed',
  'warnings':           '#f59e0b',
  'market-patterns':    '#0ea5e9',
  'personal-principles':'#a855f7',
  'observations':       '#10b981',
};

// ── Prompt 21: Replay Engine Types ────────────────────────────────

export interface ReplayCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timeframe: string;
}

export type ReplayDatasetType = 'candles' | 'screenshots' | 'trade';
export type ReplayMode = 'screenshot' | 'candle' | 'trade' | 'setup' | 'weakness';
export type ReplayStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type ReplayDecisionAction = 'no-trade' | 'wait' | 'long' | 'short' | 'close' | 'move-sl' | 'move-tp' | 'partial-close' | 'add';
export type CoachingMode = 'blind' | 'reflection' | 'context' | 'coaching';

export interface ReplayScreenshotItem {
  dataUrl: string;
  label: string;         // e.g. "Context", "Entry Zone", "Outcome"
  timeframe?: string;
  notes?: string;
  timestamp?: number;
}

export interface ReplayDataset {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;     // primary timeframe
  type: ReplayDatasetType;
  data: string;          // JSON: ReplayCandle[] or ReplayScreenshotItem[]
  sourceTradeId: string | null;
  totalItems: number;
  startDate: number | null;
  endDate: number | null;
  tags: string;          // JSON string[]
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReplayDecision {
  id: string;
  sessionId: string;
  step: number;
  madeAt: number;
  historicalTimestamp: number | null;
  timeframe: string | null;
  // Decision
  action: ReplayDecisionAction;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskPercent: number | null;
  // Reasoning
  whatISee: string | null;
  whyEnter: string | null;
  whyWait: string | null;
  invalidation: string | null;
  marketCondition: string | null;
  confidence: number | null;   // 1–10
  // Meta
  timeToDecide: number | null; // ms
  visibleContext: string | null;
  outcomeAfterDecision: string | null;
  qualityScore: number | null; // 0–100
  qualityBreakdown: string | null; // JSON
  createdAt: number;
}

export interface ReplaySession {
  id: string;
  title: string;
  mode: ReplayMode;
  coachingMode: CoachingMode;
  symbol: string | null;
  timeframe: string | null;
  datasetId: string | null;
  sourceTradeId: string | null;
  playlistId: string | null;
  status: ReplayStatus;
  currentStep: number;
  totalSteps: number;
  revealCount: number;   // candles/screenshots per reveal
  startedAt: number;
  completedAt: number | null;
  // Multi-Timeframe support: JSON {[timeframe]: datasetId}
  additionalDatasets: string | null;
  activeTimeframe: string | null;
  // Simulated position
  simulatedDirection: 'long' | 'short' | null;
  simulatedEntry: number | null;
  simulatedSL: number | null;
  simulatedTP: number | null;
  simulatedResult: 'win' | 'loss' | 'breakeven' | 'no-trade' | null;
  simulatedRMultiple: number | null;
  simulatedClosedAt: number | null;
  // Original historical (trade replay mode)
  originalEntry: number | null;
  originalResult: string | null;
  originalRMultiple: number | null;
  // Summary
  decisionQualityScore: number | null;  // 0–100
  performanceSummary: string | null;     // JSON
  lessonSuggestions: string | null;      // JSON string[]
  reviewNotes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReplayPlaylist {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  datasetIds: string;    // JSON string[]
  filters: string;       // JSON: { symbol?, session?, setup?, mode?, behaviorFlag? }
  defaultMode: ReplayMode;
  totalReplayed: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** ── Prompt 22: Market Context Session ───────────────────────────── */

export type MarketSession = 'asian' | 'london' | 'newyork' | 'overlap' | 'custom';
export type SetupType = 'continuation' | 'reversal' | 'breakout' | 'pullback' | 'range' | 'liquidity-sweep' | 'custom';

export interface TFScreenshotData {
  dataUrl: string;
  label: string;
  uploadedAt: number;
  detectedFeatures: string[];   // extracted from text analysis
}

export interface TFAnalysisData {
  notes: string;
  trend: 'up' | 'down' | 'sideways' | null;
  structure: string | null;
  keyLevels: string;            // comma-separated price levels
  screenshot: TFScreenshotData | null;
}

export const defaultTFAnalysis: TFAnalysisData = {
  notes: '', trend: null, structure: null, keyLevels: '', screenshot: null,
};

export interface MarketContextTradePlan {
  direction: 'long' | 'short' | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskPercent: number | null;
  rRatio: number | null;
  notes: string;
}

export interface MarketContextSession {
  id: string;
  status: 'draft' | 'analyzed' | 'decided' | 'completed';
  symbol: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:mm
  timezone: string;
  dayOfWeek: number;     // 0=Sun…6=Sat
  session: MarketSession;
  sessionCustom: string | null;
  // Per-timeframe analysis stored as JSON TFAnalysisData
  tf4h: string;
  tf15m: string;
  tf5m: string;
  tf1m: string;
  // Overall
  overallBias: 'bullish' | 'bearish' | 'neutral' | null;
  setupType: SetupType | null;
  setupCustom: string | null;
  overallReasoning: string | null;
  invalidationConditions: string | null;
  expectedScenario: string | null;
  // Trade plan
  tradePlan: string | null;        // JSON MarketContextTradePlan
  // Historical analysis (computed)
  historicalAnalysis: string | null; // JSON MarketHistoricalAnalysis
  // Decision
  finalDecision: string | null;    // JSON MarketContextDecision
  // Post-decision learning
  decisionLearning: string | null; // JSON
  // Link to created trade
  linkedTradeId: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────
// Prompt 24 — Risk Management Engine
// ─────────────────────────────────────────────────────────────────

export interface RiskProfile {
  id: string;              // always 'default'
  defaultRiskPct: number | null;
  maxRiskPct: number | null;
  maxDailyRiskPct: number | null;
  maxWeeklyRiskPct: number | null;
  maxTradesPerDay: number | null;
  maxConsecutiveLosses: number | null;
  maxDrawdownPct: number | null;
  minRR: number | null;
  accountBalance: number | null;
  accountEquity: number | null;
  currency: string;
  riskUnit: 'percentage' | 'fixed' | 'r-multiple';
  sessionRules: string | null;  // JSON SessionRule[]
  setupRules: string | null;    // JSON SetupRule[]
  updatedAt: number;
}

export interface RiskViolation {
  id: string;
  tradeId: string | null;
  date: string;             // YYYY-MM-DD
  ruleType: string;
  ruleLabel: string;
  plannedValue: number | null;
  actualValue: number | null;
  deviation: number | null;
  outcome: string | null;
  intent: 'intentional' | 'accidental' | 'exceptional' | 'unclear' | null;
  explanation: string | null;
  lesson: string | null;
  createdAt: number;
}

export interface RiskGroup {
  id: string;
  name: string;
  description: string | null;
  symbols: string | null;       // JSON string[]
  tradeIds: string | null;      // JSON string[]
  maxGroupRiskPct: number | null;
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────
// Prompt 25 — Performance Review
// ─────────────────────────────────────────────────────────────────
export interface PerformanceReview {
  id: string;             // e.g. "2024-06_monthly" or "2024-W23_weekly"
  periodKey: string;      // e.g. "2024-06" or "2024-W23"
  periodType: 'weekly' | 'monthly';
  notes: string | null;
  highlights: string | null;  // JSON string[]
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────
// Prompt 26 — Knowledge Base: Pre-Trade Checklist & Daily Focus
// ─────────────────────────────────────────────────────────────────

/** آیتم چک‌لیست پیش از معامله */
export interface ChecklistItemDef {
  id: string;
  text: string;
  priority: NoteImportance;
  linkedNoteId: string | null;  // لینک به KnowledgeNote
  order: number;
}

/** چک‌لیست پرسیستنت (قابل تنظیم) */
export interface PreTradeChecklist {
  id: string;
  name: string;
  contextSymbol: string;   // '' = هر نمادی
  contextSession: string;  // '' = هر سشنی
  contextSetup: string;    // '' = هر ستاپی
  items: string;           // JSON ChecklistItemDef[]
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/** فوکوس روزانه و قصد معاملاتی */
export interface DailyFocus {
  id: string;
  date: string;            // YYYY-MM-DD
  intention: string;       // قصد امروز
  focusNote: string;       // یادداشت آزاد فوکوس
  linkedNoteIds: string;   // JSON string[] — یادداشت‌های مرتبط
  reviewedAt: number | null;
  postReflection: string;  // JSON PostTradingReflection
  createdAt: number;
  updatedAt: number;
}

export interface PostTradingReflection {
  mostRelevantReminder: string;
  rulesFollowed: string;
  rulesIgnored: string;
  learned: string;
  rememberTomorrow: string;
}

// ─────────────────────────────────────────────────────────────────
// Prompt 27 — Screenshot Intelligence
// ─────────────────────────────────────────────────────────────────

/** اسکرین‌شات مستقل (نه وابسته به یک معامله خاص) */
export interface ChartScreenshot {
  id: string;
  // متادیتا
  symbol: string | null;
  timeframe: string | null;
  date: string | null;         // YYYY-MM-DD
  time: string | null;         // HH:mm
  timezone: string | null;
  session: string | null;      // 'asian'|'london'|'newyork'|'overlap'|'custom'
  direction: string | null;    // 'long'|'short'|null
  setup: string | null;
  strategy: string | null;
  tradeId: string | null;      // لینک به معامله مرتبط
  screenshotType: string;      // ChartScreenshotType
  label: string | null;
  notes: string | null;
  // تصویر
  /** @deprecated v21: از imageBlob استفاده کنید — پس از migration خالی می‌شود */
  dataUrl: string;
  /** v21: ذخیره‌سازی کارآمد به صورت Blob به جای Base64 */
  imageBlob: Blob | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  quality: string | null;      // JSON ImageQualityReport
  // ویژگی‌ها و تگ‌ها
  extractedFeatures: string;   // JSON VisualFeature[]
  userAddedFeatures: string;   // JSON VisualFeature[]
  patternTags: string;         // JSON string[] - breakout, pullback, etc.
  customTags: string;          // JSON string[]
  annotations: string;         // JSON ScreenshotAnnotation[]
  analysisNotes: string | null;
  // گروه‌بندی
  groupId: string | null;
  collectionIds: string;       // JSON string[]
  // لینک‌ها
  linkedKnowledgeIds: string;  // JSON string[]
  // زمان
  createdAt: number;
  updatedAt: number;
}

/** گروه اسکرین‌شات چند تایم‌فریم */
export interface ScreenshotGroup {
  id: string;
  name: string | null;
  symbol: string | null;
  date: string | null;
  session: string | null;
  setup: string | null;
  tradeId: string | null;
  screenshotIds: string;       // JSON string[] - مرتب‌شده
  notes: string | null;
  mtfRelationship: string | null; // JSON MTFRelationship
  createdAt: number;
  updatedAt: number;
}

/** الگوی بصری شخصی */
export interface VisualPattern {
  id: string;
  name: string;
  description: string | null;
  patternTags: string;         // JSON string[] - تگ‌های تعریف‌کننده الگو
  screenshotIds: string;       // JSON string[] - نمونه‌های اسکرین‌شات
  relatedTradeIds: string;     // JSON string[]
  relatedSetups: string;       // JSON string[]
  notes: string | null;
  commonMistakes: string | null;
  personalLessons: string | null;
  createdAt: number;
  updatedAt: number;
}

/** کالکشن اسکرین‌شات */
export interface ScreenshotCollection {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  screenshotIds: string;       // JSON string[]
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/** ── Account (حساب معاملاتی) ─────────────────────────────────────── */

export interface Account {
  id: string;
  name: string;               // مثلاً «حساب اصلی» یا «دمو بروکر XYZ»
  broker: string;             // نام بروکر (اختیاری)
  currency: string;           // USD, EUR, ...
  initialBalance: number | null;
  currentBalance: number | null;
  color: string;              // رنگ شناسه‌ای
  isDefault: boolean;
  isArchived?: boolean;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

/** ── TradingBox (باکس معاملاتی) ──────────────────────────────────── */

export interface TradingBox {
  id: string;
  accountId?: string | null;       // باکس اختصاصی یک حساب؛ null یعنی مشترک
  name: string;               // مثلاً «باکس ۱» یا «آزمون استراتژی بهار»
  description: string | null;
  targetTradeCount: number | null;  // هدف تعداد معاملات
  color: string;
  status: 'active' | 'completed' | 'archived';
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export type JournalSessionStatus = 'active' | 'completed' | 'cancelled';

export interface JournalSession {
  id: string;
  accountId: string;
  tradingBoxId: string;
  strategyId: string;
  strategyVersionId: string;
  symbols: string;
  startTime: number;
  endTime: number | null;
  status: JournalSessionStatus;
  sessionTypeOptionId: string | null;
  notes: string;
  tags: string;
  lessonsLearned: string;
  mistakesReview: string;
  psychologicalReview: string;
  strategyObservations: string;
  strategyChangeProposal: string;
  /** روانشناسی پیش از شروع سشن: JSON {optionIds: string[], intensity: number, notes: string} */
  preTradePsychology?: string;
  /** جمع‌بندی نهایی سشن */
  finalReflection?: string;
  /** کیفیت کلی سشن (۰ تا ۱۰) */
  sessionQuality?: number | null;
  /** رعایت کلی استراتژی در سشن */
  strategyCompliance?: 'yes' | 'partially' | 'no' | null;
  createdAt: number;
  updatedAt: number;
}

export interface JournalOption {
  id: string;
  category: string;
  label: string;
  description: string;
  enabled: boolean;
  required?: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * یک «رویداد تحلیل» در سشن. در یک سشن می‌تواند چندین رویداد برای یک تایم‌فریم
 * (در زمان‌های مختلف) وجود داشته باشد؛ دیگر یک رکورد ثابت برای هر تایم‌فریم نیست.
 * فیلدهای جدید همه اختیاری‌اند تا رکوردهای قدیمی بدون migration معتبر بمانند.
 */
export interface JournalSessionAnalysis {
  id: string;
  sessionId: string;
  timeframeOptionId: string;
  directionOptionId: string | null;
  marketStructureOptionId: string | null;
  liquidityContextOptionIds: string;
  expectedDirectionOptionId: string | null;
  zones: string;
  notes: string;
  tags: string;
  /** متن تحلیل */
  analysisText?: string;
  /** سناریوی مورد انتظار (پیش از معامله؛ نتیجه‌اش در مرور معامله ثبت می‌شود) */
  scenario?: string;
  /** زمینه/تریگر احتمالی که منتظرش هستیم */
  triggerContext?: string;
  /** زمینهٔ بازار (متن آزاد) */
  marketContext?: string;
  /** معامله‌ای که پیش از این تحلیل بسته شد (اختیاری) */
  previousTradeId?: string | null;
  /** معامله‌ای که بعد از این تحلیل باز شد (اختیاری؛ از طرف معامله هم قابل استخراج است) */
  nextTradeId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export type JournalTriggerStatus = 'pending' | 'confirmed' | 'traded' | 'skipped' | 'invalid';

/**
 * تریگر ورود (معمولاً ۱ دقیقه‌ای) به‌عنوان یک رویداد مستقل.
 * با آن می‌توان شمرد چند تریگر داشتیم، چندتا معامله شد، چندتا نادیده گرفته شد یا نامعتبر بود.
 */
export interface JournalTriggerEvent {
  id: string;
  sessionId: string;
  timeframeOptionId: string | null;
  analysisEventId: string | null;
  tradeId: string | null;
  /** گزینه‌ای از دستهٔ entry_trigger */
  triggerTypeOptionId: string | null;
  triggerDescription: string;
  /** چه اتفاقی روی تایم‌فریم تریگر افتاد؟ (حرکت بازار / نقدینگی گرفته‌شده) */
  marketMovement: string;
  entryReason: string;
  confirmation: string;
  direction: 'long' | 'short' | null;
  status: JournalTriggerStatus;
  notes: string;
  tags: string;
  triggeredAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface StrategyVersion {
  id: string;
  strategyId: string;
  versionNumber: string;
  strategyName: string;
  description: string;
  rulesSnapshot: string;
  createdAt: number;
}

export interface JournalTradeData {
  id: string;
  tradeId: string;
  journalSessionId: string;
  entryTriggerOptionIds: string;
  entryReasonOptionId: string | null;
  exitReasonOptionId: string | null;
  setupTypeOptionId: string | null;
  setupGradeOptionId: string | null;
  scoTypeOptionId?: string | null;
  fvgTypeOptionId?: string | null;
  checklistResults: string;
  psychology: string;
  mistakeOptionIds: string;
  strategyCompliance: 'yes' | 'partially' | 'no' | null;
  violatedRuleIds: string;
  setupQuality: number | null;
  executionQuality: number | null;
  /** نتیجهٔ سناریوی تحلیل (مرور پس از معامله) */
  scenarioOutcome?: 'played-out' | 'partially' | 'failed' | 'invalidated' | null;
  scenarioOutcomeNotes?: string;
  /** درس معامله — فقط در مرور پس از معامله ثبت می‌شود */
  lesson?: string;
  finalReflection?: string;
  /** برچسب‌های مرور (idهای دستهٔ tag) */
  reviewTagOptionIds?: string;
  /** چه اتفاقی افتاد؟ (مرور پس از معامله) */
  whatHappened?: string;
  /** آیا ورود معتبر بود؟ */
  entryValid?: 'yes' | 'partially' | 'no' | null;
  /** آیا حد ضرر رعایت شد؟ */
  slRespected?: 'yes' | 'partially' | 'no' | null;
  /** آیا مدیریت معامله درست بود؟ */
  managementCorrect?: 'yes' | 'partially' | 'no' | null;
  /** واکنش احساسی پس از معامله (متن) */
  emotionalReaction?: string;
  /** کیفیت کلی معامله (۰ تا ۱۰) */
  tradeQuality?: number | null;
  /** کیفیت مدیریت ریسک (۰ تا ۱۰) */
  riskManagementQuality?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface JournalSessionEvent {
  id: string;
  sessionId: string;
  typeOptionId: string;
  notes: string;
  eventAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface JournalMedia {
  id: string;
  sessionId: string | null;
  tradeId: string | null;
  analysisId: string | null;
  /** تریگر ورود (JournalTriggerEvent) */
  triggerId?: string | null;
  /** مرور معامله (JournalTradeData.id) */
  reviewId?: string | null;
  category: 'before-entry' | 'entry' | 'during-trade' | 'after-exit' | 'session' | 'analysis' | 'trigger' | 'review';
  fileName: string;
  mimeType: string;
  blob: Blob;
  caption: string;
  createdAt: number;
}

/** ── Dexie Database ──────────────────────────────────────────────── */

class TraderMindDB extends Dexie {
  strategies!: Table<Strategy>;
  phases!: Table<Phase>;
  steps!: Table<Step>;
  rules!: Table<Rule>;
  analysisSessions!: Table<AnalysisSession>;
  trades!: Table<Trade>;
  dailyJournals!: Table<DailyJournal>;
  symbolProfiles!: Table<SymbolProfile>;
  learningAuditTrail!: Table<LearningAuditEntry>;
  profileSnapshots!: Table<ProfileSnapshot>;
  profileCorrections!: Table<ProfileCorrection>;
  knowledgeNotes!: Table<KnowledgeNote>;
  knowledgeCategories!: Table<KnowledgeCategory>;
  replayDatasets!: Table<ReplayDataset>;
  replaySessions!: Table<ReplaySession>;
  replayDecisions!: Table<ReplayDecision>;
  replayPlaylists!: Table<ReplayPlaylist>;
  marketContextSessions!: Table<MarketContextSession>;
  // Prompt 23
  tradeEvents!: Table<TradeEvent>;
  tradeVersions!: Table<TradeVersion>;
  // Prompt 24 — Risk Management
  riskProfiles!: Table<RiskProfile>;
  riskViolations!: Table<RiskViolation>;
  riskGroups!: Table<RiskGroup>;
  // Prompt 25 — Performance Analytics
  performanceReviews!: Table<PerformanceReview>;
  // Prompt 26 — Knowledge Base
  preTradeChecklists!: Table<PreTradeChecklist>;
  dailyFocus!: Table<DailyFocus>;
  // Prompt 27 — Screenshot Intelligence
  chartScreenshots!: Table<ChartScreenshot>;
  screenshotGroups!: Table<ScreenshotGroup>;
  visualPatterns!: Table<VisualPattern>;
  screenshotCollections!: Table<ScreenshotCollection>;
  // v18 — حساب‌ها و باکس‌های معاملاتی
  accounts!: Table<Account>;
  tradingBoxes!: Table<TradingBox>;
  journalSessions!: Table<JournalSession>;
  journalOptions!: Table<JournalOption>;
  journalSessionAnalyses!: Table<JournalSessionAnalysis>;
  journalTriggers!: Table<JournalTriggerEvent>;
  strategyVersions!: Table<StrategyVersion>;
  journalTradeData!: Table<JournalTradeData>;
  journalSessionEvents!: Table<JournalSessionEvent>;
  journalMedia!: Table<JournalMedia>;

  constructor() {
    super('TraderMindDB');

    const baseStores = {
      strategies: 'id, name, isActive, createdAt',
      phases: 'id, strategyId, order',
      steps: 'id, phaseId, order',
      rules: 'id, stepId, order',
      analysisSessions: 'id, strategyId, status, startedAt',
      trades: 'id, sessionId, strategyId, symbol, direction, result, status, openedAt, closedAt',
      dailyJournals: 'id, date, createdAt',
    };

    this.version(1).stores(baseStores);
    this.version(2).stores(baseStores);
    this.version(3).stores(baseStores);
    this.version(4).stores(baseStores);
    this.version(5).stores({ ...baseStores, symbolProfiles: 'id, symbol, assetClass' });
    // نسخه ۶: postTradeReview به Trade و learningAuditTrail به DB اضافه شد
    this.version(6).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
    }).upgrade(tx => {
      return tx.table('trades').toCollection().modify(trade => {
        if (trade.postTradeReview === undefined || trade.postTradeReview === null) {
          trade.postTradeReview = JSON.stringify(defaultPostTradeReview);
        }
      });
    });

    // نسخه ۷: liveMonitoring به Trade اضافه شد (Prompt 16)
    this.version(7).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
    }).upgrade(tx => {
      return tx.table('trades').toCollection().modify(trade => {
        if (trade.liveMonitoring === undefined) {
          trade.liveMonitoring = null;
        }
      });
    });

    // نسخه ۸: profileSnapshots و profileCorrections اضافه شد (Prompt 18)
    this.version(8).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
    });

    // نسخه ۹: knowledgeNotes و knowledgeCategories اضافه شد (Prompt 20)
    this.version(9).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
    });

    // نسخه ۱۰: Replay Engine — datasets/sessions/decisions/playlists (Prompt 21)
    this.version(10).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
    });

    // نسخه ۱۱: MTF support — additionalDatasets, activeTimeframe اضافه به ReplaySessions
    this.version(11).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
    }).upgrade(tx => {
      return tx.table('replaySessions').toCollection().modify((s: ReplaySession) => {
        if (s.additionalDatasets === undefined) s.additionalDatasets = null;
        if (s.activeTimeframe === undefined) s.activeTimeframe = null;
      });
    });

    // نسخه ۱۲: Prompt 22 — Market Context Analysis Sessions
    this.version(12).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
    });

    // نسخه ۱۳: Prompt 23 — Extended Trade fields + TradeEvent + TradeVersion
    this.version(13).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
    }).upgrade(tx => {
      return tx.table('trades').toCollection().modify((trade: Trade) => {
        if (trade.plannedEntry === undefined) trade.plannedEntry = null;
        if (trade.plannedSL === undefined) trade.plannedSL = null;
        if (trade.plannedTP === undefined) trade.plannedTP = null;
        if (trade.plannedRR === undefined) trade.plannedRR = null;
        if (trade.plannedRisk === undefined) trade.plannedRisk = null;
        if (trade.plannedPositionSize === undefined) trade.plannedPositionSize = null;
        if (trade.tradingSession === undefined) trade.tradingSession = null;
        if (trade.setupType === undefined) trade.setupType = null;
        if (trade.timezone === undefined) trade.timezone = null;
        if (trade.entryReason === undefined) trade.entryReason = null;
        if (trade.lesson === undefined) trade.lesson = null;
        if (trade.slMoved === undefined) trade.slMoved = null;
        if (trade.tpMoved === undefined) trade.tpMoved = null;
        if (trade.partialClose === undefined) trade.partialClose = null;
        if (trade.addedToPosition === undefined) trade.addedToPosition = null;
        if (trade.reducedPosition === undefined) trade.reducedPosition = null;
        if (trade.manualExit === undefined) trade.manualExit = null;
        if (trade.managementReason === undefined) trade.managementReason = null;
        if (trade.mtfAnalysis === undefined) trade.mtfAnalysis = null;
      });
    });

    // نسخه ۱۵: Prompt 25 — جداول تحلیل عملکرد
    this.version(15).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
    });

    // نسخه ۱۴: Prompt 24 — جداول مدیریت ریسک
    this.version(14).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
    });

    // نسخه ۱۶: Prompt 26 — چک‌لیست پیش از معامله + فوکوس روزانه
    this.version(16).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
      preTradeChecklists: 'id, isDefault, contextSymbol, contextSession, contextSetup, createdAt',
      dailyFocus: 'id, date, createdAt',
    });

    // نسخه ۱۷: Prompt 27 — Screenshot Intelligence
    this.version(17).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
      preTradeChecklists: 'id, isDefault, contextSymbol, contextSession, contextSetup, createdAt',
      dailyFocus: 'id, date, createdAt',
      // جداول جدید Prompt 27
      chartScreenshots: 'id, symbol, timeframe, session, screenshotType, tradeId, groupId, date, createdAt',
      screenshotGroups: 'id, symbol, tradeId, date, createdAt',
      visualPatterns: 'id, name, createdAt',
      screenshotCollections: 'id, name, isDefault, createdAt',
    }).upgrade(async tx => {
      // seed default collections
      const now = Date.now();
      const defaults: ScreenshotCollection[] = [
        { id: crypto.randomUUID(), name: 'بهترین معاملات', description: 'اسکرین‌شات‌های معاملات موفق', icon: '🏆', color: '#22c55e', screenshotIds: '[]', isDefault: true, createdAt: now, updatedAt: now },
        { id: crypto.randomUUID(), name: 'بدترین معاملات', description: 'اسکرین‌شات‌هایی که چیزی آموختم', icon: '📉', color: '#ef4444', screenshotIds: '[]', isDefault: true, createdAt: now, updatedAt: now },
        { id: crypto.randomUUID(), name: 'نمونه‌های یادگیری', description: 'اسکرین‌شات‌های آموزشی', icon: '📚', color: '#3b82f6', screenshotIds: '[]', isDefault: true, createdAt: now, updatedAt: now },
        { id: crypto.randomUUID(), name: 'اشتباهات', description: 'الگوهای اشتباه تکراری', icon: '⚠️', color: '#f59e0b', screenshotIds: '[]', isDefault: true, createdAt: now, updatedAt: now },
      ];
      for (const col of defaults) {
        await tx.table('screenshotCollections').put(col);
      }
    });

    // نسخه ۱۸: حساب‌های معاملاتی + باکس‌های معاملاتی + فیلدهای accountId/boxId در Trade
    this.version(18).stores({
      ...baseStores,
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
      preTradeChecklists: 'id, isDefault, contextSymbol, contextSession, contextSetup, createdAt',
      dailyFocus: 'id, date, createdAt',
      chartScreenshots: 'id, symbol, timeframe, session, screenshotType, tradeId, groupId, date, createdAt',
      screenshotGroups: 'id, symbol, tradeId, date, createdAt',
      visualPatterns: 'id, name, createdAt',
      screenshotCollections: 'id, name, isDefault, createdAt',
      // جداول جدید v18
      accounts: 'id, name, isDefault, createdAt',
      tradingBoxes: 'id, name, status, createdAt',
    }).upgrade(tx => {
      // فیلدهای جدید به معاملات موجود اضافه می‌شوند
      return tx.table('trades').toCollection().modify((trade: Trade) => {
        if (trade.accountId === undefined) trade.accountId = null;
        if (trade.boxId === undefined) trade.boxId = null;
      });
    });

    // نسخه ۱۹: ایندکس‌های حساب و باکس روی معاملات.
    // نسخه ۱۸ فیلدها را به رکوردها اضافه می‌کرد، اما ایندکس‌های IndexedDB را
    // تعریف نکرده بود؛ به همین دلیل queryهای where('boxId') در دیتابیس‌های
    // موجود با SchemaError متوقف می‌شدند.
    // مهم: trades به‌صراحت override می‌شود تا کاربران کاملاً جدید نیز ایندکس‌ها را دریافت کنند.
    this.version(19).stores({
      ...baseStores,
      trades: 'id, sessionId, strategyId, accountId, boxId, symbol, direction, result, status, openedAt, closedAt',
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
      preTradeChecklists: 'id, isDefault, contextSymbol, contextSession, contextSetup, createdAt',
      dailyFocus: 'id, date, createdAt',
      chartScreenshots: 'id, symbol, timeframe, session, screenshotType, tradeId, groupId, date, createdAt',
      screenshotGroups: 'id, symbol, tradeId, date, createdAt',
      visualPatterns: 'id, name, createdAt',
      screenshotCollections: 'id, name, isDefault, createdAt',
      accounts: 'id, name, isDefault, createdAt',
      tradingBoxes: 'id, name, status, createdAt',
    }).upgrade(tx => {
      return tx.table('trades').toCollection().modify((trade: Trade) => {
        if (trade.accountId === undefined) trade.accountId = null;
        if (trade.boxId === undefined) trade.boxId = null;
      });
    });

    // ====================================================
    // نسخه ۲۱ — PART 1: Screenshot Blob Migration
    // تبدیل dataUrl (Base64) به imageBlob (Blob) برای صرفه‌جویی در RAM
    // ====================================================
    this.version(21).stores({
      ...baseStores,
      trades: [
        'id', 'sessionId', 'strategyId', 'accountId', 'boxId',
        'symbol', 'direction', 'result', 'status', 'openedAt', 'closedAt',
        '[symbol+openedAt]', '[accountId+openedAt]', '[strategyId+result]', '[strategyId+closedAt]',
      ].join(', '),
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: [
        'id', 'category', 'importance', 'source', 'status',
        'isActive', 'isPinned', 'isRule', 'createdAt', 'updatedAt', 'lastReviewedAt',
        '[category+isActive]', '[source+status]',
      ].join(', '),
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt, [sessionId+step]',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
      preTradeChecklists: 'id, isDefault, contextSymbol, contextSession, contextSetup, createdAt',
      dailyFocus: 'id, date, createdAt',
      chartScreenshots: [
        'id', 'symbol', 'timeframe', 'session', 'screenshotType',
        'tradeId', 'groupId', 'date', 'createdAt',
        '[tradeId+screenshotType]', '[symbol+date]',
      ].join(', '),
      screenshotGroups: 'id, symbol, tradeId, date, createdAt',
      visualPatterns: 'id, name, createdAt',
      screenshotCollections: 'id, name, isDefault, createdAt',
      accounts: 'id, name, isDefault, createdAt',
      tradingBoxes: 'id, name, status, createdAt',
    }).upgrade(async tx => {
      // تبدیل dataUrl → imageBlob برای تمام رکوردهای موجود
      const screenshots = await tx.table('chartScreenshots').toArray();
      for (const ss of screenshots) {
        if (ss.dataUrl && ss.dataUrl.startsWith('data:') && !ss.imageBlob) {
          try {
            const blob = dataUrlToBlob(ss.dataUrl);
            await tx.table('chartScreenshots').update(ss.id, {
              imageBlob: blob,
              dataUrl: '',      // پاکسازی Base64 پس از تبدیل موفق
            });
          } catch {
            // اگر تبدیل شکست خورد، dataUrl را نگه می‌داریم
          }
        }
      }
    });

    // ====================================================
    // نسخه ۲۰ — PART 3: Migration v20
    // افزودن Compound Index های بهینه برای کوئری‌های سریع‌تر
    // ====================================================
    this.version(20).stores({
      ...baseStores,
      // trades — compound indexes جدید: [symbol+openedAt]، [accountId+openedAt]، [strategyId+result]، [strategyId+closedAt]
      trades: [
        'id',
        'sessionId', 'strategyId', 'accountId', 'boxId',
        'symbol', 'direction', 'result', 'status',
        'openedAt', 'closedAt',
        '[symbol+openedAt]',
        '[accountId+openedAt]',
        '[strategyId+result]',
        '[strategyId+closedAt]',
      ].join(', '),

      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: [
        'id', 'category', 'importance', 'source', 'status',
        'isActive', 'isPinned', 'isRule',
        'createdAt', 'updatedAt', 'lastReviewedAt',
        // compound indexes جدید
        '[category+isActive]',
        '[source+status]',
      ].join(', '),
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      // replayDecisions — compound index جدید: [sessionId+step]
      replayDecisions: 'id, sessionId, step, action, createdAt, [sessionId+step]',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
      preTradeChecklists: 'id, isDefault, contextSymbol, contextSession, contextSetup, createdAt',
      dailyFocus: 'id, date, createdAt',
      // chartScreenshots — compound indexes جدید: [tradeId+screenshotType]، [symbol+date]
      chartScreenshots: [
        'id', 'symbol', 'timeframe', 'session', 'screenshotType',
        'tradeId', 'groupId', 'date', 'createdAt',
        '[tradeId+screenshotType]',
        '[symbol+date]',
      ].join(', '),
      screenshotGroups: 'id, symbol, tradeId, date, createdAt',
      visualPatterns: 'id, name, createdAt',
      screenshotCollections: 'id, name, isDefault, createdAt',
      accounts: 'id, name, isDefault, createdAt',
      tradingBoxes: 'id, name, status, createdAt',
    });

    // نسخه ۲۲ — تفکیک کمیسیون/اسپرد و اتصال اختیاری باکس به حساب
    this.version(22).stores({
      trades: [
        'id', 'sessionId', 'strategyId', 'accountId', 'boxId',
        'symbol', 'direction', 'result', 'status', 'openedAt', 'closedAt',
        '[symbol+openedAt]', '[accountId+openedAt]', '[strategyId+result]', '[strategyId+closedAt]',
      ].join(', '),
      tradingBoxes: 'id, name, status, accountId, createdAt',
    }).upgrade(async tx => {
      await tx.table('trades').toCollection().modify((trade: Trade) => {
        if (trade.commission === undefined) trade.commission = null;
        if (trade.spread === undefined) trade.spread = null;
      });
      await tx.table('tradingBoxes').toCollection().modify((box: TradingBox) => {
        if (box.accountId === undefined) box.accountId = null;
      });
    });

    // نسخه ۲۳ — briefing پیش از معامله و سناریوهای شرطی MTF
    // این فیلدها در IndexedDB ایندکس نمی‌شوند و فقط برای داده‌های قدیمی
    // مقدار پیش‌فرض می‌گیرند تا restore و migration کاملاً backward-compatible بماند.
    this.version(23).stores({
      trades: [
        'id', 'sessionId', 'strategyId', 'accountId', 'boxId',
        'symbol', 'direction', 'result', 'status', 'openedAt', 'closedAt',
        '[symbol+openedAt]', '[accountId+openedAt]', '[strategyId+result]', '[strategyId+closedAt]',
      ].join(', '),
      tradingBoxes: 'id, name, status, accountId, createdAt',
    }).upgrade(async tx => {
      await tx.table('trades').toCollection().modify((trade: Trade) => {
        if (trade.preTradeBriefing === undefined) trade.preTradeBriefing = null;
      });
    });

    // نسخه ۲۴ — ژورنال آفلاین session-based؛ رکوردهای قبلی دست‌نخورده می‌مانند.
    this.version(24).stores({
      ...baseStores,
      trades: [
        'id', 'sessionId', 'journalSessionId', 'strategyId', 'accountId', 'boxId',
        'symbol', 'direction', 'result', 'status', 'openedAt', 'closedAt',
        '[symbol+openedAt]', '[accountId+openedAt]', '[strategyId+result]', '[strategyId+closedAt]',
      ].join(', '),
      symbolProfiles: 'id, symbol, assetClass',
      learningAuditTrail: 'id, tradeId, type, createdAt',
      profileSnapshots: 'id, createdAt',
      profileCorrections: 'id, correctedAt',
      knowledgeNotes: 'id, category, importance, source, status, isActive, isPinned, isRule, createdAt, updatedAt, lastReviewedAt, [category+isActive], [source+status]',
      knowledgeCategories: 'id, name, isDefault, createdAt',
      replayDatasets: 'id, symbol, timeframe, type, sourceTradeId, createdAt',
      replaySessions: 'id, mode, status, symbol, datasetId, sourceTradeId, playlistId, createdAt',
      replayDecisions: 'id, sessionId, step, action, createdAt, [sessionId+step]',
      replayPlaylists: 'id, name, createdAt',
      marketContextSessions: 'id, symbol, status, session, dayOfWeek, setupType, linkedTradeId, createdAt',
      tradeEvents: 'id, tradeId, eventType, timestamp, createdAt',
      tradeVersions: 'id, tradeId, changedAt',
      riskProfiles: 'id',
      riskViolations: 'id, tradeId, date, createdAt',
      riskGroups: 'id, name, createdAt',
      performanceReviews: 'id, periodKey, periodType, createdAt',
      preTradeChecklists: 'id, isDefault, contextSymbol, contextSession, contextSetup, createdAt',
      dailyFocus: 'id, date, createdAt',
      chartScreenshots: 'id, symbol, timeframe, session, screenshotType, tradeId, groupId, date, createdAt, [tradeId+screenshotType], [symbol+date]',
      screenshotGroups: 'id, symbol, tradeId, date, createdAt',
      visualPatterns: 'id, name, createdAt',
      screenshotCollections: 'id, name, isDefault, createdAt',
      accounts: 'id, name, isDefault, isArchived, createdAt',
      tradingBoxes: 'id, name, status, accountId, createdAt',
      journalSessions: 'id, accountId, tradingBoxId, strategyId, strategyVersionId, status, startTime, endTime, [accountId+startTime], [tradingBoxId+startTime], [strategyId+startTime]',
      journalOptions: 'id, category, enabled, sortOrder, [category+enabled]',
      journalSessionAnalyses: 'id, sessionId, timeframeOptionId, [sessionId+timeframeOptionId], createdAt',
      strategyVersions: 'id, strategyId, versionNumber, createdAt',
      journalTradeData: 'id, &tradeId, journalSessionId, setupGradeOptionId, strategyCompliance, [journalSessionId+createdAt]',
      journalSessionEvents: 'id, sessionId, typeOptionId, eventAt, createdAt',
      journalMedia: 'id, sessionId, tradeId, analysisId, category, createdAt',
    }).upgrade(async tx => {
      await tx.table('trades').toCollection().modify((trade: Trade) => {
        if (trade.journalSessionId === undefined) trade.journalSessionId = null;
      });
      await tx.table('accounts').toCollection().modify((account: Account) => {
        if (account.isArchived === undefined) account.isArchived = false;
      });
    });

    // نسخه ۲۵ — جریان رویدادمحور سشن: تریگرهای ورود (جدول جدید) و اتصال رسانه به تریگر/مرور.
    // فقط افزودنی است: هیچ جدول/ایندکس قبلی حذف یا بازنویسی نمی‌شود و داده‌ی قبلی دست‌نخورده می‌ماند.
    this.version(25).stores({
      journalTriggers: 'id, sessionId, analysisEventId, tradeId, timeframeOptionId, status, createdAt, [sessionId+createdAt]',
      journalMedia: 'id, sessionId, tradeId, analysisId, triggerId, reviewId, category, createdAt',
    });
  }
}

export const db = new TraderMindDB();

/** مقادیر پیش‌فرض */
export const defaultPreTradingState: PreTradingState = {
  mood: 3, energy: 5, focus: 5, stress: 3, readiness: 3, notes: ''
};

export const defaultEndOfDayReview: EndOfDayReview = {
  didWell: '', didWrong: '', learned: '', followedRules: null
};

export const defaultJournalData: Omit<DailyJournal, 'id' | 'createdAt' | 'updatedAt'> = {
  date: '',
  mood: 3, energyLevel: 5, focusLevel: 5, stressLevel: 3,
  emotions: '[]',
  importantEventsToday: null, importantEventsYesterday: null,
  preTradingState: JSON.stringify(defaultPreTradingState),
  endOfDayReview: JSON.stringify(defaultEndOfDayReview),
  notes: '', tags: '[]',
};
