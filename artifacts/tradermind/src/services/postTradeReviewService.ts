/**
 * postTradeReviewService — سرویس مرور پس از معامله و حلقه یادگیری خودکار
 *
 * این سرویس:
 * ۱. تحلیل AI rule-based بر اساس داده‌های ریویو و تاریخچه تولید می‌کند
 * ۲. اشتباهات تکراری را شناسایی می‌کند
 * ۳. رفتارهای موفق را تشخیص می‌دهد
 * ۴. مسیر یادگیری (Audit Trail) را ذخیره می‌کند
 * ۵. پروفایل نمادها را آپدیت می‌کند
 */

import { db, Trade, PostTradeReviewData, PostTradeAIAnalysis, DetectedPattern, LearningAuditEntry, AuditEntryType, defaultPostTradeReview } from '../db/database';

// ── Helpers ──────────────────────────────────────────────────────────

function parseReview(trade: Trade): PostTradeReviewData {
  try {
    const r = JSON.parse(trade.postTradeReview || '{}');
    return { ...defaultPostTradeReview, ...r };
  } catch { return { ...defaultPostTradeReview }; }
}

import { isWin, isClosed } from '../lib/tradeHelpers';

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

// ── تشخیص اشتباهات تکراری ────────────────────────────────────────────

function detectMistakes(current: PostTradeReviewData, allTrades: Trade[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const reviewed = allTrades.filter(t => {
    try { const r = JSON.parse(t.postTradeReview || '{}'); return !!r.completedAt; } catch { return false; }
  });

  if (reviewed.length < 2) return [];

  // ① ورود زودهنگام / دیرهنگام
  const entryTimingIssues = reviewed.filter(t => {
    const r = parseReview(t);
    return r.entryTiming === 'early' || r.entryTiming === 'late' || r.entryTiming === 'chased';
  });
  if (entryTimingIssues.length >= 2) {
    const rate = pct(entryTimingIssues.length, reviewed.length);
    const winsWithIssue = entryTimingIssues.filter(isWin).length;
    patterns.push({
      label: 'مشکل زمان‌بندی ورود',
      count: entryTimingIssues.length,
      total: reviewed.length,
      rate,
      evidence: `در ${entryTimingIssues.length} از ${reviewed.length} معامله بررسی‌شده، ورود خارج از زمان بهینه بوده (${rate}٪). نرخ برد در این معاملات: ${pct(winsWithIssue, entryTimingIssues.length)}٪`,
      recommendation: 'صبر برای تأیید کامل سیگنال قبل از ورود توصیه می‌شود.',
      severity: rate >= 50 ? 'high' : rate >= 30 ? 'medium' : 'low',
    });
  }

  // ② جابجایی SL
  const slMoved = reviewed.filter(t => parseReview(t).slMoved === true);
  if (slMoved.length >= 2) {
    const rate = pct(slMoved.length, reviewed.length);
    const winsAfterMove = slMoved.filter(isWin).length;
    patterns.push({
      label: 'جابجایی حد ضرر',
      count: slMoved.length,
      total: reviewed.length,
      rate,
      evidence: `در ${slMoved.length} معامله، SL جابجا شده. نرخ برد بعد از جابجایی: ${pct(winsAfterMove, slMoved.length)}٪`,
      recommendation: 'حد ضرر اولیه باید محترم شمرده شود. جابجایی SL معمولاً نتایج را بدتر می‌کند.',
      severity: rate >= 40 ? 'high' : rate >= 20 ? 'medium' : 'low',
    });
  }

  // ③ بستن زودهنگام
  const closedEarly = reviewed.filter(t => parseReview(t).closedEarly === true);
  if (closedEarly.length >= 2) {
    const rate = pct(closedEarly.length, reviewed.length);
    patterns.push({
      label: 'بستن زودهنگام معامله',
      count: closedEarly.length,
      total: reviewed.length,
      rate,
      evidence: `در ${closedEarly.length} معامله، موقعیت زودتر از برنامه بسته شده (${rate}٪ معاملات بررسی‌شده).`,
      recommendation: 'هدف قیمتی را از ابتدا مشخص کنید و تا رسیدن به آن یا فعال شدن SL صبر کنید.',
      severity: rate >= 40 ? 'medium' : 'low',
    });
  }

  // ④ ورود بدون تأیید
  const noConfirmation = reviewed.filter(t => parseReview(t).enteredWithConfirmation === false);
  if (noConfirmation.length >= 2) {
    const rate = pct(noConfirmation.length, reviewed.length);
    const winsNoConf = noConfirmation.filter(isWin).length;
    patterns.push({
      label: 'ورود بدون تأیید',
      count: noConfirmation.length,
      total: reviewed.length,
      rate,
      evidence: `${noConfirmation.length} معامله بدون تأیید مناسب انجام شده. نرخ برد: ${pct(winsNoConf, noConfirmation.length)}٪`,
      recommendation: 'همیشه منتظر تأیید کافی بمانید. ورود پیش از تأیید، ریسک‌پذیری ناآگاهانه است.',
      severity: rate >= 40 ? 'high' : rate >= 20 ? 'medium' : 'low',
    });
  }

  // ⑤ رفتارهای احساسی تکراری (FOMO, Revenge)
  const emotionalFlags = ['fomo', 'revenge-trading', 'overconfidence'] as const;
  for (const flag of emotionalFlags) {
    const flagged = reviewed.filter(t => parseReview(t).behaviorFlags.includes(flag));
    if (flagged.length >= 2) {
      const rate = pct(flagged.length, reviewed.length);
      const winsWhenFlagged = flagged.filter(isWin).length;
      const labelMap: Record<string, string> = { fomo: 'FOMO', 'revenge-trading': 'معامله انتقامی', overconfidence: 'اعتماد به نفس کاذب' };
      patterns.push({
        label: labelMap[flag],
        count: flagged.length,
        total: reviewed.length,
        rate,
        evidence: `${flagged.length} معامله با برچسب «${labelMap[flag]}». نرخ برد: ${pct(winsWhenFlagged, flagged.length)}٪ (میانگین کلی: ${pct(reviewed.filter(isWin).length, reviewed.filter(isClosed).length || 1)}٪)`,
        recommendation: flag === 'fomo' ? 'قبل از ورود به معامله، بررسی کنید آیا ستاپ واقعی است یا فقط ترس از دست دادن فرصت.' :
                        flag === 'revenge-trading' ? 'بعد از یک ضرر، حتماً استراحت کنید. معامله انتقامی تقریباً همیشه به ضرر بیشتر ختم می‌شود.' :
                        'اعتماد به نفس را با اطلاعات و سیستم تأیید کنید، نه با احساس.',
        severity: rate >= 30 ? 'high' : 'medium',
      });
    }
  }

  // ⑥ افزایش ریسک
  const increasedRisk = reviewed.filter(t => parseReview(t).riskIncreased === true);
  if (increasedRisk.length >= 2) {
    const rate = pct(increasedRisk.length, reviewed.length);
    patterns.push({
      label: 'افزایش ریسک در معامله',
      count: increasedRisk.length,
      total: reviewed.length,
      rate,
      evidence: `در ${increasedRisk.length} معامله، ریسک در طول معامله افزایش یافته (${rate}٪ معاملات).`,
      recommendation: 'ریسک هر معامله را قبل از ورود تعیین کنید و در طول معامله تغییر ندهید.',
      severity: rate >= 30 ? 'high' : 'medium',
    });
  }

  return patterns.sort((a, b) => b.severity.localeCompare(a.severity) || b.rate - a.rate);
}

// ── تشخیص رفتارهای موفق ─────────────────────────────────────────────

function detectSuccesses(allTrades: Trade[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const reviewed = allTrades.filter(t => {
    try { const r = JSON.parse(t.postTradeReview || '{}'); return !!r.completedAt; } catch { return false; }
  });

  if (reviewed.length < 3) return [];

  // ① پیروی از پلن
  const followedPlan = reviewed.filter(t => parseReview(t).entryFollowedPlan === true);
  if (followedPlan.length >= 2) {
    const winsFollowed = followedPlan.filter(isWin).length;
    const winsNotFollowed = reviewed.filter(t => parseReview(t).entryFollowedPlan === false && isWin(t)).length;
    const notFollowed = reviewed.filter(t => parseReview(t).entryFollowedPlan === false).length;
    if (followedPlan.length >= 3) {
      patterns.push({
        label: 'پیروی از برنامه معاملاتی',
        count: followedPlan.length,
        total: reviewed.length,
        rate: pct(followedPlan.length, reviewed.length),
        evidence: `نرخ برد با پیروی از پلن: ${pct(winsFollowed, followedPlan.length)}٪ | بدون پیروی: ${pct(winsNotFollowed, notFollowed || 1)}٪`,
        recommendation: 'ادامه پیروی از برنامه معاملاتی توصیه می‌شود.',
        severity: 'low',
      });
    }
  }

  // ② ورود به موقع
  const goodTiming = reviewed.filter(t => parseReview(t).entryTiming === 'on-time');
  if (goodTiming.length >= 2) {
    const winsGood = goodTiming.filter(isWin).length;
    patterns.push({
      label: 'زمان‌بندی صحیح ورود',
      count: goodTiming.length,
      total: reviewed.length,
      rate: pct(goodTiming.length, reviewed.length),
      evidence: `نرخ برد با ورود به موقع: ${pct(winsGood, goodTiming.length)}٪ در ${goodTiming.length} معامله.`,
      recommendation: 'این رویکرد را ادامه دهید.',
      severity: 'low',
    });
  }

  // ③ رعایت SL
  const respectedSL = reviewed.filter(t => parseReview(t).slRespected === true && !parseReview(t).slMoved);
  if (respectedSL.length >= 2) {
    patterns.push({
      label: 'احترام به حد ضرر',
      count: respectedSL.length,
      total: reviewed.length,
      rate: pct(respectedSL.length, reviewed.length),
      evidence: `در ${respectedSL.length} معامله، حد ضرر کاملاً رعایت شده. این نشانه انضباط معاملاتی است.`,
      recommendation: 'این انضباط را حفظ کنید — رعایت SL سرمایه شما را در بلندمدت محافظت می‌کند.',
      severity: 'low',
    });
  }

  // ④ ورود با تأیید
  const withConfirmation = reviewed.filter(t => parseReview(t).enteredWithConfirmation === true);
  if (withConfirmation.length >= 2) {
    const winsWithConf = withConfirmation.filter(isWin).length;
    patterns.push({
      label: 'ورود با تأیید',
      count: withConfirmation.length,
      total: reviewed.length,
      rate: pct(withConfirmation.length, reviewed.length),
      evidence: `نرخ برد با تأیید: ${pct(winsWithConf, withConfirmation.length)}٪ در ${withConfirmation.length} معامله.`,
      recommendation: 'این الگوی مثبت را ادامه دهید.',
      severity: 'low',
    });
  }

  return patterns;
}

// ── تولید تحلیل AI ──────────────────────────────────────────────────

export function generateAIAnalysis(
  trade: Trade,
  review: PostTradeReviewData,
  allTrades: Trade[],
): PostTradeAIAnalysis {
  const findings: string[] = [];

  // مقایسه انتظار و واقعیت
  let expectationVsReality = '';
  if (review.expectationText && review.actualBehaviorText) {
    const correct = review.directionalAccuracy === 'correct';
    const partial = review.directionalAccuracy === 'partial';
    expectationVsReality = correct
      ? `تحلیل جهت بازار درست بوده است. ${review.actualBehaviorText ? 'واقعیت: ' + review.actualBehaviorText : ''}`
      : partial
        ? `تحلیل جهت تا حدی درست بوده است. بازار رفتار متفاوتی داشت.`
        : `جهت پیش‌بینی‌شده نادرست بوده است. بازار برعکس انتظار حرکت کرد.`;
    if (review.timingAccuracy === 'early') findings.push('ورود زودتر از موعد مناسب بوده است.');
    if (review.timingAccuracy === 'late') findings.push('ورود دیرتر از موعد مناسب بوده است.');
    if (review.entryAccuracy === 'poor') findings.push('دقت ورود پایین بوده — قیمت ورود از حالت ایده‌آل فاصله داشته.');
    if (review.exitAccuracy === 'early') findings.push('خروج زودهنگام — بخشی از پتانسیل معامله استفاده نشد.');
    if (review.exitAccuracy === 'late') findings.push('خروج دیرهنگام — سود بیشتری از دست رفته یا ضرر اضافی وارد شده.');
  } else {
    expectationVsReality = 'انتظار اولیه ثبت نشده — مقایسه امکان‌پذیر نیست.';
  }

  // ارزیابی اجرا
  let executionAssessment = '';
  const execParts: string[] = [];
  if (review.entryFollowedPlan === true) execParts.push('ورود طبق برنامه بوده');
  if (review.entryFollowedPlan === false) execParts.push('ورود از برنامه منحرف شده');
  if (review.enteredWithConfirmation === false) execParts.push('بدون تأیید کافی وارد شده');
  if (review.slRespected === true) execParts.push('حد ضرر رعایت شده');
  if (review.slMoved === true) execParts.push('حد ضرر جابجا شده (ریسک مدیریت نشده)');
  if (review.riskIncreased === true) execParts.push('ریسک در طول معامله افزایش یافته');
  if (review.closedEarly === true) execParts.push('معامله زودتر از موعد بسته شده');
  if (review.heldTooLong === true) execParts.push('معامله بیش از موعد نگه داشته شده');
  executionAssessment = execParts.length > 0 ? execParts.join(' | ') : 'اطلاعات اجرا ثبت نشده.';

  // کیفیت جدا از نتیجه
  const isWinResult = isWin(trade);
  const avgQuality = [review.tradeQualityScore, review.analysisQualityScore, review.executionQualityScore, review.riskMgmtQualityScore]
    .filter(s => s !== null) as number[];
  const avgQ = avgQuality.length > 0 ? avgQuality.reduce((a, b) => a + b, 0) / avgQuality.length : null;

  let qualitySeparation = '';
  if (avgQ !== null) {
    if (isWinResult && avgQ >= 4) qualitySeparation = '✅ معامله خوب — نتیجه خوب: اجرای کیفی با نتیجه مثبت.';
    else if (isWinResult && avgQ < 3) {
      qualitySeparation = '⚠️ معامله ضعیف — نتیجه خوب: برد احتمالاً بیشتر از شانس بوده تا اجرای درست.';
      findings.push('برد با کیفیت پایین اجرا — از این برد درس اشتباه نگیرید.');
      if (!review.luckyWin) review.luckyWin = true;
    } else if (!isWinResult && avgQ >= 4) {
      qualitySeparation = '✅ معامله خوب — نتیجه بد: اجرا درست بوده اما بازار خلاف پیش‌بینی حرکت کرد. این یک ضرر طبیعی است.';
      findings.push('این یک ضرر طبیعی است — ستاپ معتبر بود، بازار فقط خلاف پیش‌بینی حرکت کرد.');
    } else if (!isWinResult && avgQ < 3) qualitySeparation = '❌ معامله ضعیف — نتیجه بد: اجرای ضعیف و نتیجه منفی.';
    else qualitySeparation = `کیفیت میانگین: ${avgQ.toFixed(1)}/5`;
  } else {
    qualitySeparation = isWinResult ? 'معامله سودده' : 'معامله زیان‌ده';
  }

  // یافته‌های تحلیل بازار
  if (review.htfAnalysisCorrect === false) findings.push('تحلیل تایم‌فریم بالا نادرست بوده — اساس تحلیل مشکل داشته.');
  if (review.m15StructureCorrect === false) findings.push('ساختار ۱۵ دقیقه به درستی شناسایی نشده.');
  if (review.m5SetupCorrect === false) findings.push('ستاپ ۵ دقیقه نادرست بوده.');
  if (review.m1EntryValid === false) findings.push('تأیید ورود در ۱ دقیقه معتبر نبوده.');
  if (review.htfAnalysisCorrect === true && review.m15StructureCorrect === true) findings.push('تحلیل چندتایم‌فریم درست بوده — این یک مهارت مهم است.');

  // رفتارهای احساسی
  if (review.behaviorFlags.includes('fomo')) findings.push('FOMO در این معامله نقش داشته — تصمیم احتمالاً تحت تأثیر ترس از دست دادن بوده.');
  if (review.behaviorFlags.includes('revenge-trading')) findings.push('معامله انتقامی شناسایی شده — این یک سیگنال هشدار جدی است.');
  if (review.behaviorFlags.includes('overconfidence')) findings.push('اعتماد به نفس کاذب احتمالاً در این معامله نقش داشته.');

  // رویدادهای بازار
  if (review.unexpectedEvent === true) findings.push('یک رویداد غیرمنتظره در بازار رخ داده — این ضرر نباید به تحلیل شما نسبت داده شود.');
  if (review.deeperRetracement === true) findings.push('بازار بازگشت عمیق‌تری داشته — استاپ پلیسمنت نیاز به بررسی دارد.');

  // تشخیص اشتباهات و موفقیت‌ها
  const repeatedMistakes = detectMistakes(review, allTrades);
  const successfulBehaviors = detectSuccesses(allTrades);

  // آپدیت‌های دانش
  const knowledgeUpdates: string[] = [];
  if (review.completedAt > 0) knowledgeUpdates.push(`ریویو ${trade.symbol} ثبت و به حافظه تاریخی اضافه شد.`);
  if (repeatedMistakes.length > 0) knowledgeUpdates.push(`${repeatedMistakes.length} الگوی اشتباه تکراری در تاریخچه شناسایی و به‌روز شد.`);
  if (successfulBehaviors.length > 0) knowledgeUpdates.push(`${successfulBehaviors.length} رفتار موفق در تاریخچه شناسایی شد.`);
  if (review.expectationText) knowledgeUpdates.push('انتظار اولیه برای مقایسه‌های آینده ذخیره شد.');

  // خلاصه
  const goodExec = avgQ !== null && avgQ >= 3.5;
  const summary = isWinResult
    ? goodExec
      ? `معامله ${trade.symbol} با اجرای خوب (${avgQ?.toFixed(1)}/5) به سود رسید. ${findings.length > 0 ? 'نکات بهبود: ' + findings.slice(0, 2).join('، ') : 'ادامه این رویکرد توصیه می‌شود.'}`
      : `معامله ${trade.symbol} سودده بود اما کیفیت اجرا پایین (${avgQ?.toFixed(1)}/5). ${findings.slice(0, 2).join('، ')}`
    : review.lossCategory === 'valid-setup'
      ? `ضرر ${trade.symbol} یک ضرر قابل قبول بود — ستاپ معتبر، اجرای ${goodExec ? 'درست' : 'نیاز به بهبود'}. بازار خلاف پیش‌بینی حرکت کرد.`
      : `ضرر ${trade.symbol} نیاز به بررسی دارد. ${findings.slice(0, 2).join('، ')}`;

  return {
    generatedAt: Date.now(),
    expectationVsReality,
    executionAssessment,
    qualitySeparation,
    keyFindings: findings.slice(0, 6),
    repeatedMistakes,
    successfulBehaviors,
    knowledgeUpdates,
    summary,
  };
}

// ── ذخیره Audit Trail ────────────────────────────────────────────────

export async function saveAuditEntry(
  tradeId: string,
  type: AuditEntryType,
  description: string,
  detail: object,
  supportingTradeIds: string[] = [],
): Promise<void> {
  const entry: LearningAuditEntry = {
    id: crypto.randomUUID(),
    tradeId,
    type,
    description,
    detail: JSON.stringify(detail),
    supportingTradeIds: JSON.stringify(supportingTradeIds),
    createdAt: Date.now(),
  };
  await db.learningAuditTrail.add(entry);
}

// ── ذخیره ریویو کامل ─────────────────────────────────────────────────

export async function savePostTradeReview(
  tradeId: string,
  reviewData: PostTradeReviewData,
): Promise<void> {
  const allTrades = await db.trades.toArray();
  const trade = allTrades.find(t => t.id === tradeId);
  if (!trade) throw new Error('Trade not found');

  // تولید تحلیل AI
  const aiAnalysis = generateAIAnalysis(trade, reviewData, allTrades);
  const finalReview: PostTradeReviewData = {
    ...reviewData,
    completedAt: reviewData.completedAt || Date.now(),
    aiAnalysis,
  };

  // ذخیره در trade
  await db.trades.update(tradeId, {
    postTradeReview: JSON.stringify(finalReview),
  });

  // Audit Trail
  await saveAuditEntry(tradeId, 'review-completed', `ریویو پس از معامله ${trade.symbol} تکمیل شد.`, { symbol: trade.symbol, result: trade.result, avgQuality: [reviewData.tradeQualityScore, reviewData.analysisQualityScore, reviewData.executionQualityScore].filter(Boolean) });

  if (aiAnalysis.repeatedMistakes.length > 0) {
    for (const m of aiAnalysis.repeatedMistakes) {
      await saveAuditEntry(tradeId, 'mistake-detected', `اشتباه تکراری: ${m.label}`, m, [tradeId]);
    }
  }

  if (aiAnalysis.successfulBehaviors.length > 0) {
    for (const b of aiAnalysis.successfulBehaviors) {
      await saveAuditEntry(tradeId, 'behavior-detected', `رفتار موفق: ${b.label}`, b, [tradeId]);
    }
  }
}

// ── دریافت تاریخچه Audit ─────────────────────────────────────────────

export async function getAuditTrailForTrade(tradeId: string): Promise<LearningAuditEntry[]> {
  return db.learningAuditTrail.where('tradeId').equals(tradeId).sortBy('createdAt');
}

export async function getAllAuditEntries(limit = 50): Promise<LearningAuditEntry[]> {
  return db.learningAuditTrail.orderBy('createdAt').reverse().limit(limit).toArray();
}

// ── وضعیت یادگیری کلی ───────────────────────────────────────────────

export interface LearningStats {
  totalReviewed: number;
  reviewRate: number;           // درصد از معاملات بسته‌شده
  avgTradeQuality: number | null;
  avgAnalysisQuality: number | null;
  avgExecutionQuality: number | null;
  topMistake: DetectedPattern | null;
  topBehavior: DetectedPattern | null;
  goodTradeGoodOutcome: number;
  goodTradeBadOutcome: number;
  badTradeGoodOutcome: number;
  badTradeBadOutcome: number;
}

export async function getLearningStats(): Promise<LearningStats> {
  const allTrades = await db.trades.toArray();
  const closed = allTrades.filter(isClosed);
  const reviewed = allTrades.filter(t => {
    try { const r = JSON.parse(t.postTradeReview || '{}'); return r.completedAt > 0; } catch { return false; }
  });

  const qualities = reviewed.map(t => {
    const r = parseReview(t);
    return {
      trade: r.tradeQualityScore,
      analysis: r.analysisQualityScore,
      execution: r.executionQualityScore,
      isWin: isWin(t),
    };
  });

  const avg = (arr: (number | null)[]) => {
    const v = arr.filter((x): x is number => x !== null);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const mistakes = detectMistakes(defaultPostTradeReview, allTrades);
  const successes = detectSuccesses(allTrades);

  let gtgo = 0, gtbo = 0, btgo = 0, btbo = 0;
  for (const q of qualities) {
    const good = q.trade !== null && q.trade >= 3.5;
    if (good && q.isWin) gtgo++;
    else if (good && !q.isWin) gtbo++;
    else if (!good && q.isWin) btgo++;
    else btbo++;
  }

  return {
    totalReviewed: reviewed.length,
    reviewRate: closed.length > 0 ? pct(reviewed.length, closed.length) : 0,
    avgTradeQuality: avg(qualities.map(q => q.trade)),
    avgAnalysisQuality: avg(qualities.map(q => q.analysis)),
    avgExecutionQuality: avg(qualities.map(q => q.execution)),
    topMistake: mistakes[0] || null,
    topBehavior: successes[0] || null,
    goodTradeGoodOutcome: gtgo,
    goodTradeBadOutcome: gtbo,
    badTradeGoodOutcome: btgo,
    badTradeBadOutcome: btbo,
  };
}

// ── آپدیت پروفایل نماد ──────────────────────────────────────────────

export async function updateSymbolProfileAfterReview(trade: Trade, review: PostTradeReviewData): Promise<void> {
  if (!trade.symbol) return;
  const existing = await db.symbolProfiles.where('symbol').equals(trade.symbol).first();
  const notes = existing?.notes || '';
  const addNote = review.userReflection ? `\n[${new Date().toLocaleDateString('fa-IR')}] ${review.userReflection.slice(0, 100)}` : '';
  if (existing && addNote) {
    await db.symbolProfiles.update(existing.id, {
      notes: (notes + addNote).slice(0, 2000),
      updatedAt: Date.now(),
    });
  }
}

export const postTradeReviewService = {
  savePostTradeReview,
  generateAIAnalysis,
  getAuditTrailForTrade,
  getAllAuditEntries,
  getLearningStats,
  updateSymbolProfileAfterReview,
  parseReview,
};
