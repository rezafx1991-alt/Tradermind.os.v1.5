/**
 * symbolIntelligenceService — سیستم هوش رفتاری نمادهای معاملاتی
 *
 * این سرویس یاد می‌گیرد هر نماد چطور رفتار می‌کند — بر اساس داده‌های واقعی کاربر.
 * تمام توابع Pure هستند؛ هیچ فرض از پیش‌تعریف‌شده‌ای درباره هیچ نمادی وجود ندارد.
 */
import { Trade } from '../db/database';
import { InsightCard } from './analyticsService';
import { isWin, isLoss, isClosed, getNetPnl } from '../lib/tradeHelpers';

// ================================================================
// Types
// ================================================================

export type AssetClass = 'forex' | 'crypto' | 'commodity' | 'index' | 'stock' | 'other';
export type TradingSession = 'asian' | 'london' | 'overlap' | 'newyork' | 'off-hours';
export type MarketRegime =
  | 'strong-trend' | 'weak-trend' | 'range' | 'high-volatility'
  | 'low-volatility' | 'expansion' | 'compression' | 'reversal' | 'unknown';

export interface SessionStat {
  session: TradingSession;
  label: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number | null;
  totalPnl: number;
}

export interface PatternStat {
  tag: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number | null;
  confidence: ConfidenceLevel;
}

export interface FibStat {
  level: string;   // e.g. "38.2", "61.8"
  count: number;
  wins: number;
  winRate: number;
  confidence: ConfidenceLevel;
}

export interface ImpulseStat {
  type: string;   // e.g. "bullish", "bearish"
  count: number;
  outcomes: { label: string; count: number; pct: number }[];
}

export interface RegimeStat {
  regime: MarketRegime;
  label: string;
  total: number;
  wins: number;
  winRate: number;
  avgR: number | null;
}

