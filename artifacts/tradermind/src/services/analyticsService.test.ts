/**
 * Unit Tests — analyticsService
 * تست توابع محاسباتی معاملاتی (pure functions)
 */
import { describe, it, expect } from 'vitest';
import {
  computeAnalytics,
  filterTradesByRange,
  getDateRange,
} from './analyticsService';
import type { Trade, DailyJournal, Strategy } from '../db/database';

// ── کمک‌های ساخت داده آزمون ──────────────────────────────
function makeTradeRaw(overrides: Partial<Trade> = {}): Trade {
  return {
    id: crypto.randomUUID(),
    strategyId: null,
    sessionId: null,
    symbol: 'XAUUSD',
    market: null,
    direction: 'long',
    entryPrice: 2000,
    exitPrice: 2010,
    stopLoss: 1990,
    takeProfit: 2020,
    positionSize: null,
    riskAmount: null,
    fees: null,
    status: 'closed',
    result: 'win',
    profitLoss: 100,
    rMultiple: 2,
    riskPercentage: 1,
    adherenceScore: null,
    adherenceRating: null,
    adherenceNotes: null,
    emotions: '[]',
    emotionNotes: null,
    notes: null,
    reasonForExit: null,
    screenshots: '[]',
    review: '{}',
    tags: '[]',
    openedAt: Date.now(),
    closedAt: Date.now(),
    createdAt: Date.now(),
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

function makeJournal(overrides: Partial<DailyJournal> = {}): DailyJournal {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().split('T')[0],
    mood: 7,
    energyLevel: 7,
    focusLevel: 7,
    stressLevel: 3,
    notes: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: crypto.randomUUID(),
    name: 'Test Strategy',
    description: null,
    icon: null,
    colorTag: null,
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════
// ۱. Win Rate
// ════════════════════════════════════════════════════════
describe('Win Rate', () => {
  it('باید ۱۰۰٪ برای همه برد باشد', () => {
    const trades = [makeTrade({ result: 'win' }), makeTrade({ result: 'win' })];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.winRate).toBe(100);
  });

  it('باید ۰٪ برای همه باخت باشد', () => {
    const trades = [makeTrade({ result: 'loss' }), makeTrade({ result: 'loss' })];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.winRate).toBe(0);
  });

  it('باید ۵۰٪ برای نصف برد نصف باخت باشد', () => {
    const trades = [
      makeTrade({ result: 'win' }),
      makeTrade({ result: 'loss' }),
    ];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.winRate).toBe(50);
  });

  it('باید معاملات open را در محاسبه win rate حساب نکند', () => {
    const trades = [
      makeTrade({ result: 'win', status: 'closed' }),
      makeTrade({ result: null as any, status: 'open', profitLoss: null }),
    ];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.winRate).toBe(100);
    expect(summary.open).toBe(1);
  });
});

// ════════════════════════════════════════════════════════
// ۲. P/L
// ════════════════════════════════════════════════════════
describe('P/L Calculation', () => {
  it('باید مجموع P/L را درست حساب کند', () => {
    const trades = [
      makeTrade({ profitLoss: 200 }),
      makeTrade({ profitLoss: -100 }),
      makeTrade({ profitLoss: 50 }),
    ];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.totalPnl).toBe(150);
  });

  it('باید بهترین و بدترین معامله را شناسایی کند', () => {
    const trades = [
      makeTrade({ profitLoss: 500 }),
      makeTrade({ profitLoss: -200 }),
      makeTrade({ profitLoss: 100 }),
    ];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.bestTrade).toBe(500);
    expect(summary.worstTrade).toBe(-200);
  });

  it('باید برای لیست خالی null برگرداند', () => {
    const { summary } = computeAnalytics([], [], []);
    expect(summary.bestTrade).toBeNull();
    expect(summary.worstTrade).toBeNull();
    expect(summary.totalPnl).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// ۳. Average R
// ════════════════════════════════════════════════════════
describe('Average R Multiple', () => {
  it('باید میانگین R را درست حساب کند', () => {
    const trades = [
      makeTrade({ rMultiple: 2 }),
      makeTrade({ rMultiple: 4 }),
    ];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.avgR).toBe(3);
  });

  it('باید null برگرداند اگر هیچ معامله‌ای R نداشته باشد', () => {
    const trades = [makeTrade({ rMultiple: null })];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.avgR).toBeNull();
  });

  it('باید معاملات بدون R را نادیده بگیرد', () => {
    const trades = [
      makeTrade({ rMultiple: 3 }),
      makeTrade({ rMultiple: null }),
      makeTrade({ rMultiple: 1 }),
    ];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.avgR).toBe(2); // (3+1)/2
  });
});

