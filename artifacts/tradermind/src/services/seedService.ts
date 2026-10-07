/**
 * seedService.ts — PART 11 / Prompt 3
 *
 * ابزار توسعه: تولید داده‌های مصنوعی برای تست عملکرد با 10,000 معامله.
 * فقط در حالت development استفاده شود.
 */

import { db } from '../db/database';
import type { Trade, Strategy } from '../db/database';

const uuidv4 = (): string => crypto.randomUUID();
import { invalidateAnalyticsCache } from './analyticsCacheService';

// ── پارامترها ─────────────────────────────────────────────────────────────────

export interface SeedOptions {
  tradeCount?: number;
  strategyCount?: number;
  /** اگر true باشد، قبل از seed کردن داده‌های موجود پاک می‌شوند */
  clearFirst?: boolean;
  /** تعداد trade ها در هر batch برای جلوگیری از timeout */
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}

// ── داده‌های آزمایشی ──────────────────────────────────────────────────────────

const SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'XAUUSD', 'XAGUSD', 'BTCUSD', 'ETHUSD', 'GBPJPY', 'EURJPY', 'EURGBP',
  'US30', 'US100', 'US500', 'BRENTOIL', 'NATGAS',
];

const SESSIONS = ['london', 'newyork', 'asian', 'overlap'] as const;
const DIRECTIONS = ['long', 'short'] as const;
const RESULTS_WEIGHTED = [
  'win', 'win', 'win',               // 40%
  'loss', 'loss',                    // 30%
  'partial-win', 'partial-win',      // 20%
  'partial-loss', 'breakeven',       // 10%
];
const EMOTIONS = ['calm', 'confident', 'anxious', 'greedy', 'fearful', 'neutral', 'excited'];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
const MARKET_STRUCTURES = ['uptrend', 'downtrend', 'ranging', 'breakout', 'reversal'];
const ADHERENCE = ['fully', 'mostly', 'partially', 'not'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randFloat(min: number, max: number, decimals = 5): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randTimestamp(startMs: number, endMs: number): number {
  return randInt(startMs, endMs);
}

// ── Strategy Generator ────────────────────────────────────────────────────────

function buildStrategy(index: number): Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'> {
  const names = [
    'ICT Smart Money', 'Supply & Demand', 'Breaker Block', 'Order Block',
    'Fair Value Gap', 'Liquidity Sweep', 'BOS & ChoCH', 'Wyckoff Method',
    'Price Action', 'VSA', 'Elliott Wave', 'Harmonic Pattern', 'SMC Confluences',
    'Multi TF Analysis', 'News Trading', 'Scalping M1', 'Swing H4', 'Position D1',
    'Grid Strategy', 'Hedging',
  ];
  return {
    name: names[index % names.length] + (index >= names.length ? ` v${Math.floor(index / names.length) + 1}` : ''),
    description: `استراتژی آزمایشی شماره ${index + 1} برای تست عملکرد سیستم`,
    icon: null,
    colorTag: null,
    isActive: true,
  };
}

// ── Trade Generator ───────────────────────────────────────────────────────────

function buildTrade(
  strategyIds: string[],
  startMs: number,
  endMs: number,
): Omit<Trade, 'id' | 'createdAt' | 'updatedAt'> {
  const symbol = pick(SYMBOLS);
  const direction = pick(DIRECTIONS);
  const result = pick(RESULTS_WEIGHTED);
  const openedAt = randTimestamp(startMs, endMs);
  const durationMs = randInt(60_000, 48 * 3_600_000); // 1min to 48hr
  const closedAt = result === 'open' ? null : openedAt + durationMs;

  // قیمت‌ها
  const basePrice = symbol.includes('JPY') ? randFloat(100, 160, 3) : randFloat(0.8, 1.5);
  const entryPrice = basePrice;
  const riskPips = randFloat(5, 50, 1);
  const rewardPips = riskPips * randFloat(0.5, 4);
  const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
  const isWin = result === 'win' || result === 'partial-win';
  const exitDelta = (isWin ? rewardPips : -riskPips) * pipValue * (direction === 'long' ? 1 : -1);
  const exitPrice = closedAt ? parseFloat((entryPrice + exitDelta).toFixed(5)) : null;
  const stopLoss = direction === 'long' ? entryPrice - riskPips * pipValue : entryPrice + riskPips * pipValue;
  const takeProfit = direction === 'long' ? entryPrice + rewardPips * pipValue : entryPrice - rewardPips * pipValue;

  // P&L
  const lotSize = randFloat(0.01, 2, 2);
  const pnlPerPip = symbol.includes('JPY') ? 10 * lotSize : 10 * lotSize;
  const pnlPips = isWin ? rewardPips : -riskPips;
  const profitLoss = closedAt ? parseFloat((pnlPips * pnlPerPip / 100).toFixed(2)) : null;
  const rMultiple = closedAt ? parseFloat((pnlPips / riskPips).toFixed(2)) : null;
  const riskPercentage = randFloat(0.25, 2.5, 2);

  return {
    symbol,
    direction,
    result: closedAt ? result as any : 'open',
    status: closedAt ? 'closed' : 'open',
    openedAt,
    closedAt,
    entryPrice,
    exitPrice,
    stopLoss,
    takeProfit,
    positionSize: lotSize,
    profitLoss,
    rMultiple,
    riskPercentage,
    riskAmount: null,
    fees: null,
    tradingSession: pick(SESSIONS) as any,
    adherenceRating: pick(ADHERENCE) as any,
    adherenceScore: randInt(30, 100),
    adherenceNotes: null,
    strategyId: strategyIds.length ? pick(strategyIds) : null,
    sessionId: null,
    accountId: null,
    boxId: null,
    market: null,
    notes: result === 'loss' ? 'معامله طبق پلن بود اما بازار خلاف جهت حرکت کرد.' : '',
    emotionNotes: null,
    emotions: '[]',
    tags: '[]',
    screenshots: '[]',
    postTradeReview: '{}',
    review: '{}',
    reasonForExit: closedAt ? (isWin ? 'رسیدن به TP' : 'رسیدن به SL') : null,
    liveMonitoring: null,
    plannedEntry: null,
    plannedSL: null,
    plannedTP: null,
    plannedRR: null,
    plannedRisk: null,
    plannedPositionSize: null,
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
  };
}

