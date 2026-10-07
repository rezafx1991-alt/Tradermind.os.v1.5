/**
 * marketContextService — Prompt 22
 * ─────────────────────────────────────────────────────────────────
 * Offline Multi-Timeframe Market Context Analysis &
 * Personal Historical Comparison Engine
 *
 * 100% offline-first. No external API calls.
 * All analysis is based on trader's own local data.
 */

import {
  db,
  MarketContextSession,
  MarketContextTradePlan,
  TFAnalysisData,
  defaultTFAnalysis,
  SetupType,
  MarketSession,
  Trade,
  PostTradeReviewData,
  KnowledgeNote,
} from '../db/database';
import { isWin, isLoss, isClosed } from '../lib/tradeHelpers';
import { getTradingDateParts } from '../lib/tradingTime';
import { extractFeaturesFromText } from './visualAnalysisService';

// ── Re-export types for use in UI ─────────────────────────────────

export type { MarketContextSession, TFAnalysisData, MarketContextTradePlan };

// ── Analysis result types ─────────────────────────────────────────

export interface SimilarTradeMatch {
  tradeId: string;
  symbol: string;
  direction: 'long' | 'short';
  result: string;
  rMultiple: number | null;
  date: string;
  session: string | null;
  setupType: string | null;
  score: number;
  matchReasons: string[];
}

export interface HistoricalStats {
  totalSimilar: number;
  wins: number;
  losses: number;
  winRate: number;           // 0-100
  avgR: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  mostCommonMistake: string | null;
  mostSuccessfulBehavior: string | null;
  sampleSize: number;
  dateRange: [number, number] | null;
  confidence: 'low' | 'moderate' | 'high';
  note: string | null;       // small-sample warning
}

export interface BehavioralReminder {
  type: 'warning' | 'strength' | 'info';
  message: string;
  reason: string;
  supportingCount: number;
  supportingTotal: number;
}

export interface RuleMatch {
  noteId: string;
  title: string;
  content: string;
  status: 'confirmed' | 'partial' | 'not-confirmed' | 'unknown';
  statusReason: string;
  importance: string;
  category: string;
  isRule: boolean;
}

