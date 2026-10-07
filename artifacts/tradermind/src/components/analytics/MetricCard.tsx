/**
 * MetricCard.tsx — کارت معیار مشترک
 *
 * قبلاً هر صفحه نسخه خودش را داشت:
 *   PerformanceDashboard → MetricCard
 *   AdvancedAnalytics    → MetricCard
 *   TraderProfile        → MetricCard
 *   Reports              → StatCard
 *   Dashboard            → MiniStat
 *
 * این کامپوننت همه را جایگزین می‌کند.
 */
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  /** برچسب بالای کارت */
  label: string;
  /** مقدار اصلی (string یا number) */
  value: string | number | null;
  /** زیرنویس اختیاری */
  sub?: string;
  /** آیکون اختیاری */
  icon?: LucideIcon;
  /** رنگ متن مقدار اصلی (Tailwind class) */
  valueColor?: string;
  /** رنگ border/bg (variant) */
  variant?: 'default' | 'positive' | 'negative' | 'warning' | 'info';
  /** اندازه مقدار */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const variantStyles: Record<string, string> = {
  default:  'border-border bg-card',
  positive: 'border-emerald-500/20 bg-emerald-500/5',
  negative: 'border-red-500/20 bg-red-500/5',
  warning:  'border-orange-500/20 bg-orange-500/5',
  info:     'border-blue-500/20 bg-blue-500/5',
};

const sizeStyles: Record<string, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl',
};

export function MetricCard({
  label, value, sub, icon: Icon,
  valueColor = '',
  variant = 'default',
  size = 'md',
  className = '',
}: MetricCardProps) {
  return (
    <div className={cn(
      'rounded-lg border p-4 transition-colors',
      variantStyles[variant],
      className,
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={cn(
            'font-bold mt-1 leading-tight',
            sizeStyles[size],
            valueColor,
          )}>
            {value ?? '—'}
          </p>
          {sub && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
          )}
        </div>
        {Icon && (
          <div className="shrink-0 opacity-40">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