export interface TemporalStat {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number | null;
  totalPnl: number;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface SymbolBehaviorProfile {
  symbol: string;
  assetClass: AssetClass;

  // اطلاعات پایه
  totalTrades: number;
  firstTradeDate: number | null;
  lastTradeDate: number | null;

  // عملکرد
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;         // درصد ۰–۱۰۰
  avgR: number | null;
  medianR: number | null;
  totalPnl: number;
  avgHoldingHours: number | null;

  // Long vs Short
  longStats: { total: number; wins: number; winRate: number; avgR: number | null };
  shortStats: { total: number; wins: number; winRate: number; avgR: number | null };

  // جلسات معاملاتی
  sessionStats: SessionStat[];

  // الگوها (از تگ‌ها)
  patternStats: PatternStat[];

  // فیبوناچی / ریتریسمنت
  fibStats: FibStat[];

  // ایمپالس
  impulseStats: ImpulseStat[];

  // رژیم‌های بازار
  regimeStats: RegimeStat[];

  // خطاهای رایج (از review.didWrong)
  commonMistakes: string[];

  // رفتارهای موفق (از review.didWell)
  successfulBehaviors: string[];

  // تحلیل زمانی: اخیر (۳۰ روز) در مقابل تاریخی
  recent: TemporalStat;
  historical: TemporalStat;

  // امتیاز ترکیبی برای رتبه‌بندی (۰–۱۰۰)
  compositeScore: number;

  // سطح اطمینان بر اساس حجم داده
  dataConfidence: ConfidenceLevel;

  // insights
  insights: InsightCard[];

  // ── Prompt-14 additions ──────────────────────────────────────
  /** آمار مرور ساختاریافته پس از معامله */
  ptrSummary: PTRSummary | null;
  /** امضای رفتاری نماد — مشاهدات تکراری از داده‌های واقعی */
  behavioralSignature: BehavioralSignatureEntry[];
  /** عملکرد بر اساس تایم‌فریم (از تگ‌ها) */
  timeframeStats: TimeframeStat[];
}

export interface SymbolComparison {
  symbols: string[];
  metrics: {
    label: string;
    values: Record<string, string | number>;
    winner: string | null;
  }[];
  sameSymbolFindings: string[];
  crossSymbolFindings: string[];
}

export interface PreTradeSymbolInsight {
  symbol: string;
  sameSymbolCount: number;
  sameSymbolWinRate: number | null;
  sameSymbolAvgR: number | null;
  sameSymbolTrades: Trade[];
  crossSymbolCount: number;
  crossSymbolTrades: Trade[];
  relevantPatterns: PatternStat[];
  warnings: string[];
  confidence: ConfidenceLevel;
}

// ────────────────────────────────────────────────────────────────
// NEW: Prompt-14 additions
// ────────────────────────────────────────────────────────────────

/** آمار اجرای معامله از داده‌های مرور ساختاریافته */
export interface ExecutionStat {
  metric: string;                 // کلید داخلی
  label: string;                  // برچسب فارسی
  trueCount: number;              // تعداد دفعات true
  falseCount: number;
  total: number;                  // total answered
  trueWinRate: number | null;     // نرخ برد وقتی true
  falseWinRate: number | null;
}

/** یک مشاهده در امضای رفتاری نماد */
export interface BehavioralSignatureEntry {
  observation: string;            // متن فارسی مشاهده
  confidence: ConfidenceLevel;
  evidence: number;               // تعداد نمونه‌های پشتیبان
  category: 'impulse' | 'retracement' | 'range' | 'execution' | 'session' | 'regime' | 'direction' | 'pattern';
}

/** آمار عملکرد بر اساس تایم‌فریم (از تگ‌ها) */
export interface TimeframeStat {
  timeframe: string;              // '4H', '15M', '5M', '1M'
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number | null;
  confidence: ConfidenceLevel;
}

/** خلاصه آمار مرور ساختاریافته پس از معامله */
export interface PTRSummary {
  reviewedCount: number;
  avgTradeQuality: number | null;
  avgExecutionQuality: number | null;
  avgAnalysisQuality: number | null;
  directionalAccuracy: { correct: number; partial: number; incorrect: number; total: number };
  executionStats: ExecutionStat[];
  topBehaviorFlags: { flag: string; label: string; count: number; pct: number }[];
  commonLossCategories: { category: string; label: string; count: number; pct: number }[];
}

// ================================================================
// Helpers
// ================================================================

function calcWinRate(trades: Trade[]): number {
  const cl = trades.filter(isClosed);
  if (cl.length === 0) return 0;
  return (cl.filter(isWin).length / cl.length) * 100;
}

function calcAvgR(trades: Trade[]): number | null {
  const withR = trades.filter(isClosed).filter(t => t.rMultiple != null);
  if (withR.length === 0) return null;
  return withR.reduce((s, t) => s + (t.rMultiple || 0), 0) / withR.length;
}

function calcMedianR(trades: Trade[]): number | null {
  const rs = trades.filter(isClosed).filter(t => t.rMultiple != null).map(t => t.rMultiple!);
  if (rs.length === 0) return null;
  const sorted = [...rs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calcTotalPnl(trades: Trade[]): number {
  return trades.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0);
}

function parseTags(json: string): string[] {
  try { return JSON.parse(json) || []; } catch { return []; }
}

function confidence(n: number): ConfidenceLevel {
  if (n >= 15) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

// ================================================================
// Session Detection (UTC hours)
// ================================================================

const SESSION_LABELS: Record<TradingSession, string> = {
  asian: 'آسیا (۰۰–۰۷ UTC)',
  london: 'لندن (۰۷–۱۳ UTC)',
  overlap: 'همپوشانی لندن/نیویورک (۱۳–۱۶ UTC)',
  newyork: 'نیویورک (۱۶–۲۱ UTC)',
  'off-hours': 'خارج از ساعات (۲۱–۰۰ UTC)',
};

export function detectSession(timestamp: number): TradingSession {
  const h = new Date(timestamp).getUTCHours();
  if (h >= 0 && h < 7)   return 'asian';
  if (h >= 7 && h < 13)  return 'london';
  if (h >= 13 && h < 16) return 'overlap';
  if (h >= 16 && h < 21) return 'newyork';
  return 'off-hours';
}

// ================================================================
// Asset Class Detection (from symbol pattern)
// ================================================================

export function detectAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase();
  // Crypto
  if (/BTC|ETH|SOL|ADA|XRP|DOGE|AVAX|BNB|MATIC|DOT/.test(s)) return 'crypto';
  // Commodities
  if (/XAU|GOLD|XAG|SILVER|OIL|WTI|BRENT|NGAS|COCOA|COFFEE|WHEAT|COPPER/.test(s)) return 'commodity';
  // Indices
  if (/US30|US500|US100|NAS|SPX|DAX|FTSE|NIKKEI|ASX|UK|GER|FRA|JP|AU200/.test(s)) return 'index';
  // Stocks (ticker-like)
  if (s.length <= 4 && /^[A-Z]+$/.test(s) && !s.includes('USD') && !s.includes('EUR') && !s.includes('GBP')) return 'stock';
  // Forex (major/minor pairs)
  if (/USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF/.test(s)) return 'forex';
  return 'other';
}

// ================================================================
// Fibonacci Level Detection (from tags)
// ================================================================

const FIB_LEVELS = ['23.6', '38.2', '50', '61.8', '78.6', '100', '127.2', '161.8'];

function extractFibTag(tag: string): string | null {
  for (const level of FIB_LEVELS) {
    if (tag.includes(level) || tag.toLowerCase().includes('fib' + level.replace('.', '')) ||
        tag.toLowerCase().includes('fib-' + level)) {
      return level;
    }
  }
  return null;
}

// ================================================================
// Market Regime Detection (from tags)
// ================================================================

const REGIME_MAP: { keywords: string[]; regime: MarketRegime; label: string }[] = [
  { keywords: ['strong-trend', 'strong trend', 'trend-strong', 'صعودی-قوی', 'نزولی-قوی'], regime: 'strong-trend', label: 'ترند قوی' },
  { keywords: ['weak-trend', 'weak trend', 'ترند-ضعیف'], regime: 'weak-trend', label: 'ترند ضعیف' },
  { keywords: ['range', 'ranging', 'رنج', 'محدوده'], regime: 'range', label: 'رنج' },
  { keywords: ['high-vol', 'high volatility', 'نوسان-بالا', 'volatile'], regime: 'high-volatility', label: 'نوسان بالا' },
  { keywords: ['low-vol', 'low volatility', 'نوسان-پایین', 'quiet'], regime: 'low-volatility', label: 'نوسان پایین' },
  { keywords: ['expansion', 'expanding', 'انبساط'], regime: 'expansion', label: 'انبساط' },
  { keywords: ['compression', 'consolidation', 'فشردگی', 'consolidating'], regime: 'compression', label: 'فشردگی' },
  { keywords: ['reversal', 'برگشت', 'ریورسال'], regime: 'reversal', label: 'برگشت' },
];

function extractRegime(tag: string): MarketRegime | null {
  const lower = tag.toLowerCase();
  for (const { keywords, regime } of REGIME_MAP) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return regime;
  }
  return null;
}

// ================================================================
// Impulse Detection (from tags)
// ================================================================

const IMPULSE_LABELS: { keywords: string[]; type: string; label: string }[] = [
  { keywords: ['impulse-bullish', 'bullish-impulse', 'ایمپالس-صعودی', 'spike-up'], type: 'bullish', label: 'ایمپالس صعودی' },
  { keywords: ['impulse-bearish', 'bearish-impulse', 'ایمپالس-نزولی', 'spike-down'], type: 'bearish', label: 'ایمپالس نزولی' },
  { keywords: ['impulse', 'ایمپالس', 'spike', 'expansion'], type: 'general', label: 'ایمپالس' },
];

const POST_IMPULSE_LABELS: { keywords: string[]; label: string }[] = [
  { keywords: ['continuation', 'ادامه'], label: 'ادامه حرکت' },
  { keywords: ['reversal', 'برگشت', 'ریورسال'], label: 'برگشت' },
  { keywords: ['range', 'رنج', 'consolidation'], label: 'رنج' },
  { keywords: ['deep-retracement', 'ریتریس-عمیق'], label: 'ریتریسمنت عمیق' },
  { keywords: ['shallow-retracement', 'ریتریس-سطحی'], label: 'ریتریسمنت سطحی' },
  { keywords: ['liquidity-sweep', 'لیکوئیدیتی'], label: 'لیکوئیدیتی سوئیپ' },
];

// ================================================================
// Temporal Split (30 days = recent)
// ================================================================

const RECENT_DAYS = 30;

function splitTemporal(trades: Trade[]): { recent: Trade[]; historical: Trade[] } {
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  return {
    recent: trades.filter(t => t.openedAt >= cutoff),
    historical: trades.filter(t => t.openedAt < cutoff),
  };
}

function makeTemporal(trades: Trade[]): TemporalStat {
  const cl = trades.filter(isClosed);
  return {
    total: trades.length,
    wins: cl.filter(isWin).length,
    losses: cl.filter(isLoss).length,
    winRate: calcWinRate(trades),
    avgR: calcAvgR(trades),
    totalPnl: calcTotalPnl(trades),
  };
}

// ================================================================
// Review Extraction
// ================================================================

function extractReviewTexts(trades: Trade[], field: 'didWrong' | 'didWell'): string[] {
  const texts: string[] = [];
  for (const t of trades) {
    try {
      const r = JSON.parse(t.review || '{}');
      const txt = r[field];
      if (typeof txt === 'string' && txt.trim().length > 5) {
        texts.push(txt.trim());
      }
    } catch { /* skip */ }
  }
  return texts;
}

// ================================================================
// PTR (Post-Trade Review) Data Extraction — Prompt 14
// ================================================================

interface PTRData {
  completedAt: number;
  directionalAccuracy: 'correct' | 'partial' | 'incorrect' | null;
  entryFollowedPlan: boolean | null;
  enteredWithConfirmation: boolean | null;
  entryTiming: 'early' | 'ontime' | 'late' | null;
  slRespected: boolean | null;
  slMoved: boolean | null;
  closedEarly: boolean | null;
  heldTooLong: boolean | null;
  riskIncreased: boolean | null;
  marketAsExpected: boolean | null;
  deeperRetracement: boolean | null;
  priceEnteredRange: boolean | null;
  behaviorFlags: string[];
  lossCategory: string | null;
  tradeQualityScore: number | null;
  executionQualityScore: number | null;
  analysisQualityScore: number | null;
  riskMgmtQualityScore: number | null;
  luckyWin: boolean | null;
}

function parsePTR(trade: Trade): PTRData | null {
  try {
    const d = JSON.parse(trade.postTradeReview || '{}');
    if (!d.completedAt || d.completedAt === 0) return null;
    return d as PTRData;
  } catch { return null; }
}

const BEHAVIOR_FLAG_LABELS: Record<string, string> = {
  fomo: 'FOMO (ترس از دست دادن)',
  revenge: 'معامله انتقامی',
  'fear-of-loss': 'ترس از ضرر',
  'false-confidence': 'اعتماد کاذب',
  overtrading: 'بیش‌معامله‌گری',
  'ignored-plan': 'نادیده گرفتن پلن',
  'size-up': 'افزایش حجم بدون دلیل',
  impatience: 'بی‌صبری',
};

const LOSS_CATEGORY_LABELS: Record<string, string> = {
  'entry-too-early': 'ورود زود هنگام',
  'entry-too-late': 'ورود دیر هنگام',
  'wrong-direction': 'جهت اشتباه',
  'invalidated-sl': 'نقض حد ضرر',
  'management-error': 'خطای مدیریت',
  'market-unexpected': 'رویداد غیرمنتظره',
};

function computePTRSummary(trades: Trade[]): PTRSummary | null {
  const ptrs = trades.map(t => ({ trade: t, ptr: parsePTR(t) })).filter(x => x.ptr !== null) as { trade: Trade; ptr: PTRData }[];
  if (ptrs.length === 0) return null;

  const cl = ptrs.filter(x => isClosed(x.trade));
  const reviewedCount = ptrs.length;

  // میانگین کیفیت
  const avgQ = (field: keyof PTRData) => {
    const vals = ptrs.map(x => x.ptr[field] as number | null).filter((v): v is number => typeof v === 'number');
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  // دقت جهت
  const dirCounts = { correct: 0, partial: 0, incorrect: 0, total: 0 };
  ptrs.forEach(x => {
    if (x.ptr.directionalAccuracy) {
      dirCounts[x.ptr.directionalAccuracy]++;
      dirCounts.total++;
    }
  });

  // execution stats
  type BoolKey = 'entryFollowedPlan' | 'enteredWithConfirmation' | 'slRespected' | 'slMoved' | 'closedEarly' | 'heldTooLong' | 'marketAsExpected' | 'deeperRetracement';
  const execMetrics: { metric: BoolKey; label: string }[] = [
    { metric: 'entryFollowedPlan', label: 'پیروی از پلن ورود' },
    { metric: 'enteredWithConfirmation', label: 'ورود با تأیید' },
    { metric: 'slRespected', label: 'رعایت حد ضرر' },
    { metric: 'slMoved', label: 'جابجایی حد ضرر' },
    { metric: 'closedEarly', label: 'بستن زود هنگام' },
    { metric: 'heldTooLong', label: 'نگهداری بیش از حد' },
    { metric: 'marketAsExpected', label: 'بازار مطابق انتظار' },
    { metric: 'deeperRetracement', label: 'ریتریسمنت عمیق‌تر' },
  ];

  const executionStats: ExecutionStat[] = execMetrics.map(({ metric, label }) => {
    const answered = cl.filter(x => x.ptr[metric] !== null && x.ptr[metric] !== undefined);
    const trueOnes = answered.filter(x => x.ptr[metric] === true);
    const falseOnes = answered.filter(x => x.ptr[metric] === false);
    const trueWR = trueOnes.length >= 2 ? calcWinRate(trueOnes.map(x => x.trade)) : null;
    const falseWR = falseOnes.length >= 2 ? calcWinRate(falseOnes.map(x => x.trade)) : null;
    return {
      metric,
      label,
      trueCount: trueOnes.length,
      falseCount: falseOnes.length,
      total: answered.length,
      trueWinRate: trueWR,
      falseWinRate: falseWR,
    };
  }).filter(s => s.total >= 2);

  // behavior flags
  const flagCounts: Map<string, number> = new Map();
  ptrs.forEach(x => {
    (x.ptr.behaviorFlags || []).forEach((f: string) => {
      flagCounts.set(f, (flagCounts.get(f) || 0) + 1);
    });
  });
  const topBehaviorFlags = Array.from(flagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([flag, count]) => ({
      flag,
      label: BEHAVIOR_FLAG_LABELS[flag] || flag,
      count,
      pct: Math.round((count / reviewedCount) * 100),
    }));

  // loss categories
  const lossCats: Map<string, number> = new Map();
  ptrs.filter(x => isLoss(x.trade)).forEach(x => {
    if (x.ptr.lossCategory) {
      lossCats.set(x.ptr.lossCategory, (lossCats.get(x.ptr.lossCategory) || 0) + 1);
    }
  });
  const lossTotal = Array.from(lossCats.values()).reduce((a, b) => a + b, 0);
  const commonLossCategories = Array.from(lossCats.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      label: LOSS_CATEGORY_LABELS[category] || category,
      count,
      pct: lossTotal > 0 ? Math.round((count / lossTotal) * 100) : 0,
    }));

