/**
 * تست‌های errorService.ts — Prompt 4 (Part 10)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errorService } from '../errorService';

beforeEach(() => {
  errorService.clearHistory();
});

describe('errorService.logError', () => {
  it('باید خطا را در تاریخچه ذخیره کند', () => {
    errorService.logError('TestService', new Error('خطای تستی'));
    const history = errorService.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].serviceName).toBe('TestService');
    expect(history[0].message).toBe('خطای تستی');
    expect(history[0].severity).toBe('error');
  });

  it('باید string error را مدیریت کند', () => {
    errorService.logError('TestService', 'خطا رشته‌ای');
    const history = errorService.getHistory();
    expect(history[0].errorType).toBe('StringError');
  });

  it('باید timestamp داشته باشد', () => {
    const before = Date.now();
    errorService.logError('TestService', 'test');
    const after = Date.now();
    const err = errorService.getHistory()[0];
    expect(err.timestamp).toBeGreaterThanOrEqual(before);
    expect(err.timestamp).toBeLessThanOrEqual(after);
  });

  it('باید userAction را ذخیره کند', () => {
    errorService.logError('TestService', 'test', { userAction: 'ذخیره معامله' });
    expect(errorService.getHistory()[0].userAction).toBe('ذخیره معامله');
  });

  it('باید context را ذخیره کند', () => {
    errorService.logError('TestService', 'test', { context: { tradeId: 'abc' } });
    expect(errorService.getHistory()[0].context).toEqual({ tradeId: 'abc' });
  });
});

describe('errorService.logWarning', () => {
  it('باید severity=warning داشته باشد', () => {
    errorService.logWarning('TestService', 'هشدار تستی');
    expect(errorService.getHistory()[0].severity).toBe('warning');
  });
});

describe('errorService.addListener', () => {
  it('باید listener را در صورت خطا صدا بزند', () => {
    const listener = vi.fn();
    const unsubscribe = errorService.addListener(listener);
    errorService.logError('TestService', 'test');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('باید بعد از unsubscribe listener را صدا نزند', () => {
    const listener = vi.fn();
    const unsubscribe = errorService.addListener(listener);
    unsubscribe();
    errorService.logError('TestService', 'test');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('errorService.withErrorLogging', () => {
  it('باید نتیجه موفق را برگرداند', async () => {
    const result = await errorService.withErrorLogging(
      'TestService',
      'تست',
      async () => 42,
    );
    expect(result).toBe(42);
    expect(errorService.getHistory().length).toBe(0);
  });

  it('باید خطا را catch کرده و null برگرداند', async () => {
    const result = await errorService.withErrorLogging(
      'TestService',
      'تست',
      async () => { throw new Error('خطا'); },
    );
    expect(result).toBeNull();
    expect(errorService.getHistory().length).toBe(1);
  });
});

describe('errorService.clearHistory', () => {
  it('باید تاریخچه را پاک کند', () => {
    errorService.logError('S1', 'e1');
    errorService.logError('S2', 'e2');
    errorService.clearHistory();
    expect(errorService.getHistory().length).toBe(0);
  });
});
