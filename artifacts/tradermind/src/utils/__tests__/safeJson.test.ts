/**
 * تست‌های safeJson.ts — Prompt 4 (Part 10)
 */
import { describe, it, expect } from 'vitest';
import {
  safeParseJSON,
  safeParseJSONWithDefault,
  safeStringify,
  isStringArray,
  isRecord,
} from '../safeJson';

describe('safeParseJSON', () => {
  it('باید یک آرایه معتبر را parse کند', () => {
    const result = safeParseJSON<string[]>('["a","b","c"]');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(['a', 'b', 'c']);
  });

  it('باید یک JSON خراب را بدون throw برگرداند', () => {
    const result = safeParseJSON('{broken json}');
    expect(result.ok).toBe(false);
  });

  it('باید null را مدیریت کند', () => {
    const result = safeParseJSON(null);
    expect(result.ok).toBe(false);
  });

  it('باید undefined را مدیریت کند', () => {
    const result = safeParseJSON(undefined);
    expect(result.ok).toBe(false);
  });

  it('باید string خالی را مدیریت کند', () => {
    const result = safeParseJSON('');
    expect(result.ok).toBe(false);
  });

  it('با guard باید type را چک کند', () => {
    const result = safeParseJSON<string[]>('{"key":"value"}', Array.isArray);
    expect(result.ok).toBe(false);
  });

  it('با guard صحیح باید ok برگرداند', () => {
    const result = safeParseJSON<string[]>('["x","y"]', isStringArray);
    expect(result.ok).toBe(true);
  });
});

describe('safeParseJSONWithDefault', () => {
  it('باید مقدار parse شده را در صورت موفقیت برگرداند', () => {
    const data = safeParseJSONWithDefault<string[]>('["x"]', []);
    expect(data).toEqual(['x']);
  });

  it('باید fallback را در صورت خطا برگرداند', () => {
    const data = safeParseJSONWithDefault<string[]>('{bad}', []);
    expect(data).toEqual([]);
  });

  it('باید fallback را برای null برگرداند', () => {
    const data = safeParseJSONWithDefault<string[]>(null, ['default']);
    expect(data).toEqual(['default']);
  });
});

describe('safeStringify', () => {
  it('باید یک object معتبر را stringify کند', () => {
    const result = safeStringify({ key: 'value' });
    expect(result).toBe('{"key":"value"}');
  });

  it('باید برای circular reference خراب نشود', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj; // circular reference
    const result = safeStringify(obj);
    expect(result).toBe('{}');
  });

  it('باید pretty print کند', () => {
    const result = safeStringify({ a: 1 }, true);
    expect(result).toContain('\n');
  });
});

describe('Type Guards', () => {
  it('isStringArray: باید آرایه رشته را تشخیص دهد', () => {
    expect(isStringArray(['a', 'b'])).toBe(true);
    expect(isStringArray(['a', 1])).toBe(false);
    expect(isStringArray('not-array')).toBe(false);
  });

  it('isRecord: باید object را تشخیص دهد', () => {
    expect(isRecord({ key: 'val' })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('string')).toBe(false);
  });
});
