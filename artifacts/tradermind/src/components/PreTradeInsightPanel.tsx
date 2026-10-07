/**
 * PreTradeInsightPanel — پانل بینش پیش از معامله
 * قبل از ثبت معامله، سابقه این نماد را از داده‌های واقعی نمایش می‌دهد.
 */
import { useMemo } from 'react';
import { Link } from 'wouter';
import {
  TrendingUp, TrendingDown, AlertCircle, ExternalLink,
  ChevronLeft, Zap, Activity
} from 'lucide-react';
import { Trade } from '../db/database';
import {
  getPreTradeInsight, ConfidenceLevel
} from '../services/symbolIntelligenceService';
import { cn } from '../lib/utils';

interface Props {
  symbol: string;
  tags: string[];
  allTrades: Trade[];
}

const CONF_COLORS: Record<ConfidenceLevel, string> = {
  low:    'text-yellow-600 dark:text-yellow-400',
  medium: 'text-blue-600 dark:text-blue-400',
  high:   'text-green-600 dark:text-green-400',
};
const CONF_LABELS: Record<ConfidenceLevel, string> = {
  low: 'داده محدود', medium: 'متوسط', high: 'اطمینان بالا',
};

export default function PreTradeInsightPanel({ symbol, tags, allTrades }: Props) {
  const insight = useMemo(() => {
    if (!symbol || symbol.length < 2 || allTrades.length === 0) return null;
    return getPreTradeInsight(symbol, tags, allTrades);
  }, [symbol, tags, allTrades]);

  if (!insight) return null;

  const wr = insight.sameSymbolWinRate;
  const avgR = insight.sameSymbolAvgR;
  const hasData = insight.sameSymbolCount > 0;
  const wrColor = wr == null ? '' : wr >= 55 ? 'text-green-600 dark:text-green-400' : wr >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500';

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* هدر */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">سابقه معاملاتی — {symbol}</span>
        </div>
        <Link href={`/symbols/${encodeURIComponent(symbol)}`}>
          <button className="flex items-center gap-1 text-xs text-primary hover:underline">
            پروفایل کامل <ExternalLink className="w-3 h-3" />
          </button>
        </Link>
      </div>

      <div className="p-4 space-y-4">
        {/* هشدارها */}
        {insight.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2.5 border border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {w}
          </div>
        ))}

        {hasData ? (
          <>
            {/* آمار اصلی */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2.5 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">معاملات مشابه</p>
                <p className="text-lg font-bold">{insight.sameSymbolCount}</p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">نرخ برد</p>
                <p className={cn('text-lg font-bold', wrColor)}>
                  {wr != null ? `${wr.toFixed(0)}٪` : '—'}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">میانگین R</p>
                <p className={cn('text-lg font-bold', avgR != null ? (avgR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500') : '')}>
                  {avgR != null ? `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—'}
                </p>
              </div>
            </div>

            {/* سطح اطمینان */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">سطح اطمینان داده:</span>
              <span className={cn('font-medium', CONF_COLORS[insight.confidence])}>
                {CONF_LABELS[insight.confidence]}
              </span>
            </div>

            {/* الگوهای مرتبط */}
            {insight.relevantPatterns.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">الگوهای مرتبط روی {symbol}:</p>
                <div className="space-y-1.5">
                  {insight.relevantPatterns.slice(0, 4).map(p => (
                    <div key={p.tag} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Zap className="w-3 h-3 text-primary shrink-0" />
                        <span className="truncate font-medium">{p.tag}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', p.winRate >= 55 ? 'bg-green-500' : p.winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500')}
                            style={{ width: `${Math.min(100, p.winRate)}%` }}
                          />
                        </div>
                        <span className={cn('w-8 text-right font-semibold', p.winRate >= 55 ? 'text-green-600 dark:text-green-400' : p.winRate >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500')}>
                          {p.winRate.toFixed(0)}٪
                        </span>
                        <span className="text-muted-foreground w-8">({p.count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* معاملات مشابه روی سایر نمادها */}
            {insight.crossSymbolCount > 0 && tags.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 border border-blue-200 dark:border-blue-800">
                <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold">{insight.crossSymbolCount}</span> معامله با تگ‌های مشابه روی سایر نمادها یافت شد.
                  این الگوها ممکن است شواهد متقاطع ارائه دهند.
                </span>
              </div>
            )}
          </>
        ) : (
          /* بدون سابقه */
          <div className="text-center py-3 space-y-1">
            <TrendingDown className="w-7 h-7 mx-auto text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">هیچ معامله بسته‌ای برای {symbol} ثبت نشده.</p>
            <p className="text-xs text-muted-foreground">این اولین معامله روی این نماد خواهد بود.</p>
          </div>
        )}

        {/* لینک به آخرین معاملات روی این نماد */}
        {insight.sameSymbolTrades.length > 0 && (
          <div className="pt-1 border-t">
            <p className="text-xs text-muted-foreground mb-2">آخرین معاملات این نماد:</p>
            <div className="space-y-1">
              {insight.sameSymbolTrades.slice(0, 3).map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-muted/40">
                  <span className="text-muted-foreground">
                    {new Date(t.openedAt).toLocaleDateString('fa-IR')}
                  </span>
                  <span className={cn(
                    'font-semibold',
                    t.result === 'win' || t.result === 'partial-win' ? 'text-green-600 dark:text-green-400' :
                    t.result === 'loss' || t.result === 'partial-loss' ? 'text-red-500' : 'text-muted-foreground'
                  )}>
                    {t.result === 'win' ? 'برد' : t.result === 'loss' ? 'ضرر' : t.result === 'partial-win' ? 'برد جزئی' : t.result === 'partial-loss' ? 'ضرر جزئی' : t.result === 'breakeven' ? 'سربه‌سر' : t.result}
                  </span>
                  <span className={cn(
                    'font-medium',
                    t.rMultiple != null && t.rMultiple >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                  )}>
                    {t.rMultiple != null ? `${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R` : '—'}
                  </span>
                </div>
              ))}
            </div>
            {insight.sameSymbolTrades.length > 3 && (
              <Link href={`/symbols/${encodeURIComponent(symbol)}`}>
                <button className="flex items-center gap-1 text-xs text-primary mt-2 hover:underline w-full justify-center">
                  مشاهده همه <ChevronLeft className="w-3 h-3" />
                </button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