export interface PatternInsight {
  pattern: string;
  count: number;
  total: number;
  rate: number;
  significance: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface MarketHistoricalAnalysis {
  analyzedAt: number;
  similarTrades: SimilarTradeMatch[];
  overallStats: HistoricalStats | null;
  setupStats: HistoricalStats | null;
  sessionStats: HistoricalStats | null;
  dowStats: HistoricalStats | null;
  timeOfDayStats: HistoricalStats | null;
  multiDimStats: HistoricalStats | null;   // symbol + session + setup combo
  behavioralReminders: BehavioralReminder[];
  ruleMatches: RuleMatch[];
  patternInsights: PatternInsight[];
}

export interface MarketContextDecision {
  choice: 'long' | 'short' | 'no-trade' | 'wait';
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskPercent: number | null;
  confidence: number;      // 1-10
  reasoning: string;
  mostImportantInfo: string;
  ignoredInfo: string;
  invalidation: string;
  decidedAt: number;
}

export interface DecisionLearning {
  whyDecided: string;
  mostImportant: string;
  ignoredInfo: string;
  invalidation: string;
  savedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────

function parseJSON<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

function uid(): string { return crypto.randomUUID(); }

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function currentTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getDayOfWeek(): number { return new Date().getDay(); }

function getSessionFromHour(hour: number): MarketSession {
  if (hour >= 2 && hour < 8) return 'asian';
  if (hour >= 8 && hour < 13) return 'london';
  if (hour >= 13 && hour < 17) return 'overlap';
  if (hour >= 17 && hour < 22) return 'newyork';
  return 'asian';
}

// ── CRUD Operations ───────────────────────────────────────────────

const blank = JSON.stringify(defaultTFAnalysis);

export const marketContextService = {
  async getAll(): Promise<MarketContextSession[]> {
    return db.marketContextSessions.orderBy('createdAt').reverse().toArray();
  },

  async getById(id: string): Promise<MarketContextSession | undefined> {
    return db.marketContextSessions.get(id);
  },

  async create(symbol = '', session?: MarketSession): Promise<MarketContextSession> {
    const now = Date.now();
    const hour = new Date().getHours();
    const s: MarketContextSession = {
      id: uid(),
      status: 'draft',
      symbol: symbol.toUpperCase(),
      date: today(),
      time: currentTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dayOfWeek: getDayOfWeek(),
      session: session ?? getSessionFromHour(hour),
      sessionCustom: null,
      tf4h: blank, tf15m: blank, tf5m: blank, tf1m: blank,
      overallBias: null,
      setupType: null,
      setupCustom: null,
      overallReasoning: null,
      invalidationConditions: null,
      expectedScenario: null,
      tradePlan: null,
      historicalAnalysis: null,
      finalDecision: null,
      decisionLearning: null,
      linkedTradeId: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.marketContextSessions.add(s);
    return s;
  },

  async update(id: string, updates: Partial<MarketContextSession>): Promise<void> {
    await db.marketContextSessions.update(id, { ...updates, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.marketContextSessions.delete(id);
  },

  async saveTFAnalysis(id: string, tf: '4h' | '15m' | '5m' | '1m', data: TFAnalysisData): Promise<void> {
    const key = tf === '4h' ? 'tf4h' : tf === '15m' ? 'tf15m' : tf === '5m' ? 'tf5m' : 'tf1m';
    await this.update(id, { [key]: JSON.stringify(data) });
  },

  async saveTradePlan(id: string, plan: MarketContextTradePlan): Promise<void> {
    await this.update(id, { tradePlan: JSON.stringify(plan) });
  },

  async saveDecision(id: string, decision: MarketContextDecision): Promise<void> {
    await this.update(id, {
      finalDecision: JSON.stringify(decision),
      status: 'decided',
    });
  },

  async saveLearning(id: string, learning: DecisionLearning): Promise<void> {
    await this.update(id, { decisionLearning: JSON.stringify(learning) });
  },

  async linkTrade(id: string, tradeId: string): Promise<void> {
    await this.update(id, { linkedTradeId: tradeId, status: 'completed' });
  },
};

// ── Similarity Scoring ────────────────────────────────────────────

function extractAllText(session: MarketContextSession): string {
  const tfs = ['tf4h', 'tf15m', 'tf5m', 'tf1m'] as const;
  const notes = tfs.map(k => parseJSON<TFAnalysisData>(session[k], defaultTFAnalysis).notes).join(' ');
  return [
    notes,
    session.overallReasoning ?? '',
    session.expectedScenario ?? '',
    session.setupCustom ?? '',
  ].join(' ');
}

function computeSessionSimilarity(session: MarketContextSession, trade: Trade): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  // 1. Symbol match (25 pts)
  if (trade.symbol.toUpperCase() === session.symbol.toUpperCase()) {
    score += 25;
    reasons.push('نماد یکسان');
  }

  // 2. Direction match (15 pts)
  if (session.overallBias === 'bullish' && trade.direction === 'long') {
    score += 15;
    reasons.push('جهت صعودی یکسان');
  } else if (session.overallBias === 'bearish' && trade.direction === 'short') {
    score += 15;
    reasons.push('جهت نزولی یکسان');
  }

  // 3. Session match (10 pts)
  try {
    const ptr = parseJSON<PostTradeReviewData>(trade.postTradeReview, {} as PostTradeReviewData);
    const tradeSessionHour = getTradingDateParts(trade.openedAt).hour;
    const tradeSession = getSessionFromHour(tradeSessionHour);
    if (tradeSession === session.session && session.session !== 'custom') {
      score += 10;
      reasons.push(`سشن یکسان (${SESSION_LABELS[session.session]})`);
    }

    // 4. Day of week match (8 pts)
    const tradeDow = getTradingDateParts(trade.openedAt).dayOfWeek;
    if (tradeDow === session.dayOfWeek) {
      score += 8;
      reasons.push(`روز هفته یکسان (${DOW_LABELS[session.dayOfWeek]})`);
    }

    // 5. Setup type match (12 pts)
    if (session.setupType) {
      const tradeNotes = (trade.notes ?? '').toLowerCase();
      const tradeTags = parseJSON<string[]>(trade.tags, []).join(' ').toLowerCase();
      const setupKw = SETUP_KEYWORDS[session.setupType] ?? [];
      const hasSetup = setupKw.some(kw => tradeNotes.includes(kw) || tradeTags.includes(kw));
      if (hasSetup) {
        score += 12;
        reasons.push(`ستاپ مشابه (${SETUP_LABELS[session.setupType]})`);
      }
    }

    // 6. Feature similarity (15 pts max)
    const sessionText = extractAllText(session);
    const sessionFeatures = new Set(extractFeaturesFromText(sessionText));
    const tradeText = [trade.notes ?? '', trade.tags ?? '', ptr.expectationText ?? '', ptr.analysisNotes ?? ''].join(' ');
    const tradeFeatures = new Set(extractFeaturesFromText(tradeText));

    if (sessionFeatures.size > 0 && tradeFeatures.size > 0) {
      const intersection = [...sessionFeatures].filter(f => tradeFeatures.has(f));
      const union = new Set([...sessionFeatures, ...tradeFeatures]);
      const jaccard = union.size > 0 ? intersection.length / union.size : 0;
      const featureScore = Math.round(jaccard * 15);
      if (featureScore >= 3) {
        score += featureScore;
        if (intersection.length > 0) {
          reasons.push(`${intersection.length} ویژگی مشابه`);
        }
      }
    }

    // 7. HTF analysis alignment (10 pts)
    if (ptr.htfAnalysisCorrect === true) {
      score += 5;
      reasons.push('ساختار 4H مشابه');
    }
    if (ptr.m15StructureCorrect === true) {
      score += 5;
      reasons.push('ساختار 15M مشابه');
    }

  } catch { /* skip */ }

  return { score: Math.min(100, score), reasons };
}

const SESSION_LABELS: Record<string, string> = {
  asian: 'آسیا', london: 'لندن', newyork: 'نیویورک', overlap: 'اوورلپ', custom: 'سفارشی',
};

const DOW_LABELS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];

export { DOW_LABELS, SESSION_LABELS };

const SETUP_LABELS: Record<SetupType, string> = {
  continuation: 'ادامه‌دهنده', reversal: 'بازگشتی', breakout: 'شکست',
  pullback: 'پولبک', range: 'رنج', 'liquidity-sweep': 'لیکوئیدیتی سویپ', custom: 'سفارشی',
};

export { SETUP_LABELS };

const SETUP_KEYWORDS: Record<SetupType, string[]> = {
  continuation: ['ادامه', 'continuation', 'trend follow'],
  reversal: ['بازگشت', 'reversal', 'ریورسال'],
  breakout: ['شکست', 'breakout', 'بریک'],
  pullback: ['پولبک', 'pullback', 'اصلاح', 'retracement'],
  range: ['رنج', 'range', 'محدوده'],
  'liquidity-sweep': ['لیکوئیدیتی', 'sweep', 'manipulation'],
  custom: [],
};

// ── Stats Computation ─────────────────────────────────────────────

function computeStats(trades: Trade[], label = ''): HistoricalStats | null {
  const closed = trades.filter(t => isClosed(t) && t.result !== 'open' && t.result !== 'cancelled');
  if (closed.length === 0) return null;

  const wins = closed.filter(isWin);
  const losses = closed.filter(isLoss);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;

  const rValues = closed.map(t => t.rMultiple).filter((r): r is number => r !== null);
  const winRValues = wins.map(t => t.rMultiple).filter((r): r is number => r !== null);
  const lossRValues = losses.map(t => t.rMultiple).filter((r): r is number => r !== null);

  const avgR = rValues.length > 0 ? Math.round((rValues.reduce((a, b) => a + b, 0) / rValues.length) * 100) / 100 : null;
  const avgWin = winRValues.length > 0 ? Math.round((winRValues.reduce((a, b) => a + b, 0) / winRValues.length) * 100) / 100 : null;
  const avgLoss = lossRValues.length > 0 ? Math.round((lossRValues.reduce((a, b) => a + b, 0) / lossRValues.length) * 100) / 100 : null;

  // Behavioral patterns from postTradeReview
  const mistakeCounts: Record<string, number> = {};
  const successCounts: Record<string, number> = {};
  for (const t of closed) {
    const ptr = parseJSON<PostTradeReviewData>(t.postTradeReview, {} as PostTradeReviewData);
    if (ptr.entryTiming === 'early') mistakeCounts['ورود زودهنگام'] = (mistakeCounts['ورود زودهنگام'] ?? 0) + 1;
    if (ptr.slMoved === true) mistakeCounts['جابجایی SL'] = (mistakeCounts['جابجایی SL'] ?? 0) + 1;
    if (ptr.closedEarly === true) mistakeCounts['بستن زودهنگام'] = (mistakeCounts['بستن زودهنگام'] ?? 0) + 1;
    if (ptr.heldTooLong === true) mistakeCounts['نگه‌داری بیش از حد'] = (mistakeCounts['نگه‌داری بیش از حد'] ?? 0) + 1;
    const flags = ptr.behaviorFlags ?? [];
    if (flags.includes('fomo')) mistakeCounts['FOMO'] = (mistakeCounts['FOMO'] ?? 0) + 1;
    if (flags.includes('impatience')) mistakeCounts['بی‌صبری'] = (mistakeCounts['بی‌صبری'] ?? 0) + 1;
    if (ptr.entryFollowedPlan === true && t.result === 'win') successCounts['پیروی از پلن'] = (successCounts['پیروی از پلن'] ?? 0) + 1;
    if (ptr.enteredWithConfirmation === true && t.result === 'win') successCounts['صبر برای تأیید'] = (successCounts['صبر برای تأیید'] ?? 0) + 1;
  }

  const topMistake = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1])[0];
  const topSuccess = Object.entries(successCounts).sort((a, b) => b[1] - a[1])[0];

