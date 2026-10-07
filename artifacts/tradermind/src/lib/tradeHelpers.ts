/**
 * tradeHelpers.ts
 * توابع کمکی مشترک برای تحلیل معاملات
 *
 * این فایل مرکز توابع pure است که قبلاً در چندین سرویس و صفحه تکرار می‌شدند.
 * تمام سرویس‌ها و صفحات باید از اینجا import کنند.
 *
 * قوانین:
 * - هیچ import از db یا سرویس دیگری نداشته باشد (فقط از database.ts برای types)
 * - فقط توابع pure (بدون side-effect)
 * - قابل استفاده در هر context (service, page, hook)
 */

import type { Trade, PostTradeReviewData, BehaviorFlag } from '../db/database';
import { getTradingDateKey, getTradingMonthKey } from './tradingTime';

// ── وضعیت معامله ──────────────────────────────────────────────────────────────

export const isClosed   = (t: Trade): boolean => t.status === 'closed';
export const isOpen     = (t: Trade): boolean => t.status === 'open';

/** عدد معتبر (متناهی) بودن مقدار */
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * سود/زیان خالص پس از کسر کمیسیون، اسپرد و سایر هزینه‌ها.
 *
 * قرارداد محاسباتی:
 * - `profitLoss` همیشه سود/زیان ناخالص (Gross) است.
 * - `fees`، `commission` و `spread` هزینه هستند و همیشه کسر می‌شوند
 *   (علامت واردشده توسط کاربر مهم نیست: -2 و 2 هر دو یعنی ۲ واحد هزینه).
 * - `swap` علامت‌دار است (منفی = هزینه، مثبت = درآمد) و همان‌طور که هست اضافه می‌شود.
 */
export const getNetPnl = (t: Trade): number | null => {
  if (!isFiniteNumber(t.profitLoss)) return null;
  const cost = (v: number | null | undefined) => (isFiniteNumber(v) ? Math.abs(v) : 0);
  const swap = isFiniteNumber(t.swap) ? t.swap : 0;
  return t.profitLoss - cost(t.fees) - cost(t.commission) - cost(t.spread) + swap;
};

/**
 * نتیجهٔ مالی معامله: وقتی سود/زیان ثبت شده باشد، علامت سود خالص ملاک است
 * (تا برچسب قدیمی/دستی با نتیجهٔ واقعی تناقض پیدا نکند). در غیر این صورت
 * به برچسب `result` برمی‌گردد.
 */
export const getOutcome = (t: Trade): 'win' | 'loss' | 'breakeven' | null => {
  const net = getNetPnl(t);
  if (net !== null) return net > 0 ? 'win' : net < 0 ? 'loss' : 'breakeven';
  if (t.result === 'win' || t.result === 'partial-win') return 'win';
  if (t.result === 'loss' || t.result === 'partial-loss') return 'loss';
  if (t.result === 'breakeven') return 'breakeven';
  return null;
};

export const isWin       = (t: Trade): boolean => getOutcome(t) === 'win';
export const isLoss      = (t: Trade): boolean => getOutcome(t) === 'loss';
export const isBreakEven = (t: Trade): boolean => getOutcome(t) === 'breakeven';

/** زمان مبنای ترتیب زمانی معامله (بستن؛ در نبود آن باز شدن) */
export const getCloseTime = (t: Trade): number => t.closedAt ?? t.openedAt;

/**
 * مقدار R معامله: اگر R ذخیره شده معتبر باشد همان؛ وگرنه
 * (در صورت وجود ریسک مالی مثبت) سود خالص ÷ ریسک.
 */
export function getResolvedR(t: Trade): number | null {
  if (isFiniteNumber(t.rMultiple)) return t.rMultiple;
  const net = getNetPnl(t);
  if (net !== null && isFiniteNumber(t.riskAmount) && t.riskAmount > 0) return net / t.riskAmount;
  return null;
}

// ── تاریخ ─────────────────────────────────────────────────────────────────────

/** تبدیل timestamp به رشته YYYY-MM-DD */
export function toDateStr(ts: number): string {
  return getTradingDateKey(ts);
}

/** تبدیل timestamp به رشته YYYY-MM */
export function toMonthStr(ts: number): string {
  return getTradingMonthKey(ts);
}

// ── ریاضیات ───────────────────────────────────────────────────────────────────

