/**
 * تست‌های موتور محاسبات مالی (core/metrics)
 *
 * قرارداد: profitLoss ناخالص است؛ کارمزد/کمیسیون/اسپرد کسر می‌شوند؛
 * برد/باخت از علامت سود خالص می‌آید؛ ترتیب زمانی بر اساس closedAt است.
 */
import { describe, it, expect } from 'vitest';
import type { Trade } from '../../../db/database';
import {
  computePnlCurve, computeTotalPnl, computeMaxDrawdown, computeMaxWin, computeMaxLoss,
  computeWinRate, computeProfitFactor, computeExpectancy, computeRiskMetrics,
  roundToHalf, kellyFraction, downsideDeviation,
} from '../index';
import { getNetPnl, getOutcome, getResolvedR, stdDev } from '../../../lib/tradeHelpers';
import { classifyTradeFields } from '../../../lib/tradeClassification';

let n = 0;
function t(o: Partial<Trade> = {}): Trade {
  n++;
  return {
    id: `t${n}`, sessionId: null, strategyId: null, accountId: null, boxId: null,
    symbol: 'EURUSD', market: null, direction: 'long',
    entryPrice: 1, exitPrice: 1.1, stopLoss: 0.9, takeProfit: null,
    positionSize: null, riskPercentage: null, riskAmount: null, rMultiple: null,
    result: 'open', profitLoss: null, fees: null, commission: null, spread: null,
    status: 'closed', openedAt: 1_000 * n, closedAt: 1_000 * n + 500,
    ...o,
  } as Trade;
}

/** مجموعهٔ مرجع: خالص‌ها = 90، -50، -5، 0 */
function reference(): Trade[] {
  return [
    t({ profitLoss: 100, commission: 10, riskAmount: 50, openedAt: 1, closedAt: 10, result: 'win' }),
    t({ profitLoss: -50, riskAmount: 50, openedAt: 2, closedAt: 20, result: 'loss' }),
    // برچسب win دارد ولی بعد از هزینه ضرر است
    t({ profitLoss: 10, fees: 15, riskAmount: 50, openedAt: 3, closedAt: 30, result: 'win' }),
    t({ profitLoss: 0, riskAmount: 50, openedAt: 4, closedAt: 40, result: 'breakeven' }),
  ];
}

describe('getNetPnl / getOutcome / getResolvedR', () => {
  it('هزینه‌ها همیشه کسر می‌شوند (علامت ورودی مهم نیست)', () => {
    expect(getNetPnl(t({ profitLoss: 100, commission: -10, fees: -5, spread: 2 }))).toBe(83);
  });
  it('سواپ علامت‌دار است: منفی هزینه، مثبت درآمد', () => {
    expect(getNetPnl(t({ profitLoss: 100, swap: -4 }))).toBe(96);
    expect(getNetPnl(t({ profitLoss: 100, swap: 3 }))).toBe(103);
  });
  it('نتیجه از علامت سود خالص می‌آید نه از برچسب', () => {
    expect(getOutcome(t({ profitLoss: 10, fees: 15, result: 'win' }))).toBe('loss');
    expect(getOutcome(t({ profitLoss: null, result: 'partial-win' }))).toBe('win');
  });
  it('R ذخیره‌شده اولویت دارد، وگرنه سود خالص ÷ ریسک؛ سود صفر معتبر است', () => {
    expect(getResolvedR(t({ rMultiple: 2, profitLoss: 5, riskAmount: 1 }))).toBe(2);
    expect(getResolvedR(t({ profitLoss: 90, riskAmount: 50 }))).toBeCloseTo(1.8, 10);
    expect(getResolvedR(t({ profitLoss: 0, riskAmount: 50 }))).toBe(0);
    expect(getResolvedR(t({ profitLoss: 10, riskAmount: null }))).toBeNull();
  });
  it('stdDev انحراف معیار نمونه (n-1) است', () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
  });
});

describe('PnL، منحنی و Drawdown', () => {
  it('مجموع و بیشترین سود/ضرر بر پایه سود خالص', () => {
    expect(computeTotalPnl(reference())).toBe(35);
    expect(computeMaxWin(reference())).toBe(90);
    expect(computeMaxLoss(reference())).toBe(-50);
  });
  it('منحنی بر اساس زمان «بسته شدن» مرتب می‌شود', () => {
    const a = t({ profitLoss: 10, openedAt: 1, closedAt: 300 });
    const b = t({ profitLoss: 20, openedAt: 2, closedAt: 100 });
    const curve = computePnlCurve([a, b]);
    expect(curve.map(p => p.pnl)).toEqual([20, 10]);
    expect(curve.map(p => p.cumulative)).toEqual([20, 30]);
  });
  it('Drawdown مطلق و درصدِ نسبت به قلهٔ همان لحظه', () => {
    const dd = computeMaxDrawdown(reference());
    expect(dd.absolute).toBe(55);
    expect(dd.percentage).toBeCloseTo((55 / 90) * 100, 8);
  });
  it('درصد drawdown با قلهٔ بعدی تغییر نمی‌کند', () => {
    const trades = [
      t({ profitLoss: 100, closedAt: 1 }), t({ profitLoss: -50, closedAt: 2 }),
      t({ profitLoss: 500, closedAt: 3 }),
    ];
    const dd = computeMaxDrawdown(trades);
    expect(dd.absolute).toBe(50);
    expect(dd.percentage).toBeCloseTo(50, 8); // نه 50/600
  });
  it('بیشترین درصد افت را مستقل از بیشترین افت مبلغی پیدا می‌کند', () => {
    const trades = [
      t({ profitLoss: 10_000, closedAt: 1 }),
      t({ profitLoss: -300, closedAt: 2 }),
      t({ profitLoss: 10_600, closedAt: 3 }),
      t({ profitLoss: -400, closedAt: 4 }),
    ];
    const dd = computeMaxDrawdown(trades);
    expect(dd.absolute).toBe(400);
    expect(dd.percentage).toBeCloseTo(3, 8);
  });
  it('با موجودی اولیه، درصد نسبت به سرمایه محاسبه می‌شود', () => {
    const dd = computeMaxDrawdown([t({ profitLoss: -100, closedAt: 1 })], 1000);
    expect(dd.absolute).toBe(100);
    expect(dd.percentage).toBeCloseTo(10, 8);
  });
});

