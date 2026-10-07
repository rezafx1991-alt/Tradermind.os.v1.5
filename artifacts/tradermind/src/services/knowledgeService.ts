import {
  db,
  KnowledgeNote, KnowledgeCategory,
  NoteImportance, NoteSource, NoteStatus, ReviewFrequency,
  NoteEvidence, NoteUserFeedback,
  DEFAULT_CATEGORY_COLORS,
  PostTradeReviewData,
} from '../db/database';

// ── Default categories ──────────────────────────────────────────────

const DEFAULT_CATEGORIES: Omit<KnowledgeCategory, 'createdAt'>[] = [
  { id: 'trading-rules',       name: 'قوانین معاملاتی',   icon: '📋', color: DEFAULT_CATEGORY_COLORS['trading-rules'],       isDefault: true },
  { id: 'entry-rules',         name: 'قوانین ورود',        icon: '🎯', color: DEFAULT_CATEGORY_COLORS['entry-rules'],         isDefault: true },
  { id: 'exit-rules',          name: 'قوانین خروج',        icon: '🏁', color: DEFAULT_CATEGORY_COLORS['exit-rules'],          isDefault: true },
  { id: 'risk-management',     name: 'مدیریت ریسک',        icon: '🛡️', color: DEFAULT_CATEGORY_COLORS['risk-management'],     isDefault: true },
  { id: 'market-observations', name: 'مشاهدات بازار',      icon: '🔭', color: DEFAULT_CATEGORY_COLORS['market-observations'], isDefault: true },
  { id: 'setup-reminders',     name: 'یادآوری ستاپ',       icon: '⚙️', color: DEFAULT_CATEGORY_COLORS['setup-reminders'],     isDefault: true },
  { id: 'symbol-reminders',    name: 'یادآوری نماد',       icon: '💹', color: DEFAULT_CATEGORY_COLORS['symbol-reminders'],    isDefault: true },
  { id: 'session-reminders',   name: 'یادآوری سشن',        icon: '🕐', color: DEFAULT_CATEGORY_COLORS['session-reminders'],   isDefault: true },
  { id: 'mistakes',            name: 'اشتباهات',           icon: '❌', color: DEFAULT_CATEGORY_COLORS['mistakes'],            isDefault: true },
  { id: 'strengths',           name: 'نقاط قوت',           icon: '💪', color: DEFAULT_CATEGORY_COLORS['strengths'],           isDefault: true },
  { id: 'lessons-learned',     name: 'درس‌های آموخته',     icon: '📚', color: DEFAULT_CATEGORY_COLORS['lessons-learned'],     isDefault: true },
  { id: 'ai-insights',         name: 'بینش‌های هوش مصنوعی',icon: '🤖', color: DEFAULT_CATEGORY_COLORS['ai-insights'],         isDefault: true },
  // Prompt 26 — new knowledge types
  { id: 'warnings',            name: 'هشدارها',            icon: '⚠️', color: DEFAULT_CATEGORY_COLORS['warnings'],            isDefault: true },
  { id: 'market-patterns',     name: 'الگوهای بازار',      icon: '📊', color: DEFAULT_CATEGORY_COLORS['market-patterns'],     isDefault: true },
  { id: 'personal-principles', name: 'اصول شخصی',          icon: '🌟', color: DEFAULT_CATEGORY_COLORS['personal-principles'], isDefault: true },
  { id: 'observations',        name: 'مشاهدات شخصی',       icon: '👁️', color: DEFAULT_CATEGORY_COLORS['observations'],        isDefault: true },
];

