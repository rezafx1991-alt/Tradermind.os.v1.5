import { describe, expect, it } from 'vitest';
import { getNetPnl } from '../tradeHelpers';
import type { Trade } from '../../db/database';

const makeTrade = (overrides: Partial<Trade> = {}): Trade => ({
  id: 'test-trade',
  sessionId: null, strategyId: null, accountId: null, boxId: null,
  symbol: 'EURUSD', market: 'Forex', direction: 'long',
  entryPrice: 1, exitPrice: 2, stopLoss: 0.9, takeProfit: 2,
  positionSize: 1, riskPercentage: 1, riskAmount: 10, rMultiple: 2,
  result: 'win', profitLoss: 100, fees: 5, commission: 3, spread: 2,
  status: 'closed', openedAt: 1, closedAt: 2,
  reasonForExit: null, emotions: '[]', emotionNotes: null, notes: null,
  screenshots: '[]', adherenceScore: null, adherenceRating: null, adherenceNotes: null,
  review: '{}', postTradeReview: '{}', tags: '[]', createdAt: 1,
  liveMonitoring: null, plannedEntry: null, plannedSL: null, plannedTP: null,
  plannedRR: null, plannedRisk: null, plannedPositionSize: null,
  tradingSession: null, setupType: null, timezone: null, entryReason: null,
  lesson: null, slMoved: null, tpMoved: null, partialClose: null,
  addedToPosition: null, reducedPosition: null, manualExit: null,
  managementReason: null, mtfAnalysis: null, preTradeBriefing: null,
  ...overrides,
});

describe('getNetPnl', () => {
  it('subtracts fees, commission, and spread from gross P/L', () => {
    expect(getNetPnl(makeTrade())).toBe(90);
  });

  it('preserves zero-valued costs and returns null for an open P/L', () => {
    expect(getNetPnl(makeTrade({ fees: 0, commission: 0, spread: 0 }))).toBe(100);
    expect(getNetPnl(makeTrade({ profitLoss: null }))).toBeNull();
  });
});