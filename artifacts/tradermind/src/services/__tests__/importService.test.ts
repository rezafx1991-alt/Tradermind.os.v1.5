import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { importJSON, previewCSV, type ColumnMapping } from '../importService';

describe('importService duplicate detection', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('flags repeated rows in the same CSV preview', async () => {
    const csv = [
      'symbol,direction,entryPrice,openedAt',
      'EURUSD,long,1.1,2026-10-01T10:00:00.000Z',
      'EURUSD,long,1.1,2026-10-01T10:00:00.000Z',
    ].join('\n');
    const mapping: ColumnMapping = {
      symbol: 'symbol',
      direction: 'direction',
      entryPrice: 'entryPrice',
      openedAt: 'openedAt',
    };

    const preview = await previewCSV(csv, mapping);

    expect(preview.duplicateRows).toBe(1);
    expect(preview.rows.map(row => row.isDuplicate)).toEqual([false, true]);
    expect(preview.rows[1].duplicateTradeId).toBeNull();
  });

  it('skips repeated rows within one JSON import when requested', async () => {
    const openedAt = 1_790_840_400_000;
    const json = JSON.stringify([
      { symbol: 'EURUSD', direction: 'long', entryPrice: 1.1, openedAt },
      { symbol: 'EURUSD', direction: 'long', entryPrice: 1.1, openedAt },
    ]);

    const result = await importJSON(json, { skipDuplicates: true });

    expect(result).toMatchObject({ imported: 1, skipped: 1, errors: [] });
    expect(await db.trades.count()).toBe(1);
  });
});
