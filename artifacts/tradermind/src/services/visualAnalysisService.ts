/**
 * Visual Analysis Service — Prompt 15
 * ─────────────────────────────────────────────────────────────────
 * Abstraction layer for chart screenshot visual analysis.
 * Implements rule-based feature extraction from trade context data
 * and manages the visual similarity search system.
 *
 * Architecture: provider-agnostic — future AI vision APIs can be
 * plugged in by replacing the analyzeWithProvider() method without
 * changing any calling code.
 */

import { Trade } from '../db/database';
import {
  TradeScreenshot,
  VisualFeature,
  VisualSimilarityMatch,
  AnalysisComparison,
  ImageQualityReport,
  MTFRelationship,
  FEATURE_LABELS,
  ConfidenceLevel,
  VisualFeatureCategory,
  TIMEFRAME_ORDER,
} from '../types/screenshot';

// ── Helpers ──────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

function featureLabel(value: string): string {
  return FEATURE_LABELS[value] ?? value;
}

function conf(count: number): ConfidenceLevel {
  if (count >= 8) return 'high';
  if (count >= 4) return 'medium';
  return 'low';
}

// ── Image Quality Assessment ──────────────────────────────────────

export async function assessImageQuality(
  dataUrl: string,
  fileSize: number,
): Promise<ImageQualityReport> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const issues: string[] = [];
      let score = 100;

      // Resolution check
      if (width < 400 || height < 300) {
        issues.push('رزولوشن تصویر خیلی پایین است — جزئیات ممکن است قابل تشخیص نباشند');
        score -= 30;
      } else if (width < 800 || height < 600) {
        issues.push('رزولوشن متوسط — تحلیل ممکن است محدود باشد');
        score -= 10;
      }

      // Aspect ratio check (charts are usually wide)
      const ratio = width / height;
      if (ratio < 0.5 || ratio > 5) {
        issues.push('نسبت تصویر غیرمعمول است — ممکن است تصویر برش‌خورده یا ناقص باشد');
        score -= 15;
      }

      // File size check (too small = likely low quality)
      if (fileSize < 10_000) {
        issues.push('حجم فایل خیلی کم است — احتمالاً کیفیت تصویر پایین است');
        score -= 20;
      } else if (fileSize > 5_000_000) {
        issues.push('حجم فایل بسیار زیاد است — فشرده‌سازی توصیه می‌شود');
        score -= 5;
      }

      const finalScore = Math.max(0, Math.min(100, score));
      const confidence: ConfidenceLevel =
        finalScore >= 70 ? 'high' : finalScore >= 40 ? 'medium' : 'low';

      resolve({ score: finalScore, width, height, fileSize, issues, confidence });
    };
    img.onerror = () => {
      resolve({
        score: 0,
        width: 0,
        height: 0,
        fileSize,
        issues: ['تصویر قابل بارگذاری نیست'],
        confidence: 'low',
      });
    };
    img.src = dataUrl;
  });
}

// ── Rule-Based Feature Extraction ────────────────────────────────
// Extracts probable visual features from trade metadata (tags, notes,
// session step results, existing analysis text). This is used as the
// initial "AI suggestion" that the user can then confirm or reject.

