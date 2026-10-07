import { db, Trade } from '../db/database';
import { normalizeImportedTradeFields } from '../lib/tradeClassification';

export interface TradeNormalizationResult {
  scanned: number;
  updated: number;
  closed: number;
  sessionsDetected: number;
}

/**
 * Repairs imported/legacy trades without overwriting a session selected by
 * the user. It is intentionally idempotent so it can safely run at startup.
 */
export async function normalizeExistingTrades(): Promise<TradeNormalizationResult> {
  const trades = await db.trades.toArray();
  const result: TradeNormalizationResult = {
    scanned: trades.length,
    updated: 0,
    closed: 0,
    sessionsDetected: 0,
  };

  for (const trade of trades) {
    const inferred = normalizeImportedTradeFields(trade);
    const changes: Partial<Trade> = {};

    if (trade.status !== inferred.status) changes.status = inferred.status;
    if (trade.result !== inferred.result) changes.result = inferred.result;
    if (!trade.tradingSession && inferred.tradingSession) {
      changes.tradingSession = inferred.tradingSession;
      result.sessionsDetected++;
    }

    if (Object.keys(changes).length === 0) continue;

    await db.trades.update(trade.id, changes);
    result.updated++;
    if (changes.status === 'closed') result.closed++;
  }

  return result;
}
