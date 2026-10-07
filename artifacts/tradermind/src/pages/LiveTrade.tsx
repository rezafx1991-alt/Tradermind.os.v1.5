import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { format } from 'date-fns';
import { tradeService } from '../services/tradeService';
import { db, Trade } from '../db/database';
import {
  parseLiveMonitoring, saveLiveMonitoring, computeCurrentR, detectStateFromR,
  initializePlanSnapshot, addEvent, transitionState, addRProgression,
  detectPlanDeviations, findHistoricalComparisons, detectBehaviorPatterns,
  generateLiveInsights,
} from '../services/liveTradeService';
import {
  LiveMonitoringData, TradeEventType, TradeScenario,
  LIVE_STATE_LABELS, LIVE_STATE_COLORS,
  EVENT_ICONS, EVENT_LABELS,
  SCENARIO_TYPE_LABELS, SCENARIO_STATUS_LABELS,
} from '../types/liveTrade';
import { openImagePicker, fileToCompressedDataUrl } from '../lib/imageCompression';

import { Button }   from '../components/ui/button';
import { Badge }    from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input }    from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label }    from '../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  ArrowRight, Plus, Camera, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Clock, BarChart2, History,
  Activity, BookOpen, ChevronDown, ChevronUp, Trash2, Loader2,
  RefreshCw, Target, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import StoredImage from '../components/StoredImage';

// ── Helpers ────────────────────────────────────────────────────────

const DIR_FA: Record<string, string> = { long: 'خرید (Long)', short: 'فروش (Short)' };
const RESULT_FA: Record<string, string> = {
  win: 'سود', loss: 'ضرر', breakeven: 'سربه‌سر',
  'partial-win': 'سود جزئی', 'partial-loss': 'ضرر جزئی', open: 'باز',
};

const RESULT_COLORS: Record<string, string> = {
  win: 'text-emerald-400', loss: 'text-rose-400', breakeven: 'text-slate-400',
  'partial-win': 'text-teal-400', 'partial-loss': 'text-amber-400', open: 'text-blue-400',
};

const INSIGHT_CATEGORY_FA: Record<string, string> = {
  'plan-alignment': 'وضعیت پلن',
  'historical-similarity': 'شباهت تاریخی',
  'market-development': 'توسعه بازار',
  'behavior-observation': 'رفتار اجرایی',
  'data-confidence': 'سطح داده',
};

const INSIGHT_CONFIDENCE_COLORS: Record<string, string> = {
  low: 'text-amber-400',
  medium: 'text-blue-400',
  high: 'text-emerald-400',
};

const EVENT_TYPE_OPTIONS: { value: TradeEventType; label: string }[] = [
  { value: 'observation',       label: '👁 مشاهده بازار' },
  { value: 'screenshot',        label: '📸 اسکرین‌شات' },
  { value: 'sl-modify',         label: '🔴 تغییر استاپ لاس' },
  { value: 'tp-modify',         label: '🎯 تغییر حد سود' },
  { value: 'partial-exit',      label: '📤 خروج جزئی' },
  { value: 'management-action', label: '⚙️ اقدام مدیریتی' },
  { value: 'plan-note',         label: '📝 یادداشت پلن' },
];

const SCENARIO_STATUS_OPTIONS: { value: TradeScenario['status']; label: string }[] = [
  { value: 'pending',      label: 'در انتظار' },
  { value: 'developing',   label: 'در حال توسعه' },
  { value: 'consistent',   label: 'سازگار' },
  { value: 'inconsistent', label: 'ناسازگار' },
  { value: 'triggered',    label: 'فعال شد' },
];

// ── Component ──────────────────────────────────────────────────────

