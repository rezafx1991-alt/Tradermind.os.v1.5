import {
  db,
  type Account,
  type JournalMedia,
  type JournalOption,
  type JournalSession,
  type JournalSessionAnalysis,
  type JournalSessionEvent,
  type JournalTradeData,
  type JournalTriggerEvent,
  type JournalTriggerStatus,
  type Strategy,
  type StrategyVersion,
  type Trade,
} from '../db/database';
import { getNetPnl, getResolvedR, isBreakEven, isClosed, isLoss, isWin } from '../lib/tradeHelpers';
import { tradeService } from './tradeService';

export const JOURNAL_OPTION_CATEGORIES = [
  { id: 'timeframe', label: 'تایم‌فریم' },
  { id: 'entry_trigger', label: 'تریگر ورود' },
  { id: 'exit_reason', label: 'دلیل خروج' },
  { id: 'entry_reason', label: 'دلیل ورود' },
  { id: 'psychology', label: 'حالت روانی' },
  { id: 'emotion', label: 'احساسات' },
  { id: 'strategy_rule', label: 'قانون استراتژی' },
  { id: 'checklist', label: 'چک‌لیست ورود' },
  { id: 'setup_type', label: 'نوع ستاپ' },
  { id: 'setup_grade', label: 'درجه ستاپ' },
  { id: 'market_condition', label: 'شرایط بازار' },
  { id: 'liquidity_type', label: 'نوع نقدینگی' },
  { id: 'mistake', label: 'اشتباه' },
  { id: 'tag', label: 'برچسب' },
  { id: 'obstacle', label: 'مانع' },
  { id: 'trade_management', label: 'مدیریت معامله' },
  { id: 'session_type', label: 'نوع سشن' },
  { id: 'review_category', label: 'دسته‌بندی مرور' },
  { id: 'direction', label: 'جهت بازار' },
  { id: 'market_structure', label: 'ساختار بازار' },
  { id: 'session_event_type', label: 'رویداد بدون معامله' },
  { id: 'sco_type', label: 'نوع SCO' },
  { id: 'fvg_type', label: 'نوع FVG' },
] as const;

export type JournalOptionCategory = typeof JOURNAL_OPTION_CATEGORIES[number]['id'];

const DEFAULT_OPTIONS: Record<JournalOptionCategory, string[]> = {
  timeframe: ['1M', '5M', '15M', '30M', '1H', '4H', 'Daily', 'Weekly'],
  entry_trigger: ['Liquidity Hunt', 'SCO', 'FVG Candle', 'Mitigation', 'Order Block'],
  exit_reason: ['TP', 'SL', 'Manual Exit', 'Structure Changed', 'Liquidity Taken', 'Psychology', 'Risk Reduction', 'Strategy Invalidated'],
  entry_reason: ['Strategy Setup', 'Breakout', 'Pullback', 'Liquidity Sweep', 'Custom'],
  psychology: ['Calm', 'Fear', 'FOMO', 'Revenge', 'Hesitation', 'Greed', 'Overconfidence', 'Impatience', 'Stress', 'Anxiety'],
  emotion: ['Calm', 'Confident', 'Focused', 'Fearful', 'Anxious', 'Frustrated', 'Greedy', 'Impatient'],
  strategy_rule: [],
  checklist: ['HTF Direction Confirmed', 'Liquidity Swept', 'Trigger Confirmed', 'Momentum Valid', 'No Major Obstacle', 'Risk Valid'],
  setup_type: ['Continuation', 'Reversal', 'Breakout', 'Pullback', 'Range', 'Liquidity Sweep'],
  setup_grade: ['A+', 'A', 'B', 'C', 'Invalid'],
  market_condition: ['Trending', 'Ranging', 'High Volatility', 'Low Volatility', 'News'],
  liquidity_type: ['Equal Highs', 'Equal Lows', 'Previous High', 'Previous Low', 'Session High/Low'],
  mistake: ['Early Entry', 'Late Entry', 'FOMO', 'Revenge Trade', 'Ignored Rule', 'Ignored Obstacle', 'Oversized Position', 'Moved SL', 'Closed Early'],
  tag: ['A Setup', 'Needs Review'],
  obstacle: ['Mitigation Wall', 'Order Block', 'Fair Value Gap', 'News Event'],
  trade_management: ['Moved Stop Loss', 'Partial Close', 'Added to Position', 'Reduced Position', 'Manual Exit'],
  session_type: ['Asia', 'London', 'London/New York Overlap', 'New York', 'Custom'],
  review_category: ['Execution', 'Risk', 'Psychology', 'Market Context', 'Strategy'],
  direction: ['Bullish', 'Bearish', 'Neutral'],
  market_structure: ['Uptrend', 'Downtrend', 'Range', 'Breakout', 'Reversal'],
  session_event_type: ['Valid Setup — No Trade', 'Missed Trade', 'Invalid Setup', 'Observed Setup'],
  sco_type: [],
  fvg_type: [],
};

export interface CreateJournalSessionInput {
  accountId: string;
  tradingBoxId: string;
  strategyId: string;
  symbols: string[];
  startTime: number;
  sessionTypeOptionId?: string | null;
  notes?: string;
  tags?: string[];
}

export interface JournalSessionBundle {
  session: JournalSession;
  account?: Account;
  strategy?: Strategy;
  strategyVersion?: StrategyVersion;
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  trades: Trade[];
  tradeData: JournalTradeData[];
  events: JournalSessionEvent[];
  media: JournalMedia[];
  options: JournalOption[];
}

export interface JournalSessionMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  totalR: number;
  averageR: number | null;
  bestTradeId: string | null;
  worstTradeId: string | null;
}

