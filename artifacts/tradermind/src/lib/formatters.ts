/**
 * formatters.ts — Single source of truth for all display formatting
 *
 * قبلاً هر صفحه تابع مشابه خودش را داشت:
 *   PerformanceDashboard: pct(), r(), moneyStr()
 *   AdvancedAnalytics:    fmtPct(), fmtR(), fmtMoney()
 *   Reports:              PnlText component
 *   EdgeAnalytics:        RBadge component
 *
 * از این فایل import کنید. هیچ inline formatting ننویسید.
 */

// ── درصد ─────────────────────────────────────────────────────────────────────

/** عدد ۰–۱ را به درصد فارسی تبدیل می‌کند: 0.675 → "67.5٪" */
export function pct(v: number | null | undefined, dec = 1): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(dec)}٪`;
}

/** عدد ۰–۱۰۰ را به درصد فارسی تبدیل می‌کند: 67.5 → "67.5٪" */
export function pct100(v: number | null | undefined, dec = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(dec)}٪`;
}

// ── R-Multiple ───────────────────────────────────────────────────────────────

/** R-Multiple با فرمت فارسی: 1.5 → "1.50R" */
export function fmtR(v: number | null | undefined, dec = 2): string {
  if (v == null) return '—';
  return `${v.toFixed(dec)}R`;
}

/** R با علامت + برای مثبت: 1.5 → "+1.50R" */
export function fmtRSigned(v: number | null | undefined, dec = 2): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(dec)}R`;
}

// ── پول و PnL ─────────────────────────────────────────────────────────────────

/** مقدار پول: 1234.5 → "$1,234.50" یا "-$1,234.50" */
export function fmtMoney(
  v: number | null | undefined,
  currency = '$',
  dec = 2,
): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString('en', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return `${v < 0 ? '-' : ''}${currency}${formatted}`;
}

/** PnL خلاصه: عدد بزرگ به K تبدیل می‌شود */
export function fmtMoneyShort(
  v: number | null | undefined,
  currency = '$',
): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${currency}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${currency}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

// ── اعداد عمومی ───────────────────────────────────────────────────────────────

/** عدد با جداکننده هزار: 12345 → "12,345" */
export function fmtNum(v: number | null | undefined, dec = 0): string {
  if (v == null) return '—';
  return v.toLocaleString('en', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// ── رنگ‌ها ────────────────────────────────────────────────────────────────────

/** رنگ CSS بر اساس win rate (۰–۱) */
export function winRateColor(rate: number | null | undefined): string {
  if (rate == null) return 'text-muted-foreground';
  if (rate >= 0.6) return 'text-emerald-400';
  if (rate >= 0.45) return 'text-yellow-400';
  return 'text-red-400';
}

/** رنگ CSS بر اساس R-Multiple */
export function rMultipleColor(r: number | null | undefined): string {
  if (r == null) return 'text-muted-foreground';
  if (r > 0) return 'text-emerald-400';
  if (r < 0) return 'text-red-400';
  return 'text-muted-foreground';
}

/** رنگ CSS بر اساس PnL */
export function pnlColor(v: number | null | undefined): string {
  if (v == null) return 'text-muted-foreground';
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-muted-foreground';
}

/** رنگ hex برای امتیاز (۰–۱۰۰) */
export function scoreHexColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 55) return '#eab308';
  if (score >= 35) return '#f97316';
  return '#ef4444';
}

/** تبدیل امتیاز به حرف رتبه */
export function scoreToGrade(score: number): string {
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
}

// ── تاریخ ─────────────────────────────────────────────────────────────────────

const PERSIAN_MONTHS = [
  '', 'ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن',
  'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر',
];

/** نمایش فارسی تاریخ از timestamp */
export function fmtDate(ts: number | null | undefined): string {
  if (ts == null) return '—';
  const d = new Date(ts);
  return `${d.getDate()} ${PERSIAN_MONTHS[d.getMonth() + 1]} ${d.getFullYear()}`;
}

/** نمایش ماه از رشته YYYY-MM */
export function fmtMonth(ym: string): string {
  const [, m] = ym.split('-');
  return PERSIAN_MONTHS[parseInt(m, 10)] ?? ym;
}