describe('Win rate، Profit factor، Expectancy', () => {
  it('Win rate با سربه‌سر در مخرج', () => {
    const w = computeWinRate(reference());
    expect([w.wins, w.losses, w.breakeven, w.total]).toEqual([1, 2, 1, 4]);
    expect(w.winRate).toBe(0.25);
  });
  it('Profit factor با سود/زیان خالص', () => {
    const pf = computeProfitFactor(reference());
    expect(pf.totalWinPnl).toBe(90);
    expect(pf.totalLossPnl).toBe(55);
    expect(pf.profitFactor).toBeCloseTo(90 / 55, 10);
  });
  it('Expectancy = میانگین نتیجه هر معامله', () => {
    const e = computeExpectancy(reference());
    expect(e.expectancyPnl).toBeCloseTo(8.75, 10);
    expect(e.expectancy).toBeCloseTo((1.8 - 1 - 0.1 + 0) / 4, 10);
  });
  it('نبود R در بعضی معاملات، میانگین را با مخرج اشتباه نمی‌کند', () => {
    const e = computeExpectancy([
      t({ rMultiple: 2, profitLoss: 100 }), t({ rMultiple: -1, profitLoss: -50 }),
      t({ rMultiple: null, riskAmount: null, profitLoss: 30 }),
    ]);
    expect(e.expectancy).toBeCloseTo(0.5, 10);
    expect(e.rSampleSize).toBe(2);
  });
});

describe('معیارهای ریسک', () => {
  it('Kelly = W − (1−W)/B (نه فرمول قبلی)', () => {
    const rs = [2, 2, 2, -0.5, -0.5];
    expect(kellyFraction(rs)).toBeCloseTo(0.6 - 0.4 / 4, 10); // 0.5
  });
  it('Kelly بدون برد یا بدون باخت تعریف نمی‌شود', () => {
    expect(kellyFraction([1, 2])).toBeNull();
    expect(kellyFraction([-1, -2])).toBeNull();
  });
  it('Sortino با انحراف رو به پایین روی همهٔ مشاهدات', () => {
    expect(downsideDeviation([1.8, -1, -0.1, 0])).toBeCloseTo(Math.sqrt(1.01 / 4), 10);
    const m = computeRiskMetrics(reference());
    expect(m.sortinoRatio).toBeCloseTo(0.175 / Math.sqrt(1.01 / 4), 8);
  });
  it('Risk consistency صفر (ریسک ثابت) null نمی‌شود', () => {
    const m = computeRiskMetrics([t({ riskPercentage: 1 }), t({ riskPercentage: 1 }), t({ riskPercentage: 1 })]);
    expect(m.riskConsistency).toBe(0);
  });
  it('گرد کردن bucket متقارن و بدون -0.0', () => {
    expect(roundToHalf(-0.2)).toBe(0);
    expect(Object.is(roundToHalf(-0.2), -0)).toBe(false);
    expect(roundToHalf(1.25)).toBe(1.5);
    expect(roundToHalf(-1.25)).toBe(-1.5);
    const dist = computeRiskMetrics([t({ rMultiple: -0.2 }), t({ rMultiple: 0.2 })]).rMultipleDistribution;
    expect(dist).toEqual([{ r: '0.0', count: 2 }]);
  });
});

describe('classifyTradeFields', () => {
  it('نتیجه از سود خالص تعیین می‌شود', () => {
    expect(classifyTradeFields({ profitLoss: 10, fees: 15, closedAt: null, exitPrice: null, status: 'open', result: 'open' }))
      .toEqual({ status: 'closed', result: 'loss' });
  });
  it('برچسب جزئی هم‌جهت حفظ می‌شود', () => {
    expect(classifyTradeFields({ profitLoss: 10, closedAt: null, exitPrice: null, status: 'closed', result: 'partial-win' }).result)
      .toBe('partial-win');
    expect(classifyTradeFields({ profitLoss: -10, closedAt: null, exitPrice: null, status: 'closed', result: 'partial-win' }).result)
      .toBe('loss');
  });
});
