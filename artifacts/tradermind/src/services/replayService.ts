import {
  db,
  ReplayDataset, ReplayDatasetType,
  ReplaySession, ReplayStatus, ReplayMode, CoachingMode,
  ReplayDecision, ReplayDecisionAction,
  ReplayPlaylist,
  ReplayCandle, ReplayScreenshotItem,
} from '../db/database';

// ── Helpers ────────────────────────────────────────────────────────

function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(number) ? number : null;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  const numeric = finiteNumber(value);
  if (numeric !== null && numeric > 0) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function normalizeReplayCandle(
  item: Partial<ReplayCandle> & Record<string, unknown>,
  timeframe: string,
  fallbackTimestamp: number,
): ReplayCandle | null {
  const open = finiteNumber(item.open ?? item.o);
  const close = finiteNumber(item.close ?? item.c);
  if (open === null || close === null) return null;

  const highValue = finiteNumber(item.high ?? item.h);
  const lowValue = finiteNumber(item.low ?? item.l);
  const high = highValue ?? Math.max(open, close);
  const low = lowValue ?? Math.min(open, close);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high < Math.max(open, close) || low > Math.min(open, close) || high < low) {
    return null;
  }

  const volume = finiteNumber(item.volume ?? item.v);
  return {
    timestamp: normalizeTimestamp(item.timestamp ?? item.time ?? item.t, fallbackTimestamp),
    open,
    high,
    low,
    close,
    volume: volume === null ? undefined : volume,
    timeframe,
  };
}

// ── CSV Parser ────────────────────────────────────────────────────

