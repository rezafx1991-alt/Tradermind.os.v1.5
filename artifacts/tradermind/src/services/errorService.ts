/**
 * errorService.ts — Prompt 4 (Part 5)
 * Central Error Logging — ثبت متمرکز خطاها
 *
 * وظیفه:
 * - ثبت service name، error type، timestamp و user action
 * - نگهداری حافظه موقت برای debug
 * - hook برای نمایش toast در UI (اختیاری)
 */

// ─── انواع ───────────────────────────────────────────────────────────────────

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AppError {
  id: string;
  serviceName: string;
  errorType: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  userAction?: string;
  context?: Record<string, unknown>;
  stack?: string;
}

// ─── ذخیره موقت خطاها ────────────────────────────────────────────────────────

const MAX_ERROR_HISTORY = 50;
const errorHistory: AppError[] = [];

type ErrorListener = (error: AppError) => void;
const listeners: Set<ErrorListener> = new Set();

// ─── API عمومی ───────────────────────────────────────────────────────────────

function generateId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * ثبت یک خطا در سیستم مرکزی
 */
function logError(
  serviceName: string,
  error: unknown,
  options: {
    severity?: ErrorSeverity;
    userAction?: string;
    context?: Record<string, unknown>;
  } = {},
): AppError {
  const { severity = 'error', userAction, context } = options;

  let message = 'خطای ناشناخته';
  let errorType = 'UnknownError';
  let stack: string | undefined;

  if (error instanceof Error) {
    message = error.message;
    errorType = error.constructor.name || 'Error';
    stack = error.stack;
  } else if (typeof error === 'string') {
    message = error;
    errorType = 'StringError';
  } else if (error !== null && typeof error === 'object') {
    errorType = 'ObjectError';
    message = JSON.stringify(error);
  }

  const appError: AppError = {
    id: generateId(),
    serviceName,
    errorType,
    message,
    severity,
    timestamp: Date.now(),
    userAction,
    context,
    stack,
  };

  // ذخیره در حافظه موقت
  errorHistory.unshift(appError);
  if (errorHistory.length > MAX_ERROR_HISTORY) {
    errorHistory.length = MAX_ERROR_HISTORY;
  }

  // console در dev
  if (process.env.NODE_ENV !== 'production') {
    const label = `[${serviceName}]`;
    if (severity === 'critical' || severity === 'error') {
      console.error(label, message, error);
    } else if (severity === 'warning') {
      console.warn(label, message, error);
    } else {
      console.info(label, message);
    }
  }

  // اطلاع‌رسانی به listener ها
  listeners.forEach(listener => {
    try { listener(appError); } catch { /* listener نباید crash کند */ }
  });

  return appError;
}

/**
 * ثبت هشدار (warning)
 */
function logWarning(
  serviceName: string,
  message: string,
  context?: Record<string, unknown>,
): AppError {
  return logError(serviceName, message, { severity: 'warning', context });
}

/**
 * دریافت تاریخچه خطاها
 */
function getHistory(): ReadonlyArray<AppError> {
  return errorHistory;
}

/**
 * پاک کردن تاریخچه
 */
function clearHistory(): void {
  errorHistory.length = 0;
}

/**
 * اضافه کردن listener برای خطاها (برای نمایش toast در UI)
 */
function addListener(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * wrapper برای async functions — خطاها رو catch و log می‌کند
 */
async function withErrorLogging<T>(
  serviceName: string,
  userAction: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    logError(serviceName, error, { userAction });
    return null;
  }
}

// ─── export ───────────────────────────────────────────────────────────────────

export const errorService = {
  logError,
  logWarning,
  getHistory,
  clearHistory,
  addListener,
  withErrorLogging,
};
