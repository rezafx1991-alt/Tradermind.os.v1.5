/**
 * dataQualityService.ts  —  Prompt 23
 * Calculates completeness and quality metrics for the local trade database.
 * Used by the Data Quality Dashboard.
 */

import { db, Trade } from '../db/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TradeQualityScore {
  tradeId: string;
  symbol: string;
  openedAt: number;
  score: number;           // 0-100
  missingFields: MissingField[];
  completedFields: string[];
}

export interface MissingField {
  key: keyof Trade;
  label: string;
  importance: 'high' | 'medium' | 'low';
}

export interface DataQualityMetrics {
  totalTrades: number;
  avgCompleteness: number;           // 0-100
  distribution: QualityBucket[];
  fieldCoverage: FieldCoverageItem[];
  tradesNeedingAttention: TradeQualityScore[];
  tradesFullyComplete: number;
  tradesWithScreenshots: number;
  tradesWithEntryReason: number;
  tradesWithStopLoss: number;
  tradesWithRiskData: number;
  tradesWithPostTradeReview: number;
  tradesWithLesson: number;
  tradesWithMTFAnalysis: number;
}

export interface QualityBucket {
  label: string;
  range: [number, number];
  count: number;
  color: string;
}

export interface FieldCoverageItem {
  key: string;
  label: string;
  count: number;
  total: number;
  pct: number;
  importance: 'high' | 'medium' | 'low';
}

// ─── Field definitions ────────────────────────────────────────────────────────

interface FieldDef {
  key: keyof Trade;
  label: string;
  importance: 'high' | 'medium' | 'low';
  weight: number;  // در محاسبه score چقدر وزن دارد
  check: (t: Trade) => boolean;
}

const FIELD_DEFS: FieldDef[] = [
  // High importance (core trade data)
  { key: 'symbol',       label: 'نماد',            importance: 'high',   weight: 10, check: t => !!t.symbol },
  { key: 'direction',    label: 'جهت معامله',       importance: 'high',   weight: 10, check: t => !!t.direction },
  { key: 'entryPrice',   label: 'قیمت ورود',        importance: 'high',   weight: 10, check: t => t.entryPrice > 0 },
  { key: 'stopLoss',     label: 'حد ضرر',           importance: 'high',   weight:  8, check: t => t.stopLoss > 0 },
  { key: 'result',       label: 'نتیجه',            importance: 'high',   weight:  8, check: t => !!t.result && t.result !== 'open' },
  { key: 'riskPercentage', label: 'درصد ریسک',      importance: 'high',   weight:  7, check: t => t.riskPercentage != null && t.riskPercentage > 0 },

  // Medium importance (analysis quality)
  { key: 'entryReason',  label: 'دلیل ورود',        importance: 'medium', weight:  8, check: t => !!(t as any).entryReason?.trim() },
  { key: 'screenshots',  label: 'اسکرین‌شات',       importance: 'medium', weight:  8, check: t => { try { return JSON.parse(t.screenshots).length > 0; } catch { return false; } } },
  { key: 'lesson',       label: 'درس‌آموخته',       importance: 'medium', weight:  6, check: t => !!(t as any).lesson?.trim() },
  { key: 'postTradeReview', label: 'مرور پس از معامله', importance: 'medium', weight: 7, check: t => {
    try {
      const ptr = JSON.parse(t.postTradeReview || '{}');
      return !!(ptr.whatDidISee || ptr.whyEntered || ptr.executionAssessment);
    } catch { return false; }
  }},
  { key: 'mtfAnalysis',  label: 'تحلیل چند TF',    importance: 'medium', weight:  6, check: t => {
    try {
      const mtf = JSON.parse(t.mtfAnalysis || 'null') as Record<string, { bias?: string; context?: string }> | null;
      return mtf !== null && Object.values(mtf).some(v => v?.bias?.trim() || v?.context?.trim());
    } catch { return false; }
  }},
  { key: 'strategyId',   label: 'استراتژی',         importance: 'medium', weight:  4, check: t => !!t.strategyId },

  // Low importance (optional enrichment)
  { key: 'takeProfit',   label: 'حد سود',           importance: 'low',    weight:  3, check: t => t.takeProfit != null },
  { key: 'profitLoss',   label: 'سود/زیان',         importance: 'low',    weight:  2, check: t => t.profitLoss != null },
  { key: 'rMultiple',    label: 'R Multiple',        importance: 'low',    weight:  2, check: t => t.rMultiple != null },
  { key: 'emotions',     label: 'احساسات',          importance: 'low',    weight:  1, check: t => { try { return JSON.parse(t.emotions).length > 0; } catch { return false; } } },
];

