/**
 * fa.ts — Prompt 4 (Part 9)
 * ترجمه‌های فارسی مرکزی — هیچ متن فارسی hardcoded در business logic نباشد
 */

// ─── نتایج معامله ─────────────────────────────────────────────────────────────
export const tradeResultLabels: Record<string, string> = {
  win: 'برد',
  loss: 'باخت',
  breakeven: 'سربه‌سر',
  'partial-win': 'برد جزئی',
  'partial-loss': 'باخت جزئی',
  open: 'باز',
  cancelled: 'لغو شده',
};

// ─── جهت معامله ──────────────────────────────────────────────────────────────
export const directionLabels: Record<string, string> = {
  long: 'خرید (Long)',
  short: 'فروش (Short)',
};

// ─── وضعیت معامله ────────────────────────────────────────────────────────────
export const tradeStatusLabels: Record<string, string> = {
  open: 'باز',
  closed: 'بسته',
  cancelled: 'لغو',
};

// ─── پایبندی به پلن ──────────────────────────────────────────────────────────
export const adherenceLabels: Record<string, string> = {
  fully: 'کاملاً پیروی کردم',
  mostly: 'بیشتر پیروی کردم',
  partially: 'جزئی پیروی کردم',
  not: 'پیروی نکردم',
  unknown: 'ثبت نشده',
};

// ─── جلسات معاملاتی ──────────────────────────────────────────────────────────
export const tradingSessionLabels: Record<string, string> = {
  london: 'لندن',
  'new-york': 'نیویورک',
  asia: 'آسیا',
  overlap: 'همپوشانی',
  other: 'سایر',
};

// ─── روزهای هفته ─────────────────────────────────────────────────────────────
export const dayOfWeekLabels: Record<number, string> = {
  0: 'یکشنبه',
  1: 'دوشنبه',
  2: 'سه‌شنبه',
  3: 'چهارشنبه',
  4: 'پنجشنبه',
  5: 'جمعه',
  6: 'شنبه',
};

// ─── ماه‌های شمسی ─────────────────────────────────────────────────────────────
export const persianMonthLabels: Record<number, string> = {
  1: 'فروردین',
  2: 'اردیبهشت',
  3: 'خرداد',
  4: 'تیر',
  5: 'مرداد',
  6: 'شهریور',
  7: 'مهر',
  8: 'آبان',
  9: 'آذر',
  10: 'دی',
  11: 'بهمن',
  12: 'اسفند',
};

// ─── احساسات معامله‌گر ────────────────────────────────────────────────────────
export const emotionLabels: Record<string, string> = {
  confident: 'اعتماد به نفس',
  fearful: 'ترس',
  greedy: 'طمع',
  calm: 'آرامش',
  anxious: 'اضطراب',
  excited: 'هیجان',
  frustrated: 'ناامیدی',
  focused: 'تمرکز',
  impulsive: 'هیجانی‌عمل‌کردن',
  patient: 'صبر',
  revenge: 'انتقام از بازار',
  fomo: 'ترس از دست دادن (FOMO)',
  overconfident: 'اعتماد بیش از حد',
  neutral: 'خنثی',
};

// ─── نوع ست‌آپ ───────────────────────────────────────────────────────────────
export const setupTypeLabels: Record<string, string> = {
  'break-and-retest': 'Break and Retest',
  fvg: 'Fair Value Gap (FVG)',
  'liquidity-grab': 'گرفتن نقدینگی',
  'order-block': 'Order Block',
  'supply-demand': 'عرضه و تقاضا',
  'trend-continuation': 'ادامه روند',
  'reversal': 'بازگشت',
  other: 'سایر',
};

// ─── خطاهای سرویس ────────────────────────────────────────────────────────────
export const serviceErrorMessages: Record<string, string> = {
  DATABASE_ERROR: 'خطا در پایگاه داده. لطفاً برنامه را مجدداً باز کنید.',
  QUOTA_EXCEEDED: 'فضای ذخیره‌سازی دستگاه پر است. برخی داده‌های قدیمی را حذف کنید.',
  INVALID_BACKUP: 'فایل پشتیبان نامعتبر است. لطفاً فایل را بررسی کنید.',
  IMPORT_FAILED: 'وارد کردن داده‌ها ناموفق بود. لطفاً دوباره تلاش کنید.',
  EXPORT_FAILED: 'خروجی گرفتن از داده‌ها ناموفق بود.',
  MIGRATION_FAILED: 'به‌روزرسانی پایگاه داده ناموفق بود.',
  CALCULATION_ERROR: 'خطا در محاسبه آمار. لطفاً برنامه را رفرش کنید.',
  UNKNOWN_ERROR: 'خطای ناشناخته. لطفاً مجدداً تلاش کنید.',
};

// ─── برچسب‌های فیلدهای معامله ────────────────────────────────────────────────
export const tradeFieldLabels: Record<string, string> = {
  symbol: 'نماد',
  direction: 'جهت معامله',
  entryPrice: 'قیمت ورود',
  exitPrice: 'قیمت خروج',
  stopLoss: 'حد ضرر',
  takeProfit: 'حد سود',
  positionSize: 'حجم موقعیت',
  riskPercentage: 'درصد ریسک',
  riskAmount: 'مقدار ریسک',
  rMultiple: 'ضریب R',
  result: 'نتیجه',
  profitLoss: 'سود/زیان',
  fees: 'کارمزد',
  openedAt: 'تاریخ ورود',
  closedAt: 'تاریخ خروج',
  entryReason: 'دلیل ورود',
  reasonForExit: 'دلیل خروج',
  notes: 'یادداشت',
  lesson: 'درس آموخته',
  screenshots: 'تصاویر',
  postTradeReview: 'مرور پس از معامله',
  mtfAnalysis: 'تحلیل چند تایم‌فریم',
  strategyId: 'استراتژی',
  tradingSession: 'جلسه معاملاتی',
  setupType: 'نوع ست‌آپ',
  adherenceRating: 'پایبندی به پلن',
};

// ─── وضعیت کیفیت داده ────────────────────────────────────────────────────────
export const dataQualityLabels: Record<string, string> = {
  complete: 'کامل',
  good: 'خوب',
  average: 'متوسط',
  basic: 'پایه',
  incomplete: 'ناقص',
};

// ─── اهمیت فیلد ──────────────────────────────────────────────────────────────
export const fieldImportanceLabels: Record<string, string> = {
  high: 'ضروری',
  medium: 'مهم',
  low: 'اختیاری',
};
