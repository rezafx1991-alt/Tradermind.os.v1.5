/**
 * Chart Screenshot Intelligence Types — Prompt 27
 * ──────────────────────────────────────────────────
 * Types for standalone screenshot library (not tied to a specific trade).
 * Supports collections, groups, visual patterns, and analytics.
 */

export type ChartScreenshotType =
  | 'pre-trade'
  | 'entry'
  | 'management'
  | 'exit'
  | 'post-trade'
  | 'historical-replay'
  | 'reference';

export type PatternTag =
  | 'breakout'
  | 'pullback'
  | 'reversal'
  | 'continuation'
  | 'range'
  | 'liquidity-sweep'
  | 'compression'
  | 'expansion'
  | 'trend'
  | 'countertrend';

export const PATTERN_TAG_LABELS: Record<PatternTag | string, string> = {
  breakout: 'شکست',
  pullback: 'پولبک',
  reversal: 'بازگشت',
  continuation: 'ادامه',
  range: 'رنج',
  'liquidity-sweep': 'جمع نقدینگی',
  compression: 'فشردگی',
  expansion: 'انبساط',
  trend: 'روند',
  countertrend: 'ضدروند',
};

export const SCREENSHOT_TYPE_LABELS: Record<ChartScreenshotType, string> = {
  'pre-trade': 'پیش از معامله',
  entry: 'ورود',
  management: 'مدیریت',
  exit: 'خروج',
  'post-trade': 'پس از معامله',
  'historical-replay': 'ری‌پلی تاریخی',
  reference: 'مرجع',
};

export const SESSION_LABELS: Record<string, string> = {
  asian: 'سشن آسیا',
  london: 'سشن لندن',
  newyork: 'سشن نیویورک',
  overlap: 'اورلپ لندن/نیویورک',
  custom: 'سشن دلخواه',
};

export const DAY_LABELS: Record<number, string> = {
  0: 'یک‌شنبه',
  1: 'دوشنبه',
  2: 'سه‌شنبه',
  3: 'چهارشنبه',
  4: 'پنج‌شنبه',
  5: 'جمعه',
  6: 'شنبه',
};

/** آمار یک الگوی بصری بر اساس معاملات */
export interface PatternPerformanceStats {
  patternTag: string;
  label: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number;       // %
  avgR: number | null;
  medianR: number | null;
  maxLoss: number | null;
  maxWin: number | null;
  expectancy: number | null;
  avgRisk: number | null;
  commonMistakes: string[];
  commonStrengths: string[];
  sampleWarning: boolean; // true if < 5 trades
}

/** عملکرد الگو به تفکیک سشن */
export interface PatternBySession {
  session: string;
  sessionLabel: string;
  tradeCount: number;
  winRate: number;
  avgR: number | null;
}

/** عملکرد الگو به تفکیک روز هفته */
export interface PatternByDay {
  dayOfWeek: number;
  dayLabel: string;
  tradeCount: number;
  winRate: number;
  avgR: number | null;
}

/** عملکرد الگو به تفکیک تایم‌فریم */
export interface PatternByTimeframe {
  timeframe: string;
  tradeCount: number;
  winRate: number;
  avgR: number | null;
}

/** یک نمونه مشابه (از جستجوی اسکرین‌شات‌های مستقل) */
export interface ChartSimilarityMatch {
  screenshotId: string;
  symbol: string | null;
  timeframe: string | null;
  session: string | null;
  date: string | null;
  screenshotType: ChartScreenshotType;
  patternTags: string[];
  matchScore: number;
  matchedTags: string[];
  dataUrl: string;
  imageBlob: Blob | null;
  label: string | null;
  linkedTradeId: string | null;
  createdAt: number;
}

/** خلاصه توزیع نتایج تاریخی */
export interface OutcomeDistribution {
  total: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgR: number | null;
  medianR: number | null;
  maxLoss: number | null;
  avgRisk: number | null;
  sampleWarning: boolean;
}

/** الگوی تکراری (اشتباه یا نقطه قوت) */
export interface RepeatedPattern {
  label: string;
  count: number;
  total: number;
  rate: number;
  evidence: string;
  severity: 'low' | 'medium' | 'high';
  type: 'mistake' | 'strength';
  relatedTradeIds: string[];
}

/** خلاصه بینش پیش از معامله بصری */
export interface VisualPreTradeBriefing {
  symbol: string | null;
  setup: string | null;
  similarScreenshots: ChartSimilarityMatch[];
  outcomeDistribution: OutcomeDistribution | null;
  relevantLessons: string[];
  relevantRules: string[];
  knownMistakes: RepeatedPattern[];
  dataQualityNote: string | null;
}
