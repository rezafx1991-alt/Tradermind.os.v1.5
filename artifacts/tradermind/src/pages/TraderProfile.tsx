import React, { useState, useEffect, useMemo } from 'react';
import { db, Trade, Strategy, ProfileSnapshot } from '@/db/database';
import {
  computeTraderProfile,
  answerProfileQuestion,
  generatePreTradeChecklist,
  generatePostTradeFeedback,
  TraderProfileData,
  BehavioralPattern,
  StrengthItem,
  ChecklistItem,
  PostTradeFeedback,
  InsightCorrection,
  PROFILE_NL_QUESTIONS,
  BEHAVIOR_TREND_FA,
  BEHAVIOR_TREND_COLOR,
  BEHAVIOR_TREND_BG,
  EDGE_TREND_FA,
  EDGE_TREND_COLOR,
  EDGE_TREND_BG,
  PERF_TREND_FA,
  ProfileNLAnswer
} from '@/services/traderProfileService';
import {
  saveProfileSnapshotAutoManaged,
  loadProfileSnapshots,
  deleteProfileSnapshot,
  saveProfileCorrection,
  deleteProfileCorrection,
  loadProfileCorrections,
  clearAllProfileCorrections,
  generateSnapshotLabel,
} from '@/services/profileSnapshotService';
import { CONFIDENCE_FA, CONFIDENCE_COLOR } from '@/services/edgeAnalyticsService';

import {
  LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ReferenceLine
} from 'recharts';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

import {
  UserCircle2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info, XCircle,
  Clock, Search, ListChecks, CalendarDays, BrainCircuit, History, ShieldAlert, Award,
  Activity, Minus, ArrowUpRight, ArrowDownRight, Zap, Target, Save, Trash2, Eye,
  Shield, RotateCcw, AlertCircle, Send,
  Flame, FastForward, HelpCircle, ArrowRightLeft, DoorOpen, Hourglass
} from 'lucide-react';

// ── Sub-components ─────────────────────────────────────────────────────────

const getBehaviorIcon = (id: string) => {
  switch(id) {
    case 'fomo': return <Zap className="w-5 h-5 text-amber-500" />;
    case 'hesitation': return <Hourglass className="w-5 h-5 text-blue-500" />;
    case 'fear': return <AlertTriangle className="w-5 h-5 text-rose-500" />;
    case 'impatience': return <FastForward className="w-5 h-5 text-orange-500" />;
    case 'overconfidence': return <Target className="w-5 h-5 text-emerald-500" />;
    case 'revenge-trading': return <Flame className="w-5 h-5 text-rose-600" />;
    case 'uncertainty': return <HelpCircle className="w-5 h-5 text-purple-500" />;
    case 'sl-moved': return <ArrowRightLeft className="w-5 h-5 text-rose-500" />;
    case 'closed-early': return <DoorOpen className="w-5 h-5 text-sky-500" />;
    default: return <Activity className="w-5 h-5 text-muted-foreground" />;
  }
};

const MetricCard = ({ title, value, desc, icon: Icon, trendClass }: any) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        {Icon && <Icon className={`w-4 h-4 ${trendClass || 'text-muted-foreground'}`} />}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
    </CardContent>
  </Card>
);

const getInsightIcon = (type: string) => {
  if (type === 'strength') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (type === 'weakness') return <AlertTriangle className="w-5 h-5 text-rose-500" />;
  if (type === 'improvement') return <TrendingUp className="w-5 h-5 text-blue-500" />;
  if (type === 'warning') return <AlertCircle className="w-5 h-5 text-amber-500" />;
  return <Info className="w-5 h-5 text-sky-500" />;
};

const InsightCard = ({ insight, onReject, onIrrelevant }: any) => (
  <Card className="flex flex-col">
    <CardHeader className="p-4 pb-2 border-b border-border/50">
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2">
          {getInsightIcon(insight.type)}
          <CardTitle className="text-base leading-tight">{insight.title}</CardTitle>
        </div>
        <Badge variant={insight.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 shrink-0">
          {insight.priority === 'high' ? 'مهم' : insight.priority === 'medium' ? 'متوسط' : 'عادی'}
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="p-4 pt-4 flex-1">
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{insight.body}</p>
      {insight.evidence && insight.evidence.length > 0 && (
        <div className="bg-muted/30 rounded-md p-2 space-y-1.5 mt-auto border border-border/50">
          {insight.evidence.map((ev: any, i: number) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{ev.label}:</span>
              <span className="font-medium text-foreground">{ev.value}</span>
            </div>
          ))}
        </div>
      )}
    </CardContent>
    <CardFooter className="p-3 pt-0 flex justify-between items-center mt-auto">
       <div className={`text-xs ${CONFIDENCE_COLOR[insight.confidence as keyof typeof CONFIDENCE_COLOR]}`}>
         اطمینان: {CONFIDENCE_FA[insight.confidence as keyof typeof CONFIDENCE_FA]}
       </div>
       <div className="flex gap-1">
         <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10" onClick={onReject} title="نادرست">
           <XCircle className="w-4 h-4" />
         </Button>
         <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-muted-foreground/80 hover:bg-muted" onClick={onIrrelevant} title="بی‌ربط">
           <Minus className="w-4 h-4" />
         </Button>
       </div>
    </CardFooter>
  </Card>
);