  return {
    reviewedCount,
    avgTradeQuality: avgQ('tradeQualityScore'),
    avgExecutionQuality: avgQ('executionQualityScore'),
    avgAnalysisQuality: avgQ('analysisQualityScore'),
    directionalAccuracy: dirCounts,
    executionStats,
    topBehaviorFlags,
    commonLossCategories,
  };
}

// ================================================================
// Timeframe Stats (from tags) — Prompt 14
// ================================================================

const TF_PATTERNS: { regex: RegExp; tf: string }[] = [
  { regex: /\b(4h|h4|4hour|4H|H4)\b/i, tf: '4H' },
  { regex: /\b(1h|h1|1hour|1H|H1)\b/i, tf: '1H' },
  { regex: /\b(15m|m15|15min|15M|M15)\b/i, tf: '15M' },
  { regex: /\b(5m|m5|5min|5M|M5)\b/i, tf: '5M' },
  { regex: /\b(1m|m1|1min|1M|M1)\b/i, tf: '1M' },
];

function computeTimeframeStats(trades: Trade[]): TimeframeStat[] {
  const tfGroups: Map<string, Trade[]> = new Map();
  trades.forEach(t => {
    parseTags(t.tags).forEach(tag => {
      for (const { regex, tf } of TF_PATTERNS) {
        if (regex.test(tag)) {
          if (!tfGroups.has(tf)) tfGroups.set(tf, []);
          tfGroups.get(tf)!.push(t);
          break;
        }
      }
    });
  });
  const TF_ORDER = ['4H', '1H', '15M', '5M', '1M'];
  return TF_ORDER.filter(tf => tfGroups.has(tf)).map(tf => {
    const ts = tfGroups.get(tf)!;
    const cl = ts.filter(isClosed);
    return {
      timeframe: tf,
      count: ts.length,
      wins: cl.filter(isWin).length,
      losses: cl.filter(isLoss).length,
      winRate: calcWinRate(ts),
      avgR: calcAvgR(ts),
      confidence: confidence(ts.length),
    };
  });
}

// ================================================================
// Behavioral Signature — Prompt 14
// ================================================================