const TOTAL_WEIGHT = FIELD_DEFS.reduce((acc, f) => acc + f.weight, 0);

// ─── Per-trade score ──────────────────────────────────────────────────────────

export function scoreOneTrade(trade: Trade): TradeQualityScore {
  const missingFields: MissingField[] = [];
  const completedFields: string[] = [];
  let earnedWeight = 0;

  for (const def of FIELD_DEFS) {
    if (def.check(trade)) {
      earnedWeight += def.weight;
      completedFields.push(def.label);
    } else {
      missingFields.push({ key: def.key, label: def.label, importance: def.importance });
    }
  }

  return {
    tradeId: trade.id,
    symbol: trade.symbol,
    openedAt: trade.openedAt,
    score: Math.round((earnedWeight / TOTAL_WEIGHT) * 100),
    missingFields,
    completedFields,
  };
}

// ─── Aggregate metrics ────────────────────────────────────────────────────────

export async function computeDataQuality(): Promise<DataQualityMetrics> {
  const trades = await db.trades.toArray();
  const total = trades.length;

  if (total === 0) {
    return {
      totalTrades: 0, avgCompleteness: 0,
      distribution: makeEmptyBuckets(),
      fieldCoverage: [],
      tradesNeedingAttention: [],
      tradesFullyComplete: 0,
      tradesWithScreenshots: 0, tradesWithEntryReason: 0,
      tradesWithStopLoss: 0, tradesWithRiskData: 0,
      tradesWithPostTradeReview: 0, tradesWithLesson: 0,
      tradesWithMTFAnalysis: 0,
    };
  }

  const scores = trades.map(scoreOneTrade);
  const avgCompleteness = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);

  // Buckets
  const buckets = makeEmptyBuckets();
  for (const s of scores) {
    for (const b of buckets) {
      if (s.score >= b.range[0] && s.score <= b.range[1]) { b.count++; break; }
    }
  }

  // Field coverage
  const fieldCoverage: FieldCoverageItem[] = FIELD_DEFS.map(def => {
    const count = trades.filter(def.check).length;
    return {
      key: def.key as string,
      label: def.label,
      count,
      total,
      pct: Math.round((count / total) * 100),
      importance: def.importance,
    };
  }).sort((a, b) => b.pct - a.pct);

  // Trades needing attention (lowest 10 scores)
  const tradesNeedingAttention = [...scores]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .filter(s => s.score < 80);

  return {
    totalTrades: total,
    avgCompleteness,
    distribution: buckets,
    fieldCoverage,
    tradesNeedingAttention,
    tradesFullyComplete: scores.filter(s => s.score >= 90).length,
    tradesWithScreenshots: trades.filter(t => { try { return JSON.parse(t.screenshots).length > 0; } catch { return false; } }).length,
    tradesWithEntryReason: trades.filter(t => !!(t as any).entryReason?.trim()).length,
    tradesWithStopLoss: trades.filter(t => t.stopLoss > 0).length,
    tradesWithRiskData: trades.filter(t => t.riskPercentage != null || t.riskAmount != null).length,
    tradesWithPostTradeReview: trades.filter(t => {
      try { const p = JSON.parse(t.postTradeReview || '{}'); return !!(p.whatDidISee || p.whyEntered || p.executionAssessment); } catch { return false; }
    }).length,
    tradesWithLesson: trades.filter(t => !!(t as any).lesson?.trim()).length,
    tradesWithMTFAnalysis: trades.filter(t => {
      try {
        const mtf = JSON.parse((t as any).mtfAnalysis || 'null');
        return mtf && Object.values(mtf).some((v: any) => v?.bias?.trim() || v?.context?.trim());
      } catch { return false; }
    }).length,
  };
}

function makeEmptyBuckets(): QualityBucket[] {
  return [
    { label: 'ناقص (۰–۴۰٪)',      range: [0, 40],   count: 0, color: '#ef4444' },
    { label: 'پایه (۴۱–۶۰٪)',     range: [41, 60],  count: 0, color: '#f97316' },
    { label: 'متوسط (۶۱–۸۰٪)',    range: [61, 80],  count: 0, color: '#eab308' },
    { label: 'خوب (۸۱–۹۰٪)',     range: [81, 90],  count: 0, color: '#22c55e' },
    { label: 'کامل (۹۱–۱۰۰٪)',   range: [91, 100], count: 0, color: '#6366f1' },
  ];
}

// ─── Missing fields for one trade ─────────────────────────────────────────────

export function getMissingFieldsForTrade(trade: Trade): MissingField[] {
  return scoreOneTrade(trade).missingFields;
}