export function extractFeaturesFromText(text: string): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];

  const rules: [string[], string][] = [
    [['ایمپالس صعودی', 'bullish impulse', 'صعودی قوی', 'حرکت صعودی'], 'bullish-impulse'],
    [['ایمپالس نزولی', 'bearish impulse', 'نزولی قوی', 'حرکت نزولی'], 'bearish-impulse'],
    [['جابجایی قوی', 'strong displacement', 'displacement'], 'strong-displacement'],
    [['تراکم', 'consolidation', 'فشردگی کوچک'], 'small-range-consolidation'],
    [['رنج بزرگ', 'large range', 'تراکم بزرگ'], 'large-range-consolidation'],
    [['روند صعودی', 'uptrend', 'trend up'], 'trend-up'],
    [['روند نزولی', 'downtrend', 'trend down'], 'trend-down'],
    [['رنج', 'range', 'محدوده'], 'range'],
    [['انبساط', 'expansion', 'گسترش'], 'expansion'],
    [['فشردگی', 'compression', 'squeeze'], 'compression'],
    [['بازگشت', 'reversal', 'ریورسال'], 'reversal'],
    [['شکست', 'breakout', 'بریک اوت'], 'breakout'],
    [['شکست کاذب', 'false breakout', 'fake breakout'], 'false-breakout'],
    [['hh', 'سقف بالاتر', 'higher high'], 'higher-highs'],
    [['hl', 'کف بالاتر', 'higher low'], 'higher-lows'],
    [['lh', 'سقف پایین‌تر', 'lower high'], 'lower-highs'],
    [['ll', 'کف پایین‌تر', 'lower low'], 'lower-lows'],
    [['bos', 'شکست ساختار', 'break of structure'], 'break-of-structure'],
    [['choch', 'تغییر کاراکتر', 'change of character'], 'change-of-character'],
    [['سوئینگ', 'swing'], 'swing-structure'],
    [['پولبک کم‌عمق', 'shallow', 'shallow retracement'], 'shallow-retracement'],
    [['پولبک متوسط', 'medium retracement'], 'medium-retracement'],
    [['پولبک عمیق', 'deep retracement', 'deep pullback'], 'deep-retracement'],
    [['بازگشت به مبدأ', 'return to origin', 'origin'], 'return-to-origin'],
    [['پولبک به ناحیه', 'retracement into zone'], 'retracement-into-zone'],
    [['تشکیل رنج', 'range formation'], 'range-formation'],
    [['انبساط رنج', 'range expansion'], 'range-expansion'],
    [['شکست رنج', 'range breakout'], 'range-breakout'],
    [['شکست ناموفق', 'failed breakout'], 'failed-breakout'],
    [['ورود مجدد', 'reentry', 're-entry'], 'reentry-into-range'],
    [['رد قیمت', 'rejection', 'ریجکشن'], 'rejection'],
    [['ادامه قوی', 'strong continuation'], 'strong-continuation'],
    [['ادامه کُند', 'slow continuation'], 'slow-continuation'],
    [['ادامه ناموفق', 'failed continuation'], 'failed-continuation'],
    [['واکنش بازگشتی', 'reversal reaction'], 'reversal-reaction'],
    [['23.6', 'fib 23', 'فیب ۲۳'], 'fib-23.6'],
    [['38.2', 'fib 38', 'فیب ۳۸'], 'fib-38.2'],
    [['50%', 'fib 50', 'فیب ۵۰'], 'fib-50'],
    [['61.8', 'fib 61', 'فیب ۶۱', 'golden'], 'fib-61.8'],
    [['78.6', 'fib 78', 'فیب ۷۸'], 'fib-78.6'],
    [['fib 100', 'فیب ۱۰۰'], 'fib-100'],
  ];

  for (const [patterns, feature] of rules) {
    if (patterns.some(p => t.includes(p))) {
      found.push(feature);
    }
  }

  return [...new Set(found)];
}

function categoryOf(value: string): VisualFeatureCategory {
  if (['bullish-impulse', 'bearish-impulse', 'strong-displacement', 'small-range-consolidation',
       'large-range-consolidation', 'trend-up', 'trend-down', 'range', 'expansion',
       'compression', 'reversal', 'breakout', 'false-breakout'].includes(value)) return 'price-action';
  if (['higher-highs', 'higher-lows', 'lower-highs', 'lower-lows', 'break-of-structure',
       'change-of-character', 'swing-structure'].includes(value)) return 'structure';
  if (['shallow-retracement', 'medium-retracement', 'deep-retracement', 'return-to-origin',
       'retracement-into-zone'].includes(value)) return 'retracement';
  if (['range-formation', 'range-expansion', 'range-breakout', 'failed-breakout',
       'reentry-into-range'].includes(value)) return 'range';
  if (['rejection', 'strong-continuation', 'slow-continuation', 'failed-continuation',
       'reversal-reaction'].includes(value)) return 'reaction';
  return 'fibonacci';
}

// ── Main: Extract features from trade + screenshot label ──────────

export function extractInitialFeatures(
  trade: Trade,
  screenshotLabel: string,
  analysisText?: string,
): VisualFeature[] {
  const textSources: string[] = [
    screenshotLabel,
    trade.notes ?? '',
    trade.tags ? (() => { try { return (JSON.parse(trade.tags) as string[]).join(' '); } catch { return ''; } })() : '',
    analysisText ?? '',
  ];

  const combined = textSources.join(' ');
  const foundValues = extractFeaturesFromText(combined);

  // Also infer from direction
  const extras: string[] = [];
  if (trade.direction === 'long') {
    if (!foundValues.includes('bullish-impulse') && combined.includes('ورود')) extras.push('bullish-impulse');
  } else {
    if (!foundValues.includes('bearish-impulse') && combined.includes('ورود')) extras.push('bearish-impulse');
  }

  return [...foundValues, ...extras].slice(0, 12).map(value => ({
    id: uid(),
    category: categoryOf(value),
    label: featureLabel(value),
    value,
    confidence: 'low' as ConfidenceLevel, // starts low until user confirms
    notes: null,
    source: 'ai' as const,
    confirmed: null,
    correctedValue: null,
    correctionNote: null,
  }));
}