function computeBehavioralSignature(
  symbol: string,
  profile: {
    sessionStats: SessionStat[];
    patternStats: PatternStat[];
    fibStats: FibStat[];
    impulseStats: ImpulseStat[];
    regimeStats: RegimeStat[];
    longStats: { total: number; winRate: number };
    shortStats: { total: number; winRate: number };
    avgHoldingHours: number | null;
    ptrSummary: PTRSummary | null;
    recent: TemporalStat;
    historical: TemporalStat;
  }
): BehavioralSignatureEntry[] {
  const entries: BehavioralSignatureEntry[] = [];

  // جهت بهتر
  const { longStats, shortStats } = profile;
  if (longStats.total >= 3 && shortStats.total >= 3) {
    const diff = longStats.winRate - shortStats.winRate;
    if (Math.abs(diff) >= 15) {
      const better = diff > 0 ? 'Long' : 'Short';
      const betterWR = Math.max(longStats.winRate, shortStats.winRate);
      entries.push({
        observation: `معاملات ${better} روی ${symbol} نرخ برد بالاتری داشته‌اند (${betterWR.toFixed(0)}٪).`,
        confidence: confidence(Math.min(longStats.total, shortStats.total)),
        evidence: longStats.total + shortStats.total,
        category: 'direction',
      });
    }
  }

  // بهترین جلسه
  const validSess = profile.sessionStats.filter(s => s.total >= 3);
  if (validSess.length >= 2) {
    const best = [...validSess].sort((a, b) => b.winRate - a.winRate)[0];
    const worst = [...validSess].sort((a, b) => a.winRate - b.winRate)[0];
    if (best.winRate - worst.winRate >= 15) {
      entries.push({
        observation: `بهترین جلسه برای ${symbol}: ${best.label} (${best.winRate.toFixed(0)}٪ برد). ضعیف‌ترین: ${worst.label} (${worst.winRate.toFixed(0)}٪).`,
        confidence: confidence(best.total),
        evidence: validSess.reduce((s, x) => s + x.total, 0),
        category: 'session',
      });
    }
  }

  // رفتار بعد از ایمپالس
  for (const imp of profile.impulseStats) {
    if (imp.outcomes.length > 0 && imp.count >= 3) {
      const top = imp.outcomes[0];
      if (top.pct >= 40) {
        entries.push({
          observation: `پس از ${imp.type} روی ${symbol}، «${top.label}» رایج‌ترین رفتار بوده (${top.pct}٪ — ${imp.count} نمونه).`,
          confidence: confidence(imp.count),
          evidence: imp.count,
          category: 'impulse',
        });
      }
    }
  }

  // فیبوناچی پرتکرار
  const topFib = [...profile.fibStats].sort((a, b) => b.count - a.count)[0];
  if (topFib && topFib.count >= 3) {
    entries.push({
      observation: `سطح فیبوناچی ${topFib.level}٪ بیشترین تکرار را روی ${symbol} داشته (${topFib.count} نمونه، برد: ${topFib.winRate.toFixed(0)}٪).`,
      confidence: topFib.confidence,
      evidence: topFib.count,
      category: 'retracement',
    });
  }

  // بهترین رژیم
  const validRegimes = profile.regimeStats.filter(r => r.total >= 3);
  if (validRegimes.length >= 2) {
    const bestR = [...validRegimes].sort((a, b) => b.winRate - a.winRate)[0];
    entries.push({
      observation: `روی ${symbol}، رژیم «${bestR.label}» بهترین نتیجه را داشته (${bestR.winRate.toFixed(0)}٪ برد در ${bestR.total} نمونه).`,
      confidence: confidence(bestR.total),
      evidence: bestR.total,
      category: 'regime',
    });
  }

  // تغییر رفتار اخیر
  if (profile.recent.total >= 3 && profile.historical.total >= 3) {
    const diff = profile.recent.winRate - profile.historical.winRate;
    if (Math.abs(diff) >= 20) {
      entries.push({
        observation: `رفتار اخیر ${symbol} نسبت به تاریخی ${diff > 0 ? 'بهتر' : 'ضعیف‌تر'} شده است (${profile.recent.winRate.toFixed(0)}٪ اخیر در مقابل ${profile.historical.winRate.toFixed(0)}٪ تاریخی).`,
        confidence: confidence(profile.recent.total + profile.historical.total),
        evidence: profile.recent.total + profile.historical.total,
        category: 'pattern',
      });
    }
  }

  // بینش از PTR
  if (profile.ptrSummary) {
    const ptr = profile.ptrSummary;
    // پیروی از پلن
    const planStat = ptr.executionStats.find(s => s.metric === 'entryFollowedPlan');
    if (planStat && planStat.trueWinRate !== null && planStat.falseWinRate !== null && planStat.trueWinRate - planStat.falseWinRate >= 15) {
      entries.push({
        observation: `روی ${symbol}، پیروی از پلن با نرخ برد ${planStat.trueWinRate.toFixed(0)}٪ همراه بوده در مقابل ${planStat.falseWinRate.toFixed(0)}٪ بدون پیروی.`,
        confidence: confidence(planStat.total),
        evidence: planStat.total,
        category: 'execution',
      });
    }
    // دقت جهت
    if (ptr.directionalAccuracy.total >= 5) {
      const correctPct = Math.round((ptr.directionalAccuracy.correct / ptr.directionalAccuracy.total) * 100);
      if (correctPct >= 60) {
        entries.push({
          observation: `تحلیل جهت روی ${symbol} در ${correctPct}٪ از ${ptr.directionalAccuracy.total} مورد بررسی‌شده درست بوده.`,
          confidence: confidence(ptr.directionalAccuracy.total),
          evidence: ptr.directionalAccuracy.total,
          category: 'execution',
        });
      }
    }
    // بدترین رفتار
    const topFlag = ptr.topBehaviorFlags[0];
    if (topFlag && topFlag.pct >= 30) {
      entries.push({
        observation: `«${topFlag.label}» رایج‌ترین اشتباه رفتاری روی ${symbol} بوده است (${topFlag.pct}٪ از ریویوهای تکمیل‌شده).`,
        confidence: confidence(topFlag.count),
        evidence: topFlag.count,
        category: 'execution',
      });
    }
  }

  // زمان نگهداری
  if (profile.avgHoldingHours !== null && profile.avgHoldingHours > 0) {
    const h = profile.avgHoldingHours;
    const label = h < 1 ? `${(h * 60).toFixed(0)} دقیقه` : `${h.toFixed(1)} ساعت`;
    entries.push({
      observation: `متوسط زمان نگهداری معاملات روی ${symbol}: ${label}.`,
      confidence: 'medium',
      evidence: 0,
      category: 'pattern',
    });
  }

  // ── توالی رنج-پس-از-ایمپالس (Prompt 14, Section 7) ─────────────
  // دتکت می‌کند: معاملاتی که هم تگ ایمپالس دارند هم تگ رنج/فشردگی + سطح فیب یا ریتریس
  for (const imp of profile.impulseStats) {
    const rangeOutcome = imp.outcomes.find(o => o.label === 'رنج');
    const retracementOutcome = imp.outcomes.find(o => o.label === 'ریتریسمنت سطحی' || o.label === 'ریتریسمنت عمیق');
    if (imp.count >= 4 && rangeOutcome && rangeOutcome.pct >= 30) {
      // بررسی: بعد از رنج، آیا ادامه حرکت رایج است؟
      const continuationOutcome = imp.outcomes.find(o => o.label === 'ادامه حرکت');
      if (continuationOutcome && continuationOutcome.pct >= 25) {
        entries.push({
          observation: `روی ${symbol} الگوی توالی شناسایی شد: پس از ${imp.type} رنج (${rangeOutcome.pct}٪) و سپس ادامه حرکت (${continuationOutcome.pct}٪) رایج‌ترین توالی است — در ${imp.count} نمونه.`,
          confidence: confidence(imp.count),
          evidence: imp.count,
          category: 'impulse',
        });
      }
    }
    if (imp.count >= 4 && retracementOutcome && retracementOutcome.pct >= 30) {
      // بررسی فیب محتمل برای ریتریسمنت
      const topFib = [...profile.fibStats].sort((a, b) => b.count - a.count)[0];
      const fibNote = topFib && topFib.count >= 3 ? ` (سطح رایج: ${topFib.level}٪ فیب)` : '';
      entries.push({
        observation: `روی ${symbol} پس از ${imp.type}، ریتریسمنت${fibNote} در ${retracementOutcome.pct}٪ موارد رخ داده — در ${imp.count} نمونه.`,
        confidence: confidence(imp.count),
        evidence: imp.count,
        category: 'retracement',
      });
    }
  }

  return entries.slice(0, 10);
}