  const timestamps = closed.map(t => t.openedAt).filter(Boolean);
  const dateRange: [number, number] | null = timestamps.length >= 2
    ? [Math.min(...timestamps), Math.max(...timestamps)]
    : null;

  const confidence: HistoricalStats['confidence'] = closed.length >= 8 ? 'high' : closed.length >= 4 ? 'moderate' : 'low';
  const note = closed.length < 4 ? `فقط ${closed.length} نمونه تاریخی ${label}یافت شد — نتایج ممکن است قابل اعتماد نباشد` : null;

  return {
    totalSimilar: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgR,
    avgWin,
    avgLoss,
    mostCommonMistake: topMistake ? `${topMistake[0]} (${topMistake[1]} بار)` : null,
    mostSuccessfulBehavior: topSuccess ? `${topSuccess[0]} (${topSuccess[1]} بار)` : null,
    sampleSize: closed.length,
    dateRange,
    confidence,
    note,
  };
}

// ── Behavioral Reminders ──────────────────────────────────────────

function generateReminders(similar: Trade[], session: MarketContextSession): BehavioralReminder[] {
  const reminders: BehavioralReminder[] = [];
  if (similar.length < 2) return reminders;

  let earlyCount = 0, fomoCount = 0, slMovedCount = 0, noConfirmCount = 0, waitedCount = 0;

  for (const t of similar) {
    const ptr = parseJSON<PostTradeReviewData>(t.postTradeReview, {} as PostTradeReviewData);
    if (ptr.entryTiming === 'early') earlyCount++;
    if ((ptr.behaviorFlags ?? []).includes('fomo')) fomoCount++;
    if (ptr.slMoved === true) slMovedCount++;
    if (ptr.enteredWithConfirmation === false) noConfirmCount++;
    if (ptr.enteredWithConfirmation === true && (isWin(t))) waitedCount++;
  }

  const total = similar.length;
  if (earlyCount >= 2) {
    reminders.push({
      type: 'warning',
      message: 'در شرایط مشابه، شما سابقه ورود زودهنگام دارید',
      reason: `در ${earlyCount} از ${total} معامله مشابه، ورود زودهنگام ثبت شده است`,
      supportingCount: earlyCount, supportingTotal: total,
    });
  }
  if (fomoCount >= 2) {
    reminders.push({
      type: 'warning',
      message: 'احتیاط: در ستاپ‌های مشابه رفتار FOMO مشاهده شده',
      reason: `در ${fomoCount} از ${total} معامله مشابه، FOMO ثبت شده است`,
      supportingCount: fomoCount, supportingTotal: total,
    });
  }
  if (slMovedCount >= 2) {
    reminders.push({
      type: 'warning',
      message: 'در ستاپ‌های مشابه بازگشتی، SL را جابجا کرده‌اید',
      reason: `جابجایی SL در ${slMovedCount} از ${total} معامله مشابه رخ داده`,
      supportingCount: slMovedCount, supportingTotal: total,
    });
  }
  if (noConfirmCount >= 2) {
    reminders.push({
      type: 'warning',
      message: 'بدون تأیید وارد شده‌اید — در موقعیت‌های مشابه',
      reason: `در ${noConfirmCount} از ${total} معامله مشابه، بدون تأیید وارد شده‌اید`,
      supportingCount: noConfirmCount, supportingTotal: total,
    });
  }
  if (waitedCount >= 2) {
    reminders.push({
      type: 'strength',
      message: 'صبر برای تأیید در موقعیت‌های مشابه نتیجه بهتری داشته',
      reason: `در ${waitedCount} از ${total} معامله مشابه، انتظار برای تأیید منجر به برد شد`,
      supportingCount: waitedCount, supportingTotal: total,
    });
  }

  return reminders;
}

// ── Pattern Insights ──────────────────────────────────────────────

function generatePatternInsights(similar: Trade[]): PatternInsight[] {
  const insights: PatternInsight[] = [];
  if (similar.length < 2) return insights;

  let earlyEntryWins = 0, earlyEntryTotal = 0;
  let confirmedWins = 0, confirmedTotal = 0;

  for (const t of similar) {
    const ptr = parseJSON<PostTradeReviewData>(t.postTradeReview, {} as PostTradeReviewData);
    const won = isWin(t);

    if (ptr.entryTiming === 'early') {
      earlyEntryTotal++;
      if (won) earlyEntryWins++;
    }
    if (ptr.enteredWithConfirmation === true) {
      confirmedTotal++;
      if (won) confirmedWins++;
    }
  }

  if (earlyEntryTotal >= 2) {
    const rate = Math.round((earlyEntryWins / earlyEntryTotal) * 100);
    insights.push({
      pattern: 'ورود زودهنگام',
      count: earlyEntryTotal,
      total: similar.length,
      rate,
      significance: earlyEntryTotal >= 4 ? 'high' : 'medium',
      suggestion: rate < 40 ? 'ورود زودهنگام در موقعیت‌های مشابه نرخ برد پایینی داشته' : 'ورود زودهنگام در این ستاپ نتایج متفاوتی داشته',
    });
  }
  if (confirmedTotal >= 2) {
    const rate = Math.round((confirmedWins / confirmedTotal) * 100);
    insights.push({
      pattern: 'انتظار برای تأیید',
      count: confirmedTotal,
      total: similar.length,
      rate,
      significance: confirmedTotal >= 4 ? 'high' : 'medium',
      suggestion: rate >= 60 ? 'صبر برای تأیید در موقعیت‌های مشابه نتیجه بهتری داده' : 'انتظار برای تأیید نتایج متفاوتی داشته',
    });
  }

  return insights;
}

// ── Rule Matching ─────────────────────────────────────────────────

function matchRules(session: MarketContextSession, rules: KnowledgeNote[]): RuleMatch[] {
  const sessionText = extractAllText(session).toLowerCase();
  const plan = parseJSON<MarketContextTradePlan>(session.tradePlan, {} as MarketContextTradePlan);

  const matched: RuleMatch[] = (rules
    .filter(n => n.isActive)
    .map(note => {
      const content = note.content.toLowerCase();
      const title = note.title.toLowerCase();

      const relatedSymbols = parseJSON<string[]>(note.relatedSymbols, []);
      const relatedSessions = parseJSON<string[]>(note.relatedSessions, []);
      const relatedSetups = parseJSON<string[]>(note.relatedSetups, []);

      const symbolMatch = relatedSymbols.length === 0 || relatedSymbols.some(s => s.toUpperCase() === session.symbol);
      const sessionMatch = relatedSessions.length === 0 || relatedSessions.includes(session.session);
      const setupMatch = relatedSetups.length === 0 || (session.setupType && relatedSetups.includes(session.setupType));

      if (!symbolMatch || (!sessionMatch && !setupMatch && relatedSymbols.length === 0)) return null;

      let status: RuleMatch['status'] = 'unknown';
      let statusReason = 'اطلاعات کافی برای بررسی وضعیت این قانون وجود ندارد';

      if (plan.entry !== null && plan.stopLoss !== null) {
        if (title.includes('تأیید') || content.includes('انتظار برای تأیید')) {
          if (sessionText.includes('تأیید') || sessionText.includes('confirmation')) {
            status = 'confirmed';
            statusReason = 'تأیید در تحلیل شما ذکر شده';
          } else {
            status = 'not-confirmed';
            statusReason = 'تأییدیه در تحلیل شما ذکر نشده';
          }
        } else {
          status = 'partial';
          statusReason = 'بخشی از معیارها قابل بررسی است';
        }
      } else if (content.includes('ورود') || title.includes('ورود')) {
        status = 'unknown';
        statusReason = 'جزئیات ورود هنوز تعیین نشده';
      }

      return {
        noteId: note.id,
        title: note.title,
        content: note.content,
        status,
        statusReason,
        importance: note.importance as RuleMatch['importance'],
        category: note.category,
        isRule: note.isRule,
      };
    })
    .filter((r) => r !== null)) as RuleMatch[];

  return matched
    .sort((a, b) => {
      const impOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (impOrder[a.importance as keyof typeof impOrder] ?? 3) - (impOrder[b.importance as keyof typeof impOrder] ?? 3);
    })
    .slice(0, 12);
}

// ── Main Analysis Engine ──────────────────────────────────────────

export async function analyzeMarketContext(session: MarketContextSession): Promise<MarketHistoricalAnalysis> {
  const [allTrades, allNotes] = await Promise.all([
    db.trades.where('status').equals('closed').toArray(),
    db.knowledgeNotes.toArray().then(r => r.filter(n => n.isActive)),
  ]);

  // Score all closed trades against current session
  const scored = allTrades
    .map(t => {
      const { score, reasons } = computeSessionSimilarity(session, t);
      return { trade: t, score, reasons };
    })
    .filter(x => x.score >= 15)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 20);
  const similarTrades: SimilarTradeMatch[] = top.map(({ trade: t, score, reasons }) => {
    const ptr = parseJSON<PostTradeReviewData>(t.postTradeReview, {} as PostTradeReviewData);
    return {
      tradeId: t.id,
      symbol: t.symbol,
      direction: t.direction,
      result: t.result,
      rMultiple: t.rMultiple,
      date: new Date(t.openedAt).toLocaleDateString('fa-IR'),
       session: SESSION_LABELS[getSessionFromHour(getTradingDateParts(t.openedAt).hour)] ?? null,
      setupType: null,
      score,
      matchReasons: reasons,
    };
  });

