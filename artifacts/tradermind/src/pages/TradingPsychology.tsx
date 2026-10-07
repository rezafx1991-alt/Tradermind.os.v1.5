/**
 * TradingPsychology.tsx
 * ماژول تحلیل رفتار و روانشناسی معامله‌گر
 * مسیر: /analytics/psychology
 *
 * ۵ تب:
 * ۱. عملکرد ذهنی   — همبستگی حالت ذهنی با نتایج
 * ۲. اشتباهات      — الگوهای تکرارشونده + روند
 * ۳. عادات          — بهترین/بدترین زمان، روز، سشن
 * ۴. گزارش هوشمند  — رفتارهای مثبت/منفی + پیشنهادها
 * ۵. امتیاز انضباط — ۴ مؤلفه از ۱۰۰
 *
 * هیچ فایل موجودی تغییر نکرده است.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  analyzeMentalPerformance,
  analyzeRecurringMistakeTrends,
  computeDisciplineScore,
  generateSmartReport,
  MentalPerfData,
  MistakeTrend,
  DisciplineScoreResult,
  SmartReport,
} from '../services/psychologyService';
import { getByDay, getByHour, getBySession, getOvertradingAnalysis } from '../services/performanceService';
import { useAppStore } from '../store/useAppStore';
import { db, DailyJournal } from '../db/database';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, ReferenceLine, Cell,
} from 'recharts';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Clock, Calendar, BarChart3, Lightbulb, RefreshCw, ChevronRight,
  Activity, Target, Shield, Zap, BookOpen, Info, ArrowUp, ArrowDown, Minus,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function pct(n: number | null): string {
  return n !== null ? `${Math.round(n * 100)}٪` : '—';
}
function scoreColor(s: number): string {
  return s >= 75 ? '#22c55e' : s >= 55 ? '#eab308' : s >= 35 ? '#f97316' : '#ef4444';
}
function gradeBadge(g: string): string {
  return g === 'A' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : g === 'B' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    : g === 'C' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    : g === 'D' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    : 'bg-red-500/10 text-red-400 border-red-500/20';
}

// ── Gauge SVG component ───────────────────────────────────────────────────────

function ScoreGauge({ score, color, size = 120 }: { score: number; color: string; size?: number }) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size * 0.08;
  const startAngle = -210;
  const sweepAngle = 240;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  function arcPath(angle: number) {
    const rad = toRad(angle);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function describeArc(startDeg: number, endDeg: number) {
    const s = arcPath(startDeg);
    const e = arcPath(endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const endAngle = startAngle + (sweepAngle * score) / 100;
  const bg = describeArc(startAngle, startAngle + sweepAngle);
  const fg = score > 0 ? describeArc(startAngle, endAngle) : '';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={bg} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={strokeWidth} strokeLinecap="round" />
      {fg && <path d={fg} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />}
      <text x={cx} y={cy + 5} textAnchor="middle" fill="currentColor" fontSize={size * 0.2} fontWeight="bold">
        {score}
      </text>
      <text x={cx} y={cy + size * 0.18} textAnchor="middle" fill="currentColor" fillOpacity={0.5} fontSize={size * 0.09}>
        از ۱۰۰
      </text>
    </svg>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingState({ message: _message = 'در حال تحلیل...' }: { message?: string }) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300 py-4">
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border border-border rounded-xl p-4 space-y-2">
            <div className="h-5 w-32 bg-primary/10 rounded animate-pulse" />
            <div className="h-8 w-16 bg-primary/10 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="border border-border rounded-xl p-4 space-y-2">
        <div className="h-5 w-40 bg-primary/10 rounded animate-pulse" />
        <div className="h-4 w-full bg-primary/10 rounded animate-pulse" />
        <div className="h-4 w-3/4 bg-primary/10 rounded animate-pulse" />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{desc}</p>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = '' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// تب ۱: عملکرد ذهنی
// ────────────────────────────────────────────────────────────────────────────

function MentalPerformanceTab() {
  const [data, setData] = useState<MentalPerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [trades, journals] = await Promise.all([db.trades.toArray(), db.dailyJournals.toArray()]);
        setData(analyzeMentalPerformance(trades, journals as DailyJournal[]));
      } catch {
        // DB error — component will render empty state gracefully
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState message="در حال تحلیل حالت ذهنی..." />;
  if (!data || data.journaledDays < 3) {
    return <EmptyState icon={Brain} title="داده ژورنال کافی نیست"
      desc="برای مشاهده تحلیل عملکرد ذهنی، حداقل ۳ روز ژورنال همراه با معامله نیاز است. هر روز حال خود را در بخش ژورنال روزانه ثبت کنید." />;
  }

  const mentals = [
    { key: 'mood',   label: 'خلق و خو',   data: data.byMood,   color: '#8b5cf6', opt: data.optimalMood },
    { key: 'energy', label: 'انرژی',       data: data.byEnergy, color: '#3b82f6', opt: data.optimalEnergy },
    { key: 'focus',  label: 'تمرکز',       data: data.byFocus,  color: '#22c55e', opt: data.optimalFocus },
    { key: 'stress', label: 'استرس',       data: data.byStress, color: '#ef4444', opt: data.warningStress },
  ];

  // آمار سرعتی
  const avgWRJournal = data.dailyRecords.length > 0
    ? data.dailyRecords.filter(r => r.winRate !== null).reduce((s, r) => s + (r.winRate ?? 0), 0) /
      data.dailyRecords.filter(r => r.winRate !== null).length : null;

  return (
    <div className="space-y-6">
      {/* آمار */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="روزهای ژورنال‌شده" value={`${data.journaledDays}`} sub={`از ${data.totalTradingDays} روز معاملاتی`} />
        <StatCard label="پوشش ژورنال" value={`${Math.round(data.coverageRate * 100)}٪`}
          color={data.coverageRate > 0.6 ? 'text-emerald-400' : 'text-orange-400'} />
        <StatCard label="خلق بهینه"
          value={data.optimalMood !== null ? `سطح ${data.optimalMood}` : '—'}
          sub="بیشترین نرخ برد" />
        <StatCard label="استرس هشداردهنده"
          value={data.warningStress !== null ? `سطح ${data.warningStress}` : '—'}
          sub="کمترین نرخ برد" color="text-red-400" />
      </div>

      {/* نمودارهای ۴ متریک */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {mentals.map(m => (
          <Card key={m.key} className="overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                {m.label}
                {m.opt !== null && (
                  <Badge variant="outline" className="text-[10px] font-normal" style={{ borderColor: m.color, color: m.color }}>
                    بهینه: سطح {m.opt}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={m.data} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="level" tickFormatter={v => `${v}`} tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }} />
                  <YAxis tickFormatter={v => `${Math.round(v * 100)}٪`} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.6 }} domain={[0, 1]} />
                  <Tooltip
                    formatter={(v: number) => [`${Math.round(v * 100)}٪`, 'نرخ برد']}
                    labelFormatter={l => `سطح ${l}`}
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="winRate" name="نرخ برد" radius={[4, 4, 0, 0]}>
                    {m.data.map((_, i) => <Cell key={i} fill={m.color} opacity={0.7 + i * 0.06} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* تعداد معامله روزانه و عملکرد */}
      {data.tradeCountCorrelation.length >= 2 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">تعداد معامله روزانه و نرخ برد</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.tradeCountCorrelation} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="count" tickFormatter={v => v >= 6 ? '۶+' : `${v}`} tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }} label={{ value: 'تعداد معامله', position: 'insideBottom', offset: -2, fontSize: 10, opacity: 0.5 }} />
                <YAxis tickFormatter={v => `${Math.round(v * 100)}٪`} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.6 }} domain={[0, 1]} />
                <Tooltip
                  formatter={(v: number) => [`${Math.round(v * 100)}٪`, 'نرخ برد']}
                  labelFormatter={l => `${l} معامله در روز`}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={0.5} stroke="#6b7280" strokeDasharray="4 4" opacity={0.5} />
                <Bar dataKey="winRate" name="نرخ برد" radius={[4, 4, 0, 0]}>
                  {data.tradeCountCorrelation.map((d, i) => (
                    <Cell key={i} fill={(d.winRate ?? 0) >= 0.5 ? '#22c55e' : '#ef4444'} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* بینش */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-400 mb-1">چطور از این اطلاعات استفاده کنم؟</p>
            <p className="text-muted-foreground">هر روز قبل از شروع معامله حال خود را در ژورنال روزانه ثبت کنید. وقتی استرس شما در سطح هشداردهنده است، تعداد معاملات را کاهش دهید یا اصلاً معامله نکنید.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// تب ۲: اشتباهات تکرارشونده
// ────────────────────────────────────────────────────────────────────────────

function RecurringMistakesTab() {
  const [trends, setTrends] = useState<MistakeTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const trades = await db.trades.toArray();
        setTrends(analyzeRecurringMistakeTrends(trades));
      } catch {
        // DB error — component will render empty state gracefully
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState message="در حال تحلیل اشتباهات..." />;
  if (trends.length === 0) {
    return <EmptyState icon={AlertTriangle} title="اشتباه قابل توجهی یافت نشد"
      desc="برای تشخیص الگوهای اشتباه، حداقل ۵ معامله بسته با ریویو نیاز است. ریویو پس از هر معامله را فراموش نکنید." />;
  }

  const TrendIcon = ({ trend }: { trend: MistakeTrend['trend'] }) => {
    if (trend === 'improving') return <ArrowDown className="h-4 w-4 text-emerald-400" />;
    if (trend === 'worsening') return <ArrowUp className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const trendBg = (t: MistakeTrend['trend']) =>
    t === 'improving' ? 'border-emerald-500/20 bg-emerald-500/5' :
    t === 'worsening' ? 'border-red-500/20 bg-red-500/5' : 'border-border bg-card';

  const sevColor = (s: string) =>
    s === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
    s === 'medium' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
    'bg-muted text-muted-foreground';

  return (
    <div className="space-y-4">
      {/* خلاصه */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-red-500/5 border-red-500/20 p-3 text-center">
          <p className="text-xl font-bold text-red-400">{trends.filter(t => t.trend === 'worsening').length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">بدتر شده</p>
        </div>
        <div className="rounded-lg border bg-muted/30 border-border p-3 text-center">
          <p className="text-xl font-bold">{trends.filter(t => t.trend === 'stable').length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">ثابت مانده</p>
        </div>
        <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">{trends.filter(t => t.trend === 'improving').length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">بهتر شده</p>
        </div>
      </div>

      {/* کارت هر اشتباه */}
      <div className="space-y-3">
        {trends.map(m => (
          <div key={m.id} className={`rounded-xl border transition-all ${trendBg(m.trend)}`}>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{m.title}</h3>
                    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${sevColor(m.severity)}`}>
                      {m.severity === 'high' ? 'بحرانی' : m.severity === 'medium' ? 'متوسط' : 'کم'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TrendIcon trend={m.trend} />
                  <span className={`text-xs font-medium ${m.trend === 'improving' ? 'text-emerald-400' : m.trend === 'worsening' ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {m.trendLabel}
                  </span>
                </div>
              </div>

              {/* مقایسه نیمه اول/دوم */}
              <div className="mt-3 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground mb-1">نیمه اول معاملات</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-orange-400 transition-all" style={{ width: `${Math.round(m.firstHalfCount / Math.max(m.firstHalfCount, m.secondHalfCount, 1) * 100)}٪` }} />
                    </div>
                    <span className="text-xs font-medium w-6 shrink-0">{m.firstHalfCount}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground mb-1">نیمه دوم معاملات</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${m.trend === 'improving' ? 'bg-emerald-400' : m.trend === 'worsening' ? 'bg-red-400' : 'bg-muted-foreground'}`}
                        style={{ width: `${Math.round(m.secondHalfCount / Math.max(m.firstHalfCount, m.secondHalfCount, 1) * 100)}٪` }} />
                    </div>
                    <span className="text-xs font-medium w-6 shrink-0">{m.secondHalfCount}</span>
                  </div>
                </div>
              </div>

              {/* همبستگی احساسات */}
              {m.emotionCorrelations.length > 0 && (
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">احساسات مرتبط:</span>
                  {m.emotionCorrelations.map(e => (
                    <Badge key={e.emotion} variant="outline" className="text-[10px] h-4 px-1.5">
                      {e.emotion} ({e.count})
                    </Badge>
                  ))}
                </div>
              )}

              {/* فرکانس ماهانه */}
              {m.monthlyFreq.length >= 2 && (
                <div className="mt-3 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={m.monthlyFreq} barSize={14}>
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.5 }} />
                      <Tooltip
                        formatter={(v: number) => [v, 'تعداد']}
                        contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                      />
                      <Bar dataKey="count" fill={m.trend === 'improving' ? '#22c55e' : m.trend === 'worsening' ? '#ef4444' : '#6b7280'} radius={[3, 3, 0, 0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// تب ۳: عادات معاملاتی
// ────────────────────────────────────────────────────────────────────────────

function TradingHabitsTab() {
  const tradingTimeMode = useAppStore(s => s.tradingTimeMode);
  const brokerUtcOffsetMinutes = useAppStore(s => s.brokerUtcOffsetMinutes);
  const [byDay, setByDay] = useState<ReturnType<typeof getByDay>>([]);
  const [byHour, setByHour] = useState<ReturnType<typeof getByHour>>([]);
  const [bySession, setBySession] = useState<ReturnType<typeof getBySession>>([]);
  const [overtrading, setOvertrading] = useState<ReturnType<typeof getOvertradingAnalysis> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const trades = await db.trades.toArray();
        setByDay(getByDay(trades));
        setByHour(getByHour(trades));
        setBySession(getBySession(trades));
        setOvertrading(getOvertradingAnalysis(trades, 4));
      } catch {
        // DB error — component will render empty state gracefully
      } finally {
        setLoading(false);
      }
    })();
  }, [tradingTimeMode, brokerUtcOffsetMinutes]);

  if (loading) return <LoadingState message="در حال بارگذاری عادات..." />;

  const hasData = byDay.length > 0 || byHour.length > 0 || bySession.length > 0;
  if (!hasData) {
    return <EmptyState icon={Calendar} title="داده کافی نیست"
      desc="برای تحلیل عادات معاملاتی، حداقل ۱۰ معامله بسته نیاز است." />;
  }

  const bestDay  = byDay.length ? [...byDay].filter(d => d.winRate !== null).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0] : null;
  const worstDay = byDay.length ? [...byDay].filter(d => d.winRate !== null).sort((a, b) => (a.winRate ?? 1) - (b.winRate ?? 1))[0] : null;
  const bestHour  = byHour.length ? [...byHour].filter(h => h.winRate !== null && h.count >= 2).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0] : null;
  const worstHour = byHour.length ? [...byHour].filter(h => h.winRate !== null && h.count >= 2).sort((a, b) => (a.winRate ?? 1) - (b.winRate ?? 1))[0] : null;
  const bestSess  = bySession.length ? [...bySession].filter(s => s.winRate !== null).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0] : null;

  const dayChartData = byDay.map(d => ({
    name: d.dayName, winRate: +(((d.winRate ?? 0) * 100).toFixed(1)), count: d.count, avgR: d.avgR,
  }));
  const hourChartData = byHour.map(h => ({
    name: `${String(h.hour).padStart(2, '0')}`, winRate: +(((h.winRate ?? 0) * 100).toFixed(1)), count: h.count, avgR: h.avgR,
  }));
  const sessChartData = bySession.map(s => ({
    name: s.label, winRate: +(((s.winRate ?? 0) * 100).toFixed(1)), count: s.count, avgR: s.avgR,
  }));

  return (
    <div className="space-y-6">
      {/* برگه‌های خلاصه */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {bestDay && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> بهترین روز</p>
            <p className="font-bold mt-1">{bestDay.dayName}</p>
            <p className="text-xs text-emerald-400">{pct(bestDay.winRate)} نرخ برد</p>
          </div>
        )}
        {worstDay && worstDay.dayName !== bestDay?.dayName && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> بدترین روز</p>
            <p className="font-bold mt-1">{worstDay.dayName}</p>
            <p className="text-xs text-red-400">{pct(worstDay.winRate)} نرخ برد</p>
          </div>
        )}
        {bestHour && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> بهترین ساعت</p>
            <p className="font-bold mt-1">{bestHour.label}</p>
            <p className="text-xs text-blue-400">{pct(bestHour.winRate)} نرخ برد</p>
          </div>
        )}
        {worstHour && worstHour.label !== bestHour?.label && (
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> بدترین ساعت</p>
            <p className="font-bold mt-1">{worstHour.label}</p>
            <p className="text-xs text-orange-400">{pct(worstHour.winRate)} نرخ برد</p>
          </div>
        )}
        {bestSess && (
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><BarChart3 className="h-3 w-3" /> بهترین سشن</p>
            <p className="font-bold mt-1">{bestSess.label}</p>
            <p className="text-xs text-purple-400">{pct(bestSess.winRate)} نرخ برد</p>
          </div>
        )}
        {overtrading && (
          <div className={`rounded-lg border p-3 ${overtrading.daysOverThreshold > 0 ? 'border-orange-500/20 bg-orange-500/5' : 'border-border bg-card'}`}>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> روزهای Overtrade</p>
            <p className={`font-bold mt-1 ${overtrading.daysOverThreshold > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>{overtrading.daysOverThreshold}</p>
            <p className="text-xs text-muted-foreground">از {overtrading.tradingDays} روز</p>
          </div>
        )}
      </div>

      {/* نمودار روزهای هفته */}
      {dayChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> عملکرد بر اساس روز هفته</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dayChartData} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.7 }} />
                <YAxis tickFormatter={v => `${v}٪`} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.6 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(v: number, n: string) => [n === 'winRate' ? `${v}٪` : v, n === 'winRate' ? 'نرخ برد' : 'معاملات']}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" opacity={0.4} />
                <Bar dataKey="winRate" name="نرخ برد" radius={[4, 4, 0, 0]}>
                  {dayChartData.map((d, i) => (
                    <Cell key={i} fill={d.winRate >= 50 ? '#22c55e' : '#ef4444'} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* نمودار ساعت */}
      {hourChartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> عملکرد بر اساس ساعت</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hourChartData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.6 }} />
                <YAxis tickFormatter={v => `${v}٪`} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.6 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(v: number) => [`${v}٪`, 'نرخ برد']}
                  labelFormatter={l => `ساعت ${l}:00`}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" opacity={0.4} />
                <Bar dataKey="winRate" name="نرخ برد" radius={[3, 3, 0, 0]}>
                  {hourChartData.map((d, i) => <Cell key={i} fill={d.winRate >= 50 ? '#22c55e' : '#ef4444'} opacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* نمودار سشن */}
      {sessChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> عملکرد بر اساس سشن معاملاتی</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={sessChartData} barSize={48}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.7 }} />
                <YAxis tickFormatter={v => `${v}٪`} tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.6 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(v: number) => [`${v}٪`, 'نرخ برد']}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" opacity={0.4} />
                <Bar dataKey="winRate" name="نرخ برد" radius={[4, 4, 0, 0]}>
                  {sessChartData.map((d, i) => <Cell key={i} fill={d.winRate >= 50 ? '#22c55e' : d.winRate >= 40 ? '#eab308' : '#ef4444'} opacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// تب ۴: گزارش هوشمند
// ────────────────────────────────────────────────────────────────────────────

function SmartReportTab() {
  const [report, setReport] = useState<SmartReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const [trades, journals] = await Promise.all([db.trades.toArray(), db.dailyJournals.toArray()]);
      const r = generateSmartReport(trades, journals as DailyJournal[]);
      setReport(r);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const priorityOrder = { high: 0, medium: 1, low: 2 };

  function ReportSection({ title, items, icon: Icon, colorClass, emptyMsg }:
    { title: string; items: SmartReport['positives']; icon: React.ElementType; colorClass: string; emptyMsg: string }) {
    return (
      <div>
        <h3 className={`text-sm font-semibold flex items-center gap-2 mb-3 ${colorClass}`}>
          <Icon className="h-4 w-4" /> {title}
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 px-4 rounded-lg border border-dashed">{emptyMsg}</p>
        ) : (
          <div className="space-y-2">
            {[...items].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).map((item, i) => (
              <div key={i} className={`rounded-lg border p-3 ${colorClass.includes('emerald') ? 'border-emerald-500/15 bg-emerald-500/5' : colorClass.includes('red') ? 'border-red-500/15 bg-red-500/5' : 'border-blue-500/15 bg-blue-500/5'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                    {item.evidence && <p className="text-[10px] text-muted-foreground/70 mt-1">{item.evidence}</p>}
                  </div>
                  {item.priority === 'high' && (
                    <Badge variant="outline" className="mr-auto shrink-0 text-[10px] h-4 px-1.5 bg-red-500/10 text-red-400 border-red-500/20">مهم</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!generated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Lightbulb className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">گزارش هوشمند معاملاتی</h3>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm">تمام معاملات، ریویوها و ژورنال‌ها را تحلیل می‌کند و گزارشی جامع از رفتارهای مثبت، منفی و پیشنهادهای بهبود ارائه می‌دهد.</p>
        </div>
        <Button size="lg" className="gap-2" onClick={generate} disabled={loading}>
          {loading ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />در حال تحلیل...</> : <><Lightbulb className="h-4 w-4" />تولید گزارش</>}
        </Button>
      </div>
    );
  }

  if (!report) return null;

  const healthColor = report.overallHealth >= 70 ? 'text-emerald-400' : report.overallHealth >= 45 ? 'text-yellow-400' : 'text-red-400';
  const healthBorder = report.overallHealth >= 70 ? 'border-emerald-500/20 bg-emerald-500/5' : report.overallHealth >= 45 ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-red-500/20 bg-red-500/5';

  return (
    <div className="space-y-6">
      {/* هدر گزارش */}
      <div className={`rounded-xl border ${healthBorder} p-4`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-muted-foreground">سلامت کلی معاملاتی</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-4xl font-bold ${healthColor}`}>{report.overallHealth}</span>
              <span className="text-muted-foreground">/۱۰۰</span>
              <Badge variant="outline" className={`text-xs ${healthBorder}`}>{report.healthLabel}</Badge>
            </div>
          </div>
          <div className="text-left text-xs text-muted-foreground space-y-0.5">
            <p>{report.closedTrades} معامله بسته</p>
            <p>{report.tradingDays} روز معاملاتی</p>
            <p className="opacity-60">{new Date(report.generatedAt).toLocaleDateString('fa-IR')}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{report.summary}</p>
      </div>

      {/* سه ستون گزارش */}
      <div className="space-y-6">
        <ReportSection
          title={`رفتارهای مثبت (${report.positives.length})`}
          items={report.positives}
          icon={CheckCircle2}
          colorClass="text-emerald-400"
          emptyMsg="هنوز رفتار مثبت کافی برای گزارش وجود ندارد. بیشتر معامله کنید و ریویو بنویسید."
        />
        <ReportSection
          title={`رفتارهای منفی (${report.negatives.length})`}
          items={report.negatives}
          icon={AlertTriangle}
          colorClass="text-red-400"
          emptyMsg="رفتار منفی قابل توجهی شناسایی نشد."
        />
        <ReportSection
          title={`پیشنهادهای بهبود (${report.suggestions.length})`}
          items={report.suggestions}
          icon={Lightbulb}
          colorClass="text-blue-400"
          emptyMsg="پیشنهاد خاصی برای الان وجود ندارد."
        />
      </div>

      {/* دکمه بروزرسانی */}
      <Button variant="outline" className="gap-2 w-full" onClick={generate} disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        بروزرسانی گزارش
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// تب ۵: امتیاز انضباط
// ────────────────────────────────────────────────────────────────────────────

function DisciplineScoreTab() {
  const [result, setResult] = useState<DisciplineScoreResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const trades = await db.trades.toArray();
        setResult(computeDisciplineScore(trades));
      } catch {
        // DB error — component will render empty state gracefully
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState message="در حال محاسبه امتیاز انضباط..." />;
  if (!result || result.closedCount < 5) {
    return <EmptyState icon={Target} title="داده کافی نیست"
      desc="برای محاسبه امتیاز انضباط حداقل ۵ معامله بسته نیاز است." />;
  }

  const radarData = result.components.map(c => ({ label: c.labelFa, value: c.score }));

  return (
    <div className="space-y-6">
      {/* امتیاز کلی */}
      <div className="flex flex-col sm:flex-row items-center gap-6 rounded-xl border bg-card p-6">
        <div className="flex flex-col items-center gap-2">
          <ScoreGauge score={result.total} color={scoreColor(result.total)} size={140} />
          <Badge variant="outline" className={`text-sm px-3 ${gradeBadge(result.grade)}`}>
            رتبه {result.grade} — {result.label}
          </Badge>
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="font-bold text-lg">امتیاز انضباط معاملاتی</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            این امتیاز از ۴ مؤلفه اصلی محاسبه می‌شود و نشان می‌دهد تا چه حد به عنوان یک معامله‌گر منضبط عمل می‌کنید.
          </p>
          {result.sampleWarning && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2 border border-yellow-500/20">
              <Info className="h-3.5 w-3.5 shrink-0" />
              داده کم — امتیاز با {result.closedCount} معامله محاسبه شده. دقت با معاملات بیشتر افزایش می‌یابد.
            </div>
          )}
        </div>
      </div>

      {/* نمودار رادار */}
      {radarData.length === 4 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">نمای کلی ۴ مؤلفه</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="currentColor" opacity={0.15} />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.8 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} />
                <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* کارت‌های ۴ مؤلفه */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {result.components.map(c => (
          <div key={c.id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm">{c.labelFa}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <ScoreGauge score={c.score} color={c.color} size={72} />
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${gradeBadge(c.grade)}`}>
                  رتبه {c.grade}
                </Badge>
              </div>
            </div>
            {/* نوار */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">امتیاز</span>
                <span className="font-medium" style={{ color: c.color }}>{c.score}/۱۰۰</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${c.score}٪`, background: c.color }} />
              </div>
            </div>
            {/* جزئیات */}
            <div className="space-y-1">
              {c.details.filter(Boolean).map((d, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
                  {d}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* پیشنهادهای بهبود */}
      {result.suggestions.length > 0 && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <h4 className="font-semibold text-sm text-blue-400 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> پیشنهادهای بهبود امتیاز
          </h4>
          <div className="space-y-2">
            {result.suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// صفحه اصلی
// ────────────────────────────────────────────────────────────────────────────

export default function TradingPsychology() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">
      {/* هدر */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="h-7 w-7 text-primary" />
          روانشناسی معاملاتی
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          تحلیل رفتار، کشف الگوهای تکرارشونده و ارتقاء انضباط معاملاتی بر اساس داده‌های واقعی
        </p>
      </div>

      {/* تب‌ها */}
      <Tabs defaultValue="mental" className="space-y-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="flex w-max min-w-full sm:grid sm:grid-cols-5 h-auto p-1">
            <TabsTrigger value="mental"    className="py-2 px-3 text-xs gap-1.5 whitespace-nowrap"><Brain className="h-3.5 w-3.5" />ذهنی</TabsTrigger>
            <TabsTrigger value="mistakes"  className="py-2 px-3 text-xs gap-1.5 whitespace-nowrap"><AlertTriangle className="h-3.5 w-3.5" />اشتباهات</TabsTrigger>
            <TabsTrigger value="habits"    className="py-2 px-3 text-xs gap-1.5 whitespace-nowrap"><Clock className="h-3.5 w-3.5" />عادات</TabsTrigger>
            <TabsTrigger value="report"    className="py-2 px-3 text-xs gap-1.5 whitespace-nowrap"><Lightbulb className="h-3.5 w-3.5" />گزارش</TabsTrigger>
            <TabsTrigger value="discipline" className="py-2 px-3 text-xs gap-1.5 whitespace-nowrap"><Target className="h-3.5 w-3.5" />انضباط</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="mental"     className="mt-0"><MentalPerformanceTab /></TabsContent>
        <TabsContent value="mistakes"   className="mt-0"><RecurringMistakesTab /></TabsContent>
        <TabsContent value="habits"     className="mt-0"><TradingHabitsTab /></TabsContent>
        <TabsContent value="report"     className="mt-0"><SmartReportTab /></TabsContent>
        <TabsContent value="discipline" className="mt-0"><DisciplineScoreTab /></TabsContent>
      </Tabs>
    </div>
  );
}
