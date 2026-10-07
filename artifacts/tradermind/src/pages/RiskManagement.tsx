/**
 * RiskManagement.tsx — داشبورد مدیریت ریسک (Prompt 24)
 * آفلاین کامل — بدون اتصال به بروکر یا اینترنت
 */
import { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '../components/ui/skeleton';
import {
  ShieldCheck, TrendingDown, TrendingUp, AlertTriangle, BarChart3,
  Calendar, Target, Activity, ChevronDown, ChevronUp,
  Info, CheckCircle2, AlertCircle, Lightbulb, Flame,
  Edit3, Check, X, Plus, Trash2, Layers, Bookmark, RefreshCw, ScanLine,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { db } from '../db/database';
import type { Trade, RiskGroup } from '../db/database';
import {
  getRiskConsistency,
  getAllDailyExposures,
  getWeeklyRiskExposures,
  getRiskByDayOfWeek,
  getRiskBySession,
  getPostLossBehavior,
  getPostWinBehavior,
  getDrawdownAnalysis,
  getRRAnalysis,
  getSLBehavior,
  getTPBehavior,
  getPosSizeBehavior,
  getPlannedVsActual,
  getRiskQualityScore,
  getRiskInsights,
  getRiskHeatmapBySymbol,
  scanAllViolations,
} from '../services/riskService';
import type { RiskProfileData, RiskInsight } from '../services/riskService';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface RiskViolation {
  id: string;
  tradeId: string | null;
  date: string;
  ruleType: string;
  ruleLabel: string;
  plannedValue: number | null;
  actualValue: number | null;
  deviation: number | null;
  outcome: string | null;
  intent: 'intentional' | 'accidental' | 'exceptional' | 'unclear' | null;
  explanation: string | null;
  lesson: string | null;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
function pct(v: number | null, dec = 1) {
  return v !== null ? `${v.toFixed(dec)}%` : '—';
}
function num(v: number | null, dec = 2) {
  return v !== null ? v.toFixed(dec) : '—';
}
function r(v: number | null) {
  return v !== null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` : '—';
}

function SmallSampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" /> نمونه کم
    </span>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-medium tabular-nums ${highlight ?? ''}`}>{value}</span>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

const TAB_LIST = [
  { id: 'overview', label: 'خلاصه', icon: BarChart3 },
  { id: 'behavior', label: 'رفتار', icon: Activity },
  { id: 'temporal', label: 'زمانی', icon: Calendar },
  { id: 'rr', label: 'ریسک/ریوارد', icon: Target },
  { id: 'violations', label: 'قوانین', icon: ShieldCheck },
  { id: 'groups', label: 'گروه‌ها', icon: Layers },
] as const;
type TabId = typeof TAB_LIST[number]['id'];

// ─────────────────────────────────────────────────────────────────
// Score Badge
// ─────────────────────────────────────────────────────────────────
function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  const color = grade === 'A' ? 'text-green-500' : grade === 'B' ? 'text-primary' : grade === 'C' ? 'text-amber-500' : 'text-destructive';
  const bg = grade === 'A' ? 'bg-green-500/10' : grade === 'B' ? 'bg-primary/10' : grade === 'C' ? 'bg-amber-500/10' : 'bg-destructive/10';
  return (
    <div className={`rounded-2xl ${bg} p-5 text-center`}>
      <p className="text-xs text-muted-foreground mb-1">امتیاز کیفیت ریسک</p>
      <p className={`text-5xl font-bold ${color} tabular-nums`}>{score.toFixed(0)}</p>
      <p className={`text-lg font-semibold ${color} mt-1`}>درجه {grade}</p>
      <p className="text-xs text-muted-foreground mt-1">از ۱۰۰ — بر اساس داده‌های محلی</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
export default function RiskManagement() {
  const [tab, setTab] = useState<TabId>('overview');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [profile, setProfile] = useState<RiskProfileData | null>(null);
  const [violations, setViolations] = useState<RiskViolation[]>([]);
  const [groups, setGroups] = useState<RiskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [timeRange, setTimeRange] = useState<'all' | '3m' | '6m' | '1y'>('all');
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem('rm_dismissed_insights') ?? '[]'))
  );
  const [editViolation, setEditViolation] = useState<string | null>(null);
  const [violationForm, setViolationForm] = useState<Partial<RiskViolation>>({});
  // Group form state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSymbols, setNewGroupSymbols] = useState('');
  const [newGroupMaxRisk, setNewGroupMaxRisk] = useState('');

  useEffect(() => {
    Promise.all([
      db.trades.toArray(),
      db.riskProfiles.get('default').catch(() => null),
      db.riskViolations.orderBy('createdAt').reverse().toArray().catch(() => []),
      db.riskGroups.orderBy('createdAt').toArray().catch(() => []),
    ]).then(([t, p, v, g]) => {
      setTrades(t);
      setProfile(p ?? null);
      setViolations(v ?? []);
      setGroups(g ?? []);
      setLoading(false);
    });
  }, []);

  // Filter trades by time range
  const filteredTrades = useMemo(() => {
    if (timeRange === 'all') return trades;
    const now = Date.now();
    const ms = { '3m': 90, '6m': 180, '1y': 365 }[timeRange] * 86400000;
    return trades.filter(t => t.openedAt >= now - ms);
  }, [trades, timeRange]);

  const closed = useMemo(() => filteredTrades.filter(t => t.status === 'closed'), [filteredTrades]);

  // Memoized analytics
  const consistency = useMemo(() => getRiskConsistency(filteredTrades), [filteredTrades]);
  const qualityScore = useMemo(() => getRiskQualityScore(filteredTrades, profile), [filteredTrades, profile]);
  const dailyExposures = useMemo(() => getAllDailyExposures(filteredTrades, profile), [filteredTrades, profile]);
  const weeklyExposures = useMemo(() => getWeeklyRiskExposures(filteredTrades, profile), [filteredTrades, profile]);
  const postLoss = useMemo(() => getPostLossBehavior(filteredTrades), [filteredTrades]);
  const postWin = useMemo(() => getPostWinBehavior(filteredTrades), [filteredTrades]);
  const byDay = useMemo(() => getRiskByDayOfWeek(filteredTrades, profile), [filteredTrades, profile]);
  const bySession = useMemo(() => getRiskBySession(filteredTrades, profile), [filteredTrades, profile]);
  const drawdown = useMemo(() => getDrawdownAnalysis(closed, profile?.accountEquity ?? profile?.accountBalance ?? 10000), [closed, profile]);
  const rrAnalysis = useMemo(() => getRRAnalysis(filteredTrades), [filteredTrades]);
  const slBehavior = useMemo(() => getSLBehavior(filteredTrades), [filteredTrades]);
  const tpBehavior = useMemo(() => getTPBehavior(filteredTrades), [filteredTrades]);
  const posSizeBehavior = useMemo(() => getPosSizeBehavior(filteredTrades), [filteredTrades]);
  const plannedVsActual = useMemo(() => getPlannedVsActual(filteredTrades), [filteredTrades]);
  const insights = useMemo(() => getRiskInsights(filteredTrades, profile), [filteredTrades, profile]);
  const heatmapBySymbol = useMemo(() => getRiskHeatmapBySymbol(filteredTrades, profile), [filteredTrades, profile]);

  // Today's exposure
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayExposure = useMemo(() => dailyExposures.find(d => d.date === todayStr), [dailyExposures, todayStr]);

  const saveViolation = async (v: Partial<RiskViolation>) => {
    if (!editViolation) return;
    await db.riskViolations.update(editViolation, v);
    setViolations(prev => prev.map(x => x.id === editViolation ? { ...x, ...v } : x));
    setEditViolation(null);
    toast.success('ثبت شد');
  };

  const deleteViolation = async (id: string) => {
    await db.riskViolations.delete(id);
    setViolations(prev => prev.filter(v => v.id !== id));
    toast.success('حذف شد');
  };

  const scanAndLogViolations = async () => {
    if (!profile) { toast.error('ابتدا پروفایل ریسک تنظیم کنید'); return; }
    setScanning(true);
    try {
      const allTrades = await db.trades.toArray();
      const found = scanAllViolations(allTrades, profile);
      const existing = await db.riskViolations.toArray();
      const existingKeys = new Set(existing.map(e => `${e.tradeId}_${e.ruleType}`));
      const newViolations = found.filter(f => !existingKeys.has(`${f.tradeId}_${f.ruleType}`));
      const now = Date.now();
      const records: RiskViolation[] = newViolations.map(f => ({
        id: `${f.tradeId}_${f.ruleType}_${now}`,
        tradeId: f.tradeId,
        date: f.tradeDate,
        ruleType: f.ruleType,
        ruleLabel: f.ruleLabel,
        plannedValue: f.plannedValue,
        actualValue: f.actualValue,
        deviation: f.deviation,
        outcome: null, intent: null, explanation: null, lesson: null,
        createdAt: now,
      }));
      if (records.length > 0) {
        await db.riskViolations.bulkAdd(records);
        const updated = await db.riskViolations.orderBy('createdAt').reverse().toArray();
        setViolations(updated);
        toast.success(`${records.length} نقض جدید شناسایی و ثبت شد`);
      } else {
        toast.info('نقض جدیدی یافت نشد');
      }
    } finally {
      setScanning(false);
    }
  };

  const approveInsight = async (ins: RiskInsight) => {
    const note = {
      id: `risk_insight_${ins.id}_${Date.now()}`,
      title: ins.title,
      content: `${ins.description}\n\nشواهد: ${ins.evidence}`,
      category: 'risk-management',
      importance: (ins.confidence === 'high' ? 'high' : ins.confidence === 'medium' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      color: '#ef4444',
      tags: '["ریسک","الگو","بینش"]',
      relatedSymbols: '[]', relatedSetups: '[]', relatedStrategies: '[]',
      relatedSessions: '[]', relatedMarketRegimes: '[]', relatedTimeframes: '[]', relatedDays: '[]',
      source: 'ai-generated' as const,
      status: 'active' as const,
      isActive: true, isPinned: false, isRule: true,
      reviewCount: 0, lastReviewedAt: null, nextReviewAt: null,
      reviewFrequency: 'monthly' as const,
      userFeedback: null, evidence: null, requireConfirmation: false, snoozedUntil: null,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    await db.knowledgeNotes.add(note);
    toast.success('بینش به عنوان قانون ذخیره شد');
  };

  const dismissInsight = (id: string) => {
    const next = new Set(dismissedInsights).add(id);
    setDismissedInsights(next);
    localStorage.setItem('rm_dismissed_insights', JSON.stringify([...next]));
  };

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    const group: RiskGroup = {
      id: `group_${Date.now()}`,
      name: newGroupName.trim(),
      description: null,
      symbols: newGroupSymbols.trim() ? JSON.stringify(newGroupSymbols.split(',').map(s => s.trim())) : null,
      tradeIds: null,
      maxGroupRiskPct: newGroupMaxRisk ? parseFloat(newGroupMaxRisk) : null,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    await db.riskGroups.add(group);
    setGroups(prev => [...prev, group]);
    setNewGroupName(''); setNewGroupSymbols(''); setNewGroupMaxRisk('');
    toast.success('گروه اضافه شد');
  };

  const deleteGroup = async (id: string) => {
    await db.riskGroups.delete(id);
    setGroups(prev => prev.filter(g => g.id !== id));
    toast.success('گروه حذف شد');
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

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/50 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <div>
              <h1 className="text-base font-bold leading-tight">مدیریت ریسک</h1>
              <p className="text-xs text-muted-foreground">{filteredTrades.length} معامله تحلیل شد</p>
            </div>
          </div>
          <Select value={timeRange} onValueChange={v => setTimeRange(v as typeof timeRange)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه</SelectItem>
              <SelectItem value="3m">۳ ماه</SelectItem>
              <SelectItem value="6m">۶ ماه</SelectItem>
              <SelectItem value="1y">۱ سال</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Tabs */}
        <div className="max-w-5xl mx-auto mt-2 flex gap-1 overflow-x-auto scrollbar-hide">
          {TAB_LIST.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/30'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">

        {/* ══════════════════ TAB: OVERVIEW ══════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-5">
            {/* Risk Quality Score */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ScoreBadge score={qualityScore.total} grade={qualityScore.grade} />
              <div className="sm:col-span-2 space-y-2">
                {qualityScore.components.map(c => (
                  <div key={c.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="font-medium tabular-nums">{c.score.toFixed(0)}/100</span>
                    </div>
                    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${c.score}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{c.description}</p>
                  </div>
                ))}
                {qualityScore.smallSample && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500 mt-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    نمونه کافی نیست — امتیاز با داده‌های بیشتر دقیق‌تر می‌شود
                  </div>
                )}
              </div>
            </div>

            {/* Today + Weekly */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">ریسک امروز</CardTitle></CardHeader>
                <CardContent>
                  {todayExposure ? (
                    <div className="space-y-2">
                      <StatRow label="ریسک مصرف‌شده" value={pct(todayExposure.totalRiskPct)}
                        highlight={profile?.maxDailyRiskPct && todayExposure.totalRiskPct !== null && todayExposure.totalRiskPct > profile.maxDailyRiskPct ? 'text-destructive' : ''} />
                      <StatRow label="تعداد معاملات" value={String(todayExposure.tradeCount)} />
                      <StatRow label="سود/زیان" value={todayExposure.totalPnl !== null ? `$${todayExposure.totalPnl.toFixed(2)}` : '—'}
                        highlight={todayExposure.totalPnl !== null ? (todayExposure.totalPnl >= 0 ? 'text-green-500' : 'text-destructive') : ''} />
                      {profile?.maxDailyRiskPct && todayExposure.totalRiskPct !== null && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>مصرف روزانه</span>
                            <span>{pct(todayExposure.totalRiskPct)} / {pct(profile.maxDailyRiskPct)}</span>
                          </div>
                          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              todayExposure.totalRiskPct > profile.maxDailyRiskPct ? 'bg-destructive' : 'bg-primary'
                            }`} style={{ width: `${Math.min(100, (todayExposure.totalRiskPct / profile.maxDailyRiskPct) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">معامله‌ای امروز ثبت نشده</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">ثبات ریسک</CardTitle></CardHeader>
                <CardContent>
                  <StatRow label="تعداد نمونه" value={String(consistency.count)} />
                  <StatRow label="میانگین" value={pct(consistency.avg)} />
                  <StatRow label="میانه" value={pct(consistency.median)} />
                  <StatRow label="حداقل" value={pct(consistency.min)} />
                  <StatRow label="حداکثر" value={pct(consistency.max)} />
                  <StatRow label="ضریب تغییرات"
                    value={consistency.cv !== null ? pct(consistency.cv * 100, 0) : '—'}
                    highlight={consistency.cv !== null && consistency.cv > 0.5 ? 'text-amber-500' : ''} />
                  {consistency.smallSample && <div className="mt-2"><SmallSampleBadge /></div>}
                </CardContent>
              </Card>
            </div>

            {/* Drawdown summary */}
            <Card className={drawdown.isInDrawdown ? 'border-destructive/30' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  تحلیل افت سرمایه
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'افت فعلی', value: pct(drawdown.currentDrawdownPct), bad: drawdown.currentDrawdownPct > 5 },
                    { label: 'بیشترین افت', value: pct(drawdown.maxDrawdownPct), bad: drawdown.maxDrawdownPct > 10 },
                    { label: 'ضررهای متوالی', value: String(drawdown.currentConsecutiveLosses), bad: drawdown.currentConsecutiveLosses >= (profile?.maxConsecutiveLosses ?? 999) },
                    { label: 'معاملات در افت', value: String(drawdown.tradesInMaxDD) },
                  ].map(m => (
                    <div key={m.label} className={`rounded-xl p-3 border ${m.bad ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/10'}`}>
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className={`text-lg font-bold tabular-nums ${m.bad ? 'text-destructive' : ''}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
                {drawdown.smallSample && <div className="mt-3"><SmallSampleBadge /></div>}
              </CardContent>
            </Card>

            {/* Planned vs Actual */}
            {plannedVsActual.count > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">برنامه‌ریزی در مقابل اجرا</CardTitle>
                  <CardDescription className="text-xs">{plannedVsActual.count} معامله با هر دو نوع داده</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: 'مطابق برنامه', value: plannedVsActual.onPlanCount, color: 'text-green-500 bg-green-500/10' },
                      { label: 'بیشتر از برنامه', value: plannedVsActual.overPlanCount, color: 'text-destructive bg-destructive/10' },
                      { label: 'کمتر از برنامه', value: plannedVsActual.underPlanCount, color: 'text-amber-500 bg-amber-500/10' },
                    ].map(c => (
                      <div key={c.label} className={`rounded-xl p-3 ${c.color}`}>
                        <p className="text-2xl font-bold tabular-nums">{c.value}</p>
                        <p className="text-xs mt-0.5">{c.label}</p>
                      </div>
                    ))}
                  </div>
                  {plannedVsActual.smallSample && <div className="mt-3"><SmallSampleBadge /></div>}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════════ TAB: BEHAVIOR ══════════════════ */}
        {tab === 'behavior' && (
          <div className="space-y-5">
            {/* Post-Loss */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  رفتار ریسک پس از ضرر
                </CardTitle>
                <CardDescription className="text-xs">آیا ریسک پس از ضرر افزایش می‌یابد؟</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {postLoss.map(b => (
                  <div key={b.afterCount} className={`rounded-xl p-3 border ${
                    b.riskRatio !== null && b.riskRatio > 1.15 ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/10'
                  }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{b.label}</p>
                      <div className="flex items-center gap-2">
                        {b.smallSample && <SmallSampleBadge />}
                        <span className="text-xs text-muted-foreground">{b.examples} نمونه</span>
                      </div>
                    </div>
                    {b.riskRatio !== null ? (
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <div>
                          <p className="text-muted-foreground">میانگین کلی</p>
                          <p className="font-medium tabular-nums">{pct(b.avgRiskBefore)}</p>
                        </div>
                        <div className="text-muted-foreground text-lg">→</div>
                        <div>
                          <p className="text-muted-foreground">پس از ضرر</p>
                          <p className={`font-medium tabular-nums ${b.riskRatio > 1.15 ? 'text-destructive' : b.riskRatio < 0.85 ? 'text-green-500' : ''}`}>
                            {pct(b.avgRiskAfter)} {b.riskRatio > 1.05 ? `(+${((b.riskRatio - 1) * 100).toFixed(0)}%)` : b.riskRatio < 0.95 ? `(${((b.riskRatio - 1) * 100).toFixed(0)}%)` : ''}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">داده کافی نیست</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Post-Win */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  رفتار ریسک پس از سود
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {postWin.map(b => (
                  <div key={b.afterCount} className={`rounded-xl p-3 border ${
                    b.riskRatio !== null && b.riskRatio > 1.15 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/10'
                  }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{b.label}</p>
                      <div className="flex items-center gap-2">
                        {b.smallSample && <SmallSampleBadge />}
                        <span className="text-xs text-muted-foreground">{b.examples} نمونه</span>
                      </div>
                    </div>
                    {b.riskRatio !== null ? (
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <div>
                          <p className="text-muted-foreground">میانگین کلی</p>
                          <p className="font-medium tabular-nums">{pct(b.avgRiskBefore)}</p>
                        </div>
                        <div className="text-muted-foreground text-lg">→</div>
                        <div>
                          <p className="text-muted-foreground">پس از سود</p>
                          <p className={`font-medium tabular-nums ${b.riskRatio > 1.15 ? 'text-amber-500' : ''}`}>
                            {pct(b.avgRiskAfter)} {b.riskRatio > 1.05 ? `(+${((b.riskRatio - 1) * 100).toFixed(0)}%)` : ''}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">داده کافی نیست</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* SL Behavior */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">رفتار حد ضرر (Stop Loss)</CardTitle>
              </CardHeader>
              <CardContent>
                <StatRow label="کل معاملات" value={String(slBehavior.totalTrades)} />
                <StatRow label="جابجایی SL"
                  value={`${slBehavior.slMovedCount} معامله (${pct(slBehavior.slMovedPct ? slBehavior.slMovedPct * 100 : null, 0)})`}
                  highlight={slBehavior.slMovedPct !== null && slBehavior.slMovedPct > 0.2 ? 'text-amber-500' : ''} />
                <StatRow label="گسترش SL (فاصله زیاد‌تر)"
                  value={`${slBehavior.slExpansionCount} معامله`}
                  highlight={slBehavior.slExpansionCount > 5 ? 'text-destructive' : ''} />
                <StatRow label="فاصله متوسط SL" value={slBehavior.avgSLDistance !== null ? `${slBehavior.avgSLDistance.toFixed(2)}%` : '—'} />
                <StatRow label="فاصله متوسط SL برنامه‌ریزی‌شده" value={slBehavior.avgPlannedSLDist !== null ? `${slBehavior.avgPlannedSLDist.toFixed(2)}%` : '—'} />
                {slBehavior.smallSample && <div className="mt-2"><SmallSampleBadge /></div>}
              </CardContent>
            </Card>

            {/* TP Behavior */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">رفتار هدف سود (Take Profit)</CardTitle>
              </CardHeader>
              <CardContent>
                <StatRow label="جابجایی TP" value={`${tpBehavior.tpMovedCount} معامله (${pct(tpBehavior.tpMovedPct ? tpBehavior.tpMovedPct * 100 : null, 0)})`} />
                <StatRow label="بستن جزئی (Partial Close)" value={`${tpBehavior.partialCloseCount} معامله`} />
                <StatRow label="خروج زودهنگام" value={`${tpBehavior.earlyExitCount} معامله`} />
                <StatRow label="نرخ برد در خروج زودهنگام"
                  value={tpBehavior.earlyExitWinRate !== null ? pct(tpBehavior.earlyExitWinRate * 100) : '—'} />
                <StatRow label="میانگین R:R برنامه‌ریزی‌شده" value={num(tpBehavior.avgPlannedRR)} />
                <StatRow label="میانگین R:R واقعی" value={num(tpBehavior.avgActualRR)} />
                {tpBehavior.smallSample && <div className="mt-2"><SmallSampleBadge /></div>}
              </CardContent>
            </Card>

            {/* Position Size */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">رفتار حجم معامله</CardTitle>
              </CardHeader>
              <CardContent>
                <StatRow label="میانگین حجم" value={num(posSizeBehavior.avgSize)} />
                <StatRow label="انحراف معیار" value={num(posSizeBehavior.stdDev)} />
                <StatRow label="ضریب تغییرات (CV)"
                  value={posSizeBehavior.cv !== null ? pct(posSizeBehavior.cv * 100) : '—'}
                  highlight={posSizeBehavior.cv !== null && posSizeBehavior.cv > 0.4 ? 'text-amber-500' : ''} />
                <StatRow label="میانگین حجم پس از سود"
                  value={num(posSizeBehavior.avgAfterWin)}
                  highlight={posSizeBehavior.sizeRatioAfterWin !== null && posSizeBehavior.sizeRatioAfterWin > 1.2 ? 'text-amber-500' : ''} />
                <StatRow label="میانگین حجم پس از ضرر"
                  value={num(posSizeBehavior.avgAfterLoss)}
                  highlight={posSizeBehavior.sizeRatioAfterLoss !== null && posSizeBehavior.sizeRatioAfterLoss > 1.2 ? 'text-destructive' : ''} />
                {posSizeBehavior.bySymbol.slice(0, 5).map(s => (
                  <StatRow key={s.symbol} label={s.symbol} value={num(s.avgSize)} sub={`${s.count} معامله`} />
                ))}
                {posSizeBehavior.smallSample && <div className="mt-2"><SmallSampleBadge /></div>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════ TAB: TEMPORAL ══════════════════ */}
        {tab === 'temporal' && (
          <div className="space-y-5">
            {/* By Day of Week */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ریسک بر اساس روز هفته</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/50">
                        <th className="text-right py-2 font-medium">روز</th>
                        <th className="text-center py-2 font-medium">معاملات</th>
                        <th className="text-center py-2 font-medium">میانگین ریسک</th>
                        <th className="text-center py-2 font-medium">میانه ریسک</th>
                        <th className="text-center py-2 font-medium">میانگین R</th>
                        <th className="text-center py-2 font-medium">نرخ برد</th>
                        <th className="text-center py-2 font-medium">نقض قانون</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDay.map(d => (
                        <tr key={d.day} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-2.5 font-medium">{d.label}</td>
                          <td className="text-center py-2.5">
                            {d.count}
                            {d.smallSample && <span className="text-amber-500 mr-1">*</span>}
                          </td>
                          <td className="text-center py-2.5 tabular-nums">{pct(d.avgRisk)}</td>
                          <td className="text-center py-2.5 tabular-nums">{pct(d.medianRisk)}</td>
                          <td className="text-center py-2.5 tabular-nums">{r(d.avgR)}</td>
                          <td className="text-center py-2.5 tabular-nums">
                            {d.winRate !== null ? pct(d.winRate * 100) : '—'}
                          </td>
                          <td className={`text-center py-2.5 tabular-nums ${d.violations > 0 ? 'text-destructive' : ''}`}>
                            {d.violations}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">* نمونه کم — نتایج با احتیاط تفسیر شود</p>
              </CardContent>
            </Card>

            {/* By Session */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ریسک بر اساس سشن</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {bySession.filter(s => s.count > 0).map(s => (
                  <div key={s.session} className="rounded-xl border border-border bg-muted/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{s.label}</p>
                      <div className="flex items-center gap-2">
                        {s.smallSample && <SmallSampleBadge />}
                        <span className="text-xs text-muted-foreground">{s.count} معامله</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">میانگین ریسک</p>
                        <p className="font-medium tabular-nums">{pct(s.avgRisk)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">میانگین R</p>
                        <p className="font-medium tabular-nums">{r(s.avgR)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">نرخ برد</p>
                        <p className="font-medium tabular-nums">{s.winRate !== null ? pct(s.winRate * 100) : '—'}</p>
                      </div>
                    </div>
                    {s.violations > 0 && (
                      <p className="text-xs text-destructive mt-2">{s.violations} نقض قانون ریسک</p>
                    )}
                  </div>
                ))}
                {bySession.every(s => s.count === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">سشن معاملاتی در داده‌ها ثبت نشده</p>
                )}
              </CardContent>
            </Card>

            {/* Symbol Heatmap */}
            {heatmapBySymbol.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">ریسک بر اساس نماد</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {heatmapBySymbol.map(cell => {
                      const maxRisk = heatmapBySymbol[0].avgRisk ?? 1;
                      const width = cell.avgRisk !== null ? (cell.avgRisk / maxRisk) * 100 : 0;
                      return (
                        <div key={cell.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{cell.label}</span>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span>{cell.count} معامله</span>
                              <span className="font-medium text-foreground tabular-nums">{pct(cell.avgRisk)}</span>
                              {cell.winRate !== null && <span className={cell.winRate >= 0.5 ? 'text-green-500' : 'text-destructive'}>{pct(cell.winRate * 100)}</span>}
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Weekly */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ریسک هفتگی</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {weeklyExposures.slice(-12).reverse().map(w => (
                    <div key={w.weekStart} className={`rounded-xl p-3 border text-xs ${
                      w.riskEscalation ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/10'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{new Date(w.weekStart).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })}</span>
                        <div className="flex items-center gap-2">
                          {w.riskEscalation && <span className="text-amber-500 flex items-center gap-0.5"><Flame className="w-3 h-3" />افزایش ریسک</span>}
                          <span className="text-muted-foreground">{w.tradeCount} معامله</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-muted-foreground">ریسک کل</p>
                          <p className="font-medium tabular-nums">{pct(w.totalRiskPct)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">بیشترین ریسک</p>
                          <p className="font-medium tabular-nums">{pct(w.maxRiskPct)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">سود/زیان</p>
                          <p className={`font-medium tabular-nums ${w.totalPnl !== null ? (w.totalPnl >= 0 ? 'text-green-500' : 'text-destructive') : ''}`}>
                            {w.totalPnl !== null ? `$${w.totalPnl.toFixed(0)}` : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {weeklyExposures.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">معامله‌ای ثبت نشده</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════ TAB: R:R ══════════════════ */}
        {tab === 'rr' && (
          <div className="space-y-5">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">تحلیل ریسک به ریوارد</CardTitle>
                <CardDescription className="text-xs">{rrAnalysis.count} معامله بسته‌شده</CardDescription>
              </CardHeader>
              <CardContent>
                <StatRow label="میانگین R:R برنامه‌ریزی‌شده" value={num(rrAnalysis.avgPlannedRR)} />
                <StatRow label="میانگین R:R واقعی" value={num(rrAnalysis.avgActualRR)} />
                <StatRow label="میانگین R در سودها"
                  value={r(rrAnalysis.avgWinR)}
                  highlight={rrAnalysis.avgWinR !== null && rrAnalysis.avgWinR > 0 ? 'text-green-500' : ''} />
                <StatRow label="میانگین R در ضررها"
                  value={r(rrAnalysis.avgLossR)}
                  highlight={rrAnalysis.avgLossR !== null ? 'text-destructive' : ''} />
                {rrAnalysis.rrDeviation !== null && (
                  <StatRow
                    label="انحراف R:R (برنامه→واقعی)"
                    value={`${rrAnalysis.rrDeviation >= 0 ? '+' : ''}${(rrAnalysis.rrDeviation * 100).toFixed(0)}%`}
                    highlight={Math.abs(rrAnalysis.rrDeviation) > 0.3 ? 'text-amber-500' : ''} />
                )}
              </CardContent>
            </Card>

            {/* By Session R:R */}
            {rrAnalysis.bySession.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">R:R بر اساس سشن</CardTitle></CardHeader>
                <CardContent>
                  {rrAnalysis.bySession.map(s => (
                    <StatRow key={s.session} label={s.label}
                      value={`${num(s.avgPlanned)} → ${num(s.avgActual)}`}
                      sub={`${s.count} معامله`} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* By Day R:R */}
            {rrAnalysis.byDayOfWeek.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">R:R بر اساس روز هفته</CardTitle></CardHeader>
                <CardContent>
                  {rrAnalysis.byDayOfWeek.map(d => (
                    <StatRow key={d.day} label={d.label}
                      value={`${num(d.avgPlanned)} → ${num(d.avgActual)}`}
                      sub={`${d.count} معامله`} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Drawdown Curve */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  منحنی افت سرمایه
                </CardTitle>
              </CardHeader>
              <CardContent>
                {drawdown.curve.length > 0 ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl p-3 border border-border bg-muted/10">
                        <p className="text-muted-foreground">بیشترین افت تاریخی</p>
                        <p className="text-lg font-bold tabular-nums text-destructive">{pct(drawdown.maxDrawdownPct)}</p>
                        {drawdown.maxDrawdownDate && <p className="text-muted-foreground">{new Date(drawdown.maxDrawdownDate).toLocaleDateString('fa-IR')}</p>}
                      </div>
                      <div className="rounded-xl p-3 border border-border bg-muted/10">
                        <p className="text-muted-foreground">زمان بازیابی</p>
                        <p className="text-lg font-bold tabular-nums">{drawdown.recoveryDays !== null ? `${drawdown.recoveryDays} روز` : '—'}</p>
                      </div>
                    </div>
                    {/* Simple mini chart */}
                    <div className="h-20 flex items-end gap-px">
                      {drawdown.curve.slice(-30).map((pt, i) => (
                        <div key={i} className="flex-1 bg-destructive/40 rounded-t"
                          style={{ height: `${Math.min(100, pt.drawdownPct * 5)}%` }}
                          title={`${pt.date}: -${pt.drawdownPct.toFixed(1)}%`} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">آخرین ۳۰ معامله — ارتفاع = شدت افت</p>
                    {drawdown.smallSample && <SmallSampleBadge />}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">داده کافی برای رسم منحنی وجود ندارد</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════ TAB: VIOLATIONS ══════════════════ */}
        {tab === 'violations' && (
          <div className="space-y-5">
            {/* Insights */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  الگوهای ریسک شخصی
                </CardTitle>
                <CardDescription className="text-xs">بر اساس تاریخچه معاملات شما — برای تأیید یا رد کلیک کنید</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {filteredTrades.length < 10
                      ? 'حداقل ۱۰ معامله برای تشخیص الگو لازم است'
                      : 'الگوی قابل توجهی یافت نشد'}
                  </p>
                ) : insights.filter(ins => !dismissedInsights.has(ins.id)).map(ins => (
                  <div key={ins.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                    <button
                      onClick={() => setExpandedInsight(expandedInsight === ins.id ? null : ins.id)}
                      className="w-full flex items-start justify-between p-3 text-right">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium">{ins.title}</p>
                          <InsightConfidenceBadge level={ins.confidence} />
                        </div>
                        <p className="text-xs text-muted-foreground">{ins.description}</p>
                      </div>
                      {expandedInsight === ins.id
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 mr-2" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 mr-2" />}
                    </button>
                    {expandedInsight === ins.id && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border/50">
                        <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                          <div>
                            <p className="text-muted-foreground">نمونه</p>
                            <p className="font-medium">{ins.examples}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">بازه زمانی</p>
                            <p className="font-medium text-[10px]">{ins.dateRange}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">اطمینان</p>
                            <p className="font-medium">{ins.confidence === 'high' ? 'بالا' : ins.confidence === 'medium' ? 'متوسط' : 'پایین'}</p>
                          </div>
                        </div>
                        <div className="text-xs bg-muted/20 rounded-lg p-2.5">
                          <p className="text-muted-foreground mb-1">شواهد:</p>
                          <p>{ins.evidence}</p>
                        </div>
                        {ins.examples < 5 && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-500">
                            <AlertTriangle className="w-3 h-3" />
                            نمونه کم — این الگو ممکن است قابل اعتماد نباشد
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => approveInsight(ins)}
                            className="gap-1.5 text-xs h-7">
                            <Bookmark className="w-3.5 h-3.5 text-primary" />ذخیره به‌عنوان قانون
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => dismissInsight(ins.id)}
                            className="gap-1.5 text-xs h-7 text-muted-foreground">
                            <X className="w-3.5 h-3.5" />رد
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Violations Log */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">تاریخچه نقض قوانین</CardTitle>
                  <CardDescription className="text-xs">{violations.length} مورد ثبت شده</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={scanAndLogViolations}
                  disabled={scanning || !profile} className="gap-1.5 text-xs h-7 shrink-0">
                  {scanning
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <ScanLine className="w-3.5 h-3.5" />}
                  اسکن معاملات
                </Button>
              </CardHeader>
              <CardContent>
                {violations.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="w-8 h-8 text-green-500/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">موردی ثبت نشده</p>
                    <p className="text-xs text-muted-foreground mt-1">نقض‌های قانون ریسک به صورت خودکار یا دستی ثبت می‌شوند</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {violations.map(v => (
                      <div key={v.id} className="rounded-xl border border-border bg-muted/10 p-3">
                        {editViolation === v.id ? (
                          <ViolationEditForm
                            violation={v}
                            form={violationForm}
                            setForm={setViolationForm}
                            onSave={() => saveViolation(violationForm)}
                            onCancel={() => setEditViolation(null)}
                          />
                        ) : (
                          <div>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                  <p className="text-sm font-medium">{v.ruleLabel}</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{v.date}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => { setEditViolation(v.id); setViolationForm({ intent: v.intent, explanation: v.explanation, lesson: v.lesson }); }}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteViolation(v.id)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              {v.plannedValue !== null && (
                                <span className="bg-muted/30 px-2 py-0.5 rounded-full">برنامه: {v.plannedValue.toFixed(2)}</span>
                              )}
                              {v.actualValue !== null && (
                                <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">واقعی: {v.actualValue.toFixed(2)}</span>
                              )}
                              {v.intent && (
                                <span className={`px-2 py-0.5 rounded-full ${
                                  v.intent === 'intentional' ? 'bg-amber-500/10 text-amber-500' :
                                  v.intent === 'accidental' ? 'bg-destructive/10 text-destructive' :
                                  'bg-muted/30 text-muted-foreground'
                                }`}>
                                  {v.intent === 'intentional' ? 'عمدی' : v.intent === 'accidental' ? 'تصادفی' : v.intent === 'exceptional' ? 'استثنایی' : 'نامشخص'}
                                </span>
                              )}
                            </div>
                            {v.explanation && <p className="text-xs text-muted-foreground mt-1.5 bg-muted/20 rounded-lg px-2.5 py-1.5">{v.explanation}</p>}
                            {v.lesson && <p className="text-xs text-primary mt-1 bg-primary/5 rounded-lg px-2.5 py-1.5">💡 {v.lesson}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════ TAB: GROUPS ══════════════════ */}
        {tab === 'groups' && (
          <div className="space-y-5">
            {/* Add Group */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  گروه ریسک همبسته جدید
                </CardTitle>
                <CardDescription className="text-xs">نمادهایی که ریسکشان با هم مرتبط است را گروه‌بندی کنید</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">نام گروه *</label>
                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      placeholder="مثال: جفت‌ارزهای دلاری"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">نمادها (با کاما جدا کنید)</label>
                    <input value={newGroupSymbols} onChange={e => setNewGroupSymbols(e.target.value)}
                      placeholder="EURUSD, GBPUSD, AUDUSD"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">حداکثر ریسک گروه (%)</label>
                    <input type="number" value={newGroupMaxRisk} onChange={e => setNewGroupMaxRisk(e.target.value)}
                      placeholder="۵"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                </div>
                <Button size="sm" onClick={addGroup} disabled={!newGroupName.trim()} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />افزودن گروه
                </Button>
              </CardContent>
            </Card>

            {/* Groups List */}
            {groups.length === 0 ? (
              <div className="text-center py-10">
                <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">هیچ گروهی تعریف نشده</p>
                <p className="text-xs text-muted-foreground/60 mt-1">گروه‌ها به شما کمک می‌کنند ریسک کل نمادهای مرتبط را کنترل کنید</p>
              </div>
            ) : groups.map(group => {
              const syms: string[] = group.symbols ? JSON.parse(group.symbols) : [];
              const groupTrades = filteredTrades.filter(t => syms.length === 0 || syms.includes(t.symbol));
              const totalRisk = groupTrades.reduce((s, t) => s + (t.riskPercentage ?? 0), 0);
              const isOver = group.maxGroupRiskPct !== null && totalRisk > group.maxGroupRiskPct;
              return (
                <Card key={group.id} className={isOver ? 'border-destructive/50' : ''}>
                  <CardHeader className="flex-row items-start justify-between pb-2">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        {group.name}
                        {isOver && (
                          <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                            از حد مجاز بالاتر
                          </span>
                        )}
                      </CardTitle>
                      {syms.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {syms.map(s => (
                            <span key={s} className="text-[10px] bg-muted/30 px-1.5 py-0.5 rounded-full">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteGroup(group.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="rounded-lg p-3 bg-muted/10 border border-border">
                        <p className="text-muted-foreground">ریسک کل (بازه انتخابی)</p>
                        <p className={`text-lg font-bold tabular-nums mt-0.5 ${isOver ? 'text-destructive' : 'text-foreground'}`}>
                          {pct(totalRisk)}
                        </p>
                      </div>
                      <div className="rounded-lg p-3 bg-muted/10 border border-border">
                        <p className="text-muted-foreground">حداکثر مجاز</p>
                        <p className="text-lg font-bold tabular-nums mt-0.5">
                          {group.maxGroupRiskPct !== null ? pct(group.maxGroupRiskPct) : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg p-3 bg-muted/10 border border-border">
                        <p className="text-muted-foreground">تعداد معامله</p>
                        <p className="text-lg font-bold tabular-nums mt-0.5">{groupTrades.length}</p>
                      </div>
                    </div>
                    {group.maxGroupRiskPct !== null && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">استفاده از حد</span>
                          <span className={`font-medium ${isOver ? 'text-destructive' : ''}`}>
                            {((totalRisk / group.maxGroupRiskPct) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isOver ? 'bg-destructive' : 'bg-primary'}`}
                            style={{ width: `${Math.min(100, (totalRisk / group.maxGroupRiskPct) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* No data message */}
        {filteredTrades.length === 0 && (
          <div className="text-center py-16">
            <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">معامله‌ای در این بازه زمانی یافت نشد</p>
            <p className="text-sm text-muted-foreground/60 mt-1">معاملات را وارد کنید تا تحلیل ریسک آغاز شود</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────
function InsightConfidenceBadge({ level }: { level: RiskInsight['confidence'] }) {
  const map = { high: ['bg-green-500/10 text-green-500', 'بالا'], medium: ['bg-amber-500/10 text-amber-500', 'متوسط'], low: ['bg-muted/30 text-muted-foreground', 'پایین'] };
  const [cls, label] = map[level];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function ViolationEditForm({ violation, form, setForm, onSave, onCancel }: {
  violation: RiskViolation;
  form: Partial<RiskViolation>;
  setForm: (f: Partial<RiskViolation>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{violation.ruleLabel}</p>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">نوع</label>
        <div className="flex gap-1.5 flex-wrap">
          {[['intentional', 'عمدی'], ['accidental', 'تصادفی'], ['exceptional', 'استثنایی'], ['unclear', 'نامشخص']].map(([v, l]) => (
            <button key={v} onClick={() => setForm({ ...form, intent: v as RiskViolation['intent'] })}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${form.intent === v ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">توضیح</label>
        <textarea value={form.explanation ?? ''} onChange={e => setForm({ ...form, explanation: e.target.value })}
          rows={2} placeholder="چرا این اتفاق افتاد؟"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">درس آموخته‌شده</label>
        <textarea value={form.lesson ?? ''} onChange={e => setForm({ ...form, lesson: e.target.value })}
          rows={2} placeholder="چه درسی گرفتید؟"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} className="gap-1"><Check className="w-3.5 h-3.5" />ذخیره</Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="gap-1"><X className="w-3.5 h-3.5" />لغو</Button>
      </div>
    </div>
  );
}