async function ensureDefaultCategories() {
  const existing = await db.knowledgeCategories.count();
  if (existing === 0) {
    const now = Date.now();
    await db.knowledgeCategories.bulkAdd(
      DEFAULT_CATEGORIES.map(c => ({ ...c, createdAt: now }))
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function parseJSON<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

function blankNote(): Omit<KnowledgeNote, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: '', content: '', category: 'trading-rules',
    importance: 'medium', color: '#6b7280',
    tags: '[]', relatedSymbols: '[]', relatedSetups: '[]',
    relatedStrategies: '[]', relatedSessions: '[]',
    relatedMarketRegimes: '[]', relatedTimeframes: '[]', relatedDays: '[]',
    source: 'manual', status: 'active', isActive: true,
    isPinned: false, isRule: false,
    reviewCount: 0, lastReviewedAt: null, nextReviewAt: null,
    reviewFrequency: 'as-needed', userFeedback: null, evidence: null,
    requireConfirmation: false, snoozedUntil: null,
  };
}

// ── Daily briefing context ─────────────────────────────────────────

export interface BriefingContext {
  symbol?: string;
  session?: string;       // 'london' | 'newyork' | 'asian'
  strategyId?: string;
  mode: 'quick' | 'standard' | 'deep';
}

export interface BriefingSection {
  key: string;
  label: string;
  notes: KnowledgeNote[];
  reason: string;
}

// ── Score calculator for briefing ────────────────────────────────

function scoreNoteForBriefing(note: KnowledgeNote, ctx: BriefingContext, dayOfWeek: number): number {
  let score = 0;

  // Importance base
  const imp: Record<NoteImportance, number> = { critical: 100, high: 70, medium: 40, low: 15 };
  score += imp[note.importance] ?? 20;

  // Pinned bonus
  if (note.isPinned) score += 30;

  // Symbol relevance
  const syms = parseJSON<string[]>(note.relatedSymbols, []);
  if (ctx.symbol && syms.length && syms.some(s => s.toLowerCase() === ctx.symbol!.toLowerCase())) score += 50;

  // Session relevance
  const sessions = parseJSON<string[]>(note.relatedSessions, []);
  if (ctx.session && sessions.length && sessions.includes(ctx.session)) score += 40;

  // Day relevance
  const days = parseJSON<number[]>(note.relatedDays, []);
  if (days.length && days.includes(dayOfWeek)) score += 30;

  // Strategy relevance
  const strats = parseJSON<string[]>(note.relatedStrategies, []);
  if (ctx.strategyId && strats.length && strats.includes(ctx.strategyId)) score += 35;

  // Review staleness — notes not reviewed recently get priority
  const daysSinceReview = note.lastReviewedAt
    ? (Date.now() - note.lastReviewedAt) / 86_400_000
    : 999;
  if (daysSinceReview > 7) score += 20;
  else if (daysSinceReview > 3) score += 10;

  // Mistakes category: boost recent
  if (note.category === 'mistakes' || note.category === 'ai-insights') score += 10;

  // User feedback downgrade
  const fb = parseJSON<NoteUserFeedback | null>(note.userFeedback, null);
  if (fb?.rating === 'not-relevant' || fb?.rating === 'incorrect') score -= 40;
  if (fb?.rating === 'important') score += 25;

  return score;
}

// ── Main service ──────────────────────────────────────────────────

export const knowledgeService = {

  // ── Categories ──────────────────────────────────────────────────

  async getCategories(): Promise<KnowledgeCategory[]> {
    await ensureDefaultCategories();
    return db.knowledgeCategories.orderBy('createdAt').toArray();
  },

  async createCategory(data: Omit<KnowledgeCategory, 'id' | 'createdAt'>): Promise<KnowledgeCategory> {
    const cat: KnowledgeCategory = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    await db.knowledgeCategories.add(cat);
    return cat;
  },

  async deleteCategory(id: string): Promise<void> {
    const cat = await db.knowledgeCategories.get(id);
    if (cat?.isDefault) throw new Error('نمی‌توان دسته‌بندی پیش‌فرض را حذف کرد');
    await db.knowledgeCategories.delete(id);
  },

  // ── Notes CRUD ──────────────────────────────────────────────────

  async getAllNotes(filters: {
    search?: string;
    category?: string;
    importance?: NoteImportance | 'all';
    source?: NoteSource | 'all';
    status?: NoteStatus | 'all';
    isRule?: boolean;
    isActive?: boolean;
    symbol?: string;
    session?: string;
    tags?: string[];
  } = {}): Promise<KnowledgeNote[]> {
    let notes = await db.knowledgeNotes.orderBy('createdAt').reverse().toArray();
    const now = Date.now();

    // Filter snoozed
    notes = notes.filter(n => !n.snoozedUntil || n.snoozedUntil < now);

    if (filters.category && filters.category !== 'all') {
      notes = notes.filter(n => n.category === filters.category);
    }
    if (filters.importance && filters.importance !== 'all') {
      notes = notes.filter(n => n.importance === filters.importance);
    }
    if (filters.source && filters.source !== 'all') {
      notes = notes.filter(n => n.source === filters.source);
    }
    if (filters.status && filters.status !== 'all') {
      notes = notes.filter(n => n.status === filters.status);
    }
    if (filters.isRule !== undefined) {
      notes = notes.filter(n => n.isRule === filters.isRule);
    }
    if (filters.isActive !== undefined) {
      notes = notes.filter(n => n.isActive === filters.isActive);
    }
    if (filters.symbol) {
      const sym = filters.symbol.toLowerCase();
      notes = notes.filter(n => {
        const syms = parseJSON<string[]>(n.relatedSymbols, []);
        return syms.some(s => s.toLowerCase().includes(sym));
      });
    }
    if (filters.session) {
      notes = notes.filter(n => {
        const sessions = parseJSON<string[]>(n.relatedSessions, []);
        return sessions.includes(filters.session!);
      });
    }
    if (filters.tags?.length) {
      notes = notes.filter(n => {
        const noteTags = parseJSON<string[]>(n.tags, []);
        return filters.tags!.every(t => noteTags.includes(t));
      });
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        parseJSON<string[]>(n.tags, []).some(t => t.toLowerCase().includes(q))
      );
    }

    return notes;
  },

  async getNoteById(id: string): Promise<KnowledgeNote | undefined> {
    return db.knowledgeNotes.get(id);
  },

  async createNote(data: Partial<KnowledgeNote> = {}): Promise<KnowledgeNote> {
    const now = Date.now();
    const note: KnowledgeNote = {
      ...blankNote(),
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await db.knowledgeNotes.add(note);
    return note;
  },

  async updateNote(id: string, data: Partial<KnowledgeNote>): Promise<KnowledgeNote | undefined> {
    await db.knowledgeNotes.update(id, { ...data, updatedAt: Date.now() });
    return db.knowledgeNotes.get(id);
  },

  async deleteNote(id: string): Promise<void> {
    await db.knowledgeNotes.delete(id);
  },

  async markReviewed(id: string): Promise<void> {
    const note = await db.knowledgeNotes.get(id);
    if (!note) return;
    const freq: Record<ReviewFrequency, number> = {
      daily: 1, weekly: 7, monthly: 30, 'as-needed': 0,
    };
    const days = freq[note.reviewFrequency] || 0;
    await db.knowledgeNotes.update(id, {
      reviewCount: (note.reviewCount || 0) + 1,
      lastReviewedAt: Date.now(),
      nextReviewAt: days > 0 ? Date.now() + days * 86_400_000 : null,
      updatedAt: Date.now(),
    });
  },

  async snoozeNote(id: string, days: number): Promise<void> {
    await db.knowledgeNotes.update(id, {
      snoozedUntil: Date.now() + days * 86_400_000,
      updatedAt: Date.now(),
    });
  },

  async archiveNote(id: string): Promise<void> {
    await db.knowledgeNotes.update(id, {
      status: 'archived', isActive: false, updatedAt: Date.now(),
    });
  },

  async pinNote(id: string, pinned: boolean): Promise<void> {
    await db.knowledgeNotes.update(id, { isPinned: pinned, updatedAt: Date.now() });
  },

  async toggleActive(id: string, active: boolean): Promise<void> {
    await db.knowledgeNotes.update(id, { isActive: active, updatedAt: Date.now() });
  },

  async submitFeedback(id: string, rating: NoteUserFeedback['rating'], note: string): Promise<void> {
    const feedback: NoteUserFeedback = { rating, note, ratedAt: Date.now() };
    let newStatus: NoteStatus | undefined;
    if (rating === 'correct' || rating === 'important') newStatus = 'confirmed';
    else if (rating === 'not-relevant' || rating === 'incorrect') newStatus = 'outdated';
    await db.knowledgeNotes.update(id, {
      userFeedback: JSON.stringify(feedback),
      ...(newStatus ? { status: newStatus } : {}),
      updatedAt: Date.now(),
    });
  },

  // ── Duplicate detection ─────────────────────────────────────────

  async findSimilarNotes(title: string, content: string, excludeId?: string): Promise<KnowledgeNote[]> {
    const all = await db.knowledgeNotes.toArray();
    const query = (title + ' ' + content).toLowerCase();
    const queryWords = query.split(/\s+/).filter(w => w.length > 2);

    return all.filter(n => {
      if (n.id === excludeId) return false;
      if (n.status === 'archived') return false;
      const noteText = (n.title + ' ' + n.content).toLowerCase();
      const matchCount = queryWords.filter(w => noteText.includes(w)).length;
      const similarity = queryWords.length > 0 ? matchCount / queryWords.length : 0;
      return similarity >= 0.4;
    });
  },

  async mergeNotes(targetId: string, sourceId: string): Promise<void> {
    const [target, source] = await Promise.all([
      db.knowledgeNotes.get(targetId),
      db.knowledgeNotes.get(sourceId),
    ]);
    if (!target || !source) return;

    const mergedTags = Array.from(new Set([
      ...parseJSON<string[]>(target.tags, []),
      ...parseJSON<string[]>(source.tags, []),
    ]));
    const mergedSymbols = Array.from(new Set([
      ...parseJSON<string[]>(target.relatedSymbols, []),
      ...parseJSON<string[]>(source.relatedSymbols, []),
    ]));

    // Merge evidence if source is AI
    let mergedEvidence = target.evidence;
    if (source.evidence) {
      const srcEv = parseJSON<NoteEvidence | null>(source.evidence, null);
      const tgtEv = parseJSON<NoteEvidence | null>(target.evidence, null);
      if (srcEv && tgtEv) {
        const merged: NoteEvidence = {
          ...tgtEv,
          supportingTradeIds: Array.from(new Set([...tgtEv.supportingTradeIds, ...srcEv.supportingTradeIds])),
          sampleSize: tgtEv.sampleSize + srcEv.sampleSize,
          description: tgtEv.description + '\n\n[ادغام]: ' + srcEv.description,
        };
        mergedEvidence = JSON.stringify(merged);
      } else if (srcEv) {
        mergedEvidence = source.evidence;
      }
    }

    await db.knowledgeNotes.update(targetId, {
      tags: JSON.stringify(mergedTags),
      relatedSymbols: JSON.stringify(mergedSymbols),
      evidence: mergedEvidence,
      updatedAt: Date.now(),
    });
    await db.knowledgeNotes.delete(sourceId);
  },

  // ── Daily briefing ─────────────────────────────────────────────

  async generateDailyBriefing(ctx: BriefingContext): Promise<BriefingSection[]> {
    const now = Date.now();
    const dayOfWeek = new Date().getDay();

    const all = await db.knowledgeNotes.toArray();

    // Filter: active, not archived, not snoozed
    const eligible = all.filter(n =>
      n.status !== 'archived' &&
      (!n.snoozedUntil || n.snoozedUntil < now)
    );

    // Score and sort
    const scored = eligible
      .map(n => ({ note: n, score: scoreNoteForBriefing(n, ctx, dayOfWeek) }))
      .sort((a, b) => b.score - a.score);

    const limit = ctx.mode === 'quick' ? 5 : ctx.mode === 'standard' ? 10 : 999;

    // Build sections
    const sections: BriefingSection[] = [];

    // 1. Critical rules (always shown)
    const critical = scored
      .filter(s => s.note.importance === 'critical')
      .slice(0, ctx.mode === 'quick' ? 3 : 5)
      .map(s => s.note);
    if (critical.length) {
      sections.push({ key: 'critical', label: 'قوانین حیاتی', notes: critical, reason: 'قوانین ضروری که باید همیشه مرور شوند' });
    }

    // 2. Recent mistakes
    const mistakes = scored
      .filter(s => s.note.category === 'mistakes' && s.note.importance !== 'low')
      .slice(0, 3)
      .map(s => s.note);
    if (mistakes.length) {
      sections.push({ key: 'mistakes', label: 'اشتباهات اخیر', notes: mistakes, reason: 'اشتباهاتی که باید از تکرار آن‌ها جلوگیری شود' });
    }

    // 3. Session-specific
    if (ctx.session) {
      const sessionNotes = scored
        .filter(s => {
          const sessions = parseJSON<string[]>(s.note.relatedSessions, []);
          return sessions.includes(ctx.session!);
        })
        .slice(0, 3)
        .map(s => s.note);
      if (sessionNotes.length) {
        const sessionNames: Record<string, string> = { london: 'لندن', newyork: 'نیویورک', asian: 'آسیا' };
        sections.push({ key: 'session', label: `یادداشت‌های سشن ${sessionNames[ctx.session] ?? ctx.session}`, notes: sessionNotes, reason: `مرتبط با سشن ${ctx.session}` });
      }
    }

    // 4. Symbol-specific
    if (ctx.symbol) {
      const symbolNotes = scored
        .filter(s => {
          const syms = parseJSON<string[]>(s.note.relatedSymbols, []);
          return syms.some(sym => sym.toLowerCase() === ctx.symbol!.toLowerCase());
        })
        .slice(0, 3)
        .map(s => s.note);
      if (symbolNotes.length) {
        sections.push({ key: 'symbol', label: `یادداشت‌های ${ctx.symbol}`, notes: symbolNotes, reason: `مرتبط با نماد ${ctx.symbol}` });
      }
    }

    // 5. Strengths
    const strengths = scored
      .filter(s => s.note.category === 'strengths')
      .slice(0, 2)
      .map(s => s.note);
    if (strengths.length) {
      sections.push({ key: 'strengths', label: 'نقاط قوت', notes: strengths, reason: 'رفتارهایی که تاریخاً خوب بوده‌اند' });
    }

    // 6. Recent AI insights
    const aiInsights = scored
      .filter(s => s.note.source === 'ai-generated' && s.note.status !== 'outdated')
      .slice(0, ctx.mode === 'quick' ? 2 : 4)
      .map(s => s.note);
    if (aiInsights.length) {
      sections.push({ key: 'ai', label: 'بینش‌های هوش مصنوعی', notes: aiInsights, reason: 'بینش‌های استخراج‌شده از تاریخچه معاملات' });
    }

    // 7. Day-specific
    const dayNotes = scored
      .filter(s => {
        const days = parseJSON<number[]>(s.note.relatedDays, []);
        return days.includes(dayOfWeek);
      })
      .slice(0, 3)
      .map(s => s.note);
    if (dayNotes.length) {
      const dayNames = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'];
      sections.push({ key: 'day', label: `یادداشت‌های ${dayNames[dayOfWeek]}`, notes: dayNotes, reason: `مرتبط با روز ${dayNames[dayOfWeek]}` });
    }

    // 8. Remaining high-priority notes (standard/deep only)
    if (ctx.mode !== 'quick') {
      const shownIds = new Set(sections.flatMap(s => s.notes.map(n => n.id)));
      const remaining = scored
        .filter(s => !shownIds.has(s.note.id) && (s.note.importance === 'high' || s.note.importance === 'medium'))
        .slice(0, ctx.mode === 'standard' ? 4 : 20)
        .map(s => s.note);
      if (remaining.length) {
        sections.push({ key: 'general', label: 'یادداشت‌های مهم', notes: remaining, reason: 'سایر یادداشت‌های مرتبط' });
      }
    }

    // Apply overall limit
    let total = 0;
    return sections.map(sec => {
      const remaining = Math.max(0, limit - total);
      const notes = sec.notes.slice(0, remaining);
      total += notes.length;
      return { ...sec, notes };
    }).filter(sec => sec.notes.length > 0);
  },

  // ── AI Insight generation ────────────────────────────────────────

  async generateAIInsights(): Promise<{ created: number; updated: number; insights: string[] }> {
    const trades = await db.trades.where('status').equals('closed').toArray();
    if (trades.length < 3) {
      return { created: 0, updated: 0, insights: ['حداقل ۳ معامله بسته نیاز است'] };
    }

    const insights: string[] = [];
    let created = 0;
    let updated = 0;

    interface PatternResult {
      title: string;
      content: string;
      category: string;
      importance: NoteImportance;
      evidence: NoteEvidence;
    }

    const detected: PatternResult[] = [];

    // Parse all PTRs
    const withPTR = trades
      .map(t => {
        try {
          const ptr = JSON.parse(t.postTradeReview || '{}') as PostTradeReviewData;
          return { trade: t, ptr };
        } catch { return null; }
      })
      .filter(Boolean) as { trade: typeof trades[0]; ptr: PostTradeReviewData }[];

    const tradeIds = withPTR.map(x => x.trade.id);
    const dateRange: [number, number] = [
      Math.min(...withPTR.map(x => x.trade.openedAt)),
      Math.max(...withPTR.map(x => x.trade.openedAt)),
    ];

    // ── Pattern 1: Early entry ─────────────────────────────────
    const earlyEntries = withPTR.filter(x => x.ptr.entryTiming === 'early' || x.ptr.entryTiming === 'chased');
    if (earlyEntries.length >= 3) {
      const earlyRs = earlyEntries.map(x => x.trade.rMultiple ?? 0);
      const otherRs = withPTR.filter(x => x.ptr.entryTiming === 'on-time').map(x => x.trade.rMultiple ?? 0);
      const avgEarly = earlyRs.reduce((a, b) => a + b, 0) / earlyRs.length;
      const avgOnTime = otherRs.length ? otherRs.reduce((a, b) => a + b, 0) / otherRs.length : null;
      detected.push({
        title: 'ورود زودهنگام — عملکرد ضعیف',
        content: `${earlyEntries.length} معامله با ورود زودهنگام یا دنبال‌کردن قیمت شناسایی شد.\nمیانگین R ورود زودهنگام: ${avgEarly.toFixed(2)}${avgOnTime !== null ? `\nمیانگین R ورود به‌موقع: ${avgOnTime.toFixed(2)}` : ''}`,
        category: 'entry-rules', importance: avgEarly < 0 ? 'critical' : 'high',
        evidence: {
          supportingTradeIds: earlyEntries.map(x => x.trade.id),
          sampleSize: earlyEntries.length, dateRange, avgResult: avgEarly,
          confidence: earlyEntries.length >= 7 ? 'high' : earlyEntries.length >= 4 ? 'moderate' : 'low',
          description: `ورود زودهنگام یا دنبال‌کردن قیمت در ${earlyEntries.length} از ${trades.length} معامله رخ داده`,
        },
      });
      insights.push(`ورود زودهنگام: ${earlyEntries.length} نمونه، میانگین R: ${avgEarly.toFixed(2)}`);
    }

    // ── Pattern 2: No confirmation ────────────────────────────
    const noConfirm = withPTR.filter(x => x.ptr.enteredWithConfirmation === false);
    if (noConfirm.length >= 3) {
      const avgR = noConfirm.map(x => x.trade.rMultiple ?? 0).reduce((a, b) => a + b, 0) / noConfirm.length;
      detected.push({
        title: 'ورود بدون تأیید — ریسک بالا',
        content: `${noConfirm.length} معامله بدون تأیید کافی وارد شده است. قبل از ورود، صبر برای تأیید ضروری است.`,
        category: 'entry-rules', importance: 'critical',
        evidence: {
          supportingTradeIds: noConfirm.map(x => x.trade.id),
          sampleSize: noConfirm.length, dateRange, avgResult: avgR,
          confidence: noConfirm.length >= 7 ? 'high' : 'moderate',
          description: `ورود بدون تأیید در ${noConfirm.length} از ${trades.length} معامله`,
        },
      });
      insights.push(`ورود بدون تأیید: ${noConfirm.length} نمونه`);
    }

    // ── Pattern 3: Moving SL ──────────────────────────────────
    const slMoved = withPTR.filter(x => x.ptr.slMoved === true);
    if (slMoved.length >= 2) {
      const losses = slMoved.filter(x => x.trade.result === 'loss');
      detected.push({
        title: 'جابجایی حد ضرر — ضررهای بزرگتر',
        content: `${slMoved.length} بار حد ضرر در جهت نامطلوب جابجا شده. از این کار اجتناب کنید.`,
        category: 'risk-management', importance: 'critical',
        evidence: {
          supportingTradeIds: slMoved.map(x => x.trade.id),
          sampleSize: slMoved.length, dateRange, avgResult: null,
          confidence: slMoved.length >= 5 ? 'high' : 'moderate',
          description: `${losses.length} از ${slMoved.length} معامله با جابجایی SL به ضرر ختم شد`,
        },
      });
      insights.push(`جابجایی SL: ${slMoved.length} نمونه، ${losses.length} ضرر`);
    }

    // ── Pattern 4: Behavioral flags ──────────────────────────
    const flagCounts: Record<string, { count: number; ids: string[] }> = {};
    for (const { trade, ptr } of withPTR) {
      for (const flag of (ptr.behaviorFlags ?? [])) {
        if (!flagCounts[flag]) flagCounts[flag] = { count: 0, ids: [] };
        flagCounts[flag].count++;
        flagCounts[flag].ids.push(trade.id);
      }
    }
    const flagLabels: Record<string, string> = {
      hesitation: 'تردید', fear: 'ترس', fomo: 'FOMO',
      impatience: 'بی‌صبری', overconfidence: 'اعتماد بیش از حد',
      'revenge-trading': 'معامله انتقامی', uncertainty: 'عدم قطعیت',
    };
    for (const [flag, { count, ids }] of Object.entries(flagCounts)) {
      if (count < 3) continue;
      detected.push({
        title: `الگوی رفتاری: ${flagLabels[flag] ?? flag}`,
        content: `${count} بار رفتار "${flagLabels[flag] ?? flag}" در معاملات شناسایی شده. این الگو ممکن است بر کیفیت تصمیمات تأثیر بگذارد.`,
        category: 'mistakes', importance: count >= 6 ? 'high' : 'medium',
        evidence: {
          supportingTradeIds: ids, sampleSize: count, dateRange, avgResult: null,
          confidence: count >= 8 ? 'high' : count >= 5 ? 'moderate' : 'low',
          description: `${flag} در ${count} از ${trades.length} معامله شناسایی شد`,
        },
      });
      insights.push(`${flagLabels[flag] ?? flag}: ${count} نمونه`);
    }

    // ── Pattern 5: Early close ────────────────────────────────
    const closedEarly = withPTR.filter(x => x.ptr.closedEarly === true);
    if (closedEarly.length >= 3) {
      detected.push({
        title: 'بستن زودهنگام معامله',
        content: `${closedEarly.length} معامله قبل از رسیدن به هدف بسته شده. صبر برای اجرای کامل پلن را تمرین کنید.`,
        category: 'exit-rules', importance: 'medium',
        evidence: {
          supportingTradeIds: closedEarly.map(x => x.trade.id),
          sampleSize: closedEarly.length, dateRange, avgResult: null,
          confidence: closedEarly.length >= 6 ? 'moderate' : 'low',
          description: `بستن زودهنگام در ${closedEarly.length} از ${trades.length} معامله`,
        },
      });
      insights.push(`بستن زودهنگام: ${closedEarly.length} نمونه`);
    }

    // ── Pattern 6: Risk increase ──────────────────────────────
    const riskIncreased = withPTR.filter(x => x.ptr.riskIncreased === true);
    if (riskIncreased.length >= 2) {
      detected.push({
        title: 'افزایش ریسک در حین معامله',
        content: `${riskIncreased.length} بار ریسک در حین معامله افزایش داده شده. پایبندی به ریسک اولیه ضروری است.`,
        category: 'risk-management', importance: 'high',
        evidence: {
          supportingTradeIds: riskIncreased.map(x => x.trade.id),
          sampleSize: riskIncreased.length, dateRange, avgResult: null,
          confidence: 'moderate',
          description: `افزایش ریسک در ${riskIncreased.length} از ${trades.length} معامله`,
        },
      });
    }

    // ── Save detected patterns ─────────────────────────────────
    for (const pattern of detected) {
      const similar = await knowledgeService.findSimilarNotes(pattern.title, pattern.content);
      const existing = similar.find(n => n.source === 'ai-generated');

      if (existing) {
        // Update existing note's evidence
        const oldEv = parseJSON<NoteEvidence | null>(existing.evidence, null);
        if (oldEv) {
          const merged: NoteEvidence = {
            ...pattern.evidence,
            supportingTradeIds: Array.from(new Set([...oldEv.supportingTradeIds, ...pattern.evidence.supportingTradeIds])),
            sampleSize: Math.max(oldEv.sampleSize, pattern.evidence.sampleSize),
          };
          await db.knowledgeNotes.update(existing.id, {
            evidence: JSON.stringify(merged),
            status: 'active',
            updatedAt: Date.now(),
          });
          updated++;
        }
      } else {
        await knowledgeService.createNote({
          title: pattern.title,
          content: pattern.content,
          category: pattern.category,
          importance: pattern.importance,
          color: pattern.importance === 'critical' ? '#ef4444' : pattern.importance === 'high' ? '#f97316' : '#eab308',
          source: 'ai-generated',
          status: 'new',
          evidence: JSON.stringify(pattern.evidence),
          relatedSymbols: JSON.stringify(Array.from(new Set(
            pattern.evidence.supportingTradeIds
              .map(id => withPTR.find(x => x.trade.id === id)?.trade.symbol)
              .filter(Boolean)
          ))),
        });
        created++;
      }
    }

    return { created, updated, insights };
  },

  // ── Statistics ──────────────────────────────────────────────────

  async getStats() {
    const all = await db.knowledgeNotes.toArray();
    const active = all.filter(n => n.isActive && n.status !== 'archived');
    const byCat: Record<string, number> = {};
    for (const n of active) {
      byCat[n.category] = (byCat[n.category] || 0) + 1;
    }
    const byImportance: Record<string, number> = {};
    for (const n of active) {
      byImportance[n.importance] = (byImportance[n.importance] || 0) + 1;
    }
    const mostReviewed = [...active]
      .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
      .slice(0, 5);
    const neverReviewed = active.filter(n => !n.lastReviewedAt);
    const aiNotes = all.filter(n => n.source === 'ai-generated');
    const confirmed = aiNotes.filter(n => n.status === 'confirmed');
    const outdated = all.filter(n => n.status === 'outdated' || n.status === 'weakening');

    return {
      total: all.length,
      active: active.length,
      archived: all.filter(n => n.status === 'archived').length,
      rules: active.filter(n => n.isRule).length,
      aiInsights: aiNotes.length,
      aiConfirmed: confirmed.length,
      byCat,
      byImportance,
      mostReviewed,
      neverReviewed: neverReviewed.length,
      outdated: outdated.length,
    };
  },

  // ── Timeline ─────────────────────────────────────────────────────

  async getTimeline(): Promise<KnowledgeNote[]> {
    return db.knowledgeNotes.orderBy('createdAt').reverse().toArray();
  },

  // ── Knowledge quality scoring ────────────────────────────────────

  getKnowledgeQuality(note: KnowledgeNote): {
    score: number;
    label: string;
    level: 'weak' | 'moderate' | 'good' | 'strong';
  } {
    let score = 0;

    // Clarity: title + content length
    if (note.title.length > 15) score += 15;
    else if (note.title.length > 5) score += 8;
    if (note.content.length > 60) score += 15;
    else if (note.content.length > 20) score += 8;

    // Specificity: tags, symbols, sessions, setups
    const tags    = parseJSON<string[]>(note.tags, []);
    const syms    = parseJSON<string[]>(note.relatedSymbols, []);
    const sessions= parseJSON<string[]>(note.relatedSessions, []);
    const setups  = parseJSON<string[]>(note.relatedSetups, []);
    if (tags.length)    score += 8;
    if (syms.length)    score += 8;
    if (sessions.length)score += 7;
    if (setups.length)  score += 7;

    // Evidence
    const ev = parseJSON<NoteEvidence | null>(note.evidence, null);
    if (ev) {
      score += 15;
      if (ev.sampleSize >= 5)           score += 10;
      else if (ev.sampleSize >= 3)      score += 5;
      if (ev.confidence === 'high')     score += 5;
      else if (ev.confidence === 'moderate') score += 3;
    }

    // Recency of review
    const daysSince = note.lastReviewedAt
      ? (Date.now() - note.lastReviewedAt) / 86_400_000
      : 999;
    if (daysSince < 7)        score += 10;
    else if (daysSince < 30)  score += 6;
    else if (daysSince < 90)  score += 3;

    const pct = Math.min(100, score);
    const level =
      pct >= 75 ? 'strong' :
      pct >= 50 ? 'good'   :
      pct >= 30 ? 'moderate' : 'weak';
    const label =
      level === 'strong'   ? 'شواهد قوی' :
      level === 'good'     ? 'خوب'        :
      level === 'moderate' ? 'متوسط'      : 'شواهد محدود';
    return { score: pct, label, level };
  },

  // ── Lesson reinforcement analysis ────────────────────────────────
  // Compare historical behavior frequency vs recent (last 10 trades)

  async getLessonReinforcement(
    patternKey: 'earlyEntry' | 'noConfirmation' | 'slMoved' | 'closedEarly' | 'riskIncreased'
  ): Promise<{
    patternLabel: string;
    historicalRate: number;  // fraction
    recentRate: number;
    historicalCount: number;
    recentCount: number;
    total: number;
    recentTotal: number;
    improving: boolean | null;
    regression: boolean;
    summary: string;
  } | null> {
    const trades = await db.trades.where('status').equals('closed').toArray();
    if (trades.length < 5) return null;

    type PTR = import('../db/database').PostTradeReviewData;
    const withPTR = trades
      .map(t => { try { return { t, ptr: JSON.parse(t.postTradeReview || '{}') as PTR }; } catch { return null; } })
      .filter(Boolean) as { t: typeof trades[0]; ptr: PTR }[];

    const labels: Record<string, string> = {
      earlyEntry:    'ورود زودهنگام',
      noConfirmation:'ورود بدون تأیید',
      slMoved:       'جابجایی حد ضرر',
      closedEarly:   'بستن زودهنگام',
      riskIncreased: 'افزایش ریسک',
    };

    const matches = (x: { t: typeof trades[0]; ptr: PTR }): boolean => {
      switch (patternKey) {
        case 'earlyEntry':     return x.ptr.entryTiming === 'early' || x.ptr.entryTiming === 'chased';
        case 'noConfirmation': return x.ptr.enteredWithConfirmation === false;
        case 'slMoved':        return x.ptr.slMoved === true;
        case 'closedEarly':    return x.ptr.closedEarly === true;
        case 'riskIncreased':  return x.ptr.riskIncreased === true;
        default:               return false;
      }
    };

    const recent = withPTR.slice(-10);  // last 10 with PTR
    const historical = withPTR.slice(0, Math.max(0, withPTR.length - 10));

    const histCount   = historical.filter(matches).length;
    const recentCount = recent.filter(matches).length;
    const histRate    = historical.length > 0 ? histCount / historical.length : 0;
    const recentRate  = recent.length > 0     ? recentCount / recent.length   : 0;

    const improving   = historical.length >= 3 ? recentRate < histRate - 0.1 : null;
    const regression  = !!(improving === false && histRate > 0.2 && recentRate > histRate + 0.1);

    const diffPct = Math.round(Math.abs(recentRate - histRate) * 100);
    let summary = '';
    if (regression) {
      summary = `رفتار «${labels[patternKey]}» که بهبود یافته بود، مجدداً ظاهر شده است (${diffPct}٪ افزایش اخیر).`;
    } else if (improving) {
      summary = `«${labels[patternKey]}» در معاملات اخیر کمتر دیده می‌شود (${diffPct}٪ کاهش).`;
    } else {
      summary = `الگوی «${labels[patternKey]}» تغییر قابل توجهی نداشته است.`;
    }

    return {
      patternLabel: labels[patternKey],
      historicalRate: histRate, recentRate,
      historicalCount: histCount, recentCount,
      total: withPTR.length, recentTotal: recent.length,
      improving, regression, summary,
    };
  },

  // ── Regression detection (all patterns) ──────────────────────────

  async detectRegressions(): Promise<Array<{
    patternKey: string;
    patternLabel: string;
    historicalRate: number;
    recentRate: number;
    summary: string;
  }>> {
    const keys = ['earlyEntry', 'noConfirmation', 'slMoved', 'closedEarly', 'riskIncreased'] as const;
    const results = await Promise.all(keys.map(k => knowledgeService.getLessonReinforcement(k)));
    return results
      .filter(r => r?.regression)
      .map(r => ({
        patternKey: '',
        patternLabel: r!.patternLabel,
        historicalRate: r!.historicalRate,
        recentRate: r!.recentRate,
        summary: r!.summary,
      }));
  },

  // ── Backup helpers ───────────────────────────────────────────────

  async exportAll() {
    const [notes, categories] = await Promise.all([
      db.knowledgeNotes.toArray(),
      db.knowledgeCategories.toArray(),
    ]);
    return { notes, categories };
  },

  async importAll(data: { notes: KnowledgeNote[]; categories: KnowledgeCategory[] }) {
    await db.knowledgeCategories.bulkPut(data.categories);
    await db.knowledgeNotes.bulkPut(data.notes);
  },
};