  const topTrades = top.map(x => x.trade);

  // Stats by different dimensions
  const overallStats = computeStats(topTrades, 'مشابه ');

  // Setup-filtered
  const setupTrades = session.setupType
    ? allTrades.filter(t => {
        const kws = SETUP_KEYWORDS[session.setupType!] ?? [];
        const text = (t.notes ?? '') + ' ' + parseJSON<string[]>(t.tags, []).join(' ');
        return kws.some(k => text.toLowerCase().includes(k));
      })
    : [];
  const setupStats = setupTrades.length > 0 ? computeStats(setupTrades, 'با ستاپ مشابه ') : null;

  // Session-filtered
  const sessionTrades = allTrades.filter(t => {
    const hour = getTradingDateParts(t.openedAt).hour;
    return getSessionFromHour(hour) === session.session;
  });
  const sessionStats = computeStats(sessionTrades, `در سشن ${SESSION_LABELS[session.session]} `);

  // Day-of-week filtered
  const dowTrades = allTrades.filter(t => getTradingDateParts(t.openedAt).dayOfWeek === session.dayOfWeek);
  const dowStats = dowStats2(dowTrades, session.dayOfWeek);

  // Time-of-day filtered (±2 hours)
  const hour = parseInt(session.time.split(':')[0] ?? '12');
  const todTrades = allTrades.filter(t => {
    const h = getTradingDateParts(t.openedAt).hour;
    return Math.abs(h - hour) <= 2;
  });
  const timeOfDayStats = computeStats(todTrades, 'در بازه زمانی مشابه ');