// ── Visual Similarity Search ──────────────────────────────────────
// Feature-based similarity: compare confirmed/user-added features
// across all historical screenshots to find similar setups.

export function computeFeatureSimilarity(
  featuresA: VisualFeature[],
  featuresB: VisualFeature[],
): number {
  if (featuresA.length === 0 || featuresB.length === 0) return 0;

  const setA = new Set([
    ...featuresA.filter(f => f.confirmed !== false).map(f => f.correctedValue ?? f.value),
    ...featuresA.filter(f => f.source === 'user').map(f => f.value),
  ]);
  const setB = new Set([
    ...featuresB.filter(f => f.confirmed !== false).map(f => f.correctedValue ?? f.value),
    ...featuresB.filter(f => f.source === 'user').map(f => f.value),
  ]);

  const intersection = [...setA].filter(v => setB.has(v));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;

  // Jaccard similarity
  return Math.round((intersection.length / union.size) * 100);
}

export function findSimilarScreenshots(
  targetScreenshot: TradeScreenshot,
  allTrades: Trade[],
  options: {
    sameSymbol?: boolean;
    sameTimeframe?: boolean;
    sameDirection?: boolean;
    targetTrade?: Trade;
    minScore?: number;
    limit?: number;
  } = {},
): VisualSimilarityMatch[] {
  const {
    sameSymbol = false,
    sameTimeframe = false,
    sameDirection = false,
    targetTrade,
    minScore = 20,
    limit = 6,
  } = options;

  const targetFeatures = [
    ...(targetScreenshot.extractedFeatures ?? []),
    ...(targetScreenshot.userAddedFeatures ?? []),
  ];

  const matches: VisualSimilarityMatch[] = [];

  for (const trade of allTrades) {
    if (targetTrade && trade.id === targetTrade.id) continue;
    if (sameSymbol && targetTrade && trade.symbol !== targetTrade.symbol) continue;
    if (sameDirection && targetTrade && trade.direction !== targetTrade.direction) continue;

    let screenshots: TradeScreenshot[] = [];
    try {
      screenshots = JSON.parse(trade.screenshots) as TradeScreenshot[];
    } catch { continue; }

    for (const ss of screenshots) {
      if (!ss.id) continue;
      if (sameTimeframe && ss.timeframe !== targetScreenshot.timeframe) continue;

      const candidateFeatures = [
        ...(ss.extractedFeatures ?? []),
        ...(ss.userAddedFeatures ?? []),
      ];

      const score = computeFeatureSimilarity(targetFeatures, candidateFeatures);
      if (score < minScore) continue;

      const matchedValues = [
        ...targetFeatures.filter(f => f.confirmed !== false).map(f => f.correctedValue ?? f.value),
      ].filter(v =>
        candidateFeatures.some(f => (f.correctedValue ?? f.value) === v && f.confirmed !== false)
      );

      matches.push({
        tradeId: trade.id,
        screenshotId: ss.id,
        symbol: trade.symbol,
        timeframe: ss.timeframe ?? null,
        direction: trade.direction,
        tradeResult: trade.result,
        matchScore: score,
        matchedFeatures: matchedValues.map(v => featureLabel(v)),
        label: ss.label ?? 'اسکرین‌شات',
        dataUrl: ss.dataUrl,
        imageBlob: null,
        createdAt: ss.createdAt ?? 0,
      });
    }
  }

  return matches
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

// ── User Text vs Visual Analysis Comparison ───────────────────────

export function compareUserTextWithVisualFeatures(
  userText: string,
  features: VisualFeature[],
): AnalysisComparison {
  const textFeatures = extractFeaturesFromText(userText);
  const confirmedFeatureValues = features
    .filter(f => f.confirmed !== false)
    .map(f => f.correctedValue ?? f.value);

  const agreements: string[] = [];
  const differences: string[] = [];

  // Features user mentioned AND visually detected → agreement
  for (const tf of textFeatures) {
    if (confirmedFeatureValues.includes(tf)) {
      agreements.push(`هر دو منبع: ${featureLabel(tf)}`);
    } else {
      differences.push(`کاربر نوشت "${featureLabel(tf)}" — در ویژگی‌های بصری تأیید نشده`);
    }
  }

  // Visual features that user didn't mention in text
  for (const vf of confirmedFeatureValues) {
    if (!textFeatures.includes(vf)) {
      differences.push(`ویژگی بصری "${featureLabel(vf)}" در متن تحلیل کاربر ذکر نشده`);
    }
  }

  return {
    userText,
    extractedFeatures: features,
    agreements,
    differences,
  };
}

// ── MTF Relationship Analysis ─────────────────────────────────────

export function analyzeMTFRelationship(screenshots: TradeScreenshot[]): MTFRelationship {
  const sorted = [...screenshots].sort((a, b) => {
    const ia = TIMEFRAME_ORDER.indexOf(a.timeframe);
    const ib = TIMEFRAME_ORDER.indexOf(b.timeframe);
    return ia - ib;
  });

  function signalFrom(ss: TradeScreenshot | undefined): string | null {
    if (!ss) return null;
    const features = [
      ...(ss.extractedFeatures ?? []).filter(f => f.confirmed !== false),
      ...(ss.userAddedFeatures ?? []),
    ];
    if (features.length === 0) return null;
    const top = features.slice(0, 2).map(f => featureLabel(f.correctedValue ?? f.value));
    const tf = ss.timeframe ? `(${ss.timeframe})` : '';
    return `${top.join('، ')} ${tf}`;
  }

  // Try to match each TF slot
  const tf4h = sorted.find(s => s.timeframe === '4h' || s.timeframe === 'D');
  const tf15m = sorted.find(s => s.timeframe === '15m' || s.timeframe === '1h');
  const tf5m = sorted.find(s => s.timeframe === '5m');
  const tf1m = sorted.find(s => s.timeframe === '1m');

  const higherSignal = signalFrom(tf4h);
  const interSignal = signalFrom(tf15m);
  const entrySignal = signalFrom(tf5m);
  const execSignal = signalFrom(tf1m);

  // Check alignment: bullish on high TF + bullish on low TF = aligned
  const bullishFeats = new Set(['bullish-impulse', 'trend-up', 'higher-highs', 'higher-lows', 'breakout']);
  const bearishFeats = new Set(['bearish-impulse', 'trend-down', 'lower-highs', 'lower-lows']);

  let bullishCount = 0;
  let bearishCount = 0;

  for (const ss of sorted) {
    const feats = [
      ...(ss.extractedFeatures ?? []).filter(f => f.confirmed !== false),
      ...(ss.userAddedFeatures ?? []),
    ].map(f => f.correctedValue ?? f.value);

    for (const f of feats) {
      if (bullishFeats.has(f)) bullishCount++;
      if (bearishFeats.has(f)) bearishCount++;
    }
  }

  let alignment: MTFRelationship['alignment'] = null;
  if (bullishCount > 0 || bearishCount > 0) {
    const total = bullishCount + bearishCount;
    const dominant = Math.max(bullishCount, bearishCount) / total;
    if (dominant >= 0.75) alignment = 'aligned';
    else if (dominant >= 0.5) alignment = 'partial';
    else alignment = 'conflicting';
  }

  return {
    higherTFSignal: higherSignal,
    intermediateTFSignal: interSignal,
    entryTFSignal: entrySignal,
    executionTFSignal: execSignal,
    alignment,
    notes: alignment === 'conflicting'
      ? 'سیگنال‌های تایم‌فریم‌های مختلف با یکدیگر در تضاد هستند — احتیاط توصیه می‌شود'
      : alignment === 'partial'
      ? 'همراستایی نسبی بین تایم‌فریم‌ها — تأییدیه بیشتر توصیه می‌شود'
      : alignment === 'aligned'
      ? 'سیگنال‌های تایم‌فریم‌ها همراستا هستند'
      : null,
  };
}

// ── Generate Analysis Notes ───────────────────────────────────────
// Creates a human-readable Persian summary of extracted features.

export function generateAnalysisNotes(
  screenshot: TradeScreenshot,
  trade: Trade,
): string {
  const features = [
    ...(screenshot.extractedFeatures ?? []).filter(f => f.confirmed !== false),
    ...(screenshot.userAddedFeatures ?? []),
  ];

  if (features.length === 0) {
    return 'ویژگی بصری شناسایی‌شده‌ای برای این اسکرین‌شات ثبت نشده است.';
  }

  const tf = screenshot.timeframe ? ` در تایم‌فریم ${screenshot.timeframe}` : '';
  const dir = trade.direction === 'long' ? 'صعودی' : 'نزولی';
  const featureNames = features.slice(0, 5).map(f => featureLabel(f.correctedValue ?? f.value));

  const confidence = screenshot.quality?.confidence ?? 'medium';
  const confNote =
    confidence === 'low'
      ? ' (کیفیت تصویر پایین — اطمینان تحلیل محدود است)'
      : confidence === 'medium'
      ? ' (کیفیت تصویر متوسط)'
      : '';

  return `نمودار ${trade.symbol}${tf}: ${featureNames.join('، ')} شناسایی شد. جهت معامله: ${dir}.${confNote}`;
}

// ── Before/During/After Comparison (Post-Trade Learning) ──────────

export type { MTFRelationship } from '../types/screenshot';

export interface LifecycleComparison {
  before: TradeScreenshot[];
  during: TradeScreenshot[];
  after: TradeScreenshot[];
  observations: string[];
}

export function compareLifecycleScreenshots(
  screenshots: TradeScreenshot[],
  trade: Trade,
): LifecycleComparison {
  const before = screenshots.filter(s => s.lifecyclePosition === 'before-entry');
  const during = screenshots.filter(s => s.lifecyclePosition === 'during-trade');
  const after = screenshots.filter(s => s.lifecyclePosition === 'after-trade');

  const observations: string[] = [];

  // Compare features before vs after
  const beforeFeatures = new Set(
    before.flatMap(s => [
      ...(s.extractedFeatures ?? []).filter(f => f.confirmed !== false).map(f => f.correctedValue ?? f.value),
      ...(s.userAddedFeatures ?? []).map(f => f.value),
    ])
  );

  const afterFeatures = new Set(
    after.flatMap(s => [
      ...(s.extractedFeatures ?? []).filter(f => f.confirmed !== false).map(f => f.correctedValue ?? f.value),
      ...(s.userAddedFeatures ?? []).map(f => f.value),
    ])
  );

  // Features that appeared after entry (new developments)
  const newFeatures = [...afterFeatures].filter(f => !beforeFeatures.has(f));
  if (newFeatures.length > 0) {
    observations.push(
      `ویژگی‌های جدید پس از ورود: ${newFeatures.map(v => featureLabel(v)).join('، ')}`
    );
  }

  // Check if continuation or reversal
  const afterHasContinuation = afterFeatures.has('strong-continuation') || afterFeatures.has('slow-continuation');
  const afterHasReversal = afterFeatures.has('reversal') || afterFeatures.has('reversal-reaction');

  if (trade.result === 'win' && afterHasContinuation) {
    observations.push('نتیجه: برد — بازار ادامه حرکت موردانتظار را داشت');
  } else if (trade.result === 'loss' && afterHasReversal) {
    observations.push('نتیجه: ضرر — بازار برخلاف انتظار بازگشت کرد');
  } else if (trade.result === 'loss' && afterHasContinuation) {
    observations.push('ضرر علی‌رغم ادامه حرکت — بررسی SL و زمان‌بندی ورود توصیه می‌شود');
  }

  if (during.length === 0) {
    observations.push('اسکرین‌شات حین معامله ثبت نشده — افزودن آن به یادگیری کمک می‌کند');
  }

  return { before, during, after, observations };
}

// ── Unused stub for future AI provider integration ────────────────
// Replace this function to connect to an external multimodal AI API.

export interface VisualAIProvider {
  name: string;
  analyze: (imageDataUrl: string, prompt: string) => Promise<string>;
}

let _aiProvider: VisualAIProvider | null = null;

export function registerVisualAIProvider(provider: VisualAIProvider): void {
  _aiProvider = provider;
}

export function getVisualAIProvider(): VisualAIProvider | null {
  return _aiProvider;
}

/** 
 * Analyze a screenshot with the registered AI provider.
 * Returns null if no provider is registered (offline mode).
 */
export async function analyzeWithProvider(
  dataUrl: string,
  context: string,
): Promise<string | null> {
  if (!_aiProvider) return null;
  try {
    return await _aiProvider.analyze(dataUrl, context);
  } catch {
    return null;
  }
}

// ── Confidence label in Persian ───────────────────────────────────

export function confidenceLabel(level: ConfidenceLevel): string {
  return { low: 'کم', medium: 'متوسط', high: 'بالا' }[level];
}

export function confidenceColor(level: ConfidenceLevel): string {
  return { low: 'text-orange-400', medium: 'text-amber-400', high: 'text-green-400' }[level];
}