// ================================================================
// Composite Score (0–100)
// ================================================================

function calcCompositeScore(
  winRate: number,
  avgR: number | null,
  totalTrades: number,
  avgAdherence: number | null,
): number {
  // وزن‌ها
  const wrScore = Math.min(100, winRate);                           // 0-100
  const rScore = avgR != null ? Math.min(100, Math.max(0, (avgR + 1) * 33.3)) : 50; // -1R=0, 0R=33, 2R=100
  const sizeScore = Math.min(100, (totalTrades / 20) * 100);       // ۲۰ معامله = ۱۰۰
  const adhScore = avgAdherence != null ? avgAdherence : 50;

  return Math.round(wrScore * 0.30 + rScore * 0.35 + sizeScore * 0.20 + adhScore * 0.15);
}

// ================================================================
// Main: computeSymbolProfile
// ================================================================

export function computeSymbolProfile(symbol: string, allTrades: Trade[]): SymbolBehaviorProfile {
  const trades = allTrades.filter(t => t.symbol === symbol);
  const closed = trades.filter(isClosed);

  const totalTrades = trades.length;
  const wins = closed.filter(isWin).length;
  const losses = closed.filter(isLoss).length;
  const breakeven = closed.filter(t => t.result === 'breakeven').length;
  const winRate = calcWinRate(trades);
  const avgR = calcAvgR(trades);
  const medianR = calcMedianR(trades);
  const totalPnl = calcTotalPnl(trades);

  // متوسط زمان نگهداری (ساعت)
  const withHolding = closed.filter(t => t.closedAt != null && t.openedAt);
  const avgHoldingHours = withHolding.length > 0
    ? withHolding.reduce((s, t) => s + ((t.closedAt! - t.openedAt) / 3_600_000), 0) / withHolding.length
    : null;

  // Long vs Short
  const longs = trades.filter(t => t.direction === 'long');
  const shorts = trades.filter(t => t.direction === 'short');
  const longStats = {
    total: longs.length,
    wins: longs.filter(isClosed).filter(isWin).length,
    winRate: calcWinRate(longs),
    avgR: calcAvgR(longs),
  };
  const shortStats = {
    total: shorts.length,
    wins: shorts.filter(isClosed).filter(isWin).length,
    winRate: calcWinRate(shorts),
    avgR: calcAvgR(shorts),
  };

  // Session Stats
  const sessionGroups: Map<TradingSession, Trade[]> = new Map();
  trades.forEach(t => {
    const sess = detectSession(t.openedAt);
    if (!sessionGroups.has(sess)) sessionGroups.set(sess, []);
    sessionGroups.get(sess)!.push(t);
  });
  const sessionOrder: TradingSession[] = ['london', 'newyork', 'overlap', 'asian', 'off-hours'];
  const sessionStats: SessionStat[] = sessionOrder
    .filter(s => sessionGroups.has(s))
    .map(s => {
      const ts = sessionGroups.get(s)!;
      const cl2 = ts.filter(isClosed);
      return {
        session: s,
        label: SESSION_LABELS[s],
        total: ts.length,
        wins: cl2.filter(isWin).length,
        losses: cl2.filter(isLoss).length,
        winRate: calcWinRate(ts),
        avgR: calcAvgR(ts),
        totalPnl: calcTotalPnl(ts),
      };
    });

  // Pattern Stats (from tags)
  const tagGroups: Map<string, Trade[]> = new Map();
  trades.forEach(t => {
    parseTags(t.tags).forEach(tag => {
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag)!.push(t);
    });
  });
  const patternStats: PatternStat[] = [];
  for (const [tag, ts] of tagGroups) {
    if (ts.length < 1) continue;
    const cl2 = ts.filter(isClosed);
    patternStats.push({
      tag,
      count: ts.length,
      wins: cl2.filter(isWin).length,
      losses: cl2.filter(isLoss).length,
      winRate: calcWinRate(ts),
      avgR: calcAvgR(ts),
      confidence: confidence(ts.length),
    });
  }
  patternStats.sort((a, b) => b.count - a.count);

  // Fibonacci Stats
  const fibGroups: Map<string, Trade[]> = new Map();
  trades.forEach(t => {
    parseTags(t.tags).forEach(tag => {
      const level = extractFibTag(tag);
      if (level) {
        if (!fibGroups.has(level)) fibGroups.set(level, []);
        fibGroups.get(level)!.push(t);
      }
    });
  });
  const FIB_ORDER = ['23.6', '38.2', '50', '61.8', '78.6', '100'];
  const fibStats: FibStat[] = FIB_ORDER
    .filter(l => fibGroups.has(l))
    .map(level => {
      const ts = fibGroups.get(level)!;
      const cl2 = ts.filter(isClosed);
      return {
        level,
        count: ts.length,
        wins: cl2.filter(isWin).length,
        winRate: calcWinRate(ts),
        confidence: confidence(ts.length),
      };
    });

  // Impulse Stats
  const impulseGroups: Map<string, { trades: Trade[]; postImpulseCounts: Map<string, number> }> = new Map();
  trades.forEach(t => {
    const tags = parseTags(t.tags);
    for (const { keywords, type } of IMPULSE_LABELS) {
      if (tags.some(tag => keywords.some(k => tag.toLowerCase().includes(k.toLowerCase())))) {
        if (!impulseGroups.has(type)) {
          impulseGroups.set(type, { trades: [], postImpulseCounts: new Map() });
        }
        impulseGroups.get(type)!.trades.push(t);
        // بررسی رفتار بعد از ایمپالس
        for (const { keywords: pk, label } of POST_IMPULSE_LABELS) {
          if (tags.some(tag => pk.some(k => tag.toLowerCase().includes(k.toLowerCase())))) {
            const g = impulseGroups.get(type)!.postImpulseCounts;
            g.set(label, (g.get(label) || 0) + 1);
          }
        }
        break;
      }
    }
  });
  const impulseStats: ImpulseStat[] = [];
  for (const [type, { trades: iTs, postImpulseCounts }] of impulseGroups) {
    if (iTs.length < 1) continue;
    const total = iTs.length;
    const outcomes = Array.from(postImpulseCounts.entries()).map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / total) * 100),
    })).sort((a, b) => b.count - a.count);
    const typeLabel = IMPULSE_LABELS.find(x => x.type === type)?.label || type;
    impulseStats.push({ type: typeLabel, count: total, outcomes });
  }

  // Market Regime Stats
  const regimeGroups: Map<MarketRegime, Trade[]> = new Map();
  trades.forEach(t => {
    parseTags(t.tags).forEach(tag => {
      const regime = extractRegime(tag);
      if (regime) {
        if (!regimeGroups.has(regime)) regimeGroups.set(regime, []);
        regimeGroups.get(regime)!.push(t);
      }
    });
  });
  const regimeStats: RegimeStat[] = [];
  for (const [regime, ts] of regimeGroups) {
    if (ts.length < 1) continue;
    const cl2 = ts.filter(isClosed);
    const regimeLabel = REGIME_MAP.find(r => r.regime === regime)?.label || regime;
    regimeStats.push({
      regime,
      label: regimeLabel,
      total: ts.length,
      wins: cl2.filter(isWin).length,
      winRate: calcWinRate(ts),
      avgR: calcAvgR(ts),
    });
  }
  regimeStats.sort((a, b) => b.total - a.total);

  // Review Extraction
  const commonMistakes = extractReviewTexts(trades, 'didWrong').slice(0, 10);
  const successfulBehaviors = extractReviewTexts(trades, 'didWell').slice(0, 10);

  // Temporal
  const { recent: recentTrades, historical: historicalTrades } = splitTemporal(trades);
  const recent = makeTemporal(recentTrades);
  const historical = makeTemporal(historicalTrades);

  // Composite Score
  const avgAdherence = (() => {
    const w = closed.filter(t => t.adherenceScore != null);
    return w.length ? w.reduce((s, t) => s + (t.adherenceScore || 0), 0) / w.length : null;
  })();
  const compositeScore = calcCompositeScore(winRate, avgR, totalTrades, avgAdherence);

  const assetClass = detectAssetClass(symbol);
  const dataConfidence = confidence(totalTrades);

  // ── Prompt-14 additions ──
  const ptrSummary = computePTRSummary(trades);
  const timeframeStats = computeTimeframeStats(trades);

  // Insights
  const insights = generateSymbolInsights({
    symbol, totalTrades, winRate, avgR, sessionStats, patternStats,
    fibStats, regimeStats, longStats, shortStats, recent, historical,
    dataConfidence,
  });

  // Behavioral Signature (needs partially-built profile)
  const behavioralSignature = computeBehavioralSignature(symbol, {
    sessionStats, patternStats, fibStats, impulseStats, regimeStats,
    longStats, shortStats, avgHoldingHours, ptrSummary, recent, historical,
  });

  return {
    symbol,
    assetClass,
    totalTrades,
    firstTradeDate: trades.length > 0 ? Math.min(...trades.map(t => t.openedAt)) : null,
    lastTradeDate: trades.length > 0 ? Math.max(...trades.map(t => t.openedAt)) : null,
    wins,
    losses,
    breakeven,
    winRate,
    avgR,
    medianR,
    totalPnl,
    avgHoldingHours,
    longStats,
    shortStats,
    sessionStats,
    patternStats,
    fibStats,
    impulseStats,
    regimeStats,
    commonMistakes,
    successfulBehaviors,
    recent,
    historical,
    compositeScore,
    dataConfidence,
    insights,
    ptrSummary,
    behavioralSignature,
    timeframeStats,
  };
}