export function parseCSVCandles(csv: string, timeframe: string): ReplayCandle[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const idxOf = (names: string[]) => names.map(n => header.indexOf(n)).find(i => i !== -1) ?? -1;

  const tsIdx    = idxOf(['timestamp', 'time', 'date', 'datetime', 'date_time']);
  const openIdx  = idxOf(['open', 'o']);
  const highIdx  = idxOf(['high', 'h']);
  const lowIdx   = idxOf(['low', 'l']);
  const closeIdx = idxOf(['close', 'c']);
  const volIdx   = idxOf(['volume', 'vol', 'v']);

  if (openIdx === -1 || closeIdx === -1) throw new Error('فایل CSV باید حداقل ستون‌های open و close داشته باشد');

  const candles: ReplayCandle[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 3) continue;

    const fallbackTimestamp = Date.now() - (lines.length - i) * 60_000;
    const normalized = normalizeReplayCandle({
      timestamp: tsIdx === -1 ? undefined : cells[tsIdx],
      open: cells[openIdx],
      high: highIdx === -1 ? undefined : cells[highIdx],
      low: lowIdx === -1 ? undefined : cells[lowIdx],
      close: cells[closeIdx],
      volume: volIdx === -1 ? undefined : cells[volIdx],
    } as unknown as Record<string, unknown>, timeframe, fallbackTimestamp);
    if (normalized) candles.push(normalized);
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

// ── Dataset Service ────────────────────────────────────────────────

export const datasetService = {

  async getAll(): Promise<ReplayDataset[]> {
    return db.replayDatasets.orderBy('createdAt').reverse().toArray();
  },

  async getById(id: string): Promise<ReplayDataset | undefined> {
    return db.replayDatasets.get(id);
  },

  async createFromCSV(name: string, symbol: string, timeframe: string, csv: string): Promise<ReplayDataset> {
    const candles = parseCSVCandles(csv, timeframe);
    if (candles.length === 0) throw new Error('هیچ کندلی در فایل CSV یافت نشد');
    const now = Date.now();
    const ds: ReplayDataset = {
      id: createId('dataset'),
      name,
      symbol,
      timeframe,
      type: 'candles',
      data: JSON.stringify(candles),
      sourceTradeId: null,
      totalItems: candles.length,
      startDate: candles[0].timestamp,
      endDate: candles[candles.length - 1].timestamp,
      tags: '[]',
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.replayDatasets.add(ds);
    return ds;
  },

  async createFromScreenshots(name: string, symbol: string, timeframe: string, items: ReplayScreenshotItem[]): Promise<ReplayDataset> {
    if (items.length === 0) throw new Error('حداقل یک تصویر لازم است');
    const now = Date.now();
    const ds: ReplayDataset = {
      id: createId('dataset'),
      name,
      symbol,
      timeframe,
      type: 'screenshots',
      data: JSON.stringify(items),
      sourceTradeId: null,
      totalItems: items.length,
      startDate: items[0].timestamp ?? null,
      endDate: items[items.length - 1].timestamp ?? null,
      tags: '[]',
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.replayDatasets.add(ds);
    return ds;
  },

  async createFromTrade(tradeId: string): Promise<ReplayDataset> {
    const trade = await db.trades.get(tradeId);
    if (!trade) throw new Error('معامله یافت نشد');
    const now = Date.now();
    const screenshots = parseJSON<ReplayScreenshotItem[]>(trade.screenshots, []);
    const ds: ReplayDataset = {
      id: createId('dataset'),
      name: `معامله ${trade.symbol} — ${new Date(trade.openedAt).toLocaleDateString('fa-IR')}`,
      symbol: trade.symbol,
      timeframe: '—',
      type: 'trade',
      data: JSON.stringify(screenshots),
      sourceTradeId: tradeId,
      totalItems: screenshots.length,
      startDate: trade.openedAt,
      endDate: trade.closedAt,
      tags: '[]',
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.replayDatasets.add(ds);
    return ds;
  },

  async delete(id: string): Promise<void> {
    await db.replayDatasets.delete(id);
  },

  getCandles(ds: ReplayDataset): ReplayCandle[] {
    const raw = parseJSON<unknown[]>(ds.data, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item, index) => item && typeof item === 'object'
        ? normalizeReplayCandle(item as Record<string, unknown>, ds.timeframe, Date.now() - (raw.length - index) * 60_000)
        : null)
      .filter((candle): candle is ReplayCandle => candle !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
  },

  getScreenshots(ds: ReplayDataset): ReplayScreenshotItem[] {
    const raw = parseJSON<unknown[]>(ds.data, []);
    return Array.isArray(raw) ? raw.filter((item): item is ReplayScreenshotItem => Boolean(item && typeof item === 'object')) : [];
  },
};

// ── Session Service ────────────────────────────────────────────────

export const sessionService = {

  async getAll(filters: { status?: ReplayStatus; symbol?: string; mode?: ReplayMode } = {}): Promise<ReplaySession[]> {
    let sessions = await db.replaySessions.orderBy('createdAt').reverse().toArray();
    if (filters.status) sessions = sessions.filter(s => s.status === filters.status);
    if (filters.symbol) sessions = sessions.filter(s => s.symbol?.toLowerCase().includes(filters.symbol!.toLowerCase()));
    if (filters.mode)   sessions = sessions.filter(s => s.mode === filters.mode);
    return sessions;
  },

  async getById(id: string): Promise<ReplaySession | undefined> {
    return db.replaySessions.get(id);
  },

  async create(params: {
    title: string;
    mode: ReplayMode;
    coachingMode: CoachingMode;
    datasetId?: string;
    sourceTradeId?: string;
    playlistId?: string;
    revealCount?: number;
    additionalDatasets?: string; // JSON {[timeframe]: datasetId}
  }): Promise<ReplaySession> {
    // Get total steps from dataset
    let totalSteps = 1;
    let symbol: string | null = null;
    let timeframe: string | null = null;
    let originalEntry: number | null = null;
    let originalResult: string | null = null;
    let originalRMultiple: number | null = null;

    if (params.datasetId) {
      const ds = await db.replayDatasets.get(params.datasetId);
      if (!ds) throw new Error('دیتاست ری‌پلی یافت نشد یا حذف شده است');
      if (!Number.isInteger(ds.totalItems) || ds.totalItems <= 0) {
        throw new Error('دیتاست ری‌پلی خالی یا ناقص است');
      }
      totalSteps = ds.totalItems;
      symbol = ds.symbol;
      timeframe = ds.timeframe;
    }

    if (params.sourceTradeId) {
      const trade = await db.trades.get(params.sourceTradeId);
      if (trade) {
        symbol = trade.symbol;
        originalEntry = trade.entryPrice;
        originalResult = trade.result;
        originalRMultiple = trade.rMultiple;
      }
    }

    const now = Date.now();
    const session: ReplaySession = {
      id: createId('session'),
      title: params.title,
      mode: params.mode,
      coachingMode: params.coachingMode,
      symbol,
      timeframe,
      datasetId: params.datasetId ?? null,
      sourceTradeId: params.sourceTradeId ?? null,
      playlistId: params.playlistId ?? null,
      additionalDatasets: params.additionalDatasets ?? null,
      activeTimeframe: timeframe,
      status: 'active',
      currentStep: 0,
      totalSteps,
      revealCount: params.revealCount ?? 1,
      startedAt: now,
      completedAt: null,
      simulatedDirection: null,
      simulatedEntry: null,
      simulatedSL: null,
      simulatedTP: null,
      simulatedResult: null,
      simulatedRMultiple: null,
      simulatedClosedAt: null,
      originalEntry,
      originalResult,
      originalRMultiple,
      decisionQualityScore: null,
      performanceSummary: null,
      lessonSuggestions: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.replaySessions.add(session);
    return session;
  },

  async advance(sessionId: string, stepsToReveal: number = 1): Promise<ReplaySession | undefined> {
    const session = await db.replaySessions.get(sessionId);
    if (!session || session.status !== 'active') return session;

    const newStep = Math.min(session.currentStep + stepsToReveal, session.totalSteps);
    const isComplete = newStep >= session.totalSteps;

    await db.replaySessions.update(sessionId, {
      currentStep: newStep,
      status: isComplete ? 'completed' : 'active',
      completedAt: isComplete ? Date.now() : null,
      updatedAt: Date.now(),
    });

    return db.replaySessions.get(sessionId);
  },

  async openSimulatedPosition(sessionId: string, params: {
    direction: 'long' | 'short';
    entry: number;
    sl: number;
    tp: number;
    riskPercent?: number;
  }): Promise<void> {
    await db.replaySessions.update(sessionId, {
      simulatedDirection: params.direction,
      simulatedEntry: params.entry,
      simulatedSL: params.sl,
      simulatedTP: params.tp,
      updatedAt: Date.now(),
    });
  },

  async closeSimulatedPosition(sessionId: string, closePrice: number): Promise<void> {
    const session = await db.replaySessions.get(sessionId);
    if (
      !session
      || typeof session.simulatedEntry !== 'number'
      || !Number.isFinite(session.simulatedEntry)
      || typeof session.simulatedSL !== 'number'
      || !Number.isFinite(session.simulatedSL)
    ) return;
    const simulatedEntry: number = session.simulatedEntry;
    const simulatedSL: number = session.simulatedSL;

    const priceDiff = closePrice - simulatedEntry;
    const direction = session.simulatedDirection === 'long' ? 1 : -1;
    const slDiff = Math.abs(simulatedEntry - simulatedSL);
    const rMultiple = slDiff > 0 ? (priceDiff * direction) / slDiff : 0;

    let result: ReplaySession['simulatedResult'] = 'breakeven';
    if (rMultiple > 0.1) result = 'win';
    else if (rMultiple < -0.1) result = 'loss';

    await db.replaySessions.update(sessionId, {
      simulatedResult: result,
      simulatedRMultiple: rMultiple,
      simulatedClosedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },

  async updateSLTP(sessionId: string, sl?: number, tp?: number): Promise<void> {
    const updates: Partial<ReplaySession> = { updatedAt: Date.now() };
    if (sl !== undefined) updates.simulatedSL = sl;
    if (tp !== undefined) updates.simulatedTP = tp;
    await db.replaySessions.update(sessionId, updates);
  },

  async setStatus(sessionId: string, status: ReplayStatus): Promise<void> {
    const updates: Partial<ReplaySession> = {
      status,
      updatedAt: Date.now(),
    };
    if (status === 'completed' || status === 'abandoned') {
      updates.completedAt = Date.now();
    }
    await db.replaySessions.update(sessionId, updates);
  },

  async saveReview(sessionId: string, reviewNotes: string, lessonSuggestions: string[]): Promise<void> {
    await db.replaySessions.update(sessionId, {
      reviewNotes,
      lessonSuggestions: JSON.stringify(lessonSuggestions),
      updatedAt: Date.now(),
    });
  },

  /**
   * PART 1-4: حذف session و تمام decisions آن در یک transaction واحد (Atomic)
   */
  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.replaySessions, db.replayDecisions], async () => {
      await db.replayDecisions.where('sessionId').equals(id).delete();
      await db.replaySessions.delete(id);
    });
  },
};

// ── Decision Service ───────────────────────────────────────────────

export const decisionService = {

  async forSession(sessionId: string): Promise<ReplayDecision[]> {
    return db.replayDecisions.where('sessionId').equals(sessionId).sortBy('step');
  },

  async log(sessionId: string, params: {
    step: number;
    action: ReplayDecisionAction;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    riskPercent?: number;
    whatISee?: string;
    whyEnter?: string;
    whyWait?: string;
    invalidation?: string;
    marketCondition?: string;
    confidence?: number;
    historicalTimestamp?: number;
    timeframe?: string;
    timeToDecide?: number;
  }): Promise<ReplayDecision> {
    const now = Date.now();
    const decision: ReplayDecision = {
      id: crypto.randomUUID(),
      sessionId,
      step: params.step,
      madeAt: now,
      historicalTimestamp: params.historicalTimestamp ?? null,
      timeframe: params.timeframe ?? null,
      action: params.action,
      entryPrice: params.entryPrice ?? null,
      stopLoss: params.stopLoss ?? null,
      takeProfit: params.takeProfit ?? null,
      riskPercent: params.riskPercent ?? null,
      whatISee: params.whatISee ?? null,
      whyEnter: params.whyEnter ?? null,
      whyWait: params.whyWait ?? null,
      invalidation: params.invalidation ?? null,
      marketCondition: params.marketCondition ?? null,
      confidence: params.confidence ?? null,
      timeToDecide: params.timeToDecide ?? null,
      visibleContext: null,
      outcomeAfterDecision: null,
      qualityScore: null,
      qualityBreakdown: null,
      createdAt: now,
    };
    await db.replayDecisions.add(decision);
    return decision;
  },

  // Score decision quality based on rules and session context
  async scoreDecision(decisionId: string, session: ReplaySession, candles: ReplayCandle[], revealedCount: number): Promise<number> {
    const decision = await db.replayDecisions.get(decisionId);
    if (!decision) return 0;

    let score = 50; // neutral base
    const breakdown: Record<string, number> = {};

    // 1. Had a plan (reasoning captured)
    const hasReasoning = !!(decision.whatISee || decision.whyEnter || decision.marketCondition);
    if (hasReasoning) { score += 10; breakdown.reasoning = 10; }

    // 2. Confidence stated
    if (decision.confidence !== null && decision.confidence > 0) {
      score += 5; breakdown.confidence = 5;
    }

    // 3. Risk defined (if trade taken)
    if ((decision.action === 'long' || decision.action === 'short') && decision.stopLoss !== null && decision.entryPrice !== null) {
      score += 10; breakdown.riskDefined = 10;
    }

    // 4. Quick decision (not impulsive, not too slow): between 5s and 3min is "good"
    if (decision.timeToDecide !== null) {
      const sec = decision.timeToDecide / 1000;
      if (sec >= 5 && sec <= 180) { score += 10; breakdown.timing = 10; }
      else if (sec < 5) { score -= 5; breakdown.timing = -5; } // impulsive
    }

    // 5. If no-trade was chosen, it's often valid — don't penalize
    if (decision.action === 'no-trade') {
      score += 5; breakdown.discipline = 5;
    }

    // 6. SL/TP ratio reasonable (at least 1:1 risk reward)
    if (decision.entryPrice && decision.stopLoss && decision.takeProfit) {
      const risk   = Math.abs(decision.entryPrice - decision.stopLoss);
      const reward = Math.abs(decision.takeProfit - decision.entryPrice);
      if (risk > 0 && reward / risk >= 1.0) { score += 10; breakdown.riskReward = 10; }
      else if (risk > 0 && reward / risk < 0.5) { score -= 10; breakdown.riskReward = -10; }
    }

    const finalScore = Math.max(0, Math.min(100, score));

    await db.replayDecisions.update(decisionId, {
      qualityScore: finalScore,
      qualityBreakdown: JSON.stringify(breakdown),
    });

    return finalScore;
  },
};

// ── Playlist Service ───────────────────────────────────────────────

export const playlistService = {

  async getAll(): Promise<ReplayPlaylist[]> {
    return db.replayPlaylists.orderBy('createdAt').toArray();
  },

  async create(params: Omit<ReplayPlaylist, 'id' | 'totalReplayed' | 'lastUsedAt' | 'createdAt' | 'updatedAt'>): Promise<ReplayPlaylist> {
    const now = Date.now();
    const pl: ReplayPlaylist = {
      ...params,
      id: crypto.randomUUID(),
      totalReplayed: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.replayPlaylists.add(pl);
    return pl;
  },

  async update(id: string, data: Partial<ReplayPlaylist>): Promise<void> {
    await db.replayPlaylists.update(id, { ...data, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.replayPlaylists.delete(id);
  },

  async incrementUsed(id: string): Promise<void> {
    const pl = await db.replayPlaylists.get(id);
    if (!pl) return;
    await db.replayPlaylists.update(id, {
      totalReplayed: pl.totalReplayed + 1,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
};

// ── Personalized Replay Selection ─────────────────────────────────

export async function getPersonalizedSuggestions(): Promise<{
  label: string;
  description: string;
  icon: string;
  trades: import('../db/database').Trade[];
  weakness?: string;
}[]> {
  const trades = await db.trades.where('status').equals('closed').toArray();
  if (trades.length < 2) return [];

  const suggestions = [];

  // 1. Early entry weakness
  const earlyEntries = trades.filter(t => {
    try { const ptr = JSON.parse(t.postTradeReview || '{}'); return ptr.entryTiming === 'early' || ptr.entryTiming === 'chased'; } catch { return false; }
  });
  if (earlyEntries.length >= 2) {
    suggestions.push({
      label: 'تمرین ورود زودهنگام',
      description: `${earlyEntries.length} معامله با ورود زودهنگام — تمرین صبر`,
      icon: '⏰',
      trades: earlyEntries.slice(0, 5),
      weakness: 'early-entry',
    });
  }

  // 2. FOMO / behavior flags
  const fomoTrades = trades.filter(t => {
    try { const ptr = JSON.parse(t.postTradeReview || '{}'); return (ptr.behaviorFlags || []).includes('fomo'); } catch { return false; }
  });
  if (fomoTrades.length >= 2) {
    suggestions.push({
      label: 'تمرین FOMO',
      description: `${fomoTrades.length} معامله با FOMO — تمرین انضباط`,
      icon: '🎯',
      trades: fomoTrades.slice(0, 5),
      weakness: 'fomo',
    });
  }

  // 3. No confirmation
  const noConfirmTrades = trades.filter(t => {
    try { const ptr = JSON.parse(t.postTradeReview || '{}'); return ptr.enteredWithConfirmation === false; } catch { return false; }
  });
  if (noConfirmTrades.length >= 2) {
    suggestions.push({
      label: 'تمرین تأیید ورود',
      description: `${noConfirmTrades.length} معامله بدون تأیید — تمرین انتظار`,
      icon: '✅',
      trades: noConfirmTrades.slice(0, 5),
      weakness: 'no-confirmation',
    });
  }

  // 4. Best wins
  const wins = trades.filter(t => t.result === 'win' && t.rMultiple !== null && t.rMultiple > 1.5)
    .sort((a, b) => (b.rMultiple ?? 0) - (a.rMultiple ?? 0));
  if (wins.length >= 2) {
    suggestions.push({
      label: 'بهترین معاملات',
      description: `${wins.length} معامله برنده قوی — تقویت الگوهای خوب`,
      icon: '🏆',
      trades: wins.slice(0, 5),
    });
  }

  // 5. Recent trades (last 7)
  const recent = trades.slice(0, 7);
  if (recent.length > 0) {
    suggestions.push({
      label: 'معاملات اخیر',
      description: `${recent.length} معامله اخیر — مرور تصمیمات`,
      icon: '📅',
      trades: recent,
    });
  }

  return suggestions;
}

// ── Lesson Suggestion ─────────────────────────────────────────────

export function generateLessonSuggestion(session: ReplaySession, decisions: ReplayDecision[]): string[] {
  const lessons: string[] = [];

  if (!decisions.length) return lessons;

  const mainDecision = decisions.find(d => d.action === 'long' || d.action === 'short');
  const wasNoTrade  = decisions.every(d => d.action === 'no-trade' || d.action === 'wait');

  // Compare simulated vs original
  if (session.simulatedRMultiple !== null && session.originalRMultiple !== null) {
    const diff = session.simulatedRMultiple - session.originalRMultiple;
    if (diff > 0.5) {
      lessons.push(`در ری‌پلی، R بهتری (${session.simulatedRMultiple.toFixed(2)}) نسبت به معامله اصلی (${session.originalRMultiple.toFixed(2)}) بدست آوردید — احتمالاً مدیریت بهتر ریسک`);
    } else if (diff < -0.5) {
      lessons.push(`در معامله اصلی عملکرد بهتری (${session.originalRMultiple.toFixed(2)}R) داشتید — رویکرد اصلی را مطالعه کنید`);
    }
  }

  // Was no-trade when original was a trade
  if (wasNoTrade && session.originalEntry !== null) {
    if (session.originalResult === 'win') {
      lessons.push('در ری‌پلی وارد نشدید، اما معامله اصلی برنده بود — تمرین شناخت ستاپ معتبر لازم است');
    } else {
      lessons.push('در ری‌پلی از معامله صرف‌نظر کردید و معامله اصلی هم ضررده بود — صبر و انتخاب درست');
    }
  }

  // Quick decision (possible impulsive)
  const avgTime = decisions.reduce((s, d) => s + (d.timeToDecide ?? 0), 0) / decisions.length;
  if (avgTime < 5000 && mainDecision) {
    lessons.push('تصمیم بسیار سریع گرفته شد — تمرین مکث قبل از ورود را در نظر بگیرید');
  }

  // Good quality score
  const avgQuality = decisions.reduce((s, d) => s + (d.qualityScore ?? 50), 0) / decisions.length;
  if (avgQuality >= 75) {
    lessons.push('کیفیت تصمیم‌گیری در این ری‌پلی خوب بود — این الگو را ادامه دهید');
  } else if (avgQuality < 40) {
    lessons.push('کیفیت تصمیم‌گیری نیاز به بهبود دارد — استدلال بیشتری قبل از ورود بنویسید');
  }

  // Reasoning was missing
  if (mainDecision && !mainDecision.whatISee && !mainDecision.whyEnter) {
    lessons.push('استدلال ورود ثبت نشد — نوشتن دلیل ورود کمک می‌کند تأییدیه بهتری داشته باشید');
  }

  return lessons.slice(0, 4); // max 4 lesson suggestions
}

// ── Analytics ─────────────────────────────────────────────────────

export async function getReplayAnalytics() {
  const sessions = await db.replaySessions.toArray();
  const completed = sessions.filter(s => s.status === 'completed');
  const decisions = await db.replayDecisions.toArray();

  if (completed.length === 0) return null;

  const winRate = completed.filter(s => s.simulatedResult === 'win').length / (completed.filter(s => s.simulatedResult !== null && s.simulatedResult !== 'no-trade').length || 1);
  const avgR    = completed.filter(s => s.simulatedRMultiple !== null).reduce((sum, s) => sum + (s.simulatedRMultiple ?? 0), 0) / (completed.filter(s => s.simulatedRMultiple !== null).length || 1);
  const avgQuality = completed.filter(s => s.decisionQualityScore !== null).reduce((sum, s) => sum + (s.decisionQualityScore ?? 0), 0) / (completed.filter(s => s.decisionQualityScore !== null).length || 1);

  // Average time to decide (ms)
  const allDecisions = decisions.filter(d => d.timeToDecide !== null);
  const avgTimeToDecide = allDecisions.length ? allDecisions.reduce((s, d) => s + (d.timeToDecide ?? 0), 0) / allDecisions.length : null;

  // Trend: compare first half vs second half quality
  const qualityByOrder = completed
    .filter(s => s.decisionQualityScore !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(s => s.decisionQualityScore ?? 0);
  const half = Math.floor(qualityByOrder.length / 2);
  const earlyAvg  = half > 0 ? qualityByOrder.slice(0, half).reduce((a, b) => a + b, 0) / half : null;
  const recentAvg = half > 0 ? qualityByOrder.slice(half).reduce((a, b) => a + b, 0) / (qualityByOrder.length - half) : null;
  const improving = earlyAvg !== null && recentAvg !== null ? recentAvg > earlyAvg : null;

  // By mode breakdown
  const byMode: Record<string, number> = {};
  completed.forEach(s => { byMode[s.mode] = (byMode[s.mode] || 0) + 1; });

  // Monthly sessions
  const byMonth: Record<string, number> = {};
  completed.forEach(s => {
    const key = new Date(s.createdAt).toISOString().slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + 1;
  });

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    winRate,
    avgR,
    avgQuality,
    avgTimeToDecide,
    improving,
    earlyAvg,
    recentAvg,
    byMode,
    byMonth,
    recentSessions: completed.slice(-5).reverse(),
  };
}

// ── Alternative Decision Analysis ─────────────────────────────────

export interface AlternativeScenario {
  label: string;
  description: string;
  rMultiple: number | null;
  result: 'win' | 'loss' | 'breakeven' | null;
  diff: string;
}

export function getAlternativeAnalysis(
  session: ReplaySession,
  decisions: ReplayDecision[],
  candles: ReplayCandle[],
): AlternativeScenario[] {
  const scenarios: AlternativeScenario[] = [];
  const mainDec = decisions.find(d => d.action === 'long' || d.action === 'short');
  if (!mainDec || !mainDec.entryPrice || !mainDec.stopLoss) return scenarios;

  const entry = mainDec.entryPrice;
  const sl    = mainDec.stopLoss;
  const tp    = mainDec.takeProfit;
  const dir   = mainDec.action === 'long' ? 1 : -1;
  const slRisk = Math.abs(entry - sl);

  const calcR = (exitPrice: number) =>
    slRisk > 0 ? ((exitPrice - entry) * dir) / slRisk : 0;

  const classify = (r: number): AlternativeScenario['result'] =>
    r > 0.1 ? 'win' : r < -0.1 ? 'loss' : 'breakeven';

  // Scenario 1: Tighter SL (50% of original risk)
  if (slRisk > 0) {
    const tightSL = mainDec.action === 'long' ? entry - slRisk * 0.5 : entry + slRisk * 0.5;
    const tightRisk = Math.abs(entry - tightSL);
    const exitC = candles[session.currentStep - 1];
    if (exitC) {
      const r = tightRisk > 0 ? ((exitC.close - entry) * dir) / tightRisk : 0;
      scenarios.push({
        label: 'SL نزدیک‌تر (۵۰٪)',
        description: `SL روی ${tightSL.toFixed(4)} — ریسک نصف`,
        rMultiple: parseFloat(r.toFixed(2)),
        result: classify(r),
        diff: r > (session.simulatedRMultiple ?? 0) ? '📈 بهتر' : r < (session.simulatedRMultiple ?? 0) ? '📉 بدتر' : '≈ مشابه',
      });
    }
  }

  // Scenario 2: Wider SL (150% of original risk)
  if (slRisk > 0) {
    const wideSL = mainDec.action === 'long' ? entry - slRisk * 1.5 : entry + slRisk * 1.5;
    const wideRisk = Math.abs(entry - wideSL);
    const exitC = candles[session.currentStep - 1];
    if (exitC) {
      const r = wideRisk > 0 ? ((exitC.close - entry) * dir) / wideRisk : 0;
      scenarios.push({
        label: 'SL گسترده‌تر (۱۵۰٪)',
        description: `SL روی ${wideSL.toFixed(4)} — ریسک بیشتر`,
        rMultiple: parseFloat(r.toFixed(2)),
        result: classify(r),
        diff: r > (session.simulatedRMultiple ?? 0) ? '📈 بهتر' : r < (session.simulatedRMultiple ?? 0) ? '📉 بدتر' : '≈ مشابه',
      });
    }
  }

  // Scenario 3: No trade — what was the actual outcome?
  if (candles.length > 0) {
    const lastCandle = candles[candles.length - 1];
    scenarios.push({
      label: 'اگر وارد نمی‌شدید',
      description: 'عدم ورود به معامله',
      rMultiple: 0,
      result: 'breakeven',
      diff: (session.simulatedRMultiple ?? 0) > 0 ? '📉 فرصت از دست رفته' : '✅ زیان اجتناب شد',
    });
  }

  // Scenario 4: TP hit (if TP defined and candles show it was hit)
  if (tp) {
    const tpHit = candles.some(c =>
      mainDec.action === 'long' ? c.high >= tp : c.low <= tp
    );
    if (tpHit) {
      const tpR = slRisk > 0 ? Math.abs(tp - entry) / slRisk : 0;
      scenarios.push({
        label: 'اگر روی TP می‌بستید',
        description: `TP روی ${tp.toFixed(4)} — خروج در هدف`,
        rMultiple: parseFloat((tpR * dir > 0 ? tpR : -tpR).toFixed(2)),
        result: 'win',
        diff: tpR > (session.simulatedRMultiple ?? 0) ? '📈 بهتر' : '≈ مشابه',
      });
    }
  }

  // Scenario 5: If waited 5 more candles to enter
  if (candles.length > (mainDec.step || 0) + 5) {
    const laterCandle = candles[Math.min((mainDec.step || 0) + 5, candles.length - 1)];
    const laterEntry = laterCandle.close;
    const laterExitCandle = candles[session.currentStep - 1];
    if (laterExitCandle && slRisk > 0) {
      const r = ((laterExitCandle.close - laterEntry) * dir) / slRisk;
      scenarios.push({
        label: 'ورود ۵ کندل دیرتر',
        description: `ورود در ${laterEntry.toFixed(4)} — صبر بیشتر`,
        rMultiple: parseFloat(r.toFixed(2)),
        result: classify(r),
        diff: r > (session.simulatedRMultiple ?? 0) ? '📈 بهتر' : r < (session.simulatedRMultiple ?? 0) ? '📉 بدتر' : '≈ مشابه',
      });
    }
  }

  return scenarios;
}

// ── Similarity Search ──────────────────────────────────────────────

export async function getSimilarDatasets(symbol: string, mode?: ReplayMode): Promise<ReplayDataset[]> {
  let datasets = await db.replayDatasets.toArray();
  if (symbol) {
    const sym = symbol.toUpperCase();
    datasets = datasets.filter(d => d.symbol.toUpperCase().includes(sym));
  }
  if (mode === 'candle') datasets = datasets.filter(d => d.type === 'candles');
  if (mode === 'screenshot') datasets = datasets.filter(d => d.type === 'screenshots');
  if (mode === 'trade') datasets = datasets.filter(d => d.type === 'trade');
  return datasets.slice(0, 10);
}

export async function getSimilarSessions(symbol: string, mode?: ReplayMode): Promise<ReplaySession[]> {
  let sessions = await db.replaySessions.where('status').equals('completed').toArray();
  if (symbol) {
    const sym = symbol.toUpperCase();
    sessions = sessions.filter(s => s.symbol?.toUpperCase().includes(sym));
  }
  if (mode) sessions = sessions.filter(s => s.mode === mode);
  return sessions.slice(0, 6);
}

// ── Export / Import ────────────────────────────────────────────────

export async function exportReplayData() {
  const [datasets, sessions, decisions, playlists] = await Promise.all([
    db.replayDatasets.toArray(),
    db.replaySessions.toArray(),
    db.replayDecisions.toArray(),
    db.replayPlaylists.toArray(),
  ]);
  return { datasets, sessions, decisions, playlists };
}

export async function importReplayData(data: {
  datasets?: ReplayDataset[];
  sessions?: ReplaySession[];
  decisions?: ReplayDecision[];
  playlists?: ReplayPlaylist[];
}) {
  if (data.datasets?.length) await db.replayDatasets.bulkPut(data.datasets);
  if (data.sessions?.length) await db.replaySessions.bulkPut(data.sessions);
  if (data.decisions?.length) await db.replayDecisions.bulkPut(data.decisions);
  if (data.playlists?.length) await db.replayPlaylists.bulkPut(data.playlists);
}
