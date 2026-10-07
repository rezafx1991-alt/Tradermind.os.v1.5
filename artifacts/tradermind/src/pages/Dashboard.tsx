import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Skeleton } from "../components/ui/skeleton";
import { Trade, DailyJournal, Strategy, AnalysisSession, Phase, Step } from "../db/database";
import { strategyService } from "../services/strategyService";
import { analysisService } from "../services/analysisService";
import { tradeService } from "../services/tradeService";
import { journalService } from "../services/journalService";
import { backupService } from "../services/backupService";
import { accountService } from "../services/accountService";
import { tradingBoxService } from "../services/tradingBoxService";
import { Account, TradingBox } from "../db/database";
import { db } from "../db/database";
import {
  computeAnalytics, filterTradesByRange, getDateRange,
  InsightCard, PnlPoint,
} from "../services/analyticsService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid,
} from "recharts";
import {
  ActivitySquare, PenLine, ChevronLeft, TrendingUp, TrendingDown,
  BarChart3, Plus, Clock, CheckCircle2, Zap, BookOpen, FileArchive,
  Lightbulb, Target, LayoutDashboard, AlertCircle, ArrowUpRight,
  Minus, Shield, CreditCard, Box,
} from "lucide-react";
import { formatDateFa } from "../lib/i18n";
import { getByDay, getBySession } from "../services/performanceService";
import { useAppStore } from "../store/useAppStore";
import { getTradingDateKey, getTradingDateRange, getTradingMonthKey } from "../lib/tradingTime";
import { getNetPnl } from "../lib/tradeHelpers";

// ══════════════════════════════════════════════════════════════════
// ثوابت و نوع‌ها
// ══════════════════════════════════════════════════════════════════

type RangeKey = "today" | "week" | "month" | "custom";

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "امروز",
  week: "این هفته",
  month: "این ماه",
  custom: "بازه دلخواه",
};

// اطلاعات پیشرفت هر Session نیمه‌کاره
interface SessionProgress {
  phaseName: string;
  phaseIndex: number;   // از ۱
  totalPhases: number;
  answeredSteps: number;
  totalSteps: number;
  progressPct: number;  // ۰–۱۰۰
}

const RESULT_FA: Record<string, string> = {
  win: "سود", loss: "ضرر", breakeven: "سر به سر",
  "partial-win": "سود جزئی", "partial-loss": "ضرر جزئی", open: "باز", cancelled: "لغو",
};
const RESULT_CLS: Record<string, string> = {
  win: "text-emerald-500", "partial-win": "text-teal-500",
  loss: "text-rose-500", "partial-loss": "text-amber-500",
  open: "text-blue-500",
};
const RESULT_BG: Record<string, string> = {
  win: "bg-emerald-500/15", "partial-win": "bg-teal-500/15",
  loss: "bg-rose-500/15", "partial-loss": "bg-amber-500/15",
  open: "bg-blue-500/15",
};

const MOOD_EMOJI: Record<number, string> = {
  1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄",
};

// ── ساعت سلام
function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "صبح بخیر";
  if (h >= 12 && h < 17) return "ظهر بخیر";
  if (h >= 17 && h < 21) return "عصر بخیر";
  return "شب بخیر";
}

function getGreetingSub(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "روز خوبی برای تحلیل دقیق داشته باشی.";
  if (h >= 12 && h < 17) return "آماده‌ای برای ثبت تحلیل‌های بعدازظهر؟";
  if (h >= 17 && h < 21) return "وقت خوبی است ژورنال امروز را کامل کنی.";
  return "اگر معامله‌ای باز داری، حتماً مرور کن.";
}

function todayStr(): string {
  return getTradingDateKey(Date.now());
}

function moodLabel(v: number): string {
  const labels: Record<number, string> = {
    1: "خیلی بد", 2: "بد", 3: "متوسط", 4: "خوب", 5: "عالی",
  };
  return labels[Math.round(v)] ?? String(v);
}

// ══════════════════════════════════════════════════════════════════
// بارگذاری داده‌های داشبورد
// ══════════════════════════════════════════════════════════════════

interface DashboardData {
  trades: Trade[];
  sessions: AnalysisSession[];
  journals: DailyJournal[];
  strategies: Strategy[];
  todayJournal: DailyJournal | undefined;
  sessionProgress: Map<string, SessionProgress>;
}

async function loadDashboardData(): Promise<DashboardData> {
  const [trades, sessions, journals, strategies, todayJournal] = await Promise.all([
    tradeService.getAllTrades(),
    analysisService.getAllSessions(),
    journalService.getAllJournals(),
    strategyService.getAllStrategies(),
    journalService.getJournalByDate(todayStr()),
  ]);

  // بارگذاری اطلاعات پیشرفت برای Session‌های نیمه‌کاره
  const inProgress = sessions.filter(s => s.status === "in-progress");
  const sessionProgress = new Map<string, SessionProgress>();

  await Promise.all(inProgress.map(async session => {
    try {
      if (!session.strategyId) throw new Error('no strategyId');
      const phases: Phase[] = await strategyService.getPhasesByStrategyId(session.strategyId);
      const stepsPerPhase = await Promise.all(phases.map(p => strategyService.getStepsByPhaseId(p.id)));
      const allSteps: Step[] = stepsPerPhase.flat();
      const totalSteps = allSteps.length;
      const answered = totalSteps > 0
        ? Object.keys(JSON.parse(session.stepResults || "{}")||{}).length
        : 0;
      const phaseIdx = phases.findIndex(p => p.id === session.currentPhaseId);
      const currentPhase = phaseIdx >= 0 ? phases[phaseIdx] : (phases[0] ?? null);
      sessionProgress.set(session.id, {
        phaseName: currentPhase?.name ?? "مرحله اول",
        phaseIndex: phaseIdx >= 0 ? phaseIdx + 1 : 1,
        totalPhases: phases.length || 1,
        answeredSteps: answered,
        totalSteps: totalSteps || 1,
        progressPct: totalSteps > 0 ? Math.round((answered / totalSteps) * 100) : 0,
      });
    } catch {
      sessionProgress.set(session.id, {
        phaseName: "—", phaseIndex: 1, totalPhases: 1,
        answeredSteps: 0, totalSteps: 1, progressPct: 0,
      });
    }
  }));

  return { trades, sessions, journals, strategies, todayJournal, sessionProgress };
}