// ================================================================
// Compute All Symbol Profiles
// ================================================================

export function computeAllSymbolProfiles(trades: Trade[]): SymbolBehaviorProfile[] {
  const symbols = [...new Set(trades.map(t => t.symbol).filter(Boolean))];
  return symbols.map(s => computeSymbolProfile(s, trades));
}

// ================================================================
// Rank Symbols
// ================================================================

export function rankSymbols(profiles: SymbolBehaviorProfile[]): SymbolBehaviorProfile[] {
  return [...profiles].sort((a, b) => b.compositeScore - a.compositeScore);
}

// ================================================================
// Cross-Symbol Comparison
// ================================================================

export function compareSymbols(
  profiles: SymbolBehaviorProfile[],
  sym1: string,
  sym2: string,
): SymbolComparison {
  const p1 = profiles.find(p => p.symbol === sym1);
  const p2 = profiles.find(p => p.symbol === sym2);
  if (!p1 || !p2) {
    return { symbols: [sym1, sym2], metrics: [], sameSymbolFindings: [], crossSymbolFindings: [] };
  }

  const fmtPct = (v: number) => `${v.toFixed(1)}٪`;
  const fmtR = (v: number | null) => v != null ? `${v.toFixed(2)}R` : '—';
  const fmtN = (v: number) => `${v}`;

  // ── متریک‌های پایه ────────────────────────────────────────────────
  const metrics = [
    {
      label: 'کل معاملات',
      values: { [sym1]: p1.totalTrades, [sym2]: p2.totalTrades },
      winner: p1.totalTrades > p2.totalTrades ? sym1 : p2.totalTrades > p1.totalTrades ? sym2 : null,
    },
    {
      label: 'نرخ برد',
      values: { [sym1]: fmtPct(p1.winRate), [sym2]: fmtPct(p2.winRate) },
      winner: p1.winRate > p2.winRate ? sym1 : p2.winRate > p1.winRate ? sym2 : null,
    },
    {
      label: 'میانگین R',
      values: { [sym1]: fmtR(p1.avgR), [sym2]: fmtR(p2.avgR) },
      winner: (p1.avgR ?? -999) > (p2.avgR ?? -999) ? sym1 : (p2.avgR ?? -999) > (p1.avgR ?? -999) ? sym2 : null,
    },
    {
      label: 'میانه R',
      values: { [sym1]: fmtR(p1.medianR), [sym2]: fmtR(p2.medianR) },
      winner: (p1.medianR ?? -999) > (p2.medianR ?? -999) ? sym1 : (p2.medianR ?? -999) > (p1.medianR ?? -999) ? sym2 : null,
    },
    {
      label: 'امتیاز ترکیبی',
      values: { [sym1]: fmtN(p1.compositeScore), [sym2]: fmtN(p2.compositeScore) },
      winner: p1.compositeScore > p2.compositeScore ? sym1 : p2.compositeScore > p1.compositeScore ? sym2 : null,
    },
  ];

  // ── بهترین جلسه هر نماد ────────────────────────────────────────────
  const bestSess = (p: SymbolBehaviorProfile) => {
    const valid = p.sessionStats.filter(s => s.total >= 3);
    return valid.length > 0 ? [...valid].sort((a, b) => b.winRate - a.winRate)[0] : null;
  };
  const bs1 = bestSess(p1), bs2 = bestSess(p2);
  if (bs1 && bs2) {
    metrics.push({
      label: 'بهترین جلسه',
      values: { [sym1]: `${bs1.label.split('(')[0].trim()} (${fmtPct(bs1.winRate)})`, [sym2]: `${bs2.label.split('(')[0].trim()} (${fmtPct(bs2.winRate)})` },
      winner: bs1.winRate > bs2.winRate ? sym1 : bs2.winRate > bs1.winRate ? sym2 : null,
    });
  }

  // ── بهترین سطح فیب هر نماد ───────────────────────────────────────
  const bestFib = (p: SymbolBehaviorProfile) => {
    const valid = p.fibStats.filter(f => f.count >= 2);
    return valid.length > 0 ? [...valid].sort((a, b) => b.winRate - a.winRate)[0] : null;
  };
  const bf1 = bestFib(p1), bf2 = bestFib(p2);
  if (bf1 || bf2) {
    metrics.push({
      label: 'بهترین سطح فیب',
      values: {
        [sym1]: bf1 ? `${bf1.level}٪ (${fmtPct(bf1.winRate)})` : '—',
        [sym2]: bf2 ? `${bf2.level}٪ (${fmtPct(bf2.winRate)})` : '—',
      },
      winner: (bf1?.winRate ?? -1) > (bf2?.winRate ?? -1) ? sym1 : (bf2?.winRate ?? -1) > (bf1?.winRate ?? -1) ? sym2 : null,
    });
  }

  // ── بهترین رژیم بازار هر نماد ─────────────────────────────────────
  const bestReg = (p: SymbolBehaviorProfile) => {
    const valid = p.regimeStats.filter(r => r.total >= 3);
    return valid.length > 0 ? [...valid].sort((a, b) => b.winRate - a.winRate)[0] : null;
  };
  const br1 = bestReg(p1), br2 = bestReg(p2);
  if (br1 || br2) {
    metrics.push({
      label: 'بهترین رژیم',
      values: {
        [sym1]: br1 ? `${br1.label} (${fmtPct(br1.winRate)})` : '—',
        [sym2]: br2 ? `${br2.label} (${fmtPct(br2.winRate)})` : '—',
      },
      winner: (br1?.winRate ?? -1) > (br2?.winRate ?? -1) ? sym1 : (br2?.winRate ?? -1) > (br1?.winRate ?? -1) ? sym2 : null,
    });
  }

  // ── برترین الگوی هر نماد ─────────────────────────────────────────
  const topPat = (p: SymbolBehaviorProfile) => {
    const valid = p.patternStats.filter(x => x.count >= 3);
    return valid.length > 0 ? [...valid].sort((a, b) => b.winRate - a.winRate)[0] : null;
  };
  const tp1 = topPat(p1), tp2 = topPat(p2);
  if (tp1 || tp2) {
    metrics.push({
      label: 'برترین الگو',
      values: {
        [sym1]: tp1 ? `${tp1.tag} (${fmtPct(tp1.winRate)})` : '—',
        [sym2]: tp2 ? `${tp2.tag} (${fmtPct(tp2.winRate)})` : '—',
      },
      winner: (tp1?.winRate ?? -1) > (tp2?.winRate ?? -1) ? sym1 : (tp2?.winRate ?? -1) > (tp1?.winRate ?? -1) ? sym2 : null,
    });
  }

  // ── کیفیت اخیر در مقابل تاریخی ───────────────────────────────────
  if (p1.recent.total >= 3 && p2.recent.total >= 3) {
    metrics.push({
      label: 'روند اخیر (۳۰ روز)',
      values: { [sym1]: fmtPct(p1.recent.winRate), [sym2]: fmtPct(p2.recent.winRate) },
      winner: p1.recent.winRate > p2.recent.winRate ? sym1 : p2.recent.winRate > p1.recent.winRate ? sym2 : null,
    });
  }

  // ── Long vs Short برتری ───────────────────────────────────────────
  const bestDir = (p: SymbolBehaviorProfile) => {
    if (p.longStats.total < 3 || p.shortStats.total < 3) return null;
    return p.longStats.winRate >= p.shortStats.winRate ? 'Long' : 'Short';
  };
  const bd1 = bestDir(p1), bd2 = bestDir(p2);
  if (bd1 || bd2) {
    metrics.push({
      label: 'جهت برتر',
      values: { [sym1]: bd1 ?? '—', [sym2]: bd2 ?? '—' },
      winner: null, // جهت: مقایسه عددی ندارد
    });
  }

  // ── یافته‌ها ───────────────────────────────────────────────────────
  const sameSymbolFindings: string[] = [];
  if (p1.winRate > p2.winRate + 10) {
    sameSymbolFindings.push(`${sym1} نرخ برد بالاتری نسبت به ${sym2} دارد (${fmtPct(p1.winRate)} در مقابل ${fmtPct(p2.winRate)}).`);
  } else if (p2.winRate > p1.winRate + 10) {
    sameSymbolFindings.push(`${sym2} نرخ برد بالاتری نسبت به ${sym1} دارد (${fmtPct(p2.winRate)} در مقابل ${fmtPct(p1.winRate)}).`);
  }
  if (p1.avgR != null && p2.avgR != null) {
    const better = p1.avgR > p2.avgR ? sym1 : sym2;
    const worse = better === sym1 ? sym2 : sym1;
    const betterR = better === sym1 ? p1.avgR : p2.avgR;
    const worseR = better === sym1 ? p2.avgR : p1.avgR;
    sameSymbolFindings.push(`میانگین R روی ${better} (${betterR!.toFixed(2)}R) بهتر از ${worse} (${worseR!.toFixed(2)}R) بوده است.`);
  }

  // تغییر رفتار اخیر
  if (p1.recent.total >= 3 && p1.historical.total >= 3) {
    const diff1 = p1.recent.winRate - p1.historical.winRate;
    if (Math.abs(diff1) >= 15) {
      sameSymbolFindings.push(`${sym1} اخیراً ${diff1 > 0 ? 'بهتر' : 'ضعیف‌تر'} از میانگین تاریخی خود معامله می‌کند (${fmtPct(p1.recent.winRate)} در مقابل ${fmtPct(p1.historical.winRate)}).`);
    }
  }
  if (p2.recent.total >= 3 && p2.historical.total >= 3) {
    const diff2 = p2.recent.winRate - p2.historical.winRate;
    if (Math.abs(diff2) >= 15) {
      sameSymbolFindings.push(`${sym2} اخیراً ${diff2 > 0 ? 'بهتر' : 'ضعیف‌تر'} از میانگین تاریخی خود معامله می‌کند (${fmtPct(p2.recent.winRate)} در مقابل ${fmtPct(p2.historical.winRate)}).`);
    }
  }

  const crossSymbolFindings: string[] = [];
  if (bs1 && bs2) {
    if (bs1.session !== bs2.session) {
      crossSymbolFindings.push(`بهترین جلسه برای ${sym1}: ${bs1.label}. بهترین جلسه برای ${sym2}: ${bs2.label}.`);
    } else {
      crossSymbolFindings.push(`هر دو نماد در جلسه ${bs1.label} بهترین عملکرد را دارند.`);
    }
  }
  if (br1 && br2 && br1.regime !== br2.regime) {
    crossSymbolFindings.push(`${sym1} در رژیم «${br1.label}» (${fmtPct(br1.winRate)}) و ${sym2} در رژیم «${br2.label}» (${fmtPct(br2.winRate)}) بهتر عمل می‌کنند.`);
  }
  if (tp1 && tp2 && tp1.tag !== tp2.tag) {
    crossSymbolFindings.push(`برترین الگو برای ${sym1}: «${tp1.tag}» (${fmtPct(tp1.winRate)}). برای ${sym2}: «${tp2.tag}» (${fmtPct(tp2.winRate)}).`);
  }
  if (bf1 && bf2 && bf1.level !== bf2.level) {
    crossSymbolFindings.push(`${sym1} بیشتر از سطح فیب ${bf1.level}٪ بهره می‌برد؛ ${sym2} از سطح ${bf2.level}٪.`);
  }

  return { symbols: [sym1, sym2], metrics, sameSymbolFindings, crossSymbolFindings };
}

