import { db, Trade, defaultPostTradeReview } from '../db/database';
import { isWin, isClosed, getNetPnl } from '../lib/tradeHelpers';
import { strategyService } from './strategyService';
import { analysisService } from './analysisService';
import { tradeVersionService, tradeEventService } from './tradeEventService';
import { detectTradingSession } from '../lib/tradeClassification';
import { getTradingDateRange } from '../lib/tradingTime';

const defaultReview = JSON.stringify({ didWell: '', didWrong: '', learned: '', wouldTakeAgain: null, validSetup: null });
const defaultPostTradeReviewStr = JSON.stringify(defaultPostTradeReview);

/**
 * IndexedDB updates for the same trade are serialized here instead of relying
 * on whichever renderer event happens to reach Dexie first.  The queue only
 * coordinates updates; it never turns an update into a create.
 */
const tradeUpdateQueues = new Map<string, Promise<void>>();

async function serializeTradeUpdate<T>(tradeId: string, operation: () => Promise<T>): Promise<T> {
  const previous = tradeUpdateQueues.get(tradeId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => current);
  tradeUpdateQueues.set(tradeId, tail);

  try {
    await previous;
    return await operation();
  } finally {
    release();
    if (tradeUpdateQueues.get(tradeId) === tail) tradeUpdateQueues.delete(tradeId);
  }
}

