/**
 * VisualSimilarityPanel — Prompt 15, Sections 8 & 9
 * ───────────────────────────────────────────────────
 * Displays historically similar screenshots based on
 * shared visual features, with outcome context.
 */

import { VisualSimilarityMatch } from '../types/screenshot';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import StoredImage from './StoredImage';

const RESULT_LABELS: Record<string, string> = {
  win: 'برد', loss: 'ضرر', breakeven: 'سر‌به‌سر',
  'partial-win': 'برد جزئی', 'partial-loss': 'ضرر جزئی',
  open: 'باز', cancelled: 'لغو',
};

const RESULT_COLORS: Record<string, string> = {
  win: 'text-green-400 border-green-500/30 bg-green-500/10',
  loss: 'text-red-400 border-red-500/30 bg-red-500/10',
  breakeven: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
  'partial-win': 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  'partial-loss': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  open: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  cancelled: 'text-slate-400 border-slate-500/30 bg-slate-500/10',
};

interface Props {
  matches: VisualSimilarityMatch[];
  isLoading?: boolean;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-orange-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8">{score}٪</span>
    </div>
  );
}

function ResultIcon({ result }: { result: string }) {
  if (result === 'win' || result === 'partial-win') return <TrendingUp className="w-3 h-3" />;
  if (result === 'loss' || result === 'partial-loss') return <TrendingDown className="w-3 h-3" />;
  return <Minus className="w-3 h-3" />;
}

export default function VisualSimilarityPanel({ matches, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Search className="w-4 h-4 ml-2 animate-pulse" />
        جستجوی نمونه‌های مشابه…
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <Search className="w-5 h-5 opacity-40" />
        <p className="text-sm">نمونه‌ای با ویژگی‌های مشابه یافت نشد</p>
        <p className="text-xs">با تأیید ویژگی‌های بیشتر، جستجو دقیق‌تر می‌شود</p>
      </div>
    );
  }

  // Outcome summary
  const wins = matches.filter(m => m.tradeResult === 'win' || m.tradeResult === 'partial-win').length;
  const losses = matches.filter(m => m.tradeResult === 'loss' || m.tradeResult === 'partial-loss').length;
  const winRate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Outcome summary */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-white/8">
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{winRate}٪</p>
          <p className="text-xs text-muted-foreground">نرخ برد مشابه‌ها</p>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <div className="flex gap-3 text-sm">
          <span className="text-green-400">{wins} برد</span>
          <span className="text-red-400">{losses} ضرر</span>
          <span className="text-muted-foreground">{matches.length - wins - losses} سایر</span>
        </div>
        <p className="mr-auto text-xs text-muted-foreground">از {matches.length} نمونه</p>
      </div>

      {/* Match cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {matches.map(m => (
          <Dialog key={`${m.tradeId}-${m.screenshotId}`}>
            <DialogTrigger asChild>
              <div className="group cursor-pointer rounded-lg border border-white/10 overflow-hidden
                              hover:border-white/25 transition-all">
                {/* Thumbnail */}
                <div className="aspect-video relative overflow-hidden bg-black/20">
                  <StoredImage
                    source={m}
                    alt={m.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  {/* Score badge */}
                  <div className="absolute top-1.5 right-1.5">
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded font-mono backdrop-blur-sm border',
                      m.matchScore >= 70
                        ? 'bg-green-500/80 border-green-400/50 text-white'
                        : m.matchScore >= 40
                        ? 'bg-amber-500/80 border-amber-400/50 text-white'
                        : 'bg-black/70 border-white/20 text-white',
                    )}>
                      {m.matchScore}٪
                    </span>
                  </div>
                  {/* Result badge */}
                  <div className="absolute bottom-1.5 left-1.5">
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded border backdrop-blur-sm flex items-center gap-1',
                      RESULT_COLORS[m.tradeResult] ?? RESULT_COLORS.open,
                    )}>
                      <ResultIcon result={m.tradeResult} />
                      {RESULT_LABELS[m.tradeResult] ?? m.tradeResult}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium truncate">{m.symbol}</span>
                    {m.timeframe && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">{m.timeframe}</span>
                    )}
                  </div>
                  <ScoreBar score={m.matchScore} />
                  {m.matchedFeatures.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.matchedFeatures.slice(0, 2).map(feat => (
                        <span key={feat} className="text-[10px] text-muted-foreground bg-white/5
                                                    px-1 py-0.5 rounded truncate max-w-[90px]">
                          {feat}
                        </span>
                      ))}
                      {m.matchedFeatures.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{m.matchedFeatures.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DialogTrigger>

            {/* Full view */}
            <DialogContent className="max-w-3xl p-2 bg-transparent border-none shadow-none">
              <div className="rounded-xl overflow-hidden bg-black/90 border border-white/10">
                <StoredImage
                  source={m}
                  alt={m.label}
                  enableViewer
                  showDownload
                  filename={m.label || 'similar-trade-screenshot'}
                  className="w-full h-auto max-h-[70vh] object-contain"
                />
                <div className="p-3 flex items-center gap-3">
                  <span className="font-medium">{m.symbol}</span>
                  {m.timeframe && <span className="text-muted-foreground text-sm">{m.timeframe}</span>}
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded border flex items-center gap-1',
                    RESULT_COLORS[m.tradeResult] ?? RESULT_COLORS.open,
                  )}>
                    <ResultIcon result={m.tradeResult} />
                    {RESULT_LABELS[m.tradeResult] ?? m.tradeResult}
                  </span>
                  <span className="mr-auto text-sm text-muted-foreground">
                    تشابه: {m.matchScore}٪
                  </span>
                </div>
                {m.matchedFeatures.length > 0 && (
                  <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                    {m.matchedFeatures.map(f => (
                      <span key={f} className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        تشابه بصری یک شاهد است، نه پیش‌بینی — تصمیم نهایی با معامله‌گر است
      </p>
    </div>
  );
}
