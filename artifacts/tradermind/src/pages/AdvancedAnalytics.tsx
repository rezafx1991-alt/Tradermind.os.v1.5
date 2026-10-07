/**
 * AdvancedAnalytics.tsx — ماژول تحلیل پیشرفته معاملات
 * از سرویس‌های موجود استفاده می‌کند — کاملاً آفلاین و بدون backend
 */
import { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '../components/ui/skeleton';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/db/database';
import type { Trade, Strategy } from '@/db/database';
import {
  getByDay, getByHour, getBySession, getBySymbol, getBySetup,
  getPerformanceProfile,
} from '@/services/performanceService';
import {
  computeAnalytics, getDateRange, filterTradesByRange,
} from '@/services/analyticsService';
import type { TimeRangeKey, PnlPoint } from '@/services/analyticsService';
import {
  TrendingUp, TrendingDown, Target, Clock, Flame,
  Award, Calendar, Activity, RefreshCw, AlertTriangle, BarChart2, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';

// ─── Helpers ──────────────────────────────────────────────────────
function isWin(t: Trade)  { return t.result === 'win' || t.result === 'partial-win'; }
function isLoss(t: Trade) { return t.result === 'loss' || t.result === 'partial-loss'; }
function isClosed(t: Trade) { return t.status === 'closed'; }

function fmtR(v: number | null, dec = 2): string {
  if (v === null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(dec)}R`;
}
function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${(v * 100).toFixed(1)}٪`;
}
function fmtMoney(v: number | null): string {
  if (v === null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}
function fmtDuration(minutes: number): string {
  if (minutes < 60)   return `${Math.round(minutes)} دقیقه`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} ساعت`;
  return `${(minutes / 1440).toFixed(1)} روز`;
}
function winRateBarColor(rate: number | null): string {
  if (rate === null) return '#6366f1';
  const pct = rate * 100;
  if (pct >= 55) return '#22c55e';
  if (pct >= 45) return '#f59e0b';
  return '#ef4444';
}

// ─── Sub-components ───────────────────────────────────────────────
function MetricCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function WinRateBar({ win, loss, be }: { win: number; loss: number; be: number }) {
  const total = win + loss + be;
  if (total === 0) return null;
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px mt-1">
      <div className="bg-green-500" style={{ width: `${(win / total) * 100}%` }} />
      {be > 0 && <div className="bg-muted-foreground/40" style={{ width: `${(be / total) * 100}%` }} />}
      <div className="bg-destructive/70" style={{ width: `${(loss / total) * 100}%` }} />
    </div>
  );
}

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow px-3 py-2 text-xs text-right space-y-0.5">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
      )}
    >
      {children}
    </button>
  );
}

// ─── Types ────────────────────────────────────────────────────────
type TabKey = 'summary' | 'timing' | 'assets' | 'equity';
type RangeKey = Exclude<TimeRangeKey, 'custom'> | 'all';

// ─── Main Component ───────────────────────────────────────────────
export default function AdvancedAnalytics() {
  const tradingTimeMode = useAppStore(s => s.tradingTimeMode);
  const brokerUtcOffsetMinutes = useAppStore(s => s.brokerUtcOffsetMinutes);
  const [range, setRange]       = useState<RangeKey>('all');
  const [tab, setTab]           = useState<TabKey>('summary');
  const [allTrades, setAllTrades]   = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [trades, strats] = await Promise.all([
          db.trades.toArray(),
          db.strategies.toArray(),
        ]);
        if (!cancelled) { setAllTrades(trades); setStrategies(strats); }
      } catch {
        // DB read error — show empty state instead of infinite loading
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Filtered trades ──────────────────────────────────────────
  const trades = useMemo(() => {
    if (range === 'all') return allTrades;
    const { from, to } = getDateRange(range as Exclude<TimeRangeKey, 'custom'>);
    return filterTradesByRange(allTrades, from, to);
  }, [allTrades, range, tradingTimeMode, brokerUtcOffsetMinutes]);

  const closedTrades = useMemo(() => trades.filter(isClosed), [trades]);

  // ── Core metrics ─────────────────────────────────────────────
  const profile   = useMemo(() => getPerformanceProfile(trades), [trades]);
  const analytics = useMemo(
    () => computeAnalytics(trades, [], strategies),
    [trades, strategies],
  );

  // ── Timing breakdowns ────────────────────────────────────────
  const byDay     = useMemo(() => getByDay(trades), [trades, tradingTimeMode, brokerUtcOffsetMinutes]);
  const byHour    = useMemo(() => getByHour(trades), [trades, tradingTimeMode, brokerUtcOffsetMinutes]);
  const bySession = useMemo(() => getBySession(trades), [trades, tradingTimeMode, brokerUtcOffsetMinutes]);

  // ── Asset breakdowns ─────────────────────────────────────────
  const bySymbol  = useMemo(() => getBySymbol(trades).slice(0, 12), [trades]);
  const bySetup   = useMemo(() => getBySetup(trades).slice(0, 8), [trades]);

  // ── Consecutive streaks ──────────────────────────────────────
  const { maxConsecWins, maxConsecLosses } = useMemo(() => {
    const sorted = [...closedTrades].sort(
      (a, b) => (a.closedAt ?? a.openedAt) - (b.closedAt ?? b.openedAt),
    );
    let maxW = 0, maxL = 0, curW = 0, curL = 0;
    sorted.forEach(t => {
      if (isWin(t))       { curW++; curL = 0; maxW = Math.max(maxW, curW); }
      else if (isLoss(t)) { curL++; curW = 0; maxL = Math.max(maxL, curL); }
      else                { curW = 0; curL = 0; }
    });
    return { maxConsecWins: maxW, maxConsecLosses: maxL };
  }, [closedTrades]);

  // ── Average trade duration ───────────────────────────────────
  const avgDurationMin = useMemo(() => {
    const w = closedTrades.filter(t => t.closedAt !== null);
    if (!w.length) return null;
    return w.reduce((s, t) => s + (t.closedAt! - t.openedAt) / 60000, 0) / w.length;
  }, [closedTrades]);

  // ── Strategy perf with resolved names ────────────────────────
  const strategyPerf = useMemo(() => {
    const stratMap = new Map(strategies.map(s => [s.id, s.name]));
    return analytics.strategyPerf
      .map(sp => ({
        ...sp,
        name: sp.strategyId ? (stratMap.get(sp.strategyId) ?? sp.strategyName) : 'بدون استراتژی',
      }))
      .slice(0, 8);
  }, [analytics.strategyPerf, strategies]);

  // ── Pie data ─────────────────────────────────────────────────
  const pieData = useMemo(() => [
    { name: 'برد', value: profile.winCount,      color: '#22c55e' },
    { name: 'ضرر', value: profile.lossCount,     color: '#ef4444' },
    { name: 'سر به سر', value: profile.breakEvenCount, color: '#6b7280' },
  ].filter(d => d.value > 0), [profile]);

  // ── Chart data ───────────────────────────────────────────────
  const dayData = useMemo(() =>
    byDay.map(d => ({
      name: d.dayName,
      'نرخ برد': d.winRate !== null ? +(d.winRate * 100).toFixed(1) : 0,
      'تعداد': d.count,
      fill: winRateBarColor(d.winRate),
    })), [byDay]);

  const hourData = useMemo(() =>
    byHour.map(h => ({
      name: `${String(h.hour).padStart(2, '0')}`,
      'نرخ برد': h.winRate !== null ? +(h.winRate * 100).toFixed(1) : 0,
      'تعداد': h.count,
      fill: winRateBarColor(h.winRate),
    })), [byHour]);

  const equityCurve = analytics.pnlCurve;

  // ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-300">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="p-4 max-w-2xl mx-auto pt-12">
        <div className="rounded-xl border bg-card p-10 text-center space-y-3">
          <BarChart2 className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="text-lg font-semibold">معامله‌ای ثبت نشده</p>
          <p className="text-sm text-muted-foreground">
            {range !== 'all' ? 'در بازه انتخابی معامله‌ای وجود ندارد.' : 'ابتدا معاملات خود را در ژورنال ثبت کنید.'}
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Tab: Summary
  // ══════════════════════════════════════════════════════════════
  const summaryTab = (
    <div className="space-y-4">
      {/* Row 1: Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard
          label="نرخ برد"
          value={fmtPct(profile.winRate)}
          sub={`${profile.winCount} برد از ${profile.count} معامله بسته`}
          color={profile.winRate !== null && profile.winRate >= 0.5 ? 'text-green-500' : 'text-destructive'}
          icon={Target}
        />
        <MetricCard
          label="کل سود/زیان"
          value={fmtMoney(profile.totalPnL)}
          sub={profile.totalPnL !== null && profile.totalPnL >= 0 ? 'سودده کلی' : 'زیان‌ده کلی'}
          color={profile.totalPnL !== null ? (profile.totalPnL >= 0 ? 'text-green-500' : 'text-destructive') : ''}
          icon={TrendingUp}
        />
        <MetricCard
          label="میانگین R"
          value={fmtR(profile.avgR)}
          sub={`انتظار: ${fmtR(profile.expectancy)}`}
          color={profile.avgR !== null ? (profile.avgR > 0 ? 'text-green-500' : 'text-destructive') : ''}
          icon={Activity}
        />
        <MetricCard
          label="بیشترین برد متوالی"
          value={`${maxConsecWins} معامله`}
          sub="پشت‌سرهم سودده"
          color="text-green-500"
          icon={Flame}
        />
        <MetricCard
          label="بیشترین ضرر متوالی"
          value={`${maxConsecLosses} معامله`}
          sub="پشت‌سرهم زیان‌ده"
          color={maxConsecLosses >= 3 ? 'text-destructive' : ''}
          icon={TrendingDown}
        />
        <MetricCard
          label="میانگین مدت معامله"
          value={avgDurationMin !== null ? fmtDuration(avgDurationMin) : '—'}
          sub="از ورود تا خروج"
          icon={Clock}
        />
      </div>

      {/* Row 2: Advanced metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="بهترین معامله"
          value={fmtR(profile.maxWin)}
          color="text-green-500"
          icon={Award}
        />
        <MetricCard
          label="بدترین معامله"
          value={fmtR(profile.maxLoss)}
          color="text-destructive"
          icon={TrendingDown}
        />
        <MetricCard
          label="Profit Factor"
          value={profile.profitFactor !== null ? profile.profitFactor.toFixed(2) : '—'}
          sub="نسبت کل سود به ضرر"
          color={profile.profitFactor !== null ? (profile.profitFactor > 1 ? 'text-green-500' : 'text-destructive') : ''}
        />
        <MetricCard
          label="Max Drawdown"
          value={profile.maxDrawdownPct !== null ? `${profile.maxDrawdownPct.toFixed(1)}٪` : '—'}
          sub="حداکثر افت سرمایه"
          color={profile.maxDrawdownPct !== null && profile.maxDrawdownPct > 20 ? 'text-destructive' : ''}
        />
      </div>

      {/* Win/Loss Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">توزیع نتایج معاملات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {pieData.length > 0 && (
              <div className="w-28 h-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={28} outerRadius={52}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0];
                        return (
                          <div className="rounded-lg border bg-card px-2 py-1 text-xs">
                            {d.name}: {d.value}
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex-1 space-y-2">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold tabular-nums">{d.value}</span>
                </div>
              ))}
              <WinRateBar win={profile.winCount} loss={profile.lossCount} be={profile.breakEvenCount} />
              <p className="text-[10px] text-muted-foreground pt-1">
                سبز = برد · خاکستری = سر به سر · قرمز = ضرر
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-insights */}
      {analytics.insights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">بینش‌های خودکار</h3>
          {analytics.insights.map((ins, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg border p-3 text-sm leading-relaxed',
                ins.type === 'positive' && 'bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400',
                ins.type === 'negative' && 'bg-destructive/5 border-destructive/20 text-destructive',
                ins.type === 'neutral'  && 'bg-muted/40 border-border',
              )}
            >
              {ins.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // Tab: Timing
  // ══════════════════════════════════════════════════════════════
  const timingTab = (
    <div className="space-y-4">
      {/* Day of Week */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            عملکرد بر اساس روز هفته
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dayData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">داده کافی موجود نیست</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={dayData} margin={{ top: 5, right: 5, bottom: 5, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} unit="٪" domain={[0, 100]} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="نرخ برد" radius={[4, 4, 0, 0]}>
                    {dayData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Ranked list */}
              <div className="space-y-2 pt-1">
                {[...byDay]
                  .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))
                  .map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-20 text-muted-foreground shrink-0 text-xs">{d.dayName}</span>
                      <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${d.winRate !== null ? d.winRate * 100 : 0}%`,
                            background: winRateBarColor(d.winRate),
                          }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-right w-24 shrink-0">
                        {d.winRate !== null ? `${(d.winRate * 100).toFixed(0)}٪` : '—'}
                        {' '}({d.count} معامله)
                      </span>
                    </div>
                  ))}
              </div>

              {/* Best/Worst day callouts */}
              {byDay.length >= 2 && (() => {
                const sorted = [...byDay].filter(d => d.count >= 2);
                if (sorted.length < 2) return null;
                const best  = [...sorted].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
                const worst = [...sorted].sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0))[0];
                return (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">بهترین روز</p>
                      <p className="font-bold text-green-500">{best.dayName}</p>
                      <p className="text-xs text-muted-foreground">{best.winRate !== null ? `${(best.winRate * 100).toFixed(0)}٪ برد` : '—'}</p>
                    </div>
                    <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">ضعیف‌ترین روز</p>
                      <p className="font-bold text-destructive">{worst.dayName}</p>
                      <p className="text-xs text-muted-foreground">{worst.winRate !== null ? `${(worst.winRate * 100).toFixed(0)}٪ برد` : '—'}</p>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Hour of Day */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            عملکرد بر اساس ساعت ورود
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hourData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">داده کافی موجود نیست</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={175}>
                <BarChart data={hourData} margin={{ top: 5, right: 5, bottom: 5, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'currentColor' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} unit="٪" domain={[0, 100]} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="نرخ برد" radius={[3, 3, 0, 0]}>
                    {hourData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {(() => {
                const withData = hourData.filter(h => h['تعداد'] >= 2);
                if (withData.length < 2) return null;
                const best  = [...withData].sort((a, b) => b['نرخ برد'] - a['نرخ برد'])[0];
                const worst = [...withData].sort((a, b) => a['نرخ برد'] - b['نرخ برد'])[0];
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">بهترین ساعت</p>
                      <p className="font-bold text-green-500">{best.name}:00</p>
                      <p className="text-xs text-muted-foreground">{best['نرخ برد'].toFixed(0)}٪ برد</p>
                    </div>
                    <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">ضعیف‌ترین ساعت</p>
                      <p className="font-bold text-destructive">{worst.name}:00</p>
                      <p className="text-xs text-muted-foreground">{worst['نرخ برد'].toFixed(0)}٪ برد</p>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Session Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            عملکرد بر اساس سشن معاملاتی
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bySession.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground space-y-1">
              <p>سشن معاملاتی برای معاملات تعیین نشده است.</p>
              <p className="text-xs">هنگام ثبت معامله، سشن (لندن / نیویورک / آسیا) را مشخص کنید.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bySession.map((s, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.label}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{s.count} معامله</span>
                      <span className={cn(
                        'font-semibold',
                        s.winRate !== null && s.winRate >= 0.5 ? 'text-green-500' : 'text-destructive',
                      )}>
                        {fmtPct(s.winRate)} برد
                      </span>
                      {s.avgR !== null && (
                        <span className={s.avgR >= 0 ? 'text-green-500' : 'text-destructive'}>
                          {fmtR(s.avgR)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${s.winRate !== null ? s.winRate * 100 : 0}%`,
                        background: winRateBarColor(s.winRate),
                      }}
                    />
                  </div>
                  {s.topSetup && (
                    <p className="text-[10px] text-muted-foreground">بهترین ستاپ: {s.topSetup}</p>
                  )}
                  <WinRateBar win={s.winCount} loss={s.lossCount} be={s.breakEvenCount} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // Tab: Assets
  // ══════════════════════════════════════════════════════════════
  const assetsTab = (
    <div className="space-y-4">
      {/* Symbol Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            عملکرد بر اساس نماد معاملاتی
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bySymbol.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">داده کافی موجود نیست</p>
          ) : (
            <div className="space-y-3">
              {bySymbol.map((s, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono font-semibold">{s.symbol}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{s.count} معامله</span>
                      <span className={cn(
                        'font-semibold',
                        s.winRate !== null && s.winRate >= 0.5 ? 'text-green-500' : 'text-destructive',
                      )}>
                        {fmtPct(s.winRate)}
                      </span>
                      {s.totalPnL !== null && (
                        <span className={cn('tabular-nums', s.totalPnL >= 0 ? 'text-green-500' : 'text-destructive')}>
                          {fmtMoney(s.totalPnL)}
                        </span>
                      )}
                    </div>
                  </div>
                  <WinRateBar win={s.winCount} loss={s.lossCount} be={s.breakEvenCount} />
                  {(s.bestSession) && (
                    <p className="text-[10px] text-muted-foreground">
                      بهترین سشن: {s.bestSession}
                      {s.bestSetup ? ` · بهترین ستاپ: ${s.bestSetup}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Award className="w-4 h-4" />
            عملکرد بر اساس استراتژی
          </CardTitle>
        </CardHeader>
        <CardContent>
          {strategyPerf.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">داده کافی موجود نیست</p>
          ) : (
            <div className="space-y-3">
              {strategyPerf.map((s, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[160px]">{s.name}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{s.total} معامله</span>
                      <span className={cn('font-semibold', s.winRate >= 50 ? 'text-green-500' : 'text-destructive')}>
                        {s.winRate.toFixed(0)}٪
                      </span>
                      <span className={cn('tabular-nums', s.totalPnl >= 0 ? 'text-green-500' : 'text-destructive')}>
                        {fmtMoney(s.totalPnl)}
                      </span>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.winRate}%`,
                        background: s.winRate >= 50 ? '#22c55e' : '#ef4444',
                      }}
                    />
                  </div>
                  {s.avgR !== null && (
                    <p className="text-[10px] text-muted-foreground">میانگین R: {fmtR(s.avgR)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup / Pattern Performance */}
      {bySetup.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              عملکرد بر اساس نوع ستاپ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bySetup.map((s, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs font-medium">{s.label}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">{s.count} معامله</span>
                      <span className={cn(
                        'font-semibold',
                        s.winRate !== null && s.winRate >= 0.5 ? 'text-green-500' : 'text-destructive',
                      )}>
                        {fmtPct(s.winRate)}
                      </span>
                    </div>
                  </div>
                  <WinRateBar win={s.winCount} loss={s.lossCount} be={s.breakEvenCount} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // Tab: Equity Curve
  // ══════════════════════════════════════════════════════════════
  const equityTab = (
    <div className="space-y-4">
      {/* Equity Curve */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            منحنی سرمایه (Equity Curve)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {equityCurve.length < 2 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              برای نمایش منحنی سرمایه، به حداقل ۲ معامله بسته نیاز است.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={equityCurve} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  label={{ value: 'شماره معامله', position: 'insideBottomRight', offset: -5, fontSize: 9 }}
                />
                <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as PnlPoint;
                    return (
                      <div className="rounded-lg border border-border bg-card shadow px-3 py-2 text-xs text-right">
                        <p className="font-medium mb-1">معامله #{d.index} — {d.symbol}</p>
                        <p>این معامله: <span className={d.pnl >= 0 ? 'text-green-500' : 'text-destructive'}>{fmtMoney(d.pnl)}</span></p>
                        <p>تجمعی: <span className={d.cumulative >= 0 ? 'text-green-500' : 'text-destructive'}>{fmtMoney(d.cumulative)}</span></p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={equityCurve.length <= 40}
                  activeDot={{ r: 4 }}
                  name="سرمایه تجمعی"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* P/L per trade */}
      {equityCurve.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">سود/زیان هر معامله</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={175}>
              <BarChart data={equityCurve} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                <XAxis dataKey="index" tick={{ fontSize: 9, fill: 'currentColor' }} />
                <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as PnlPoint;
                    return (
                      <div className="rounded-lg border bg-card px-2 py-1 text-xs text-right">
                        <p>{d.symbol}: <span className={d.pnl >= 0 ? 'text-green-500' : 'text-destructive'}>{fmtMoney(d.pnl)}</span></p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="pnl" name="P/L" radius={[2, 2, 0, 0]}>
                  {equityCurve.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Win/Loss chart */}
      {equityCurve.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">نمودار برد/ضرر</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-36 h-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      outerRadius={65}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-card px-2 py-1 text-xs">
                            {payload[0].name}: {payload[0].value}
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-3">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-muted-foreground flex-1">{d.name}</span>
                    <span className="font-bold tabular-nums">{d.value}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ({profile.count > 0 ? ((d.value / profile.count) * 100).toFixed(0) : 0}٪)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // Final Render
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="p-3 sm:p-4 max-w-3xl mx-auto space-y-4 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            تحلیل پیشرفته معاملات
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {closedTrades.length} معامله بسته · {trades.length} کل
          </p>
        </div>
        <Select value={range} onValueChange={v => setRange(v as RangeKey)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه زمان‌ها</SelectItem>
            <SelectItem value="week">این هفته</SelectItem>
            <SelectItem value="month">این ماه</SelectItem>
            <SelectItem value="3months">۳ ماه اخیر</SelectItem>
            <SelectItem value="year">امسال</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sample size warning */}
      {profile.sampleWarning && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          کمتر از ۲۰ معامله ثبت‌شده — آمار ممکن است نمایانگر عملکرد واقعی نباشد.
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 overflow-x-auto">
        <TabBtn active={tab === 'summary'} onClick={() => setTab('summary')}>خلاصه</TabBtn>
        <TabBtn active={tab === 'timing'}  onClick={() => setTab('timing')}>زمان‌بندی</TabBtn>
        <TabBtn active={tab === 'assets'}  onClick={() => setTab('assets')}>دارایی‌ها</TabBtn>
        <TabBtn active={tab === 'equity'}  onClick={() => setTab('equity')}>منحنی سرمایه</TabBtn>
      </div>

      {/* Content */}
      {tab === 'summary' && summaryTab}
      {tab === 'timing'  && timingTab}
      {tab === 'assets'  && assetsTab}
      {tab === 'equity'  && equityTab}
    </div>
  );
}
