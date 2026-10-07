/**
 * Integration Tests — TraderMind
 *
 * تست یکپارچگی بخش‌های اصلی با یکدیگر:
 * Strategy → Analysis → Trade → Reports
 *
 * از fake-indexeddb برای شبیه‌سازی مرورگر در Node استفاده می‌شود.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/database';
import { strategyService } from './strategyService';
import { analysisService } from './analysisService';
import { tradeService } from './tradeService';
import { journalService } from './journalService';
import { backupService, BACKUP_FORMAT_VERSION, APP_VERSION, DB_VERSION } from './backupService';
import { securityService } from '../security/securityService';
import { computeAnalytics, filterTradesByRange, getDateRange } from './analyticsService';

/** ساخت یک payload معتبر از محتوای فعلی DB (بدون browser API) */
async function buildTestBackup() {
  const data = {
    strategies: await db.strategies.toArray(),
    phases: await db.phases.toArray(),
    steps: await db.steps.toArray(),
    rules: await db.rules.toArray(),
    analysisSessions: await db.analysisSessions.toArray(),
    trades: await db.trades.toArray(),
    dailyJournals: await db.dailyJournals.toArray(),
    settings: {} as Record<string, string>,
  };
  const dataJson = JSON.stringify(data);
  const checksum = await securityService.sha256(dataJson);
  const totalRecords = Object.values(data).reduce(
    (sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0
  );
  const metadata = {
    appName: 'TraderMind' as const,
    backupVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    databaseVersion: DB_VERSION,
    createdAt: new Date().toISOString(),
    totalRecords,
    checksum,
  };
  return { metadata, data };
}

// ── پاک‌سازی DB قبل از هر تست ──────────────────────────
beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ════════════════════════════════════════════════════════
// ۱. سناریوی کامل فرآیند تحلیل (بخش ۵ پرامت)
// Strategy → Phase → Step → Session → Complete → Trade
// ════════════════════════════════════════════════════════
describe('Integration: فرآیند کامل تحلیل', () => {
  it('باید کل چرخه ایجاد استراتژی تا ثبت معامله را پشتیبانی کند', async () => {
    // ۱. ایجاد Strategy
    const strategy = await strategyService.createStrategy({
      name: 'Test Strategy',
      description: 'استراتژی تست',
      icon: null,
      colorTag: '#3b82f6',
      isActive: true,
    });
    expect(strategy.id).toBeTruthy();

    // ۲. ایجاد Phase
    const phase = await strategyService.createPhase({
      strategyId: strategy.id,
      name: 'فاز اول',
      description: 'تحلیل اولیه',
      order: 0,
    });
    expect(phase.id).toBeTruthy();

    // ۳. ایجاد Step
    const step = await strategyService.createStep({
      phaseId: phase.id,
      name: 'جهت بازار',
      description: '',
      type: 'select',
      required: true,
      order: 0,
      options: JSON.stringify(['صعودی', 'نزولی']),
      hint: null,
    });
    expect(step.id).toBeTruthy();

    // ۴. شروع Analysis Session
    const session = await analysisService.createSession(strategy.id);
    expect(session.status).toBe('in-progress');
    expect(session.strategyId).toBe(strategy.id);

    // ۵. ثبت پاسخ Step
    const stepResult = { [step.id]: { value: 'صعودی', answeredAt: Date.now() } };
    await analysisService.updateSession(session.id, {
      currentPhaseId: phase.id,
      currentStepId: step.id,
      stepResults: JSON.stringify(stepResult),
    });

    // ۶. تکمیل Session
    await analysisService.completeSession(session.id, 'تصمیم گرفتم');
    const completedSession = await analysisService.getSessionById(session.id);
    expect(completedSession?.status).toBe('completed');
    expect(completedSession?.completedAt).not.toBeNull();

    // ۷. محاسبه adherence score
    const adherence = await tradeService.computeAdherenceScore(session.id);
    expect(adherence).toBe(100); // 1 required step, 1 answered

    // ۸. ثبت Trade
    const trade = await tradeService.createTrade({
      strategyId: strategy.id,
      sessionId: session.id,
      symbol: 'XAUUSD',
      market: null,
      direction: 'long',
      entryPrice: 2000,
      exitPrice: 2010,
      stopLoss: 1990,
      takeProfit: 2020,
      positionSize: null,
      riskAmount: null,
      fees: null,
      status: 'closed',
      result: 'win',
      profitLoss: 100,
      rMultiple: 1,
      riskPercentage: 1,
      adherenceScore: adherence,
      adherenceRating: 'fully',
      adherenceNotes: null,
      emotions: '[]',
      emotionNotes: null,
      reasonForExit: null,
      notes: 'تست',
      screenshots: '[]',
      review: '{}',
      tags: '[]',
      openedAt: Date.now(),
      closedAt: Date.now(),
    });
    expect(trade.id).toBeTruthy();
    expect(trade.sessionId).toBe(session.id);

    // ۹. بررسی در Dashboard Data
    const allTrades = await tradeService.getAllTrades();
    expect(allTrades).toHaveLength(1);
    expect(allTrades[0].strategyId).toBe(strategy.id);

    // ۱۰. بررسی در Reports
    const strategies = await strategyService.getAllStrategies();
    const analytics = computeAnalytics(allTrades, [], strategies);
    expect(analytics.summary.total).toBe(1);
    expect(analytics.summary.wins).toBe(1);
    expect(analytics.summary.winRate).toBe(100);
    const sp = analytics.strategyPerf.find(s => s.strategyId === strategy.id);
    expect(sp).toBeDefined();
    expect(sp!.total).toBe(1);
  });

  it('باید Strategy به درستی به Analysis متصل شود', async () => {
    const strategy = await strategyService.createStrategy({
      name: 'My Strat', description: '', icon: null, colorTag: null, isActive: true,
    });
    const session = await analysisService.createSession(strategy.id);
    expect(session.strategyId).toBe(strategy.id);

    const allSessions = await analysisService.getAllSessions();
    const linked = allSessions.find(s => s.strategyId === strategy.id);
    expect(linked).toBeDefined();
  });

  it('باید ترتیب مراحل درست باشد', async () => {
    const strat = await strategyService.createStrategy({
      name: 'Ordered Strat', description: '', icon: null, colorTag: null, isActive: true,
    });
    await strategyService.createPhase({ strategyId: strat.id, name: 'سوم', description: '', order: 2 });
    await strategyService.createPhase({ strategyId: strat.id, name: 'اول', description: '', order: 0 });
    await strategyService.createPhase({ strategyId: strat.id, name: 'دوم', description: '', order: 1 });

    const phases = await strategyService.getPhasesByStrategyId(strat.id);
    expect(phases[0].name).toBe('اول');
    expect(phases[1].name).toBe('دوم');
    expect(phases[2].name).toBe('سوم');
  });

  it('باید فعال/غیرفعال کردن Strategy کار کند', async () => {
    const strat = await strategyService.createStrategy({
      name: 'Toggle Test', description: '', icon: null, colorTag: null, isActive: true,
    });
    expect(strat.isActive).toBe(true);

    await strategyService.updateStrategy(strat.id, { isActive: false });
    const updated = await strategyService.getStrategyById(strat.id);
    expect(updated?.isActive).toBe(false);
  });
});

// ════════════════════════════════════════════════════════
// ۲. تست Backup و Restore (بخش ۶ پرامت)
// ════════════════════════════════════════════════════════
describe('Integration: Backup و Restore', () => {
  it('باید Export → Clear → Import اطلاعات را درست بازگرداند', async () => {
    // آماده‌سازی داده
    const strat = await strategyService.createStrategy({
      name: 'Backup Test Strat', description: 'test', icon: null, colorTag: null, isActive: true,
    });
    await strategyService.createPhase({ strategyId: strat.id, name: 'فاز ۱', description: '', order: 0 });

    // Snapshot از DB
    const backup = await buildTestBackup();

    // Validate payload
    const validation = await backupService.validateParsed(backup, [], []);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Clear
    await backupService.resetAll();
    expect(await db.strategies.count()).toBe(0);
    expect(await db.phases.count()).toBe(0);

    // Import (Replace)
    await backupService.importReplace(backup.data);

    // بررسی
    const strategies = await db.strategies.toArray();
    expect(strategies).toHaveLength(1);
    expect(strategies[0].name).toBe('Backup Test Strat');

    const phases = await db.phases.toArray();
    expect(phases).toHaveLength(1);
  });

  it('باید Metadata درست باشد', async () => {
    await strategyService.createStrategy({
      name: 'Meta Test', description: '', icon: null, colorTag: null, isActive: true,
    });
    const backup = await buildTestBackup();
    const validation = await backupService.validateParsed(backup, [], []);
    expect(validation.metadata?.appName).toBe('TraderMind');
    expect(validation.metadata?.backupVersion).toBeTruthy();
    expect(validation.metadata?.databaseVersion).toBeGreaterThan(0);
  });

  it('باید Backup خراب را شناسایی کند', async () => {
    const validation = await backupService.validateParsed({ corrupt: true, random: 'data' }, [], []);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('باید Checksum دستکاری‌شده را شناسایی کند', async () => {
    const backup = await buildTestBackup();
    // دستکاری checksum
    backup.metadata.checksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const validation = await backupService.validateParsed(backup, [], []);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('یکپارچگی'))).toBe(true);
  });

  it('باید appName اشتباه را رد کند', async () => {
    const backup = await buildTestBackup();
    (backup.metadata as any).appName = 'OtherApp';
    const validation = await backupService.validateParsed(backup, [], []);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('برنامه دیگری'))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════
// ۳. تست Merge (بخش ۷ پرامت)
// ════════════════════════════════════════════════════════
describe('Integration: Merge', () => {
  it('باید داده‌های جدید را اضافه و کهنه را نگه دارد', async () => {
    // Set A: یک استراتژی
    await strategyService.createStrategy({
      name: 'Strat A', description: 'a', icon: null, colorTag: null, isActive: true,
    });

    // Snapshot از State A
    const backupA = await buildTestBackup();

    // اضافه کردن استراتژی جدید (Set B، بعد از snapshot)
    await strategyService.createStrategy({
      name: 'Strat B', description: 'b', icon: null, colorTag: null, isActive: true,
    });

    // Merge snapshot A → current (A از قبل وجود دارد پس skipped)
    const stats = await backupService.importMerge(backupA.data);
    expect(stats.added + stats.skipped).toBeGreaterThan(0);

    const allStrats = await db.strategies.toArray();
    // هر دو A و B باید باشند
    expect(allStrats.length).toBeGreaterThanOrEqual(2);
    expect(allStrats.some(s => s.name === 'Strat A')).toBe(true);
    expect(allStrats.some(s => s.name === 'Strat B')).toBe(true);
  });

  it('باید رکورد به‌روزشده را با Keep Newest مدیریت کند', async () => {
    const strat = await strategyService.createStrategy({
      name: 'Original', description: 'قدیمی', icon: null, colorTag: null, isActive: true,
    });

    // یک snapshot قدیمی بگیر
    const oldBackup = await buildTestBackup();

    // به‌روزرسانی (timestamp جدیدتر)
    await new Promise(r => setTimeout(r, 10));
    await strategyService.updateStrategy(strat.id, { name: 'Updated' });

    // Merge از snapshot قدیمی — نباید "Updated" را برگرداند
    await backupService.importMerge(oldBackup.data);
    const current = await strategyService.getStrategyById(strat.id);
    expect(current?.name).toBe('Updated'); // Keep Newest — جدیدتر نگه داشته می‌شود
  });

  it('باید resetAll همه جداول را خالی کند', async () => {
    await strategyService.createStrategy({
      name: 'ToDelete', description: '', icon: null, colorTag: null, isActive: true,
    });
    expect(await db.strategies.count()).toBe(1);

    await backupService.resetAll();
    expect(await db.strategies.count()).toBe(0);
    expect(await db.phases.count()).toBe(0);
    expect(await db.trades.count()).toBe(0);
    expect(await db.dailyJournals.count()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// ۴. تست حالت‌های خاص — Edge Cases (بخش ۱۲)
// ════════════════════════════════════════════════════════
describe('Edge Cases', () => {
  it('باید با DB خالی بدون crash کار کند', async () => {
    const trades = await tradeService.getAllTrades();
    const sessions = await analysisService.getAllSessions();
    const strategies = await strategyService.getAllStrategies();
    expect(trades).toHaveLength(0);
    expect(sessions).toHaveLength(0);
    expect(strategies).toHaveLength(0);
    expect(() => computeAnalytics([], [], [])).not.toThrow();
  });

  it('باید پاک کردن Strategy وابسته‌ها را هم حذف کند', async () => {
    const strat = await strategyService.createStrategy({
      name: 'Delete Test', description: '', icon: null, colorTag: null, isActive: true,
    });
    const phase = await strategyService.createPhase({
      strategyId: strat.id, name: 'فاز', description: '', order: 0,
    });
    await strategyService.createStep({
      phaseId: phase.id, name: 'قدم', description: '', type: 'checkbox',
      required: true, order: 0, options: '[]', hint: null,
    });

    await strategyService.deleteStrategy(strat.id);

    expect(await db.strategies.count()).toBe(0);
    expect(await db.phases.count()).toBe(0);
    expect(await db.steps.count()).toBe(0);
  });

  it('باید ژورنال روزانه را صحیح ذخیره و بازیابی کند', async () => {
    const date = '2026-07-20';
    const saved = await journalService.saveJournal({
      date,
      mood: 4,
      energyLevel: 7,
      focusLevel: 8,
      stressLevel: 3,
      notes: 'روز خوبی بود',
      emotions: '[]',
      importantEventsToday: null,
      importantEventsYesterday: null,
      preTradingState: '{}',
      endOfDayReview: '{}',
      tags: '[]',
    });
    expect(saved.date).toBe(date);

    const fetched = await journalService.getJournalByDate(date);
    expect(fetched?.mood).toBe(4);
    expect(fetched?.energyLevel).toBe(7);

    // دوباره ذخیره — باید Update کند نه Insert
    await journalService.saveJournal({
      date,
      mood: 5,
      energyLevel: 8,
      focusLevel: 8,
      stressLevel: 2,
      notes: 'بهتر',
      emotions: '[]',
      importantEventsToday: null,
      importantEventsYesterday: null,
      preTradingState: '{}',
      endOfDayReview: '{}',
      tags: '[]',
    });
    const all = await journalService.getAllJournals();
    expect(all).toHaveLength(1); // نه دو تا
    expect(all[0].mood).toBe(5);
  });
});

// ════════════════════════════════════════════════════════
// ۵. تست Performance (بخش ۱۵)
// ════════════════════════════════════════════════════════
describe('Performance', () => {
  it('باید ۵۰۰۰ معامله را در کمتر از ۵۰۰ms تحلیل کند', () => {
    const trades = Array.from({ length: 5000 }, (_, i) => ({
      id: `t${i}`,
      strategyId: null,
      sessionId: null,
      symbol: 'XAUUSD',
      market: null as null,
      direction: 'long' as const,
      entryPrice: 2000,
      exitPrice: 2010,
      stopLoss: 1990,
      takeProfit: null as null,
      positionSize: null as null,
      riskAmount: null as null,
      fees: null as null,
      status: 'closed' as const,
      result: i % 3 === 0 ? 'loss' as const : 'win' as const,
      profitLoss: i % 3 === 0 ? -50 : 100,
      rMultiple: i % 3 === 0 ? -1 : 2,
      riskPercentage: 1,
      adherenceScore: null as null,
      adherenceRating: null as null,
      adherenceNotes: null as null,
      emotions: '[]',
      emotionNotes: null as null,
      reasonForExit: null as null,
      notes: null as null,
      screenshots: '[]',
      review: '{}',
      tags: '[]',
      openedAt: Date.now() - i * 3600_000,
      closedAt: Date.now() - i * 3600_000 + 1000,
      createdAt: Date.now() - i * 3600_000,
    }));

    const start = performance.now();
    const result = computeAnalytics(trades, [], []);
    const elapsed = performance.now() - start;

    expect(result.summary.total).toBe(5000);
    expect(elapsed).toBeLessThan(500);
  });

  it('باید فیلتر تاریخ روی ۱۰۰۰۰ معامله سریع باشد', () => {
    const now = Date.now();
    const trades = Array.from({ length: 10_000 }, (_, i) => ({
      id: `t${i}`,
      strategyId: null, sessionId: null, symbol: 'XAUUSD', market: null as null,
      direction: 'long' as const, entryPrice: 2000, exitPrice: 2010, stopLoss: 1990,
      takeProfit: null as null, positionSize: null as null, riskAmount: null as null, fees: null as null,
      status: 'closed' as const, result: 'win' as const, profitLoss: 100, rMultiple: 1,
      riskPercentage: 1, adherenceScore: null as null, adherenceRating: null as null, adherenceNotes: null as null,
      emotions: '[]', emotionNotes: null as null, reasonForExit: null as null, notes: null as null,
      screenshots: '[]', review: '{}', tags: '[]',
      openedAt: now - i * 3600_000,
      closedAt: now - i * 3600_000 + 1000,
      createdAt: now - i * 3600_000,
    }));

    const { from, to } = getDateRange('week');
    const start = performance.now();
    const filtered = filterTradesByRange(trades, from, to);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(filtered.length).toBeLessThanOrEqual(10_000);
  });
});
