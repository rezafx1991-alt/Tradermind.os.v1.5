import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { Blob as NodeBlob } from 'node:buffer';
import { db } from '../../db/database';
import { accountService } from '../accountService';
import { backupService } from '../backupService';
import { journalSessionService } from '../journalSessionService';
import { strategyService } from '../strategyService';
import { tradeService } from '../tradeService';
import { tradingBoxService } from '../tradingBoxService';

async function seedSession() {
  const account = await accountService.create({
    name: 'Primary',
    broker: 'Local',
    currency: 'USD',
    initialBalance: 10_000,
    currentBalance: 10_000,
    color: '#3b82f6',
    isDefault: true,
    notes: null,
  });
  const box = await tradingBoxService.create({
    accountId: account.id,
    name: 'Forward test',
    description: null,
    targetTradeCount: 30,
    color: '#14b8a6',
    status: 'active',
    notes: null,
  });
  const strategy = await strategyService.createStrategy({
    name: 'Liquidity reversal',
    description: 'Test',
    icon: null,
    colorTag: null,
    isActive: true,
  });
  const phase = await strategyService.createPhase({
    strategyId: strategy.id,
    name: 'Context',
    description: '',
    order: 0,
  });
  const step = await strategyService.createStep({
    phaseId: phase.id,
    name: 'Check sweep',
    description: '',
    type: 'checkbox',
    required: true,
    order: 0,
    options: '[]',
    hint: null,
  });
  const rule = await strategyService.createRule({
    stepId: step.id,
    title: 'Wait for confirmation',
    description: '',
    type: 'checkbox',
    required: true,
    order: 0,
    options: '[]',
  });
  await journalSessionService.ensureDefaultOptions();
  const session = await journalSessionService.createSession({
    accountId: account.id,
    tradingBoxId: box.id,
    strategyId: strategy.id,
    symbols: ['EURUSD'],
    startTime: Date.now(),
  });
  return { account, box, strategy, rule, session };
}

