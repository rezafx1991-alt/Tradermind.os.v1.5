import { useState, useEffect, useMemo } from "react";
import { Skeleton } from "../components/ui/skeleton";
import { tradeService } from "../services/tradeService";
import { journalService } from "../services/journalService";
import { db } from "../db/database";
import { Trade, DailyJournal, Strategy } from "../db/database";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Activity, AlertCircle, Info,
  Minus, BarChart2, BookOpen, Zap, Brain, Clock,
} from "lucide-react";
import { cn } from "../lib/utils";
import { t } from "../lib/i18n";
import {
  TimeRangeKey, AnalyticsData,
  computeAnalytics, getDateRange, filterTradesByRange,
} from "../services/analyticsService";
import { useAppStore } from "../store/useAppStore";
import { getTradingDateRange } from "../lib/tradingTime";

// ================================================================
// رنگ‌های ثابت (سازگار با dark/light mode)
// ================================================================
const C = {
  win:     "#10b981",
  loss:    "#ef4444",
  neutral: "#6366f1",
  primary: "#8b5cf6",
  amber:   "#f59e0b",
  blue:    "#3b82f6",
  muted:   "#9ca3af",
  grid:    "rgba(156,163,175,0.15)",
};

const RANGE_OPTIONS: { key: TimeRangeKey; label: string }[] = [
  { key: "today",    label: t.reports.today },
  { key: "week",     label: t.reports.thisWeek },
  { key: "month",    label: t.reports.thisMonth },
  { key: "3months",  label: t.reports.last3Months },
  { key: "year",     label: t.reports.thisYear },
  { key: "custom",   label: t.reports.custom },
];

// ================================================================
// کامپوننت‌های کمکی
// ================================================================

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground">
        {icon || <BarChart2 className="w-6 h-6" />}
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{text}</p>
    </div>
  );
}