// ══════════════════════════════════════════════════════════════════
// کامپوننت اصلی
// ══════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const tradingTimeMode = useAppStore(s => s.tradingTimeMode);
  const brokerUtcOffsetMinutes = useAppStore(s => s.brokerUtcOffsetMinutes);
  const dashboardMessage = useAppStore(s => s.dashboardMessage);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState<RangeKey>("week");
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tradingBoxes, setTradingBoxes] = useState<TradingBox[]>([]);
  const customFromRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    loadDashboardData().then(setData).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    accountService.getAll().then(setAccounts);
    tradingBoxService.getAll().then(setTradingBoxes);
  }, []);

  // ── Derived: معاملات بازه زمانی انتخابی
  const rangedTrades = useMemo(() => {
    if (!data) return [];
    if (rangeKey === "custom") {
      const from = getTradingDateRange(customFrom).from;
      const to   = getTradingDateRange(customTo).to;
      return filterTradesByRange(data.trades, from, to);
    }
    const { from, to } = getDateRange(rangeKey);
    return filterTradesByRange(data.trades, from, to);
  }, [data, rangeKey, customFrom, customTo, tradingTimeMode, brokerUtcOffsetMinutes]);

  // ── Stats بازه انتخابی
  const rangedStats = useMemo(() => {
    const closed = rangedTrades.filter(t => t.status === "closed");
    const wins = closed.filter(t => t.result === "win" || t.result === "partial-win");
    const withR = closed.filter(t => t.rMultiple != null);
    const totalPnl = closed.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0);
    return {
      total: rangedTrades.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      avgR: withR.length > 0 ? withR.reduce((s, t) => s + (t.rMultiple || 0), 0) / withR.length : null,
      totalPnl,
      closedCount: closed.length,
    };
  }, [rangedTrades]);

  // ── آخرین ۵ معامله
  const recentTrades = useMemo(() => (data?.trades ?? []).slice(0, 5), [data]);

  // ── آخرین ۳ ژورنال (بدون امروز در صورت وجود)
  const recentJournals = useMemo(() => (data?.journals ?? []).slice(0, 3), [data]);

  // ── تحلیل‌های نیمه‌کاره
  const inProgressSessions = useMemo(
    () => (data?.sessions ?? []).filter(s => s.status === "in-progress"),
    [data],
  );

  // ── Equity curve (۲۰ معامله آخر بسته)
  const equityCurve = useMemo((): PnlPoint[] => {
    if (!data) return [];
    const closed = [...data.trades.filter(t => t.status === "closed")]
      .sort((a, b) => (a.closedAt || a.openedAt) - (b.closedAt || b.openedAt))
      .slice(-20);
    let cum = 0;
    return closed.map((t, i) => {
      const pnl = getNetPnl(t) ?? 0;
      cum += pnl;
      return { index: i + 1, symbol: t.symbol, pnl: +pnl.toFixed(2), cumulative: +cum.toFixed(2) };
    });
  }, [data, tradingTimeMode, brokerUtcOffsetMinutes]);

  // ── Insights (فقط اگه داده کافی باشه)
  const insights = useMemo((): InsightCard[] => {
    if (!data || data.trades.length < 5) return [];
    const analytics = computeAnalytics(data.trades, data.journals, data.strategies);
    return analytics.insights.filter(i => i.type !== "neutral" || data.trades.length >= 10).slice(0, 3);
  }, [data]);

  // ── آخرین استراتژی استفاده‌شده
  const lastUsedStrategy = useMemo(() => {
    if (!data || data.sessions.length === 0) return null;
    const lastSession = data.sessions[0]; // sessions are sorted by startedAt desc
    const strat = data.strategies.find(s => s.id === lastSession.strategyId);
    if (!strat) return null;
    const count = data.sessions.filter(s => s.strategyId === strat.id).length;
    return { strategy: strat, count, lastSession };
  }, [data]);

  // ── پایبندی این هفته
  const weekAdherence = useMemo(() => {
    if (!data) return null;
    const { from, to } = getDateRange("week");
    const weekTrades = filterTradesByRange(data.trades, from, to)
      .filter(t => t.adherenceScore != null);
    if (weekTrades.length < 2) return null;
    const avg = weekTrades.reduce((s, t) => s + (t.adherenceScore || 0), 0) / weekTrades.length;
    return Math.round(avg);
  }, [data]);

  // ── Map استراتژی‌ها
  const stratMap = useMemo(
    () => new Map(data?.strategies.map(s => [s.id, s.name]) ?? []),
    [data],
  );

  // ── مقایسه با دوره قبلی (برای نشانگرهای delta)
  const prevRangedStats = useMemo(() => {
    if (!data || rangeKey === "custom") return null;
    const { from, to } = getDateRange(rangeKey as Exclude<RangeKey, "custom">);
    const duration = to - from;
    const prevTrades = filterTradesByRange(data.trades, from - duration, from - 1);
    const closed = prevTrades.filter(t => t.status === "closed");
    const wins = closed.filter(t => t.result === "win" || t.result === "partial-win");
    const losses = closed.filter(t => t.result === "loss" || t.result === "partial-loss");
    const totalWinPnl = wins.reduce((s, t) => s + Math.max(0, getNetPnl(t) ?? 0), 0);
    const totalLossPnl = Math.abs(losses.reduce((s, t) => s + Math.min(0, getNetPnl(t) ?? 0), 0));
    const withR = closed.filter(t => t.rMultiple != null);
    const winRs = wins.filter(t => t.rMultiple != null).map(t => t.rMultiple!);
    const lossRs = losses.filter(t => t.rMultiple != null).map(t => Math.abs(t.rMultiple!));
    const avgWinR = winRs.length ? winRs.reduce((s, v) => s + v, 0) / winRs.length : null;
    const avgLossR = lossRs.length ? lossRs.reduce((s, v) => s + v, 0) / lossRs.length : null;
    return {
      closedCount: closed.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalPnl: closed.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0),
      avgR: withR.length ? withR.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / withR.length : null,
      profitFactor: totalLossPnl > 0 ? totalWinPnl / totalLossPnl : null,
      avgWinPnl: wins.length ? totalWinPnl / wins.length : null,
      avgLossPnl: losses.length ? -(totalLossPnl / losses.length) : null,
      rr: avgWinR != null && avgLossR != null && avgLossR > 0 ? avgWinR / avgLossR : null,
    };
  }, [data, rangeKey]);

  // ── معیارهای پیشرفته بازه انتخابی
  const extendedStats = useMemo(() => {
    const closed = rangedTrades.filter(t => t.status === "closed");
    if (!closed.length) return null;
    const wins   = closed.filter(t => t.result === "win" || t.result === "partial-win");
    const losses = closed.filter(t => t.result === "loss" || t.result === "partial-loss");
    const totalWinPnl  = wins.reduce((s, t) => s + Math.max(0, getNetPnl(t) ?? 0), 0);
    const totalLossPnl = Math.abs(losses.reduce((s, t) => s + Math.min(0, getNetPnl(t) ?? 0), 0));
    const winRs  = wins.filter(t => t.rMultiple != null).map(t => t.rMultiple!);
    const lossRs = losses.filter(t => t.rMultiple != null).map(t => Math.abs(t.rMultiple!));
    const avgWinR  = winRs.length  ? winRs.reduce((s, v) => s + v, 0)  / winRs.length  : null;
    const avgLossR = lossRs.length ? lossRs.reduce((s, v) => s + v, 0) / lossRs.length : null;
    const pnls = closed.map(t => getNetPnl(t) ?? 0);
    return {
      bestPnl:      Math.max(...pnls),
      worstPnl:     Math.min(...pnls),
      avgWinPnl:    wins.length   ? totalWinPnl  / wins.length   : null,
      avgLossPnl:   losses.length ? -(totalLossPnl / losses.length) : null,
      profitFactor: totalLossPnl > 0 ? totalWinPnl / totalLossPnl : null,
      rr:           avgWinR != null && avgLossR != null && avgLossR > 0 ? avgWinR / avgLossR : null,
    };
  }, [rangedTrades]);

  // ── داده‌های نمودارهای تحلیلی (کل داده، بدون فیلتر بازه)
  const chartsData = useMemo(() => {
    if (!data || data.trades.length < 3) return null;
    const allClosed = data.trades.filter(t => t.status === "closed");

    // ماهانه P/L
    const monthMap = new Map<string, number>();
    allClosed.forEach(t => {
      const key = getTradingMonthKey(t.closedAt ?? t.openedAt);
      monthMap.set(key, (monthMap.get(key) ?? 0) + (getNetPnl(t) ?? 0));
    });
    const FA_MONTHS = ["ژانویه","فوریه","مارس","آوریل","مه","ژوئن","ژوئیه","آگوست","سپتامبر","اکتبر","نوامبر","دسامبر"];
    const monthlyPnl = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, pnl]) => ({
        name: FA_MONTHS[parseInt(key.split("-")[1]) - 1] ?? key,
        pnl:  +pnl.toFixed(2),
        fill: pnl >= 0 ? "#22c55e" : "#ef4444",
      }));

    // روزهای هفته
    const dayPerf = getByDay(data.trades);
    const dayData = [...dayPerf]
      .sort((a, b) => a.dayNum - b.dayNum)
      .map(d => ({
        name: d.dayName,
        winRate: d.winRate != null ? +(d.winRate * 100).toFixed(1) : 0,
        count: d.count,
        fill: d.winRate != null
          ? d.winRate >= 0.5 ? "#22c55e" : d.winRate >= 0.4 ? "#f59e0b" : "#ef4444"
          : "#6366f1",
      }));

    // سشن‌ها
    const sessPerf = getBySession(data.trades);
    const sessionData = sessPerf.map(s => ({
      name:    s.label,
      winRate: s.winRate != null ? +(s.winRate * 100).toFixed(1) : 0,
      count:   s.count,
      fill: s.winRate != null
        ? s.winRate >= 0.5 ? "#22c55e" : s.winRate >= 0.4 ? "#f59e0b" : "#ef4444"
        : "#6366f1",
    }));

    // استراتژی‌ها
    const ana = computeAnalytics(data.trades, data.journals, data.strategies);
    const strategyData = ana.strategyPerf
      .map(sp => ({
        name:    (data.strategies.find(s => s.id === sp.strategyId)?.name ?? sp.strategyName).slice(0, 14),
        winRate: +sp.winRate.toFixed(1),
        count:   sp.total,
        fill:    sp.winRate >= 50 ? "#22c55e" : "#ef4444",
      }))
      .slice(0, 7);

    return { monthlyPnl, dayData, sessionData, strategyData };
  }, [data, tradingTimeMode, brokerUtcOffsetMinutes]);

  // ── وضعیت: کاربر جدید؟
  const isNewUser = data && data.strategies.length === 0 && data.trades.length === 0 && data.journals.length === 0;

  // ── Backup سریع
  const handleQuickBackup = async () => {
    setExportingBackup(true);
    try {
      await backupService.exportAll();
      toast.success("نسخه پشتیبان با موفقیت دانلود شد");
    } catch {
      toast.error("خطا در ایجاد پشتیبان");
    } finally {
      setExportingBackup(false);
    }
  };

  // ══════════════════════════════════════════════
  // Loading
  // ══════════════════════════════════════════════
  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
        {/* greeting */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        {/* action buttons */}
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        {/* stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        {/* chart */}
        <Skeleton className="h-56 rounded-xl" />
        {/* two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // کاربر جدید — Empty State
  // ══════════════════════════════════════════════
  if (isNewUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-6 px-4" dir="rtl">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
          <Target className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">به TraderMind خوش آمدی</h1>
          <p className="text-muted-foreground max-w-sm">
            اولین استراتژی‌ات را ایجاد کن تا مسیر تحلیل و ژورنال‌نویسی حرفه‌ای را شروع کنیم.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/strategies/new">
            <Button size="lg" className="gap-2">
              <Plus className="w-5 h-5" /> ایجاد اولین استراتژی
            </Button>
          </Link>
          <Link href="/journal/trades/new">
            <Button size="lg" variant="outline" className="gap-2">
              <PenLine className="w-5 h-5" /> ثبت اولین معامله
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-sm text-muted-foreground max-w-sm w-full">
          {[
            { icon: Target, text: "استراتژی بساز" },
            { icon: ActivitySquare, text: "تحلیل کن" },
            { icon: BarChart3, text: "رشد کن" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-dashed">
              <Icon className="w-5 h-5 opacity-50" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // داشبورد اصلی
  // ══════════════════════════════════════════════
  return (
    <div className="space-y-5 animate-in fade-in duration-400" dir="rtl">

      {/* ━━━━━━━━━━━━━━━━ 1. خوش‌آمدگویی ━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{getGreeting()} 👋</h1>
          <p className="text-muted-foreground mt-1">{dashboardMessage || getGreetingSub()}</p>
        </div>
        {/* دکمه‌های اصلی */}
        <div className="flex gap-2 shrink-0">
          <Link href="/analysis/new">
            <Button className="gap-2">
              <ActivitySquare className="w-4 h-4" />
              <span className="hidden sm:inline">شروع تحلیل جدید</span>
              <span className="sm:hidden">تحلیل</span>
            </Button>
          </Link>
          <Link href="/journal/trades/new">
            <Button variant="secondary" className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">ثبت معامله</span>
              <span className="sm:hidden">معامله</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━ 2. تحلیل‌های نیمه‌کاره ━━━━━━━━━━━━━━━━ */}
      {inProgressSessions.length > 0 && (
        <div className="space-y-2">
          {inProgressSessions.map(session => {
            const stratName = stratMap.get(session.strategyId) ?? "استراتژی نامشخص";
            const prog = data?.sessionProgress.get(session.id);
            return (
              <Card key={session.id} className="border-primary/40 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Clock className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-primary mb-0.5">تحلیل نیمه‌کاره</p>
                        <p className="font-semibold truncate text-sm">{stratName}</p>
                        {prog && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>مرحله فعلی: <span className="font-medium text-foreground">{prog.phaseName}</span></span>
                              <span>{prog.phaseIndex.toLocaleString("fa-IR")} از {prog.totalPhases.toLocaleString("fa-IR")}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-primary/15 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${prog.progressPct}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-primary shrink-0">
                                {prog.progressPct.toLocaleString("fa-IR")}٪
                              </span>
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateFa(new Date(session.startedAt).toISOString().split("T")[0])}
                        </p>
                      </div>
                    </div>
                    <Link href={`/analysis/${session.id}`}>
                      <Button size="sm" className="shrink-0 gap-1 mt-0.5">
                        ادامه <ArrowUpRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━ 3. وضعیت امروز + شروع تحلیل ━━━━━━━━━━━━━━━━ */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* وضعیت امروز */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">📅</span> وضعیت امروز
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.todayJournal ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="حال کلی" value={`${MOOD_EMOJI[Math.round(data.todayJournal.mood)]} ${moodLabel(data.todayJournal.mood)}`} />
                  <MiniStat label="سطح انرژی" value={`${data.todayJournal.energyLevel ?? data.todayJournal.mood}/۱۰`} />
                  <MiniStat label="تمرکز" value={`${data.todayJournal.focusLevel ?? 5}/۱۰`} />
                  <MiniStat label="استرس" value={`${data.todayJournal.stressLevel ?? 3}/۱۰`} />
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">ژورنال امروز ثبت شده است</span>
                  <Link href={`/journal/daily/${data.todayJournal.date}`} className="mr-auto">
                    <Button variant="ghost" size="sm" className="h-7 text-xs">مشاهده</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-sm">هنوز ژورنال امروز ثبت نشده است.</span>
                </div>
                <Link href="/journal/daily/new">
                  <Button variant="outline" className="w-full gap-2">
                    <PenLine className="w-4 h-4" /> ثبت ژورنال امروز
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* شروع تحلیل جدید */}
        <Card className="flex flex-col justify-between bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6 flex flex-col h-full justify-between gap-4">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                <ActivitySquare className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold">شروع تحلیل جدید</h3>
              <p className="text-sm text-muted-foreground mt-1">
                استراتژی خود را انتخاب کن و تحلیل گام‌به‌گام را شروع کن.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/analysis/new" className="flex-1">
                <Button className="w-full gap-2">
                  <Plus className="w-4 h-4" /> شروع تحلیل
                </Button>
              </Link>
              {lastUsedStrategy && (
                <Link href={`/analysis/new?strategyId=${lastUsedStrategy.strategy.id}`}>
                  <Button variant="outline" size="icon" title="شروع با آخرین استراتژی">
                    <Zap className="w-4 h-4" />
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ━━━━━━━━━━━━━━━━ 4. خلاصه عملکرد ━━━━━━━━━━━━━━━━ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> خلاصه عملکرد
            </CardTitle>
            {/* انتخاب بازه */}
            <div className="flex flex-wrap gap-1 bg-muted/50 p-1 rounded-lg">
              {(Object.entries(RANGE_LABELS) as [RangeKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setRangeKey(key); if (key === "custom") setTimeout(() => customFromRef.current?.focus(), 50); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    rangeKey === key
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* date picker بازه دلخواه */}
          {rangeKey === "custom" && (
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl bg-muted/40 border">
              <span className="text-xs text-muted-foreground shrink-0">از:</span>
              <input
                ref={customFromRef}
                type="date"
                value={customFrom}
                max={customTo}
                onChange={e => setCustomFrom(e.target.value)}
                className="text-xs rounded-lg border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground shrink-0">تا:</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => setCustomTo(e.target.value)}
                className="text-xs rounded-lg border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          {rangedStats.total === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
              <BarChart3 className="w-8 h-8 opacity-20" />
              <p className="text-sm">هیچ معامله‌ای در {RANGE_LABELS[rangeKey]} ثبت نشده است.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="تعداد معاملات"
                value={rangedStats.total.toLocaleString("fa-IR")}
                sub={`${rangedStats.closedCount.toLocaleString("fa-IR")} بسته`}
              />
              <StatCard
                label="درصد برد"
                value={`${rangedStats.winRate.toFixed(1)}٪`}
                valueClass={rangedStats.winRate >= 50 ? "text-emerald-500" : "text-rose-500"}
              />
              <StatCard
                label="سود / ضرر"
                value={`${rangedStats.totalPnl >= 0 ? "+" : ""}$${rangedStats.totalPnl.toFixed(2)}`}
                valueClass={rangedStats.totalPnl >= 0 ? "text-emerald-500" : "text-rose-500"}
              />
              <StatCard
                label="میانگین R"
                value={rangedStats.avgR != null ? `${rangedStats.avgR.toFixed(2)}R` : "—"}
                valueClass={
                  rangedStats.avgR == null ? undefined
                  : rangedStats.avgR >= 0 ? "text-emerald-500"
                  : "text-rose-500"
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ━━━━━━━━━━━━━━━━ 4b. کارت‌های KPI پیشرفته ━━━━━━━━━━━━━━━━ */}
      {extendedStats && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground tracking-wider">معیارهای پیشرفته — {RANGE_LABELS[rangeKey]}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard
              label="بهترین معامله"
              value={`${extendedStats.bestPnl >= 0 ? "+" : ""}${extendedStats.bestPnl.toFixed(2)}`}
              valueClass={extendedStats.bestPnl >= 0 ? "text-emerald-500" : "text-rose-500"}
              hint="بالاترین سود در بازه"
            />
            <KpiCard
              label="بدترین معامله"
              value={`${extendedStats.worstPnl >= 0 ? "+" : ""}${extendedStats.worstPnl.toFixed(2)}`}
              valueClass={extendedStats.worstPnl < 0 ? "text-rose-500" : "text-emerald-500"}
              hint="بزرگ‌ترین ضرر در بازه"
            />
            <KpiCard
              label="میانگین سود"
              value={extendedStats.avgWinPnl != null ? `+${extendedStats.avgWinPnl.toFixed(2)}` : "—"}
              valueClass="text-emerald-500"
              currentNum={extendedStats.avgWinPnl}
              prevNum={prevRangedStats?.avgWinPnl}
              higherIsBetter
              hint="متوسط هر معامله سودده"
            />
            <KpiCard
              label="میانگین ضرر"
              value={extendedStats.avgLossPnl != null ? `${extendedStats.avgLossPnl.toFixed(2)}` : "—"}
              valueClass="text-rose-500"
              currentNum={extendedStats.avgLossPnl}
              prevNum={prevRangedStats?.avgLossPnl}
              higherIsBetter={false}
              hint="متوسط هر معامله زیان‌ده"
            />
            <KpiCard
              label="Profit Factor"
              value={extendedStats.profitFactor != null ? extendedStats.profitFactor.toFixed(2) : "—"}
              valueClass={extendedStats.profitFactor != null && extendedStats.profitFactor > 1 ? "text-emerald-500" : "text-rose-500"}
              currentNum={extendedStats.profitFactor}
              prevNum={prevRangedStats?.profitFactor}
              higherIsBetter
              hint="نسبت کل سود به کل ضرر"
            />
            <KpiCard
              label="Risk:Reward"
              value={extendedStats.rr != null ? `${extendedStats.rr.toFixed(2)} : 1` : "—"}
              valueClass={extendedStats.rr != null && extendedStats.rr >= 1.5 ? "text-emerald-500" : "text-amber-500"}
              currentNum={extendedStats.rr}
              prevNum={prevRangedStats?.rr}
              higherIsBetter
              hint="نسبت میانگین برد به میانگین ضرر"
            />
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━ 4c. آمار حساب‌های معاملاتی ━━━━━━━━━━━━━━━━ */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> حساب‌های معاملاتی
            </p>
            <Link href="/accounts" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              مدیریت <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {accounts.map(acc => {
              const accTrades = (data?.trades ?? []).filter((t: any) => t.accountId === acc.id);
              const closed = accTrades.filter(t => t.status === 'closed');
              const wins = closed.filter(t => t.result === 'win' || t.result === 'partial-win');
              const pnl = closed.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0);
              const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : null;
              return (
                <Link key={acc.id} href={`/journal/trades?accountId=${acc.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: acc.color + '33', border: `2px solid ${acc.color}` }}>
                      <CreditCard className="w-4 h-4" style={{ color: acc.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm whitespace-normal break-words leading-5" dir="rtl">{acc.name}</p>
                      <p className="text-xs text-muted-foreground whitespace-normal break-words leading-5" dir="rtl">{acc.broker || 'بدون بروکر'} · {accTrades.length} معامله</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                      </p>
                      {winRate !== null && (
                        <p className="text-xs text-muted-foreground">{winRate}٪ برد</p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━ 4d. باکس‌های معاملاتی فعال ━━━━━━━━━━━━━━━━ */}
      {tradingBoxes.filter(b => b.status === 'active').length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5" /> باکس‌های معاملاتی فعال
            </p>
            <Link href="/trading-boxes" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              مدیریت <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tradingBoxes.filter(b => b.status === 'active').map(box => {
              const boxTrades = (data?.trades ?? []).filter((t: any) => t.boxId === box.id);
              const closed = boxTrades.filter(t => t.status === 'closed');
              const wins = closed.filter(t => t.result === 'win' || t.result === 'partial-win');
              const pnl = closed.reduce((s, t) => s + (getNetPnl(t) ?? 0), 0);
              const targetCount = box.targetTradeCount || 0;
              const progress = targetCount > 0 ? Math.min(100, Math.round((boxTrades.length / targetCount) * 100)) : null;
              const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : null;
              return (
                <Link key={box.id} href={`/journal/trades?boxId=${box.id}`}>
                  <div className="p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors cursor-pointer space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: box.color + '33', border: `2px solid ${box.color}` }}>
                        <Box className="w-4 h-4" style={{ color: box.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{box.name}</p>
                        <p className="text-xs text-muted-foreground">{boxTrades.length}{targetCount > 0 ? `/${targetCount}` : ''} معامله{winRate !== null ? ` · ${winRate}٪ برد` : ''}</p>
                      </div>
                      <p className={`text-sm font-bold shrink-0 ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                      </p>
                    </div>
                    {progress !== null && (
                      <div className="space-y-1">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: box.color }} />
                        </div>
                        <p className="text-xs text-muted-foreground text-left">{progress}٪ از هدف</p>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━ 5. معاملات اخیر + ژورنال‌ها ━━━━━━━━━━━━━━━━ */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* آخرین معاملات */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> آخرین معاملات
              </CardTitle>
              <Link href="/journal/trades" className="text-sm text-primary flex items-center gap-0.5 hover:underline">
                همه <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {recentTrades.length === 0 ? (
              <EmptyState icon={TrendingDown} text="هنوز معامله‌ای ثبت نشده است." cta="ثبت اولین معامله" href="/journal/trades/new" />
            ) : (
              <div className="space-y-2">
                {recentTrades.map(trade => (
                  <Link key={trade.id} href={`/journal/trades/${trade.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-muted/30 transition-colors gap-3 cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${RESULT_BG[trade.result] ?? "bg-muted/30"}`}>
                          {trade.direction === "long"
                            ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                            : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm tracking-wide">{trade.symbol}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateFa(new Date(trade.openedAt).toISOString().split("T")[0])}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-semibold text-sm ${RESULT_CLS[trade.result] ?? ""}`}>
                          {getNetPnl(trade) != null
                            ? `${getNetPnl(trade)! >= 0 ? "+" : ""}$${Math.abs(getNetPnl(trade)!).toFixed(2)}`
                            : RESULT_FA[trade.result] ?? trade.result}
                        </p>
                        {trade.rMultiple != null && (
                          <p className="text-xs text-muted-foreground">{trade.rMultiple}R</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* آخرین ژورنال‌ها */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" /> آخرین ژورنال‌های روزانه
              </CardTitle>
              <Link href="/journal/daily" className="text-sm text-primary flex items-center gap-0.5 hover:underline">
                همه <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {recentJournals.length === 0 ? (
              <EmptyState icon={PenLine} text="هنوز ژورنالی ثبت نشده است." cta="ثبت اولین ژورنال" href="/journal/daily/new" />
            ) : (
              <div className="space-y-2">
                {recentJournals.map(j => (
                  <Link key={j.date} href={`/journal/daily/${j.date}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-muted/30 transition-colors cursor-pointer gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-xl shrink-0">{MOOD_EMOJI[Math.round(j.mood)] ?? "😐"}</div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{formatDateFa(j.date)}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {j.notes || "یادداشتی ثبت نشده"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                        <span title="انرژی">⚡ {j.energyLevel ?? j.mood}</span>
                        <span title="تمرکز">🎯 {j.focusLevel ?? 5}</span>
                        <span title="استرس">💭 {j.stressLevel ?? 3}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ━━━━━━━━━━━━━━━━ 6. آخرین استراتژی + پایبندی ━━━━━━━━━━━━━━━━ */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* آخرین استراتژی */}
        {lastUsedStrategy && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> آخرین استراتژی استفاده‌شده
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg border bg-card/50">
                <p className="font-semibold">{lastUsedStrategy.strategy.name}</p>
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                  <span>آخرین استفاده: {formatDateFa(new Date(lastUsedStrategy.lastSession.startedAt).toISOString().split("T")[0])}</span>
                  <span>تعداد استفاده: {lastUsedStrategy.count.toLocaleString("fa-IR")} بار</span>
                </div>
              </div>
              <Link href={`/analysis/new?strategyId=${lastUsedStrategy.strategy.id}`}>
                <Button variant="outline" className="w-full gap-2">
                  <Zap className="w-4 h-4" /> شروع تحلیل با این استراتژی
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* پایبندی به استراتژی */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> پایبندی به قوانین استراتژی
            </CardTitle>
            <CardDescription>این هفته</CardDescription>
          </CardHeader>
          <CardContent>
            {weekAdherence == null ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
                <Shield className="w-8 h-8 opacity-20" />
                <p className="text-sm">برای نمایش این اطلاعات، تحلیل‌های بیشتری ثبت کنید.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className={`text-4xl font-bold ${weekAdherence >= 80 ? "text-emerald-500" : weekAdherence >= 60 ? "text-amber-500" : "text-rose-500"}`}>
                    {weekAdherence.toLocaleString("fa-IR")}٪
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${weekAdherence >= 80 ? "bg-emerald-500" : weekAdherence >= 60 ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${weekAdherence}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {weekAdherence >= 80 ? "عالی! به استراتژی پایبند بودی." : weekAdherence >= 60 ? "خوب، اما جای بهبود دارد." : "نیاز به توجه بیشتر به قوانین استراتژی."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ━━━━━━━━━━━━━━━━ 7. نمودارهای تحلیلی ━━━━━━━━━━━━━━━━ */}
      {chartsData && (
        <div className="space-y-4">

          {/* نمودار P/L ماهانه */}
          {chartsData.monthlyPnl.length >= 2 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> سود و ضرر ماهانه
                </CardTitle>
                <CardDescription>۱۲ ماه اخیر — کل تاریخچه</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartsData.monthlyPnl} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "currentColor" }} />
                      <YAxis tick={{ fontSize: 9, fill: "currentColor" }} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const v = payload[0].value as number;
                          return (
                            <div className="bg-popover border rounded-lg px-3 py-2 text-xs shadow-md" dir="rtl">
                              <p className="font-bold mb-1">{label}</p>
                              <p className={v >= 0 ? "text-emerald-500" : "text-rose-500"}>
                                {v >= 0 ? "+" : ""}${v.toFixed(2)}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="pnl" radius={[4, 4, 0, 0]} name="P/L">
                        {chartsData.monthlyPnl.map((d, i) => (
                          <Cell key={i} fill={d.fill} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* روزهای هفته + سشن‌ها */}
          <div className="grid gap-4 lg:grid-cols-2">

            {chartsData.dayData.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" /> عملکرد روزهای هفته
                  </CardTitle>
                  <CardDescription>نرخ برد بر اساس روز ورود</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartsData.dayData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "currentColor" }} />
                        <YAxis unit="٪" domain={[0, 100]} tick={{ fontSize: 9, fill: "currentColor" }} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-popover border rounded-lg px-3 py-2 text-xs shadow-md" dir="rtl">
                                <p className="font-bold">{label}</p>
                                <p>نرخ برد: <span className="font-semibold">{payload[0].value}٪</span></p>
                                <p className="text-muted-foreground">{(payload[0].payload as any).count} معامله</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="winRate" radius={[4, 4, 0, 0]} name="نرخ برد">
                          {chartsData.dayData.map((d, i) => (
                            <Cell key={i} fill={d.fill} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {chartsData.sessionData.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" /> عملکرد سشن‌های معاملاتی
                  </CardTitle>
                  <CardDescription>نرخ برد در هر سشن</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartsData.sessionData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "currentColor" }} />
                        <YAxis unit="٪" domain={[0, 100]} tick={{ fontSize: 9, fill: "currentColor" }} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-popover border rounded-lg px-3 py-2 text-xs shadow-md" dir="rtl">
                                <p className="font-bold">{label}</p>
                                <p>نرخ برد: <span className="font-semibold">{payload[0].value}٪</span></p>
                                <p className="text-muted-foreground">{(payload[0].payload as any).count} معامله</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="winRate" radius={[4, 4, 0, 0]} name="نرخ برد">
                          {chartsData.sessionData.map((d, i) => (
                            <Cell key={i} fill={d.fill} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {chartsData.sessionData.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-6">سشن معاملاتی برای معاملات تعیین نشده</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* استراتژی‌ها */}
          {chartsData.strategyData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> عملکرد استراتژی‌ها
                </CardTitle>
                <CardDescription>نرخ برد به تفکیک استراتژی</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartsData.strategyData}
                      layout="vertical"
                      margin={{ top: 4, right: 40, bottom: 0, left: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" horizontal={false} />
                      <XAxis type="number" unit="٪" domain={[0, 100]} tick={{ fontSize: 9, fill: "currentColor" }} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: "currentColor" }} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-popover border rounded-lg px-3 py-2 text-xs shadow-md" dir="rtl">
                              <p className="font-bold">{label}</p>
                              <p>نرخ برد: <span className="font-semibold">{payload[0].value}٪</span></p>
                              <p className="text-muted-foreground">{(payload[0].payload as any).count} معامله</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="winRate" radius={[0, 4, 4, 0]} name="نرخ برد">
                        {chartsData.strategyData.map((d, i) => (
                          <Cell key={i} fill={d.fill} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━ 7b. نمودار Equity + Insights ━━━━━━━━━━━━━━━━ */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* نمودار کوچک Equity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> عملکرد معاملات اخیر
            </CardTitle>
            <CardDescription>منحنی سود/ضرر تجمعی — ۲۰ معامله اخیر</CardDescription>
          </CardHeader>
          <CardContent>
            {equityCurve.length < 2 ? (
              <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                <BarChart3 className="w-8 h-8 opacity-20" />
                <p className="text-sm text-center">برای نمایش نمودار، حداقل ۲ معامله بسته ثبت کنید.</p>
              </div>
            ) : (
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="index" hide />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as PnlPoint;
                        return (
                          <div className="bg-popover border rounded-lg px-3 py-2 text-xs shadow-md" dir="rtl">
                            <p className="font-bold">{d.symbol}</p>
                            <p className={d.cumulative >= 0 ? "text-emerald-500" : "text-rose-500"}>
                              تجمعی: {d.cumulative >= 0 ? "+" : ""}${d.cumulative.toFixed(2)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone" dataKey="cumulative"
                      stroke="hsl(var(--primary))" strokeWidth={2}
                      fill="url(#eqGrad)" dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Insights */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" /> نکات و الگوها
            </CardTitle>
            <CardDescription>بر اساس داده‌های واقعی</CardDescription>
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-2 text-center text-muted-foreground">
                <Lightbulb className="w-8 h-8 opacity-20" />
                <p className="text-sm">
                  {(data?.trades.length ?? 0) < 5
                    ? "برای نمایش الگوها، حداقل ۵ معامله ثبت کنید."
                    : "در حال بررسی الگوها…"}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {insights.map((ins, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg text-sm border ${
                    ins.type === "positive" ? "bg-emerald-500/5 border-emerald-500/20"
                    : ins.type === "negative" ? "bg-rose-500/5 border-rose-500/20"
                    : "bg-muted/30 border-border"
                  }`}>
                    <span className="text-base shrink-0 mt-0.5">
                      {ins.type === "positive" ? "✅" : ins.type === "negative" ? "⚠️" : "💡"}
                    </span>
                    <p className="text-sm leading-relaxed">{ins.text}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ━━━━━━━━━━━━━━━━ 8. Quick Actions ━━━━━━━━━━━━━━━━ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> دسترسی سریع
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { icon: ActivitySquare, label: "تحلیل جدید",     href: "/analysis/new" },
              { icon: Plus,           label: "ثبت معامله",     href: "/journal/trades/new" },
              { icon: PenLine,        label: "ژورنال امروز",   href: "/journal/daily/new" },
              { icon: TrendingUp,     label: "معاملات",        href: "/journal/trades" },
              { icon: BarChart3,      label: "گزارش‌ها",       href: "/reports" },
              { icon: FileArchive,    label: "پشتیبان‌گیری",  href: null, onClick: handleQuickBackup, busy: exportingBackup },
            ].map(({ icon: Icon, label, href, onClick, busy }) => (
              href ? (
                <Link key={label} href={href}>
                  <button className="w-full flex flex-col items-center gap-2 p-3 rounded-xl border bg-card/50 hover:bg-muted/30 hover:border-primary/30 transition-all group">
                    <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-xs text-center font-medium">{label}</span>
                  </button>
                </Link>
              ) : (
                <button
                  key={label}
                  onClick={onClick}
                  disabled={busy}
                  className="w-full flex flex-col items-center gap-2 p-3 rounded-xl border bg-card/50 hover:bg-muted/30 hover:border-primary/30 transition-all group disabled:opacity-50"
                >
                  {busy
                    ? <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                    : <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
                  <span className="text-xs text-center font-medium">{label}</span>
                </button>
              )
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// کامپوننت‌های کمکی
// ══════════════════════════════════════════════════════════════════

// ── KpiCard — کارت آماری با نشانگر تغییر نسبت به دوره قبل ──────────
function KpiCard({
  label, value, valueClass, hint,
  currentNum, prevNum, higherIsBetter = true,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  currentNum?: number | null;
  prevNum?: number | null;
  higherIsBetter?: boolean;
}) {
  const delta =
    currentNum != null && prevNum != null && prevNum !== 0
      ? ((currentNum - prevNum) / Math.abs(prevNum)) * 100
      : null;
  const improved = delta != null ? (higherIsBetter ? delta > 0 : delta < 0) : null;

  return (
    <div className="p-3 rounded-xl border bg-card/50 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${valueClass ?? ""}`}>{value}</p>
      {delta != null ? (
        <div className={`flex items-center gap-1 text-[11px] font-medium ${improved ? "text-emerald-500" : "text-rose-500"}`}>
          {improved
            ? <TrendingUp className="w-3 h-3 shrink-0" />
            : <TrendingDown className="w-3 h-3 shrink-0" />}
          <span>{Math.abs(delta).toFixed(1)}٪ {improved ? "بهتر" : "ضعیف‌تر"} از قبل</span>
        </div>
      ) : (
        hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, valueClass }: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div className="p-3 rounded-xl border bg-card/50 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold text-sm mt-0.5">{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, text, cta, href }: {
  icon: React.ElementType; text: string; cta: string; href: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3 text-center text-muted-foreground">
      <Icon className="w-8 h-8 opacity-20" />
      <p className="text-sm">{text}</p>
      <Link href={href}>
        <Button variant="ghost" size="sm" className="text-primary hover:text-primary text-xs">
          <Plus className="w-3 h-3 ml-1" /> {cta}
        </Button>
      </Link>
    </div>
  );
}
