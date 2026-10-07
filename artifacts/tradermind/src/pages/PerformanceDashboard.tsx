/**
 * PerformanceDashboard.tsx — Offline Personal Trading Performance & Behavioral Analytics Engine
 * Prompt 25 — Mobile-first, fully offline, all analytics from local trade data
 */
import { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '../components/ui/skeleton';
import {
  BarChart3, Activity, Target, ShieldCheck, TrendingUp, TrendingDown,
  Calendar, Clock, Layers, Lightbulb, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Star, Flame, Bookmark, X, RefreshCw,
  Award, BarChart2, Users, BookOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { db } from '../db/database';
import type { Trade } from '../db/database';
import {
  calcBaseMetrics, getPerformanceProfile, getByDay, getByHour, getBySession,
  getBySymbol, getBySetup, getBestCombos, getProcessQuality, detectMistakes,
  detectStrengths, getOvertradingAnalysis, getTradingStyle, getEvolution,
  getPerfInsights, getScorecard, getReviewPeriods, generateReview,
  getDecisionQualityAnalysis, getSessionDiscipline, getBehavioralTimeline,
  getLearningProgress,
} from '../services/performanceService';
import type {
  BaseMetrics, PerformanceProfile, DayPerf, SessionPerf, SymbolPerf,
  SetupPerf, ComboPerf, PerfInsight, Scorecard, BehaviorPattern,
  DecisionQualityAnalysis, SessionDisciplineData, BehavioralTimelineEntry,
  LessonTrackEntry,
} from '../services/performanceService';
import { getPostLossBehavior, getPostWinBehavior } from '../services/riskService';
import { useAppStore } from '../store/useAppStore';

// ─────────────────────────────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────────────────────────────
function pct(v: number | null, dec = 1) { return v !== null ? `${(v * 100).toFixed(dec)}%` : '—'; }
function r(v: number | null, dec = 2) { return v !== null ? `${v >= 0 ? '+' : ''}${v.toFixed(dec)}R` : '—'; }
function num(v: number | null, dec = 2) { return v !== null ? v.toFixed(dec) : '—'; }
function moneyStr(v: number | null) {
  if (v === null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

function SmallSampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full shrink-0">
      <AlertTriangle className="w-3 h-3" />نمونه کم
    </span>
  );
}

function StatRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold tabular-nums ${color ?? ''}`}>{value}</span>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
      </div>
      <p className={`text-xl font-bold tabular-nums ${color ?? ''}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BaseMetricsGrid({ m }: { m: BaseMetrics }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <MetricCard label="معاملات" value={m.count.toString()} />
      <MetricCard label="نرخ برد" value={pct(m.winRate)} color={m.winRate !== null && m.winRate >= 0.5 ? 'text-green-500' : 'text-destructive'} />
      <MetricCard label="R میانگین" value={r(m.avgR)} color={m.avgR !== null && m.avgR > 0 ? 'text-green-500' : m.avgR !== null ? 'text-destructive' : ''} />
      <MetricCard label="انتظار" value={r(m.expectancy)} color={m.expectancy !== null && m.expectancy > 0 ? 'text-green-500' : m.expectancy !== null ? 'text-destructive' : ''} />
    </div>
  );
}

function WinLossBar({ win, loss, be }: { win: number; loss: number; be: number }) {
  const total = win + loss + be;
  if (total === 0) return null;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
      <div className="bg-green-500" style={{ width: `${(win / total) * 100}%` }} title={`برد: ${win}`} />
      <div className="bg-muted/40" style={{ width: `${(be / total) * 100}%` }} title={`سربه‌سر: ${be}`} />
      <div className="bg-destructive/70" style={{ width: `${(loss / total) * 100}%` }} title={`ضرر: ${loss}`} />
    </div>
  );
}

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const colors: Record<string, string> = { 'A': 'bg-green-500/10 text-green-500', 'B': 'bg-primary/10 text-primary', 'C': 'bg-amber-500/10 text-amber-500', 'D': 'bg-orange-500/10 text-orange-500', 'F': 'bg-destructive/10 text-destructive', 'N/A': 'bg-muted/30 text-muted-foreground' };
  return (
    <div className={`rounded-2xl p-5 text-center ${colors[grade] ?? colors['N/A']}`}>
      <p className="text-xs text-muted-foreground mb-1">امتیاز</p>
      <p className="text-5xl font-bold tabular-nums">{score.toFixed(0)}</p>
      <p className="text-lg font-semibold mt-1">درجه {grade}</p>
      <p className="text-xs text-muted-foreground mt-1">از ۱۰۰</p>
    </div>
  );
}

function BehaviorChip({ pattern }: { pattern: BehaviorPattern }) {
  const isStrength = pattern.type === 'strength';
  const severity = pattern.severity;
  const color = isStrength ? 'bg-green-500/10 border-green-500/20 text-green-500'
    : severity === 'high' ? 'bg-destructive/10 border-destructive/20 text-destructive'
    : severity === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
    : 'bg-muted/20 border-border text-muted-foreground';
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isStrength ? <Star className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          <p className="text-sm font-medium">{pattern.title}</p>
        </div>
        <span className="text-xs font-medium tabular-nums shrink-0">{Math.round(pattern.pct * 100)}%</span>
      </div>
      <p className="text-xs mt-1 opacity-80">{pattern.description}</p>
      {pattern.avgOutcome !== null && (
        <p className="text-xs mt-1 font-medium">{r(pattern.avgOutcome)} میانگین نتیجه</p>
      )}
    </div>
  );
}