function SectionCard({
  title, desc, note, minTrades, actualTrades, children, className,
}: {
  title: string; desc?: string; note?: string;
  minTrades?: number; actualTrades: number;
  children: React.ReactNode; className?: string;
}) {
  const empty = minTrades !== undefined && actualTrades < minTrades;
  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-5 px-6">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
      </CardHeader>
      <Separator />
      <CardContent className="p-6">
        {empty ? (
          <EmptyState text={`${t.reports.minTradesNeeded.replace("{n}", String(minTrades))}`} />
        ) : (
          <>
            {children}
            {note && (
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-dashed flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {note}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label, value, sub, color, icon,
}: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground gap-1">
        <span>{label}</span>
        {icon && <span className="opacity-60">{icon}</span>}
      </div>
      <div className={cn("text-2xl font-bold tracking-tight", color)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function PnlText({ value, prefix = "" }: { value: number; prefix?: string }) {
  const pos = value >= 0;
  return (
    <span className={cn("font-semibold", pos ? "text-emerald-500" : "text-red-500")}>
      {pos ? "+" : ""}{prefix}{value.toFixed(2)}
    </span>
  );
}

function WinRateBar({ winRate, total }: { winRate: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const color = winRate >= 60 ? C.win : winRate >= 40 ? C.amber : C.loss;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${winRate}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium w-10 text-end">{winRate.toFixed(0)}٪</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label, prefix = "" }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[];
  label?: string | number; prefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold mb-1 text-foreground">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{prefix}{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ================================================================
// صفحه اصلی
// ================================================================

export default function Reports() {
  const tradingTimeMode = useAppStore(s => s.tradingTimeMode);
  const brokerUtcOffsetMinutes = useAppStore(s => s.brokerUtcOffsetMinutes);
  const [allTrades, setAllTrades]   = useState<Trade[]>([]);
  const [journals, setJournals]     = useState<DailyJournal[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading]       = useState(true);
  const [timeRange, setTimeRange]   = useState<TimeRangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [customApplied, setCustomApplied] = useState({ from: "", to: "" });

  useEffect(() => {
    Promise.all([
      tradeService.getAllTrades(),
      journalService.getAllJournals(),
      db.strategies.toArray(),
    ]).then(([tr, jn, st]) => {
      setAllTrades(tr);
      setJournals(jn);
      setStrategies(st);
      setLoading(false);
    });
  }, []);

  // فیلتر بر اساس بازه زمانی
  const trades = useMemo(() => {
    let from: number, to: number;
    if (timeRange === "custom") {
      from = customApplied.from ? getTradingDateRange(customApplied.from).from : 0;
      to   = customApplied.to   ? getTradingDateRange(customApplied.to).to : Date.now();
    } else {
      const r = getDateRange(timeRange);
      from = r.from; to = r.to;
    }
    return filterTradesByRange(allTrades, from, to);
  }, [allTrades, timeRange, customApplied, tradingTimeMode, brokerUtcOffsetMinutes]);

  const analytics: AnalyticsData = useMemo(
    () => computeAnalytics(trades, journals, strategies),
    [trades, journals, strategies],
  );

  const { summary, pnlCurve, strategyPerf, dayOfWeekPerf, emotionPerf,
          dailyStatePerf, adherencePerf, timeSlotPerf, behaviorInsight, insights } = analytics;

  const fmt = (n: number | null, digits = 2) =>
    n == null ? "—" : n.toFixed(digits);

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="border-b pb-5 space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ===== هدر ===== */}
      <div className="border-b pb-5">
        <h1 className="text-3xl font-bold tracking-tight">{t.reports.title}</h1>
        <p className="text-muted-foreground mt-1">{t.reports.subtitle}</p>
      </div>

      {/* ===== فیلتر بازه زمانی ===== */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">{t.reports.timeRange}:</span>
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setTimeRange(opt.key)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-sm border transition-all font-medium",
                  timeRange === opt.key
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {timeRange === "custom" && (
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <div className="flex items-center gap-2 text-sm">
                <label className="text-muted-foreground">{t.reports.fromDate}</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-muted-foreground">{t.reports.toDate}</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                onClick={() => setCustomApplied({ from: customFrom, to: customTo })}
                className="px-4 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg font-medium"
              >
                {t.reports.apply}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== اگر داده‌ای نیست ===== */}
      {trades.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <EmptyState text={t.reports.noTradesInRange} icon={<Activity className="w-6 h-6" />} />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ===== کارت‌های خلاصه ===== */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
              {t.reports.summary}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label={t.reports.totalTrades}  value={summary.total} icon={<Activity className="w-4 h-4" />} />
              <StatCard label={t.reports.wins}         value={summary.wins}  color="text-emerald-500"
                        sub={`${summary.total > 0 ? ((summary.wins / Math.max(summary.wins+summary.losses+summary.breakeven,1))*100).toFixed(0) : 0}٪ از بسته‌شده‌ها`}
                        icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} />
              <StatCard label={t.reports.losses}       value={summary.losses} color="text-red-500"
                        icon={<TrendingDown className="w-4 h-4 text-red-500" />} />
              <StatCard label={t.reports.breakeven}    value={summary.breakeven}
                        icon={<Minus className="w-4 h-4" />} />
              <StatCard label={t.reports.winRate}
                        value={`${summary.winRate.toFixed(1)}٪`}
                        color={summary.winRate >= 50 ? "text-emerald-500" : "text-red-500"}
                        sub="از معاملات بسته‌شده" />
              <StatCard label={t.reports.totalPnl}
                        value={`${summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl.toFixed(2)}`}
                        color={summary.totalPnl >= 0 ? "text-emerald-500" : "text-red-500"} />
              <StatCard label={t.reports.avgR}
                        value={summary.avgR == null ? "—" : `${summary.avgR >= 0 ? "+" : ""}${summary.avgR.toFixed(2)}R`}
                        color={summary.avgR == null ? "" : summary.avgR >= 1 ? "text-emerald-500" : summary.avgR >= 0 ? "text-amber-500" : "text-red-500"} />
              <StatCard label={t.reports.avgRisk}
                        value={summary.avgRisk == null ? "—" : `${summary.avgRisk.toFixed(2)}٪`} />
              <StatCard label={t.reports.bestTrade}
                        value={summary.bestTrade == null ? "—" : `+${summary.bestTrade.toFixed(2)}`}
                        color="text-emerald-500"
                        icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} />
              <StatCard label={t.reports.worstTrade}
                        value={summary.worstTrade == null ? "—" : summary.worstTrade.toFixed(2)}
                        color="text-red-500"
                        icon={<TrendingDown className="w-4 h-4 text-red-500" />} />
            </div>
          </div>

          {/* ===== منحنی رشد حساب ===== */}
          <SectionCard
            title={t.reports.pnlCurve}
            desc={t.reports.pnlCurveDesc}
            minTrades={1}
            actualTrades={pnlCurve.length}
          >
            <div style={{ direction: "ltr" }} className="h-[280px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnlCurve} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="index" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} label={{ value: t.reports.tradeNumber, position: "insideBottomRight", offset: -5, fill: C.muted, fontSize: 11 }} />
                  <YAxis stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(0)} />
                  <ReferenceLine y={0} stroke={C.muted} strokeDasharray="3 3" />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="cumulative" name={t.reports.cumPnl} stroke={C.primary} strokeWidth={2.5} fillOpacity={1} fill="url(#pnlGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* ===== عملکرد بر اساس استراتژی ===== */}
          <SectionCard
            title={t.reports.strategySection}
            minTrades={1}
            actualTrades={strategyPerf.length}
          >
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="py-2 px-2 text-right font-medium">{t.reports.strategyName}</th>
                    <th className="py-2 px-2 text-center font-medium">{t.reports.tradeCount}</th>
                    <th className="py-2 px-2 text-center font-medium">{t.reports.wins}</th>
                    <th className="py-2 px-2 text-center font-medium">{t.reports.losses}</th>
                    <th className="py-2 px-2 text-center font-medium">{t.reports.winRate}</th>
                    <th className="py-2 px-2 text-center font-medium">{t.reports.totalPnl}</th>
                    <th className="py-2 px-2 text-center font-medium">{t.reports.avgR}</th>
                    <th className="py-2 px-2 text-center font-medium">{t.reports.adherence}</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyPerf.map((s, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium">{s.strategyName}</td>
                      <td className="py-3 px-2 text-center">{s.total}</td>
                      <td className="py-3 px-2 text-center text-emerald-500">{s.wins}</td>
                      <td className="py-3 px-2 text-center text-red-500">{s.losses}</td>
                      <td className="py-3 px-2 text-center">
                        <WinRateBar winRate={s.winRate} total={s.total} />
                      </td>
                      <td className="py-3 px-2 text-center">
                        <PnlText value={s.totalPnl} />
                      </td>
                      <td className="py-3 px-2 text-center text-sm">
                        {s.avgR == null ? "—" : `${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(2)}R`}
                      </td>
                      <td className="py-3 px-2 text-center text-sm">
                        {s.avgAdherence == null ? "—" : `${s.avgAdherence.toFixed(0)}٪`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ===== عملکرد بر اساس روز هفته ===== */}
          <SectionCard
            title={t.reports.dayOfWeekSection}
            desc={t.reports.dayOfWeekDesc}
            minTrades={5}
            actualTrades={trades.length}
          >
            <div className="grid md:grid-cols-2 gap-6">
              {/* نمودار */}
              <div style={{ direction: "ltr" }} className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekPerf} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="dayName" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="winRate" name={t.reports.winRate} radius={[4, 4, 0, 0]}>
                      {dayOfWeekPerf.map((d, i) => (
                        <Cell key={i} fill={d.winRate >= 50 ? C.win : d.winRate >= 40 ? C.amber : C.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* جدول */}
              <div className="space-y-2">
                {dayOfWeekPerf.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 font-medium">{d.dayName}</span>
                    <WinRateBar winRate={d.winRate} total={d.total} />
                    <span className="text-xs text-muted-foreground w-8 shrink-0 text-end">{d.total}</span>
                    <PnlText value={d.totalPnl} />
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ===== تحلیل احساسات ===== */}
          <SectionCard
            title={t.reports.emotionSection}
            minTrades={5}
            actualTrades={emotionPerf.length > 0 ? trades.length : 0}
            note={t.reports.emotionNote}
          >
            {emotionPerf.length === 0 ? (
              <EmptyState text="هیچ برچسب احساسی در معاملات این بازه ثبت نشده است." />
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {/* نمودار افقی */}
                <div style={{ direction: "ltr" }}>
                  <div style={{ direction: "ltr", height: Math.max(180, emotionPerf.slice(0, 8).length * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={emotionPerf.slice(0, 8)}
                        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                        <XAxis type="number" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                        <YAxis type="category" dataKey="emotion" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} width={80} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="winRate" name={t.reports.winRate} radius={[0, 4, 4, 0]}>
                          {emotionPerf.slice(0, 8).map((e, i) => (
                            <Cell key={i} fill={e.winRate >= summary.winRate ? C.win : e.winRate >= summary.winRate - 15 ? C.amber : C.loss} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* جدول */}
                <div className="space-y-2 overflow-y-auto max-h-80">
                  {emotionPerf.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm border-b border-border/40 pb-2">
                      <span className="w-24 shrink-0 font-medium truncate" title={e.emotion}>{e.emotion}</span>
                      <span className="text-xs text-muted-foreground w-8 shrink-0">{e.total}</span>
                      <div className="flex-1">
                        <WinRateBar winRate={e.winRate} total={e.total} />
                      </div>
                      <span className={cn("text-xs w-12 text-end font-medium",
                        e.winRate >= summary.winRate ? "text-emerald-500" : "text-red-500")}>
                        {e.wins}W / {e.losses}L
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* ===== تأثیر وضعیت روزانه ===== */}
          <SectionCard
            title={t.reports.dailyStateSection}
            desc={t.reports.dailyStateDesc}
            minTrades={1}
            actualTrades={1}
            note={t.reports.emotionNote}
          >
            {!dailyStatePerf ? (
              <EmptyState text={t.reports.noDailyMatch} icon={<BookOpen className="w-5 h-5" />} />
            ) : (
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    title: "استرس",
                    icon: <AlertCircle className="w-4 h-4 text-orange-500" />,
                    high: { label: t.reports.highStress, data: dailyStatePerf.highStress },
                    low:  { label: t.reports.lowStress,  data: dailyStatePerf.lowStress },
                  },
                  {
                    title: "انرژی",
                    icon: <Zap className="w-4 h-4 text-blue-500" />,
                    high: { label: t.reports.highEnergy, data: dailyStatePerf.highEnergy },
                    low:  { label: t.reports.lowEnergy,  data: dailyStatePerf.lowEnergy },
                  },
                  {
                    title: "تمرکز",
                    icon: <Brain className="w-4 h-4 text-emerald-500" />,
                    high: { label: t.reports.highFocus, data: dailyStatePerf.highFocus },
                    low:  { label: t.reports.lowFocus,  data: dailyStatePerf.lowFocus },
                  },
                ].map((group, gi) => (
                  <Card key={gi} className="overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-2">
                      {group.icon}
                      <span className="font-medium text-sm">{group.title}</span>
                    </div>
                    {[group.high, group.low].map((side, si) => (
                      <div key={si} className={cn("px-4 py-3 text-sm", si === 0 && "border-b")}>
                        <div className="text-xs text-muted-foreground mb-2">{side.label}</div>
                        {side.data.total === 0 ? (
                          <p className="text-xs text-muted-foreground">داده ندارد</p>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">{t.reports.tradeCount}</span>
                              <span className="font-medium">{side.data.total}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">{t.reports.winRate}</span>
                              <span className={cn("font-semibold text-sm",
                                side.data.winRate >= 50 ? "text-emerald-500" : "text-red-500")}>
                                {side.data.winRate.toFixed(0)}٪
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">P/L</span>
                              <PnlText value={side.data.totalPnl} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </Card>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ===== تحلیل پایبندی به استراتژی ===== */}
          <SectionCard
            title={t.reports.adherenceSection}
            desc={t.reports.adherenceDesc}
            minTrades={3}
            actualTrades={adherencePerf.filter(a => a.rating !== 'unknown').reduce((s, a) => s + a.total, 0)}
          >
            <div className="grid md:grid-cols-2 gap-6">
              {/* نمودار */}
              <div style={{ direction: "ltr" }} className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adherencePerf.filter(a => a.rating !== 'unknown')} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="winRate" name={t.reports.winRate} radius={[4, 4, 0, 0]}>
                      {adherencePerf.filter(a => a.rating !== 'unknown').map((a, i) => (
                        <Cell key={i} fill={[C.win, "#34d399", C.amber, C.loss][i] || C.muted} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* جدول */}
              <div className="space-y-3">
                {adherencePerf.map((a, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{a.label}</span>
                      <span className="text-muted-foreground text-xs">{a.total} معامله</span>
                    </div>
                    <WinRateBar winRate={a.winRate} total={a.total} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{a.wins}W / {a.total - a.wins}L</span>
                      <PnlText value={a.totalPnl} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ===== تحلیل زمان معاملات ===== */}
          <SectionCard
            title={t.reports.timeSlotSection}
            desc={t.reports.timeSlotDesc}
            minTrades={5}
            actualTrades={trades.length}
          >
            {timeSlotPerf.length === 0 ? (
              <EmptyState text={t.reports.insufficientData} icon={<Clock className="w-5 h-5" />} />
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                <div style={{ direction: "ltr" }} className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeSlotPerf} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                      <XAxis dataKey="slot" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke={C.muted} fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="winRate" name={t.reports.winRate} radius={[4, 4, 0, 0]}>
                        {timeSlotPerf.map((s, i) => (
                          <Cell key={i} fill={s.winRate >= 50 ? C.win : s.winRate >= 40 ? C.amber : C.loss} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {timeSlotPerf.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm border-b border-border/40 pb-2">
                      <span className="w-20 shrink-0 font-mono text-xs">{s.slot}</span>
                      <div className="flex-1"><WinRateBar winRate={s.winRate} total={s.total} /></div>
                      <span className="text-xs text-muted-foreground w-6">{s.total}</span>
                      <PnlText value={s.totalPnl} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* ===== الگوهای رفتاری ===== */}
          <SectionCard
            title={t.reports.behaviorSection}
            desc={t.reports.behaviorDesc}
            minTrades={10}
            actualTrades={trades.filter(t => t.status === "closed").length}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              {/* پس از ضرر */}
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  {t.reports.afterLoss}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.reports.tradeCount2}</span>
                    <span className="font-medium">{behaviorInsight.afterLoss.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.reports.winRateLabel}</span>
                    <span className={cn("font-semibold",
                      behaviorInsight.afterLoss.winRateAfterLoss >= 50 ? "text-emerald-500" : "text-red-500")}>
                      {behaviorInsight.afterLoss.count > 0
                        ? `${behaviorInsight.afterLoss.winRateAfterLoss.toFixed(0)}٪`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* پس از برد */}
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  {t.reports.afterWin}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.reports.tradeCount2}</span>
                    <span className="font-medium">{behaviorInsight.afterWin.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.reports.winRateLabel}</span>
                    <span className={cn("font-semibold",
                      behaviorInsight.afterWin.winRateAfterWin >= 50 ? "text-emerald-500" : "text-red-500")}>
                      {behaviorInsight.afterWin.count > 0
                        ? `${behaviorInsight.afterWin.winRateAfterWin.toFixed(0)}٪`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* پشت سر هم */}
              <div className="rounded-xl border p-4 space-y-2">
                <div className="text-sm font-semibold">{t.reports.consecutiveLosses}</div>
                <div className="text-3xl font-bold text-red-500">
                  {behaviorInsight.consecutiveLosses > 0 ? behaviorInsight.consecutiveLosses : "—"}
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-2">
                <div className="text-sm font-semibold">{t.reports.consecutiveWins}</div>
                <div className="text-3xl font-bold text-emerald-500">
                  {behaviorInsight.consecutiveWins > 0 ? behaviorInsight.consecutiveWins : "—"}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ===== الگوهای مشاهده‌شده ===== */}
          <SectionCard
            title={t.reports.insightsSection}
            minTrades={1}
            actualTrades={insights.length}
            note={t.reports.insightsNote}
          >
            <div className="space-y-3">
              {insights.map((ins, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-xl border-r-4 text-sm",
                    ins.type === "positive" && "bg-emerald-500/5 border-emerald-500",
                    ins.type === "negative" && "bg-red-500/5 border-red-500",
                    ins.type === "neutral"  && "bg-blue-500/5 border-blue-500",
                  )}
                >
                  {ins.type === "positive" && <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                  {ins.type === "negative" && <TrendingDown className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                  {ins.type === "neutral"  && <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
                  <p className="leading-relaxed">{ins.text}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
