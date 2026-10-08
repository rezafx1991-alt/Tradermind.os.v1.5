/**
 * سناریوی کامل جریان رویدادمحور سشن (بند ۳۷ سند طراحی):
 * 4H → 15M → 5M → تریگر 1M → معامله ۱ (SL) → مرور → تحلیل‌های جدید → تریگر → معامله ۲ (TP)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db } from '../../db/database';
import { accountService } from '../accountService';
import { journalSessionService } from '../journalSessionService';
import { strategyService } from '../strategyService';
import { tradeService } from '../tradeService';
import { tradingBoxService } from '../tradingBoxService';

async function seed() {
  const account = await accountService.create({ name: 'Primary', broker: '', currency: 'USD', initialBalance: 10_000, currentBalance: 10_000, color: '#3b82f6', isDefault: true, notes: null });
  const box = await tradingBoxService.create({ accountId: account.id, name: 'Box', description: null, targetTradeCount: 30, color: '#14b8a6', status: 'active', notes: null });
  const strategy = await strategyService.createStrategy({ name: 'S', description: '', icon: null, colorTag: null, isActive: true });
  await journalSessionService.ensureDefaultOptions();
  const session = await journalSessionService.createSession({ accountId: account.id, tradingBoxId: box.id, strategyId: strategy.id, symbols: ['EURUSD'], startTime: Date.now() });
  const options = await journalSessionService.getOptions('timeframe');
  const tf = (label: string) => options.find(o => o.label === label)!.id;
  return { session, tf };
}

describe('جریان کامل سشن', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('چند تحلیل، تریگر و دو معامله در یک سشن بدون حذف داده قبلی', async () => {
    const { session, tf } = await seed();
    const sid = session.id;

    // تحلیل‌های اولیه (هر تایم‌فریم یک رویداد مستقل)
    const first = await journalSessionService.createAnalysisEvents([
      { sessionId: sid, timeframeOptionId: tf('4H'), analysisText: 'ctx' },
      { sessionId: sid, timeframeOptionId: tf('15M'), scenario: 'bullish' },
      { sessionId: sid, timeframeOptionId: tf('5M'), analysisText: 'sweep' },
    ]);
    expect(first).toHaveLength(3);

    // تریگر و معامله ۱
    const trig1 = await journalSessionService.createTriggerEvent({ sessionId: sid, timeframeOptionId: tf('1M'), analysisEventId: first[2].id, marketMovement: 'sweep' });
    const t1 = await journalSessionService.createTradeFromSession({
      sessionId: sid, analysisEventId: first[2].id, triggerEventId: trig1.id,
      trade: { entryPrice: 1.1, stopLoss: 1.09, direction: 'long' },
    });
    await tradeService.updateTrade(t1.id, { status: 'closed', exitPrice: 1.09, closedAt: Date.now(), profitLoss: -100 });

    // تحلیل جدید بعد از SL
    const second = await journalSessionService.createAnalysisEvents([
      { sessionId: sid, timeframeOptionId: tf('15M'), scenario: 'new' },
      { sessionId: sid, timeframeOptionId: tf('5M') , analysisText: 'again' },
    ]);
    const trig2 = await journalSessionService.createTriggerEvent({ sessionId: sid, timeframeOptionId: tf('1M'), analysisEventId: second[1].id });
    const t2 = await journalSessionService.createTradeFromSession({
      sessionId: sid, analysisEventId: second[1].id, triggerEventId: trig2.id,
      trade: { entryPrice: 1.1, stopLoss: 1.09, direction: 'long' },
    });
    await tradeService.updateTrade(t2.id, { status: 'closed', exitPrice: 1.12, closedAt: Date.now() + 1000, profitLoss: 200 });

    // بررسی‌ها
    const analyses = await journalSessionService.getSessionAnalyses(sid);
    expect(analyses).toHaveLength(5);                              // تحلیل قبلی حذف نشده
    const trades = await journalSessionService.getSessionTrades(sid);
    expect(trades.map(t => t.id)).toEqual([t1.id, t2.id]);         // هر دو به همان سشن
    expect(trades[1].analysisEventId).toBe(second[1].id);          // ارتباط معامله ← تحلیل
    expect(trades[1].triggerEventId).toBe(trig2.id);               // ارتباط معامله ← تریگر
    expect((await db.trades.get(t2.id))!.accountId).toBe(session.accountId); // از سشن به ارث رسید

    const summary = await journalSessionService.getSessionSummary(sid);
    expect(summary.totalTrades).toBe(2);
    expect(summary.netPnl).toBe(100);
    expect(summary.triggerCount).toBe(2);
    expect(summary.triggersTraded).toBe(2);

    const timeline = await journalSessionService.getSessionTimeline(sid);
    const kinds = timeline.map(i => i.kind);
    expect(kinds).toContain('trade-result');
    expect(timeline.filter(i => i.kind === 'analysis')).toHaveLength(5);
    expect(timeline.filter(i => i.kind === 'trade-open')).toHaveLength(2);
  });

  it('وقتی معامله از Trigger ساخته می‌شود، Analysis همان Trigger را به‌صورت خودکار لینک می‌کند', async () => {
    const { session, tf } = await seed();
    const [analysis1, analysis2] = await journalSessionService.createAnalysisEvents([
      { sessionId: session.id, timeframeOptionId: tf('15M'), analysisText: 'first' },
      { sessionId: session.id, timeframeOptionId: tf('5M'), analysisText: 'second' },
    ]);
    const trigger = await journalSessionService.createTriggerEvent({
      sessionId: session.id,
      timeframeOptionId: tf('1M'),
      analysisEventId: analysis1.id,
    });

    // عمداً analysisEventId را ارسال نمی‌کنیم؛ Service باید رابطهٔ Analysis را از Trigger بخواند.
    const trade = await journalSessionService.createTradeFromSession({
      sessionId: session.id,
      triggerEventId: trigger.id,
      trade: { entryPrice: 1.1, stopLoss: 1.09, direction: 'long' },
    });

    expect(trade.journalSessionId).toBe(session.id);
    expect(trade.analysisEventId).toBe(analysis1.id);
    expect(trade.triggerEventId).toBe(trigger.id);
    expect((await db.journalTriggers.get(trigger.id))?.tradeId).toBe(trade.id);
    expect((await db.journalTriggers.get(trigger.id))?.status).toBe('traded');
    expect((await db.journalSessionAnalyses.get(analysis1.id))?.nextTradeId).toBe(trade.id);
    expect((await db.journalSessionAnalyses.get(analysis2.id))?.nextTradeId).toBeNull();
  });

  it('اجازه نمی‌دهد Trigger یا Analysis متعلق به Session دیگری به Trade وصل شود', async () => {
    const first = await seed();
    const second = await journalSessionService.createSession({
      accountId: first.session.accountId,
      tradingBoxId: first.session.tradingBoxId,
      strategyId: first.session.strategyId,
      symbols: ['EURUSD'],
      startTime: Date.now(),
    });
    const [analysis] = await journalSessionService.createAnalysisEvents([{
      sessionId: second.id, timeframeOptionId: first.tf('15M'), analysisText: 'other session',
    }]);
    const trigger = await journalSessionService.createTriggerEvent({ sessionId: second.id, analysisEventId: analysis.id });

    await expect(journalSessionService.createTradeFromSession({
      sessionId: first.session.id, triggerEventId: trigger.id,
    })).rejects.toThrow();

    await expect(journalSessionService.createTradeFromSession({
      sessionId: first.session.id, analysisEventId: analysis.id,
    })).rejects.toThrow();
  });

  it.each(['skipped', 'invalid'] as const)(
    'تریگر با وضعیت %s به معامله تبدیل نمی‌شود',
    async status => {
      const { session, tf } = await seed();
      const trigger = await journalSessionService.createTriggerEvent({
        sessionId: session.id,
        timeframeOptionId: tf('1M'),
        status,
      });

      await expect(journalSessionService.createTradeFromSession({
        sessionId: session.id,
        triggerEventId: trigger.id,
      })).rejects.toThrow(/تریگر/);
      expect(await db.trades.count()).toBe(0);
    },
  );

  it('رسانهٔ تحلیل و تریگر به موجودیت درست وصل می‌شود', async () => {
    const { session, tf } = await seed();
    const [a] = await journalSessionService.createAnalysisEvents([{ sessionId: session.id, timeframeOptionId: tf('4H'), analysisText: 'x' }]);
    const trig = await journalSessionService.createTriggerEvent({ sessionId: session.id });
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    await journalSessionService.saveMedia({ sessionId: session.id, analysisId: a.id, category: 'analysis', file });
    await journalSessionService.saveMedia({ sessionId: session.id, triggerId: trig.id, category: 'trigger', file });
    const media = await journalSessionService.getSessionMedia(session.id);
    expect(media.filter(m => m.analysisId === a.id)).toHaveLength(1);
    expect(media.filter(m => m.triggerId === trig.id)).toHaveLength(1);
    expect(Dexie).toBeDefined();
  });
});
