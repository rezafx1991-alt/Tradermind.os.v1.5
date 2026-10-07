/**
 * سیستم Logging متمرکز — TraderMind
 *
 * اصول:
 *  - هرگز اطلاعات حساس (رمز، PIN، کلید رمزگذاری) log نمی‌شود
 *  - در Production فقط خطاهای بحرانی نمایش داده می‌شوند
 *  - در Development همه سطوح فعال هستند
 */

const IS_DEV = import.meta.env.DEV;

// اطلاعاتی که نباید هرگز log شوند
const SENSITIVE_KEYS = ['password', 'pin', 'key', 'secret', 'token', 'hash', 'salt'];

function sanitize(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  if (Array.isArray(data)) return data.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk))) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = sanitize(v);
    }
  }
  return out;
}

export const logger = {
  debug(...args: unknown[]) {
    if (!IS_DEV) return;
    console.debug('[TM:debug]', ...args.map(sanitize));
  },
  info(...args: unknown[]) {
    if (!IS_DEV) return;
    console.info('[TM:info]', ...args.map(sanitize));
  },
  warn(...args: unknown[]) {
    console.warn('[TM:warn]', ...args.map(sanitize));
  },
  error(message: string, err?: unknown) {
    // خطاها همیشه log می‌شوند (بدون اطلاعات حساس)
    const sanitizedErr =
      err instanceof Error
        ? { message: err.message, name: err.name }
        : sanitize(err);
    console.error('[TM:error]', message, sanitizedErr ?? '');
  },
};