export const tradeService = {
  async getAllTrades() {
    return db.trades.orderBy('openedAt').reverse().toArray();
  },

  async getTradeById(id: string) {
    return db.trades.get(id);
  },

  /**
   * PART 1-1: ایجاد معامله در یک transaction واحد (Atomic)
   * trade + tradeEvent اولیه + tradeVersion اولیه همزمان ثبت می‌شوند
   */
  async createTrade(data: Partial<Trade> = {}): Promise<Trade> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const linkedJournalSession = data.journalSessionId
      ? await db.journalSessions.get(data.journalSessionId)
      : undefined;
    if (data.journalSessionId && !linkedJournalSession) {
      throw new Error('سشن ژورنال برای اتصال معامله پیدا نشد.');
    }
    let sessionSymbol: string | undefined;
    if (linkedJournalSession) {
      try {
        const symbols = JSON.parse(linkedJournalSession.symbols) as unknown;
        sessionSymbol = Array.isArray(symbols) ? symbols.find((value): value is string => typeof value === 'string') : undefined;
      } catch { /* a malformed optional symbol list must not block trade creation */ }
    }
    // تنظیمات پیش‌فرض از localStorage خوانده می‌شوند تا سرویس دیتابیس
    // به React وابسته نباشد و در Electron/Capacitor هم یکسان کار کند.
    let defaults: Partial<Trade> = {};
    try {
      const stored = JSON.parse(localStorage.getItem('tradermind-app-storage') ?? '{}')?.state;
      defaults = {
        accountId: stored?.defaultAccountId ?? null,
        boxId: stored?.defaultTradingBoxId ?? null,
        symbol: stored?.defaultSymbol ?? '',
        market: stored?.defaultMarket ?? null,
      };
    } catch { /* تنظیمات خراب نباید ثبت معامله را متوقف کند */ }

    // تنظیمات ممکن است به حساب یا باکسی اشاره کنند که بعداً حذف شده است.
    // در این حالت معامله جدید باید بدون شناسه‌ی نامعتبر ساخته شود.
    const [defaultAccount, defaultBox] = await Promise.all([
      defaults.accountId ? db.accounts.get(defaults.accountId) : Promise.resolve(undefined),
      defaults.boxId ? db.tradingBoxes.get(defaults.boxId) : Promise.resolve(undefined),
    ]);
    defaults.accountId = linkedJournalSession?.accountId ?? (defaultAccount && !defaultAccount.isArchived ? defaultAccount.id : null);
    defaults.boxId = linkedJournalSession?.tradingBoxId ?? defaultBox?.id ?? null;
    defaults.strategyId = linkedJournalSession?.strategyId ?? null;
    if (sessionSymbol) defaults.symbol = sessionSymbol;

    const trade: Trade = {
      sessionId: null, market: null,
      direction: 'long', entryPrice: 0, exitPrice: null, stopLoss: 0,
      takeProfit: null, positionSize: null, riskPercentage: null, riskAmount: null,
      rMultiple: null, result: 'open', profitLoss: null, fees: null, commission: null, spread: null, swap: null, status: 'open',
      openedAt: now, closedAt: null, reasonForExit: null,
      emotions: '[]', emotionNotes: null, notes: null,
      screenshots: '[]', adherenceScore: null, adherenceRating: null,
      adherenceNotes: null, review: defaultReview, postTradeReview: defaultPostTradeReviewStr,
      tags: '[]', liveMonitoring: null, createdAt: now,
      plannedEntry: null, plannedSL: null, plannedTP: null, plannedRR: null,
      plannedRisk: null, plannedPositionSize: null,
      setupType: null, timezone: null,
      entryReason: null, lesson: null,
      slMoved: null, tpMoved: null, partialClose: null, addedToPosition: null,
      reducedPosition: null, manualExit: null, managementReason: null,
       mtfAnalysis: null, preTradeBriefing: null,
      ...defaults,
      ...data,
      id,
      journalSessionId: linkedJournalSession?.id ?? data.journalSessionId ?? null,
      accountId: linkedJournalSession?.accountId ?? data.accountId ?? defaults.accountId ?? null,
      boxId: linkedJournalSession?.tradingBoxId ?? data.boxId ?? defaults.boxId ?? null,
      strategyId: linkedJournalSession?.strategyId ?? data.strategyId ?? null,
      symbol: data.symbol || defaults.symbol || '',
      tradingSession: data.tradingSession ?? detectTradingSession(data.openedAt ?? now),
    };

    await db.transaction('rw', [db.trades, db.tradeEvents, db.tradeVersions], async () => {
      // 1. ثبت معامله
      await db.trades.add(trade);

      // 2. ثبت رویداد اولیه (entry event)
      await db.tradeEvents.add({
        id: crypto.randomUUID(),
        tradeId: id,
        eventType: 'entry',
        timestamp: trade.openedAt,
        description: `ورود به ${trade.symbol || '—'} (${trade.direction === 'long' ? 'خرید' : 'فروش'}) @ ${trade.entryPrice}`,
        price: trade.entryPrice,
        data: null,
        createdAt: now,
      });

      // 3. ثبت نسخه اولیه
      await db.tradeVersions.add({
        id: crypto.randomUUID(),
        tradeId: id,
        changedAt: now,
        changes: JSON.stringify([{ field: 'status', label: 'وضعیت', oldValue: null, newValue: 'open' }]),
        snapshot: JSON.stringify(trade),
      });
    });

    return trade;
  },

  /**
   * PART 1-2: بروزرسانی معامله + ثبت نسخه در یک transaction واحد (Atomic)
   */
  async updateTrade(id: string, data: Partial<Trade>) {
    const tradeId = typeof id === 'string' ? id.trim() : '';
    if (!tradeId) {
      throw new Error('UPDATE requires an existing trade ID');
    }

    const operationId = crypto.randomUUID();
    console.debug('[TradeSave]', {
      mode: 'UPDATE',
      tradeId,
      source: 'tradeService',
      operationId,
      timestamp: Date.now(),
    });

    return serializeTradeUpdate(tradeId, async () => {
      const existing = await db.trades.get(tradeId);
      if (!existing) {
        const error = new Error(`Trade "${tradeId}" no longer exists; refusing to create during UPDATE`);
        console.error('[TradeSave] rejected missing UPDATE target', { tradeId, operationId });
        throw error;
      }

      // The primary key is owned by the database identity, never by an edit
      // payload.  This makes accidental ID replacement impossible.
      const { id: _ignoredId, ...editableData } = data as Partial<Trade> & { id?: string };

      await db.transaction('rw', [db.trades, db.tradeVersions, db.tradeEvents], async () => {
        await db.trades.update(tradeId, editableData);

        // ثبت نسخه در صورت تغییر فیلدهای مهم
        await tradeVersionService.recordVersion(existing, editableData);

        // اگر معامله بسته شد، رویداد exit اضافه کن
        if (editableData.status === 'closed' && editableData.exitPrice != null && editableData.closedAt != null) {
          const hasExitEvent = await db.tradeEvents
            .where('tradeId').equals(tradeId)
            .filter(e => e.eventType === 'exit')
            .count();
          if (hasExitEvent === 0) {
            await db.tradeEvents.add({
              id: crypto.randomUUID(),
              tradeId,
              eventType: 'exit',
              timestamp: editableData.closedAt,
              description: `خروج از ${existing.symbol} @ ${editableData.exitPrice}${editableData.result ? ` — ${editableData.result}` : ''}`,
              price: editableData.exitPrice,
              data: null,
              createdAt: Date.now(),
            });
          }
        }
      });

      return db.trades.get(tradeId);
    });
  },

  /**
   * PART 1-3: حذف cascade معامله در یک transaction واحد (Atomic)
   * trades + tradeEvents + tradeVersions + riskViolations + chartScreenshots + learningAuditTrail
   * همچنین marketContextSessions که linkedTradeId آن معامله است unlink می‌شوند
   */
  async deleteTrade(id: string) {
    await db.transaction(
      'rw',
      [
        db.trades,
        db.tradeEvents,
        db.tradeVersions,
        db.riskViolations,
        db.chartScreenshots,
        db.learningAuditTrail,
        db.marketContextSessions,
        db.journalTradeData,
        db.journalMedia,
        db.journalTriggers,
        db.journalSessionAnalyses,
      ],
      async () => {
        // حذف رکوردهای وابسته
        await db.tradeEvents.where('tradeId').equals(id).delete();
        await db.tradeVersions.where('tradeId').equals(id).delete();
        await db.riskViolations.where('tradeId').equals(id).delete();
        await db.chartScreenshots.where('tradeId').equals(id).delete();
        await db.learningAuditTrail.where('tradeId').equals(id).delete();
        await db.journalTradeData.where('tradeId').equals(id).delete();
        await db.journalMedia.where('tradeId').equals(id).delete();

        // تریگر و تحلیل به‌عنوان رویداد سشن باقی می‌مانند؛ فقط ارجاع به معاملهٔ حذف‌شده پاک می‌شود
        const linkedTriggers = await db.journalTriggers.where('tradeId').equals(id).toArray();
        for (const trigger of linkedTriggers) {
          await db.journalTriggers.update(trigger.id, { tradeId: null, status: 'confirmed', updatedAt: Date.now() });
        }
        const linkedAnalyses = await db.journalSessionAnalyses.filter(a => a.nextTradeId === id || a.previousTradeId === id).toArray();
        for (const analysis of linkedAnalyses) {
          await db.journalSessionAnalyses.update(analysis.id, {
            nextTradeId: analysis.nextTradeId === id ? null : analysis.nextTradeId,
            previousTradeId: analysis.previousTradeId === id ? null : analysis.previousTradeId,
          });
        }

        // unlink کردن marketContextSessions بدون حذف آن‌ها
        const linkedSessions = await db.marketContextSessions
          .where('linkedTradeId').equals(id).toArray();
        for (const session of linkedSessions) {
          await db.marketContextSessions.update(session.id, { linkedTradeId: null });
        }

        // حذف خود معامله
        await db.trades.delete(id);
      }
    );
  },

  async computeAdherenceScore(sessionId: string): Promise<number | null> {
    try {
      const session = await analysisService.getSessionById(sessionId);
      if (!session) return null;
      const stepResults = JSON.parse(session.stepResults || '{}');
      const phases = await strategyService.getPhasesByStrategyId(session.strategyId);
      let required = 0, answered = 0;
      for (const phase of phases) {
        const steps = await strategyService.getStepsByPhaseId(phase.id);
        for (const step of steps) {
          if (step.required) {
            required++;
            const res = stepResults[step.id];
            if (res && res.value !== null && res.value !== undefined && res.value !== '' && res.value !== false) answered++;
          }
        }
      }
      return required === 0 ? 100 : Math.round((answered / required) * 100);
    } catch { return null; }
  },

  async getStats() {
    const trades = await db.trades.toArray();
    const closed = trades.filter(isClosed);
    const wins = closed.filter(isWin);
    const withR = closed.filter(t => t.rMultiple != null);
    return {
      total: trades.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalPnl: trades.reduce((acc, t) => acc + (getNetPnl(t) ?? 0), 0),
      avgRMultiple: withR.length > 0 ? withR.reduce((acc, t) => acc + (t.rMultiple || 0), 0) / withR.length : 0,
      closedCount: closed.length,
      openCount: trades.filter(t => t.status === 'open').length,
    };
  },

  async getTradesWithFilters(filters: {
    search?: string; result?: string; direction?: string; strategyId?: string;
    emotion?: string; adherenceRating?: string; dateFrom?: number; dateTo?: number;
    accountId?: string; boxId?: string;
  } = {}) {
    let trades = await db.trades.orderBy('openedAt').reverse().toArray();
    if (filters.search) { const s = filters.search.toLowerCase(); trades = trades.filter(t => t.symbol.toLowerCase().includes(s)); }
    if (filters.result && filters.result !== 'all') trades = trades.filter(t => t.result === filters.result);
    if (filters.direction && filters.direction !== 'all') trades = trades.filter(t => t.direction === filters.direction);
    if (filters.strategyId && filters.strategyId !== 'all') trades = trades.filter(t => t.strategyId === filters.strategyId);
    if (filters.emotion && filters.emotion !== 'all') {
      trades = trades.filter(t => { try { return (JSON.parse(t.emotions) as string[]).includes(filters.emotion!); } catch { return false; } });
    }
    if (filters.adherenceRating && filters.adherenceRating !== 'all') trades = trades.filter(t => t.adherenceRating === filters.adherenceRating);
    if (filters.dateFrom) trades = trades.filter(t => t.openedAt >= filters.dateFrom!);
    if (filters.dateTo) trades = trades.filter(t => t.openedAt <= filters.dateTo!);
    if (filters.accountId && filters.accountId !== 'all') {
      if (filters.accountId === 'none_set') trades = trades.filter(t => !(t as unknown as Record<string, unknown>)['accountId']);
      else trades = trades.filter(t => (t as unknown as Record<string, unknown>)['accountId'] === filters.accountId);
    }
    if (filters.boxId && filters.boxId !== 'all') {
      if (filters.boxId === 'none_set') trades = trades.filter(t => !(t as unknown as Record<string, unknown>)['boxId']);
      else trades = trades.filter(t => (t as unknown as Record<string, unknown>)['boxId'] === filters.boxId);
    }
    return trades;
  },

  async getTradesByDate(dateStr: string): Promise<Trade[]> {
    // بازهٔ روز بر اساس «مبنای زمانی» انتخاب‌شده (ساعت دستگاه یا بروکر) تا با
    // گروه‌بندی تاریخ در بقیهٔ برنامه یکی باشد؛ انتهای روز هم کامل (تا ۲۳:۵۹:۵۹٫۹۹۹) است.
    const { from, to } = getTradingDateRange(dateStr);
    if (Number.isNaN(from) || Number.isNaN(to)) return [];
    return db.trades
      .where('openedAt')
      .between(from, to, true, true)
      .toArray();
  },
};

// re-export for backward compat
export { tradeEventService };