  // Multi-dimensional: symbol + session + setup
  const multiTrades = allTrades.filter(t => {
    const symbolOk = t.symbol.toUpperCase() === session.symbol;
    const sessionOk = getSessionFromHour(getTradingDateParts(t.openedAt).hour) === session.session;
    return symbolOk && sessionOk;
  });
  const multiDimStats = multiTrades.length >= 2 ? computeStats(multiTrades, `برای ${session.symbol} در سشن ${SESSION_LABELS[session.session]} `) : null;

  // Behavioral reminders
  const behavioralReminders = generateReminders(topTrades, session);

  // Rule matches
  const ruleMatches = matchRules(session, allNotes);

  // Pattern insights
  const patternInsights = generatePatternInsights(topTrades);

  return {
    analyzedAt: Date.now(),
    similarTrades,
    overallStats,
    setupStats,
    sessionStats,
    dowStats,
    timeOfDayStats,
    multiDimStats,
    behavioralReminders,
    ruleMatches,
    patternInsights,
  };
}

function dowStats2(trades: Trade[], dow: number): HistoricalStats | null {
  const s = computeStats(trades, `در ${DOW_LABELS[dow]} `);
  return s;
}

export async function runAndSaveAnalysis(sessionId: string): Promise<MarketHistoricalAnalysis | null> {
  const session = await marketContextService.getById(sessionId);
  if (!session) return null;
  const analysis = await analyzeMarketContext(session);
  await marketContextService.update(sessionId, {
    historicalAnalysis: JSON.stringify(analysis),
    status: 'analyzed',
  });
  return analysis;
}

