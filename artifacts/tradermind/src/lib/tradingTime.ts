/**
 * مبنای زمانی معاملات
 *
 * timestampهای معاملات همیشه به‌صورت یک لحظهٔ UTC در دیتابیس نگه‌داری می‌شوند.
 * این فایل فقط ساعت محلیِ مورد استفاده برای نمایش و دسته‌بندی گزارش‌ها را تعیین می‌کند.
 */

export type TradingTimeMode = 'device' | 'broker';

export interface TradingTimeConfig {
  mode: TradingTimeMode;
  brokerUtcOffsetMinutes: number;
}

export const TRADING_TIME_STORAGE_KEY = 'tradermind-app-storage';
export const DEFAULT_TRADING_TIME_CONFIG: TradingTimeConfig = {
  mode: 'device',
  brokerUtcOffsetMinutes: 0,
};

function clampOffset(value: number): number {
  return Math.max(-720, Math.min(840, Math.round(value / 15) * 15));
}

export function getTradingTimeConfig(): TradingTimeConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_TRADING_TIME_CONFIG;
  try {
    const raw = JSON.parse(localStorage.getItem(TRADING_TIME_STORAGE_KEY) ?? '{}');
    const state = raw?.state ?? raw;
    return {
      mode: state?.tradingTimeMode === 'broker' ? 'broker' : 'device',
      brokerUtcOffsetMinutes: Number.isFinite(Number(state?.brokerUtcOffsetMinutes))
        ? clampOffset(Number(state.brokerUtcOffsetMinutes))
        : DEFAULT_TRADING_TIME_CONFIG.brokerUtcOffsetMinutes,
    };
  } catch {
    return DEFAULT_TRADING_TIME_CONFIG;
  }
}

function partsFromTimestamp(ts: number, config: TradingTimeConfig) {
  const date = config.mode === 'broker'
    ? new Date(ts + config.brokerUtcOffsetMinutes * 60_000)
    : new Date(ts);
  const broker = config.mode === 'broker';
  return {
    year: broker ? date.getUTCFullYear() : date.getFullYear(),
    month: broker ? date.getUTCMonth() : date.getMonth(),
    day: broker ? date.getUTCDate() : date.getDate(),
    hour: broker ? date.getUTCHours() : date.getHours(),
    minute: broker ? date.getUTCMinutes() : date.getMinutes(),
    second: broker ? date.getUTCSeconds() : date.getSeconds(),
    dayOfWeek: broker ? date.getUTCDay() : date.getDay(),
  };
}

export function getTradingDateParts(
  ts: number,
  config: TradingTimeConfig = getTradingTimeConfig(),
) {
  return partsFromTimestamp(ts, config);
}

export function getTradingDateKey(
  ts: number,
  config: TradingTimeConfig = getTradingTimeConfig(),
): string {
  const p = partsFromTimestamp(ts, config);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function getTradingMonthKey(
  ts: number,
  config: TradingTimeConfig = getTradingTimeConfig(),
): string {
  const p = partsFromTimestamp(ts, config);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
}

export function getTradingDayStart(
  ts = Date.now(),
  config: TradingTimeConfig = getTradingTimeConfig(),
): number {
  const p = partsFromTimestamp(ts, config);
  if (config.mode === 'broker') {
    return Date.UTC(p.year, p.month, p.day) - config.brokerUtcOffsetMinutes * 60_000;
  }
  return new Date(p.year, p.month, p.day).getTime();
}

export function getTradingMonthStart(
  ts = Date.now(),
  config: TradingTimeConfig = getTradingTimeConfig(),
): number {
  const p = partsFromTimestamp(ts, config);
  if (config.mode === 'broker') {
    return Date.UTC(p.year, p.month, 1) - config.brokerUtcOffsetMinutes * 60_000;
  }
  return new Date(p.year, p.month, 1).getTime();
}

export function getTradingTimestampForParts(
  year: number,
  month: number,
  day: number,
  config: TradingTimeConfig = getTradingTimeConfig(),
): number {
  if (config.mode === 'broker') {
    return Date.UTC(year, month, day) - config.brokerUtcOffsetMinutes * 60_000;
  }
  return new Date(year, month, day).getTime();
}

export function getTradingDateRange(
  dateString: string,
  config: TradingTimeConfig = getTradingTimeConfig(),
): { from: number; to: number } {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { from: Number.NaN, to: Number.NaN };
  const [, year, month, day] = match.map(Number);
  const from = getTradingTimestampForParts(year, month - 1, day, config);
  const to = config.mode === 'broker'
    ? from + 86_400_000 - 1
    : new Date(year, month - 1, day + 1).getTime() - 1;
  return { from, to };
}

export function getTradingDateTimeInput(
  ts: number | null,
  config: TradingTimeConfig = getTradingTimeConfig(),
): string {
  if (!ts) return '';
  const p = partsFromTimestamp(ts, config);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function parseTradingDateTimeInput(
  value: string,
  config: TradingTimeConfig = getTradingTimeConfig(),
): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (config.mode === 'broker') {
    return Date.UTC(year, month - 1, day, hour, minute) - config.brokerUtcOffsetMinutes * 60_000;
  }
  return new Date(year, month - 1, day, hour, minute).getTime();
}

export function formatTradingOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, '0')}`;
}