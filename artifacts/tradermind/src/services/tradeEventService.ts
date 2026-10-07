/**
 * tradeEventService.ts  —  Prompt 23
 * CRUD for trade timeline events and data versioning.
 */

import { db, TradeEvent, TradeEventType, TradeVersion, TradeVersionChange, Trade } from '../db/database';

// ─── Trade Events (Timeline) ──────────────────────────────────────────────────

export const tradeEventService = {

  async getEventsForTrade(tradeId: string): Promise<TradeEvent[]> {
    return db.tradeEvents
      .where('tradeId')
      .equals(tradeId)
      .sortBy('timestamp');
  },

  async addEvent(data: Omit<TradeEvent, 'id' | 'createdAt'>): Promise<TradeEvent> {
    const event: TradeEvent = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    await db.tradeEvents.add(event);
    return event;
  },

  async updateEvent(id: string, data: Partial<Omit<TradeEvent, 'id' | 'createdAt'>>): Promise<void> {
    await db.tradeEvents.update(id, data);
  },

  async deleteEvent(id: string): Promise<void> {
    await db.tradeEvents.delete(id);
  },

  /** رویدادهای پیش‌فرض را بر اساس داده‌های معامله می‌سازد */
  async syncDefaultEvents(trade: Trade): Promise<void> {
    const existing = await db.tradeEvents.where('tradeId').equals(trade.id).toArray();
    const entryEvent = existing.find(e => e.eventType === 'entry');
    const exitEvent = existing.find(e => e.eventType === 'exit');

    if (!entryEvent) {
      await db.tradeEvents.add({
        id: crypto.randomUUID(),
        tradeId: trade.id,
        eventType: 'entry',
        timestamp: trade.openedAt,
        description: `ورود به ${trade.symbol} (${trade.direction === 'long' ? 'خرید' : 'فروش'}) @ ${trade.entryPrice}`,
        price: trade.entryPrice,
        data: null,
        createdAt: Date.now(),
      });
    }

    if (trade.closedAt && trade.exitPrice != null && !exitEvent) {
      await db.tradeEvents.add({
        id: crypto.randomUUID(),
        tradeId: trade.id,
        eventType: 'exit',
        timestamp: trade.closedAt,
        description: `خروج از ${trade.symbol} @ ${trade.exitPrice}${trade.result ? ` — ${trade.result}` : ''}`,
        price: trade.exitPrice,
        data: null,
        createdAt: Date.now(),
      });
    }
  },

  getEventTypeLabel(type: TradeEventType): string {
    const labels: Record<TradeEventType, string> = {
      'entry':           'ورود',
      'exit':            'خروج',
      'sl-move':         'جابجایی حد ضرر',
      'tp-move':         'جابجایی حد سود',
      'partial-close':   'بستن بخشی از پوزیشن',
      'add-to-position': 'افزودن به پوزیشن',
      'reduce-position': 'کاهش پوزیشن',
      'manual-exit':     'خروج دستی',
      'note':            'یادداشت',
      'screenshot':      'اسکرین‌شات',
    };
    return labels[type] ?? type;
  },

  getEventTypeIcon(type: TradeEventType): string {
    const icons: Record<TradeEventType, string> = {
      'entry': '🟢', 'exit': '🔴', 'sl-move': '🛡️',
      'tp-move': '🎯', 'partial-close': '✂️', 'add-to-position': '➕',
      'reduce-position': '➖', 'manual-exit': '🚪', 'note': '📝', 'screenshot': '📸',
    };
    return icons[type] ?? '•';
  },
};

// ─── Trade Versioning ─────────────────────────────────────────────────────────

const VERSIONED_FIELDS: { key: keyof Trade; label: string }[] = [
  { key: 'entryPrice',   label: 'قیمت ورود' },
  { key: 'exitPrice',    label: 'قیمت خروج' },
  { key: 'stopLoss',     label: 'حد ضرر' },
  { key: 'takeProfit',   label: 'حد سود' },
  { key: 'result',       label: 'نتیجه' },
  { key: 'profitLoss',   label: 'سود/زیان' },
  { key: 'rMultiple',    label: 'R Multiple' },
  { key: 'riskPercentage', label: 'درصد ریسک' },
  { key: 'positionSize', label: 'حجم پوزیشن' },
  { key: 'status',       label: 'وضعیت' },
];

export const tradeVersionService = {

  /** قبل از هر آپدیت فراخوانی می‌شود تا تغییرات مهم ثبت شوند */
  async recordVersion(oldTrade: Trade, newData: Partial<Trade>): Promise<void> {
    const changes: TradeVersionChange[] = [];
    for (const { key, label } of VERSIONED_FIELDS) {
      const oldVal = oldTrade[key];
      const newVal = newData[key];
      if (newVal !== undefined && newVal !== oldVal) {
        changes.push({ field: key as string, label, oldValue: oldVal, newValue: newVal });
      }
    }
    if (changes.length === 0) return;

    const version: TradeVersion = {
      id: crypto.randomUUID(),
      tradeId: oldTrade.id,
      changedAt: Date.now(),
      changes: JSON.stringify(changes),
      snapshot: JSON.stringify(oldTrade),
    };
    await db.tradeVersions.add(version);
  },

  async getVersionsForTrade(tradeId: string): Promise<TradeVersion[]> {
    const versions = await db.tradeVersions
      .where('tradeId')
      .equals(tradeId)
      .toArray();
    return versions.sort((a, b) => b.changedAt - a.changedAt);
  },

  async deleteVersionsForTrade(tradeId: string): Promise<void> {
    await db.tradeVersions.where('tradeId').equals(tradeId).delete();
  },

  parseChanges(version: TradeVersion): TradeVersionChange[] {
    try { return JSON.parse(version.changes); } catch { return []; }
  },

  parseSnapshot(version: TradeVersion): Trade | null {
    try { return JSON.parse(version.snapshot); } catch { return null; }
  },
};