describe('journalSessionService', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('seeds configurable options once and preserves disabled option records', async () => {
    await journalSessionService.ensureDefaultOptions();
    const initialCount = await db.journalOptions.count();
    await journalSessionService.ensureDefaultOptions();
    expect(await db.journalOptions.count()).toBe(initialCount);

    const option = await journalSessionService.createOption({
      category: 'psychology',
      label: 'Patient',
      description: 'Waited for confirmation',
    });
    await expect(journalSessionService.createOption({ category: 'psychology', label: 'patient' }))
      .rejects.toThrow(/already|وجود/);
    await journalSessionService.updateOption(option.id, { label: 'Patient and calm', description: 'Updated note' });
    await journalSessionService.setOptionEnabled(option.id, false);

    expect(await db.journalOptions.get(option.id)).toMatchObject({
      label: 'Patient and calm',
      description: 'Updated note',
      enabled: false,
    });
    expect(await journalSessionService.getOptions('psychology')).not.toContainEqual(
      expect.objectContaining({ id: option.id }),
    );
    expect(await journalSessionService.getOptions('psychology', true)).toContainEqual(
      expect.objectContaining({ id: option.id }),
    );
  });

  it('archives accounts without breaking the sessions that reference them', async () => {
    const { account, session } = await seedSession();
    await accountService.delete(account.id);

    expect((await db.accounts.get(account.id))?.isArchived).toBe(true);
    expect(await db.journalSessions.get(session.id)).toMatchObject({ accountId: account.id });
    expect(await accountService.getActive()).not.toContainEqual(expect.objectContaining({ id: account.id }));

    await accountService.setArchived(account.id, false);
    expect((await accountService.getActive()).map(item => item.id)).toContain(account.id);
  });

  it('migrates v23 trades and accounts without changing their existing links', async () => {
    await db.close();
    await db.delete();
    const previous = new Dexie(db.name);
    previous.version(23).stores({
      trades: 'id, sessionId, strategyId, accountId, boxId, symbol, direction, result, status, openedAt, closedAt, [symbol+openedAt]',
      accounts: 'id, name, isDefault, createdAt',
      tradingBoxes: 'id, name, status, accountId, createdAt',
    });
    await previous.open();
    await previous.table('accounts').add({
      id: 'legacy-account',
      name: 'Legacy account',
      broker: '',
      currency: 'USD',
      initialBalance: null,
      currentBalance: null,
      color: '#3b82f6',
      isDefault: true,
      notes: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await previous.table('trades').add({
      id: 'legacy-trade',
      sessionId: 'analysis-session-1',
      accountId: 'legacy-account',
      boxId: 'legacy-box',
      symbol: 'EURUSD',
      openedAt: 2,
      status: 'open',
      result: 'open',
    });
    previous.close();

    await db.open();
    expect(await db.trades.get('legacy-trade')).toMatchObject({
      sessionId: 'analysis-session-1',
      journalSessionId: null,
      accountId: 'legacy-account',
      boxId: 'legacy-box',
      symbol: 'EURUSD',
    });
    expect(await db.accounts.get('legacy-account')).toMatchObject({ isArchived: false });
    expect(await db.journalSessions.count()).toBe(0);
  });

  it('snapshots strategy rules, links trades, and calculates session analytics', async () => {
    const { account, box, strategy, rule, session } = await seedSession();
    const snapshot = await db.strategyVersions.get(session.strategyVersionId);
    expect(snapshot?.strategyId).toBe(strategy.id);
    expect(JSON.parse(snapshot!.rulesSnapshot).rules).toContainEqual(expect.objectContaining({ id: rule.id }));

    const trade = await tradeService.createTrade({
      journalSessionId: session.id,
      status: 'closed',
      result: 'win',
      symbol: 'EURUSD',
      profitLoss: 100,
      fees: 2,
      commission: 3,
      spread: 1,
      rMultiple: 2,
      openedAt: session.startTime + 1_000,
      closedAt: session.startTime + 60_000,
    });
    expect(trade.journalSessionId).toBe(session.id);
    expect(trade.accountId).toBe(account.id);
    expect(trade.boxId).toBe(box.id);
    expect(trade.strategyId).toBe(strategy.id);

    const anxiety = await db.journalOptions.where('category').equals('psychology').first();
    const trigger = await db.journalOptions.where('category').equals('entry_trigger').first();
    const grade = await db.journalOptions.where('category').equals('setup_grade').first();
    expect(anxiety && trigger && grade).toBeTruthy();
    await journalSessionService.saveTradeData({
      tradeId: trade.id,
      journalSessionId: session.id,
      entryTriggerOptionIds: JSON.stringify([trigger!.id]),
      entryReasonOptionId: null,
      exitReasonOptionId: null,
      setupTypeOptionId: null,
      setupGradeOptionId: grade!.id,
      checklistResults: '{}',
      psychology: JSON.stringify({ before: { optionIds: [anxiety!.id], intensity: 2 } }),
      mistakeOptionIds: '[]',
      strategyCompliance: 'yes',
      violatedRuleIds: '[]',
      setupQuality: 8,
      executionQuality: 9,
    });

    const metrics = await journalSessionService.getSessionMetrics(session.id);
    expect(metrics).toMatchObject({ totalTrades: 1, wins: 1, losses: 0, netPnl: 94, totalR: 2, averageR: 2 });
    const filtered = await journalSessionService.getAnalytics({
      accountId: account.id,
      tradingBoxId: box.id,
      strategyVersionId: session.strategyVersionId,
      entryTriggerOptionId: trigger!.id,
      psychologyOptionId: anxiety!.id,
      setupGradeOptionId: grade!.id,
      minSetupQuality: 8,
      strategyCompliance: 'yes',
    });
    expect(filtered.trades.map(item => item.id)).toEqual([trade.id]);
    expect(filtered.tradeData).toHaveLength(1);
  });

  it('upserts timeframe analysis and records no-trade events', async () => {
    const { session } = await seedSession();
    const timeframe = await db.journalOptions.where('category').equals('timeframe').first();
    const eventType = await db.journalOptions.where('category').equals('session_event_type').first();
    expect(timeframe && eventType).toBeTruthy();

    const first = await journalSessionService.saveAnalysis({
      sessionId: session.id,
      timeframeOptionId: timeframe!.id,
      directionOptionId: null,
      marketStructureOptionId: null,
      liquidityContextOptionIds: '[]',
      expectedDirectionOptionId: null,
      zones: '1.0800–1.0820',
      notes: 'Wait for sweep',
      tags: '[]',
    });
    const second = await journalSessionService.saveAnalysis({
      sessionId: session.id,
      timeframeOptionId: timeframe!.id,
      directionOptionId: null,
      marketStructureOptionId: null,
      liquidityContextOptionIds: '[]',
      expectedDirectionOptionId: null,
      zones: '1.0810',
      notes: 'Updated',
      tags: '[]',
    });
    expect(second.id).toBe(first.id);
    expect(await db.journalSessionAnalyses.count()).toBe(1);

    const event = await journalSessionService.addEvent({
      sessionId: session.id,
      typeOptionId: eventType!.id,
      notes: 'Valid setup, no confirmation',
      eventAt: session.startTime,
    });
    expect((await journalSessionService.getBundle(session.id))?.events).toContainEqual(event);
    await journalSessionService.deleteEvent(event.id);
    expect(await db.journalSessionEvents.count()).toBe(0);
  });

  it('deleting an analysis clears its media and links but preserves its trade and trigger', async () => {
    const { session } = await seedSession();
    const timeframe = (await journalSessionService.getOptions('timeframe'))[0];
    const [analysis] = await journalSessionService.createAnalysisEvents([{
      sessionId: session.id,
      timeframeOptionId: timeframe.id,
      analysisText: 'Test analysis',
    }]);
    const trade = await tradeService.createTrade({
      journalSessionId: session.id,
      analysisEventId: analysis.id,
      symbol: 'EURUSD',
    });
    const trigger = await journalSessionService.createTriggerEvent({
      sessionId: session.id,
      analysisEventId: analysis.id,
      tradeId: trade.id,
    });
    await journalSessionService.saveMedia({
      sessionId: session.id,
      analysisId: analysis.id,
      category: 'analysis',
      file: new File(['analysis image'], 'analysis.png', { type: 'image/png' }),
    });

    await journalSessionService.deleteAnalysisEvent(analysis.id);

    expect(await db.journalSessionAnalyses.get(analysis.id)).toBeUndefined();
    expect(await db.journalMedia.where('analysisId').equals(analysis.id).count()).toBe(0);
    expect(await db.journalTriggers.get(trigger.id)).toMatchObject({ analysisEventId: null });
    expect(await db.trades.get(trade.id)).toMatchObject({ analysisEventId: null });
    expect(await db.trades.get(trade.id)).toBeTruthy();
  });

  it('round-trips session media through replace restore and removes trade media with its trade', async () => {
    const { session } = await seedSession();
    const trade = await tradeService.createTrade({ journalSessionId: session.id, symbol: 'EURUSD' });
    const image = await journalSessionService.saveMedia({
      sessionId: session.id,
      tradeId: trade.id,
      category: 'entry',
      file: new File(['chart pixels'], 'entry.png', { type: 'image/png' }),
      caption: 'Entry',
    });
    const meta = {
      id: trade.id,
      tradeId: trade.id,
      journalSessionId: session.id,
      entryTriggerOptionIds: '[]',
      entryReasonOptionId: null,
      exitReasonOptionId: null,
      setupTypeOptionId: null,
      setupGradeOptionId: null,
      checklistResults: '{}',
      psychology: '{}',
      mistakeOptionIds: '[]',
      strategyCompliance: null,
      violatedRuleIds: '[]',
      setupQuality: null,
      executionQuality: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.journalTradeData.add(meta);
    const encoded = 'data:image/png;base64,Y2hhcnQgcGl4ZWxz';

    const originalBlob = globalThis.Blob;
    Object.defineProperty(globalThis, 'Blob', { configurable: true, value: NodeBlob });
    try {
      await backupService.importReplace({
        strategies: await db.strategies.toArray(),
        phases: await db.phases.toArray(),
        steps: await db.steps.toArray(),
        rules: await db.rules.toArray(),
        analysisSessions: [],
        trades: [trade],
        dailyJournals: [],
        settings: {},
        accounts: await db.accounts.toArray(),
        tradingBoxes: await db.tradingBoxes.toArray(),
        journalSessions: [session],
        journalOptions: await db.journalOptions.toArray(),
        strategyVersions: await db.strategyVersions.toArray(),
        journalTradeData: [meta],
        journalMedia: [{ ...image, blob: null, dataUrl: encoded }],
      });
    } finally {
      Object.defineProperty(globalThis, 'Blob', { configurable: true, value: originalBlob });
    }
    const restored = await db.journalMedia.get(image.id);
    expect(restored?.blob).toBeInstanceOf(NodeBlob);
    expect(restored?.blob.type).toBe('image/png');
    expect(await db.journalSessions.get(session.id)).toBeTruthy();
    expect(await db.strategyVersions.get(session.strategyVersionId)).toBeTruthy();
    expect(await db.journalTradeData.get(trade.id)).toMatchObject({ tradeId: trade.id });

    await tradeService.deleteTrade(trade.id);
    expect(await db.journalTradeData.where('tradeId').equals(trade.id).count()).toBe(0);
    expect(await db.journalMedia.where('tradeId').equals(trade.id).count()).toBe(0);
  });
});
