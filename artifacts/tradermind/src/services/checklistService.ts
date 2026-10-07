/**
 * checklistService — Prompt 26
 * Pre-trade checklist & daily focus/intention/reflection management.
 * Fully offline, IndexedDB via Dexie.
 */

import {
  db, PreTradeChecklist, DailyFocus, ChecklistItemDef,
  NoteImportance, PostTradingReflection,
} from '../db/database';

// ── Helpers ─────────────────────────────────────────────────────────

function parseJSON<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

export const DEFAULT_REFLECTION: PostTradingReflection = {
  mostRelevantReminder: '',
  rulesFollowed: '',
  rulesIgnored: '',
  learned: '',
  rememberTomorrow: '',
};

// ── Starter items for default checklist ──────────────────────────────

const STARTER_ITEMS: Omit<ChecklistItemDef, 'id'>[] = [
  { text: 'آیا ستاپ معتبر است؟',                          priority: 'critical', linkedNoteId: null, order: 0 },
  { text: 'آیا تأیید (confirmation) وجود دارد؟',           priority: 'critical', linkedNoteId: null, order: 1 },
  { text: 'آیا ریسک در محدوده قوانین من است؟',             priority: 'critical', linkedNoteId: null, order: 2 },
  { text: 'آیا سطح ابطال (invalidation) مشخص است؟',       priority: 'high',     linkedNoteId: null, order: 3 },
  { text: 'آیا بر اساس ستاپ وارد می‌شوم یا FOMO؟',         priority: 'high',     linkedNoteId: null, order: 4 },
  { text: 'آیا جهت روند کلی را در نظر گرفتم؟',            priority: 'medium',   linkedNoteId: null, order: 5 },
  { text: 'آیا به معاملات اخیر و حال روحی‌ام توجه کردم؟', priority: 'medium',   linkedNoteId: null, order: 6 },
];

// ── Service ─────────────────────────────────────────────────────────