export interface JournalAnalyticsFilters {
  accountId?: string;
  tradingBoxId?: string;
  strategyId?: string;
  strategyVersionId?: string;
  symbol?: string;
  from?: number;
  to?: number;
  sessionId?: string;
  timeframeOptionId?: string;
  entryTriggerOptionId?: string;
  exitReasonOptionId?: string;
  psychologyOptionId?: string;
  mistakeOptionId?: string;
  setupGradeOptionId?: string;
  scoTypeOptionId?: string;
  fvgTypeOptionId?: string;
  minSetupQuality?: number;
  maxSetupQuality?: number;
  minExecutionQuality?: number;
  maxExecutionQuality?: number;
  strategyCompliance?: JournalTradeData['strategyCompliance'];
}

function uid(): string {
  return crypto.randomUUID();
}

function parseArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function psychologyHasOption(value: string | undefined, optionId: string): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.includes(optionId);
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).some(phase =>
        phase && typeof phase === 'object'
        && Array.isArray((phase as { optionIds?: unknown }).optionIds)
        && ((phase as { optionIds: string[] }).optionIds).includes(optionId),
      );
    }
    return false;
  } catch {
    return false;
  }
}

function optionRecord(
  category: string,
  label: string,
  sortOrder: number,
  now: number,
  required = false,
): JournalOption {
  return {
    id: uid(),
    category,
    label,
    description: '',
    enabled: true,
    required,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

async function createVersionSnapshot(strategyId: string): Promise<StrategyVersion> {
  const strategy = await db.strategies.get(strategyId);
  if (!strategy) throw new Error('استراتژی انتخاب‌شده پیدا نشد.');

  const phases = await db.phases.where('strategyId').equals(strategyId).sortBy('order');
  const phaseIds = phases.map(phase => phase.id);
  const steps = phaseIds.length
    ? await db.steps.where('phaseId').anyOf(phaseIds).toArray()
    : [];
  const phaseOrder = new Map(phases.map(phase => [phase.id, phase.order]));
  steps.sort((a, b) => (phaseOrder.get(a.phaseId) ?? 0) - (phaseOrder.get(b.phaseId) ?? 0) || a.order - b.order);
  const stepIds = steps.map(step => step.id);
  const rules = stepIds.length
    ? await db.rules.where('stepId').anyOf(stepIds).toArray()
    : [];
  const stepOrder = new Map(steps.map(step => [step.id, step.order]));
  rules.sort((a, b) => stepIds.indexOf(a.stepId) - stepIds.indexOf(b.stepId) || a.order - b.order || stepOrder.get(a.stepId)! - stepOrder.get(b.stepId)!);
  const priorVersions = await db.strategyVersions.where('strategyId').equals(strategyId).count();
  const now = Date.now();

  return {
    id: uid(),
    strategyId,
    versionNumber: `1.${priorVersions}`,
    strategyName: strategy.name,
    description: strategy.description,
    rulesSnapshot: JSON.stringify({ phases, steps, rules }),
    createdAt: now,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// جریان رویدادمحور سشن: Analysis → Trigger → Trade → Review
// ────────────────────────────────────────────────────────────────────────────

export type SessionTimelineItem =
  | { kind: 'analysis'; id: string; at: number; analysis: JournalSessionAnalysis; media: JournalMedia[] }
  | { kind: 'trigger'; id: string; at: number; trigger: JournalTriggerEvent; media: JournalMedia[] }
  | { kind: 'trade-open'; id: string; at: number; trade: Trade; media: JournalMedia[] }
  | { kind: 'trade-result'; id: string; at: number; trade: Trade; resultLabel: string; resultTone: 'win' | 'loss' | 'neutral' }
  | { kind: 'event'; id: string; at: number; event: JournalSessionEvent };

/** ترتیب نمایش وقتی زمان چند رویداد برابر است (مثلاً تریگر و ورود هم‌زمان) */
const TIMELINE_RANK: Record<SessionTimelineItem['kind'], number> = {
  analysis: 0, trigger: 1, 'trade-open': 2, 'trade-result': 3, event: 4,
};

export interface AnalysisEventInput {
  sessionId: string;
  timeframeOptionId: string;
  directionOptionId?: string | null;
  marketStructureOptionId?: string | null;
  expectedDirectionOptionId?: string | null;
  liquidityContextOptionIds?: string[];
  zones?: string;
  notes?: string;
  tags?: string[];
  analysisText?: string;
  scenario?: string;
  triggerContext?: string;
  marketContext?: string;
  previousTradeId?: string | null;
}

export interface TriggerEventInput {
  sessionId: string;
  timeframeOptionId?: string | null;
  analysisEventId?: string | null;
  tradeId?: string | null;
  triggerTypeOptionId?: string | null;
  triggerDescription?: string;
  marketMovement?: string;
  entryReason?: string;
  confirmation?: string;
  direction?: 'long' | 'short' | null;
  status?: JournalTriggerStatus;
  notes?: string;
  tags?: string[];
  triggeredAt?: number;
}

export interface SessionSummary extends JournalSessionMetrics {
  analysisCount: number;
  triggerCount: number;
  triggersTraded: number;
  triggersSkipped: number;
  triggersInvalid: number;
  noTradeEvents: number;
}

/**
 * ساخت تایم‌لاین سشن (تابع خالص، بدون دسترسی به DB).
 * هر معامله دو گره دارد: «ورود» و (در صورت بسته بودن) «نتیجه».
 */
export function buildSessionTimeline(input: {
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  trades: Trade[];
  tradeData?: JournalTradeData[];
  events: JournalSessionEvent[];
  media: JournalMedia[];
  options: JournalOption[];
}): SessionTimelineItem[] {
  const mediaFor = (pick: (m: JournalMedia) => string | null | undefined, id: string) =>
    input.media.filter(m => pick(m) === id).sort((a, b) => a.createdAt - b.createdAt);
  const optionLabel = (id: string | null | undefined) =>
    id ? input.options.find(o => o.id === id)?.label ?? null : null;
  const dataByTrade = new Map((input.tradeData ?? []).map(d => [d.tradeId, d]));

  const items: SessionTimelineItem[] = [];
  for (const analysis of input.analyses) {
    items.push({ kind: 'analysis', id: analysis.id, at: analysis.createdAt, analysis, media: mediaFor(m => m.analysisId, analysis.id) });
  }
  for (const trigger of input.triggers) {
    items.push({ kind: 'trigger', id: trigger.id, at: trigger.triggeredAt ?? trigger.createdAt, trigger, media: mediaFor(m => m.triggerId, trigger.id) });
  }
  for (const trade of input.trades) {
    items.push({ kind: 'trade-open', id: `${trade.id}:open`, at: trade.openedAt, trade, media: mediaFor(m => m.tradeId, trade.id) });
    if (isClosed(trade)) {
      const net = getNetPnl(trade);
      const exitLabel = optionLabel(dataByTrade.get(trade.id)?.exitReasonOptionId);
      // اگر دلیل خروج TP/SL ثبت شده همان نمایش داده می‌شود؛ وگرنه از علامت سود خالص
      const isTpSl = exitLabel !== null && /^(tp|sl)$/i.test(exitLabel.trim());
      const tone: 'win' | 'loss' | 'neutral' = net === null ? 'neutral' : net > 0 ? 'win' : net < 0 ? 'loss' : 'neutral';
      const fallback = tone === 'win' ? 'سود' : tone === 'loss' ? 'زیان' : 'سر به سر';
      items.push({
        kind: 'trade-result', id: `${trade.id}:result`, at: trade.closedAt ?? trade.openedAt, trade,
        resultLabel: isTpSl ? exitLabel!.trim().toUpperCase() : fallback, resultTone: tone,
      });
    }
  }
  for (const event of input.events) {
    items.push({ kind: 'event', id: event.id, at: event.eventAt, event });
  }
  return items.sort((a, b) => a.at - b.at || TIMELINE_RANK[a.kind] - TIMELINE_RANK[b.kind]);
}

export interface PreTradePsychology { optionIds: string[]; intensity: number; notes: string }

export function parsePreTradePsychology(value: string | undefined | null): PreTradePsychology {
  const empty: PreTradePsychology = { optionIds: [], intensity: 0, notes: '' };
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value) as Partial<PreTradePsychology>;
    return {
      optionIds: Array.isArray(parsed.optionIds) ? parsed.optionIds.filter((x): x is string => typeof x === 'string') : [],
      intensity: typeof parsed.intensity === 'number' && Number.isFinite(parsed.intensity) ? parsed.intensity : 0,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch { return empty; }
}

export const journalSessionService = {
  async ensureDefaultOptions(): Promise<void> {
    await db.transaction('rw', db.journalOptions, async () => {
      if (await db.journalOptions.count()) return;
      const now = Date.now();
      const records = Object.entries(DEFAULT_OPTIONS).flatMap(([category, labels]) =>
        labels.map((label, index) => optionRecord(category, label, index, now)),
      );
      if (records.length) await db.journalOptions.bulkAdd(records);
    });
  },

  async getOptions(category?: string, includeDisabled = false): Promise<JournalOption[]> {
    const records = category
      ? await db.journalOptions.where('category').equals(category).toArray()
      : await db.journalOptions.toArray();
    return records
      .filter(option => includeDisabled || option.enabled)
      .sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  },

  async createOption(data: Pick<JournalOption, 'category' | 'label'> & Partial<Pick<JournalOption, 'description' | 'required'>>): Promise<JournalOption> {
    const label = data.label.trim();
    if (!label) throw new Error('عنوان گزینه نمی‌تواند خالی باشد.');
    const siblings = await db.journalOptions.where('category').equals(data.category).toArray();
    if (siblings.some(item => item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new Error('این گزینه از قبل در همین دسته وجود دارد.');
    }
    const now = Date.now();
    const option = optionRecord(data.category, label, siblings.length ? Math.max(...siblings.map(item => item.sortOrder)) + 1 : 0, now, data.required ?? false);
    option.description = data.description?.trim() ?? '';
    await db.journalOptions.add(option);
    return option;
  },

  async updateOption(id: string, patch: Pick<JournalOption, 'label' | 'description'> & Partial<Pick<JournalOption, 'required'>>): Promise<void> {
    const label = patch.label.trim();
    if (!label) throw new Error('عنوان گزینه نمی‌تواند خالی باشد.');
    const existing = await db.journalOptions.get(id);
    if (!existing) throw new Error('گزینه پیدا نشد.');
    const siblings = await db.journalOptions.where('category').equals(existing.category).toArray();
    if (siblings.some(item => item.id !== id && item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new Error('این گزینه از قبل در همین دسته وجود دارد.');
    }
    await db.journalOptions.update(id, { ...patch, label, description: patch.description.trim(), updatedAt: Date.now() });
  },

  async setOptionEnabled(id: string, enabled: boolean): Promise<void> {
    if (!(await db.journalOptions.get(id))) throw new Error('گزینه پیدا نشد.');
    await db.journalOptions.update(id, { enabled, updatedAt: Date.now() });
  },

  async reorderOption(id: string, direction: -1 | 1): Promise<void> {
    const item = await db.journalOptions.get(id);
    if (!item) throw new Error('گزینه پیدا نشد.');
    const siblings = (await db.journalOptions.where('category').equals(item.category).toArray())
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex(sibling => sibling.id === id);
    const neighbor = siblings[index + direction];
    if (!neighbor) return;
    const reordered = [...siblings];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    await db.transaction('rw', db.journalOptions, async () => {
      for (const [sortOrder, option] of reordered.entries()) {
        await db.journalOptions.update(option.id, { sortOrder, updatedAt: Date.now() });
      }
    });
  },

  async createSession(input: CreateJournalSessionInput): Promise<JournalSession> {
    const [account, box, strategy] = await Promise.all([
      db.accounts.get(input.accountId),
      db.tradingBoxes.get(input.tradingBoxId),
      db.strategies.get(input.strategyId),
    ]);
    if (!account || account.isArchived) throw new Error('حساب فعال و معتبری انتخاب نشده است.');
    if (!box || box.status !== 'active') throw new Error('باکس معاملاتی فعال و معتبری انتخاب نشده است.');
    if (box.accountId && box.accountId !== account.id) throw new Error('این باکس متعلق به حساب انتخاب‌شده نیست.');
    if (!strategy) throw new Error('استراتژی انتخاب‌شده پیدا نشد.');

    const version = await createVersionSnapshot(input.strategyId);
    const now = Date.now();
    const session: JournalSession = {
      id: uid(),
      accountId: input.accountId,
      tradingBoxId: input.tradingBoxId,
      strategyId: input.strategyId,
      strategyVersionId: version.id,
      symbols: JSON.stringify([...new Set(input.symbols.map(value => value.trim().toUpperCase()).filter(Boolean))]),
      startTime: input.startTime,
      endTime: null,
      status: 'active',
      sessionTypeOptionId: input.sessionTypeOptionId ?? null,
      notes: input.notes?.trim() ?? '',
      tags: JSON.stringify(input.tags ?? []),
      lessonsLearned: '',
      mistakesReview: '',
      psychologicalReview: '',
      strategyObservations: '',
      strategyChangeProposal: '',
      createdAt: now,
      updatedAt: now,
    };

    await db.transaction('rw', db.strategyVersions, db.journalSessions, async () => {
      await db.strategyVersions.add(version);
      await db.journalSessions.add(session);
    });
    return session;
  },

  async getSessions(): Promise<JournalSession[]> {
    return db.journalSessions.orderBy('startTime').reverse().toArray();
  },

  async getSession(id: string): Promise<JournalSession | undefined> {
    return db.journalSessions.get(id);
  },

  async updateSession(id: string, patch: Partial<Omit<JournalSession, 'id' | 'createdAt' | 'strategyVersionId'>>): Promise<void> {
    const current = await db.journalSessions.get(id);
    if (!current) throw new Error('سشن پیدا نشد.');
    const nextStatus = patch.status ?? current.status;
    await db.journalSessions.update(id, {
      ...patch,
      endTime: nextStatus === 'active' ? null : (patch.endTime ?? current.endTime ?? Date.now()),
      updatedAt: Date.now(),
    });
  },

  async getBundle(id: string): Promise<JournalSessionBundle | undefined> {
    const session = await db.journalSessions.get(id);
    if (!session) return undefined;
    const [account, strategy, strategyVersion, analyses, triggers, trades, tradeData, events, media, options] = await Promise.all([
      db.accounts.get(session.accountId),
      db.strategies.get(session.strategyId),
      db.strategyVersions.get(session.strategyVersionId),
      db.journalSessionAnalyses.where('sessionId').equals(id).sortBy('createdAt'),
      db.journalTriggers.where('sessionId').equals(id).sortBy('createdAt'),
      db.trades.where('journalSessionId').equals(id).toArray(),
      db.journalTradeData.where('journalSessionId').equals(id).toArray(),
      db.journalSessionEvents.where('sessionId').equals(id).sortBy('eventAt'),
      db.journalMedia.where('sessionId').equals(id).sortBy('createdAt'),
      this.getOptions(undefined, true),
    ]);
    return { session, account, strategy, strategyVersion, analyses, triggers, trades, tradeData, events, media, options };
  },

  async saveAnalysis(
    input: Omit<JournalSessionAnalysis, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<JournalSessionAnalysis> {
    const [session, timeframe] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.timeframeOptionId),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!timeframe || timeframe.category !== 'timeframe') throw new Error('تایم‌فریم معتبر انتخاب نشده است.');
    const existing = await db.journalSessionAnalyses
      .where('[sessionId+timeframeOptionId]')
      .equals([input.sessionId, input.timeframeOptionId])
      .first();
    const now = Date.now();
    const record: JournalSessionAnalysis = {
      ...input,
      id: existing?.id ?? uid(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.journalSessionAnalyses.put(record);
    return record;
  },

  async saveTradeData(input: Omit<JournalTradeData, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalTradeData> {
    const trade = await db.trades.get(input.tradeId);
    const session = await db.journalSessions.get(input.journalSessionId);
    if (!trade || !session) throw new Error('معامله یا سشن پیدا نشد.');
    if (trade.journalSessionId !== session.id) throw new Error('معامله به این سشن متصل نیست.');
    const existing = await db.journalTradeData.where('tradeId').equals(input.tradeId).first();
    const now = Date.now();
    const record: JournalTradeData = {
      ...input,
      id: existing?.id ?? input.tradeId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.transaction('rw', db.journalTradeData, db.trades, async () => {
      await db.journalTradeData.put(record);
      // درس معامله فقط در مرور ثبت می‌شود؛ برای صفحاتی که Trade.lesson را می‌خوانند همگام نگه داشته می‌شود
      if (typeof input.lesson === 'string') await db.trades.update(input.tradeId, { lesson: input.lesson.trim() || null });
    });
    return record;
  },

  async addEvent(input: Pick<JournalSessionEvent, 'sessionId' | 'typeOptionId' | 'notes' | 'eventAt'>): Promise<JournalSessionEvent> {
    const [session, option] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.typeOptionId),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!option || option.category !== 'session_event_type' || !option.enabled) throw new Error('نوع رویداد معتبر انتخاب نشده است.');
    const now = Date.now();
    const event: JournalSessionEvent = { ...input, id: uid(), createdAt: now, updatedAt: now };
    await db.journalSessionEvents.add(event);
    return event;
  },

  async deleteEvent(id: string): Promise<void> {
    await db.journalSessionEvents.delete(id);
  },

  async saveMedia(input: {
    sessionId?: string | null;
    tradeId?: string | null;
    analysisId?: string | null;
    triggerId?: string | null;
    reviewId?: string | null;
    category: JournalMedia['category'];
    file: File;
    caption?: string;
  }): Promise<JournalMedia> {
    if (!input.file.size) throw new Error('فایل خالی است.');
    const record: JournalMedia = {
      id: uid(),
      sessionId: input.sessionId ?? null,
      tradeId: input.tradeId ?? null,
      analysisId: input.analysisId ?? null,
      triggerId: input.triggerId ?? null,
      reviewId: input.reviewId ?? null,
      category: input.category,
      fileName: input.file.name,
      mimeType: input.file.type || 'application/octet-stream',
      blob: input.file.slice(0, input.file.size, input.file.type || 'application/octet-stream'),
      caption: input.caption?.trim() ?? '',
      createdAt: Date.now(),
    };
    if (!record.sessionId && !record.tradeId && !record.analysisId && !record.triggerId && !record.reviewId) throw new Error('فایل باید به سشن، تحلیل، تریگر، معامله یا مرور وصل باشد.');
    await db.journalMedia.add(record);
    return record;
  },

  async deleteMedia(id: string): Promise<void> {
    await db.journalMedia.delete(id);
  },

  async getSessionMetrics(sessionId: string): Promise<JournalSessionMetrics> {
    return this.calculateMetrics(await db.trades.where('journalSessionId').equals(sessionId).toArray());
  },

  calculateMetrics(trades: Trade[]): JournalSessionMetrics {
    const settled = trades.filter(trade =>
      isClosed(trade)
      && ['win', 'partial-win', 'loss', 'partial-loss', 'breakeven'].includes(trade.result),
    );
    const wins = settled.filter(isWin).length;
    const losses = settled.filter(isLoss).length;
    const breakeven = settled.filter(isBreakEven).length;
    const pnls = settled.map(getNetPnl).filter((value): value is number => value !== null);
    const totalProfit = pnls.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
    const totalLoss = Math.abs(pnls.filter(value => value < 0).reduce((sum, value) => sum + value, 0));
    const rTrades = settled
      .map(trade => ({ trade, r: getResolvedR(trade) }))
      .filter((x): x is { trade: Trade; r: number } => x.r !== null);
    const rs = rTrades.map(x => x.r);
    // بهترین/بدترین معامله: بر اساس R؛ اگر R موجود نباشد بر اساس سود خالص
    const ranked = rTrades.length
      ? [...rTrades].sort((a, b) => a.r - b.r).map(x => x.trade)
      : settled
          .map(trade => ({ trade, net: getNetPnl(trade) }))
          .filter((x): x is { trade: Trade; net: number } => x.net !== null)
          .sort((a, b) => a.net - b.net)
          .map(x => x.trade);
    return {
      totalTrades: trades.length,
      wins,
      losses,
      breakeven,
      winRate: settled.length ? (wins / settled.length) * 100 : null,
      totalProfit,
      totalLoss,
      netPnl: pnls.reduce((sum, value) => sum + value, 0),
      totalR: rs.reduce((sum, value) => sum + value, 0),
      averageR: rs.length ? rs.reduce((sum, value) => sum + value, 0) / rs.length : null,
      bestTradeId: ranked[ranked.length - 1]?.id ?? null,
      worstTradeId: ranked[0]?.id ?? null,
    };
  },

  // ───────────── رویدادهای تحلیل (چندین تحلیل در یک سشن) ─────────────

  async getSessionAnalyses(sessionId: string): Promise<JournalSessionAnalysis[]> {
    return db.journalSessionAnalyses.where('sessionId').equals(sessionId).sortBy('createdAt');
  },

  async createAnalysisEvent(input: AnalysisEventInput): Promise<JournalSessionAnalysis> {
    const [session, timeframe] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.timeframeOptionId),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!timeframe || timeframe.category !== 'timeframe') throw new Error('تایم‌فریم معتبر انتخاب نشده است.');

    // معاملهٔ قبلی همین سشن (جدیدترین) به‌صورت پیش‌فرض و اختیاری لینک می‌شود
    let previousTradeId = input.previousTradeId;
    if (previousTradeId === undefined) {
      const trades = await db.trades.where('journalSessionId').equals(input.sessionId).toArray();
      previousTradeId = trades.sort((a, b) => b.openedAt - a.openedAt)[0]?.id ?? null;
    }

    const now = Date.now();
    const record: JournalSessionAnalysis = {
      id: uid(),
      sessionId: input.sessionId,
      timeframeOptionId: input.timeframeOptionId,
      directionOptionId: input.directionOptionId ?? null,
      marketStructureOptionId: input.marketStructureOptionId ?? null,
      liquidityContextOptionIds: JSON.stringify(input.liquidityContextOptionIds ?? []),
      expectedDirectionOptionId: input.expectedDirectionOptionId ?? null,
      zones: input.zones ?? '',
      notes: input.notes ?? '',
      tags: JSON.stringify(input.tags ?? []),
      analysisText: input.analysisText ?? '',
      scenario: input.scenario ?? '',
      triggerContext: input.triggerContext ?? '',
      marketContext: input.marketContext ?? '',
      previousTradeId: previousTradeId ?? null,
      nextTradeId: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.journalSessionAnalyses.add(record);
    return record;
  },

  /** چند تحلیل (هر تایم‌فریم یک رویداد جدا) در یک تراکنش؛ رکوردهای قبلی هرگز بازنویسی نمی‌شوند. */
  async createAnalysisEvents(inputs: AnalysisEventInput[]): Promise<JournalSessionAnalysis[]> {
    const created: JournalSessionAnalysis[] = [];
    await db.transaction('rw', db.journalSessionAnalyses, db.journalSessions, db.journalOptions, db.trades, async () => {
      // کمی فاصلهٔ زمانی تا ترتیب تایم‌لاین همان ترتیب انتخاب کاربر بماند
      for (const [index, input] of inputs.entries()) {
        const record = await this.createAnalysisEvent(input);
        if (index > 0) {
          record.createdAt += index;
          record.updatedAt += index;
          await db.journalSessionAnalyses.put(record);
        }
        created.push(record);
      }
    });
    return created;
  },

  async updateAnalysisEvent(
    id: string,
    patch: Partial<Omit<AnalysisEventInput, 'sessionId'>>,
  ): Promise<JournalSessionAnalysis> {
    const current = await db.journalSessionAnalyses.get(id);
    if (!current) throw new Error('تحلیل پیدا نشد.');
    if (patch.timeframeOptionId && patch.timeframeOptionId !== current.timeframeOptionId) {
      const timeframe = await db.journalOptions.get(patch.timeframeOptionId);
      if (!timeframe || timeframe.category !== 'timeframe') throw new Error('تایم‌فریم معتبر انتخاب نشده است.');
    }
    const next: JournalSessionAnalysis = {
      ...current,
      timeframeOptionId: patch.timeframeOptionId ?? current.timeframeOptionId,
      directionOptionId: patch.directionOptionId !== undefined ? patch.directionOptionId : current.directionOptionId,
      marketStructureOptionId: patch.marketStructureOptionId !== undefined ? patch.marketStructureOptionId : current.marketStructureOptionId,
      expectedDirectionOptionId: patch.expectedDirectionOptionId !== undefined ? patch.expectedDirectionOptionId : current.expectedDirectionOptionId,
      liquidityContextOptionIds: patch.liquidityContextOptionIds ? JSON.stringify(patch.liquidityContextOptionIds) : current.liquidityContextOptionIds,
      zones: patch.zones ?? current.zones,
      notes: patch.notes ?? current.notes,
      tags: patch.tags ? JSON.stringify(patch.tags) : current.tags,
      analysisText: patch.analysisText ?? current.analysisText ?? '',
      scenario: patch.scenario ?? current.scenario ?? '',
      triggerContext: patch.triggerContext ?? current.triggerContext ?? '',
      marketContext: patch.marketContext ?? current.marketContext ?? '',
      previousTradeId: patch.previousTradeId !== undefined ? patch.previousTradeId : current.previousTradeId ?? null,
      updatedAt: Date.now(),
    };
    await db.journalSessionAnalyses.put(next);
    return next;
  },

  /** حذف یک تحلیل: رسانه‌های خودش حذف و ارجاع تریگر/معامله به آن پاک می‌شود (خود معامله‌ها دست‌نخورده می‌مانند). */
  async deleteAnalysisEvent(id: string): Promise<void> {
    await db.transaction('rw', [db.journalSessionAnalyses, db.journalMedia, db.journalTriggers, db.trades], async () => {
      await db.journalMedia.where('analysisId').equals(id).delete();
      const triggers = await db.journalTriggers.where('analysisEventId').equals(id).toArray();
      for (const trigger of triggers) await db.journalTriggers.update(trigger.id, { analysisEventId: null, updatedAt: Date.now() });
      const trades = await db.trades.filter(trade => trade.analysisEventId === id).toArray();
      for (const trade of trades) await db.trades.update(trade.id, { analysisEventId: null });
      await db.journalSessionAnalyses.delete(id);
    });
  },

  // ───────────── رویدادهای تریگر ─────────────

  async getSessionTriggers(sessionId: string): Promise<JournalTriggerEvent[]> {
    return db.journalTriggers.where('sessionId').equals(sessionId).sortBy('createdAt');
  },

  async getTriggerForTrade(tradeId: string): Promise<JournalTriggerEvent | undefined> {
    return db.journalTriggers.where('tradeId').equals(tradeId).first();
  },

  async createTriggerEvent(input: TriggerEventInput): Promise<JournalTriggerEvent> {
    const session = await db.journalSessions.get(input.sessionId);
    if (!session) throw new Error('سشن پیدا نشد.');
    const now = Date.now();
    const record: JournalTriggerEvent = {
      id: uid(),
      sessionId: input.sessionId,
      timeframeOptionId: input.timeframeOptionId ?? null,
      analysisEventId: input.analysisEventId ?? null,
      tradeId: input.tradeId ?? null,
      triggerTypeOptionId: input.triggerTypeOptionId ?? null,
      triggerDescription: input.triggerDescription ?? '',
      marketMovement: input.marketMovement ?? '',
      entryReason: input.entryReason ?? '',
      confirmation: input.confirmation ?? '',
      direction: input.direction ?? null,
      status: input.status ?? (input.tradeId ? 'traded' : 'pending'),
      notes: input.notes ?? '',
      tags: JSON.stringify(input.tags ?? []),
      triggeredAt: input.triggeredAt ?? now,
      createdAt: now,
      updatedAt: now,
    };
    await db.transaction('rw', db.journalTriggers, db.trades, async () => {
      await db.journalTriggers.add(record);
      if (record.tradeId) await db.trades.update(record.tradeId, { triggerEventId: record.id });
    });
    return record;
  },

  async updateTriggerEvent(
    id: string,
    patch: Partial<Omit<TriggerEventInput, 'sessionId'>>,
  ): Promise<JournalTriggerEvent> {
    const current = await db.journalTriggers.get(id);
    if (!current) throw new Error('تریگر پیدا نشد.');
    const next: JournalTriggerEvent = {
      ...current,
      timeframeOptionId: patch.timeframeOptionId !== undefined ? patch.timeframeOptionId : current.timeframeOptionId,
      analysisEventId: patch.analysisEventId !== undefined ? patch.analysisEventId : current.analysisEventId,
      tradeId: patch.tradeId !== undefined ? patch.tradeId : current.tradeId,
      triggerTypeOptionId: patch.triggerTypeOptionId !== undefined ? patch.triggerTypeOptionId : current.triggerTypeOptionId,
      triggerDescription: patch.triggerDescription ?? current.triggerDescription,
      marketMovement: patch.marketMovement ?? current.marketMovement,
      entryReason: patch.entryReason ?? current.entryReason,
      confirmation: patch.confirmation ?? current.confirmation,
      direction: patch.direction !== undefined ? patch.direction : current.direction,
      status: patch.status ?? current.status,
      notes: patch.notes ?? current.notes,
      tags: patch.tags ? JSON.stringify(patch.tags) : current.tags,
      triggeredAt: patch.triggeredAt ?? current.triggeredAt,
      updatedAt: Date.now(),
    };
    await db.transaction('rw', db.journalTriggers, db.trades, async () => {
      await db.journalTriggers.put(next);
      if (next.tradeId && next.tradeId !== current.tradeId) await db.trades.update(next.tradeId, { triggerEventId: next.id });
    });
    return next;
  },

  /** حذف تریگر: رسانه‌های تریگر حذف می‌شوند و معامله (اگر بود) فقط ارجاعش را از دست می‌دهد. */
  async deleteTriggerEvent(id: string): Promise<void> {
    await db.transaction('rw', [db.journalTriggers, db.journalMedia, db.trades], async () => {
      await db.journalMedia.where('triggerId').equals(id).delete();
      const trades = await db.trades.filter(trade => trade.triggerEventId === id).toArray();
      for (const trade of trades) await db.trades.update(trade.id, { triggerEventId: null });
      await db.journalTriggers.delete(id);
    });
  },

  // ───────────── معامله از دل سشن ─────────────

  /**
   * ساخت معامله‌ی جدید (پیش‌نویس باز) که از قبل به سشن، آخرین تحلیل و (اختیاری) تریگر وصل است.
   * داده‌های سشن (حساب، باکس، استراتژی، نماد) دوباره در معامله پرسیده نمی‌شوند؛ فقط ارتباط ساخته می‌شود.
   */
  async createTradeFromSession(input: {
    sessionId: string;
    analysisEventId?: string | null;
    triggerEventId?: string | null;
    trade?: Partial<Trade>;
  }): Promise<Trade> {
    const session = await db.journalSessions.get(input.sessionId);
    if (!session) throw new Error('سشن پیدا نشد.');

    // اگر معامله از یک Trigger مشخص شروع شده باشد، Analysis همان Trigger
    // منبع اصلی رابطه است. این کار جلوی اتصال اشتباه Trade به «آخرین Analysis» را می‌گیرد.
    const trigger = input.triggerEventId
      ? await db.journalTriggers.get(input.triggerEventId)
      : undefined;
    if (input.triggerEventId && (!trigger || trigger.sessionId !== input.sessionId)) {
      throw new Error('تریگر انتخاب‌شده متعلق به این سشن نیست یا پیدا نشد.');
    }

    let analysisEventId = input.analysisEventId;
    if (analysisEventId === undefined) {
      analysisEventId = trigger?.analysisEventId ?? undefined;
      if (analysisEventId === undefined) {
        const analyses = await db.journalSessionAnalyses.where('sessionId').equals(input.sessionId).sortBy('createdAt');
        analysisEventId = analyses[analyses.length - 1]?.id ?? null;
      }
    }

    if (analysisEventId) {
      const analysis = await db.journalSessionAnalyses.get(analysisEventId);
      if (!analysis || analysis.sessionId !== input.sessionId) {
        throw new Error('تحلیل انتخاب‌شده متعلق به این سشن نیست یا پیدا نشد.');
      }
    }

    const trade = await tradeService.createTrade({
      ...input.trade,
      journalSessionId: input.sessionId,
      analysisEventId: analysisEventId ?? null,
      triggerEventId: input.triggerEventId ?? null,
    });

    await db.transaction('rw', db.journalSessionAnalyses, db.journalTriggers, async () => {
      if (analysisEventId) {
        const analysis = await db.journalSessionAnalyses.get(analysisEventId);
        // هر Analysis می‌تواند چند Trade داشته باشد؛ فقط اولین Trade را به عنوان nextTrade نگه می‌داریم.
        if (analysis && !analysis.nextTradeId) {
          await db.journalSessionAnalyses.update(analysisEventId, { nextTradeId: trade.id });
        }
      }
      if (input.triggerEventId) {
        await db.journalTriggers.update(input.triggerEventId, {
          tradeId: trade.id,
          status: 'traded',
          updatedAt: Date.now(),
        });
      }
    });
    return trade;
  },

  async getSessionTrades(sessionId: string): Promise<Trade[]> {
    const trades = await db.trades.where('journalSessionId').equals(sessionId).toArray();
    return trades.sort((a, b) => a.openedAt - b.openedAt);
  },

  /** رسانه‌های خودِ معامله (نه تریگر/مرور/تحلیل) */
  async getTradeMedia(tradeId: string): Promise<JournalMedia[]> {
    const rows = await db.journalMedia.where('tradeId').equals(tradeId).sortBy('createdAt');
    return rows.filter(m => !m.triggerId && !m.reviewId && !m.analysisId);
  },

  async getSessionMedia(sessionId: string): Promise<JournalMedia[]> {
    return db.journalMedia.where('sessionId').equals(sessionId).sortBy('createdAt');
  },

  async getSessionTimeline(sessionId: string): Promise<SessionTimelineItem[]> {
    const bundle = await this.getBundle(sessionId);
    if (!bundle) return [];
    return buildSessionTimeline(bundle);
  },

  /** زمینهٔ فقط‌خواندنی یک معامله: سشن، تحلیل و تریگر متصل (بدون کپی داده در خود معامله) */
  async getTradeContext(tradeId: string): Promise<{
    trade: Trade;
    session?: JournalSession;
    account?: Account;
    strategy?: Strategy;
    strategyVersion?: StrategyVersion;
    analysis?: JournalSessionAnalysis;
    trigger?: JournalTriggerEvent;
    options: JournalOption[];
  } | undefined> {
    const trade = await db.trades.get(tradeId);
    if (!trade) return undefined;
    const session = trade.journalSessionId ? await db.journalSessions.get(trade.journalSessionId) : undefined;
    const [account, strategy, strategyVersion, analysis, trigger, options] = await Promise.all([
      session ? db.accounts.get(session.accountId) : Promise.resolve(undefined),
      session ? db.strategies.get(session.strategyId) : Promise.resolve(undefined),
      session ? db.strategyVersions.get(session.strategyVersionId) : Promise.resolve(undefined),
      trade.analysisEventId ? db.journalSessionAnalyses.get(trade.analysisEventId) : Promise.resolve(undefined),
      trade.triggerEventId ? db.journalTriggers.get(trade.triggerEventId) : db.journalTriggers.where('tradeId').equals(tradeId).first(),
      this.getOptions(undefined, true),
    ]);
    return { trade, session, account, strategy, strategyVersion, analysis, trigger, options };
  },

  /** خلاصهٔ مرور سشن — همهٔ اعداد از موتور محاسبات (calculateMetrics → core/metrics) می‌آیند، نه از متن آزاد. */
  async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    const [trades, analyses, triggers, events] = await Promise.all([
      this.getSessionTrades(sessionId),
      this.getSessionAnalyses(sessionId),
      this.getSessionTriggers(sessionId),
      db.journalSessionEvents.where('sessionId').equals(sessionId).toArray(),
    ]);
    return {
      ...this.calculateMetrics(trades),
      analysisCount: analyses.length,
      triggerCount: triggers.length,
      triggersTraded: triggers.filter(t => t.status === 'traded' || Boolean(t.tradeId)).length,
      triggersSkipped: triggers.filter(t => t.status === 'skipped').length,
      triggersInvalid: triggers.filter(t => t.status === 'invalid').length,
      noTradeEvents: events.length,
    };
  },

  async getAnalytics(filters: JournalAnalyticsFilters = {}): Promise<{ trades: Trade[]; tradeData: JournalTradeData[]; metrics: JournalSessionMetrics }> {
    let trades = await db.trades.toArray();
    const [sessions, analyses, allMeta] = await Promise.all([
      db.journalSessions.toArray(),
      db.journalSessionAnalyses.toArray(),
      db.journalTradeData.toArray(),
    ]);
    const sessionById = new Map(sessions.map(session => [session.id, session]));
    const metaByTradeId = new Map(allMeta.map(meta => [meta.tradeId, meta]));
    const analysisBySession = new Map<string, JournalSessionAnalysis[]>();
    for (const analysis of analyses) {
      analysisBySession.set(analysis.sessionId, [...(analysisBySession.get(analysis.sessionId) ?? []), analysis]);
    }

    trades = trades.filter(trade => {
      const session = trade.journalSessionId ? sessionById.get(trade.journalSessionId) : undefined;
      const meta = metaByTradeId.get(trade.id);
      if (!session) return false;
      if (filters.accountId && session.accountId !== filters.accountId) return false;
      if (filters.tradingBoxId && session.tradingBoxId !== filters.tradingBoxId) return false;
      if (filters.strategyId && session.strategyId !== filters.strategyId) return false;
      if (filters.strategyVersionId && session.strategyVersionId !== filters.strategyVersionId) return false;
      if (filters.sessionId && session.id !== filters.sessionId) return false;
      if (filters.symbol && !parseArray(session.symbols).some(symbol => symbol.toLowerCase().includes(filters.symbol!.toLowerCase()))) return false;
      if (filters.from != null && trade.openedAt < filters.from) return false;
      if (filters.to != null && trade.openedAt > filters.to) return false;
      if (filters.entryTriggerOptionId && !parseArray(meta?.entryTriggerOptionIds).includes(filters.entryTriggerOptionId)) return false;
      if (filters.exitReasonOptionId && meta?.exitReasonOptionId !== filters.exitReasonOptionId) return false;
      if (filters.psychologyOptionId && !psychologyHasOption(meta?.psychology, filters.psychologyOptionId)) return false;
      if (filters.mistakeOptionId && !parseArray(meta?.mistakeOptionIds).includes(filters.mistakeOptionId)) return false;
      if (filters.setupGradeOptionId && meta?.setupGradeOptionId !== filters.setupGradeOptionId) return false;
      if (filters.scoTypeOptionId && meta?.scoTypeOptionId !== filters.scoTypeOptionId) return false;
      if (filters.fvgTypeOptionId && meta?.fvgTypeOptionId !== filters.fvgTypeOptionId) return false;
      if (filters.minSetupQuality != null && (meta?.setupQuality == null || meta.setupQuality < filters.minSetupQuality)) return false;
      if (filters.maxSetupQuality != null && (meta?.setupQuality == null || meta.setupQuality > filters.maxSetupQuality)) return false;
      if (filters.minExecutionQuality != null && (meta?.executionQuality == null || meta.executionQuality < filters.minExecutionQuality)) return false;
      if (filters.maxExecutionQuality != null && (meta?.executionQuality == null || meta.executionQuality > filters.maxExecutionQuality)) return false;
      if (filters.strategyCompliance && meta?.strategyCompliance !== filters.strategyCompliance) return false;
      if (filters.timeframeOptionId && !(analysisBySession.get(session.id) ?? []).some(item => item.timeframeOptionId === filters.timeframeOptionId)) return false;
      return true;
    });
    const tradeData = trades.map(trade => metaByTradeId.get(trade.id)).filter((item): item is JournalTradeData => Boolean(item));
    return { trades, tradeData, metrics: this.calculateMetrics(trades) };
  },
};

export function parseJournalArray(value: string | null | undefined): string[] {
  return parseArray(value);
}