// ── Pre-trade Briefing ────────────────────────────────────────────

export interface PreTradeBriefing {
  setupLabel: string | null;
  similarCount: number;
  avgR: number | null;
  winRate: number | null;
  strongestBehavior: string | null;
  commonMistake: string | null;
  relevantRules: RuleMatch[];
  reminders: BehavioralReminder[];
  confidence: 'low' | 'moderate' | 'high';
  sampleNote: string | null;
}

export function buildPreTradeBriefing(analysis: MarketHistoricalAnalysis, session: MarketContextSession): PreTradeBriefing {
  const stats = analysis.overallStats;
  const topRules = analysis.ruleMatches.filter(r => r.isRule || r.importance === 'critical' || r.importance === 'high').slice(0, 3);

  return {
    setupLabel: session.setupType ? SETUP_LABELS[session.setupType] : null,
    similarCount: stats?.totalSimilar ?? 0,
    avgR: stats?.avgR ?? null,
    winRate: stats?.winRate ?? null,
    strongestBehavior: stats?.mostSuccessfulBehavior ?? null,
    commonMistake: stats?.mostCommonMistake ?? null,
    relevantRules: topRules,
    reminders: analysis.behavioralReminders.filter(r => r.type === 'warning').slice(0, 3),
    confidence: stats?.confidence ?? 'low',
    sampleNote: stats?.note ?? null,
  };
}

// ── Lesson Proposals (Learning Loop — Section 23) ─────────────────

export interface LessonProposal {
  id: string;
  title: string;
  content: string;
  category: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  isRule: boolean;
  tags: string[];
  relatedSymbols: string[];
  relatedSetups: string[];
  relatedSessions: string[];
  evidence: {
    supportingTradeIds: string[];
    sampleSize: number;
    confidence: 'low' | 'moderate' | 'high';
    description: string;
  };
  reason: string; // چرا این درس پیشنهاد شد
}

