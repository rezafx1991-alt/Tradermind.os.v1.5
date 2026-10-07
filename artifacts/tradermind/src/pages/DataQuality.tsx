/**
 * DataQuality.tsx — Prompt 23 §24
 * نمایش کیفیت و کامل‌بودن داده‌های محلی.
 */

import { useState, useEffect } from "react";
import { Skeleton } from "../components/ui/skeleton";
import { useLocation } from "wouter";

import {
  computeDataQuality, DataQualityMetrics,
} from "../services/dataQualityService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import {
  ShieldCheck, AlertTriangle, CheckCircle2, TrendingUp,
  BarChart2, Camera, FileText, ArrowRight, RefreshCcw,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";

// ─────────────────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const color =
    score >= 90 ? '#6366f1'
    : score >= 80 ? '#22c55e'
    : score >= 60 ? '#eab308'
    : score >= 40 ? '#f97316'
    : '#ef4444';
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor"
          strokeWidth="5" fill="none" className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color}
          strokeWidth="5" fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="absolute text-lg font-bold tabular-nums" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function ScoreLabel(score: number): { text: string; cls: string } {
  if (score >= 90) return { text: 'عالی', cls: 'text-indigo-500' };
  if (score >= 80) return { text: 'خوب', cls: 'text-emerald-500' };
  if (score >= 60) return { text: 'متوسط', cls: 'text-yellow-500' };
  if (score >= 40) return { text: 'پایه', cls: 'text-orange-500' };
  return { text: 'ناقص', cls: 'text-rose-500' };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DataQuality() {
  const [, setLocation] = useLocation();
  const [metrics, setMetrics] = useState<DataQualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const m = await computeDataQuality();
    setMetrics(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-12">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!metrics) return null;

  if (metrics.totalTrades === 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-12">
        <Header onRefresh={load} />
        <Card className="border-dashed bg-transparent">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <BarChart2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">هیچ معامله‌ای یافت نشد</h2>
            <p className="text-muted-foreground">ابتدا چند معامله ثبت کنید تا کیفیت داده قابل سنجش باشد.</p>
            <Button onClick={() => setLocation('/journal/trades/new')}>
              <TrendingUp className="w-4 h-4 ml-2" /> ثبت اولین معامله
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { text: scoreText, cls: scoreCls } = ScoreLabel(metrics.avgCompleteness);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-5xl mx-auto">
      <Header onRefresh={load} />

      {/* ── کارت‌های خلاصه ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col items-center gap-2">
            <ScoreRing score={metrics.avgCompleteness} size={72} />
            <div className="text-center">
              <div className={`text-sm font-semibold ${scoreCls}`}>{scoreText}</div>
              <div className="text-xs text-muted-foreground">میانگین کامل‌بودن</div>
            </div>
          </CardContent>
        </Card>

        {[
          { label: 'کل معاملات', value: metrics.totalTrades, icon: BarChart2, cls: '' },
          { label: 'معاملات کامل', value: metrics.tradesFullyComplete, icon: CheckCircle2, cls: 'text-emerald-500' },
          {
            label: 'نیاز به توجه',
            value: metrics.totalTrades - metrics.tradesFullyComplete,
            icon: AlertTriangle,
            cls: 'text-amber-500',
          },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`w-4 h-4 ${s.cls || 'text-muted-foreground'}`} />
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
              <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── پوشش سریع ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[
          { label: 'اسکرین‌شات دارند', count: metrics.tradesWithScreenshots, icon: Camera },
          { label: 'دلیل ورود دارند', count: metrics.tradesWithEntryReason, icon: FileText },
          { label: 'حد ضرر دارند', count: metrics.tradesWithStopLoss, icon: ShieldCheck },
          { label: 'داده ریسک دارند', count: metrics.tradesWithRiskData, icon: TrendingUp },
          { label: 'ریویو پس از معامله', count: metrics.tradesWithPostTradeReview, icon: CheckCircle2 },
          { label: 'درس‌آموخته دارند', count: metrics.tradesWithLesson, icon: FileText },
          { label: 'تحلیل MTF دارند', count: metrics.tradesWithMTFAnalysis, icon: BarChart2 },
        ].map((item, i) => {
          const pct = Math.round((item.count / metrics.totalTrades) * 100);
          return (
            <Card key={i} className="bg-muted/10">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <span className={cn(
                    "text-xs font-semibold",
                    pct >= 80 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-rose-500'
                  )}>{pct}٪</span>
                </div>
                <Progress value={pct} className="h-1.5" />
                <div className="text-lg font-bold">{item.count}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── توزیع کیفیت ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">توزیع کیفیت</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics.distribution.map((bucket) => (
            <div key={bucket.label} className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium">{bucket.label}</span>
                <span className="text-muted-foreground tabular-nums">{bucket.count} معامله</span>
              </div>
              <div className="w-full h-5 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${metrics.totalTrades > 0 ? (bucket.count / metrics.totalTrades) * 100 : 0}%`,
                    backgroundColor: bucket.color,
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── پوشش فیلدها ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">پوشش فیلدها</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {metrics.fieldCoverage.map((f) => (
              <div key={f.key} className="flex items-center gap-3 text-sm">
                <div className="w-28 shrink-0 truncate">{f.label}</div>
                <Progress value={f.pct} className="flex-1 h-2" />
                <div className={cn(
                  "w-10 text-right tabular-nums font-medium shrink-0",
                  f.pct >= 80 ? 'text-emerald-500' : f.pct >= 50 ? 'text-amber-500' : 'text-rose-500'
                )}>{f.pct}٪</div>
                <Badge variant="outline" className={cn(
                  "text-[9px] py-0 px-1 shrink-0",
                  f.importance === 'high' ? 'border-rose-500/40 text-rose-500' :
                  f.importance === 'medium' ? 'border-amber-500/40 text-amber-500' :
                  'border-muted text-muted-foreground'
                )}>
                  {f.importance === 'high' ? 'مهم' : f.importance === 'medium' ? 'متوسط' : 'جزئی'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── معاملات نیاز به توجه ── */}
      {metrics.tradesNeedingAttention.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              معاملات نیاز به تکمیل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.tradesNeedingAttention.map((s) => {
              const highMissing = s.missingFields.filter(f => f.importance === 'high');
              return (
                <div key={s.tradeId}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/journal/trades/${s.tradeId}`)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <ScoreRing score={s.score} size={40} />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{s.symbol}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(s.openedAt), 'MM/dd/yyyy')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {highMissing.slice(0, 2).map(f => (
                      <Badge key={f.key as string} variant="outline" className="text-[9px] border-rose-500/30 text-rose-500 py-0">
                        {f.label}
                      </Badge>
                    ))}
                    {highMissing.length > 2 && (
                      <Badge variant="outline" className="text-[9px] py-0">+{highMissing.length - 2}</Badge>
                    )}
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Header({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">کیفیت داده</h1>
        <p className="text-muted-foreground mt-1">
          بررسی کامل‌بودن اطلاعات معاملات ثبت‌شده.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
        <RefreshCcw className="w-4 h-4" /> بروزرسانی
      </Button>
    </div>
  );
}
