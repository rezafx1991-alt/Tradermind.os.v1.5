/**
 * liveTradeService — Prompt 16
 * ──────────────────────────────────────────────────────────────────
 * Business logic for the Live Trade Monitoring & Plan-to-Reality system.
 * All operations are pure functions that return updated LiveMonitoringData;
 * persistence is handled by saveLiveMonitoring().
 */

import { db, Trade } from '../db/database';
import { isWin, isLoss } from '../lib/tradeHelpers';
import {
  LiveMonitoringData, LiveTradeState, TradeEvent, TradeEventType,
  TradePlan, TradeScenario, RProgressionPoint, PlanDeviation,
  LiveInsight, BehaviorObservation, HistoricalComparison,
  defaultLiveMonitoring,
} from '../types/liveTrade';

function uid(): string { return crypto.randomUUID(); }

// ── Parse / Save ──────────────────────────────────────────────────

export function parseLiveMonitoring(trade: Trade): LiveMonitoringData {
  try {
    if (trade.liveMonitoring) {
      const parsed = JSON.parse(trade.liveMonitoring);
      return { ...defaultLiveMonitoring(), ...parsed };
    }
  } catch { /* fallback */ }
  return defaultLiveMonitoring();
}

export async function saveLiveMonitoring(
  tradeId: string,
  monitoring: LiveMonitoringData,
): Promise<void> {
  await db.trades.update(tradeId, {
    liveMonitoring: JSON.stringify({ ...monitoring, lastUpdatedAt: Date.now() }),
  });
}

// ── R-Multiple Computation ────────────────────────────────────────

export function computeCurrentR(trade: Trade, currentPrice: number): number | null {
  const risk = Math.abs(trade.entryPrice - trade.stopLoss);
  if (risk === 0) return null;
  return trade.direction === 'long'
    ? (currentPrice - trade.entryPrice) / risk
    : (trade.entryPrice - currentPrice) / risk;
}

// ── State Auto-Detection ──────────────────────────────────────────

export function detectStateFromR(r: number, trade: Trade): LiveTradeState {
  const risk = Math.abs(trade.entryPrice - trade.stopLoss);
  const tp = trade.takeProfit;
  const tpR = (tp && risk > 0)
    ? (trade.direction === 'long'
        ? (tp - trade.entryPrice) / risk
        : (trade.entryPrice - tp) / risk)
    : null;

  if (r <= -0.85) return 'near-stop-loss';
  if (r < -0.1)   return 'in-drawdown';
  if (tpR !== null && r >= tpR * 0.9) return 'near-take-profit';
  if (r >= 0.1)   return 'in-profit';
  if (r > -0.1 && r < 0.1) return 'breakeven';
  return 'developing';
}

// ── Plan Snapshot Initialization ──────────────────────────────────

export function initializePlanSnapshot(trade: Trade): TradePlan {
  const risk = Math.abs(trade.entryPrice - trade.stopLoss);
  const tpDist = trade.takeProfit
    ? Math.abs(trade.takeProfit - trade.entryPrice)
    : null;
  return {
    originalAnalysis: trade.notes ?? '',
    plannedEntry: trade.entryPrice,
    actualEntry: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    expectedDirection: trade.direction,
    expectedBehavior: '',
    invalidationCondition: '',
    expectedConfirmation: '',
    plannedRisk: trade.riskPercentage,
    plannedPositionSize: trade.positionSize,
    plannedRR: (tpDist && risk > 0) ? tpDist / risk : null,
    createdAt: trade.openedAt,
  };
}

// ── Event Management ──────────────────────────────────────────────

export function addEvent(
  monitoring: LiveMonitoringData,
  type: TradeEventType,
  options: {
    note?: string;
    price?: number;
    rMultiple?: number;
    screenshotDataUrl?: string;
    timeframe?: string;
    state?: LiveTradeState;
  } = {},
): LiveMonitoringData {
  const event: TradeEvent = {
    id: uid(),
    type,
    timestamp: Date.now(),
    price:            options.price             ?? null,
    rMultiple:        options.rMultiple         ?? null,
    note:             options.note              ?? null,
    screenshotDataUrl: options.screenshotDataUrl ?? null,
    timeframe:        options.timeframe         ?? null,
    state:            options.state             ?? null,
  };
  return { ...monitoring, events: [...monitoring.events, event] };
}

// ── State Transition ──────────────────────────────────────────────

export function transitionState(
  monitoring: LiveMonitoringData,
  newState: LiveTradeState,
  price: number | null = null,
  reason: string | null = null,
): LiveMonitoringData {
  if (monitoring.state === newState) return monitoring;

  const entry = { state: newState, timestamp: Date.now(), price, reason };
  let m = addEvent(monitoring, 'state-change', {
    note: `وضعیت تغییر کرد → ${newState}${reason ? ` (${reason})` : ''}`,
    price: price ?? undefined,
    state: newState,
  });
  return {
    ...m,
    state: newState,
    stateHistory: [...m.stateHistory, entry],
  };
}

