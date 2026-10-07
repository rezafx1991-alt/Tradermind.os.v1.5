/** ── Screenshot Types — Prompt 15 ──────────────────────────────── */

export type ScreenshotTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | 'D' | 'W' | null;
export type LifecyclePosition = 'before-entry' | 'during-trade' | 'after-trade' | null;
export type ScreenshotType = 'analysis' | 'entry' | 'exit' | 'post-trade';
export type ConfidenceLevel = 'low' | 'medium' | 'high';

// ── Visual Features ──────────────────────────────────────────────

export type PriceActionFeature =
  | 'bullish-impulse' | 'bearish-impulse'
  | 'strong-displacement' | 'small-range-consolidation' | 'large-range-consolidation'
  | 'trend-up' | 'trend-down' | 'range'
  | 'expansion' | 'compression'
  | 'reversal' | 'breakout' | 'false-breakout';

export type StructureFeature =
  | 'higher-highs' | 'higher-lows' | 'lower-highs' | 'lower-lows'
  | 'break-of-structure' | 'change-of-character' | 'swing-structure';

export type RetracementFeature =
  | 'shallow-retracement' | 'medium-retracement' | 'deep-retracement'
  | 'return-to-origin' | 'retracement-into-zone';

export type RangeBehaviorFeature =
  | 'range-formation' | 'range-expansion' | 'range-breakout'
  | 'failed-breakout' | 'reentry-into-range';

export type VisualReactionFeature =
  | 'rejection' | 'strong-continuation' | 'slow-continuation'
  | 'failed-continuation' | 'reversal-reaction';

export type FibonacciFeature =
  | 'fib-23.6' | 'fib-38.2' | 'fib-50' | 'fib-61.8' | 'fib-78.6' | 'fib-100';

export type VisualFeatureCategory = 'price-action' | 'structure' | 'retracement' | 'range' | 'reaction' | 'fibonacci';

export interface VisualFeature {
  id: string;
  category: VisualFeatureCategory;
  label: string;
  value: string;
  confidence: ConfidenceLevel;
  notes: string | null;
  source: 'ai' | 'user';
  confirmed: boolean | null; // null=not reviewed, true=confirmed, false=rejected
  correctedValue: string | null;
  correctionNote: string | null;
}

// ── Fibonacci Visual Analysis ────────────────────────────────────

export interface FibonacciVisualAnalysis {
  detected: boolean;
  confidence: ConfidenceLevel;
  orientation: 'bullish' | 'bearish' | null;
  approximateLevels: FibonacciFeature[];
  priceReactionNotes: string | null;
  source: 'user-explicit' | 'ai-inferred';
}

// ── Annotations ─────────────────────────────────────────────────

export type AnnotationType =
  | 'entry' | 'stop-loss' | 'take-profit'
  | 'support' | 'resistance' | 'liquidity'
  | 'fibonacci' | 'impulse-start' | 'impulse-end'
  | 'range-high' | 'range-low' | 'important-candle'
  | 'zone' | 'arrow' | 'label';

export interface AnnotationPoint {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
}

export interface ScreenshotAnnotation {
  id: string;
  type: AnnotationType;
  label: string;
  points: AnnotationPoint[];
  color: string;
  createdAt: number;
}

// ── Image Quality ────────────────────────────────────────────────

export interface ImageQualityReport {
  score: number; // 0-100
  width: number;
  height: number;
  fileSize: number;
  issues: string[];
  confidence: ConfidenceLevel;
}

// ── MTF Analysis ─────────────────────────────────────────────────

export type MTFAlignment = 'aligned' | 'conflicting' | 'partial';

export interface MTFRelationship {
  higherTFSignal: string | null;
  intermediateTFSignal: string | null;
  entryTFSignal: string | null;
  executionTFSignal: string | null;
  alignment: MTFAlignment | null;
  notes: string | null;
}

// ── Extended Screenshot Interface ─────────────────────────────────

export interface TradeScreenshot {
  id: string;
  label: string;
  dataUrl: string; // original — NEVER overwrite
  type: ScreenshotType;
  linkedTo: string | null;

  // Prompt 15 extended fields
  timeframe: ScreenshotTimeframe;
  lifecyclePosition: LifecyclePosition;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  quality: ImageQualityReport | null;
  extractedFeatures: VisualFeature[];
  fibonacci: FibonacciVisualAnalysis | null;
  analysisNotes: string | null;
  userAddedFeatures: VisualFeature[];
  annotations: ScreenshotAnnotation[];
  createdAt: number;
}

// ── Visual Similarity ────────────────────────────────────────────

export interface VisualSimilarityMatch {
  tradeId: string;
  screenshotId: string;
  symbol: string;
  timeframe: ScreenshotTimeframe;
  direction: 'long' | 'short';
  tradeResult: string;
  matchScore: number;
  matchedFeatures: string[];
  label: string;
  dataUrl: string;
  imageBlob: Blob | null;
  createdAt: number;
}

// ── Analysis Comparison ──────────────────────────────────────────

export interface AnalysisComparison {
  userText: string;
  extractedFeatures: VisualFeature[];
  agreements: string[];
  differences: string[];
}

// ── Persian Labels ───────────────────────────────────────────────