/** میانگین آرایه اعداد — null اگر خالی باشد */
export function avg(arr: number[]): number | null {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

/** انحراف معیار نمونه (n-1) — null اگر کمتر از ۲ عنصر باشد */
export function stdDev(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = avg(arr)!;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/** میانه آرایه اعداد — null اگر خالی باشد */
export function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/** ضریب تغییرات (پراکندگی نسبی) — null اگر میانگین صفر یا داده کم باشد */
export function coefficientOfVariation(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = avg(arr)!;
  if (!m) return null;
  return (stdDev(arr)! / Math.abs(m));
}

/** جمع آرایه */
export function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}

/** کلمپ عدد بین min و max */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Post Trade Review ─────────────────────────────────────────────────────────

/** پارس ایمن PostTradeReviewData از رشته JSON */
export function getPTR(t: Trade): PostTradeReviewData | null {
  if (!t.postTradeReview) return null;
  try {
    const parsed = JSON.parse(t.postTradeReview);
    return parsed && typeof parsed === 'object' ? parsed as PostTradeReviewData : null;
  } catch {
    return null;
  }
}

/** بررسی وجود یک BehaviorFlag در معامله */
export function hasFlag(t: Trade, flag: BehaviorFlag): boolean {
  try {
    return getPTR(t)?.behaviorFlags?.includes(flag) ?? false;
  } catch {
    return false;
  }
}

/** شمارش تعداد BehaviorFlag در مجموعه‌ای از معاملات */
export function flagCount(trades: Trade[], flag: BehaviorFlag): number {
  return trades.filter(t => hasFlag(t, flag)).length;
}

// ── احساسات ───────────────────────────────────────────────────────────────────

const NEGATIVE_EMOTIONS = new Set([
  'FOMO', 'Fearful', 'Anxious', 'Frustrated', 'Angry', 'Revenge Trading', 'Overconfident',
  'Impatient', 'Greedy', 'Stressed', 'Confused',
]);

const POSITIVE_EMOTIONS = new Set([
  'Calm', 'Confident', 'Focused', 'Neutral', 'Patient', 'Disciplined',
]);

/** آیا احساسات اولیه معامله منفی بوده‌اند */
export function hasNegativeEmotion(t: Trade): boolean {
  try {
    const emotions = JSON.parse(t.emotions) as string[];
    return emotions.some(e => NEGATIVE_EMOTIONS.has(e));
  } catch {
    return false;
  }
}

/** لیست احساسات parse‌شده یک معامله */
export function getEmotions(t: Trade): string[] {
  try {
    return JSON.parse(t.emotions) as string[];
  } catch {
    return [];
  }
}

// ── معیارهای ادهرنس ──────────────────────────────────────────────────────────

/** تبدیل adherenceRating به عدد ۰–۱۰۰ */
export function adherenceToScore(rating: string | null | undefined): number | null {
  switch (rating) {
    case 'fully':     return 100;
    case 'mostly':    return 75;
    case 'partially': return 40;
    case 'not':       return 0;
    default:          return null;
  }
}

// ── گروه‌بندی ─────────────────────────────────────────────────────────────────

/** گروه‌بندی معاملات بر اساس تاریخ (YYYY-MM-DD) */
export function groupByDate(trades: Trade[]): Map<string, Trade[]> {
  const map = new Map<string, Trade[]>();
  trades.forEach(t => {
    const d = toDateStr(t.openedAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(t);
  });
  return map;
}

/** گروه‌بندی معاملات بر اساس ماه (YYYY-MM) */
export function groupByMonth(trades: Trade[]): Map<string, Trade[]> {
  const map = new Map<string, Trade[]>();
  trades.forEach(t => {
    const m = toMonthStr(t.openedAt);
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(t);
  });
  return map;
}

// ── امتیاز عملکرد ─────────────────────────────────────────────────────────────

/** تبدیل امتیاز عددی (۰–۱۰۰) به حرف رتبه */
export function scoreToGrade(score: number): string {
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
}

/** رنگ CSS برای امتیاز */
export function scoreColor(score: number): string {
  return score >= 75 ? '#22c55e' : score >= 55 ? '#eab308' : score >= 35 ? '#f97316' : '#ef4444';
}

/** درصد با فرمت فارسی */
export function faPct(n: number | null, decimals = 0): string {
  return n !== null ? `${n.toFixed(decimals)}٪` : '—';
}

/** عدد R با نشانه فارسی */
export function faR(n: number | null, decimals = 2): string {
  return n !== null ? `${n.toFixed(decimals)}R` : '—';
}