const TAB_LIST = [
  { id: 'overview', label: 'داشبورد', icon: BarChart3 },
  { id: 'breakdown', label: 'تفکیک زمانی', icon: Clock },
  { id: 'instruments', label: 'نماد/سبک', icon: Layers },
  { id: 'behavior', label: 'رفتار', icon: Activity },
  { id: 'evolution', label: 'تحول', icon: TrendingUp },
  { id: 'style', label: 'سبک معاملاتی', icon: Users },
  { id: 'insights', label: 'بینش‌ها', icon: Lightbulb },
] as const;
type TabId = typeof TAB_LIST[number]['id'];

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export default function PerformanceDashboard() {
  const tradingTimeMode = useAppStore(s => s.tradingTimeMode);
  const brokerUtcOffsetMinutes = useAppStore(s => s.brokerUtcOffsetMinutes);
  const [tab, setTab] = useState<TabId>('overview');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'all' | '3m' | '6m' | '1y'>('all');
  const [evGranularity, setEvGranularity] = useState<'week' | 'month'>('month');
  const [overtradingThreshold, setOvertradingThreshold] = useState(3);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem('perf_dismissed_insights') ?? '[]'))
  );
  const [reviewPeriod, setReviewPeriod] = useState<string>('');
  const [reviewType, setReviewType] = useState<'weekly' | 'monthly'>('monthly');
  const [reviewNotes, setReviewNotes] = useState('');
  const [knowledgeNotes, setKnowledgeNotes] = useState<any[]>([]);
  const [preferredSessions, setPreferredSessions] = useState<string[]>(
    () => JSON.parse(localStorage.getItem('perf_preferred_sessions') ?? '["london","overlap"]')
  );
  const [timelineGranularity, setTimelineGranularity] = useState<'week' | 'month'>('month');

  useEffect(() => {
    Promise.all([
      db.trades.toArray(),
      db.knowledgeNotes.where('isRule').equals(1).toArray().catch(() => []),
    ]).then(([t, kn]) => {
      setTrades(t);
      setKnowledgeNotes(kn);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (timeRange === 'all') return trades;
    const now = Date.now();
    const ms = { '3m': 90, '6m': 180, '1y': 365 }[timeRange] * 86400000;
    return trades.filter(t => t.openedAt >= now - ms);
  }, [trades, timeRange, tradingTimeMode, brokerUtcOffsetMinutes]);

  const profile = useMemo(() => getPerformanceProfile(filtered), [filtered]);
  const scorecard = useMemo(() => getScorecard(filtered), [filtered]);
  const processQ = useMemo(() => getProcessQuality(filtered), [filtered]);
  const byDay = useMemo(() => getByDay(filtered), [filtered, tradingTimeMode, brokerUtcOffsetMinutes]);
  const byHour = useMemo(() => getByHour(filtered), [filtered, tradingTimeMode, brokerUtcOffsetMinutes]);
  const bySession = useMemo(() => getBySession(filtered), [filtered, tradingTimeMode, brokerUtcOffsetMinutes]);
  const bySymbol = useMemo(() => getBySymbol(filtered), [filtered]);
  const bySetup = useMemo(() => getBySetup(filtered), [filtered]);
  const combos = useMemo(() => getBestCombos(filtered), [filtered]);
  const mistakes = useMemo(() => detectMistakes(filtered), [filtered]);
  const strengths = useMemo(() => detectStrengths(filtered), [filtered]);
  const overtradingData = useMemo(() => getOvertradingAnalysis(filtered, overtradingThreshold), [filtered, overtradingThreshold]);
  const tradingStyle = useMemo(() => getTradingStyle(filtered), [filtered]);
  const evolution = useMemo(() => getEvolution(filtered, evGranularity), [filtered, evGranularity]);
  const insights = useMemo(() => getPerfInsights(filtered), [filtered]);
  const postLoss = useMemo(() => getPostLossBehavior(filtered), [filtered]);
  const postWin = useMemo(() => getPostWinBehavior(filtered), [filtered]);
  const reviewPeriods = useMemo(() => getReviewPeriods(trades, reviewType), [trades, reviewType]);
  const decisionQuality = useMemo(() => getDecisionQualityAnalysis(filtered), [filtered]);
  const sessionDiscipline = useMemo(() => getSessionDiscipline(filtered, preferredSessions), [filtered, preferredSessions]);
  const behavioralTimeline = useMemo(() => getBehavioralTimeline(filtered, timelineGranularity), [filtered, timelineGranularity]);
  const rules = useMemo(() => knowledgeNotes.filter((n: any) => n.isRule), [knowledgeNotes]);
  const learningProgress = useMemo(
    () => getLearningProgress(trades, rules.map((n: any) => ({ id: n.id, title: n.title, createdAt: n.createdAt }))),
    [trades, rules]
  );
  const currentReview = useMemo(() => {
    const key = reviewPeriod || reviewPeriods[0];
    if (!key) return null;
    return generateReview(trades, key, reviewType);
  }, [trades, reviewPeriod, reviewPeriods, reviewType]);

  const approveInsight = async (ins: PerfInsight) => {
    const note = {
      id: `perf_insight_${ins.id}_${Date.now()}`,
      title: ins.title, content: `${ins.description}\n\nشواهد: ${ins.evidence}`,
      category: 'ai-insights' as const, importance: (ins.confidence === 'high' ? 'high' : 'medium') as import('../db/database').NoteImportance,
      color: ins.category === 'warning' ? '#ef4444' : '#22c55e',
      tags: '["عملکرد","بینش"]', relatedSymbols: '[]', relatedSetups: '[]',
      relatedStrategies: '[]', relatedSessions: '[]', relatedMarketRegimes: '[]',
      relatedTimeframes: '[]', relatedDays: '[]', source: 'ai-generated' as const,
      status: 'active' as const, isActive: true, isPinned: false, isRule: true,
      reviewCount: 0, lastReviewedAt: null, nextReviewAt: null,
      reviewFrequency: 'monthly' as const, userFeedback: null, evidence: null,
      requireConfirmation: false, snoozedUntil: null, createdAt: Date.now(), updatedAt: Date.now(),
    };
    await db.knowledgeNotes.add(note);
    toast.success('بینش به‌عنوان قانون ذخیره شد');
  };

  const dismissInsight = (id: string) => {
    const next = new Set(dismissedInsights).add(id);
    setDismissedInsights(next);
    localStorage.setItem('perf_dismissed_insights', JSON.stringify([...next]));
  };

  if (loading) return (
    <div className="space-y-4 p-4 animate-in fade-in duration-300">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/50 px-4 py-3 -mx-4 -mt-4 mb-4">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );

  const noData = filtered.filter(t => t.status === 'closed').length === 0;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/50 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-primary shrink-0" />
            <div>
              <h1 className="text-base font-bold leading-tight">تحلیل عملکرد</h1>
              <p className="text-xs text-muted-foreground">{filtered.filter(t => t.status === 'closed').length} معامله بسته‌شده تحلیل شد</p>
            </div>
          </div>
          <Select value={timeRange} onValueChange={v => setTimeRange(v as typeof timeRange)}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه</SelectItem>
              <SelectItem value="3m">۳ ماه</SelectItem>
              <SelectItem value="6m">۶ ماه</SelectItem>
              <SelectItem value="1y">۱ سال</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="max-w-5xl mx-auto mt-2 flex gap-1 overflow-x-auto scrollbar-hide pb-0.5">
          {TAB_LIST.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/30'}`}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">

        {/* ══ TAB: OVERVIEW ══ */}
        {tab === 'overview' && (
          <div className="space-y-5">
            {noData && (
              <div className="text-center py-16">
                <BarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">هیچ معامله بسته‌ای در این بازه یافت نشد</p>
                <p className="text-xs text-muted-foreground/60 mt-1">معاملات را ثبت کنید تا تحلیل عملکرد آغاز شود</p>
              </div>
            )}
            {!noData && <>
              {/* Profile snapshot */}
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Award className="w-4 h-4 text-primary" />پروفایل عملکرد شخصی</CardTitle>
                  <CardDescription className="text-xs">{profile.dateRange} — {profile.count} معامله</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <BaseMetricsGrid m={profile} />
                  <WinLossBar win={profile.winCount} loss={profile.lossCount} be={profile.breakEvenCount} />
                  <div className="text-xs text-muted-foreground flex gap-3">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full inline-block" />برد {profile.winCount}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-muted/40 rounded-full inline-block" />سربه‌سر {profile.breakEvenCount}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-destructive/70 rounded-full inline-block" />ضرر {profile.lossCount}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    <StatRow label="R میانگین برد" value={r(profile.avgWin)} color="text-green-500" />
                    <StatRow label="R میانگین ضرر" value={r(profile.avgLoss)} color="text-destructive" />
                    <StatRow label="ضریب سود" value={profile.profitFactor !== null ? profile.profitFactor.toFixed(2) : '—'} color={profile.profitFactor !== null && profile.profitFactor >= 1.5 ? 'text-green-500' : ''} />
                    <StatRow label="بیشترین افت" value={profile.maxDrawdownPct !== null ? `-${profile.maxDrawdownPct.toFixed(1)}%` : '—'} color="text-destructive" />
                    <StatRow label="تکرار معامله" value={profile.tradeFrequency !== null ? `${profile.tradeFrequency.toFixed(1)}/هفته` : '—'} />
                    <StatRow label="میانگین نگهداری" value={profile.holdingTimeAvgMin !== null ? (profile.holdingTimeAvgMin < 60 ? `${profile.holdingTimeAvgMin.toFixed(0)}دقیقه` : `${(profile.holdingTimeAvgMin/60).toFixed(1)}ساعت`) : '—'} />
                    <StatRow label="نرخ ریویو" value={profile.reviewRate !== null ? `${(profile.reviewRate * 100).toFixed(0)}%` : '—'} />
                    <StatRow label="ریسک میانگین" value={profile.avgRisk !== null ? `${profile.avgRisk.toFixed(2)}%` : '—'} />
                    <StatRow label="ثبات ریسک (CV)" value={profile.riskConsistency !== null ? `${(profile.riskConsistency * 100).toFixed(0)}%` : '—'} color={profile.riskConsistency !== null && profile.riskConsistency < 0.3 ? 'text-green-500' : ''} />
                  </div>
                  {profile.sampleWarning && <SmallSampleBadge />}
                </CardContent>
              </Card>

              {/* Scorecard */}
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />کارنامه شفاف عملکرد</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <GradeBadge grade={scorecard.grade} score={scorecard.total} />
                    <div className="sm:col-span-2 space-y-2">
                      {scorecard.components.map(c => (
                        <div key={c.label} className="space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{c.label}</span>
                            <span className="font-medium tabular-nums">{c.score}/100</span>
                          </div>
                          <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${c.score >= 70 ? 'bg-green-500' : c.score >= 50 ? 'bg-primary' : 'bg-amber-500'}`} style={{ width: `${c.score}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{c.details}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {scorecard.sampleWarning && <SmallSampleBadge />}
                </CardContent>
              </Card>

              {/* Process Quality */}
              {processQ.reviewedCount > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" />کیفیت پروسه معامله‌گری</CardTitle>
                    <CardDescription className="text-xs">بر اساس {processQ.reviewedCount} ریویو تکمیل‌شده</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-3">
                      <GradeBadge grade={processQ.grade} score={processQ.total} />
                      <div className="flex-1 space-y-1.5">
                        {processQ.components.slice(0, 5).map(c => (
                          <div key={c.label} className="space-y-0.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate">{c.label}</span>
                              <span className="font-medium tabular-nums shrink-0 ml-2">{c.score}/100</span>
                            </div>
                            <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${c.score >= 70 ? 'bg-green-500' : c.score >= 50 ? 'bg-amber-500' : 'bg-destructive'}`} style={{ width: `${c.score}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {processQ.sampleWarning && <SmallSampleBadge />}
                  </CardContent>
                </Card>
              )}
            </>}
          </div>
        )}

        {/* ══ TAB: BREAKDOWN ══ */}
        {tab === 'breakdown' && (
          <div className="space-y-5">
            {/* By Day */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4" />عملکرد بر اساس روز هفته</CardTitle></CardHeader>
              <CardContent>
                {byDay.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">داده کافی نیست</p> : (
                  <div className="space-y-3">
                    {byDay.map(d => (
                      <div key={d.dayNum} className="rounded-xl border border-border bg-muted/5 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold">{d.dayName}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{d.count} معامله</span>
                            {d.sampleWarning && <SmallSampleBadge />}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><p className="text-muted-foreground">نرخ برد</p><p className={`font-semibold tabular-nums ${(d.winRate ?? 0) >= 0.5 ? 'text-green-500' : 'text-destructive'}`}>{pct(d.winRate)}</p></div>
                          <div><p className="text-muted-foreground">R میانگین</p><p className={`font-semibold tabular-nums ${(d.avgR ?? 0) > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(d.avgR)}</p></div>
                          <div><p className="text-muted-foreground">انتظار</p><p className="font-semibold tabular-nums">{r(d.expectancy)}</p></div>
                        </div>
                        <WinLossBar win={d.winCount} loss={d.lossCount} be={d.breakEvenCount} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Hour */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />عملکرد بر اساس ساعت (UTC)</CardTitle></CardHeader>
              <CardContent>
                {byHour.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">داده کافی نیست</p> : (
                  <div className="space-y-2">
                    {byHour.sort((a, b) => (b.avgR ?? -99) - (a.avgR ?? -99)).slice(0, 12).map(h => (
                      <div key={h.hour} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20 shrink-0">{h.label}</span>
                        <div className="flex-1 h-5 bg-muted/20 rounded overflow-hidden">
                          <div className={`h-full rounded ${(h.avgR ?? 0) > 0 ? 'bg-green-500/60' : 'bg-destructive/60'}`}
                            style={{ width: `${Math.min(100, Math.abs(h.avgR ?? 0) * 30 + 5)}%` }} />
                        </div>
                        <span className={`text-xs font-medium tabular-nums w-16 text-right ${(h.avgR ?? 0) > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(h.avgR)}</span>
                        <span className="text-xs text-muted-foreground w-12 text-right">{h.count} معامله</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Session */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Flame className="w-4 h-4 text-amber-500" />عملکرد بر اساس سشن</CardTitle></CardHeader>
              <CardContent>
                {bySession.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">داده کافی نیست</p> : (
                  <div className="space-y-3">
                    {bySession.map(s => (
                      <div key={s.session} className="rounded-xl border border-border bg-muted/5 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold">{s.label}</p>
                          <div className="flex items-center gap-2">{s.sampleWarning && <SmallSampleBadge />}<span className="text-xs text-muted-foreground">{s.count} معامله</span></div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><p className="text-muted-foreground">نرخ برد</p><p className={`font-semibold ${(s.winRate ?? 0) >= 0.5 ? 'text-green-500' : 'text-destructive'}`}>{pct(s.winRate)}</p></div>
                          <div><p className="text-muted-foreground">R میانگین</p><p className={`font-semibold ${(s.avgR ?? 0) > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(s.avgR)}</p></div>
                          <div><p className="text-muted-foreground">انتظار</p><p className="font-semibold">{r(s.expectancy)}</p></div>
                          <div><p className="text-muted-foreground">سبک برتر</p><p className="font-semibold truncate">{s.topSetup ?? '—'}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Session Discipline Analysis ── */}
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />انضباط سشن — ترجیحی vs واقعی
                  </CardTitle>
                  <CardDescription className="text-xs">سشن‌های ترجیحی خود را انتخاب کنید</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Preferred session picker */}
                {(() => {
                  const ALL_SESSIONS = [
                    { id: 'sydney', label: 'سیدنی' }, { id: 'tokyo', label: 'توکیو' },
                    { id: 'london', label: 'لندن' }, { id: 'new_york', label: 'نیویورک' },
                    { id: 'overlap', label: 'اورلپ' }, { id: 'pre_market', label: 'پیش‌بازار' },
                    { id: 'other', label: 'سایر' },
                  ];
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_SESSIONS.map(s => (
                        <button key={s.id} onClick={() => {
                          const next = preferredSessions.includes(s.id)
                            ? preferredSessions.filter(x => x !== s.id)
                            : [...preferredSessions, s.id];
                          setPreferredSessions(next);
                          localStorage.setItem('perf_preferred_sessions', JSON.stringify(next));
                        }} className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                          preferredSessions.includes(s.id)
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'bg-muted/10 border-border text-muted-foreground'
                        }`}>{s.label}</button>
                      ))}
                    </div>
                  );
                })()}
                {sessionDiscipline.breakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">معامله با سشن ثبت نشده</p>
                ) : (
                  <>
                    {preferredSessions.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`rounded-xl p-3 border ${sessionDiscipline.avgRInside !== null && (sessionDiscipline.avgRInside ?? 0) > (sessionDiscipline.avgROutside ?? 0) ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/5'}`}>
                          <p className="text-[10px] text-muted-foreground mb-1">سشن‌های ترجیحی</p>
                          <p className="text-lg font-bold tabular-nums">{sessionDiscipline.tradesInside}</p>
                          <p className="text-[10px] text-muted-foreground">معامله ({sessionDiscipline.pctInside !== null ? `${(sessionDiscipline.pctInside * 100).toFixed(0)}%` : '—'})</p>
                          {sessionDiscipline.avgRInside !== null && (
                            <p className={`text-xs font-semibold mt-1 ${sessionDiscipline.avgRInside > 0 ? 'text-green-500' : 'text-destructive'}`}>
                              {r(sessionDiscipline.avgRInside)} میانگین R
                            </p>
                          )}
                        </div>
                        <div className={`rounded-xl p-3 border ${sessionDiscipline.avgROutside !== null && (sessionDiscipline.avgROutside ?? 0) > (sessionDiscipline.avgRInside ?? 0) ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/5'}`}>
                          <p className="text-[10px] text-muted-foreground mb-1">خارج از ترجیحی</p>
                          <p className="text-lg font-bold tabular-nums">{sessionDiscipline.tradesOutside}</p>
                          <p className="text-[10px] text-muted-foreground">معامله</p>
                          {sessionDiscipline.avgROutside !== null && (
                            <p className={`text-xs font-semibold mt-1 ${sessionDiscipline.avgROutside > 0 ? 'text-green-500' : 'text-destructive'}`}>
                              {r(sessionDiscipline.avgROutside)} میانگین R
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {sessionDiscipline.breakdown.map(s => (
                        <div key={s.session} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-lg ${s.isPreferred ? 'bg-primary/5' : ''}`}>
                          <div className="flex items-center gap-2">
                            {s.isPreferred && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                            <span className={s.isPreferred ? 'font-medium' : 'text-muted-foreground'}>{s.label}</span>
                            {s.sampleWarning && <SmallSampleBadge />}
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span>{s.count} معامله</span>
                            {s.winRate !== null && <span>{pct(s.winRate)} برد</span>}
                            {s.avgR !== null && (
                              <span className={`font-semibold ${s.avgR > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(s.avgR)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ TAB: INSTRUMENTS ══ */}
        {tab === 'instruments' && (
          <div className="space-y-5">
            {/* By Symbol */}
            <Card>
              <CardHeader><CardTitle className="text-sm">عملکرد بر اساس نماد</CardTitle></CardHeader>
              <CardContent>
                {bySymbol.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">داده کافی نیست</p> : (
                  <div className="space-y-3">
                    {bySymbol.map(s => (
                      <div key={s.symbol} className="rounded-xl border border-border bg-muted/5 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm">{s.symbol}</span>
                            {s.sampleWarning && <SmallSampleBadge />}
                          </div>
                          <span className="text-xs text-muted-foreground">{s.count} معامله</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                          <div><p className="text-muted-foreground">نرخ برد</p><p className={`font-semibold ${(s.winRate ?? 0) >= 0.5 ? 'text-green-500' : 'text-destructive'}`}>{pct(s.winRate)}</p></div>
                          <div><p className="text-muted-foreground">R میانگین</p><p className={`font-semibold ${(s.avgR ?? 0) > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(s.avgR)}</p></div>
                          <div><p className="text-muted-foreground">انتظار</p><p className="font-semibold">{r(s.expectancy)}</p></div>
                          <div><p className="text-muted-foreground">بهترین سبک</p><p className="font-semibold truncate">{s.bestSetup ?? '—'}</p></div>
                          <div><p className="text-muted-foreground">بهترین سشن</p><p className="font-semibold truncate">{s.bestSession ?? '—'}</p></div>
                        </div>
                        <WinLossBar win={s.winCount} loss={s.lossCount} be={s.breakEvenCount} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Setup */}
            <Card>
              <CardHeader><CardTitle className="text-sm">عملکرد بر اساس سبک معاملاتی</CardTitle></CardHeader>
              <CardContent>
                {bySetup.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">داده کافی نیست</p> : (
                  <div className="space-y-3">
                    {bySetup.map(s => (
                      <div key={s.setup} className="rounded-xl border border-border bg-muted/5 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{s.label}</span>
                            {s.sampleWarning && <SmallSampleBadge />}
                          </div>
                          <span className="text-xs text-muted-foreground">{s.count} معامله</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><p className="text-muted-foreground">نرخ برد</p><p className={`font-semibold ${(s.winRate ?? 0) >= 0.5 ? 'text-green-500' : 'text-destructive'}`}>{pct(s.winRate)}</p></div>
                          <div><p className="text-muted-foreground">R میانگین</p><p className={`font-semibold ${(s.avgR ?? 0) > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(s.avgR)}</p></div>
                          <div><p className="text-muted-foreground">انتظار</p><p className="font-semibold">{r(s.expectancy)}</p></div>
                          <div><p className="text-muted-foreground">سشن برتر</p><p className="font-semibold truncate">{s.topSession ?? '—'}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Best Combos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-primary" />ترکیب‌های برتر چندبعدی</CardTitle>
                <CardDescription className="text-xs">نماد + سبک + سشن — بر اساس R میانگین</CardDescription>
              </CardHeader>
              <CardContent>
                {combos.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">حداقل ۳ معامله در هر ترکیب لازم است</p> : (
                  <div className="space-y-2">
                    {combos.slice(0, 10).map((c, i) => (
                      <div key={c.key} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{c.label}</p>
                          <p className="text-xs text-muted-foreground">{c.count} معامله | نرخ برد: {pct(c.winRate)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold tabular-nums ${(c.avgR ?? 0) > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(c.avgR)}</p>
                          {c.sampleWarning && <SmallSampleBadge />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ TAB: BEHAVIOR ══ */}
        {tab === 'behavior' && (
          <div className="space-y-5">
            {/* Mistakes */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" />اشتباهات تکراری</CardTitle>
                <CardDescription className="text-xs">الگوهای شناسایی‌شده در تاریخچه معاملات</CardDescription>
              </CardHeader>
              <CardContent>
                {mistakes.length === 0 ? (
                  <div className="text-center py-6"><CheckCircle2 className="w-8 h-8 text-green-500/40 mx-auto mb-2" /><p className="text-sm text-muted-foreground">اشتباه تکراری شناسایی نشد</p></div>
                ) : (
                  <div className="space-y-2">{mistakes.map(m => <BehaviorChip key={m.id} pattern={m} />)}</div>
                )}
              </CardContent>
            </Card>

            {/* Strengths */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />نقاط قوت تکراری</CardTitle></CardHeader>
              <CardContent>
                {strengths.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">حداقل ۵ معامله با ریویو کامل لازم است</p>
                ) : (
                  <div className="space-y-2">{strengths.map(s => <BehaviorChip key={s.id} pattern={s} />)}</div>
                )}
              </CardContent>
            </Card>

            {/* Post-Loss / Post-Win */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4 text-destructive" />رفتار پس از ضرر</CardTitle></CardHeader>
                <CardContent>
                  {postLoss.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">داده کافی نیست</p> : (
                    <div className="space-y-1">
                      {postLoss.slice(0, 4).map(p => (
                        <StatRow key={p.label} label={p.label}
                          value={`${p.avgRiskAfter?.toFixed(2) ?? '—'}%`}
                          sub={`معمول: ${p.avgRiskBefore?.toFixed(2) ?? '—'}% | n=${p.examples}`}
                          color={p.avgRiskAfter !== null && p.avgRiskBefore !== null && p.avgRiskAfter > p.avgRiskBefore * 1.1 ? 'text-destructive' : ''} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" />رفتار پس از برد</CardTitle></CardHeader>
                <CardContent>
                  {postWin.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">داده کافی نیست</p> : (
                    <div className="space-y-1">
                      {postWin.slice(0, 4).map(p => (
                        <StatRow key={p.label} label={p.label}
                          value={`${p.avgRiskAfter?.toFixed(2) ?? '—'}%`}
                          sub={`معمول: ${p.avgRiskBefore?.toFixed(2) ?? '—'}% | n=${p.examples}`} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Decision Quality Analysis ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />کیفیت تصمیم — جدا از نتیجه مالی
                </CardTitle>
                <CardDescription className="text-xs">آیا تصمیم‌های با کیفیت بالاتر نتایج بهتری می‌آورند؟</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {decisionQuality.sampleWarning && decisionQuality.buckets.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">برای این تحلیل باید ریویو پس از معامله تکمیل شود</p>
                ) : (
                  <>
                    {decisionQuality.sampleWarning && <SmallSampleBadge />}
                    {decisionQuality.avgScore !== null && (
                      <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 p-3">
                        <div className="text-center">
                          <p className="text-2xl font-bold tabular-nums">{decisionQuality.avgScore.toFixed(0)}</p>
                          <p className="text-[10px] text-muted-foreground">میانگین کیفیت</p>
                        </div>
                        <div className="flex-1 space-y-1">
                          {decisionQuality.goodDecisionLift !== null && (
                            <p className="text-xs">
                              تصمیم خوب vs ضعیف: <span className={`font-bold ${decisionQuality.goodDecisionLift > 0 ? 'text-green-500' : 'text-destructive'}`}>
                                {decisionQuality.goodDecisionLift > 0 ? '+' : ''}{decisionQuality.goodDecisionLift.toFixed(2)}R
                              </span>
                            </p>
                          )}
                          {decisionQuality.luckyWinCount > 0 && (
                            <p className="text-xs text-muted-foreground">برد شانسی (اجرای بد): <span className="text-amber-500 font-medium">{decisionQuality.luckyWinCount}</span></p>
                          )}
                          {decisionQuality.goodLossCount > 0 && (
                            <p className="text-xs text-muted-foreground">ضرر با تصمیم خوب: <span className="text-blue-500 font-medium">{decisionQuality.goodLossCount}</span></p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {decisionQuality.buckets.map(b => (
                        <div key={b.level} className="space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{b.label}</span>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span>{b.count} معامله ({(b.pct * 100).toFixed(0)}%)</span>
                              {b.avgR !== null && (
                                <span className={`font-semibold ${b.avgR > 0 ? 'text-green-500' : 'text-destructive'}`}>
                                  {r(b.avgR)}
                                </span>
                              )}
                              {b.sampleWarning && <SmallSampleBadge />}
                            </div>
                          </div>
                          <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${
                              b.level === 'excellent' ? 'bg-green-500' :
                              b.level === 'good' ? 'bg-primary' :
                              b.level === 'acceptable' ? 'bg-amber-500' :
                              b.level === 'poor' ? 'bg-orange-500' : 'bg-destructive'
                            }`} style={{ width: `${b.pct * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Overtrading */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">تحلیل معامله بیش از حد</CardTitle>
                  <CardDescription className="text-xs">آستانه: بیش از {overtradingThreshold} معامله در روز</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">حد:</span>
                  <input type="number" value={overtradingThreshold} onChange={e => setOvertradingThreshold(Number(e.target.value))}
                    min={1} max={20}
                    className="w-12 h-7 rounded border border-border bg-background text-center text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="میانگین/روز" value={overtradingData.avgTradesPerDay.toFixed(1)} />
                  <MetricCard label="بیشترین/روز" value={overtradingData.maxTradesInDay.toString()} color={overtradingData.maxTradesInDay > overtradingThreshold ? 'text-destructive' : ''} />
                  <MetricCard label="روزهای بیش از حد" value={overtradingData.daysOverThreshold.toString()} color={overtradingData.daysOverThreshold > 0 ? 'text-amber-500' : ''} />
                </div>
                {overtradingData.overtradingDays.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">روزهای پرمعامله</p>
                    {overtradingData.overtradingDays.slice(0, 5).map(d => (
                      <div key={d.date} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                        <span className="text-muted-foreground">{d.date}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-destructive font-medium">{d.count} معامله</span>
                          <span className={d.avgR !== null && d.avgR > 0 ? 'text-green-500' : 'text-destructive'}>{r(d.avgR)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ TAB: EVOLUTION ══ */}
        {tab === 'evolution' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">دوره:</span>
              <button onClick={() => setEvGranularity('week')} className={`text-xs px-3 py-1.5 rounded-lg ${evGranularity === 'week' ? 'bg-primary/15 text-primary' : 'bg-muted/20 text-muted-foreground'}`}>هفتگی</button>
              <button onClick={() => setEvGranularity('month')} className={`text-xs px-3 py-1.5 rounded-lg ${evGranularity === 'month' ? 'bg-primary/15 text-primary' : 'bg-muted/20 text-muted-foreground'}`}>ماهانه</button>
            </div>
            {evolution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">داده کافی برای تحلیل تحول وجود ندارد</p>
            ) : (
              <div className="space-y-3">
                {evolution.map((p, i) => {
                  const prev = evolution[i - 1];
                  const trend = prev && p.avgR !== null && prev.avgR !== null
                    ? p.avgR > prev.avgR ? 'up' : p.avgR < prev.avgR ? 'down' : 'flat' : null;
                  return (
                    <Card key={p.periodKey} className={trend === 'up' ? 'border-green-500/20' : trend === 'down' ? 'border-destructive/20' : ''}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{p.periodLabel}</p>
                            {trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-green-500" />}
                            {trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                            {p.sampleWarning && <SmallSampleBadge />}
                          </div>
                          <span className="text-xs text-muted-foreground">{p.count} معامله</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><p className="text-muted-foreground">نرخ برد</p><p className={`font-semibold ${(p.winRate ?? 0) >= 0.5 ? 'text-green-500' : 'text-destructive'}`}>{pct(p.winRate)}</p></div>
                          <div><p className="text-muted-foreground">R میانگین</p><p className={`font-semibold ${(p.avgR ?? 0) > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(p.avgR)}</p></div>
                          <div><p className="text-muted-foreground">انتظار</p><p className="font-semibold">{r(p.expectancy)}</p></div>
                          <div><p className="text-muted-foreground">ضریب سود</p><p className="font-semibold">{num(p.profitFactor)}</p></div>
                        </div>
                        <WinLossBar win={p.winCount} loss={p.lossCount} be={p.breakEvenCount} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* ── Behavioral Timeline ── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />تایم‌لاین رفتاری
                  </CardTitle>
                  <CardDescription className="text-xs">تحول اشتباهات و نقاط قوت در طول زمان</CardDescription>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setTimelineGranularity('week')}
                    className={`text-xs px-2 py-1 rounded ${timelineGranularity === 'week' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>هفتگی</button>
                  <button onClick={() => setTimelineGranularity('month')}
                    className={`text-xs px-2 py-1 rounded ${timelineGranularity === 'month' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}>ماهانه</button>
                </div>
              </CardHeader>
              <CardContent>
                {behavioralTimeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">داده کافی نیست</p>
                ) : (
                  <div className="space-y-2">
                    {[...behavioralTimeline].reverse().map((entry, i) => (
                      <div key={entry.period} className={`rounded-xl border p-3 space-y-2 ${entry.sampleWarning ? 'border-border/40 opacity-70' : (entry.avgR ?? 0) > 0 ? 'border-green-500/20' : 'border-destructive/20'}`}>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{entry.period}</span>
                            {entry.sampleWarning && <SmallSampleBadge />}
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span>{entry.count} معامله</span>
                            {entry.winRate !== null && <span>{pct(entry.winRate)} برد</span>}
                            {entry.avgR !== null && (
                              <span className={`font-bold ${entry.avgR > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(entry.avgR)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 text-xs">
                          {entry.topMistake && (
                            <div className="flex items-center gap-1.5 rounded-lg bg-destructive/5 border border-destructive/20 px-2 py-1">
                              <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                              <span className="text-destructive/80 truncate">{entry.topMistake}</span>
                              {entry.mistakeCount > 1 && <span className="text-destructive/60">+{entry.mistakeCount - 1}</span>}
                            </div>
                          )}
                          {entry.topStrength && (
                            <div className="flex items-center gap-1.5 rounded-lg bg-green-500/5 border border-green-500/20 px-2 py-1">
                              <Star className="w-3 h-3 text-green-500 shrink-0" />
                              <span className="text-green-600/80 truncate">{entry.topStrength}</span>
                              {entry.strengthCount > 1 && <span className="text-green-500/60">+{entry.strengthCount - 1}</span>}
                            </div>
                          )}
                          {!entry.topMistake && !entry.topStrength && (
                            <span className="text-muted-foreground">الگوی قابل توجهی یافت نشد</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Period Review */}
            {reviewPeriods.length > 0 && (
              <Card className="border-primary/20">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />ریویو دوره</CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={reviewType} onValueChange={v => { setReviewType(v as 'weekly' | 'monthly'); setReviewPeriod(''); }}>
                      <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">ماهانه</SelectItem>
                        <SelectItem value="weekly">هفتگی</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={reviewPeriod || reviewPeriods[0] || ''} onValueChange={setReviewPeriod}>
                      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {reviewPeriods.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                {currentReview != null && (
                  <CardContent className="space-y-3">
                    <BaseMetricsGrid m={currentReview.metrics} />
                    {currentReview.mistakes.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">اشتباهات این دوره</p>
                        <div className="space-y-1.5">{currentReview.mistakes.slice(0, 3).map(m => <BehaviorChip key={m.id} pattern={m} />)}</div>
                      </div>
                    )}
                    {currentReview.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">نقاط قوت این دوره</p>
                        <div className="space-y-1.5">{currentReview.strengths.slice(0, 2).map(s => <BehaviorChip key={s.id} pattern={s} />)}</div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">یادداشت شخصی برای این دوره</label>
                      <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3}
                        placeholder="درس‌ها، اهداف و مشاهدات این دوره..."
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                    </div>
                    {currentReview.metrics.sampleWarning && <SmallSampleBadge />}
                  </CardContent>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ══ TAB: STYLE ══ */}
        {tab === 'style' && (
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" />پروفایل سبک معاملاتی</CardTitle>
                <CardDescription className="text-xs">توصیفی از رفتار واقعی — نه دستوری</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {tradingStyle.description && (
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                    <p className="text-sm leading-relaxed">{tradingStyle.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  <StatRow label="سبک ترجیحی" value={tradingStyle.topSetup ?? '—'} />
                  <StatRow label="سشن ترجیحی" value={tradingStyle.topSession ?? '—'} />
                  <StatRow label="نماد اصلی" value={tradingStyle.topSymbol ?? '—'} />
                  <StatRow label="میانگین ریسک" value={tradingStyle.avgRisk !== null ? `${tradingStyle.avgRisk.toFixed(2)}%` : '—'} />
                  <StatRow label="میانگین نگهداری" value={tradingStyle.avgHoldingMinutes !== null
                    ? (tradingStyle.avgHoldingMinutes < 60
                      ? `${tradingStyle.avgHoldingMinutes.toFixed(0)} دقیقه`
                      : `${(tradingStyle.avgHoldingMinutes / 60).toFixed(1)} ساعت`)
                    : '—'} />
                  <StatRow label="تکرار معاملات" value={tradingStyle.tradeFrequency} />
                  <StatRow label="سبک مدیریت" value={tradingStyle.managementStyle} />
                </div>
              </CardContent>
            </Card>

            {/* Rule Adherence */}
            {knowledgeNotes.filter((n: any) => n.isRule).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />رعایت قوانین شخصی</CardTitle>
                  <CardDescription className="text-xs">بر اساس امتیاز adherence معاملات</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {['fully', 'mostly', 'partially', 'not'].map(rating => {
                      const count = filtered.filter(t => t.status === 'closed' && t.adherenceRating === rating).length;
                      const total = filtered.filter(t => t.status === 'closed' && t.adherenceRating !== null).length;
                      if (count === 0) return null;
                      const labels: Record<string, string> = { fully: 'کامل', mostly: 'اکثراً', partially: 'جزئی', not: 'رعایت نشد' };
                      const colors: Record<string, string> = { fully: 'bg-green-500', mostly: 'bg-primary', partially: 'bg-amber-500', not: 'bg-destructive' };
                      const rs = filtered.filter(t => t.status === 'closed' && t.adherenceRating === rating && t.rMultiple !== null).map(t => t.rMultiple!);
                      const avgR = rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) : '—';
                      return (
                        <div key={rating} className="space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span>{labels[rating]}</span>
                            <span className="text-muted-foreground">{count} معامله | میانگین R: {avgR === '—' ? '—' : `${Number(avgR) >= 0 ? '+' : ''}${avgR}R`}</span>
                          </div>
                          <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${colors[rating]}`} style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ══ TAB: INSIGHTS ══ */}
        {tab === 'insights' && (
          <div className="space-y-5">
            {/* ── Learning Progress ── */}
            {learningProgress.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />پیشرفت یادگیری — اثر قوانین شخصی
                  </CardTitle>
                  <CardDescription className="text-xs">عملکرد قبل و بعد از ثبت هر قانون</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {learningProgress.map(lesson => (
                    <div key={lesson.noteId} className={`rounded-xl border p-3 space-y-2 ${
                      lesson.improvement !== null && lesson.improvement > 0
                        ? 'border-green-500/20 bg-green-500/5'
                        : lesson.improvement !== null && lesson.improvement < 0
                        ? 'border-destructive/20 bg-destructive/5'
                        : 'border-border bg-muted/5'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{lesson.title}</p>
                        {lesson.improvement !== null && (
                          <span className={`text-xs font-bold tabular-nums shrink-0 ${lesson.improvement > 0 ? 'text-green-500' : 'text-destructive'}`}>
                            {lesson.improvement > 0 ? '↑' : '↓'}{Math.abs(lesson.improvement).toFixed(2)}R
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">قبل از قانون ({lesson.tradesBeforeCount} معامله)</p>
                          <div className="flex items-center gap-2">
                            {lesson.avgRBefore !== null
                              ? <span className={`font-semibold ${lesson.avgRBefore > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(lesson.avgRBefore)}</span>
                              : <span className="text-muted-foreground">—</span>}
                            {lesson.winRateBefore !== null && <span className="text-muted-foreground">{pct(lesson.winRateBefore)} برد</span>}
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">بعد از قانون ({lesson.tradesAfterCount} معامله)</p>
                          <div className="flex items-center gap-2">
                            {lesson.avgRAfter !== null
                              ? <span className={`font-semibold ${lesson.avgRAfter > 0 ? 'text-green-500' : 'text-destructive'}`}>{r(lesson.avgRAfter)}</span>
                              : <span className="text-muted-foreground">—</span>}
                            {lesson.winRateAfter !== null && <span className="text-muted-foreground">{pct(lesson.winRateAfter)} برد</span>}
                          </div>
                        </div>
                      </div>
                      {(lesson.tradesBeforeCount < 5 || lesson.tradesAfterCount < 5) && <SmallSampleBadge />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" />بینش‌های شخصی مبتنی بر داده</CardTitle>
                <CardDescription className="text-xs">بر اساس تاریخچه واقعی معاملات — نه پیش‌بینی بازار</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.filter(i => !dismissedInsights.has(i.id)).length === 0 ? (
                  <div className="text-center py-8">
                    <Lightbulb className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{filtered.filter(t => t.status === 'closed').length < 5 ? 'حداقل ۵ معامله بسته برای تشخیص الگو لازم است' : 'الگو قابل توجهی یافت نشد'}</p>
                  </div>
                ) : insights.filter(i => !dismissedInsights.has(i.id)).map(ins => (
                  <div key={ins.id} className={`rounded-xl border overflow-hidden ${ins.category === 'warning' ? 'border-amber-500/30' : 'border-green-500/20'}`}>
                    <button onClick={() => setExpandedInsight(expandedInsight === ins.id ? null : ins.id)}
                      className="w-full flex items-start justify-between p-3 text-right">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          {ins.category === 'warning'
                            ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            : <Star className="w-4 h-4 text-green-500 shrink-0" />}
                          <p className="text-sm font-medium">{ins.title}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ins.confidence === 'high' ? 'bg-green-500/10 text-green-500' : ins.confidence === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted/30 text-muted-foreground'}`}>
                            {ins.confidence === 'high' ? 'اطمینان بالا' : ins.confidence === 'medium' ? 'متوسط' : 'پایین'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{ins.description}</p>
                      </div>
                      {expandedInsight === ins.id ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 mr-2" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 mr-2" />}
                    </button>
                    {expandedInsight === ins.id && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border/50">
                        <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                          <div><p className="text-muted-foreground">شواهد</p><p className="font-medium text-xs leading-tight">{ins.evidence}</p></div>
                          <div><p className="text-muted-foreground">نمونه</p><p className="font-medium">{ins.examples}</p></div>
                          <div><p className="text-muted-foreground">بازه</p><p className="font-medium text-[10px]">{ins.dateRange}</p></div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => approveInsight(ins)} className="gap-1.5 text-xs h-7">
                            <Bookmark className="w-3.5 h-3.5 text-primary" />ذخیره به‌عنوان قانون
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => dismissInsight(ins.id)} className="gap-1.5 text-xs h-7 text-muted-foreground">
                            <X className="w-3.5 h-3.5" />رد
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