// ── R Progression ─────────────────────────────────────────────────

export function addRProgression(
  monitoring: LiveMonitoringData,
  price: number,
  r: number,
  note: string | null = null,
): LiveMonitoringData {
  const point: RProgressionPoint = { timestamp: Date.now(), price, rMultiple: r, note };
  const prog = [...monitoring.rProgression, point];

  const allR = prog.map(p => p.rMultiple);
  const maxFav = Math.max(...allR);
  const maxAdv = Math.min(...allR);

  return {
    ...monitoring,
    rProgression: prog,
    maxFavorableExcursion: maxFav,
    maxAdverseExcursion: maxAdv,
  };
}

// ── Plan Deviation Detection ──────────────────────────────────────

export function detectPlanDeviations(
  plan: TradePlan,
  trade: Trade,
): PlanDeviation[] {
  const deviations: PlanDeviation[] = [];

  if (plan.stopLoss > 0 && Math.abs(plan.stopLoss - trade.stopLoss) > 0.000_01) {
    deviations.push({
      id: uid(),
      field: 'stopLoss',
      label: 'استاپ لاس',
      original: plan.stopLoss.toString(),
      current: trade.stopLoss.toString(),
      detectedAt: Date.now(),
    });
  }

  if (plan.takeProfit != null && trade.takeProfit != null &&
      Math.abs(plan.takeProfit - trade.takeProfit) > 0.000_01) {
    deviations.push({
      id: uid(),
      field: 'takeProfit',
      label: 'حد سود (TP)',
      original: plan.takeProfit.toString(),
      current: trade.takeProfit.toString(),
      detectedAt: Date.now(),
    });
  }

  if (plan.plannedPositionSize != null && trade.positionSize != null &&
      Math.abs(plan.plannedPositionSize - trade.positionSize) > 0.000_01) {
    deviations.push({
      id: uid(),
      field: 'positionSize',
      label: 'حجم معامله',
      original: plan.plannedPositionSize.toString(),
      current: trade.positionSize.toString(),
      detectedAt: Date.now(),
    });
  }

  return deviations;
}

// ── Historical Comparisons ────────────────────────────────────────

export function findHistoricalComparisons(
  trade: Trade,
  allTrades: Trade[],
  limit = 5,
): HistoricalComparison[] {
  const closed = allTrades.filter(
    t => t.id !== trade.id &&
      t.status === 'closed' &&
      ['win', 'loss', 'breakeven', 'partial-win', 'partial-loss'].includes(t.result),
  );

  const tradeTags: string[] = (() => {
    try { return JSON.parse(trade.tags || '[]'); } catch { return []; }
  })();

  const scored = closed.map(t => {
    let score = 0;
    if (t.symbol === trade.symbol)    score += 40;
    if (t.direction === trade.direction) score += 20;
    if (t.market === trade.market)    score += 10;
    try {
      const tTags: string[] = JSON.parse(t.tags || '[]');
      score += tradeTags.filter(tag => tTags.includes(tag)).length * 8;
    } catch { /* */ }
    return { t, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ t }) => {
    const rStr   = t.rMultiple != null ? `${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R` : '؟R';
    let whatHappened = '';
    if (isWin(t))  whatHappened = `به هدف رسید (${rStr})`;
    else if (isLoss(t)) whatHappened = `استاپ فعال شد (${rStr})`;
    else whatHappened = `سربه‌سر بسته شد`;

    const similarity = t.symbol === trade.symbol ? 'نماد یکسان' : 'جهت/الگو مشابه';

    return {
      tradeId: t.id,
      symbol: t.symbol,
      direction: t.direction,
      result: t.result,
      rMultiple: t.rMultiple,
      similarity,
      openedAt: t.openedAt,
      whatHappened,
    };
  });
}

// ── Behavior Pattern Detection ────────────────────────────────────

