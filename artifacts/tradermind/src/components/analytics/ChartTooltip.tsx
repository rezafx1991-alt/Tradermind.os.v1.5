/**
 * ChartTooltip.tsx — Tooltip مشترک Recharts
 *
 * قبلاً:
 *   AdvancedAnalytics → BarTooltip
 *   Reports           → ChartTooltip
 *   EdgeAnalytics     → CustomTooltip
 */
import { cn } from '../../lib/utils';

interface TooltipRow {
  label: string;
  value: string | number;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number, name: string) => string;
  extra?: (payload: Record<string, unknown>) => TooltipRow[] | null;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  extra,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const displayLabel = label != null
    ? (labelFormatter ? labelFormatter(label) : String(label))
    : null;

  const extraRows = extra && payload[0]?.payload
    ? extra(payload[0].payload as Record<string, unknown>)
    : null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs min-w-[140px]">
      {displayLabel && (
        <p className="font-semibold mb-1.5 text-foreground">{displayLabel}</p>
      )}
      {payload.map((item, i) => {
        const raw = item.value ?? 0;
        const formatted = valueFormatter
          ? valueFormatter(raw, item.name ?? '')
          : String(raw);
        return (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {item.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: item.color }}
                />
              )}
              <span className="text-muted-foreground">{item.name ?? ''}</span>
            </div>
            <span className="font-medium text-foreground">{formatted}</span>
          </div>
        );
      })}
      {extraRows?.map((row, i) => (
        <div key={`extra-${i}`} className="flex items-center justify-between gap-3 mt-0.5">
          <span className="text-muted-foreground" style={row.color ? { color: row.color } : undefined}>
            {row.label}
          </span>
          <span className="font-medium">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** استایل ثابت contentStyle برای همه نمودارها — import و مستقیم استفاده کنید */
export const CHART_TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  padding: '6px 10px',
};