// ════════════════════════════════════════════════════════
// ۴. PnL Curve
// ════════════════════════════════════════════════════════
describe('PnL Curve', () => {
  it('باید منحنی تجمعی را درست بسازد', () => {
    const t = Date.now();
    const trades = [
      makeTrade({ profitLoss: 100, closedAt: t }),
      makeTrade({ profitLoss: -50, closedAt: t + 1 }),
      makeTrade({ profitLoss: 200, closedAt: t + 2 }),
    ];
    const { pnlCurve } = computeAnalytics(trades, [], []);
    expect(pnlCurve).toHaveLength(3);
    expect(pnlCurve[0].cumulative).toBe(100);
    expect(pnlCurve[1].cumulative).toBe(50);
    expect(pnlCurve[2].cumulative).toBe(250);
  });

  it('باید معاملات open را در منحنی نادیده بگیرد', () => {
    const trades = [
      makeTrade({ profitLoss: 100, status: 'closed' }),
      makeTrade({ profitLoss: null, status: 'open' }),
    ];
    const { pnlCurve } = computeAnalytics(trades, [], []);
    expect(pnlCurve).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════
// ۵. فیلتر تاریخ
// ════════════════════════════════════════════════════════
describe('Date Range Filter', () => {
  it('باید معاملات داخل بازه را برگرداند', () => {
    const now = Date.now();
    const trades = [
      makeTrade({ openedAt: now - 1000 }),
      makeTrade({ openedAt: now - 100_000 }),
    ];
    const result = filterTradesByRange(trades, now - 5000, now);
    expect(result).toHaveLength(1);
  });

  it('باید برای بازه خالی آرایه خالی برگرداند', () => {
    const now = Date.now();
    const trades = [makeTrade({ openedAt: now - 100_000 })];
    const result = filterTradesByRange(trades, now - 1000, now);
    expect(result).toHaveLength(0);
  });

  it('باید getDateRange برای today درست کار کند', () => {
    const { from, to } = getDateRange('today');
    const now = Date.now();
    expect(from).toBeLessThan(now);
    expect(to).toBeLessThanOrEqual(now + 100);
    // from باید شروع امروز باشد
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    expect(from).toBe(todayStart.getTime());
  });

  it('باید getDateRange برای month درست کار کند', () => {
    const { from } = getDateRange('month');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    expect(from).toBe(monthStart.getTime());
  });
});

// ════════════════════════════════════════════════════════
// ۶. Strategy Performance
// ════════════════════════════════════════════════════════
describe('Strategy Performance', () => {
  it('باید عملکرد هر استراتژی را جدا محاسبه کند', () => {
    const stratId = crypto.randomUUID();
    const strat = makeStrategy({ id: stratId, name: 'My Strat' });
    const trades = [
      makeTrade({ strategyId: stratId, result: 'win', profitLoss: 100 }),
      makeTrade({ strategyId: stratId, result: 'loss', profitLoss: -50 }),
      makeTrade({ strategyId: null, result: 'win', profitLoss: 200 }),
    ];
    const { strategyPerf } = computeAnalytics(trades, [], [strat]);
    const sp = strategyPerf.find(s => s.strategyId === stratId);
    expect(sp).toBeDefined();
    expect(sp!.total).toBe(2);
    expect(sp!.winRate).toBe(50);
    expect(sp!.totalPnl).toBe(50);
  });
});

// ════════════════════════════════════════════════════════
// ۷. Adherence Analysis
// ════════════════════════════════════════════════════════
describe('Adherence Analysis', () => {
  it('باید گروه‌بندی پایبندی را درست انجام دهد', () => {
    const trades = [
      makeTrade({ adherenceRating: 'fully', result: 'win' }),
      makeTrade({ adherenceRating: 'fully', result: 'win' }),
      makeTrade({ adherenceRating: 'not', result: 'loss' }),
    ];
    const { adherencePerf } = computeAnalytics(trades, [], []);
    const fully = adherencePerf.find(a => a.rating === 'fully');
    const not = adherencePerf.find(a => a.rating === 'not');
    expect(fully?.total).toBe(2);
    expect(fully?.winRate).toBe(100);
    expect(not?.total).toBe(1);
    expect(not?.winRate).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// ۸. Edge Cases — حالت‌های خاص
// ════════════════════════════════════════════════════════
describe('Edge Cases', () => {
  it('باید با داده خالی بدون crash کار کند', () => {
    expect(() => computeAnalytics([], [], [])).not.toThrow();
  });

  it('باید با هزار معامله بدون مشکل کار کند', () => {
    const trades = Array.from({ length: 1000 }, (_, i) =>
      makeTrade({ profitLoss: i % 2 === 0 ? 100 : -50, result: i % 2 === 0 ? 'win' : 'loss', openedAt: Date.now() + i })
    );
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.total).toBe(1000);
    expect(summary.winRate).toBe(50);
  });

  it('باید partial-win را در wins حساب کند', () => {
    const trades = [makeTrade({ result: 'partial-win' })];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.wins).toBe(1);
  });

  it('باید partial-loss را در losses حساب کند', () => {
    const trades = [makeTrade({ result: 'partial-loss' })];
    const { summary } = computeAnalytics(trades, [], []);
    expect(summary.losses).toBe(1);
  });
});
