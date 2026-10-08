/**
 * تست‌های analyticsService.ts — Prompt 4 (Part 10)
 * تست محاسبات خالص (pure functions) با computeAnalytics
 */
import { describe, it, expect } from 'vitest';
import { computeAnalytics } from '../analyticsService';
import type { Trade } from '../../db/database';

// ─── داده‌های تستی ────────────────────────────────────────────────────────────

function makeTradeRaw(overrides: Partial<Trade> = {}): Trade {
  return {
    id: `t_${Math.random().toString(36).slice(2)}`,
    sessionId: null,
    strategyId: null,
    accountId: null,
    boxId: null,
    symbol: 'EURUSD',
    market: null,
    direction: 'long',
    entryPrice: 1.08,
    exitPrice: 1.09,
    stopLoss: 1.075,
    takeProfit: null,
    positionSize: 1,
    riskPercentage: 1,
    riskAmount: 50,
    rMultiple: 2,
    result: 'win',
    profitLoss: 100,
    fees: null,
    status: 'closed',
    openedAt: Date.now() - 3600000,
    closedAt: Date.now(),
    reasonForExit: null,
    emotions: '[]',
    emotionNotes: null,
    notes: null,
    screenshots: '[]',
    adherenceScore: null,
    adherenceRating: null,
    adherenceNotes: null,
    review: '{}',
    postTradeReview: '{}',
    tags: '[]',
    createdAt: Date.now(),
    liveMonitoring: null,
    plannedEntry: null,
    plannedSL: null,
    plannedTP: null,
    plannedRR: null,
    plannedRisk: null,
    plannedPositionSize: null,
    tradingSession: null,
    setupType: null,
    timezone: null,
    entryReason: null,
    lesson: null,
    slMoved: null,
    tpMoved: null,
    partialClose: null,
    addedToPosition: null,
    reducedPosition: null,
    manualExit: null,
    managementReason: null,
    mtfAnalysis: null,
    ...overrides,
  };
}

/**
 * نتیجهٔ معامله از علامت سود خالص تعیین می‌شود؛ پس اگر تست فقط `result` را
 * بدهد، سود/زیان هم‌جهت با آن ساخته می‌شود تا داده‌ی آزمون متناقض نباشد.
 */
function makeTrade(overrides: Partial<Trade> = {}): Trade {
  const trade = makeTradeRaw(overrides);
  if (overrides.profitLoss === undefined && overrides.result) {
    if (overrides.result === 'loss' || overrides.result === 'partial-loss') trade.profitLoss = -100;
    else if (overrides.result === 'breakeven') trade.profitLoss = 0;
    else if (overrides.result === 'win' || overrides.result === 'partial-win') trade.profitLoss = 100;
  }
  return trade;
}

// ─── تست‌های computeAnalytics ────────────────────────────────────────────────

