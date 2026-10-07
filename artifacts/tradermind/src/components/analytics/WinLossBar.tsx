/**
 * WinLossBar.tsx — نوار برد/باخت مشترک
 *
 * قبلاً:
 *   PerformanceDashboard → WinLossBar
 *   AdvancedAnalytics    → WinLossBar
 *   Reports              → WinRateBar
 *   EdgeAnalytics        → WinBar
 */
import { cn } from '../../lib/utils';

interface WinLossBarProps {
  winRate: number | null;      // ۰–۱
  winCount?: number;
  lossCount?: number;
  totalCount?: number;
  showLabel?: boolean;
  height?: number;
  className?: string;
}

export function WinLossBar({
  winRate,
  winCount,
  lossCount,
  totalCount,
  showLabel = true,
  height = 8,
  className = '',
}: WinLossBarProps) {
  const pct = winRate != null ? Math.round(winRate * 100) : null;
  const lossPct = pct != null ? 100 - pct : null;

  return (
    <div className={cn('space-y-1', className)}>
      {showLabel && pct != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-emerald-400 font-medium">
            {winCount != null ? `${winCount} برد` : `${pct}٪`}
          </span>
          <span className="text-red-400 font-medium">
            {lossCount != null ? `${lossCount} باخت` : `${lossPct}٪`}
          </span>
        </div>
      )}
      <div
        className="w-full rounded-full overflow-hidden bg-muted flex"
        style={{ height }}
      >
        {pct != null ? (
          <>
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${lossPct}%` }}
            />
          </>
        ) : (
          <div className="w-full bg-muted-foreground/20" />
        )}
      </div>
      {showLabel && totalCount != null && (
        <p className="text-[10px] text-muted-foreground text-center">
          از {totalCount} معامله
        </p>
      )}
    </div>
  );
}

// ── نسخه فشرده برای جدول‌ها ──────────────────────────────────────────────────

interface MiniWinBarProps {
  winRate: number | null;
  className?: string;
}

export function MiniWinBar({ winRate, className = '' }: MiniWinBarProps) {
  const pct = winRate != null ? Math.round(winRate * 100) : 0;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct >= 55 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-8 shrink-0">
        {winRate != null ? `${pct}٪` : '—'}
      </span>
    </div>
  );
}