export const checklistService = {

  // ── Checklists ────────────────────────────────────────────────────

  async getAllChecklists(): Promise<PreTradeChecklist[]> {
    return db.preTradeChecklists.orderBy('createdAt').toArray();
  },

  async getDefaultChecklist(): Promise<PreTradeChecklist | undefined> {
    const all = await db.preTradeChecklists.toArray();
    return all.find(c => c.isDefault);
  },

  async getContextualChecklists(symbol: string, session: string, setup: string): Promise<PreTradeChecklist[]> {
    const all = await db.preTradeChecklists.toArray();
    return all.filter(c => {
      if (c.isDefault) return true;
      const symMatch  = !c.contextSymbol  || c.contextSymbol.toLowerCase()  === symbol.toLowerCase();
      const sessMatch = !c.contextSession || c.contextSession               === session;
      const setupMatch= !c.contextSetup   || c.contextSetup.toLowerCase()   === setup.toLowerCase();
      return symMatch && sessMatch && setupMatch;
    });
  },

  async createChecklist(data: Omit<PreTradeChecklist, 'id' | 'createdAt' | 'updatedAt'>): Promise<PreTradeChecklist> {
    const now = Date.now();
    const checklist: PreTradeChecklist = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await db.preTradeChecklists.add(checklist);
    return checklist;
  },

  async updateChecklist(id: string, data: Partial<PreTradeChecklist>): Promise<void> {
    await db.preTradeChecklists.update(id, { ...data, updatedAt: Date.now() });
  },

  async deleteChecklist(id: string): Promise<void> {
    const c = await db.preTradeChecklists.get(id);
    if (c?.isDefault) throw new Error('نمی‌توان چک‌لیست پیش‌فرض را حذف کرد');
    await db.preTradeChecklists.delete(id);
  },

  async ensureDefaultChecklist(): Promise<PreTradeChecklist> {
    const existing = await checklistService.getDefaultChecklist();
    if (existing) return existing;
    return checklistService.createChecklist({
      name: 'چک‌لیست پیش از معامله',
      contextSymbol: '', contextSession: '', contextSetup: '',
      isDefault: true,
      items: JSON.stringify(
        STARTER_ITEMS.map(item => ({ ...item, id: crypto.randomUUID() }))
      ),
    });
  },

  // ── Items ─────────────────────────────────────────────────────────

  parseItems(itemsJson: string): ChecklistItemDef[] {
    return parseJSON<ChecklistItemDef[]>(itemsJson, []).sort((a, b) => a.order - b.order);
  },

  async addItem(
    checklistId: string, text: string,
    priority: NoteImportance = 'medium',
    linkedNoteId: string | null = null,
  ): Promise<void> {
    const checklist = await db.preTradeChecklists.get(checklistId);
    if (!checklist) return;
    const items = checklistService.parseItems(checklist.items);
    items.push({ id: crypto.randomUUID(), text, priority, linkedNoteId, order: items.length });
    await db.preTradeChecklists.update(checklistId, { items: JSON.stringify(items), updatedAt: Date.now() });
  },

  async updateItem(checklistId: string, itemId: string, updates: Partial<ChecklistItemDef>): Promise<void> {
    const checklist = await db.preTradeChecklists.get(checklistId);
    if (!checklist) return;
    const items = checklistService.parseItems(checklist.items);
    const idx = items.findIndex(i => i.id === itemId);
    if (idx === -1) return;
    items[idx] = { ...items[idx], ...updates };
    await db.preTradeChecklists.update(checklistId, { items: JSON.stringify(items), updatedAt: Date.now() });
  },

  async deleteItem(checklistId: string, itemId: string): Promise<void> {
    const checklist = await db.preTradeChecklists.get(checklistId);
    if (!checklist) return;
    const items = checklistService.parseItems(checklist.items)
      .filter(i => i.id !== itemId)
      .map((item, idx) => ({ ...item, order: idx }));
    await db.preTradeChecklists.update(checklistId, { items: JSON.stringify(items), updatedAt: Date.now() });
  },

  async reorderItems(checklistId: string, items: ChecklistItemDef[]): Promise<void> {
    const reordered = items.map((item, idx) => ({ ...item, order: idx }));
    await db.preTradeChecklists.update(checklistId, { items: JSON.stringify(reordered), updatedAt: Date.now() });
  },

  // ── Daily Focus ───────────────────────────────────────────────────

  async getTodayFocus(): Promise<DailyFocus | null> {
    const today = new Date().toISOString().slice(0, 10);
    return (await db.dailyFocus.where('date').equals(today).first()) ?? null;
  },

  async getFocusByDate(date: string): Promise<DailyFocus | null> {
    return (await db.dailyFocus.where('date').equals(date).first()) ?? null;
  },

  async getAllFocus(limit = 30): Promise<DailyFocus[]> {
    const all = await db.dailyFocus.orderBy('date').reverse().toArray();
    return all.slice(0, limit);
  },

  /**
   * PART 1-5: بروزرسانی Focus و Checklist در یک transaction واحد (Atomic)
   * هر دو عملیات preTradeChecklist update و dailyFocus update
   * با هم در یک تراکنش واحد اجرا می‌شوند.
   */
  async saveTodayFocus(
    intention: string,
    focusNote: string,
    linkedNoteIds: string[],
    checklistId?: string,
    checklistItems?: string,
  ): Promise<DailyFocus> {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await db.dailyFocus.where('date').equals(today).first();
    const now = Date.now();

    return db.transaction('rw', [db.dailyFocus, db.preTradeChecklists], async () => {
      // بروزرسانی preTradeChecklist در صورت وجود
      if (checklistId && checklistItems !== undefined) {
        const checklist = await db.preTradeChecklists.get(checklistId);
        if (checklist) {
          await db.preTradeChecklists.update(checklistId, {
            items: checklistItems,
            updatedAt: now,
          });
        }
      }

      // بروزرسانی یا ایجاد dailyFocus
      if (existing) {
        await db.dailyFocus.update(existing.id, {
          intention, focusNote,
          linkedNoteIds: JSON.stringify(linkedNoteIds),
          updatedAt: now,
        });
        return (await db.dailyFocus.get(existing.id))!;
      }

      const focus: DailyFocus = {
        id: crypto.randomUUID(), date: today,
        intention, focusNote,
        linkedNoteIds: JSON.stringify(linkedNoteIds),
        reviewedAt: null,
        postReflection: JSON.stringify(DEFAULT_REFLECTION),
        createdAt: now, updatedAt: now,
      };
      await db.dailyFocus.add(focus);
      return focus;
    });
  },

  /**
   * نام مستعار برای backward compatibility
   */
  async updateFocusIntentions(
    intention: string,
    focusNote: string,
    linkedNoteIds: string[],
    checklistId?: string,
    checklistItems?: string,
  ): Promise<DailyFocus> {
    return checklistService.saveTodayFocus(
      intention, focusNote, linkedNoteIds, checklistId, checklistItems
    );
  },

  async savePostReflection(date: string, reflection: PostTradingReflection): Promise<void> {
    const focus = await db.dailyFocus.where('date').equals(date).first();
    const now = Date.now();
    if (focus) {
      await db.dailyFocus.update(focus.id, {
        postReflection: JSON.stringify(reflection),
        reviewedAt: now, updatedAt: now,
      });
    } else {
      await db.dailyFocus.add({
        id: crypto.randomUUID(), date,
        intention: '', focusNote: '',
        linkedNoteIds: '[]',
        reviewedAt: now,
        postReflection: JSON.stringify(reflection),
        createdAt: now, updatedAt: now,
      });
    }
  },

  parseReflection(json: string | null | undefined): PostTradingReflection {
    return parseJSON<PostTradingReflection>(json ?? '', DEFAULT_REFLECTION);
  },
};
