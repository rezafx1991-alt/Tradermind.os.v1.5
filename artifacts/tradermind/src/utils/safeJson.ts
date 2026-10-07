/**
 * safeJson.ts — Prompt 4 (Part 4)
 * ابزارهای امن برای parse و stringify کردن JSON
 * هیچ JSON خرابی باعث Crash برنامه نمی‌شود.
 */

// ─── نتیجه parse ─────────────────────────────────────────────────────────────

export type JsonParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── safeParseJSON ────────────────────────────────────────────────────────────

/**
 * JSON.parse امن با Type Guard اختیاری.
 * در صورت خطا { ok: false } برمی‌گرداند — هرگز throw نمی‌کند.
 *
 * @example
 * const result = safeParseJSON<string[]>(trade.tags, Array.isArray);
 * if (result.ok) { ... use result.data ... }
 */
export function safeParseJSON<T>(
  raw: string | null | undefined,
  guard?: (val: unknown) => val is T,
): JsonParseResult<T> {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { ok: false, error: 'مقدار خالی یا undefined است' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `خطای JSON.parse: ${msg}` };
  }

  if (guard && !guard(parsed)) {
    return { ok: false, error: 'نوع داده با guard مطابقت ندارد' };
  }

  return { ok: true, data: parsed as T };
}

/**
 * safeParseJSON با مقدار پیش‌فرض — در صورت خطا fallback برمی‌گرداند.
 *
 * @example
 * const tags = safeParseJSONWithDefault<string[]>(trade.tags, []);
 */
export function safeParseJSONWithDefault<T>(
  raw: string | null | undefined,
  defaultValue: T,
  guard?: (val: unknown) => val is T,
): T {
  const result = safeParseJSON<T>(raw, guard);
  return result.ok ? result.data : defaultValue;
}

// ─── safeStringify ────────────────────────────────────────────────────────────

/**
 * JSON.stringify امن — هرگز throw نمی‌کند.
 * در صورت خطا (مثلاً circular reference) رشته '{}' برمی‌گرداند.
 */
export function safeStringify(
  value: unknown,
  pretty = false,
): string {
  try {
    return pretty
      ? JSON.stringify(value, null, 2)
      : JSON.stringify(value);
  } catch {
    return '{}';
  }
}

// ─── Type Guards پایه ────────────────────────────────────────────────────────

export function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every(item => typeof item === 'string');
}

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isObjectArray(val: unknown): val is Record<string, unknown>[] {
  return Array.isArray(val) && val.every(item => isRecord(item));
}
