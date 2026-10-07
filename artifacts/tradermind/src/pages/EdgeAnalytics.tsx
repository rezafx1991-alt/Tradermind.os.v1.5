/**
 * EdgeAnalytics — Deep Multi-Dimensional Analytics Dashboard (Prompt 17 — Complete)
 * Mobile-first, RTL Persian UI
 */
import { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '../components/ui/skeleton';
import { db } from '../db/database';
import { Trade, Strategy } from '../db/database';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, ReferenceLine, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import {
  TrendingUp, Zap, Clock, Activity, BarChart2, Calendar, Brain,
  AlertCircle, Target, Shield, Search, MessageSquare, DollarSign, Filter, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import {
  computeEdgeAnalytics, computeExtendedAnalytics, filterCalendarMonths,
  EdgeAnalyticsResult, ExtendedAnalyticsResult, SliceMetrics, ConfidenceLevel,
  CONFIDENCE_FA, DEFAULT_SESSIONS, NL_QUESTIONS, answerNLQuestion,
  PERSIAN_DAYS, NLAnswer, EdgeInsight, CalendarMonth,
} from '../services/edgeAnalyticsService';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = { win:'#10b981', loss:'#ef4444', neutral:'#6366f1', primary:'#8b5cf6', amber:'#f59e0b', blue:'#3b82f6', muted:'#6b7280' };

const TZ_OPTIONS = [
  { value: '0',   label: 'UTC+0 (لندن)' },
  { value: '3.5', label: 'UTC+3:30 (تهران)' },
  { value: '4.5', label: 'UTC+4:30 (تهران DST)' },
  { value: '-5',  label: 'UTC-5 (نیویورک)' },
  { value: '-4',  label: 'UTC-4 (نیویورک DST)' },
  { value: '8',   label: 'UTC+8 (سنگاپور)' },
  { value: '9',   label: 'UTC+9 (توکیو)' },
];

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const cls: Record<ConfidenceLevel, string> = {
    insufficient: 'bg-muted/30 text-muted-foreground border-border',
    weak:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    moderate:'bg-blue-500/10 text-blue-400 border-blue-500/20',
    strong: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  return <span className={cn('text-xs px-1.5 py-0.5 rounded border font-medium shrink-0',cls[level])}>{CONFIDENCE_FA[level]}</span>;
}

function RBadge({ value, size = 'sm' }: { value: number | null; size?: 'xs'|'sm' }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-rose-400' : 'text-muted-foreground';
  return <span className={cn('font-bold', size==='xs'?'text-[11px]':'text-xs', cls)}>{value>0?'+':''}{value.toFixed(2)}R</span>;
}

function WinBar({ winRate, count }: { winRate: number; count: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-1">
      <div className="flex-1 bg-muted/20 rounded-full h-1.5 min-w-0">
        <div className={cn('h-1.5 rounded-full', winRate >= 50 ? 'bg-emerald-500' : 'bg-rose-500')} style={{ width:`${Math.min(winRate,100)}%` }} />
      </div>
      <span className="text-xs w-8 shrink-0">{winRate.toFixed(0)}٪</span>
      <span className="text-xs text-muted-foreground shrink-0">({count})</span>
    </div>
  );
}

function MetricsCard({ title, color, metrics }: { title: string; color: string; metrics: SliceMetrics }) {
  return (
    <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold" style={{ color }}>{title}</span>
        <ConfidenceBadge level={metrics.confidence} />
      </div>
      {[
        ['معاملات',    `${metrics.count}` ],
        ['درصد برد',   `${metrics.winRate.toFixed(0)}٪`],
        ['میانگین R',  null],
        ['کل R',       null],
        ['PF',         metrics.profitFactor?.toFixed(2) ?? null],
        ['نگهداری',    metrics.avgHoldingMinutes ? `${metrics.avgHoldingMinutes < 60 ? metrics.avgHoldingMinutes.toFixed(0)+'د' : (metrics.avgHoldingMinutes/60).toFixed(1)+'س'}` : null],
      ].map(([label, val], i) => val !== null ? (
        <div key={i} className="flex justify-between text-xs py-0.5 border-b border-border/40 last:border-0">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{val}</span>
        </div>
      ) : label === 'میانگین R' ? (
        <div key={i} className="flex justify-between text-xs py-0.5 border-b border-border/40">
          <span className="text-muted-foreground">میانگین R</span>
          <RBadge value={metrics.avgR} />
        </div>
      ) : (
        <div key={i} className="flex justify-between text-xs py-0.5 border-b border-border/40 last:border-0">
          <span className="text-muted-foreground">کل R</span>
          <RBadge value={metrics.totalR} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
      <BarChart2 className="w-8 h-8 text-muted-foreground/30" />
      <p className="text-xs text-muted-foreground max-w-xs">{label}</p>
    </div>
  );
}

function SampleWarn({ count }: { count: number }) {
  if (count >= 15) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 mt-2">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      {count < 5 ? 'داده ناکافی — نتایج قابل اعتماد نیستند.' : `نمونه کوچک (${count} معامله) — با احتیاط تفسیر کنید.`}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value ?? 0;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="font-medium mb-1">{label}</div>
      <div className={v >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{v > 0?'+':''}{v.toFixed(2)}R</div>
    </div>
  );
}

// ── Tab: مزیت (Edge + Combos + Q&A) ─────────────────────────────────────────

function EdgeTab({ result, ext }: { result: EdgeAnalyticsResult; ext: ExtendedAnalyticsResult }) {
  const [nlInput, setNlInput] = useState('');
  const [nlAnswer, setNlAnswer] = useState<NLAnswer | null>(null);

  function ask(q: string) { setNlInput(q); setNlAnswer(answerNLQuestion(q, result)); }

  const strengthCls: Record<EdgeInsight['strength'], string> = {
    edge:          'border-emerald-500/40 bg-emerald-500/5',
    possible:      'border-blue-500/30 bg-blue-500/5',
    'early-signal':'border-amber-500/30 bg-amber-500/5',
    insufficient:  'border-border bg-muted/10',
  };
  const strengthLabel: Record<EdgeInsight['strength'], string> = {
    edge:'مزیت', possible:'احتمال مزیت', 'early-signal':'سیگنال اولیه', insufficient:'داده ناکافی',
  };
  const strengthBadgeCls: Record<EdgeInsight['strength'], string> = {
    edge:          'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    possible:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'early-signal':'bg-amber-500/20 text-amber-400 border-amber-500/30',
    insufficient:  'bg-muted/30 text-muted-foreground border-border',
  };
  const typeIcon: Record<EdgeInsight['type'], string> = { strength:'💚', weakness:'🔴', tendency:'🔵', warning:'⚠️' };

  // All combos merged (2-dim + 3-dim)
  const allTriTop = ext.triCombos
    .filter(c => (c.metrics.avgR??0) > (result.overallMetrics.avgR??0)+0.1 && c.metrics.confidence!=='insufficient')
    .sort((a,b) => (b.metrics.avgR??0)-(a.metrics.avgR??0)).slice(0,5);

  return (
    <div className="space-y-4">
      {/* Personal Edge Discovery */}
      <div className="space-y-3">
        {result.edgeInsights.map(ins => (
          <div key={ins.id} className={cn('border rounded-lg p-3 space-y-2', strengthCls[ins.strength])}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span className="text-base mt-0.5 shrink-0">{typeIcon[ins.type]}</span>
                <div>
                  <div className="text-sm font-semibold">{ins.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ins.description}</div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={cn('text-xs px-1.5 py-0.5 rounded border font-medium', strengthBadgeCls[ins.strength])}>{strengthLabel[ins.strength]}</span>
                <ConfidenceBadge level={ins.confidence} />
              </div>
            </div>
            {ins.evidence.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ins.evidence.map((e,i) => (
                  <span key={i} className="text-xs bg-muted/30 rounded px-2 py-0.5">
                    <span className="text-muted-foreground">{e.label}: </span><span className="font-medium">{e.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 2D Top Combos */}
      {result.topCombos.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-emerald-400"/>ترکیب‌های ۲بعدی برتر</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {result.topCombos.map((c,i) => (
              <div key={i} className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                <span className="text-xs text-emerald-400 font-bold w-4">{i+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.metrics.count} معامله · {c.metrics.winRate.toFixed(0)}٪</div>
                </div>
                <RBadge value={c.metrics.avgR} /><ConfidenceBadge level={c.metrics.confidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3D Combos */}
      {allTriTop.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-primary"/>ترکیب‌های ۳بعدی (روز × سشن × نماد)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {allTriTop.map((c,i) => (
              <div key={i} className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <span className="text-xs text-primary font-bold w-4">{i+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.metrics.count} معامله · {c.metrics.winRate.toFixed(0)}٪</div>
                </div>
                <RBadge value={c.metrics.avgR} /><ConfidenceBadge level={c.metrics.confidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Weak Combos */}
      {result.weakCombos.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 text-rose-400"/>ترکیب‌های ضعیف‌تر</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {result.weakCombos.map((c,i) => (
              <div key={i} className="flex items-center gap-2 bg-rose-500/5 border border-rose-500/20 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{c.label}</div><div className="text-xs text-muted-foreground">{c.metrics.count} معامله</div></div>
                <RBadge value={c.metrics.avgR} /><ConfidenceBadge level={c.metrics.confidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Natural Language Q&A */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary"/>سوال از داده‌های شما</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={nlInput} onChange={e=>setNlInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&nlInput.trim()&&ask(nlInput.trim())}
              placeholder="مثلاً: بهترین روز من کدام است؟" className="text-sm" dir="rtl" />
            <Button size="sm" variant="outline" onClick={()=>nlInput.trim()&&ask(nlInput.trim())}><Search className="w-4 h-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NL_QUESTIONS.map((q,i) => (
              <button key={i} onClick={()=>ask(q)} className="text-xs px-2 py-1 rounded-full bg-muted/30 border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                {q}
              </button>
            ))}
          </div>
          {nlAnswer && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <div className="text-xs text-primary font-medium">{nlAnswer.question}</div>
              <div className="text-sm leading-relaxed">{nlAnswer.answer}</div>
              {nlAnswer.evidence.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {nlAnswer.evidence.map((e,i) => (
                    <span key={i} className="text-xs bg-muted/30 rounded px-2 py-0.5">
                      <span className="text-muted-foreground">{e.label}: </span><span>{e.value}</span>
                    </span>
                  ))}
                </div>
              )}
              <ConfidenceBadge level={nlAnswer.confidence} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: زمان ────────────────────────────────────────────────────────────────

function TimeTab({ result, ext }: { result: EdgeAnalyticsResult; ext: ExtendedAnalyticsResult }) {
  const dayData = result.daySlices.map(d => ({
    name: d.name.slice(0,3), full: d.name,
    avgR: +(d.metrics.avgR??0).toFixed(2), count: d.metrics.count, winRate: +d.metrics.winRate.toFixed(0),
    conf: d.metrics.confidence,
  }));

  // Day × Hour grid (unique hours from matrix)
  const matrixHours = Array.from(new Set(ext.dayHourMatrix.map(c=>c.hour))).sort((a,b)=>a-b);
  const matrixDays  = [6,0,1,2,3,4,5].filter(d => ext.dayHourMatrix.some(c=>c.day===d));
  function dhCell(day: number, hour: number) {
    return ext.dayHourMatrix.find(c=>c.day===day&&c.hour===hour);
  }
  function dhColor(c: typeof ext.dayHourMatrix[0] | undefined) {
    if (!c || c.metrics.closedCount < 2) return 'bg-muted/20 text-muted-foreground/30';
    const r = c.metrics.avgR ?? 0;
    if (r > 0.4)  return 'bg-emerald-500/70 text-emerald-100';
    if (r > 0.1)  return 'bg-emerald-500/30 text-emerald-300';
    if (r < -0.4) return 'bg-rose-500/70 text-rose-100';
    if (r < -0.1) return 'bg-rose-500/30 text-rose-300';
    return 'bg-amber-500/20 text-amber-300';
  }

  return (
    <div className="space-y-4">
      {/* Day of Week */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4 text-primary"/>عملکرد روز هفته</CardTitle></CardHeader>
        <CardContent>
          {dayData.length === 0 ? <EmptyState label="داده روزانه موجود نیست" /> : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={dayData} margin={{ top:4, right:4, left:-22, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.1)" />
                  <XAxis dataKey="name" tick={{ fontSize:11, fill:'#9ca3af' }} />
                  <YAxis tick={{ fontSize:10, fill:'#9ca3af' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(156,163,175,0.3)" />
                  <Bar dataKey="avgR" radius={[4,4,0,0]}>
                    {dayData.map((d,i) => <Cell key={i} fill={d.avgR>=0?C.win:C.loss} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {result.daySlices.map((d,i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-muted-foreground shrink-0">{d.name}</span>
                    <WinBar winRate={d.metrics.winRate} count={d.metrics.closedCount} />
                    <RBadge value={d.metrics.avgR} />
                    <span className="text-muted-foreground text-[10px] hidden sm:inline">مدیان:{d.metrics.medianR?.toFixed(1)??'—'}</span>
                    <ConfidenceBadge level={d.metrics.confidence} />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Hourly Heatmap */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary"/>هیت‌مپ ساعتی (UTC)</CardTitle></CardHeader>
        <CardContent>
          {result.hourSlices.length === 0 ? <EmptyState label="داده ساعتی موجود نیست" /> : (
            <>
              <div className="grid grid-cols-8 gap-0.5 mb-2 sm:grid-cols-12">
                {Array.from({length:24},(_,h)=>{
                  const d = result.hourSlices.find(x=>x.label===`${String(h).padStart(2,'0')}:00`);
                  const val = d?.metrics.avgR ?? null;
                  const bg = !d?'bg-muted/20':val!=null&&val>0.3?'bg-emerald-500/70':val!=null&&val>0?'bg-emerald-500/30':val!=null&&val<-0.3?'bg-rose-500/70':val!=null&&val<0?'bg-rose-500/30':'bg-amber-500/20';
                  return (
                    <div key={h} className={cn('rounded p-0.5 text-center cursor-default',bg)} title={d?`${d.label}: ${val!=null?(val>0?'+':'')+val.toFixed(2):'—'}R (${d.metrics.count}×)`:''}>
                      <div className="text-[9px] text-foreground/60">{h}</div>
                      {d && val!=null && <div className={cn('text-[9px] font-bold',val>=0?'text-emerald-300':'text-rose-300')}>{val>0?'+':''}{val.toFixed(1)}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground mb-2">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/70 inline-block"/>R&gt;0.3</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/30 inline-block"/>R&gt;0</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500/30 inline-block"/>R&lt;0</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500/70 inline-block"/>R&lt;−0.3</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={result.hourSlices.filter(h=>h.metrics.count>0)} margin={{top:2,right:2,left:-22,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.08)" />
                  <XAxis dataKey="label" tick={{fontSize:8,fill:'#9ca3af'}} interval={2} />
                  <YAxis tick={{fontSize:8,fill:'#9ca3af'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(156,163,175,0.3)" />
                  <Bar dataKey="metrics.avgR" radius={[2,2,0,0]}>
                    {result.hourSlices.map((h,i)=><Cell key={i} fill={(h.metrics.avgR??0)>=0?C.win:C.loss}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* Day × Hour matrix */}
      {ext.dayHourMatrix.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-amber-400"/>ماتریس روز × ساعت</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-[10px] w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-right text-muted-foreground py-1 pl-1 w-10 font-normal">روز↓ ساعت→</th>
                    {matrixHours.map(h=>(
                      <th key={h} className="text-center py-1 px-0.5 text-muted-foreground font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixDays.map(d=>(
                    <tr key={d}>
                      <td className="text-muted-foreground py-0.5 pl-1 font-medium">{PERSIAN_DAYS[d].slice(0,3)}</td>
                      {matrixHours.map(h=>{
                        const cell = dhCell(d,h);
                        return (
                          <td key={h} className="py-0.5 px-0.5 text-center">
                            <div className={cn('rounded px-0.5 py-0.5 font-medium text-center min-w-[22px]',dhColor(cell))}
                              title={cell?`${PERSIAN_DAYS[d]} ${h}:00 — ${cell.metrics.avgR?.toFixed(2)??'—'}R (${cell.metrics.count}×)`:''}>
                              {cell && cell.metrics.closedCount>=2 ? (cell.metrics.avgR!=null?`${cell.metrics.avgR>0?'+':''}${cell.metrics.avgR.toFixed(1)}`:'?') : '·'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">سلول‌های خالی کمتر از ۲ معامله دارند.</p>
          </CardContent>
        </Card>
      )}

      {/* Holding Time */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400"/>زمان نگهداری</CardTitle></CardHeader>
        <CardContent>
          {result.holdingBuckets.length===0 ? <EmptyState label="داده نگهداری موجود نیست" /> : (
            <div className="space-y-2">
              {result.holdingBuckets.map((b,i)=>(
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-24 text-muted-foreground shrink-0">{b.label}</span>
                  <WinBar winRate={b.metrics.winRate} count={b.metrics.count} />
                  <RBadge value={b.metrics.avgR} /><ConfidenceBadge level={b.metrics.confidence} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Comparison */}
      {result.historicalComparison.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">تاریخی در مقابل اخیر</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {result.historicalComparison.map((h,i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-24 text-muted-foreground shrink-0">{h.period}</span>
                <WinBar winRate={h.winRate} count={h.count} />
                <RBadge value={h.avgR} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tab: سشن ─────────────────────────────────────────────────────────────────

function SessionsTab({ result, ext }: { result: EdgeAnalyticsResult; ext: ExtendedAnalyticsResult }) {
  const mainSessions = DEFAULT_SESSIONS.filter(s=>!s.isOverlap);
  const days = [6,0,1,2,3,4,5];

  function cellM(day: number, sessId: string) {
    return result.daySessionMatrix.find(c=>c.day===day&&c.sessionId===sessId)?.metrics;
  }
  function cellCls(m?: SliceMetrics) {
    if (!m||m.closedCount<2) return 'bg-muted/20 text-muted-foreground/40';
    const r = m.avgR??0;
    if (r>0.4) return 'bg-emerald-500/40 text-emerald-200'; if (r>0.1) return 'bg-emerald-500/20 text-emerald-300';
    if (r<-0.4) return 'bg-rose-500/40 text-rose-200'; if (r<-0.1) return 'bg-rose-500/20 text-rose-300';
    return 'bg-amber-500/15 text-amber-300';
  }

  return (
    <div className="space-y-4">
      {/* Session Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {result.sessionSlices.map(s=>(
          <div key={s.sessionId} className="bg-muted/20 border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{background:s.color}}/>
                <span className="text-sm font-semibold">{s.name}</span>
                {s.isOverlap && <Badge variant="secondary" className="text-xs h-4 px-1">اوورلپ</Badge>}
              </div>
              <ConfidenceBadge level={s.metrics.confidence} />
            </div>
            <div className="grid grid-cols-4 gap-1 text-center text-xs">
              {[['معاملات',`${s.metrics.count}`],['W/L',`${s.metrics.wins}/${s.metrics.losses}`],['برد',`${s.metrics.winRate.toFixed(0)}٪`],['avgR',null]].map(([l,v],i)=>(
                <div key={i}><div className="text-muted-foreground text-[10px] mb-0.5">{l}</div>{v?<div className="font-bold">{v}</div>:<RBadge value={s.metrics.avgR}/>}</div>
              ))}
            </div>
            {s.metrics.profitFactor!=null && (
              <div className="mt-1.5 text-xs text-muted-foreground flex justify-between">
                <span>PF: <span className="text-foreground font-medium">{s.metrics.profitFactor.toFixed(2)}</span></span>
                <span>مدیان: <RBadge value={s.metrics.medianR} size="xs" /></span>
              </div>
            )}
            <SampleWarn count={s.metrics.closedCount} />
          </div>
        ))}
      </div>

      {/* Day × Session matrix */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-primary"/>ماتریس روز × سشن (میانگین R)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-right text-muted-foreground py-1 pl-2 w-16 font-normal">روز</th>
                  {mainSessions.map(s=><th key={s.id} className="text-center py-1 px-1 font-normal" style={{color:s.color}}>{s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {days.map(d=>{
                  const any = mainSessions.some(s=>{const m=cellM(d,s.id);return m&&m.count>0;});
                  if (!any) return null;
                  return (
                    <tr key={d}>
                      <td className="text-muted-foreground py-1 pl-2 font-medium">{PERSIAN_DAYS[d].slice(0,3)}</td>
                      {mainSessions.map(s=>{
                        const m=cellM(d,s.id);
                        return (
                          <td key={s.id} className="py-1 px-1 text-center">
                            <div className={cn('rounded px-1 py-0.5 min-w-[44px] text-center',cellCls(m))}>
                              {m&&m.closedCount>=2?(
                                <div><div className="font-medium">{m.avgR!=null?`${m.avgR>0?'+':''}${m.avgR.toFixed(1)}`:'—'}</div>
                                <div className="text-[9px] opacity-70">{m.count}× {m.winRate.toFixed(0)}٪</div></div>
                              ):<div className="text-[10px]">—</div>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: نماد ─────────────────────────────────────────────────────────────────

function SymbolsTab({ result, ext }: { result: EdgeAnalyticsResult; ext: ExtendedAnalyticsResult }) {
  const [expandedStrat, setExpandedStrat] = useState<string|null>(null);

  return (
    <div className="space-y-4">
      {/* Symbol × Time */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary"/>نماد × زمان</CardTitle></CardHeader>
        <CardContent>
          {result.symbolSlices.length===0 ? <EmptyState label="داده نمادی موجود نیست" /> : (
            <div className="space-y-2">
              {result.symbolSlices.slice(0,10).map((sym,i)=>(
                <div key={i} className="bg-muted/20 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2"><span className="text-sm font-bold">{sym.symbol}</span><ConfidenceBadge level={sym.metrics.confidence} /></div>
                    <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">{sym.metrics.count}×</span><RBadge value={sym.metrics.avgR}/></div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="text-muted-foreground">برد: <span className="text-foreground">{sym.metrics.winRate.toFixed(0)}٪</span></span>
                    {sym.bestSession&&<span className="text-blue-400">⭐ سشن: {sym.bestSession}</span>}
                    {sym.bestDay&&<span className="text-amber-400">⭐ روز: {sym.bestDay}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Direction Analysis */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary"/>Long vs Short</CardTitle></CardHeader>
        <CardContent>
          {result.directionSlices.length===0 ? <EmptyState label="داده جهت موجود نیست" /> : (
            <div className="grid grid-cols-2 gap-3">
              {result.directionSlices.map(d=>(
                <MetricsCard key={d.direction} title={d.name} color={d.direction==='long'?C.win:C.loss} metrics={d.metrics} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup × Time */}
      {ext.setupSlices.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400"/>ست‌آپ × زمان</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ext.setupSlices.map((s,i)=>(
              <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2 text-xs">
                <span className="flex-1 font-medium truncate">{s.setup}</span>
                <span className="text-muted-foreground">{s.metrics.count}×</span>
                <span>{s.metrics.winRate.toFixed(0)}٪</span>
                <RBadge value={s.metrics.avgR} />
                {s.bestSession&&<span className="text-blue-400 text-[10px] hidden sm:inline">{s.bestSession}</span>}
                {s.bestDay&&<span className="text-amber-400 text-[10px] hidden sm:inline">{s.bestDay}</span>}
                <ConfidenceBadge level={s.metrics.confidence} />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">ست‌آپ‌ها از تگ‌های معامله استخراج می‌شوند.</p>
          </CardContent>
        </Card>
      )}

      {/* Market Regime */}
      {ext.regimeSlices.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-primary"/>Market Regime</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ext.regimeSlices.map((r,i)=>(
              <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2 text-xs">
                <span className="flex-1 font-medium truncate">{r.regime}</span>
                <span className="text-muted-foreground">{r.metrics.count}×</span>
                <span>{r.metrics.winRate.toFixed(0)}٪</span>
                <RBadge value={r.metrics.avgR} />
                <ConfidenceBadge level={r.metrics.confidence} />
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">Market Regime از تگ‌های معامله استخراج می‌شود (trending، ranging، volatile، ...).</p>
          </CardContent>
        </Card>
      )}

      {/* Strategy × Session / Day breakdown */}
      {ext.strategyBreakdowns.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-primary"/>استراتژی × سشن / روز</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {ext.strategyBreakdowns.map(strat=>(
              <div key={strat.name} className="border border-border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/20 transition-colors"
                  onClick={()=>setExpandedStrat(expandedStrat===strat.name?null:strat.name)}
                >
                  <span>{strat.name}</span>
                  <span className="text-xs text-muted-foreground">{expandedStrat===strat.name?'▲':'▼'}</span>
                </button>
                {expandedStrat===strat.name && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border">
                    {strat.bySession.length>0&&(
                      <div>
                        <div className="text-xs text-muted-foreground mt-2 mb-1.5">بر اساس سشن:</div>
                        {strat.bySession.map(s=>(
                          <div key={s.sessionId} className="flex items-center gap-2 text-xs py-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{background:s.color}}/>
                            <span className="flex-1">{s.name}</span>
                            <span className="text-muted-foreground">{s.metrics.count}×</span>
                            <span>{s.metrics.winRate.toFixed(0)}٪</span>
                            <RBadge value={s.metrics.avgR} /><ConfidenceBadge level={s.metrics.confidence} />
                          </div>
                        ))}
                      </div>
                    )}
                    {strat.byDay.length>0&&(
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">بر اساس روز:</div>
                        {strat.byDay.map(d=>(
                          <div key={d.day} className="flex items-center gap-2 text-xs py-0.5">
                            <span className="flex-1 text-muted-foreground">{d.name}</span>
                            <span>{d.metrics.count}×</span>
                            <span>{d.metrics.winRate.toFixed(0)}٪</span>
                            <RBadge value={d.metrics.avgR} /><ConfidenceBadge level={d.metrics.confidence} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tab: ریسک (MAE/MFE + Risk/Reward) ────────────────────────────────────────

function RiskTab({ ext }: { ext: ExtendedAnalyticsResult }) {
  const rr = ext.riskReward;
  const mf = ext.maemfe;

  return (
    <div className="space-y-4">
      {/* Risk & Reward Summary */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary"/>ریسک و بازده</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-3">
            {[
              ['R:R برنامه‌ریزی‌شده', rr.avgPlannedRR!=null ? rr.avgPlannedRR.toFixed(2) : '—'],
              ['R:R واقعی',            rr.avgActualRR!=null  ? `${rr.avgActualRR>0?'+':''}${rr.avgActualRR.toFixed(2)}R` : '—'],
              ['ریسک میانگین',         rr.avgRiskPct!=null   ? `${rr.avgRiskPct.toFixed(2)}٪` : '—'],
            ].map(([l,v],i)=>(
              <div key={i} className="bg-muted/30 border border-border rounded-lg p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-1">{l}</div>
                <div className="text-sm font-bold">{v}</div>
              </div>
            ))}
          </div>
          {rr.planVsActual.total > 0 && (
            <div className="bg-muted/20 rounded-lg p-3 text-xs space-y-1">
              <div className="font-medium mb-1.5">برنامه در مقابل واقعیت ({rr.planVsActual.total} معامله با هر دو داده):</div>
              {[
                ['واقعی &lt; برنامه (خروج زودتر)', rr.planVsActual.plannedHigher],
                ['واقعی &gt; برنامه (خروج دیرتر)', rr.planVsActual.actualHigher],
                ['مساوی',                           rr.planVsActual.equal],
              ].map(([l,v],i)=>(
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground" dangerouslySetInnerHTML={{__html:l as string}}/>
                  <span className="font-medium">{v} ({rr.planVsActual.total>0?((v as number)/rr.planVsActual.total*100).toFixed(0):0}٪)</span>
                </div>
              ))}
            </div>
          )}
          {rr.rrBySession.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground mt-3 mb-1.5">R واقعی بر اساس سشن:</div>
              {rr.rrBySession.map(s=>(
                <div key={s.sessionId} className="flex items-center gap-2 text-xs mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{background:s.color}}/>
                  <span className="flex-1">{s.name}</span>
                  <span className="text-muted-foreground">{s.count}×</span>
                  <RBadge value={s.avgActualRR} />
                </div>
              ))}
            </>
          )}
          {rr.rrByDay.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground mt-3 mb-1.5">R واقعی بر اساس روز:</div>
              {rr.rrByDay.map(d=>(
                <div key={d.day} className="flex items-center gap-2 text-xs mb-1">
                  <span className="flex-1 text-muted-foreground">{d.name}</span>
                  <span className="text-muted-foreground">{d.count}×</span>
                  <RBadge value={d.avgActualRR} />
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* MAE / MFE */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-amber-400"/>MAE / MFE (بیشترین نوسان مطلوب/نامطلوب)</CardTitle></CardHeader>
        <CardContent>
          {mf.dataCount === 0 ? (
            <EmptyState label="داده MAE/MFE موجود نیست. برای ثبت این داده، از بخش مانیتورینگ زنده استفاده کنید." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-3">
                {[
                  ['میانگین MFE',        mf.avgMFE!=null   ? `${mf.avgMFE.toFixed(2)}R`  : '—'],
                  ['میانگین MAE',        mf.avgMAE!=null   ? `${mf.avgMAE.toFixed(2)}R`  : '—'],
                  ['MFE برندگان',        mf.avgMFEWinners!=null ? `${mf.avgMFEWinners.toFixed(2)}R` : '—'],
                  ['MAE برندگان',        mf.avgMAEWinners!=null ? `${mf.avgMAEWinners.toFixed(2)}R` : '—'],
                  ['MFE بازندگان',       mf.avgMFELosers!=null  ? `${mf.avgMFELosers.toFixed(2)}R`  : '—'],
                  ['MAE بازندگان',       mf.avgMAELosers!=null  ? `${mf.avgMAELosers.toFixed(2)}R`  : '—'],
                ].map(([l,v],i)=>(
                  <div key={i} className="bg-muted/20 border border-border rounded p-2 text-center">
                    <div className="text-[10px] text-muted-foreground mb-0.5">{l}</div>
                    <div className="text-xs font-bold">{v}</div>
                  </div>
                ))}
              </div>
              {mf.avgMFELosers!=null && mf.avgMAEWinners!=null && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2.5 text-xs space-y-1 mb-3">
                  <div className="font-medium text-amber-400 mb-1">تفسیر اولیه:</div>
                  {mf.avgMFELosers > 0.3 && <div>• میانگین MFE بازندگان ({mf.avgMFELosers.toFixed(2)}R) نشان می‌دهد ممکن است پوزیشن‌ها زودتر از موعد به ضرر تبدیل شوند.</div>}
                  {mf.avgMAEWinners!=null && mf.avgMAEWinners < -0.5 && <div>• MAE بالای برندگان می‌تواند نشانه‌ای از SL خیلی تنگ باشد که ممکن است برخی معاملات خوب را حذف کرده باشد.</div>}
                  <div className="text-muted-foreground text-[10px] mt-1">این تفسیرها فقط بر اساس داده‌های ثبت‌شده است و توصیه نیستند.</div>
                </div>
              )}
              {mf.avgMFEBySession.length > 0 && (
                <>
                  <div className="text-xs text-muted-foreground mb-1.5">MFE بر اساس سشن:</div>
                  {mf.avgMFEBySession.map(s=>(
                    <div key={s.sessionId} className="flex items-center gap-2 text-xs mb-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{background:s.color}}/>
                      <span className="flex-1">{s.name}</span>
                      <span className="text-muted-foreground">{s.count}×</span>
                      <span className="font-medium">{s.avgMFE!=null?s.avgMFE.toFixed(2)+'R':'—'}</span>
                    </div>
                  ))}
                </>
              )}
              {mf.points.length > 0 && (
                <>
                  <div className="text-xs text-muted-foreground mt-3 mb-1">نمودار MAE / MFE (هر نقطه = یک معامله):</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <ScatterChart margin={{top:4,right:4,left:-20,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.08)" />
                      <XAxis dataKey="mae" name="MAE" tick={{fontSize:9,fill:'#9ca3af'}} label={{value:'MAE',position:'insideBottom',dy:10,fontSize:9,fill:'#9ca3af'}}/>
                      <YAxis dataKey="mfe" name="MFE" tick={{fontSize:9,fill:'#9ca3af'}} label={{value:'MFE',angle:-90,position:'insideLeft',dx:10,fontSize:9,fill:'#9ca3af'}}/>
                      <ZAxis range={[30,30]} />
                      <Tooltip cursor={{strokeDasharray:'3 3'}} content={({active,payload})=>{
                        if(!active||!payload?.length) return null;
                        const d = payload[0]?.payload;
                        return <div className="bg-popover border border-border rounded p-2 text-xs shadow"><div>{d?.symbol}</div><div>MFE: {d?.mfe?.toFixed(2)}R</div><div>MAE: {d?.mae?.toFixed(2)}R</div></div>;
                      }} />
                      <Scatter data={mf.points.map(p=>({...p,fill:['win','partial-win'].includes(p.result)?C.win:C.loss}))}
                        fill={C.neutral} isAnimationActive={false}>
                        {mf.points.map((p,i)=><Cell key={i} fill={['win','partial-win'].includes(p.result)?C.win:C.loss} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div className="flex gap-3 text-[10px] text-muted-foreground justify-center">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block"/>برنده</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-500 rounded-full inline-block"/>بازنده</span>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: رفتار ────────────────────────────────────────────────────────────────

function BehaviorTab({ result, ext }: { result: EdgeAnalyticsResult; ext: ExtendedAnalyticsResult }) {
  const overall = result.overallMetrics;

  return (
    <div className="space-y-4">
      {/* Entry Timing */}
      {ext.entryTimingSlices.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400"/>تایمینگ ورود</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ext.entryTimingSlices.map((t,i)=>{
              const diff = (t.metrics.avgR??0) - (overall.avgR??0);
              return (
                <div key={i} className="bg-muted/20 border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{t.metrics.count}×</span><ConfidenceBadge level={t.metrics.confidence} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div><div className="text-muted-foreground mb-0.5">درصد برد</div><div className="font-medium">{t.metrics.winRate.toFixed(0)}٪</div></div>
                    <div><div className="text-muted-foreground mb-0.5">میانگین R</div><RBadge value={t.metrics.avgR}/></div>
                    <div><div className="text-muted-foreground mb-0.5">vs میانگین</div>
                      <span className={cn('text-xs font-medium',diff>0?'text-emerald-400':diff<0?'text-rose-400':'text-muted-foreground')}>{diff>0?'+':''}{diff.toFixed(2)}R</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-muted-foreground">تایمینگ ورود از مرور پس از معامله (بخش اجرا) استخراج می‌شود.</p>
          </CardContent>
        </Card>
      )}

      {/* Behavioral Flags */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-primary"/>الگوهای رفتاری ثبت‌شده</CardTitle></CardHeader>
        <CardContent>
          {result.behaviorSlices.length===0 ? (
            <EmptyState label="برچسب رفتاری ثبت نشده. در مرور پس از معامله بخش 'رفتار و احساسات' را تکمیل کنید." />
          ) : (
            <div className="space-y-3">
              {result.behaviorSlices.map((b,i)=>{
                const diff = (b.metrics.avgR??0) - (overall.avgR??0);
                return (
                  <div key={i} className="bg-muted/20 border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2"><span className="text-base">{b.icon}</span><span className="text-sm font-medium">{b.name}</span></div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{b.count}× ({b.rate.toFixed(0)}٪)</span>
                        <ConfidenceBadge level={b.metrics.confidence} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div><div className="text-muted-foreground mb-0.5">درصد برد</div><div className="font-medium">{b.metrics.winRate.toFixed(0)}٪</div></div>
                      <div><div className="text-muted-foreground mb-0.5">میانگین R</div><RBadge value={b.metrics.avgR}/></div>
                      <div><div className="text-muted-foreground mb-0.5">فرق با کل</div>
                        <span className={cn('text-xs font-medium',diff>0?'text-emerald-400':diff<0?'text-rose-400':'text-muted-foreground')}>{diff>0?'+':''}{diff.toFixed(2)}R</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground text-center bg-muted/20 rounded p-2">برچسب‌های رفتاری در بخش «رفتار» مرور پس از معامله ثبت می‌شوند.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: تقویم (with filters) ─────────────────────────────────────────────────

function CalendarTab({ result, strategies, classified }: {
  result: EdgeAnalyticsResult;
  strategies: Strategy[];
  classified: ReturnType<typeof import('../services/edgeAnalyticsService').classifyTrades>;
}) {
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterDir, setFilterDir] = useState('');
  const [filterSess, setFilterSess] = useState('');
  const [filterStrat, setFilterStrat] = useState('');
  const hasFilter = !!filterSymbol || !!filterDir || !!filterSess || !!filterStrat;

  const symbols   = Array.from(new Set(classified.map(t=>t.symbol))).sort();
  const stratList = Array.from(new Set(classified.map(t=>t._strategy).filter(Boolean) as string[])).sort();

  const months = useMemo(() => {
    if (!hasFilter) return result.calendarMonths;
    return filterCalendarMonths(result.calendarMonths, classified as Parameters<typeof filterCalendarMonths>[1], {
      symbol:     filterSymbol || undefined,
      direction:  filterDir    || undefined,
      sessionId:  filterSess   || undefined,
      strategyId: filterStrat  || undefined,
    });
  }, [hasFilter, filterSymbol, filterDir, filterSess, filterStrat, result.calendarMonths, classified]);

  function dayColor(d: { totalR: number|null; trades: number }) {
    if (!d.trades) return 'bg-transparent';
    if (d.totalR==null) return 'bg-blue-500/20';
    if (d.totalR>1)  return 'bg-emerald-500/70'; if (d.totalR>0)  return 'bg-emerald-500/30';
    if (d.totalR<-1) return 'bg-rose-500/70';    if (d.totalR<0)  return 'bg-rose-500/30';
    return 'bg-amber-500/20';
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Filter className="w-4 h-4 text-muted-foreground"/>فیلتر تقویم</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select value={filterSymbol} onValueChange={setFilterSymbol}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="همه نمادها" /></SelectTrigger>
              <SelectContent>{['',...symbols].map(s=><SelectItem key={s} value={s} className="text-xs">{s||'همه نمادها'}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterDir} onValueChange={setFilterDir}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="همه جهت‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="" className="text-xs">همه جهت‌ها</SelectItem>
                <SelectItem value="long" className="text-xs">خرید (Long)</SelectItem>
                <SelectItem value="short" className="text-xs">فروش (Short)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSess} onValueChange={setFilterSess}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="همه سشن‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="" className="text-xs">همه سشن‌ها</SelectItem>
                {DEFAULT_SESSIONS.map(s=><SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStrat} onValueChange={setFilterStrat}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="همه استراتژی‌ها" /></SelectTrigger>
              <SelectContent>{['',...stratList].map(s=><SelectItem key={s} value={s} className="text-xs">{s||'همه استراتژی‌ها'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {hasFilter && (
            <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs text-muted-foreground"
              onClick={()=>{setFilterSymbol('');setFilterDir('');setFilterSess('');setFilterStrat('');}}>
              <X className="w-3 h-3 mr-1"/>حذف فیلترها
            </Button>
          )}
        </CardContent>
      </Card>

      {months.length===0 ? <EmptyState label="داده تقویمی موجود نیست" /> : months.map(month=>{
        const firstDate = new Date(month.year, month.month-1, 1);
        const startDay  = firstDate.getDay();
        const daysInMonth = new Date(month.year, month.month, 0).getDate();
        const dayMap = new Map(month.days.map(d=>[parseInt(d.date.split('-')[2]),d]));
        return (
          <Card key={`${month.year}-${month.month}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{month.year}/{String(month.month).padStart(2,'0')} — {['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'][month.month-1]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {['ی','د','س','چ','پ','ج','ش'].map(d=><div key={d} className="text-center text-[10px] text-muted-foreground">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({length:startDay},(_,i)=><div key={`e${i}`}/>)}
                {Array.from({length:daysInMonth},(_,i)=>{
                  const day=i+1; const data=dayMap.get(day);
                  return (
                    <div key={day} className={cn('rounded text-center py-1 text-[10px]',data?dayColor(data):'bg-transparent')}
                      title={data?`${day}: ${data.trades}× R:${data.totalR?.toFixed(1)??'—'}`:''}
                    >
                      <div className={cn('font-medium',data?'text-foreground':'text-muted-foreground/40')}>{day}</div>
                      {data&&data.trades>0&&<div className="text-[9px] opacity-70">{data.trades}×</div>}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/70 inline-block"/>R&gt;1</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/30 inline-block"/>R&gt;0</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500/30 inline-block"/>R&lt;0</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500/70 inline-block"/>R&lt;−1</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EdgeAnalytics() {
  const [trades, setTrades]         = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('edge');
  const tradingTimeMode = useAppStore(s => s.tradingTimeMode);
  const brokerUtcOffsetMinutes = useAppStore(s => s.brokerUtcOffsetMinutes);
  const tzOffset = tradingTimeMode === 'broker'
    ? brokerUtcOffsetMinutes / 60
    : -new Date().getTimezoneOffset() / 60;

  useEffect(() => {
    Promise.all([db.trades.toArray(), db.strategies.toArray()])
      .then(([ts, ss]) => { setTrades(ts); setStrategies(ss); setLoading(false); });
  }, []);

  const { result, ext, classified } = useMemo(() => {
    if (!trades.length) return { result: null, ext: null, classified: [] };
    const stratMap = strategies.map(s => ({ id: s.id, name: s.name }));
    const res = computeEdgeAnalytics(trades, stratMap, tzOffset);
    const ex  = computeExtendedAnalytics(res.classified);
    return { result: res, ext: ex, classified: res.classified };
  }, [trades, strategies, tzOffset]);

  if (loading) return (
    <div className="space-y-4 p-4 max-w-2xl mx-auto animate-in fade-in duration-300" dir="rtl">
      <div className="flex items-center justify-between py-3">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-9 w-16 rounded-lg shrink-0" />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );

  const TABS = [
    { id:'edge',     icon:Zap,        label:'مزیت'  },
    { id:'time',     icon:Clock,      label:'زمان'  },
    { id:'sessions', icon:Activity,   label:'سشن'   },
    { id:'symbols',  icon:TrendingUp, label:'نماد'  },
    { id:'risk',     icon:DollarSign, label:'ریسک'  },
    { id:'behavior', icon:Brain,      label:'رفتار' },
    { id:'calendar', icon:Calendar,   label:'تقویم' },
  ];

  return (
    <div className="min-h-screen pb-24" dir="rtl">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary"/>تحلیل عمیق &amp; کشف مزیت
            </h1>
            <div className="text-xs text-muted-foreground mt-0.5">
              {result?.classified.length ?? 0} معامله · {result?.overallMetrics.winRate.toFixed(0) ?? 0}٪ برد · avgR: {result?.overallMetrics.avgR?.toFixed(2) ?? '—'}
            </div>
          </div>
          <div className="rounded-md border px-2.5 py-1.5 text-[11px] text-muted-foreground whitespace-nowrap" dir="ltr">
            {tradingTimeMode === 'broker' ? `Broker UTC${tzOffset >= 0 ? '+' : ''}${tzOffset}` : 'Device local time'}
          </div>
        </div>
      </div>

      {!result && (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <BarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3"/>
          <p className="text-muted-foreground text-sm">هنوز معامله‌ای ثبت نشده است.</p>
        </div>
      )}

      {result && ext && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          {result.overallMetrics.closedCount < 5 && (
            <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0"/>
              داده کافی برای تحلیل عمیق وجود ندارد. با ثبت معاملات بیشتر، الگوهای معنادارتری کشف خواهید کرد.
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={`grid grid-cols-7 w-full h-auto mb-4`}>
              {TABS.map(tab=>{
                const Icon=tab.icon;
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="flex flex-col gap-0.5 py-2 h-auto text-xs">
                    <Icon className="w-3.5 h-3.5"/>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="edge">
              <div className="space-y-4">
                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    {label:'کل معاملات', value:`${result.overallMetrics.count}`, sub:`${result.overallMetrics.closedCount} بسته`},
                    {label:'درصد برد',   value:`${result.overallMetrics.winRate.toFixed(0)}٪`, sub:`${result.overallMetrics.wins}W/${result.overallMetrics.losses}L`},
                    {label:'میانگین R',  value:result.overallMetrics.avgR!=null?`${result.overallMetrics.avgR>0?'+':''}${result.overallMetrics.avgR.toFixed(2)}R`:'—', cls:result.overallMetrics.avgR!=null?(result.overallMetrics.avgR>=0?'text-emerald-400':'text-rose-400'):''},
                    {label:'کل R',       value:result.overallMetrics.totalR!=null?`${result.overallMetrics.totalR>0?'+':''}${result.overallMetrics.totalR.toFixed(1)}R`:'—', cls:result.overallMetrics.totalR!=null?(result.overallMetrics.totalR>=0?'text-emerald-400':'text-rose-400'):''},
                  ].map((c,i)=>(
                    <div key={i} className="bg-muted/30 border border-border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
                      <div className={cn('text-lg font-bold',(c as {cls?:string}).cls)}>{c.value}</div>
                      {(c as {sub?:string}).sub&&<div className="text-xs text-muted-foreground">{(c as {sub:string}).sub}</div>}
                    </div>
                  ))}
                </div>
                <EdgeTab result={result} ext={ext} />
              </div>
            </TabsContent>

            <TabsContent value="time"><TimeTab result={result} ext={ext} /></TabsContent>
            <TabsContent value="sessions"><SessionsTab result={result} ext={ext} /></TabsContent>
            <TabsContent value="symbols"><SymbolsTab result={result} ext={ext} /></TabsContent>
            <TabsContent value="risk"><RiskTab ext={ext} /></TabsContent>
            <TabsContent value="behavior"><BehaviorTab result={result} ext={ext} /></TabsContent>
            <TabsContent value="calendar">
              <CalendarTab result={result} strategies={strategies} classified={classified} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