export default function LiveTrade() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const [trade,     setTrade]     = useState<Trade | null>(null);
  const [monitoring, setMonitoring] = useState<LiveMonitoringData | null>(null);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [isSaving,  setIsSaving]  = useState(false);
  const [activeTab, setActiveTab] = useState('live');

  // Price input
  const [priceInput, setPriceInput] = useState('');
  const [currentR,   setCurrentR]   = useState<number | null>(null);

  // Add Event dialog
  const [showAddEvent,    setShowAddEvent]    = useState(false);
  const [eventType,       setEventType]       = useState<TradeEventType>('observation');
  const [eventNote,       setEventNote]       = useState('');
  const [eventPrice,      setEventPrice]      = useState('');
  const [eventTimeframe,  setEventTimeframe]  = useState('');
  const [eventScreenshot, setEventScreenshot] = useState<string | null>(null);

  // Add Scenario dialog
  const [showAddScenario, setShowAddScenario] = useState(false);
  const [scenarioType,    setScenarioType]    = useState<TradeScenario['type']>('primary');
  const [scenarioDesc,    setScenarioDesc]    = useState('');

  // Plan detail edit
  const [editingPlan,      setEditingPlan]      = useState(false);
  const [planBehavior,     setPlanBehavior]     = useState('');
  const [planInvalidation, setPlanInvalidation] = useState('');
  const [planConfirmation, setPlanConfirmation] = useState('');

  // ── Load ──────────────────────────────────────────────────────────

  useEffect(() => { if (id) loadData(); }, [id]);

  const loadData = async () => {
    if (!id) return;
    const tr = await tradeService.getTradeById(id);
    if (!tr) { setLocation('/journal/trades'); return; }
    setTrade(tr);

    const allTrs = await db.trades.toArray();
    setAllTrades(allTrs);

    let m = parseLiveMonitoring(tr);

    if (!m.planSnapshot) {
      m = { ...m, planSnapshot: initializePlanSnapshot(tr) };
    }

    setPlanBehavior(m.planSnapshot?.expectedBehavior ?? '');
    setPlanInvalidation(m.planSnapshot?.invalidationCondition ?? '');
    setPlanConfirmation(m.planSnapshot?.expectedConfirmation ?? '');

    if (m.historicalComparisons.length === 0) {
      m = { ...m, historicalComparisons: findHistoricalComparisons(tr, allTrs) };
    }

    if (m.planSnapshot) {
      m = { ...m, planDeviations: detectPlanDeviations(m.planSnapshot, tr) };
    }

    m = { ...m, liveInsights: generateLiveInsights(tr, m, allTrs) };

    setMonitoring(m);

    const lastPt = m.rProgression.at(-1);
    if (lastPt) {
      setPriceInput(lastPt.price.toString());
      setCurrentR(lastPt.rMultiple);
    } else {
      setPriceInput(tr.entryPrice.toString());
      setCurrentR(0);
    }

    await saveLiveMonitoring(tr.id, m);
  };

  // ── Persist ───────────────────────────────────────────────────────

  const persist = async (m: LiveMonitoringData) => {
    if (!trade) return;
    setIsSaving(true);
    try { await saveLiveMonitoring(trade.id, m); }
    finally { setIsSaving(false); }
  };

  // ── Handlers ─────────────────────────────────────────────────────

  const handlePriceUpdate = async () => {
    if (!trade || !monitoring) return;
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) { toast.error('قیمت معتبر وارد کنید'); return; }

    const r = computeCurrentR(trade, price);
    setCurrentR(r);
    if (r === null) return;

    let m = monitoring;
    const lastR = m.rProgression.at(-1)?.rMultiple ?? null;
    if (lastR === null || Math.abs(r - lastR) >= 0.05) {
      m = addRProgression(m, price, r);
    }

    const newState = detectStateFromR(r, trade);
    if (m.state !== newState && newState !== 'closed') {
      const prevState = m.state;
      m = transitionState(m, newState, price);

      // ── Section 19: Smart alerts on state change ──────────────────
      if (newState === 'near-stop-loss') {
        toast.warning('⚠️ قیمت به حد ضرر نزدیک شد', {
          description: `R فعلی: ${r.toFixed(2)} — پلن خود را مرور کنید`,
          duration: 8000,
        });
      } else if (newState === 'near-take-profit') {
        toast.success('🎯 قیمت به هدف نزدیک شد', {
          description: `R فعلی: ${r.toFixed(2)} — استراتژی خروج را بررسی کنید`,
          duration: 8000,
        });
      } else if (newState === 'in-drawdown' && (prevState === 'in-profit' || prevState === 'developing')) {
        toast.warning('📉 معامله وارد drawdown شد', {
          description: `R: ${r.toFixed(2)} — پلن را دنبال کنید`,
          duration: 5000,
        });
      } else if (newState === 'breakeven') {
        toast.info('⚖️ معامله به نقطه سر به سر رسید', { duration: 5000 });
      }
    }

    m = { ...m, liveInsights: generateLiveInsights(trade, m, allTrades) };
    setMonitoring(m);
    await persist(m);
    toast.success('قیمت بروزرسانی شد');
  };

  const handleAddEvent = async () => {
    if (!monitoring || !trade || !eventNote.trim() && eventType !== 'screenshot') return;
    const price = eventPrice ? parseFloat(eventPrice) : undefined;

    let m = addEvent(monitoring, eventType, {
      note:              eventNote || undefined,
      price:             price && !isNaN(price) ? price : undefined,
      rMultiple:         currentR ?? undefined,
      screenshotDataUrl: eventScreenshot ?? undefined,
      timeframe:         eventTimeframe || undefined,
    });

    if (m.planSnapshot && (eventType === 'sl-modify' || eventType === 'tp-modify')) {
      m = { ...m, planDeviations: detectPlanDeviations(m.planSnapshot, trade) };

      // ── Section 19: Alert on plan deviation ───────────────────────
      if (eventType === 'sl-modify') {
        toast.warning('🔴 حد ضرر تغییر کرد', {
          description: 'این یک انحراف از پلن اصلی است — در مرور پس از معامله ثبت می‌شود',
          duration: 6000,
        });
      } else if (eventType === 'tp-modify') {
        toast.info('🎯 حد سود تغییر کرد', {
          description: 'تغییر هدف نسبت به پلن اصلی ثبت شد',
          duration: 6000,
        });
      }
    }

    m = { ...m, behaviorObservations: detectBehaviorPatterns(m, allTrades) };

    // ── Section 19: Alert on new critical behavior patterns ──────
    const prevObs = monitoring.behaviorObservations ?? [];
    const newObs = (m.behaviorObservations ?? []).filter(
      o => !prevObs.some(p => p.pattern === o.pattern),
    );
    newObs.forEach(obs => {
      toast.warning(`⚠️ ${obs.description}`, {
        description: obs.historicalCount > 0 ? `${obs.historicalCount} بار در تاریخچه شما` : 'الگوی رفتاری شناسایی شد',
        duration: 8000,
      });
    });

    m = { ...m, liveInsights: generateLiveInsights(trade, m, allTrades) };

    setMonitoring(m);
    await persist(m);

    setEventNote(''); setEventPrice(''); setEventTimeframe('');
    setEventScreenshot(null); setShowAddEvent(false);
    toast.success('رویداد ثبت شد');
  };

  const handleAddScenario = async () => {
    if (!monitoring || !scenarioDesc.trim() || !trade) return;
    const scenario: TradeScenario = {
      id: crypto.randomUUID(),
      type: scenarioType,
      description: scenarioDesc,
      status: 'pending',
      notes: null,
      updatedAt: Date.now(),
    };
    const m = { ...monitoring, scenarios: [...monitoring.scenarios, scenario] };
    setMonitoring(m);
    await persist(m);
    setScenarioDesc(''); setShowAddScenario(false);
    toast.success('سناریو اضافه شد');
  };

  const handleUpdateScenarioStatus = async (sid: string, status: TradeScenario['status']) => {
    if (!monitoring || !trade) return;
    const m = {
      ...monitoring,
      scenarios: monitoring.scenarios.map(s =>
        s.id === sid ? { ...s, status, updatedAt: Date.now() } : s,
      ),
    };
    setMonitoring(m);
    await persist(m);

    // ── Section 19: Alert when invalidation scenario triggers ─────
    const scenario = monitoring.scenarios.find(s => s.id === sid);
    if (status === 'triggered' && scenario) {
      if (scenario.type === 'invalidation') {
        toast.error('🚨 شرط باطل‌شدن پلن فعال شد!', {
          description: scenario.description,
          duration: 12000,
        });
      } else if (scenario.type === 'alternative') {
        toast.warning('🔀 سناریوی جایگزین فعال شد', {
          description: scenario.description,
          duration: 8000,
        });
      } else {
        toast.success('✅ سناریوی اصلی فعال شد', {
          description: scenario.description,
          duration: 6000,
        });
      }
    }
  };

  const handleDeleteScenario = async (sid: string) => {
    if (!monitoring || !trade) return;
    const m = { ...monitoring, scenarios: monitoring.scenarios.filter(s => s.id !== sid) };
    setMonitoring(m);
    await persist(m);
  };

  const handleSavePlanDetails = async () => {
    if (!monitoring?.planSnapshot || !trade) return;
    const m = {
      ...monitoring,
      planSnapshot: {
        ...monitoring.planSnapshot,
        expectedBehavior:     planBehavior,
        invalidationCondition: planInvalidation,
        expectedConfirmation: planConfirmation,
      },
    };
    setMonitoring(m);
    await persist(m);
    setEditingPlan(false);
    toast.success('جزئیات پلن ذخیره شد');
  };

  const handleScreenshotForEvent = () => {
    openImagePicker({
      accept: 'image/*',
      onSelect: async (files) => {
        if (!files[0]) return;
        try {
          const dataUrl = await fileToCompressedDataUrl(files[0]);
          setEventScreenshot(dataUrl);
        } catch { toast.error('خطا در بارگذاری تصویر'); }
      },
    });
  };

  // ── Early return ──────────────────────────────────────────────────

  if (!trade || !monitoring) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">
        در حال بارگذاری...
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────

  const rColor = currentR == null ? 'text-muted-foreground' :
    currentR > 0.05 ? 'text-emerald-400' :
    currentR < -0.05 ? 'text-rose-400' : 'text-sky-400';

  const sortedEvents = [...monitoring.events].sort((a, b) => b.timestamp - a.timestamp);
  const plan = monitoring.planSnapshot;
  const mfe  = monitoring.maxFavorableExcursion;
  const mae  = monitoring.maxAdverseExcursion;

  // ── JSX ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto pb-32 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b pb-4 mb-4 sticky top-0 bg-background z-10 pt-2 gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/journal/trades/${trade.id}`)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{trade.symbol}</h1>
              <Badge variant="outline" className={
                trade.direction === 'long'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30 text-xs'
              }>
                {DIR_FA[trade.direction]}
              </Badge>
              <Badge variant="outline" className={`text-xs ${LIVE_STATE_COLORS[monitoring.state]}`}>
                {LIVE_STATE_LABELS[monitoring.state]}
              </Badge>
              {isSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              ورود: {trade.entryPrice} — SL: {trade.stopLoss}{trade.takeProfit ? ` — TP: ${trade.takeProfit}` : ''}
            </p>
          </div>
        </div>
        {trade.status === 'closed' && (
          <Button variant="outline" size="sm" onClick={() => setLocation(`/journal/trades/${trade.id}/review`)}>
            مرور
          </Button>
        )}
      </div>

      {/* ── Current Price Bar ── */}
      <Card className="mb-4 border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">قیمت جاری (دستی)</Label>
              <Input
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePriceUpdate()}
                placeholder="قیمت فعلی بازار..."
                className="font-mono"
                type="number"
                step="any"
              />
            </div>
            <Button onClick={handlePriceUpdate} className="shrink-0 gap-2">
              <RefreshCw className="w-4 h-4" /> آپدیت
            </Button>
          </div>

          {/* R + MFE/MAE row */}
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">R جاری</p>
              <p className={`text-lg font-bold font-mono ${rColor}`}>
                {currentR != null ? (currentR >= 0 ? '+' : '') + currentR.toFixed(2) + 'R' : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">بیشترین سود (MFE)</p>
              <p className="text-base font-mono text-emerald-400">
                {mfe != null ? (mfe >= 0 ? '+' : '') + mfe.toFixed(2) + 'R' : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">بیشترین ضرر (MAE)</p>
              <p className="text-base font-mono text-rose-400">
                {mae != null ? mae.toFixed(2) + 'R' : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5 mb-4">
          <TabsTrigger value="live"    className="text-xs">لایو</TabsTrigger>
          <TabsTrigger value="events"  className="text-xs">رویدادها</TabsTrigger>
          <TabsTrigger value="plan"    className="text-xs">پلن</TabsTrigger>
          <TabsTrigger value="scenarios" className="text-xs">سناریو</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">تاریخچه</TabsTrigger>
        </TabsList>

        {/* ══ TAB: لایو ══ */}
        <TabsContent value="live" className="space-y-4">

          {/* Insights */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> بینش‌های زنده
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {monitoring.liveInsights.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  قیمت جاری را وارد کنید تا بینش‌ها تولید شود.
                </p>
              ) : monitoring.liveInsights.map(insight => (
                <div key={insight.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {INSIGHT_CATEGORY_FA[insight.category] ?? insight.category}
                    </span>
                    <span className={`text-xs font-medium ${INSIGHT_CONFIDENCE_COLORS[insight.confidence]}`}>
                      {insight.confidence === 'high' ? 'اطمینان بالا' : insight.confidence === 'medium' ? 'اطمینان متوسط' : 'داده محدود'}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{insight.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Plan deviations summary */}
          {monitoring.planDeviations.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="w-4 h-4" /> انحراف از پلن شناسایی شد
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {monitoring.planDeviations.map(dev => (
                  <div key={dev.id} className="text-sm">
                    <span className="font-medium text-amber-300">{dev.label}:</span>
                    <span className="text-muted-foreground"> اصلی: </span>
                    <span className="font-mono">{dev.original}</span>
                    <span className="text-muted-foreground"> ← فعلی: </span>
                    <span className="font-mono text-amber-300">{dev.current}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* State history */}
          {monitoring.stateHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" /> سیر وضعیت
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[...monitoring.stateHistory].reverse().slice(0, 5).map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <Badge variant="outline" className={`text-xs ${LIVE_STATE_COLORS[entry.state]}`}>
                        {LIVE_STATE_LABELS[entry.state]}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(entry.timestamp, 'HH:mm')}
                        {entry.price ? ` — ${entry.price}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* R Progression mini chart */}
          {monitoring.rProgression.length >= 2 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> پیشرفت R-Multiple
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {monitoring.rProgression.map((pt, i) => (
                    <div key={i} title={format(pt.timestamp, 'HH:mm')}
                      className={`text-xs font-mono px-2 py-0.5 rounded border ${
                        pt.rMultiple > 0 ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                        : pt.rMultiple < 0 ? 'border-rose-500/40 text-rose-400 bg-rose-500/10'
                        : 'border-sky-500/40 text-sky-400 bg-sky-500/10'
                      }`}>
                      {pt.rMultiple >= 0 ? '+' : ''}{pt.rMultiple.toFixed(2)}R
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Behavior observations */}
          {monitoring.behaviorObservations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" /> مشاهدات رفتاری
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {monitoring.behaviorObservations.map(obs => (
                  <p key={obs.id} className="text-sm text-muted-foreground leading-relaxed border-r-2 border-primary/40 pr-3">
                    {obs.description}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══ TAB: رویدادها ══ */}
        <TabsContent value="events" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddEvent(true)}>
              <Plus className="w-4 h-4" /> افزودن رویداد
            </Button>
          </div>

          {sortedEvents.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">هنوز رویدادی ثبت نشده است.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative space-y-3">
              {/* Timeline line */}
              <div className="absolute right-[21px] top-0 bottom-0 w-0.5 bg-border" />

              {sortedEvents.map(event => (
                <div key={event.id} className="flex gap-3 relative">
                  <div className="w-10 h-10 shrink-0 rounded-full border border-border bg-background flex items-center justify-center text-base z-10">
                    {EVENT_ICONS[event.type]}
                  </div>
                  <Card className="flex-1">
                    <CardContent className="pt-3 pb-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-primary">
                          {EVENT_LABELS[event.type]}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {format(event.timestamp, 'HH:mm · dd/MM')}
                        </span>
                      </div>
                      {event.note && (
                        <p className="text-sm leading-relaxed">{event.note}</p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {event.price    && <span className="font-mono">قیمت: {event.price}</span>}
                        {event.rMultiple != null && (
                          <span className={`font-mono font-medium ${
                            event.rMultiple > 0 ? 'text-emerald-400' :
                            event.rMultiple < 0 ? 'text-rose-400' : 'text-sky-400'
                          }`}>
                            {event.rMultiple >= 0 ? '+' : ''}{event.rMultiple.toFixed(2)}R
                          </span>
                        )}
                        {event.timeframe && <span>تایم‌فریم: {event.timeframe}</span>}
                      </div>
                      {event.screenshotDataUrl && (
                        <StoredImage
                          source={event.screenshotDataUrl}
                          alt="اسکرین‌شات"
                          enableViewer
                          showDownload
                          filename="trade-event-screenshot"
                          className="max-h-40 rounded-lg object-contain border mt-2"
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ══ TAB: پلن ══ */}
        <TabsContent value="plan" className="space-y-4">

          {/* Immutable plan snapshot */}
          {plan && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" /> پلن اصلی (تغییرناپذیر)
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setEditingPlan(!editingPlan)}>
                    {editingPlan ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Fixed fields */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['ورود برنامه', plan.plannedEntry],
                    ['استاپ لاس',   plan.stopLoss],
                    ['حد سود',      plan.takeProfit ?? '—'],
                    ['R:R برنامه',  plan.plannedRR != null ? plan.plannedRR.toFixed(2) : '—'],
                    ['ریسک %',      plan.plannedRisk != null ? plan.plannedRisk + '%' : '—'],
                    ['حجم',         plan.plannedPositionSize ?? '—'],
                  ].map(([label, val]) => (
                    <div key={String(label)}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-mono font-medium">{String(val)}</p>
                    </div>
                  ))}
                </div>

                {plan.originalAnalysis && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">یادداشت اولیه</p>
                    <p className="text-sm leading-relaxed text-muted-foreground border-r-2 border-border pr-3">
                      {plan.originalAnalysis}
                    </p>
                  </div>
                )}

                {/* Editable detail fields */}
                {editingPlan ? (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <Label className="text-xs">رفتار انتظاری بازار</Label>
                      <Textarea
                        value={planBehavior}
                        onChange={e => setPlanBehavior(e.target.value)}
                        placeholder="قیمت باید به ناحیه X رسیده و ادامه دهد..."
                        className="mt-1 text-sm"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">شرط باطل‌شدن (Invalidation)</Label>
                      <Textarea
                        value={planInvalidation}
                        onChange={e => setPlanInvalidation(e.target.value)}
                        placeholder="اگر قیمت بالای X بسته شد..."
                        className="mt-1 text-sm"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">تأییدیه انتظاری</Label>
                      <Textarea
                        value={planConfirmation}
                        onChange={e => setPlanConfirmation(e.target.value)}
                        placeholder="کندل تأیید در تایم‌فریم پایین‌تر..."
                        className="mt-1 text-sm"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSavePlanDetails}>ذخیره</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPlan(false)}>انصراف</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {(plan.expectedBehavior || plan.invalidationCondition || plan.expectedConfirmation) && (
                      <div className="space-y-2 pt-2 border-t">
                        {plan.expectedBehavior && (
                          <div>
                            <p className="text-xs text-muted-foreground">رفتار انتظاری</p>
                            <p className="text-sm leading-relaxed">{plan.expectedBehavior}</p>
                          </div>
                        )}
                        {plan.invalidationCondition && (
                          <div>
                            <p className="text-xs text-muted-foreground">شرط باطل‌شدن</p>
                            <p className="text-sm leading-relaxed text-red-300">{plan.invalidationCondition}</p>
                          </div>
                        )}
                        {plan.expectedConfirmation && (
                          <div>
                            <p className="text-xs text-muted-foreground">تأییدیه</p>
                            <p className="text-sm leading-relaxed">{plan.expectedConfirmation}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!plan.expectedBehavior && !plan.invalidationCondition && (
                      <button
                        onClick={() => setEditingPlan(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        + افزودن رفتار انتظاری و شرط باطل‌شدن
                      </button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Plan deviations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> انحرافات از پلن
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monitoring.planDeviations.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> انحراف از پلن شناسایی نشده است.
                </div>
              ) : (
                <div className="space-y-3">
                  {monitoring.planDeviations.map(dev => (
                    <div key={dev.id} className="border rounded-lg p-3 border-amber-500/30 bg-amber-500/5 space-y-1">
                      <p className="text-xs font-medium text-amber-400">{dev.label}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-xs text-muted-foreground block">پلن اصلی</span>
                          <span className="font-mono">{dev.original}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">مقدار فعلی</span>
                          <span className="font-mono text-amber-300">{dev.current}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Behavior observations */}
          {monitoring.behaviorObservations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" /> الگوهای رفتاری مشاهده‌شده
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {monitoring.behaviorObservations.map(obs => (
                  <p key={obs.id} className="text-sm text-muted-foreground leading-relaxed border-r-2 border-amber-500/40 pr-3">
                    {obs.description}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══ TAB: سناریو ══ */}
        <TabsContent value="scenarios" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddScenario(true)}>
              <Plus className="w-4 h-4" /> افزودن سناریو
            </Button>
          </div>

          {monitoring.scenarios.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Target className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm mb-2">سناریویی تعریف نشده.</p>
                <p className="text-xs">سناریو اصلی، جایگزین، و شرط باطل‌شدن را تعریف کنید.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {monitoring.scenarios.map(scenario => {
                const typeColor =
                  scenario.type === 'primary'     ? 'border-blue-500/30 bg-blue-500/5' :
                  scenario.type === 'alternative' ? 'border-amber-500/30 bg-amber-500/5' :
                  'border-red-500/30 bg-red-500/5';

                const statusColor =
                  scenario.status === 'consistent'   ? 'text-emerald-400' :
                  scenario.status === 'inconsistent' ? 'text-rose-400' :
                  scenario.status === 'triggered'    ? 'text-amber-400' :
                  scenario.status === 'developing'   ? 'text-blue-400' :
                  'text-muted-foreground';

                return (
                  <Card key={scenario.id} className={`border ${typeColor}`}>
                    <CardContent className="pt-3 pb-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge variant="outline" className="text-xs mb-2">
                            {SCENARIO_TYPE_LABELS[scenario.type]}
                          </Badge>
                          <p className="text-sm leading-relaxed">{scenario.description}</p>
                          <p className={`text-xs mt-1 font-medium ${statusColor}`}>
                            {SCENARIO_STATUS_LABELS[scenario.status]}
                          </p>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-400"
                          onClick={() => handleDeleteScenario(scenario.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Status update buttons */}
                      <div className="flex flex-wrap gap-1.5">
                        {SCENARIO_STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => handleUpdateScenarioStatus(scenario.id, opt.value)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              scenario.status === opt.value
                                ? 'border-primary bg-primary/20 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ══ TAB: تاریخچه ══ */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-primary" /> معاملات مشابه در تاریخچه
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monitoring.historicalComparisons.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  معامله مشابه بسته‌شده‌ای در تاریخچه یافت نشد.
                </p>
              ) : (
                <div className="space-y-3">
                  {monitoring.historicalComparisons.map(comp => (
                    <div
                      key={comp.tradeId}
                      className="border rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => setLocation(`/journal/trades/${comp.tradeId}`)}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{comp.symbol}</span>
                          <Badge variant="outline" className={`text-xs ${
                            comp.direction === 'long'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}>
                            {DIR_FA[comp.direction]}
                          </Badge>
                        </div>
                        <span className={`text-sm font-medium ${RESULT_COLORS[comp.result] ?? ''}`}>
                          {RESULT_FA[comp.result] ?? comp.result}
                          {comp.rMultiple != null &&
                            ` (${comp.rMultiple >= 0 ? '+' : ''}${comp.rMultiple.toFixed(2)}R)`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{comp.similarity}</p>
                      <p className="text-xs text-primary mt-1">→ {comp.whatHappened}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outcome summary */}
          {monitoring.historicalComparisons.length >= 2 && (() => {
            const total = monitoring.historicalComparisons.length;
            const wins  = monitoring.historicalComparisons.filter(
              c => c.result === 'win' || c.result === 'partial-win',
            ).length;
            const losses = monitoring.historicalComparisons.filter(
              c => c.result === 'loss' || c.result === 'partial-loss',
            ).length;
            const winPct = Math.round((wins / total) * 100);
            return (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-2">خلاصه نتایج تاریخی</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-2xl font-bold">{total}</p>
                      <p className="text-xs text-muted-foreground">کل</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-400">{wins}</p>
                      <p className="text-xs text-muted-foreground">برد</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-rose-400">{losses}</p>
                      <p className="text-xs text-muted-foreground">باخت</p>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${winPct}%` }} />
                  </div>
                  <p className="text-xs text-center text-muted-foreground mt-1">نرخ برد {winPct}٪</p>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ── FAB: Add Event ── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <Button
          onClick={() => setShowAddEvent(true)}
          className="rounded-full shadow-lg gap-2 px-6 h-12"
        >
          <Plus className="w-5 h-5" /> ثبت رویداد
        </Button>
      </div>

      {/* ── Dialog: Add Event ── */}
      <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle>ثبت رویداد جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">نوع رویداد</Label>
              <Select value={eventType} onValueChange={v => setEventType(v as TradeEventType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">یادداشت</Label>
              <Textarea
                value={eventNote}
                onChange={e => setEventNote(e.target.value)}
                placeholder="توضیحات رویداد..."
                className="mt-1 text-sm"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">قیمت (اختیاری)</Label>
                <Input
                  value={eventPrice}
                  onChange={e => setEventPrice(e.target.value)}
                  placeholder={priceInput}
                  type="number"
                  step="any"
                  className="mt-1 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">تایم‌فریم</Label>
                <Input
                  value={eventTimeframe}
                  onChange={e => setEventTimeframe(e.target.value)}
                  placeholder="مثلاً 1H"
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            {(eventType === 'screenshot') && (
              <div>
                {eventScreenshot ? (
                  <div className="relative inline-block">
                    <StoredImage
                      source={eventScreenshot}
                      alt="preview"
                      enableViewer
                      showDownload
                      filename="trade-event-screenshot"
                      className="max-h-32 rounded-lg border object-contain"
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="absolute top-1 right-1 h-6 w-6 bg-background/80"
                      onClick={() => setEventScreenshot(null)}
                    >✕</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-2 w-full border-dashed" onClick={handleScreenshotForEvent}>
                    <Camera className="w-4 h-4" /> آپلود اسکرین‌شات
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowAddEvent(false)}>انصراف</Button>
            <Button onClick={handleAddEvent}>ثبت</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Add Scenario ── */}
      <Dialog open={showAddScenario} onOpenChange={setShowAddScenario}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle>افزودن سناریو</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">نوع سناریو</Label>
              <Select value={scenarioType} onValueChange={v => setScenarioType(v as TradeScenario['type'])}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">سناریو اصلی</SelectItem>
                  <SelectItem value="alternative">سناریو جایگزین</SelectItem>
                  <SelectItem value="invalidation">شرط باطل‌شدن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">توضیحات</Label>
              <Textarea
                value={scenarioDesc}
                onChange={e => setScenarioDesc(e.target.value)}
                placeholder="قیمت باید ناحیه X را رد کرده و..."
                className="mt-1 text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowAddScenario(false)}>انصراف</Button>
            <Button onClick={handleAddScenario}>افزودن</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