// ================================================================
// Pre-Trade Symbol Insights
// ================================================================

export function getPreTradeInsight(
  symbol: string,
  currentTags: string[],
  allTrades: Trade[],
): PreTradeSymbolInsight {
  const symbolTrades = allTrades.filter(t => t.symbol === symbol && isClosed(t));
  const crossTrades = allTrades.filter(t => t.symbol !== symbol && isClosed(t));

  // فیلتر معاملات مشابه بر اساس تگ‌های مشترک
  const matchingSymbolTrades = currentTags.length > 0
    ? symbolTrades.filter(t => {
        const tTags = parseTags(t.tags);
        return currentTags.some(ct => tTags.includes(ct));
      })
    : symbolTrades;

  const matchingCrossTrades = currentTags.length > 0
    ? crossTrades.filter(t => {
        const tTags = parseTags(t.tags);
        return currentTags.some(ct => tTags.includes(ct));
      })
    : [];

  const warnings: string[] = [];
  if (symbolTrades.length < 5) {
    warnings.push(`فقط ${symbolTrades.length} معامله بسته روی ${symbol} ثبت شده — داده محدود است.`);
  }
  if (symbolTrades.length === 0) {
    warnings.push(`هیچ سابقه معاملاتی برای ${symbol} وجود ندارد.`);
  }

  // الگوهای مرتبط
  const tagGroups: Map<string, Trade[]> = new Map();
  matchingSymbolTrades.forEach(t => {
    parseTags(t.tags).forEach(tag => {
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag)!.push(t);
    });
  });
  const relevantPatterns: PatternStat[] = [];
  for (const [tag, ts] of tagGroups) {
    const cl2 = ts.filter(isClosed);
    relevantPatterns.push({
      tag,
      count: ts.length,
      wins: cl2.filter(isWin).length,
      losses: cl2.filter(isLoss).length,
      winRate: calcWinRate(ts),
      avgR: calcAvgR(ts),
      confidence: confidence(ts.length),
    });
  }
  relevantPatterns.sort((a, b) => b.count - a.count);

  return {
    symbol,
    sameSymbolCount: matchingSymbolTrades.length,
    sameSymbolWinRate: matchingSymbolTrades.length > 0 ? calcWinRate(matchingSymbolTrades) : null,
    sameSymbolAvgR: matchingSymbolTrades.length > 0 ? calcAvgR(matchingSymbolTrades) : null,
    sameSymbolTrades: matchingSymbolTrades.slice(0, 10),
    crossSymbolCount: matchingCrossTrades.length,
    crossSymbolTrades: matchingCrossTrades.slice(0, 5),
    relevantPatterns: relevantPatterns.slice(0, 8),
    warnings,
    confidence: confidence(matchingSymbolTrades.length),
  };
}