export const FEATURE_LABELS: Record<string, string> = {
  'bullish-impulse': 'ایمپالس صعودی',
  'bearish-impulse': 'ایمپالس نزولی',
  'strong-displacement': 'جابجایی قوی',
  'small-range-consolidation': 'تراکم کوچک',
  'large-range-consolidation': 'تراکم بزرگ',
  'trend-up': 'روند صعودی',
  'trend-down': 'روند نزولی',
  'range': 'محدوده رنج',
  'expansion': 'انبساط',
  'compression': 'فشردگی',
  'reversal': 'بازگشت',
  'breakout': 'شکست',
  'false-breakout': 'شکست کاذب',
  'higher-highs': 'سقف‌های بالاتر (HH)',
  'higher-lows': 'کف‌های بالاتر (HL)',
  'lower-highs': 'سقف‌های پایین‌تر (LH)',
  'lower-lows': 'کف‌های پایین‌تر (LL)',
  'break-of-structure': 'شکست ساختار (BOS)',
  'change-of-character': 'تغییر کاراکتر (CHOCH)',
  'swing-structure': 'ساختار سوئینگ',
  'shallow-retracement': 'پولبک کم‌عمق',
  'medium-retracement': 'پولبک متوسط',
  'deep-retracement': 'پولبک عمیق',
  'return-to-origin': 'بازگشت به مبدأ',
  'retracement-into-zone': 'پولبک به ناحیه',
  'range-formation': 'تشکیل رنج',
  'range-expansion': 'انبساط رنج',
  'range-breakout': 'شکست رنج',
  'failed-breakout': 'شکست ناموفق رنج',
  'reentry-into-range': 'ورود مجدد به رنج',
  'rejection': 'رد قیمت',
  'strong-continuation': 'ادامه قوی',
  'slow-continuation': 'ادامه کُند',
  'failed-continuation': 'ادامه ناموفق',
  'reversal-reaction': 'واکنش بازگشتی',
  'fib-23.6': 'فیبوناچی ۲۳.۶٪',
  'fib-38.2': 'فیبوناچی ۳۸.۲٪',
  'fib-50': 'فیبوناچی ۵۰٪',
  'fib-61.8': 'فیبوناچی ۶۱.۸٪',
  'fib-78.6': 'فیبوناچی ۷۸.۶٪',
  'fib-100': 'فیبوناچی ۱۰۰٪',
};

export const ANNOTATION_LABELS: Record<AnnotationType, string> = {
  'entry': 'نقطه ورود',
  'stop-loss': 'حد ضرر',
  'take-profit': 'حد سود',
  'support': 'حمایت',
  'resistance': 'مقاومت',
  'liquidity': 'نقدینگی',
  'fibonacci': 'فیبوناچی',
  'impulse-start': 'شروع ایمپالس',
  'impulse-end': 'پایان ایمپالس',
  'range-high': 'سقف رنج',
  'range-low': 'کف رنج',
  'important-candle': 'کندل مهم',
  'zone': 'ناحیه',
  'arrow': 'فلش',
  'label': 'برچسب',
};

export const TIMEFRAME_LABELS: Record<string, string> = {
  '1m': '۱ دقیقه',
  '5m': '۵ دقیقه',
  '15m': '۱۵ دقیقه',
  '1h': '۱ ساعت',
  '4h': '۴ ساعت',
  'D': 'روزانه',
  'W': 'هفتگی',
};

export const LIFECYCLE_LABELS: Record<string, string> = {
  'before-entry': 'قبل از ورود',
  'during-trade': 'حین معامله',
  'after-trade': 'پس از معامله',
};

export const TIMEFRAME_ORDER: ScreenshotTimeframe[] = ['W', 'D', '4h', '1h', '15m', '5m', '1m'];

export const FEATURE_CATEGORIES: { id: VisualFeatureCategory; label: string; features: string[] }[] = [
  {
    id: 'price-action',
    label: 'پرایس اکشن',
    features: [
      'bullish-impulse', 'bearish-impulse', 'strong-displacement',
      'small-range-consolidation', 'large-range-consolidation',
      'trend-up', 'trend-down', 'range', 'expansion', 'compression',
      'reversal', 'breakout', 'false-breakout',
    ],
  },
  {
    id: 'structure',
    label: 'ساختار بازار',
    features: [
      'higher-highs', 'higher-lows', 'lower-highs', 'lower-lows',
      'break-of-structure', 'change-of-character', 'swing-structure',
    ],
  },
  {
    id: 'retracement',
    label: 'پولبک / ریتریسمنت',
    features: [
      'shallow-retracement', 'medium-retracement', 'deep-retracement',
      'return-to-origin', 'retracement-into-zone',
    ],
  },
  {
    id: 'range',
    label: 'رفتار رنج',
    features: [
      'range-formation', 'range-expansion', 'range-breakout',
      'failed-breakout', 'reentry-into-range',
    ],
  },
  {
    id: 'reaction',
    label: 'واکنش بصری',
    features: [
      'rejection', 'strong-continuation', 'slow-continuation',
      'failed-continuation', 'reversal-reaction',
    ],
  },
  {
    id: 'fibonacci',
    label: 'فیبوناچی',
    features: ['fib-23.6', 'fib-38.2', 'fib-50', 'fib-61.8', 'fib-78.6', 'fib-100'],
  },
];
