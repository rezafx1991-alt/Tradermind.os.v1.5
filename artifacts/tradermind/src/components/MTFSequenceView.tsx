/**
 * MTFSequenceView — Prompt 15, Section 7
 * ────────────────────────────────────────
 * Multi-timeframe screenshot sequence viewer.
 * Shows 4H → 15M → 5M → 1M relationship and
 * the alignment analysis between timeframes.
 */

import { useState, memo } from 'react';
import { TradeScreenshot, TIMEFRAME_LABELS, TIMEFRAME_ORDER, MTFRelationship, MTFAlignment } from '../types/screenshot';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { ArrowDown, CheckCircle2, AlertTriangle, AlertCircle, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import StoredImage from './StoredImage';

const TF_ROLE: Record<string, string> = {
  'W': 'تایم‌فریم هفتگی',
  'D': 'تایم‌فریم روزانه',
  '4h': 'تایم‌فریم بالاتر',
  '1h': 'تایم‌فریم میانی',
  '15m': 'تایم‌فریم ساختار',
  '5m': 'تایم‌فریم ست‌آپ',
  '1m': 'تایم‌فریم اجرا',
};

function AlignmentBadge({ alignment }: { alignment: MTFAlignment | null }) {
  if (!alignment) return null;
  const configs: Record<MTFAlignment, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
    aligned: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', label: 'همراستا' },
    partial: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'همراستایی جزئی' },
    conflicting: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'تضاد تایم‌فریمی' },
  };
  const { icon: Icon, color, bg, label } = configs[alignment];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border', color, bg)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

interface Props {
  screenshots: TradeScreenshot[];
  mtfRelationship: MTFRelationship | null;
}

function MTFSequenceView({ screenshots, mtfRelationship }: Props) {
  const [selectedTF, setSelectedTF] = useState<string | null>(null);

  // Sort by timeframe (higher to lower)
  const sorted = [...screenshots]
    .filter(s => s.timeframe)
    .sort((a, b) => {
      const ia = TIMEFRAME_ORDER.indexOf(a.timeframe);
      const ib = TIMEFRAME_ORDER.indexOf(b.timeframe);
      return ia - ib; // W first, 1m last
    });

  // Group by timeframe (keep latest per TF)
  const byTF = new Map<string, TradeScreenshot>();
  for (const s of sorted) {
    if (s.timeframe) byTF.set(s.timeframe, s);
  }
  const uniqueTFs = [...byTF.values()];

  if (uniqueTFs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        برای نمایش تحلیل چند تایم‌فریم، اسکرین‌شات‌هایی با تایم‌فریم مشخص آپلود کنید
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* MTF relationship summary */}
      {mtfRelationship && (
        <div className="rounded-lg border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">تحلیل چند تایم‌فریم</p>
            <AlignmentBadge alignment={mtfRelationship.alignment} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {mtfRelationship.higherTFSignal && (
              <div className="p-2 rounded bg-white/3 border border-white/8">
                <p className="text-muted-foreground mb-0.5">تایم‌فریم بالاتر</p>
                <p>{mtfRelationship.higherTFSignal}</p>
              </div>
            )}
            {mtfRelationship.intermediateTFSignal && (
              <div className="p-2 rounded bg-white/3 border border-white/8">
                <p className="text-muted-foreground mb-0.5">تایم‌فریم میانی</p>
                <p>{mtfRelationship.intermediateTFSignal}</p>
              </div>
            )}
            {mtfRelationship.entryTFSignal && (
              <div className="p-2 rounded bg-white/3 border border-white/8">
                <p className="text-muted-foreground mb-0.5">تایم‌فریم ست‌آپ</p>
                <p>{mtfRelationship.entryTFSignal}</p>
              </div>
            )}
            {mtfRelationship.executionTFSignal && (
              <div className="p-2 rounded bg-white/3 border border-white/8">
                <p className="text-muted-foreground mb-0.5">تایم‌فریم اجرا</p>
                <p>{mtfRelationship.executionTFSignal}</p>
              </div>
            )}
          </div>

          {mtfRelationship.notes && (
            <p className="text-xs text-muted-foreground border-t border-white/10 pt-2">
              {mtfRelationship.notes}
            </p>
          )}
        </div>
      )}

      {/* Visual sequence — top (high TF) to bottom (low TF) */}
      <div className="flex flex-col items-center gap-2">
        {uniqueTFs.map((ss, idx) => (
          <div key={ss.id} className="w-full flex flex-col items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <div className={cn(
                  'w-full rounded-xl border overflow-hidden cursor-pointer transition-all',
                  'hover:border-white/25 hover:shadow-lg',
                  selectedTF === ss.timeframe ? 'border-primary/50' : 'border-white/10',
                )}>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/3 border-b border-white/8">
                    <span className="text-xs font-mono font-bold text-primary">{ss.timeframe}</span>
                    <span className="text-xs text-muted-foreground">
                      {ss.timeframe ? TF_ROLE[ss.timeframe] : ''}
                    </span>
                    {ss.lifecyclePosition && (
                      <span className="mr-auto text-xs text-muted-foreground">
                        {{
                          'before-entry': 'قبل از ورود',
                          'during-trade': 'حین معامله',
                          'after-trade': 'پس از معامله',
                        }[ss.lifecyclePosition]}
                      </span>
                    )}
                  </div>

                  <div className="relative aspect-video">
                    <StoredImage
                      source={ss}
                      alt={`${ss.timeframe} screenshot`}
                      className="w-full h-full object-cover"
                    />

                    {/* Feature chips */}
                    {(ss.extractedFeatures ?? []).filter(f => f.confirmed !== false).length > 0 && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <div className="flex flex-wrap gap-1">
                          {(ss.extractedFeatures ?? [])
                            .filter(f => f.confirmed !== false)
                            .slice(0, 3)
                            .map(f => (
                              <span key={f.id} className="text-[10px] bg-white/20 backdrop-blur-sm
                                                           px-1.5 py-0.5 rounded text-white">
                                {f.correctedValue
                                  ? (f.label !== f.correctedValue ? f.correctedValue : f.label)
                                  : f.label}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </DialogTrigger>

              <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none">
                <div className="rounded-xl overflow-hidden border border-white/15 bg-black/90">
                  <div className="px-3 py-2 border-b border-white/10 flex items-center gap-3">
                    <span className="font-mono font-bold text-primary">{ss.timeframe}</span>
                    <span className="text-sm text-muted-foreground">
                      {ss.timeframe ? TF_ROLE[ss.timeframe] : ''}
                    </span>
                    {ss.label && <span className="text-sm">{ss.label}</span>}
                  </div>
                  <StoredImage
                    source={ss}
                    alt={ss.label}
                    enableViewer
                    showDownload
                    filename={ss.label || `${ss.timeframe}-screenshot`}
                    className="w-full h-auto max-h-[75vh] object-contain"
                  />
                  {(ss.extractedFeatures ?? []).filter(f => f.confirmed !== false).length > 0 && (
                    <div className="px-3 py-2 flex flex-wrap gap-1.5">
                      {(ss.extractedFeatures ?? []).filter(f => f.confirmed !== false).map(f => (
                        <span key={f.id} className="text-xs bg-white/10 px-2 py-0.5 rounded-full">
                          {f.correctedValue ? (f.label !== f.correctedValue ? f.correctedValue : f.label) : f.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Arrow between TFs */}
            {idx < uniqueTFs.length - 1 && (
              <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
                <ArrowDown className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(MTFSequenceView);