// ================================================================
// Symbol Insights Generator
// ================================================================

function generateSymbolInsights(data: {
  symbol: string;
  totalTrades: number;
  winRate: number;
  avgR: number | null;
  sessionStats: SessionStat[];
  patternStats: PatternStat[];
  fibStats: FibStat[];
  regimeStats: RegimeStat[];
  longStats: { total: number; wins: number; winRate: number };
  shortStats: { total: number; wins: number; winRate: number };
  recent: TemporalStat;
  historical: TemporalStat;
  dataConfidence: ConfidenceLevel;
}): InsightCard[] {
  const { symbol, totalTrades, winRate, avgR, sessionStats, patternStats,
    fibStats, regimeStats, longStats, shortStats, recent, historical, dataConfidence } = data;
  const cards: InsightCard[] = [];

  if (totalTrades < 3) {
    cards.push({
      type: 'neutral',
      text: `برای ${symbol}: داده‌ها محدود هستند. با ثبت معاملات بیشتر، تحلیل دقیق‌تر می‌شود.`,
    });
    return cards;
  }

  // عملکرد کلی
  if (avgR != null && avgR > 1.5 && totalTrades >= 5) {
    cards.push({ type: 'positive', text: `میانگین R روی ${symbol}: ${avgR.toFixed(2)}R (بر اساس ${totalTrades} معامله).` });
  }
  if (avgR != null && avgR < 0 && totalTrades >= 5) {
    cards.push({ type: 'negative', text: `میانگین R روی ${symbol} منفی است (${avgR.toFixed(2)}R) — نیاز به بررسی جدی.` });
  }

  // بهترین/بدترین جلسه
  const validSessions = sessionStats.filter(s => s.total >= 3);
  if (validSessions.length >= 2) {
    const best = [...validSessions].sort((a, b) => b.winRate - a.winRate)[0];
    const worst = [...validSessions].sort((a, b) => a.winRate - b.winRate)[0];
    if (best.session !== worst.session && best.winRate - worst.winRate >= 15) {
      cards.push({
        type: 'neutral',
        text: `روی ${symbol}، بهترین عملکرد در جلسه ${best.label} (${best.winRate.toFixed(0)}٪ برد) و ضعیف‌ترین در ${worst.label} (${worst.winRate.toFixed(0)}٪ برد) بوده است.`,
      });
    }
  }

  // Long vs Short
  if (longStats.total >= 3 && shortStats.total >= 3) {
    const betterDir = longStats.winRate > shortStats.winRate ? 'Long' : 'Short';
    const betterWR = Math.max(longStats.winRate, shortStats.winRate);
    const worseWR = Math.min(longStats.winRate, shortStats.winRate);
    if (betterWR - worseWR >= 15) {
      cards.push({ type: 'neutral', text: `روی ${symbol}، معاملات ${betterDir} نرخ برد بهتری داشته‌اند (${betterWR.toFixed(0)}٪ در مقابل ${worseWR.toFixed(0)}٪).` });
    }
  }

  // رژیم بازار
  const validRegimes = regimeStats.filter(r => r.total >= 3);
  if (validRegimes.length >= 2) {
    const bestRegime = [...validRegimes].sort((a, b) => b.winRate - a.winRate)[0];
    cards.push({ type: 'positive', text: `روی ${symbol}، رژیم «${bestRegime.label}» بهترین نتیجه را داشته (${bestRegime.winRate.toFixed(0)}٪ برد در ${bestRegime.total} نمونه).` });
  }

  // بهترین الگو
  const topPattern = patternStats.filter(p => p.count >= 3).sort((a, b) => b.winRate - a.winRate)[0];
  if (topPattern && topPattern.winRate >= 60) {
    cards.push({ type: 'positive', text: `تگ «${topPattern.tag}» روی ${symbol}: ${topPattern.count} نمونه با نرخ برد ${topPattern.winRate.toFixed(0)}٪.` });
  }

  // فیبوناچی
  const bestFib = fibStats.filter(f => f.count >= 2).sort((a, b) => b.winRate - a.winRate)[0];
  if (bestFib) {
    cards.push({ type: 'neutral', text: `روی ${symbol}، سطح فیبوناچی ${bestFib.level}٪ در ${bestFib.count} نمونه با نرخ برد ${bestFib.winRate.toFixed(0)}٪ مشاهده شده.` });
  }

  // تغییر رفتار اخیر
  if (recent.total >= 3 && historical.total >= 3 && dataConfidence !== 'low') {
    const diff = recent.winRate - historical.winRate;
    if (Math.abs(diff) >= 15) {
      cards.push({
        type: diff > 0 ? 'positive' : 'negative',
        text: `رفتار اخیر ${symbol} ${diff > 0 ? 'بهتر' : 'بدتر'} از تاریخی است (${recent.winRate.toFixed(0)}٪ در مقابل ${historical.winRate.toFixed(0)}٪ نرخ برد).`,
      });
    }
  }

  if (cards.length === 0) {
    cards.push({ type: 'neutral', text: `داده‌های ${symbol} در حال جمع‌آوری است. ادامه ثبت معاملات توصیه می‌شود.` });
  }

  return cards;
}

// ================================================================
// Exports
// ================================================================

export const SESSION_LABELS_MAP = SESSION_LABELS;
export const REGIME_MAP_EXPORT = REGIME_MAP;