// ── Main Seed Function ────────────────────────────────────────────────────────

/**
 * ایجاد داده‌های مصنوعی برای تست عملکرد.
 *
 * @example
 * // در DevTools:
 * import { seedDatabase } from './src/services/seedService';
 * await seedDatabase({ tradeCount: 10000, strategyCount: 20, clearFirst: false });
 */
export async function seedDatabase(options: SeedOptions = {}): Promise<void> {
  const {
    tradeCount = 10_000,
    strategyCount = 20,
    clearFirst = false,
    batchSize = 500,
    onProgress,
  } = options;

  console.log(`[SeedService] شروع seed: ${tradeCount} معامله، ${strategyCount} استراتژی`);

  if (clearFirst) {
    await db.trades.clear();
    await db.strategies.clear();
    console.log('[SeedService] داده‌های قدیمی پاک شدند');
  }

  // ── ایجاد استراتژی‌ها
  const strategyIds: string[] = [];
  const now = Date.now();
  const strategiesToAdd = Array.from({ length: strategyCount }, (_, i) => {
    const id = uuidv4();
    strategyIds.push(id);
    return {
      id,
      ...buildStrategy(i),
      createdAt: now - randInt(0, 365 * 24 * 3600 * 1000),
      updatedAt: now,
    } as Strategy;
  });
  await db.strategies.bulkAdd(strategiesToAdd);
  console.log(`[SeedService] ${strategyCount} استراتژی ایجاد شد`);

  // ── ایجاد معاملات در batch
  const endMs = now;
  const startMs = now - 2 * 365 * 24 * 3600 * 1000; // 2 سال
  let done = 0;

  while (done < tradeCount) {
    const currentBatch = Math.min(batchSize, tradeCount - done);
    const batch = Array.from({ length: currentBatch }, () => {
      const id = uuidv4();
      const ts = now;
      return {
        id,
        ...buildTrade(strategyIds, startMs, endMs),
        createdAt: ts,
        updatedAt: ts,
      } as Trade;
    });
    await db.trades.bulkAdd(batch);
    done += currentBatch;
    onProgress?.(done, tradeCount);
    // yield به event loop برای جلوگیری از block شدن
    await new Promise(r => setTimeout(r, 0));
  }

  invalidateAnalyticsCache();
  console.log(`[SeedService] ✅ ${tradeCount} معامله با موفقیت ایجاد شد`);
}

/**
 * Seed داده‌های اولیه نمونه — فقط اگر DB کاملاً خالی باشد.
 * در App.tsx هنگام mount فراخوانی می‌شود.
 * برای seed سنگین 10k معامله از `seedDatabase()` استفاده کنید.
 */
export async function seedInitialData(): Promise<void> {
  const tradeCount = await db.trades.count();
  if (tradeCount > 0) return; // قبلاً seed شده

  const strategyCount = await db.strategies.count();
  if (strategyCount === 0) {
    const sampleStrategies = [
      buildStrategy(0), buildStrategy(1), buildStrategy(2),
    ];
    await db.strategies.bulkAdd(
      sampleStrategies.map((s, i) => ({
        id: uuidv4(),
        ...s,
        createdAt: Date.now() - i * 86400_000,
        updatedAt: Date.now(),
      } as Strategy))
    );
  }
  // معاملات نمونه اضافه نمی‌شوند — کاربر از نو شروع می‌کند
}

/** پاک کردن تمام داده‌های seed شده */
export async function clearSeedData(): Promise<void> {
  await db.trades.clear();
  await db.strategies.clear();
  invalidateAnalyticsCache();
  console.log('[SeedService] تمام داده‌ها پاک شدند');
}

/** خلاصه آماری دیتابیس فعلی */
export async function getDatabaseStats(): Promise<{
  trades: number;
  strategies: number;
  journals: number;
  screenshots: number;
}> {
  const [trades, strategies, journals] = await Promise.all([
    db.trades.count(),
    db.strategies.count(),
    db.dailyJournals.count(),
  ]);
  const screenshots = await db.trades
    .filter(t => (t.screenshots?.length ?? 0) > 0)
    .count();
  return { trades, strategies, journals, screenshots };
}
