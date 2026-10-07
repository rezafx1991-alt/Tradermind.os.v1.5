/**
 * Screenshot Intelligence Service — Prompt 27
 * ────────────────────────────────────────────
 * CRUD + analytics for the standalone screenshot library.
 * All data stays local (IndexedDB). No external calls.
 */

import { db, ChartScreenshot, ScreenshotGroup, VisualPattern, ScreenshotCollection, Trade } from '../db/database';
import { median, isWin, isLoss, isClosed } from '../lib/tradeHelpers';
import { getTradingDateParts } from '../lib/tradingTime';
import { VisualFeature } from '../types/screenshot';
import {
  PatternPerformanceStats,
  PatternBySession,
  PatternByDay,
  PatternByTimeframe,
  ChartSimilarityMatch,
  OutcomeDistribution,
  RepeatedPattern,
  VisualPreTradeBriefing,
  PATTERN_TAG_LABELS,
} from '../types/chartScreenshot';

function uid(): string {
  return crypto.randomUUID();
}

function safeJson<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

// ── ChartScreenshot CRUD ──────────────────────────────────────────

export async function getAllChartScreenshots(): Promise<ChartScreenshot[]> {
  return db.chartScreenshots.orderBy('createdAt').reverse().toArray();
}

export async function getChartScreenshot(id: string): Promise<ChartScreenshot | undefined> {
  return db.chartScreenshots.get(id);
}

export async function saveChartScreenshot(data: Omit<ChartScreenshot, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChartScreenshot> {
  const now = Date.now();
  // اگر dataUrl موجود است، تبدیل به Blob برای ذخیره‌سازی کارآمد
  let record: ChartScreenshot = { ...data, id: uid(), createdAt: now, updatedAt: now };
  if (record.dataUrl && record.dataUrl.startsWith('data:') && !record.imageBlob) {
    try {
      const { dataUrlToBlob } = await import('../db/database');
      record = { ...record, imageBlob: dataUrlToBlob(record.dataUrl), dataUrl: '' };
    } catch {
      // اگر تبدیل شکست خورد، dataUrl اصلی را نگه می‌داریم
    }
  }
  try {
    await db.chartScreenshots.put(record);
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'QuotaExceededError') {
      throw new Error('Storage is full. Please remove old screenshots or export backup.');
    }
    throw e;
  }
  return record;
}

