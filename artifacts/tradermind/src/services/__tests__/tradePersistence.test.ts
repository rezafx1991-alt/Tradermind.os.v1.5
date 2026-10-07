import { beforeEach, describe, expect, it } from 'vitest';
import { db, Trade } from '../../db/database';
import { tradeService } from '../tradeService';

function tradeData(): Partial<Trade> {
  return {
    symbol: 'XAUUSD',
    direction: 'long',
    entryPrice: 2000,
    stopLoss: 1990,
    openedAt: Date.now(),
    screenshots: '[]',
  };
}

describe('Trade persistence identity and idempotency', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('creates exactly one trade and preserves its identity through repeated edits', async () => {
    const created = await tradeService.createTrade(tradeData());
    const originalId = created.id;

    for (let i = 0; i < 10; i += 1) {
      await tradeService.updateTrade(originalId, {
        stopLoss: 1990 - i,
        screenshots: JSON.stringify([{ id: `shot-${i}`, label: 'chart', dataUrl: 'data:image/png;base64,AA==', type: 'analysis', linkedTo: null }]),
      });
    }

    const trades = await db.trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0].id).toBe(originalId);
    expect(trades[0].stopLoss).toBe(1981);
  });

  it('serializes rapid manual/autosave updates without creating a second trade', async () => {
    const created = await tradeService.createTrade(tradeData());
    const originalId = created.id;

    await Promise.all([
      tradeService.updateTrade(originalId, { notes: 'manual' }),
      tradeService.updateTrade(originalId, { notes: 'autosave' }),
      tradeService.updateTrade(originalId, { notes: 'manual-again' }),
      tradeService.updateTrade(originalId, { psychology: 'related-data' } as Partial<Trade>),
    ]);

    const trades = await db.trades.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0].id).toBe(originalId);
  });

  it('refuses an UPDATE for a missing ID instead of silently creating data', async () => {
    await expect(tradeService.updateTrade('missing-trade-id', { notes: 'must not create' }))
      .rejects.toThrow(/no longer exists|requires an existing/i);
    expect(await db.trades.count()).toBe(0);
  });
});