export function generateLessonProposals(
  analysis: MarketHistoricalAnalysis,
  session: MarketContextSession,
): LessonProposal[] {
  const proposals: LessonProposal[] = [];
  const similar = analysis.similarTrades;
  const stats = analysis.overallStats;

  // ── از یادآوری‌های رفتاری ──────────────────────────────────────
  for (const reminder of analysis.behavioralReminders) {
    const rate = reminder.supportingTotal > 0
      ? Math.round((reminder.supportingCount / reminder.supportingTotal) * 100)
      : 0;

    if (reminder.type === 'warning' && reminder.supportingCount >= 2) {
      if (reminder.message.includes('زودهنگام')) {
        proposals.push({
          id: uid(), title: 'از ورود زودهنگام در موقعیت‌های مشابه بپرهیزید',
          content: `در ${reminder.supportingCount} از ${reminder.supportingTotal} معامله مشابه (${rate}%)، ورود زودهنگام ثبت شده. منتظر تأیید کامل بمانید.`,
          category: 'entry-rules', importance: rate >= 60 ? 'high' : 'medium', isRule: true,
          tags: ['ورود', 'زودهنگام', 'تأیید'],
          relatedSymbols: session.symbol ? [session.symbol] : [],
          relatedSetups: session.setupType ? [session.setupType] : [],
          relatedSessions: [session.session],
          evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: reminder.supportingTotal, confidence: reminder.supportingTotal >= 8 ? 'high' : reminder.supportingTotal >= 4 ? 'moderate' : 'low', description: reminder.reason },
          reason: reminder.reason,
        });
      } else if (reminder.message.includes('FOMO')) {
        proposals.push({
          id: uid(), title: 'FOMO را در موقعیت‌های مشابه مدیریت کنید',
          content: `رفتار FOMO در ${reminder.supportingCount} از ${reminder.supportingTotal} معامله مشابه مشاهده شده. قبل از ورود چک‌لیست خود را مرور کنید.`,
          category: 'trading-rules', importance: 'high', isRule: true,
          tags: ['FOMO', 'احساسات', 'کنترل'],
          relatedSymbols: session.symbol ? [session.symbol] : [],
          relatedSetups: session.setupType ? [session.setupType] : [],
          relatedSessions: [session.session],
          evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: reminder.supportingTotal, confidence: reminder.supportingTotal >= 8 ? 'high' : 'moderate', description: reminder.reason },
          reason: reminder.reason,
        });
      } else if (reminder.message.includes('SL') || reminder.message.includes('حد ضرر')) {
        proposals.push({
          id: uid(), title: 'SL را در موقعیت‌های مشابه جابجا نکنید',
          content: `جابجایی SL در ${reminder.supportingCount} از ${reminder.supportingTotal} معامله مشابه رخ داده. به پلن اولیه پایبند بمانید.`,
          category: 'risk-management', importance: 'critical', isRule: true,
          tags: ['SL', 'مدیریت ریسک', 'پایبندی به پلن'],
          relatedSymbols: session.symbol ? [session.symbol] : [],
          relatedSetups: session.setupType ? [session.setupType] : [],
          relatedSessions: [session.session],
          evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: reminder.supportingTotal, confidence: 'moderate', description: reminder.reason },
          reason: reminder.reason,
        });
      } else if (reminder.message.includes('تأیید')) {
        proposals.push({
          id: uid(), title: 'بدون تأییدیه وارد نشوید',
          content: `در ${reminder.supportingCount} از ${reminder.supportingTotal} معامله مشابه، ورود بدون تأیید رخ داده. این الگو نیاز به بررسی دارد.`,
          category: 'entry-rules', importance: 'high', isRule: true,
          tags: ['تأیید', 'ورود', 'صبر'],
          relatedSymbols: session.symbol ? [session.symbol] : [],
          relatedSetups: session.setupType ? [session.setupType] : [],
          relatedSessions: [session.session],
          evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: reminder.supportingTotal, confidence: 'moderate', description: reminder.reason },
          reason: reminder.reason,
        });
      }
    } else if (reminder.type === 'strength' && reminder.supportingCount >= 2) {
      proposals.push({
        id: uid(), title: reminder.message,
        content: `در ${reminder.supportingCount} از ${reminder.supportingTotal} معامله مشابه، این رفتار مثبت منجر به نتیجه بهتر شده. ادامه دادن به این رفتار توصیه می‌شود.`,
        category: 'strengths', importance: 'medium', isRule: false,
        tags: ['رفتار مثبت', 'الگوی موفق'],
        relatedSymbols: session.symbol ? [session.symbol] : [],
        relatedSetups: session.setupType ? [session.setupType] : [],
        relatedSessions: [session.session],
        evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: reminder.supportingTotal, confidence: reminder.supportingTotal >= 8 ? 'high' : 'moderate', description: reminder.reason },
        reason: reminder.reason,
      });
    }
  }

  // ── از الگوهای رفتاری ─────────────────────────────────────────
  for (const insight of analysis.patternInsights) {
    if (insight.rate < 38 && insight.count >= 2) {
      proposals.push({
        id: uid(), title: `اجتناب از ${insight.pattern} در موقعیت‌های مشابه`,
        content: `نرخ موفقیت «${insight.pattern}» در موقعیت‌های مشابه: ${insight.rate}% (${insight.count} نمونه). ${insight.suggestion}`,
        category: 'lessons-learned', importance: insight.significance === 'high' ? 'high' : 'medium', isRule: false,
        tags: [insight.pattern, 'الگو', 'درس'],
        relatedSymbols: session.symbol ? [session.symbol] : [],
        relatedSetups: session.setupType ? [session.setupType] : [],
        relatedSessions: [session.session],
        evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: insight.total, confidence: insight.significance === 'high' ? 'high' : 'moderate', description: insight.suggestion },
        reason: `نرخ موفقیت ${insight.pattern} در ${insight.count} نمونه تاریخی ${insight.rate}% بوده`,
      });
    } else if (insight.rate >= 65 && insight.count >= 2) {
      proposals.push({
        id: uid(), title: `${insight.pattern} — الگوی موفق در موقعیت‌های مشابه`,
        content: `نرخ موفقیت «${insight.pattern}» در موقعیت‌های مشابه: ${insight.rate}% (${insight.count} نمونه). ${insight.suggestion}`,
        category: 'strengths', importance: 'medium', isRule: false,
        tags: [insight.pattern, 'الگوی موفق'],
        relatedSymbols: session.symbol ? [session.symbol] : [],
        relatedSetups: session.setupType ? [session.setupType] : [],
        relatedSessions: [session.session],
        evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: insight.total, confidence: 'moderate', description: insight.suggestion },
        reason: `نرخ موفقیت بالا (${insight.rate}%) در ${insight.count} نمونه`,
      });
    }
  }

  // ── از آمار کلی ───────────────────────────────────────────────
  if (stats && stats.sampleSize >= 4) {
    if (stats.winRate < 40) {
      proposals.push({
        id: uid(), title: `احتیاط — نرخ برد پایین در موقعیت‌های مشابه`,
        content: `نرخ برد تاریخی در ${stats.sampleSize} موقعیت مشابه: ${stats.winRate}% (میانگین R: ${stats.avgR !== null ? stats.avgR.toFixed(2) + 'R' : '—'}). بررسی دقیق‌تر معیارهای ورود توصیه می‌شود.`,
        category: 'setup-reminders', importance: 'high', isRule: false,
        tags: ['نرخ برد پایین', session.setupType ?? '', session.session],
        relatedSymbols: session.symbol ? [session.symbol] : [],
        relatedSetups: session.setupType ? [session.setupType] : [],
        relatedSessions: [session.session],
        evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: stats.sampleSize, confidence: stats.confidence, description: `نرخ برد: ${stats.winRate}%` },
        reason: `نرخ برد ${stats.winRate}% در ${stats.sampleSize} موقعیت مشابه`,
      });
    } else if (stats.winRate >= 65) {
      proposals.push({
        id: uid(), title: `ستاپ قوی — نرخ برد بالا در موقعیت‌های مشابه`,
        content: `نرخ برد تاریخی در ${stats.sampleSize} موقعیت مشابه: ${stats.winRate}% (میانگین R: ${stats.avgR !== null ? stats.avgR.toFixed(2) + 'R' : '—'}). این ستاپ در شرایط مشابه عملکرد خوبی داشته.`,
        category: 'strengths', importance: 'medium', isRule: false,
        tags: ['نرخ برد بالا', session.setupType ?? '', session.session].filter(Boolean),
        relatedSymbols: session.symbol ? [session.symbol] : [],
        relatedSetups: session.setupType ? [session.setupType] : [],
        relatedSessions: [session.session],
        evidence: { supportingTradeIds: similar.map(t => t.tradeId).slice(0, 10), sampleSize: stats.sampleSize, confidence: stats.confidence, description: `نرخ برد: ${stats.winRate}%` },
        reason: `نرخ برد بالا (${stats.winRate}%) در ${stats.sampleSize} موقعیت مشابه`,
      });
    }
  }

  // ── از سشن/روز هفته ───────────────────────────────────────────
  const sessionStats = analysis.sessionStats;
  if (sessionStats && sessionStats.sampleSize >= 4 && sessionStats.winRate < 40) {
    proposals.push({
      id: uid(), title: `عملکرد ضعیف در سشن ${SESSION_LABELS[session.session] ?? session.session}`,
      content: `نرخ برد تاریخی شما در سشن ${SESSION_LABELS[session.session] ?? session.session}: ${sessionStats.winRate}% از ${sessionStats.sampleSize} معامله. بررسی بیشتر شرایط این سشن توصیه می‌شود.`,
      category: 'session-reminders', importance: 'medium', isRule: false,
      tags: ['سشن', SESSION_LABELS[session.session] ?? session.session],
      relatedSymbols: [], relatedSetups: [], relatedSessions: [session.session],
      evidence: { supportingTradeIds: [], sampleSize: sessionStats.sampleSize, confidence: sessionStats.confidence, description: `نرخ برد ${sessionStats.winRate}% در سشن ${SESSION_LABELS[session.session]}` },
      reason: `نرخ برد پایین در سشن ${SESSION_LABELS[session.session]}`,
    });
  }

  // حذف تکراری‌ها بر اساس عنوان
  const seen = new Set<string>();
  return proposals.filter(p => {
    if (seen.has(p.title)) return false;
    seen.add(p.title);
    return true;
  });
}