export function detectBehaviorPatterns(
  monitoring: LiveMonitoringData,
  allTrades: Trade[],
): BehaviorObservation[] {
  const obs: BehaviorObservation[] = [];

  const slModCount = allTrades.filter(t => {
    try {
      const m = parseLiveMonitoring(t);
      return m.events.some(e => e.type === 'sl-modify');
    } catch { return false; }
  }).length;

  if (monitoring.events.some(e => e.type === 'sl-modify')) {
    obs.push({
      id: uid(),
      pattern: 'sl-widened',
      description: `تغییر استاپ لاس در این معامله ثبت شد. معاملات مشابه در تاریخچه: ${slModCount}`,
      historicalCount: slModCount,
      detectedAt: Date.now(),
    });
  }

  const tpReduceCount = allTrades.filter(t => {
    try { return parseLiveMonitoring(t).events.some(e => e.type === 'tp-modify'); }
    catch { return false; }
  }).length;

  if (monitoring.events.some(e => e.type === 'tp-modify')) {
    obs.push({
      id: uid(),
      pattern: 'tp-reduced',
      description: `تغییر حد سود در این معامله ثبت شد. تعداد در تاریخچه: ${tpReduceCount}`,
      historicalCount: tpReduceCount,
      detectedAt: Date.now(),
    });
  }

  if (monitoring.events.some(e => e.type === 'partial-exit')) {
    const peCount = allTrades.filter(t => {
      try { return parseLiveMonitoring(t).events.some(e => e.type === 'partial-exit'); }
      catch { return false; }
    }).length;
    obs.push({
      id: uid(),
      pattern: 'partial-exit',
      description: `خروج جزئی در این معامله ثبت شد. تعداد در تاریخچه: ${peCount}`,
      historicalCount: peCount,
      detectedAt: Date.now(),
    });
  }

  return obs;
}

// ── Live Insight Generation ───────────────────────────────────────

export function generateLiveInsights(
  trade: Trade,
  monitoring: LiveMonitoringData,
  allTrades: Trade[],
): LiveInsight[] {
  const insights: LiveInsight[] = [];
  const now = Date.now();

  // Plan alignment
  if (monitoring.planDeviations.length === 0) {
    insights.push({
      id: uid(),
      category: 'plan-alignment',
      text: 'رفتار جاری معامله با پلن اولیه همخوانی دارد.',
      confidence: 'medium',
      generatedAt: now,
    });
  } else {
    const fields = monitoring.planDeviations.map(d => d.label).join('، ');
    insights.push({
      id: uid(),
      category: 'plan-alignment',
      text: `انحراف از پلن اولیه شناسایی شد در: ${fields}.`,
      confidence: 'high',
      generatedAt: now,
    });
  }

  // R-based market development
  const lastR = monitoring.rProgression.length > 0
    ? monitoring.rProgression[monitoring.rProgression.length - 1].rMultiple
    : null;

  if (lastR !== null) {
    if (lastR >= 1.5) {
      insights.push({
        id: uid(),
        category: 'market-development',
        text: `معامله به ${lastR.toFixed(2)}R رسیده است. مدیریت ریسک و بررسی هدف توصیه می‌شود.`,
        confidence: 'high',
        generatedAt: now,
      });
    } else if (lastR <= -0.7) {
      insights.push({
        id: uid(),
        category: 'market-development',
        text: `معامله در ${lastR.toFixed(2)}R — قیمت به استاپ لاس نزدیک می‌شود.`,
        confidence: 'high',
        generatedAt: now,
      });
    }

    const mfe = monitoring.maxFavorableExcursion;
    if (mfe !== null && mfe > 0.3 && lastR < mfe - 0.5) {
      insights.push({
        id: uid(),
        category: 'market-development',
        text: `معامله از بیشترین سود (${mfe.toFixed(2)}R) به ${lastR.toFixed(2)}R بازگشته. بررسی توصیه می‌شود.`,
        confidence: 'medium',
        generatedAt: now,
      });
    }
  }

  // Historical similarity
  const comps = monitoring.historicalComparisons;
  if (comps.length >= 3) {
    const wins  = comps.filter(c => c.result === 'win' || c.result === 'partial-win').length;
    const total = comps.length;
    const winRate = Math.round((wins / total) * 100);
    insights.push({
      id: uid(),
      category: 'historical-similarity',
      text: `${total} معامله مشابه در تاریخچه یافت شد. نرخ برد: ${winRate}٪.`,
      confidence: total >= 5 ? 'high' : 'medium',
      generatedAt: now,
    });
  } else if (comps.length > 0) {
    insights.push({
      id: uid(),
      category: 'historical-similarity',
      text: `${comps.length} معامله مشابه یافت شد. داده تاریخی محدود — نتیجه‌گیری با احتیاط.`,
      confidence: 'low',
      generatedAt: now,
    });
  } else {
    insights.push({
      id: uid(),
      category: 'data-confidence',
      text: 'معاملات بسته‌شده کافی برای مقایسه تاریخی وجود ندارد.',
      confidence: 'low',
      generatedAt: now,
    });
  }

  // Scenario insight
  const triggeredInvalidation = monitoring.scenarios.find(
    s => s.type === 'invalidation' && s.status === 'triggered',
  );
  if (triggeredInvalidation) {
    insights.push({
      id: uid(),
      category: 'plan-alignment',
      text: 'شرط باطل‌شدن فعال شده است. پلن اولیه را بازبینی کنید.',
      confidence: 'high',
      generatedAt: now,
    });
  }

  return insights;
}
