/**
 * تست‌های Backup Validation — Prompt 4 (Part 10)
 * توجه: validateFile برای فایل‌های .json از مسیر Legacy می‌رود (فرمت قدیمی)
 * برای تست فرمت جدید باید از .zip یا .gz استفاده شود
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { backupService } from '../backupService';

// ─── ساخت فایل ZIP معتبر (فرمت جدید) ────────────────────────────────────────

async function makeValidBackupZip(): Promise<File> {
  const payload = {
    metadata: {
      appName: 'TraderMind',
      backupVersion: '3.0',
      appVersion: '1.2.0',
      databaseVersion: 21,
      schemaVersion: 21,
      createdAt: new Date().toISOString(),
      totalRecords: 1,
    },
    data: {
      strategies: [],
      phases: [],
      steps: [],
      rules: [],
      analysisSessions: [],
      trades: [
        {
          id: 't1',
          symbol: 'EURUSD',
          direction: 'long',
          entryPrice: 1.08,
          stopLoss: 1.075,
          result: 'win',
          status: 'closed',
          openedAt: Date.now() - 3600000,
          closedAt: Date.now(),
          emotions: '[]',
          screenshots: '[]',
          review: '{}',
          postTradeReview: '{}',
          tags: '[]',
          createdAt: Date.now(),
        },
      ],
      dailyJournals: [],
      settings: {},
    },
  };
  const json = JSON.stringify(payload);
  const zip = new JSZip();
  zip.file('backup.json', json);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'TraderMind_Backup.zip', { type: 'application/zip' });
}

// ─── ساخت فایل JSON فرمت قدیمی (Legacy) ─────────────────────────────────────

function makeValidLegacyJson(): File {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    strategies: [],
    phases: [],
    steps: [],
    rules: [],
    analysisSessions: [],
    trades: [],
    dailyJournals: [],
  };
  return new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
}

// ─── تست‌ها ──────────────────────────────────────────────────────────────────

describe('backupService.validateFile — فرمت ZIP (جدید)', () => {
  it('باید یک فایل پشتیبان ZIP معتبر را تأیید کند', async () => {
    const file = await makeValidBackupZip();
    const result = await backupService.validateFile(file);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('باید تعداد رکوردها را درست شناسایی کند', async () => {
    const file = await makeValidBackupZip();
    const result = await backupService.validateFile(file);
    expect(result.metadata?.totalRecords).toBe(1);
  });
});

describe('backupService.validateFile — فرمت JSON (Legacy)', () => {
  it('باید فایل JSON فرمت قدیمی را با warning قبول کند', async () => {
    const file = makeValidLegacyJson();
    const result = await backupService.validateFile(file);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('backupService.validateFile — فایل‌های نامعتبر', () => {
  it('باید فایل ZIP خراب را رد کند', async () => {
    const brokenFile = new File(['{not a zip}'], 'bad.zip', { type: 'application/zip' });
    const result = await backupService.validateFile(brokenFile);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('باید فایل JSON خراب را رد کند', async () => {
    const brokenFile = new File(['{bad json}'], 'backup.json', { type: 'application/json' });
    const result = await backupService.validateFile(brokenFile);
    expect(result.valid).toBe(false);
  });

  it('باید فایل ZIP بدون metadata را رد کند', async () => {
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify({ data: {} }));
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'no-meta.zip', { type: 'application/zip' });
    const result = await backupService.validateFile(file);
    expect(result.valid).toBe(false);
  });

  it('باید فایل با appName اشتباه را رد کند', async () => {
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify({
      metadata: { appName: 'OtherApp', backupVersion: '1.0', databaseVersion: 1, createdAt: '', totalRecords: 0, schemaVersion: 1, appVersion: '1.0' },
      data: {},
    }));
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'wrong-app.zip', { type: 'application/zip' });
    const result = await backupService.validateFile(file);
    expect(result.valid).toBe(false);
  });
});