export async function approveLessonToKnowledgeBase(proposal: LessonProposal): Promise<string> {
  const now = Date.now();
  const note = {
    id: uid(),
    title: proposal.title,
    content: proposal.content,
    category: proposal.category,
    importance: proposal.importance,
    color: proposal.importance === 'critical' ? '#ef4444'
         : proposal.importance === 'high'     ? '#f97316'
         : proposal.importance === 'medium'   ? '#eab308'
         : '#6b7280',
    tags: JSON.stringify(proposal.tags),
    relatedSymbols: JSON.stringify(proposal.relatedSymbols),
    relatedSetups: JSON.stringify(proposal.relatedSetups),
    relatedStrategies: '[]',
    relatedSessions: JSON.stringify(proposal.relatedSessions),
    relatedMarketRegimes: '[]',
    relatedTimeframes: '[]',
    relatedDays: '[]',
    source: 'ai-generated' as const,
    status: 'new' as const,
    isActive: true,
    isPinned: false,
    isRule: proposal.isRule,
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
    reviewFrequency: 'weekly' as const,
    userFeedback: null,
    evidence: JSON.stringify({
      supportingTradeIds: proposal.evidence.supportingTradeIds,
      sampleSize: proposal.evidence.sampleSize,
      dateRange: null,
      avgResult: null,
      confidence: proposal.evidence.confidence,
      description: proposal.evidence.description,
    }),
    requireConfirmation: false,
    snoozedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.knowledgeNotes.add(note);
  return note.id;
}