const renderStrengthGrid = (items: StrengthItem[], title: string, icon: any, colorClass: string) => {
  const visible = items.filter(i => !i.isRejected && !i.isIrrelevant);
  if (!visible.length) return null;
  return (
    <div className="space-y-4">
      <h3 className={`text-lg font-semibold flex items-center gap-2 ${colorClass}`}>
        {icon} {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map(item => (
          <Card key={item.id} className="bg-card">
            <CardContent className="p-4 flex flex-col h-full">
              <div className="font-medium mb-1 text-sm">{item.title}</div>
              <p className="text-xs text-muted-foreground mb-3 flex-1">{item.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                 {item.evidence.map((e, i) => (
                   <Badge key={i} variant="secondary" className="text-[10px] bg-background border border-border/50">{e.label}: {e.value}</Badge>
                 ))}
              </div>
              <div className={`text-xs pt-2 border-t border-border/50 ${CONFIDENCE_COLOR[item.confidence as keyof typeof CONFIDENCE_COLOR]}`}>
                اطمینان: {CONFIDENCE_FA[item.confidence as keyof typeof CONFIDENCE_FA]}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ── Tab Contents ───────────────────────────────────────────────────────────

function DashboardTab({ profile, onRejectInsight }: { profile: TraderProfileData, onRejectInsight: (id: string, action: 'reject' | 'irrelevant') => void }) {
  const tR = profile.overallMetrics.totalR ?? 0;
  return (
    <div className="space-y-8 animate-in fade-in">
      <Card className="bg-card/50 border-primary/20 shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
        <CardContent className="p-6 relative">
          <div className="flex flex-col lg:flex-row gap-6 justify-between">
            <div className="space-y-4 flex-1">
              <div className="flex flex-wrap gap-2">
                {profile.styleTendencies.filter(s => !s.isRejected).slice(0, 3).map(s => (
                  <Badge key={s.id} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-transparent">
                    {s.title}
                  </Badge>
                ))}
                <Badge variant="outline" className={`border-border bg-background`}>
                  روند عملکرد: {PERF_TREND_FA[profile.performanceTrend]}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                 <div>
                   <div className="text-sm text-muted-foreground mb-1">بهترین سشن</div>
                   <div className="font-semibold text-foreground">{profile.bestSession || '—'}</div>
                 </div>
                 <div>
                   <div className="text-sm text-muted-foreground mb-1">بهترین روز</div>
                   <div className="font-semibold text-foreground">{profile.bestDay || '—'}</div>
                 </div>
                 <div>
                   <div className="text-sm text-muted-foreground mb-1">بهترین نماد</div>
                   <div className="font-semibold text-foreground">{profile.bestSymbol || '—'}</div>
                 </div>
                 <div>
                   <div className="text-sm text-muted-foreground mb-1">بهترین ساعت</div>
                   <div className="font-semibold text-foreground">{profile.bestHour ? `${profile.bestHour}:00` : '—'}</div>
                 </div>
              </div>
            </div>
            
            <div className="flex flex-col justify-center items-end border-r-0 lg:border-r border-border pl-0 lg:pr-6 lg:w-48 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0">
              <div className="text-sm text-muted-foreground mb-1">برآیند کل</div>
              <div className={`text-4xl font-bold tracking-tight ${tR > 0 ? 'text-emerald-500' : tR < 0 ? 'text-rose-500' : 'text-foreground'}`}>
                {profile.overallMetrics.totalR != null ? `${tR > 0 ? '+' : ''}${tR.toFixed(2)}R` : '—'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="درصد برد" value={`${profile.overallMetrics.winRate.toFixed(1)}٪`} icon={Target} />
        <MetricCard title="میانگین R" value={profile.overallMetrics.avgR != null ? `${profile.overallMetrics.avgR.toFixed(2)}R` : '—'} icon={Zap} />
        <MetricCard title="حداکثر افت (DD)" value={profile.maxDrawdown != null ? `-${profile.maxDrawdown.toFixed(2)}R` : '—'} icon={TrendingDown} trendClass="text-rose-500" />
        <MetricCard title="پایبندی به پلن" value={profile.avgAdherence != null ? `${profile.avgAdherence.toFixed(1)}/5` : '—'} icon={ShieldAlert} />
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Award className="w-6 h-6 text-amber-500" /> بینش‌های هوشمند
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {profile.coachingInsights.filter(i => !i.isRejected && !i.isIrrelevant).slice(0, 6).map(insight => (
            <InsightCard key={insight.id} insight={insight} onReject={() => onRejectInsight(insight.id, 'reject')} onIrrelevant={() => onRejectInsight(insight.id, 'irrelevant')} />
          ))}
          {profile.coachingInsights.filter(i => !i.isRejected && !i.isIrrelevant).length === 0 && (
            <div className="col-span-full p-8 text-center bg-muted/20 border border-border border-dashed rounded-xl text-muted-foreground">
              داده کافی برای تولید بینش‌های هوشمند جدید وجود ندارد یا همه موارد بررسی شده‌اند.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-8 pt-4">
        {renderStrengthGrid(profile.strengths, 'نقاط قوت', <ArrowUpRight className="w-5 h-5 text-emerald-500" />, 'text-emerald-500')}
        {renderStrengthGrid(profile.weaknesses, 'نقاط ضعف', <ArrowDownRight className="w-5 h-5 text-rose-500" />, 'text-rose-500')}
        {renderStrengthGrid(profile.watchlist, 'نیاز به توجه', <Eye className="w-5 h-5 text-amber-500" />, 'text-amber-500')}
      </div>
    </div>
  );
}

function BehaviorTab({ profile }: { profile: TraderProfileData }) {
  if (!profile.behavioralPatterns.length) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>الگوی رفتاری مشخصی هنوز در معاملات شما شناسایی نشده است.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <h2 className="text-xl font-bold">تحلیل الگوهای رفتاری</h2>
        <p className="text-muted-foreground text-sm mt-1">ردیابی رفتارها و تاثیر آنها بر نتایج معاملاتی</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {profile.behavioralPatterns.map(pattern => (
          <Card key={pattern.id} className="flex flex-col">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex justify-between items-start">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">{getBehaviorIcon(pattern.id)}</div>
                   <div>
                     <CardTitle className="text-base">{pattern.name}</CardTitle>
                     <CardDescription className="text-xs mt-0.5">{pattern.frequency} بار در {pattern.totalTrades} معامله</CardDescription>
                   </div>
                 </div>
                 <Badge variant="outline" className={`${BEHAVIOR_TREND_BG[pattern.trend]} ${BEHAVIOR_TREND_COLOR[pattern.trend]} border-transparent`}>
                   {BEHAVIOR_TREND_FA[pattern.trend]}
                 </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-5 flex-1">
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <div className="text-xs text-muted-foreground">نرخ بروز</div>
                   <div className="text-lg font-bold">{pattern.rate.toFixed(1)}٪</div>
                 </div>
                 <div className="space-y-1">
                   <div className="text-xs text-muted-foreground">تأثیر بر R</div>
                   <div className={`text-lg font-bold ${pattern.impactOnR != null && pattern.impactOnR < 0 ? 'text-rose-500' : pattern.impactOnR != null && pattern.impactOnR > 0 ? 'text-emerald-500' : ''}`}>
                     {pattern.impactOnR != null ? `${pattern.impactOnR > 0 ? '+' : ''}${pattern.impactOnR.toFixed(2)}R` : '—'}
                   </div>
                 </div>
              </div>
              
              <div className="space-y-3">
                 <div className="space-y-1.5">
                   <div className="text-xs text-muted-foreground flex justify-between">
                     <span>برد (با الگو)</span>
                     <span className="font-medium text-foreground">{pattern.winRateFlagged.toFixed(0)}٪</span>
                   </div>
                   <Progress value={pattern.winRateFlagged} className="h-2 bg-muted/50" />
                 </div>
                 <div className="space-y-1.5">
                   <div className="text-xs text-muted-foreground flex justify-between">
                     <span>برد (بدون الگو)</span>
                     <span className="font-medium text-foreground">{pattern.winRateNotFlagged.toFixed(0)}٪</span>
                   </div>
                   <Progress value={pattern.winRateNotFlagged} className="h-2 bg-muted/50" />
                 </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-border/50">
                 <div className="text-xs text-muted-foreground mb-3">روند زمانی (ابتدا تا انتها)</div>
                 <div className="flex items-end gap-2 h-14 w-full px-2">
                    {[pattern.earlyRate, pattern.middleRate, pattern.recentRate].map((r, i) => {
                      const max = Math.max(pattern.earlyRate??0, pattern.middleRate??0, pattern.recentRate??0, 1);
                      const h = r != null ? Math.max(10, (r / max) * 100) : 0;
                      return (
                        <div key={i} className="flex-1 bg-muted/30 rounded-t-md relative flex items-end justify-center" style={{ height: '100%' }}>
                           {r != null ? (
                             <div 
                               className={`w-full rounded-t-md transition-all ${i === 2 ? 'bg-primary' : 'bg-primary/40'}`}
                               style={{ height: `${h}%` }}
                             />
                           ) : (
                             <div className="w-full h-[2px] bg-muted-foreground/20" />
                           )}
                        </div>
                      );
                    })}
                 </div>
                 <div className="flex justify-between text-[10px] text-muted-foreground px-2 pt-1">
                   <span>دوره اول</span><span>میانی</span><span>اخیر</span>
                 </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PerformanceTab({ profile }: { profile: TraderProfileData }) {
  const chartData = useMemo(() => {
    return profile.edgeResult.classified
      .filter(t => t.status === 'closed' && t.rMultiple != null)
      .sort((a,b) => (a.closedAt || a.openedAt) - (b.closedAt || b.openedAt))
      .reduce((acc, t, i) => {
         const prevCum = i === 0 ? 0 : acc[i-1].cum;
         const cum = prevCum + t.rMultiple!;
         acc.push({ index: i+1, r: t.rMultiple, cum });
         return acc;
      }, [] as any[]);
  }, [profile]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <Card className="md:col-span-2">
           <CardHeader>
             <CardTitle className="text-base">توصیف روند عملکرد</CardTitle>
           </CardHeader>
           <CardContent>
             <p className="leading-relaxed text-sm md:text-base">{profile.performanceTrendDesc}</p>
           </CardContent>
         </Card>
         <Card>
           <CardHeader>
             <CardTitle className="text-base">وضعیت کلی روند</CardTitle>
           </CardHeader>
           <CardContent className="flex flex-col items-center justify-center py-4">
             <Badge variant="outline" className={`text-xl px-4 py-2 bg-primary/10 text-primary border-transparent`}>
               {PERF_TREND_FA[profile.performanceTrend]}
             </Badge>
           </CardContent>
         </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">منحنی تجمعی R</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="index" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}R`} />
              <RechartsTooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`${value.toFixed(2)}R`, 'تجمعی']}
                labelFormatter={(label) => `معامله #${label}`}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
              <Line type="stepAfter" dataKey="cum" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: 'hsl(var(--primary))' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">مقایسه دوره‌های عملکرد</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm text-right whitespace-nowrap">
            <thead className="text-muted-foreground border-b border-border/50">
              <tr>
                <th className="py-3 pr-2 font-medium">دوره</th>
                <th className="py-3 px-4 font-medium">معاملات</th>
                <th className="py-3 px-4 font-medium">درصد برد</th>
                <th className="py-3 px-4 font-medium">میانگین R</th>
                <th className="py-3 px-4 font-medium">فاکتور سود</th>
                <th className="py-3 pl-2 font-medium">پیروی از پلن</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {profile.periods.map((p, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="py-4 pr-2 font-medium">{p.label}</td>
                  <td className="py-4 px-4">{p.count}</td>
                  <td className="py-4 px-4">{p.winRate.toFixed(1)}٪</td>
                  <td className={`py-4 px-4 font-medium ${p.avgR != null && p.avgR > 0 ? 'text-emerald-500' : p.avgR != null && p.avgR < 0 ? 'text-rose-500' : ''}`}>{p.avgR != null ? `${p.avgR > 0 ? '+' : ''}${p.avgR.toFixed(2)}R` : '—'}</td>
                  <td className="py-4 px-4">{p.profitFactor != null ? p.profitFactor.toFixed(2) : '—'}</td>
                  <td className="py-4 pl-2">{p.avgAdherence != null ? `${p.avgAdherence.toFixed(1)}/5` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function EdgeTab({ profile }: { profile: TraderProfileData }) {
  return (
    <div className="space-y-8 animate-in fade-in">
      {(['session', 'symbol', 'direction'] as const).map(dimType => {
         const items = profile.edgeEvolution.filter(e => e.dimType === dimType);
         if (!items.length) return null;
         
         const typeLabels: any = { session: 'سشن‌ها', symbol: 'نمادها', direction: 'جهت معامله' };
         
         return (
           <div key={dimType} className="space-y-4">
             <h3 className="text-xl font-bold border-b border-border pb-2">{typeLabels[dimType]}</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map(item => (
                  <Card key={item.id} className="overflow-hidden">
                    <CardHeader className="bg-muted/30 pb-3">
                      <div className="flex justify-between items-center">
                         <div className="font-semibold text-lg">{item.dimLabel}</div>
                         <Badge variant="outline" className={`${EDGE_TREND_BG[item.trend]} ${EDGE_TREND_COLOR[item.trend]} border-transparent`}>
                            {EDGE_TREND_FA[item.trend]}
                         </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-2 divide-x divide-x-reverse divide-border">
                         <div className="p-4 space-y-3">
                            <div className="text-xs text-muted-foreground font-medium mb-1">تاریخچه کل ({item.fullCount} معامله)</div>
                            <div className="flex justify-between items-center text-sm">
                               <span className="text-muted-foreground">میانگین R</span>
                               <span className={`font-medium ${item.fullAvgR != null && item.fullAvgR > 0 ? 'text-emerald-500' : item.fullAvgR != null && item.fullAvgR < 0 ? 'text-rose-500' : ''}`}>{item.fullAvgR != null ? `${item.fullAvgR > 0 ? '+' : ''}${item.fullAvgR.toFixed(2)}R` : '—'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                               <span className="text-muted-foreground">درصد برد</span>
                               <span className="font-medium">{item.fullWinRate.toFixed(0)}٪</span>
                            </div>
                         </div>
                         
                         <div className="p-4 space-y-3 bg-primary/5">
                            <div className="text-xs text-primary font-medium mb-1">اخیراً ({item.recentCount} معامله)</div>
                            <div className="flex justify-between items-center text-sm">
                               <span className="text-muted-foreground">میانگین R</span>
                               <span className={`font-medium ${item.recentAvgR != null && item.recentAvgR > 0 ? 'text-emerald-500' : item.recentAvgR != null && item.recentAvgR < 0 ? 'text-rose-500' : ''}`}>{item.recentAvgR != null ? `${item.recentAvgR > 0 ? '+' : ''}${item.recentAvgR.toFixed(2)}R` : '—'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                               <span className="text-muted-foreground">درصد برد</span>
                               <span className="font-medium">{item.recentWinRate.toFixed(0)}٪</span>
                            </div>
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
             </div>
           </div>
         );
      })}
    </div>
  );
}

function StyleTab({ profile }: { profile: TraderProfileData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in">
      <div className="lg:col-span-5 space-y-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <UserCircle2 className="w-6 h-6 text-primary" /> گرایش‌های سبکی
        </h3>
        <div className="space-y-4">
          {profile.styleTendencies.filter(s => !s.isRejected).map(tendency => (
            <Card key={tendency.id}>
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-3">
                  <div className="font-semibold text-base">{tendency.title}</div>
                  <div className="text-xs font-mono bg-muted px-2 py-1 rounded">{tendency.score} / 100</div>
                </div>
                <Progress value={tendency.score} className="h-2 mb-4 bg-muted/50" />
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{tendency.description}</p>
                <div className="bg-muted/30 p-3 text-xs rounded-lg border border-border/50 text-muted-foreground">
                  <span className="font-medium text-foreground block mb-1">شواهد:</span>
                  {tendency.evidence}
                </div>
              </CardContent>
            </Card>
          ))}
          {profile.styleTendencies.filter(s => !s.isRejected).length === 0 && (
            <div className="p-6 text-center text-muted-foreground bg-muted/20 border border-dashed border-border rounded-xl">
              داده کافی برای تشخیص سبک معاملاتی وجود ندارد.
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-7 space-y-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <History className="w-6 h-6 text-primary" /> جدول زمانی تکامل
        </h3>
        <Card>
          <CardContent className="p-6 lg:p-8">
            <div className="relative border-r-2 border-border/50 space-y-8 pr-8 mr-2">
               {profile.developmentEvents.map((evt) => {
                 const typeColors: any = {
                   strength: 'bg-emerald-500', weakness: 'bg-rose-500', 
                   improvement: 'bg-blue-500', warning: 'bg-amber-500', style: 'bg-purple-500'
                 };
                 return (
                   <div key={evt.id} className="relative">
                     <div className={`absolute -right-[41px] w-4 h-4 rounded-full border-4 border-card shadow-sm ${typeColors[evt.type]}`} />
                     <Badge variant="secondary" className="mb-3 bg-muted">{evt.periodLabel}</Badge>
                     <h4 className="text-lg font-semibold mb-2">{evt.title}</h4>
                     <p className="text-sm text-muted-foreground leading-relaxed">{evt.description}</p>
                   </div>
                 );
               })}
               {profile.developmentEvents.length === 0 && (
                 <div className="text-muted-foreground">هنوز رویداد تکاملی ثبت نشده است.</div>
               )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CoachingTab({ profile, trades }: { profile: TraderProfileData; trades: Trade[] }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<ProfileNLAnswer | null>(null);
  const [checklistSymbol, setChecklistSymbol] = useState('');
  const [checklistSession, setChecklistSession] = useState('london');
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [postFeedback, setPostFeedback] = useState<PostTradeFeedback | null>(null);

  const closedTrades = useMemo(() =>
    trades.filter(t => t.status === 'closed')
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
      .slice(0, 30),
  [trades]);

  const handleGeneratePostFeedback = () => {
    const trade = closedTrades.find(t => t.id === selectedTradeId);
    if (!trade) { toast.error('لطفاً یک معامله انتخاب کنید'); return; }
    let tradeTags: string[] = [];
    try { tradeTags = JSON.parse(trade.tags || '[]'); } catch { tradeTags = []; }
    let review: { behaviorFlags?: string[]; slMoved?: boolean | null; closedEarly?: boolean | null } = {};
    try { review = JSON.parse(trade.postTradeReview || '{}'); } catch { review = {}; }
    const behaviorFlags: string[] = review.behaviorFlags ?? [];
    const slMoved = review.slMoved ?? false;
    const closedEarly = review.closedEarly ?? false;
    const fb = generatePostTradeFeedback(tradeTags, behaviorFlags, slMoved, closedEarly, profile);
    setPostFeedback(fb);
  };
  
  const handleAsk = (q: string) => {
    if (!q.trim()) return;
    setQuestion(q);
    const ans = answerProfileQuestion(q, profile);
    setAnswer(ans);
  };
  
  const handleGenerateChecklist = () => {
    if (!checklistSymbol) { toast.error('لطفاً یک نماد وارد کنید'); return; }
    const res = generatePreTradeChecklist(checklistSymbol, checklistSession, profile);
    setChecklist(res);
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* ردیف اول: پرسش و پاسخ + چک‌لیست پیش از معامله */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Card className="bg-card shadow-sm border-primary/20 relative overflow-hidden flex flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BrainCircuit className="w-6 h-6 text-primary" /> پرسش و پاسخ هوشمند
            </CardTitle>
            <CardDescription>از داده‌های تاریخی پروفایل خود بپرسید</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 flex-1 flex flex-col">
            <div className="flex gap-2">
              <Input
                placeholder="سوال خود را تایپ کنید..."
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAsk(question)}
                className="bg-background"
              />
              <Button onClick={() => handleAsk(question)}>
                <Send className="w-4 h-4 ml-2" /> بپرس
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {PROFILE_NL_QUESTIONS.map((q, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                  onClick={() => handleAsk(q)}
                >
                  {q}
                </Badge>
              ))}
            </div>
            {answer && (
              <div className="pt-2">
                <div className="p-5 bg-background rounded-xl border border-border shadow-sm animate-in slide-in-from-bottom-4">
                  <div className="font-medium text-foreground mb-4 flex items-start gap-3 leading-relaxed">
                    <div className="bg-primary/10 p-2 rounded-full shrink-0 text-primary mt-1"><Info className="w-4 h-4" /></div>
                    <span>{answer.answer}</span>
                  </div>
                  {answer.evidence.length > 0 && (
                    <div className="space-y-2 border-t border-border/50 pt-4">
                      <div className="text-xs text-muted-foreground font-medium mb-2">شواهد استنتاج:</div>
                      {answer.evidence.map((e, i) => (
                        <div key={i} className="flex justify-between text-xs bg-muted/30 p-2 rounded border border-border/50">
                          <span className="text-muted-foreground">{e.label}</span>
                          <span className="font-medium">{e.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={`text-xs mt-4 font-medium ${CONFIDENCE_COLOR[answer.confidence as keyof typeof CONFIDENCE_COLOR]}`}>
                    سطح اطمینان: {CONFIDENCE_FA[answer.confidence as keyof typeof CONFIDENCE_FA]}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ListChecks className="w-6 h-6 text-emerald-500" /> چک‌لیست پیش از معامله
            </CardTitle>
            <CardDescription>بر اساس نقاط ضعف و الگوهای رفتاری شما</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 flex-1 flex flex-col">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">نماد معاملاتی</label>
                <Input placeholder="مثلاً XAUUSD" value={checklistSymbol} onChange={e => setChecklistSymbol(e.target.value)} dir="ltr" className="text-left" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">سشن انتخابی</label>
                <Select value={checklistSession} onValueChange={setChecklistSession} dir="rtl">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asian">آسیا</SelectItem>
                    <SelectItem value="london">لندن</SelectItem>
                    <SelectItem value="newyork">نیویورک</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={handleGenerateChecklist}>
              تولید چک‌لیست اختصاصی
            </Button>
            {checklist && (
              <div className="space-y-3 animate-in slide-in-from-bottom-4">
                {checklist.map(item => (
                  <div key={item.id} className="flex items-start gap-3 p-4 bg-muted/20 rounded-xl border border-border shadow-sm">
                    <div className="mt-0.5">
                      {item.priority === 'high' ? <ShieldAlert className="w-5 h-5 text-rose-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    </div>
                    <div>
                      <div className="font-semibold text-sm mb-1">{item.question}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{item.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ردیف دوم: بازخورد پس از معامله */}
      <Card className="border-amber-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Target className="w-6 h-6 text-amber-500" /> بازخورد پس از معامله
          </CardTitle>
          <CardDescription>
            یک معامله بسته‌شده را انتخاب کنید تا کوچ تطبیقی بازخورد اختصاصی ارائه دهد
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3">
            <Select value={selectedTradeId} onValueChange={setSelectedTradeId} dir="rtl">
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="انتخاب معامله..." />
              </SelectTrigger>
              <SelectContent>
                {closedTrades.length === 0 && (
                  <SelectItem value="__none" disabled>هیچ معامله بسته‌ای یافت نشد</SelectItem>
                )}
                {closedTrades.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <span dir="ltr" className="font-mono">
                      {t.symbol} — {t.rMultiple !== null && t.rMultiple !== undefined ? `${t.rMultiple > 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R` : '—'}
                      {t.closedAt ? ` — ${new Date(t.closedAt).toLocaleDateString('fa-IR')}` : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleGeneratePostFeedback} className="shrink-0">
              <Zap className="w-4 h-4 ml-2 text-amber-400" /> دریافت بازخورد
            </Button>
          </div>

          {postFeedback && (
            <div className="animate-in slide-in-from-bottom-4 space-y-5 pt-2">
              {/* مشاهده کلی */}
              <div className="p-4 bg-muted/20 rounded-xl border border-border">
                <div className="flex items-start gap-3">
                  <BrainCircuit className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-sm mb-1">مشاهده کلی</div>
                    <div className="text-sm text-muted-foreground leading-relaxed">{postFeedback.overallObservation}</div>
                  </div>
                </div>
                <div className={`text-xs mt-3 font-medium ${CONFIDENCE_COLOR[postFeedback.confidence]}`}>
                  سطح اطمینان: {CONFIDENCE_FA[postFeedback.confidence]}
                </div>
              </div>

              {/* الگوهای رفتاری شناسایی‌شده */}
              {postFeedback.behaviorObservations.length > 0 && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Search className="w-4 h-4" /> الگوهای رفتاری شناسایی‌شده در این معامله
                  </div>
                  {postFeedback.behaviorObservations.map((obs, i) => (
                    <div key={i} className="p-4 bg-amber-950/20 border border-amber-500/25 rounded-xl flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-sm text-amber-300 mb-1">{obs.name}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">{obs.historicalImpact}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {postFeedback.behaviorObservations.length === 0 && (
                <div className="flex items-center gap-3 p-4 bg-emerald-950/20 border border-emerald-500/25 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span className="text-sm text-emerald-300">هیچ الگوی رفتاری منفی در این معامله شناسایی نشد.</span>
                </div>
              )}

              {/* یادداشت‌های تکمیلی */}
              {(postFeedback.slNote || postFeedback.entryTimingNote || postFeedback.similarTradesNote) && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Info className="w-4 h-4" /> یادداشت‌های تکمیلی
                  </div>
                  {postFeedback.slNote && (
                    <div className="p-3 bg-rose-950/20 border border-rose-500/25 rounded-lg text-sm text-rose-300 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />{postFeedback.slNote}
                    </div>
                  )}
                  {postFeedback.entryTimingNote && (
                    <div className="p-3 bg-blue-950/20 border border-blue-500/25 rounded-lg text-sm text-blue-300 flex items-start gap-2">
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" />{postFeedback.entryTimingNote}
                    </div>
                  )}
                  {postFeedback.similarTradesNote && (
                    <div className="p-3 bg-muted/30 border border-border rounded-lg text-sm text-muted-foreground flex items-start gap-2">
                      <Activity className="w-4 h-4 shrink-0 mt-0.5" />{postFeedback.similarTradesNote}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SnapshotsTab({ profile, snapshots, onReload }: { profile: TraderProfileData, snapshots: ProfileSnapshot[], onReload: () => void }) {
  const handleSave = async () => {
    try {
      const label = generateSnapshotLabel(profile.closedCount);
      await saveProfileSnapshotAutoManaged(label, JSON.stringify(profile), profile.tradeCount, profile.closedCount);
      toast.success('نسخه جدید از پروفایل ذخیره شد');
      onReload();
    } catch (e) {
      toast.error('خطا در ذخیره نسخه');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('آیا از حذف این نسخه مطمئن هستید؟')) return;
    await deleteProfileSnapshot(id);
    toast.success('نسخه با موفقیت حذف شد');
    onReload();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
           <h3 className="font-bold text-lg">ذخیره وضعیت فعلی پروفایل</h3>
           <p className="text-sm text-muted-foreground mt-1">با ذخیره کردن وضعیت فعلی، می‌توانید در آینده پیشرفت خود را با امروز مقایسه کنید.</p>
        </div>
        <Button onClick={handleSave} size="lg" className="w-full md:w-auto">
          <Save className="w-4 h-4 ml-2" /> ثبت نسخه جدید
        </Button>
      </div>

      <div className="space-y-4">
         <h4 className="font-semibold px-1 flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> تاریخچه نسخه‌ها ({snapshots.length})
         </h4>
         {snapshots.length === 0 ? (
           <div className="text-center py-16 bg-muted/20 rounded-xl border border-border border-dashed">
             <History className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
             <p className="text-muted-foreground">هنوز هیچ نسخه‌ای از پروفایل ذخیره نشده است.</p>
           </div>
         ) : (
           <div className="grid gap-3">
             {snapshots.map(snap => {
               const date = new Date(snap.createdAt).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
               return (
                 <Card key={snap.id} className="group transition-colors hover:border-primary/50">
                   <CardContent className="p-4 flex justify-between items-center">
                     <div>
                       <div className="font-semibold text-lg">{snap.label}</div>
                       <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1.5">
                         <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {date}</span>
                         <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {snap.closedCount} معامله بسته</span>
                       </div>
                     </div>
                     <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(snap.id)}>
                       <Trash2 className="w-5 h-5" />
                     </Button>
                   </CardContent>
                 </Card>
               );
             })}
           </div>
         )}
      </div>
    </div>
  );
}

function PrivacyTab({ corrections, onReload, profile }: { corrections: Record<string, InsightCorrection>, onReload: () => void, profile: TraderProfileData }) {
  const correctionKeys = Object.keys(corrections);

  const handleRestore = async (id: string) => {
    await deleteProfileCorrection(id);
    toast.success('بینش بازیابی شد و مجدداً در محاسبات لحاظ می‌شود');
    onReload();
  };

  const handleClearAll = async () => {
    if (confirm('آیا از پاک کردن تمامی تنظیمات حریم خصوصی و بازیابی همه بینش‌ها مطمئن هستید؟')) {
      await clearAllProfileCorrections();
      toast.success('تمام تنظیمات به حالت اولیه بازگشت');
      onReload();
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-in fade-in">
      <div className="md:col-span-4 space-y-6">
        <Card>
          <CardHeader>
             <CardTitle className="text-lg flex items-center gap-2">
               <Shield className="w-5 h-5 text-primary" /> کنترل بینش‌ها
             </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>شما کنترل کاملی بر بینش‌های تولید شده دارید. هر بینشی که به عنوان "نادرست" یا "بی‌ربط" علامت‌گذاری شود، در این لیست قرار می‌گیرد و دیگر در داشبورد شما نمایش داده نمی‌شود.</p>
            <p>در صورت نیاز می‌توانید هر مورد را بازیابی کنید تا مجدداً در داشبورد و ارزیابی‌های کوچینگ لحاظ شود.</p>
            
            <div className="pt-4 border-t border-border mt-6 space-y-3">
              <div className="flex justify-between items-center">
                <span>تعداد کل معاملات پردازش‌شده:</span>
                <Badge variant="secondary">{profile.tradeCount}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>تعداد بینش‌های پنهان‌شده:</span>
                <Badge variant="secondary">{correctionKeys.length} مورد</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="md:col-span-8 space-y-4">
         <div className="flex justify-between items-center mb-6">
           <h3 className="text-lg font-bold">لیست بینش‌های پنهان‌شده</h3>
           {correctionKeys.length > 0 && (
             <Button variant="outline" size="sm" onClick={handleClearAll} className="text-rose-500 hover:text-rose-600 border-rose-500/20 hover:bg-rose-500/10">
               بازیابی همه
             </Button>
           )}
         </div>

         {correctionKeys.length === 0 ? (
           <div className="text-center py-16 bg-muted/20 rounded-xl border border-border border-dashed">
              <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">هیچ بینشی پنهان یا رد نشده است.</p>
           </div>
         ) : (
           <div className="space-y-3">
             {correctionKeys.map(id => {
               const c = corrections[id];
               const date = new Date(c.correctedAt).toLocaleDateString('fa-IR');
               return (
                 <div key={id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 p-4 bg-card border border-border rounded-xl shadow-sm">
                   <div>
                     <Badge variant={c.action === 'reject' ? 'destructive' : 'secondary'} className="mb-2">
                       {c.action === 'reject' ? 'علامت‌گذاری به عنوان نادرست' : 'علامت‌گذاری به عنوان بی‌ربط'}
                     </Badge>
                     <div className="text-sm text-foreground mb-1">شناسه یکتای بینش: <code className="font-mono text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">{id}</code></div>
                     <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> مخفی شده در تاریخ: {date}</div>
                   </div>
                   <Button variant="secondary" size="sm" onClick={() => handleRestore(id)} className="shrink-0 w-full sm:w-auto">
                     <RotateCcw className="w-4 h-4 ml-2" /> بازیابی بینش
                   </Button>
                 </div>
               );
             })}
           </div>
         )}
      </div>
    </div>
  );
}

// ── Main Page Component ────────────────────────────────────────────────────

export default function TraderProfile() {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);
  const [corrections, setCorrections] = useState<Record<string, InsightCorrection>>({});
  const [snapshots, setSnapshots] = useState<ProfileSnapshot[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);

  const reloadCorrections = async () => {
    const data = await loadProfileCorrections();
    setCorrections(data);
  };

  const reloadSnapshots = async () => {
    const data = await loadProfileSnapshots();
    setSnapshots(data);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const t = await db.trades.toArray();
        const s = await db.strategies.toArray();
        setTrades(t);
        setStrategies(s);
        await reloadCorrections();
        await reloadSnapshots();
      } catch (err) {
        logger.error('خطا در بارگذاری داده‌ها', err);
        toast.error('خطا در بارگذاری داده‌ها از پایگاه داده');
      } finally {
        setIsLoadingDb(false);
      }
    };
    loadData();
  }, []);

  const handleRejectInsight = async (id: string, action: 'reject' | 'irrelevant') => {
    await saveProfileCorrection(id, action);
    toast.success(action === 'reject' ? 'بینش به عنوان نادرست پنهان شد' : 'بینش به عنوان بی‌ربط پنهان شد');
    await reloadCorrections();
  };

  const profile = useMemo(() => {
    if (!trades || !strategies) return null;
    const stratList = strategies.map(s => ({ id: s.id, name: s.name }));
    return computeTraderProfile(trades, stratList, 0, corrections);
  }, [trades, strategies, corrections]);

  if (isLoadingDb || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
           <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
           <span className="text-sm font-medium">در حال تحلیل داده‌ها و ساخت پروفایل رفتاری...</span>
        </div>
      </div>
    );
  }

  if (profile.closedCount < 5) {
    return (
      <div className="p-6 md:p-10 flex-1 max-w-2xl mx-auto w-full flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
         <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
           <UserCircle2 className="w-12 h-12 text-muted-foreground" />
         </div>
         <h2 className="text-2xl font-bold mb-3 text-foreground">پروفایل معامله‌گر شما در حال شکل‌گیری است</h2>
         <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
           برای دریافت بینش‌های شخصی‌سازی‌شده، الگوهای رفتاری و ساخت آینه تحلیلی دقیق، به حداقل ۵ معامله بسته‌شده نیاز دارید.
         </p>
         <div className="p-5 bg-card rounded-2xl border border-border w-full flex items-center justify-between shadow-sm">
            <span className="font-medium text-foreground">معاملات بسته‌شده فعلی:</span>
            <Badge variant="secondary" className="text-xl px-4 py-1.5">{profile.closedCount} / 5</Badge>
         </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1400px] space-y-8 animate-in fade-in duration-500" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-border/50">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-primary" />
            آینه تحلیلی من
          </h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">بازتابی از رفتار، عملکرد و تکامل شما در بازار</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className="px-4 py-1.5 text-sm bg-background border-border">
            <Activity className="w-4 h-4 ml-2 text-primary" />
            {profile.closedCount} معامله بسته
          </Badge>
          {profile.dateRange && (
            <Badge variant="outline" className="px-4 py-1.5 text-sm bg-background border-border">
              <CalendarDays className="w-4 h-4 ml-2 text-muted-foreground" />
              از {new Date(profile.dateRange.from).toLocaleDateString('fa-IR')}
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="dashboard" dir="rtl" className="w-full">
         <ScrollArea className="w-full pb-2">
           <TabsList className="w-max inline-flex h-12 items-center p-1 bg-muted/50 rounded-xl">
              <TabsTrigger value="dashboard" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">داشبورد کلان</TabsTrigger>
              <TabsTrigger value="behavior" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">الگوهای رفتاری</TabsTrigger>
              <TabsTrigger value="perf-evolution" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">تکامل عملکرد</TabsTrigger>
              <TabsTrigger value="edge-evolution" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">تکامل مزیت</TabsTrigger>
              <TabsTrigger value="style" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">سبک و توسعه</TabsTrigger>
              <TabsTrigger value="coaching" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">کوچینگ هوشمند</TabsTrigger>
              <TabsTrigger value="snapshots" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">نسخه‌ها</TabsTrigger>
              <TabsTrigger value="privacy" className="px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">حریم خصوصی</TabsTrigger>
           </TabsList>
           <ScrollBar orientation="horizontal" className="invisible" />
         </ScrollArea>
         
         <div className="mt-6">
           <TabsContent value="dashboard" className="m-0"><DashboardTab profile={profile} onRejectInsight={handleRejectInsight} /></TabsContent>
           <TabsContent value="behavior" className="m-0"><BehaviorTab profile={profile} /></TabsContent>
           <TabsContent value="perf-evolution" className="m-0"><PerformanceTab profile={profile} /></TabsContent>
           <TabsContent value="edge-evolution" className="m-0"><EdgeTab profile={profile} /></TabsContent>
           <TabsContent value="style" className="m-0"><StyleTab profile={profile} /></TabsContent>
           <TabsContent value="coaching" className="m-0"><CoachingTab profile={profile} trades={trades ?? []} /></TabsContent>
           <TabsContent value="snapshots" className="m-0"><SnapshotsTab profile={profile} snapshots={snapshots} onReload={reloadSnapshots} /></TabsContent>
           <TabsContent value="privacy" className="m-0"><PrivacyTab corrections={corrections} profile={profile} onReload={reloadCorrections} /></TabsContent>
         </div>
      </Tabs>
    </div>
  );
}