export async function updateChartScreenshot(id: string, patch: Partial<ChartScreenshot>): Promise<void> {
  await db.chartScreenshots.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteChartScreenshot(id: string): Promise<void> {
  // Remove from all collections
  const collections = await db.screenshotCollections.toArray();
  for (const col of collections) {
    const ids = safeJson<string[]>(col.screenshotIds, []);
    if (ids.includes(id)) {
      await db.screenshotCollections.update(col.id, {
        screenshotIds: JSON.stringify(ids.filter(i => i !== id)),
        updatedAt: Date.now(),
      });
    }
  }
  // Remove from groups
  const groups = await db.screenshotGroups.toArray();
  for (const grp of groups) {
    const ids = safeJson<string[]>(grp.screenshotIds, []);
    if (ids.includes(id)) {
      await db.screenshotGroups.update(grp.id, {
        screenshotIds: JSON.stringify(ids.filter(i => i !== id)),
        updatedAt: Date.now(),
      });
    }
  }
  await db.chartScreenshots.delete(id);
}

// ── ScreenshotGroup CRUD ──────────────────────────────────────────

export async function getAllGroups(): Promise<ScreenshotGroup[]> {
  return db.screenshotGroups.orderBy('createdAt').reverse().toArray();
}

export async function getGroup(id: string): Promise<ScreenshotGroup | undefined> {
  return db.screenshotGroups.get(id);
}

export async function saveGroup(data: Omit<ScreenshotGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScreenshotGroup> {
  const now = Date.now();
  const record: ScreenshotGroup = { ...data, id: uid(), createdAt: now, updatedAt: now };
  await db.screenshotGroups.put(record);
  return record;
}

export async function updateGroup(id: string, patch: Partial<ScreenshotGroup>): Promise<void> {
  await db.screenshotGroups.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteGroup(id: string): Promise<void> {
  // Unlink screenshots from group
  await db.chartScreenshots.where('groupId').equals(id).modify({ groupId: null, updatedAt: Date.now() });
  await db.screenshotGroups.delete(id);
}

// ── VisualPattern CRUD ────────────────────────────────────────────

export async function getAllPatterns(): Promise<VisualPattern[]> {
  return db.visualPatterns.orderBy('createdAt').reverse().toArray();
}

export async function getPattern(id: string): Promise<VisualPattern | undefined> {
  return db.visualPatterns.get(id);
}

export async function savePattern(data: Omit<VisualPattern, 'id' | 'createdAt' | 'updatedAt'>): Promise<VisualPattern> {
  const now = Date.now();
  const record: VisualPattern = { ...data, id: uid(), createdAt: now, updatedAt: now };
  await db.visualPatterns.put(record);
  return record;
}

export async function updatePattern(id: string, patch: Partial<VisualPattern>): Promise<void> {
  await db.visualPatterns.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deletePattern(id: string): Promise<void> {
  await db.visualPatterns.delete(id);
}

// ── ScreenshotCollection CRUD ─────────────────────────────────────

export async function getAllCollections(): Promise<ScreenshotCollection[]> {
  return db.screenshotCollections.orderBy('createdAt').toArray();
}

export async function saveCollection(data: Omit<ScreenshotCollection, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScreenshotCollection> {
  const now = Date.now();
  const record: ScreenshotCollection = { ...data, id: uid(), createdAt: now, updatedAt: now };
  await db.screenshotCollections.put(record);
  return record;
}

export async function updateCollection(id: string, patch: Partial<ScreenshotCollection>): Promise<void> {
  await db.screenshotCollections.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteCollection(id: string): Promise<void> {
  const col = await db.screenshotCollections.get(id);
  if (col?.isDefault) throw new Error('کالکشن پیش‌فرض قابل حذف نیست');
  await db.screenshotCollections.delete(id);
}

export async function addToCollection(collectionId: string, screenshotId: string): Promise<void> {
  const col = await db.screenshotCollections.get(collectionId);
  if (!col) return;
  const ids = safeJson<string[]>(col.screenshotIds, []);
  if (!ids.includes(screenshotId)) {
    await db.screenshotCollections.update(collectionId, {
      screenshotIds: JSON.stringify([...ids, screenshotId]),
      updatedAt: Date.now(),
    });
    // Also mark on screenshot
    const ss = await db.chartScreenshots.get(screenshotId);
    if (ss) {
      const cids = safeJson<string[]>(ss.collectionIds, []);
      if (!cids.includes(collectionId)) {
        await db.chartScreenshots.update(screenshotId, {
          collectionIds: JSON.stringify([...cids, collectionId]),
          updatedAt: Date.now(),
        });
      }
    }
  }
}

export async function removeFromCollection(collectionId: string, screenshotId: string): Promise<void> {
  const col = await db.screenshotCollections.get(collectionId);
  if (!col) return;
  const ids = safeJson<string[]>(col.screenshotIds, []);
  await db.screenshotCollections.update(collectionId, {
    screenshotIds: JSON.stringify(ids.filter(i => i !== screenshotId)),
    updatedAt: Date.now(),
  });
  const ss = await db.chartScreenshots.get(screenshotId);
  if (ss) {
    const cids = safeJson<string[]>(ss.collectionIds, []);
    await db.chartScreenshots.update(screenshotId, {
      collectionIds: JSON.stringify(cids.filter(i => i !== collectionId)),
      updatedAt: Date.now(),
    });
  }
}

// ── Similarity Search ─────────────────────────────────────────────

function computeTagSimilarity(tagsA: string[], tagsB: string[]): number {
  if (tagsA.length === 0 && tagsB.length === 0) return 0;
  const setA = new Set(tagsA);
  const setB = new Set(tagsB);
  const intersection = [...setA].filter(v => setB.has(v));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return Math.round((intersection.length / union.size) * 100);
}

function getFeatureValues(featuresJson: string): string[] {
  const features = safeJson<VisualFeature[]>(featuresJson, []);
  return features
    .filter(f => f.confirmed !== false)
    .map(f => f.correctedValue ?? f.value);
}

/**
 * جستجوی اسکرین‌شات‌های مشابه در کتابخانه مستقل
 * بر اساس: تگ‌ها، سشن، تایم‌فریم، نماد
 */
export async function findSimilarChartScreenshots(
  targetId: string,
  options: {
    minScore?: number;
    limit?: number;
    sameSymbol?: boolean;
    sameTimeframe?: boolean;
    sameSession?: boolean;
  } = {},
): Promise<ChartSimilarityMatch[]> {
  const { minScore = 20, limit = 8, sameSymbol = false, sameTimeframe = false, sameSession = false } = options;
  const target = await db.chartScreenshots.get(targetId);
  if (!target) return [];

  const targetTags = [
    ...safeJson<string[]>(target.patternTags, []),
    ...safeJson<string[]>(target.customTags, []),
    ...getFeatureValues(target.userAddedFeatures),
    ...getFeatureValues(target.extractedFeatures),
  ];

  const all = await db.chartScreenshots.toArray();
  const matches: ChartSimilarityMatch[] = [];

  for (const ss of all) {
    if (ss.id === targetId) continue;
    if (sameSymbol && ss.symbol !== target.symbol) continue;
    if (sameTimeframe && ss.timeframe !== target.timeframe) continue;
    if (sameSession && ss.session !== target.session) continue;

    const ssTags = [
      ...safeJson<string[]>(ss.patternTags, []),
      ...safeJson<string[]>(ss.customTags, []),
      ...getFeatureValues(ss.userAddedFeatures),
      ...getFeatureValues(ss.extractedFeatures),
    ];

    let score = computeTagSimilarity(targetTags, ssTags);

    // Bonus for same session / timeframe / symbol
    if (ss.session && ss.session === target.session) score = Math.min(100, score + 10);
    if (ss.timeframe && ss.timeframe === target.timeframe) score = Math.min(100, score + 8);
    if (ss.symbol && ss.symbol === target.symbol) score = Math.min(100, score + 5);

    if (score < minScore) continue;

    const targetTagSet = new Set(targetTags);
    const matchedTags = ssTags.filter(t => targetTagSet.has(t));

    matches.push({
      screenshotId: ss.id,
      symbol: ss.symbol,
      timeframe: ss.timeframe,
      session: ss.session,
      date: ss.date,
      screenshotType: ss.screenshotType as any,
      patternTags: safeJson<string[]>(ss.patternTags, []),
      matchScore: score,
      matchedTags,
      dataUrl: ss.dataUrl,
      imageBlob: ss.imageBlob ?? null,
      label: ss.label,
      linkedTradeId: ss.tradeId,
      createdAt: ss.createdAt,
    });
  }

  return matches.sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);
}

// ── Pattern Analytics ─────────────────────────────────────────────

/**
 * محاسبه عملکرد هر تگ الگوی بصری بر اساس معاملات واقعی
 */
export async function computePatternPerformance(trades: Trade[]): Promise<PatternPerformanceStats[]> {
  const closedTrades = trades.filter(isClosed);

  // جمع‌آوری همه تگ‌های منحصربه‌فرد از معاملات
  const allTagsSet = new Set<string>();
  for (const trade of closedTrades) {
    const tags = safeJson<string[]>(trade.tags, []);
    tags.forEach(t => allTagsSet.add(t));
  }

  // همچنین از اسکرین‌شات‌های standalone
  const chartSS = await db.chartScreenshots.toArray();
  for (const ss of chartSS) {
    safeJson<string[]>(ss.patternTags, []).forEach(t => allTagsSet.add(t));
  }

  const results: PatternPerformanceStats[] = [];

  for (const tag of allTagsSet) {
    if (!tag.trim()) continue;

    const taggedTrades = closedTrades.filter(t => {
      const tags = safeJson<string[]>(t.tags, []);
      return tags.includes(tag);
    });

    if (taggedTrades.length === 0) continue;

    const wins = taggedTrades.filter(isWin);
    const losses = taggedTrades.filter(isLoss);
    const breakevens = taggedTrades.filter(t => t.result === 'breakeven');
    const rValues = taggedTrades.map(t => t.rMultiple).filter((r): r is number => r !== null);
    const riskValues = taggedTrades.map(t => t.riskPercentage).filter((r): r is number => r !== null);

    const avgR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null;
    const medR = median(rValues);
    const maxLoss = rValues.length > 0 ? Math.min(...rValues) : null;
    const maxWin = rValues.length > 0 ? Math.max(...rValues) : null;
    const expectancy = avgR !== null ? avgR : null;
    const avgRisk = riskValues.length > 0 ? riskValues.reduce((a, b) => a + b, 0) / riskValues.length : null;
    const winRate = taggedTrades.length > 0 ? (wins.length / taggedTrades.length) * 100 : 0;

    results.push({
      patternTag: tag,
      label: PATTERN_TAG_LABELS[tag] ?? tag,
      tradeCount: taggedTrades.length,
      winCount: wins.length,
      lossCount: losses.length,
      breakevenCount: breakevens.length,
      winRate,
      avgR,
      medianR: medR,
      maxLoss,
      maxWin,
      expectancy,
      avgRisk,
      commonMistakes: [],
      commonStrengths: [],
      sampleWarning: taggedTrades.length < 5,
    });
  }

  return results.sort((a, b) => b.tradeCount - a.tradeCount);
}

/** عملکرد یک تگ به تفکیک سشن */
export function computePatternBySession(trades: Trade[], tag: string): PatternBySession[] {
  const sessions = ['asian', 'london', 'newyork', 'overlap'];
  const sessionLabels: Record<string, string> = {
    asian: 'سشن آسیا', london: 'سشن لندن', newyork: 'سشن نیویورک', overlap: 'اورلپ',
  };

  const closedTrades = trades.filter(isClosed);
  return sessions.map(session => {
    const sessionTrades = closedTrades.filter(t => {
      const tags = safeJson<string[]>(t.tags, []);
      return tags.includes(tag) && t.tradingSession === session;
    });
    const wins = sessionTrades.filter(isWin).length;
    const rValues = sessionTrades.map(t => t.rMultiple).filter((r): r is number => r !== null);
    return {
      session,
      sessionLabel: sessionLabels[session],
      tradeCount: sessionTrades.length,
      winRate: sessionTrades.length > 0 ? (wins / sessionTrades.length) * 100 : 0,
      avgR: rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null,
    };
  }).filter(s => s.tradeCount > 0);
}

/** عملکرد یک تگ به تفکیک روز هفته */
export function computePatternByDay(trades: Trade[], tag: string): PatternByDay[] {
  const dayLabels: Record<number, string> = {
    0: 'یک‌شنبه', 1: 'دوشنبه', 2: 'سه‌شنبه', 3: 'چهارشنبه', 4: 'پنج‌شنبه', 5: 'جمعه', 6: 'شنبه',
  };
  const closedTrades = trades.filter(isClosed);
  const byDay: PatternByDay[] = [];

  for (let day = 0; day <= 6; day++) {
    const dayTrades = closedTrades.filter(t => {
      const tags = safeJson<string[]>(t.tags, []);
      const d = getTradingDateParts(t.openedAt).dayOfWeek;
      return tags.includes(tag) && d === day;
    });
    if (dayTrades.length === 0) continue;
    const wins = dayTrades.filter(isWin).length;
    const rValues = dayTrades.map(t => t.rMultiple).filter((r): r is number => r !== null);
    byDay.push({
      dayOfWeek: day,
      dayLabel: dayLabels[day],
      tradeCount: dayTrades.length,
      winRate: dayTrades.length > 0 ? (wins / dayTrades.length) * 100 : 0,
      avgR: rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null,
    });
  }
  return byDay;
}

/** عملکرد یک تگ به تفکیک تایم‌فریم */
export async function computePatternByTimeframe(trades: Trade[], tag: string): Promise<PatternByTimeframe[]> {
  const closedTrades = trades.filter(t => isClosed(t) && t.mtfAnalysis);
  const chartSS = await db.chartScreenshots.where('patternTags').equals(tag).toArray();

  // جمع‌آوری تایم‌فریم‌ها از اسکرین‌شات‌های مستقل
  const tfCounts: Record<string, { wins: number; total: number; rVals: number[] }> = {};

  for (const ss of chartSS) {
    if (!ss.timeframe || !ss.tradeId) continue;
    const trade = closedTrades.find(t => t.id === ss.tradeId);
    if (!trade) continue;
    if (!tfCounts[ss.timeframe]) tfCounts[ss.timeframe] = { wins: 0, total: 0, rVals: [] };
    tfCounts[ss.timeframe].total++;
    if (isWin(trade)) tfCounts[ss.timeframe].wins++;
    if (trade.rMultiple !== null) tfCounts[ss.timeframe].rVals.push(trade.rMultiple);
  }

  return Object.entries(tfCounts).map(([tf, data]) => ({
    timeframe: tf,
    tradeCount: data.total,
    winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
    avgR: data.rVals.length > 0 ? data.rVals.reduce((a, b) => a + b, 0) / data.rVals.length : null,
  }));
}

// ── Mistake & Strength Detection ──────────────────────────────────

/**
 * تشخیص اشتباهات تکراری بصری از طریق تحلیل معاملات
 */
export function detectVisualMistakes(trades: Trade[]): RepeatedPattern[] {
  const closedTrades = trades.filter(isClosed);
  if (closedTrades.length < 3) return [];

  const patterns: RepeatedPattern[] = [];

  // الگو: ورود بدون تأیید (معاملاتی که رویکرد SL ناکافی داشتند)
  const noConfirmTrades = closedTrades.filter(t => {
    const tags = safeJson<string[]>(t.tags, []);
    return tags.includes('no-confirmation') || (t.adherenceRating === 'partially' || t.adherenceRating === 'not');
  });
  if (noConfirmTrades.length >= 2) {
    const losses = noConfirmTrades.filter(isLoss).length;
    patterns.push({
      label: 'ورود بدون تأیید کافی',
      count: noConfirmTrades.length,
      total: closedTrades.length,
      rate: (noConfirmTrades.length / closedTrades.length) * 100,
      evidence: `${noConfirmTrades.length} معامله با پیروی ناقص از پلن — ${losses} ضرر`,
      severity: noConfirmTrades.length >= 5 ? 'high' : 'medium',
      type: 'mistake',
      relatedTradeIds: noConfirmTrades.map(t => t.id),
    });
  }

  // الگو: مدیریت SL بد (SL را در جهت نامطلوب جابجا کرد)
  const slMovedTrades = closedTrades.filter(t => t.slMoved === true && (isLoss(t)));
  if (slMovedTrades.length >= 2) {
    patterns.push({
      label: 'جابجایی SL در جهت نامطلوب',
      count: slMovedTrades.length,
      total: closedTrades.length,
      rate: (slMovedTrades.length / closedTrades.length) * 100,
      evidence: `${slMovedTrades.length} معامله که SL جابجا شد و با ضرر بسته شد`,
      severity: slMovedTrades.length >= 4 ? 'high' : 'medium',
      type: 'mistake',
      relatedTradeIds: slMovedTrades.map(t => t.id),
    });
  }

  // الگو: بستن زودرس معاملات برنده
  const earlyCloseTrades = closedTrades.filter(t => {
    const review = safeJson<any>(t.postTradeReview, {});
    return review.closedEarly === true && (isWin(t));
  });
  if (earlyCloseTrades.length >= 2) {
    const avgR = earlyCloseTrades
      .map(t => t.rMultiple)
      .filter((r): r is number => r !== null)
      .reduce((a, b, _, arr) => a + b / arr.length, 0);
    patterns.push({
      label: 'بستن زودرس معاملات برنده',
      count: earlyCloseTrades.length,
      total: closedTrades.length,
      rate: (earlyCloseTrades.length / closedTrades.length) * 100,
      evidence: `${earlyCloseTrades.length} معامله که زود بسته شد — میانگین R: ${avgR.toFixed(2)}R`,
      severity: 'medium',
      type: 'mistake',
      relatedTradeIds: earlyCloseTrades.map(t => t.id),
    });
  }

  // الگو: معاملات بیش از حد ریسک
  const highRiskTrades = closedTrades.filter(t => {
    const riskPct = t.riskPercentage;
    return riskPct !== null && riskPct > 2;
  });
  if (highRiskTrades.length >= 2) {
    patterns.push({
      label: 'ریسک بیش از حد در معاملات',
      count: highRiskTrades.length,
      total: closedTrades.length,
      rate: (highRiskTrades.length / closedTrades.length) * 100,
      evidence: `${highRiskTrades.length} معامله با ریسک بالاتر از ۲٪`,
      severity: highRiskTrades.length >= 5 ? 'high' : 'low',
      type: 'mistake',
      relatedTradeIds: highRiskTrades.map(t => t.id),
    });
  }

  return patterns;
}

/**
 * تشخیص نقاط قوت تکراری بصری
 */
export function detectVisualStrengths(trades: Trade[]): RepeatedPattern[] {
  const closedTrades = trades.filter(isClosed);
  if (closedTrades.length < 3) return [];

  const patterns: RepeatedPattern[] = [];

  // قوت: نرخ برد بالا در معاملات با تأیید کامل
  const fullAdherenceTrades = closedTrades.filter(t => t.adherenceRating === 'fully');
  if (fullAdherenceTrades.length >= 3) {
    const wins = fullAdherenceTrades.filter(isWin).length;
    const winRate = (wins / fullAdherenceTrades.length) * 100;
    if (winRate >= 55) {
      patterns.push({
        label: 'پیروی کامل از پلن = نتیجه بهتر',
        count: fullAdherenceTrades.length,
        total: closedTrades.length,
        rate: winRate,
        evidence: `${fullAdherenceTrades.length} معامله با پیروی کامل — نرخ برد ${winRate.toFixed(0)}٪`,
        severity: 'low',
        type: 'strength',
        relatedTradeIds: fullAdherenceTrades.map(t => t.id),
      });
    }
  }

  // قوت: معاملات با R/R بالا و نرخ برد مناسب
  const highRRTrades = closedTrades.filter(t => {
    const rr = t.rMultiple;
    return rr !== null && rr >= 1.5;
  });
  if (highRRTrades.length >= 3) {
    patterns.push({
      label: 'نسبت R/R مثبت در معاملات برنده',
      count: highRRTrades.length,
      total: closedTrades.length,
      rate: (highRRTrades.length / closedTrades.length) * 100,
      evidence: `${highRRTrades.length} معامله با R/R بالاتر از ۱.۵`,
      severity: 'low',
      type: 'strength',
      relatedTradeIds: highRRTrades.map(t => t.id),
    });
  }

  // قوت: معاملات در سشن لندن اگر نرخ برد بالاست
  const londonTrades = closedTrades.filter(t => t.tradingSession === 'london');
  if (londonTrades.length >= 3) {
    const wins = londonTrades.filter(isWin).length;
    const winRate = (wins / londonTrades.length) * 100;
    if (winRate >= 55) {
      patterns.push({
        label: 'عملکرد قوی در سشن لندن',
        count: londonTrades.length,
        total: closedTrades.length,
        rate: winRate,
        evidence: `${londonTrades.length} معامله در لندن — نرخ برد ${winRate.toFixed(0)}٪`,
        severity: 'low',
        type: 'strength',
        relatedTradeIds: londonTrades.map(t => t.id),
      });
    }
  }

  return patterns;
}

// ── Outcome Distribution ──────────────────────────────────────────

export function computeOutcomeDistribution(trades: Trade[]): OutcomeDistribution {
  const closed = trades.filter(isClosed);
  const wins = closed.filter(isWin).length;
  const losses = closed.filter(isLoss).length;
  const breakevens = closed.filter(t => t.result === 'breakeven').length;
  const rValues = closed.map(t => t.rMultiple).filter((r): r is number => r !== null);
  const riskValues = closed.map(t => t.riskPercentage).filter((r): r is number => r !== null);

  const avgR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null;
  const medR = median(rValues);
  const maxLoss = rValues.length > 0 ? Math.min(...rValues) : null;
  const avgRisk = riskValues.length > 0 ? riskValues.reduce((a, b) => a + b, 0) / riskValues.length : null;

  return {
    total: closed.length,
    wins,
    losses,
    breakevens,
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
    avgR,
    medianR: medR,
    maxLoss,
    avgRisk,
    sampleWarning: closed.length < 5,
  };
}

// ── Visual Pre-Trade Briefing ─────────────────────────────────────

export async function generateVisualBriefing(
  symbol: string | null,
  setup: string | null,
  patternTags: string[],
  trades: Trade[],
): Promise<VisualPreTradeBriefing> {
  // جستجو برای اسکرین‌شات‌های مشابه
  let similarScreenshots: ChartSimilarityMatch[] = [];
  const allChartSS = await db.chartScreenshots.toArray();

  // مقایسه تگ‌های هدف با همه اسکرین‌شات‌های موجود
  for (const ss of allChartSS) {
    const ssTags = [
      ...safeJson<string[]>(ss.patternTags, []),
      ...safeJson<string[]>(ss.customTags, []),
    ];
    const score = computeTagSimilarity(patternTags, ssTags);
    if (score >= 30 || (symbol && ss.symbol === symbol)) {
      const matchedTags = ssTags.filter(t => patternTags.includes(t));
      similarScreenshots.push({
        screenshotId: ss.id,
        symbol: ss.symbol,
        timeframe: ss.timeframe,
        session: ss.session,
        date: ss.date,
        screenshotType: ss.screenshotType as any,
        patternTags: ssTags,
        matchScore: score,
        matchedTags,
        dataUrl: ss.dataUrl,
        imageBlob: ss.imageBlob ?? null,
        label: ss.label,
        linkedTradeId: ss.tradeId,
        createdAt: ss.createdAt,
      });
    }
  }
  similarScreenshots = similarScreenshots.sort((a, b) => b.matchScore - a.matchScore).slice(0, 6);

  // یافتن معاملات مرتبط برای توزیع نتایج
  const relatedTrades = trades.filter(t => {
    if (symbol && t.symbol !== symbol) return false;
    const tags = safeJson<string[]>(t.tags, []);
    return patternTags.some(tag => tags.includes(tag));
  });

  const distribution = relatedTrades.length > 0 ? computeOutcomeDistribution(relatedTrades) : null;

  // اشتباهات و نقاط قوت
  const mistakes = detectVisualMistakes(relatedTrades.length >= 3 ? relatedTrades : trades);
  const strengths = detectVisualStrengths(relatedTrades.length >= 3 ? relatedTrades : trades);

  // یادداشت کیفیت داده
  let dataQualityNote: string | null = null;
  if (similarScreenshots.length < 3) {
    dataQualityNote = `فقط ${similarScreenshots.length} اسکرین‌شات مشابه یافت شد — نتایج ممکن است محدود باشند`;
  } else if (distribution && distribution.sampleWarning) {
    dataQualityNote = `فقط ${distribution.total} معامله مشابه — حجم نمونه کم است`;
  }

  return {
    symbol,
    setup,
    similarScreenshots,
    outcomeDistribution: distribution,
    relevantLessons: [],
    relevantRules: [],
    knownMistakes: mistakes,
    dataQualityNote,
  };
}

// ── Bulk export/import helper ──────────────────────────────────────

export async function exportScreenshotLibrary(): Promise<object> {
  const [screenshots, groups, patterns, collections] = await Promise.all([
    db.chartScreenshots.toArray(),
    db.screenshotGroups.toArray(),
    db.visualPatterns.toArray(),
    db.screenshotCollections.toArray(),
  ]);
  return {
    exportedAt: Date.now(),
    version: 1,
    screenshots,
    groups,
    patterns,
    collections,
  };
}

export async function getScreenshotStats(): Promise<{
  totalScreenshots: number;
  totalGroups: number;
  totalPatterns: number;
  totalCollections: number;
  symbolCounts: Record<string, number>;
}> {
  const [screenshots, groups, patterns, collections] = await Promise.all([
    db.chartScreenshots.count(),
    db.screenshotGroups.count(),
    db.visualPatterns.count(),
    db.screenshotCollections.count(),
  ]);

  const allSS = await db.chartScreenshots.toArray();
  const symbolCounts: Record<string, number> = {};
  for (const ss of allSS) {
    if (ss.symbol) symbolCounts[ss.symbol] = (symbolCounts[ss.symbol] ?? 0) + 1;
  }

  return { totalScreenshots: screenshots, totalGroups: groups, totalPatterns: patterns, totalCollections: collections, symbolCounts };
}
