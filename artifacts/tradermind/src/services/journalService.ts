import { db, DailyJournal, defaultJournalData } from '../db/database';

/** ادغام داده‌های موجود با مقادیر پیش‌فرض (برای سازگاری با رکوردهای قدیمی) */
function applyDefaults(data: Partial<DailyJournal>): DailyJournal {
  return {
    ...defaultJournalData,
    ...data,
    energyLevel: data.energyLevel ?? (data.energy ?? 5),
    focusLevel: data.focusLevel ?? 5,
    stressLevel: data.stressLevel ?? 3,
    emotions: data.emotions || '[]',
    importantEventsToday: data.importantEventsToday ?? null,
    importantEventsYesterday: data.importantEventsYesterday ?? null,
    preTradingState: data.preTradingState || JSON.stringify({ mood: 3, energy: 5, focus: 5, stress: 3, readiness: 3, notes: '' }),
    endOfDayReview: data.endOfDayReview || JSON.stringify({ didWell: '', didWrong: '', learned: '', followedRules: null }),
    notes: data.notes || '',
    tags: data.tags || '[]',
  } as DailyJournal;
}

export const journalService = {
  async getAllJournals(): Promise<DailyJournal[]> {
    const all = await db.dailyJournals.orderBy('date').reverse().toArray();
    return all.map(applyDefaults);
  },

  async getJournalByDate(date: string): Promise<DailyJournal | undefined> {
    const found = await db.dailyJournals.where('date').equals(date).first();
    return found ? applyDefaults(found) : undefined;
  },

  async getJournalById(id: string): Promise<DailyJournal | undefined> {
    const found = await db.dailyJournals.get(id);
    return found ? applyDefaults(found) : undefined;
  },

  /** دریافت تاریخ همه روزهایی که journal دارند */
  async getJournalDates(): Promise<Set<string>> {
    const journals = await db.dailyJournals.toArray();
    return new Set(journals.map(j => j.date));
  },

  async saveJournal(data: Omit<DailyJournal, 'id' | 'createdAt' | 'updatedAt'>): Promise<DailyJournal> {
    const existing = await db.dailyJournals.where('date').equals(data.date).first();
    const now = Date.now();

    if (existing) {
      await db.dailyJournals.update(existing.id, { ...data, updatedAt: now });
      const updated = await db.dailyJournals.get(existing.id);
      return applyDefaults(updated!);
    } else {
      const id = crypto.randomUUID();
      const journal: DailyJournal = {
        ...defaultJournalData,
        ...data,
        id,
        createdAt: now,
        updatedAt: now,
      };
      await db.dailyJournals.add(journal);
      return applyDefaults(journal);
    }
  },

  async deleteJournal(id: string): Promise<void> {
    await db.dailyJournals.delete(id);
  },
};