describe('computeAnalytics — TradeSummary', () => {
  it('باید summary درست برای ۵ برد و ۲ باخت محاسبه کند', () => {
    const trades = [
      makeTrade({ result: 'win', rMultiple: 2, profitLoss: 100 }),
      makeTrade({ result: 'win', rMultiple: 1.5, profitLoss: 75 }),
      makeTrade({ result: 'win', rMultiple: 3, profitLoss: 150 }),
      makeTrade({ result: 'win', rMultiple: 1, profitLoss: 50 }),
      makeTrade({ result: 'win', rMultiple: 2, profitLoss: 100 }),
      makeTrade({ result: 'loss', rMultiple: -1, profitLoss: -50 }),
      makeTrade({ result: 'loss', rMultiple: -1, profitLoss: -50 }),
    ];
    const result = computeAnalytics(trades, [], []);
    expect(result.summary.total).toBe(7);
    expect(result.summary.wins).toBe(5);
    expect(result.summary.losses).toBe(2);
    expect(result.summary.totalPnl).toBeCloseTo(375, 1);
  });

  it('باید با آرایه خالی کار کند', () => {
    const result = computeAnalytics([], [], []);
    expect(result.summary.total).toBe(0);
    expect(result.summary.winRate).toBe(0);
  });

  it('باید معاملات باز را در total حساب کند ولی در winRate نه', () => {
    const trades = [
      makeTrade({ result: 'win', status: 'closed' }),
      makeTrade({ result: 'open', status: 'open' }),
    ];
    const result = computeAnalytics(trades, [], []);
    expect(result.summary.total).toBe(2);
    expect(result.summary.open).toBe(1);
    expect(result.summary.wins).toBe(1);
  });

  it('محاسبات مالی را از سود خالص و فقط معاملات بسته با داده معتبر می‌گیرد', () => {
    const trades = [
      makeTradeRaw({
        status: 'closed', result: 'loss', profitLoss: 100, fees: 20,
        rMultiple: null, riskAmount: 40, closedAt: 1,
      }),
      makeTradeRaw({
        status: 'closed', result: 'win', profitLoss: -50, fees: 5,
        rMultiple: null, riskAmount: 55, closedAt: 2,
      }),
      makeTradeRaw({
        status: 'closed', result: 'win', profitLoss: 100, fees: 100,
        rMultiple: null, riskAmount: null, closedAt: 3,
      }),
      makeTradeRaw({
        status: 'closed', result: 'win', profitLoss: null,
        rMultiple: null, riskAmount: 20, closedAt: 4,
      }),
      makeTradeRaw({
        status: 'open', result: 'open', profitLoss: 1_000,
        rMultiple: 10, openedAt: 5,
      }),
    ];

    const result = computeAnalytics(trades, [], []);
    expect(result.summary.totalPnl).toBe(25);
    expect(result.summary.breakeven).toBe(1);
    expect(result.summary.avgR).toBeCloseTo(0.5, 10);
    expect(result.summary.bestTrade).toBe(80);
    expect(result.summary.worstTrade).toBe(-55);
    expect(result.pnlCurve).toHaveLength(3);
  });

  it('باید winRate را به درستی محاسبه کند', () => {
    const trades = [
      makeTrade({ result: 'win', status: 'closed' }),
      makeTrade({ result: 'win', status: 'closed' }),
      makeTrade({ result: 'loss', status: 'closed' }),
      makeTrade({ result: 'loss', status: 'closed' }),
    ];
    const result = computeAnalytics(trades, [], []);
    expect(result.summary.winRate).toBe(50);
  });
});

describe('computeAnalytics — StrategyPerf', () => {
  it('باید عملکرد بر اساس استراتژی را صحیح جداسازی کند', () => {
    const trades = [
      makeTrade({ strategyId: 'strat-1', result: 'win', rMultiple: 2 }),
      makeTrade({ strategyId: 'strat-1', result: 'win', rMultiple: 1 }),
      makeTrade({ strategyId: 'strat-1', result: 'loss', rMultiple: -1 }),
      makeTrade({ strategyId: 'strat-2', result: 'loss', rMultiple: -1 }),
    ];
    const strategies = [
      { id: 'strat-1', name: 'FVG Strategy', description: '', icon: null, colorTag: null, isActive: true, createdAt: 0, updatedAt: 0 },
      { id: 'strat-2', name: 'OB Strategy', description: '', icon: null, colorTag: null, isActive: true, createdAt: 0, updatedAt: 0 },
    ];
    const result = computeAnalytics(trades, strategies, []);
    const strat1 = result.strategyPerf.find(p => p.strategyId === 'strat-1');
    expect(strat1?.total).toBe(3);
    expect(strat1?.wins).toBe(2);
  });
});

describe('computeAnalytics — BehaviorInsight', () => {
  it('باید consecutive losses را محاسبه کند', () => {
    const now = Date.now();
    const trades = [
      makeTrade({ result: 'win', status: 'closed', openedAt: now - 5000 }),
      makeTrade({ result: 'loss', status: 'closed', openedAt: now - 4000 }),
      makeTrade({ result: 'loss', status: 'closed', openedAt: now - 3000 }),
      makeTrade({ result: 'loss', status: 'closed', openedAt: now - 2000 }),
      makeTrade({ result: 'win', status: 'closed', openedAt: now - 1000 }),
    ];
    const result = computeAnalytics(trades, [], []);
    expect(result.behaviorInsight.consecutiveLosses).toBe(3);
  });

  it('باید consecutive wins را محاسبه کند', () => {
    const now = Date.now();
    const trades = [
      makeTrade({ result: 'win', status: 'closed', openedAt: now - 4000 }),
      makeTrade({ result: 'win', status: 'closed', openedAt: now - 3000 }),
      makeTrade({ result: 'win', status: 'closed', openedAt: now - 2000 }),
      makeTrade({ result: 'loss', status: 'closed', openedAt: now - 1000 }),
    ];
    const result = computeAnalytics(trades, [], []);
    expect(result.behaviorInsight.consecutiveWins).toBe(3);
  });
});
