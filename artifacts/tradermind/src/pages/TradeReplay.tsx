import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Skeleton } from '../components/ui/skeleton';
import {
  datasetService, sessionService, decisionService, playlistService,
  parseCSVCandles, getPersonalizedSuggestions, generateLessonSuggestion,
  getReplayAnalytics, exportReplayData, getAlternativeAnalysis,
  getSimilarDatasets,
  normalizeReplayCandle,
} from '../services/replayService';
import {
  ReplayDataset, ReplaySession, ReplayDecision, ReplayPlaylist,
  ReplayCandle, ReplayScreenshotItem, ReplayMode, CoachingMode,
  ReplayDecisionAction, Trade,
} from '../db/database';
import { knowledgeService } from '../services/knowledgeService';
import { db } from '../db/database';
import { ReplayErrorBoundary } from '../components/errorBoundaries/ReplayErrorBoundary';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useToast } from '../hooks/use-toast';
import StoredImage from '../components/StoredImage';
import {
  Play, Pause, SkipForward, Eye, EyeOff, ChevronRight, ChevronLeft,
  Plus, Upload, Trash2, BarChart3, TrendingUp, TrendingDown,
  AlertCircle, CheckCircle2, Clock, Target, RefreshCw, Brain,
  Star, Zap, BookOpen, ListOrdered, Activity, Award,
  Download, FileText, Image, Info, X, ChevronDown, ChevronUp,
  Layers, Flag, RotateCcw, Minus, Search, SlidersHorizontal,
  GitBranch, Shuffle, ArrowRightLeft,
} from 'lucide-react';

// ── SVG Candlestick Chart ──────────────────────────────────────────

interface CandleChartProps {
  candles: ReplayCandle[];
  height?: number;
  simulatedEntry?: number | null;
  simulatedSL?: number | null;
  simulatedTP?: number | null;
}

function CandleChart({ candles, height = 220, simulatedEntry, simulatedSL, simulatedTP }: CandleChartProps) {
  const safeCandles = candles.filter(c =>
    [c.timestamp, c.open, c.high, c.low, c.close].every(Number.isFinite)
    && c.high >= Math.max(c.open, c.close)
    && c.low <= Math.min(c.open, c.close)
    && c.high >= c.low
  );
  if (safeCandles.length === 0) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
      <BarChart3 className="h-8 w-8 opacity-30 mr-2" />داده کندلی موجود نیست
    </div>
  );

  const W = 600;
  const H = height;
  const padL = 10, padR = 45, padT = 12, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  let minP = Infinity;
  let maxP = -Infinity;
  for (const candle of safeCandles) {
    minP = Math.min(minP, candle.low);
    maxP = Math.max(maxP, candle.high);
  }
  // Add lines to range if needed
  [simulatedEntry, simulatedSL, simulatedTP].filter(Boolean).forEach(p => {
    if (p! < minP) minP = p!;
    if (p! > maxP) maxP = p!;
  });
  const range = maxP - minP || 1;
  const pad5 = range * 0.05;
  minP -= pad5; maxP += pad5;

  const toX = (i: number) => padL + (i + 0.5) * (chartW / safeCandles.length);
  const toY = (p: number) => padT + ((maxP - p) / (maxP - minP)) * chartH;
  const candleW = Math.max(2, Math.min(14, (chartW / safeCandles.length) * 0.7));

  // Price ticks
  const nTicks = 4;
  const ticks = Array.from({ length: nTicks + 1 }, (_, i) => minP + (i / nTicks) * (maxP - minP));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {/* Grid */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={toY(t)} y2={toY(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={W - padR + 3} y={toY(t) + 4} fontSize={9} fill="#6b7280">{t.toFixed(t > 100 ? 0 : 4)}</text>
        </g>
      ))}

      {/* Simulated lines */}
      {simulatedEntry && (
        <line x1={padL} x2={W - padR} y1={toY(simulatedEntry)} y2={toY(simulatedEntry)}
          stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4,3" />
      )}
      {simulatedSL && (
        <line x1={padL} x2={W - padR} y1={toY(simulatedSL)} y2={toY(simulatedSL)}
          stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" />
      )}
      {simulatedTP && (
        <line x1={padL} x2={W - padR} y1={toY(simulatedTP)} y2={toY(simulatedTP)}
          stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4,3" />
      )}

      {/* Candles */}
      {safeCandles.map((c, i) => {
        const x = toX(i);
        const isUp = c.close >= c.open;
        const color = isUp ? '#22c55e' : '#ef4444';
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBot = toY(Math.min(c.open, c.close));
        const bodyH   = Math.max(1, bodyBot - bodyTop);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={color} strokeWidth={1} />
            <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} rx={0.5} />
          </g>
        );
      })}

      {/* Time axis */}
      {safeCandles.length <= 30
        ? safeCandles.map((c, i) => i % Math.ceil(safeCandles.length / 6) === 0 && (
          <text key={i} x={toX(i)} y={H - 4} fontSize={8} fill="#6b7280" textAnchor="middle">
            {new Date(c.timestamp).toLocaleString('fa-IR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </text>
        ))
        : null
      }

      {/* Labels */}
      {simulatedEntry && <text x={W - padR + 3} y={toY(simulatedEntry) - 3} fontSize={8} fill="#3b82f6">ورود</text>}
      {simulatedSL    && <text x={W - padR + 3} y={toY(simulatedSL) - 3}    fontSize={8} fill="#ef4444">SL</text>}
      {simulatedTP    && <text x={W - padR + 3} y={toY(simulatedTP) - 3}    fontSize={8} fill="#22c55e">TP</text>}
    </svg>
  );
}

// ── Screenshot Viewer ──────────────────────────────────────────────

function ScreenshotViewer({ item, step, total }: { item: ReplayScreenshotItem; step: number; total: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Image className="h-3.5 w-3.5" />
          {item.label || `مرحله ${step + 1}`}
        </span>
        <span>{step + 1} / {total}</span>
      </div>
      <div className="rounded-lg overflow-hidden border border-border/40 bg-black/20">
        <StoredImage
          source={item.dataUrl}
          alt={item.label || `Step ${step + 1}`}
          enableViewer
          showDownload
          filename={item.label || `replay-step-${step + 1}`}
          className="w-full object-contain max-h-72"
        />
      </div>
      {item.timeframe && (
        <Badge variant="outline" className="text-xs">{item.timeframe}</Badge>
      )}
      {item.notes && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">{item.notes}</p>
      )}
    </div>
  );
}

// ── Decision Panel ─────────────────────────────────────────────────

interface DecisionPanelProps {
  onSubmit: (d: {
    action: ReplayDecisionAction;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    riskPercent?: number;
    whatISee?: string;
    whyEnter?: string;
    invalidation?: string;
    marketCondition?: string;
    confidence?: number;
  }) => void;
  hasOpenPosition: boolean;
  coachingMode: CoachingMode;
  lastCandle?: ReplayCandle;
}

function DecisionPanel({ onSubmit, hasOpenPosition, coachingMode, lastCandle }: DecisionPanelProps) {
  const [action, setAction] = useState<ReplayDecisionAction | ''>('');
  const [entry, setEntry] = useState(lastCandle ? String(lastCandle.close) : '');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [risk, setRisk] = useState('1');
  const [whatISee, setWhatISee] = useState('');
  const [whyEnter, setWhyEnter] = useState('');
  const [invalidation, setInvalidation] = useState('');
  const [marketCond, setMarketCond] = useState('');
  const [confidence, setConfidence] = useState(5);
  const [showReasoning, setShowReasoning] = useState(coachingMode === 'reflection' || coachingMode === 'coaching');
  const startTimeRef = useRef(Date.now());

  useEffect(() => { startTimeRef.current = Date.now(); }, []);

  const isTrade = action === 'long' || action === 'short';
  const isManage = hasOpenPosition && (action === 'close' || action === 'move-sl' || action === 'move-tp' || action === 'partial-close');

  const handleSubmit = () => {
    if (!action) return;
    onSubmit({
      action: action as ReplayDecisionAction,
      entryPrice: isTrade ? parseFloat(entry) || undefined : undefined,
      stopLoss: (isTrade || action === 'move-sl') ? parseFloat(sl) || undefined : undefined,
      takeProfit: (isTrade || action === 'move-tp') ? parseFloat(tp) || undefined : undefined,
      riskPercent: isTrade ? parseFloat(risk) || undefined : undefined,
      whatISee: whatISee || undefined,
      whyEnter: whyEnter || undefined,
      invalidation: invalidation || undefined,
      marketCondition: marketCond || undefined,
      confidence,
    });
  };

  const actionButtons = hasOpenPosition
    ? [
        { v: 'wait' as ReplayDecisionAction, label: 'نگه دار', icon: Pause, cls: 'border-blue-500/40 text-blue-400' },
        { v: 'close' as ReplayDecisionAction, label: 'بستن', icon: X, cls: 'border-red-500/40 text-red-400' },
        { v: 'partial-close' as ReplayDecisionAction, label: 'بستن جزئی', icon: Minus, cls: 'border-orange-500/40 text-orange-400' },
        { v: 'move-sl' as ReplayDecisionAction, label: 'تغییر SL', icon: Flag, cls: 'border-yellow-500/40 text-yellow-400' },
        { v: 'move-tp' as ReplayDecisionAction, label: 'تغییر TP', icon: Target, cls: 'border-green-500/40 text-green-400' },
      ]
    : [
        { v: 'long' as ReplayDecisionAction,     label: 'خرید',        icon: TrendingUp,   cls: 'border-green-500/40 text-green-400' },
        { v: 'short' as ReplayDecisionAction,    label: 'فروش',        icon: TrendingDown, cls: 'border-red-500/40 text-red-400' },
        { v: 'wait' as ReplayDecisionAction,     label: 'صبر کن',      icon: Clock,        cls: 'border-yellow-500/40 text-yellow-400' },
        { v: 'no-trade' as ReplayDecisionAction, label: 'بدون معامله', icon: EyeOff,       cls: 'border-gray-500/40 text-gray-400' },
      ];

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-card/50" dir="rtl">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">تصمیم شما</p>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        {actionButtons.map(btn => (
          <button
            key={btn.v}
            onClick={() => setAction(btn.v)}
            className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-sm font-medium transition-all ${btn.cls} ${action === btn.v ? 'bg-muted/60 ring-1 ring-primary' : 'bg-background hover:bg-muted/30'}`}
          >
            <btn.icon className="h-4 w-4" />
            {btn.label}
          </button>
        ))}
      </div>

      {/* Trade parameters */}
      {isTrade && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">ورود</label>
            <Input value={entry} onChange={e => setEntry(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="قیمت ورود" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">ریسک %</label>
            <Input value={risk} onChange={e => setRisk(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="1" type="number" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">حد ضرر</label>
            <Input value={sl} onChange={e => setSl(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="SL" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">هدف</label>
            <Input value={tp} onChange={e => setTp(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="TP" />
          </div>
        </div>
      )}

      {/* SL/TP edit for position management */}
      {(action === 'move-sl' || action === 'move-tp') && (
        <div className="grid grid-cols-2 gap-2">
          {action === 'move-sl' && (
            <div>
              <label className="text-[10px] text-muted-foreground">حد ضرر جدید</label>
              <Input value={sl} onChange={e => setSl(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="SL جدید" />
            </div>
          )}
          {action === 'move-tp' && (
            <div>
              <label className="text-[10px] text-muted-foreground">هدف جدید</label>
              <Input value={tp} onChange={e => setTp(e.target.value)} className="h-7 text-xs mt-0.5" placeholder="TP جدید" />
            </div>
          )}
        </div>
      )}

      {/* Reasoning toggle */}
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
        onClick={() => setShowReasoning(!showReasoning)}
      >
        {showReasoning ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {coachingMode === 'blind' ? 'استدلال (اختیاری)' : 'استدلال و تحلیل'}
      </button>

      {showReasoning && (
        <div className="space-y-2 border-r border-border pr-2">
          <div>
            <label className="text-[10px] text-muted-foreground">چه می‌بینید؟</label>
            <Textarea value={whatISee} onChange={e => setWhatISee(e.target.value)} placeholder="ساختار بازار، سطوح کلیدی..." rows={2} className="text-xs mt-0.5" />
          </div>
          {(action === 'long' || action === 'short') && (
            <div>
              <label className="text-[10px] text-muted-foreground">چرا وارد می‌شوید؟</label>
              <Textarea value={whyEnter} onChange={e => setWhyEnter(e.target.value)} placeholder="دلیل ورود..." rows={2} className="text-xs mt-0.5" />
            </div>
          )}
          <div>
            <label className="text-[10px] text-muted-foreground">چه چیزی ایده را باطل می‌کند؟</label>
            <Input value={invalidation} onChange={e => setInvalidation(e.target.value)} placeholder="invalidation..." className="h-7 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">شرایط بازار</label>
            <Input value={marketCond} onChange={e => setMarketCond(e.target.value)} placeholder="trending / ranging / choppy..." className="h-7 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">اعتماد: {confidence}/10</label>
            <input
              type="range" min={1} max={10} value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              className="w-full mt-0.5 accent-primary"
            />
          </div>
        </div>
      )}

      <Button onClick={handleSubmit} disabled={!action} className="w-full gap-2" size="sm">
        <CheckCircle2 className="h-4 w-4" />
        ثبت تصمیم
      </Button>
    </div>
  );
}

// ── Active Replay Engine ───────────────────────────────────────────

interface ActiveReplayProps {
  session: ReplaySession;
  dataset: ReplayDataset | null;
  onAdvance: () => void;
  onDecision: (d: Parameters<DecisionPanelProps['onSubmit']>[0]) => void;
  onClosePosition: (price: number) => void;
  onUpdateSLTP: (sl?: number, tp?: number) => void;
  onAbandon: () => void;
  onComplete: () => void;
  decisions: ReplayDecision[];
  coachingMode: CoachingMode;
}

function ActiveReplay({
  session, dataset, onAdvance, onDecision, onClosePosition, onUpdateSLTP,
  onAbandon, onComplete, decisions, coachingMode,
}: ActiveReplayProps) {
  const [showDecision, setShowDecision] = useState(false);
  const [closePrice, setClosePrice] = useState('');
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [revealCount, setRevealCount] = useState(session.revealCount);
  const [activeTF, setActiveTF] = useState<string>(session.timeframe ?? '');
  const [mtfDatasets, setMtfDatasets] = useState<Record<string, ReplayDataset>>({});

  // Load multi-timeframe datasets if present
  useEffect(() => {
    const additional = session.additionalDatasets
      ? (() => { try { return JSON.parse(session.additionalDatasets!) as Record<string, string>; } catch { return {}; } })()
      : {};
    if (Object.keys(additional).length === 0) return;
    const loadAll = async () => {
      const loaded: Record<string, ReplayDataset> = {};
      for (const [tf, dsId] of Object.entries(additional)) {
        const ds = await datasetService.getById(dsId);
        if (ds) loaded[tf] = ds;
      }
      setMtfDatasets(loaded);
    };
    loadAll();
  }, [session.additionalDatasets]);

  const activeDatasetForTF = activeTF && mtfDatasets[activeTF] ? mtfDatasets[activeTF] : dataset;

  const candles = useMemo(() => activeDatasetForTF && activeDatasetForTF.type === 'candles'
    ? datasetService.getCandles(activeDatasetForTF).slice(0, session.currentStep || 1)
    : [], [activeDatasetForTF, session.currentStep]);

  const screenshots = useMemo(() => dataset && dataset.type !== 'candles'
    ? datasetService.getScreenshots(dataset)
    : [], [dataset]);

  const currentScreenshot = screenshots[session.currentStep - 1] ?? screenshots[0];
  const progress = session.totalSteps > 0 ? (session.currentStep / session.totalSteps) * 100 : 0;
  const hasPosition = !!session.simulatedEntry && !session.simulatedClosedAt;
  const isComplete = session.status === 'completed';
  const lastCandle = candles[candles.length - 1];

  const handleDecision = (d: Parameters<DecisionPanelProps['onSubmit']>[0]) => {
    onDecision(d);
    if (d.action === 'close') {
      setShowCloseDialog(true);
    }
    setShowDecision(false);
  };

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{session.title}</h3>
          <p className="text-xs text-muted-foreground">
            {session.symbol} · {session.mode === 'screenshot' ? 'تصویر' : session.mode === 'candle' ? 'کندل' : session.mode === 'trade' ? 'معامله' : session.mode} ·
            <span className={` ml-1 ${coachingMode === 'blind' ? 'text-gray-400' : 'text-primary'}`}>
              {coachingMode === 'blind' ? '🙈 حالت کور' : coachingMode === 'reflection' ? '🤔 بازتاب' : coachingMode === 'context' ? '📋 زمینه' : '🎓 مربی'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{session.currentStep} / {session.totalSteps}</span>
          <button onClick={onAbandon} className="p-1 hover:bg-muted/50 rounded text-muted-foreground" title="پایان دادن">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress}%` }} />
      </div>

      {/* Multi-Timeframe switcher */}
      {(Object.keys(mtfDatasets).length > 0 || session.timeframe) && (
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-0.5">
          <span className="text-muted-foreground shrink-0 flex items-center gap-1">
            <ArrowRightLeft className="h-3 w-3" />TF:
          </span>
          {/* Main TF */}
          {session.timeframe && (
            <button
              onClick={() => setActiveTF(session.timeframe!)}
              className={`px-2 py-0.5 rounded border text-xs shrink-0 transition-colors ${activeTF === session.timeframe ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}
            >
              {session.timeframe} {dataset?.type === 'candles' ? '' : dataset?.type === 'screenshots' ? '🖼️' : ''}
            </button>
          )}
          {/* Additional TFs */}
          {Object.entries(mtfDatasets).map(([tf, ds]) => (
            <button key={tf}
              onClick={() => setActiveTF(tf)}
              className={`px-2 py-0.5 rounded border text-xs shrink-0 transition-colors ${activeTF === tf ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}
            >
              {tf} {ds.type === 'candles' ? '📊' : ds.type === 'screenshots' ? '🖼️' : ''}
            </button>
          ))}
          {Object.keys(mtfDatasets).length === 0 && (
            <span className="text-muted-foreground/50 text-[10px]">برای MTF چند دیتاست بارگذاری کنید</span>
          )}
        </div>
      )}

      {/* Position status */}
      {hasPosition && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs">
          <div className="flex items-center gap-2">
            {session.simulatedDirection === 'long'
              ? <TrendingUp className="h-3.5 w-3.5 text-green-400" />
              : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
            <span className="font-medium">{session.simulatedDirection === 'long' ? 'خرید' : 'فروش'} @ {session.simulatedEntry}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-red-400">SL: {session.simulatedSL}</span>
            <span className="text-green-400">TP: {session.simulatedTP}</span>
          </div>
        </div>
      )}

      {/* Main content */}
      {dataset?.type === 'candles' && candles.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-card/30 p-2">
          <CandleChart
            candles={candles}
            simulatedEntry={session.simulatedEntry}
            simulatedSL={session.simulatedSL}
            simulatedTP={session.simulatedTP}
          />
        </div>
      )}

      {(dataset?.type === 'screenshots' || dataset?.type === 'trade') && currentScreenshot && (
        <ScreenshotViewer item={currentScreenshot} step={session.currentStep - 1} total={session.totalSteps} />
      )}

      {!dataset && session.mode === 'trade' && (
        <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-sm text-muted-foreground text-center">
          <Activity className="h-6 w-6 mx-auto mb-2 opacity-40" />
          <p>داده‌های معامله — از تاریخچه معاملات ری‌پلی می‌شود</p>
          {session.originalEntry && (
            <p className="mt-1 text-xs">قیمت ورود اصلی پنهان است تا تصمیم بگیرید</p>
          )}
        </div>
      )}

      {/* Coaching hint (non-blind) */}
      {coachingMode === 'reflection' && !showDecision && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1">
          <p className="font-medium">🤔 سؤالات برای تفکر:</p>
          <p>• آیا ستاپ معتبری می‌بینید؟</p>
          <p>• نسبت ریسک به سود چقدر است؟</p>
          <p>• آیا این معامله با قوانین شما سازگار است؟</p>
        </div>
      )}

      {/* Decisions log */}
      {decisions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">تصمیمات ثبت‌شده</p>
          {decisions.slice(-3).map(d => (
            <div key={d.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/20">
              <span className={`font-medium ${d.action === 'long' ? 'text-green-400' : d.action === 'short' ? 'text-red-400' : d.action === 'no-trade' ? 'text-gray-400' : 'text-yellow-400'}`}>
                {d.action === 'long' ? '↑ خرید' : d.action === 'short' ? '↓ فروش' : d.action === 'no-trade' ? '✕ بدون معامله' : d.action === 'wait' ? '⌛ صبر' : d.action}
              </span>
              <span className="text-muted-foreground">مرحله {d.step}</span>
              {d.qualityScore !== null && (
                <span className={`font-medium ${d.qualityScore >= 70 ? 'text-green-400' : d.qualityScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {d.qualityScore}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!isComplete && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDecision(!showDecision)}
            className="gap-1.5"
          >
            <Flag className="h-4 w-4" />
            {showDecision ? 'بستن پانل' : 'ثبت تصمیم'}
          </Button>
          <Button
            size="sm"
            onClick={() => onAdvance()}
            className="gap-1.5"
            disabled={session.currentStep >= session.totalSteps}
          >
            <Eye className="h-4 w-4" />
            نمایش بعدی ({revealCount})
          </Button>
        </div>
      )}

      {/* Reveal count selector */}
      {!isComplete && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>نمایش هر بار:</span>
          {[1, 5, 10].map(n => (
            <button
              key={n}
              onClick={() => setRevealCount(n)}
              className={`px-2 py-0.5 rounded ${revealCount === n ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted/60'}`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {/* Decision panel */}
      {showDecision && !isComplete && (
        <DecisionPanel
          onSubmit={handleDecision}
          hasOpenPosition={hasPosition}
          coachingMode={coachingMode}
          lastCandle={lastCandle}
        />
      )}

      {/* Complete button */}
      {(session.currentStep >= session.totalSteps || isComplete) && (
        <Button onClick={onComplete} className="w-full gap-2">
          <CheckCircle2 className="h-4 w-4" />
          مشاهده نتیجه و بررسی
        </Button>
      )}

      {/* Close position dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>بستن موقعیت</DialogTitle></DialogHeader>
          <div>
            <label className="text-sm text-muted-foreground">قیمت بسته شدن</label>
            <Input value={closePrice} onChange={e => setClosePrice(e.target.value)} placeholder="قیمت خروج" className="mt-2" type="number" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>انصراف</Button>
            <Button onClick={() => {
              onClosePosition(parseFloat(closePrice) || session.simulatedEntry || 0);
              setShowCloseDialog(false);
            }}>تأیید</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Review Screen ──────────────────────────────────────────────────

function ReviewScreen({
  session, decisions, originalTrade, onSaveLessons, onClose, candles = [],
}: {
  session: ReplaySession;
  decisions: ReplayDecision[];
  originalTrade: Trade | undefined;
  onSaveLessons: (lessons: string[]) => void;
  onClose: () => void;
  candles?: ReplayCandle[];
}) {
  const suggestions = useMemo(() => generateLessonSuggestion(session, decisions), [session, decisions]);
  const [selectedLessons, setSelectedLessons] = useState<Set<number>>(new Set(suggestions.map((_, i) => i)));
  const alternatives = useMemo(() => getAlternativeAnalysis(session, decisions, candles), [session, decisions, candles]);
  const [customLesson, setCustomLesson] = useState('');
  const avgQuality = decisions.length ? decisions.reduce((s, d) => s + (d.qualityScore ?? 50), 0) / decisions.length : null;

  const mainDecision = decisions.find(d => d.action === 'long' || d.action === 'short');
  const ptr = originalTrade ? (() => { try { return JSON.parse(originalTrade.postTradeReview || '{}'); } catch { return {}; } })() : null;

  const handleSave = () => {
    const lessons = [
      ...suggestions.filter((_, i) => selectedLessons.has(i)),
      ...(customLesson.trim() ? [customLesson.trim()] : []),
    ];
    onSaveLessons(lessons);
  };

  const qColor = avgQuality !== null
    ? avgQuality >= 70 ? 'text-green-400' : avgQuality >= 40 ? 'text-yellow-400' : 'text-red-400'
    : 'text-muted-foreground';

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Award className="h-5 w-5 text-primary" />بررسی ری‌پلی</h3>
        <button onClick={onClose} className="p-1 hover:bg-muted/50 rounded text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>

      {/* Score card */}
      {avgQuality !== null && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">کیفیت تصمیم‌گیری</p>
                <p className={`text-3xl font-bold ${qColor}`}>{Math.round(avgQuality)}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">تعداد تصمیمات</p>
                <p className="text-xl font-bold">{decisions.length}</p>
              </div>
              {session.simulatedRMultiple !== null && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">نتیجه شبیه‌سازی</p>
                  <p className={`text-xl font-bold ${session.simulatedRMultiple > 0 ? 'text-green-400' : session.simulatedRMultiple < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {session.simulatedRMultiple > 0 ? '+' : ''}{session.simulatedRMultiple.toFixed(2)}R
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">مقایسه تصمیم‌ها</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="grid grid-cols-3 gap-2 text-center font-medium text-muted-foreground border-b border-border pb-2">
            <span>ری‌پلی شما</span>
            <span>معامله اصلی</span>
            <span>نتیجه واقعی</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <span className={session.simulatedResult === 'win' ? 'text-green-400' : session.simulatedResult === 'loss' ? 'text-red-400' : 'text-yellow-400'}>
              {session.simulatedResult === 'win' ? '✅ برد' : session.simulatedResult === 'loss' ? '❌ ضرر' : session.simulatedResult === 'no-trade' ? '— معامله نکرد' : '⏳ بدون بستن'}
            </span>
            <span className={originalTrade?.result === 'win' ? 'text-green-400' : originalTrade?.result === 'loss' ? 'text-red-400' : 'text-muted-foreground'}>
              {originalTrade?.result === 'win' ? '✅ برد' : originalTrade?.result === 'loss' ? '❌ ضرر' : originalTrade?.result ?? '—'}
            </span>
            <span className={originalTrade?.rMultiple !== undefined && originalTrade.rMultiple !== null
              ? originalTrade.rMultiple > 0 ? 'text-green-400' : 'text-red-400'
              : 'text-muted-foreground'}>
              {originalTrade?.rMultiple !== null && originalTrade?.rMultiple !== undefined
                ? `${originalTrade.rMultiple > 0 ? '+' : ''}${originalTrade.rMultiple.toFixed(2)}R`
                : '—'}
            </span>
          </div>

          {mainDecision && (
            <div className="grid grid-cols-3 gap-2 text-center text-muted-foreground mt-1">
              <span>ورود: {mainDecision.entryPrice ?? '—'}</span>
              <span>ورود: {originalTrade?.entryPrice ?? '—'}</span>
              <span>خروج: {originalTrade?.exitPrice ?? '—'}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main decision reasoning */}
      {mainDecision && (mainDecision.whatISee || mainDecision.whyEnter) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">تحلیل شما</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1.5">
            {mainDecision.whatISee && (
              <div><span className="text-muted-foreground">دیدگاه: </span>{mainDecision.whatISee}</div>
            )}
            {mainDecision.whyEnter && (
              <div><span className="text-muted-foreground">دلیل ورود: </span>{mainDecision.whyEnter}</div>
            )}
            {mainDecision.confidence !== null && (
              <div><span className="text-muted-foreground">اعتماد: </span>{mainDecision.confidence}/10</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PTR from original trade */}
      {ptr?.goodThings && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">بررسی معامله اصلی</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1">
            {ptr.goodThings && <div><span className="text-green-400">✓ </span>{ptr.goodThings}</div>}
            {ptr.badThings  && <div><span className="text-red-400">✗ </span>{ptr.badThings}</div>}
            {ptr.lesson     && <div><span className="text-yellow-400">درس: </span>{ptr.lesson}</div>}
          </CardContent>
        </Card>
      )}

      {/* Alternative Decision Analysis */}
      {alternatives.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              تحلیل «اگر...» — سناریوهای جایگزین
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alternatives.map((alt, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30 text-xs gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{alt.label}</p>
                    <p className="text-muted-foreground truncate">{alt.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {alt.rMultiple !== null && (
                      <span className={`font-bold ${alt.result === 'win' ? 'text-green-400' : alt.result === 'loss' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {alt.rMultiple > 0 ? '+' : ''}{alt.rMultiple.toFixed(2)}R
                      </span>
                    )}
                    <span className="text-muted-foreground">{alt.diff}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lesson suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              پیشنهاد درس‌ها
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => (
              <label key={i} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLessons.has(i)}
                  onChange={e => setSelectedLessons(prev => {
                    const n = new Set(prev);
                    e.target.checked ? n.add(i) : n.delete(i);
                    return n;
                  })}
                  className="mt-0.5 rounded"
                />
                <span className="text-xs">{s}</span>
              </label>
            ))}
            <div>
              <label className="text-[10px] text-muted-foreground">درس اختصاصی</label>
              <Input value={customLesson} onChange={e => setCustomLesson(e.target.value)} placeholder="یادداشت خودتان..." className="h-7 text-xs mt-0.5" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose} className="flex-1">بستن</Button>
        <Button onClick={handleSave} className="flex-1 gap-1.5">
          <BookOpen className="h-4 w-4" />
          ذخیره در دانش
        </Button>
      </div>
    </div>
  );
}

// ── Dataset Import Dialog ──────────────────────────────────────────

function DatasetImportDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (ds: ReplayDataset) => void;
}) {
  const [tab, setTab] = useState<'csv' | 'screenshots' | 'trade' | 'manual' | 'json'>('csv');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('15M');
  const [csvContent, setCsvContent] = useState('');
  const [screenshots, setScreenshots] = useState<ReplayScreenshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTradeId, setSelectedTradeId] = useState('');
  const [jsonContent, setJsonContent] = useState('');
  // Manual candle entry
  const [manualCandles, setManualCandles] = useState<Array<{
    date: string; open: string; high: string; low: string; close: string; volume: string;
  }>>([{ date: '', open: '', high: '', low: '', close: '', volume: '' }]);
  const { toast } = useToast();

  useEffect(() => {
    if (open && tab === 'trade') {
      db.trades.where('status').equals('closed').toArray().then(ts => setTrades(ts.slice(0, 50)));
    }
  }, [open, tab]);

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!name) setName(file.name.replace('.csv', ''));
    const reader = new FileReader();
    reader.onload = ev => setCsvContent(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleScreenshotFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = ev => {
        setScreenshots(prev => [...prev, {
          dataUrl: ev.target?.result as string,
          label: file.name.replace(/\.[^.]+$/, '') || `مرحله ${i + 1}`,
          timeframe,
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImport = async (): Promise<void> => {
    if (tab !== 'trade' && !symbol.trim()) { toast({ title: 'نماد الزامی است', variant: 'destructive' }); return; }

    setLoading(true);
    try {
      let ds: ReplayDataset;
      if (tab === 'csv') {
        if (!csvContent) throw new Error('فایل CSV انتخاب نشده');
        ds = await datasetService.createFromCSV(name || `${symbol} ${timeframe}`, symbol.toUpperCase(), timeframe, csvContent);
      } else if (tab === 'screenshots') {
        if (screenshots.length === 0) throw new Error('تصویری انتخاب نشده');
        ds = await datasetService.createFromScreenshots(name || `${symbol} screenshots`, symbol.toUpperCase(), timeframe, screenshots);
      } else if (tab === 'trade') {
        if (!selectedTradeId) throw new Error('معامله‌ای انتخاب نشده');
        ds = await datasetService.createFromTrade(selectedTradeId);
      } else if (tab === 'manual') {
        // Build CSV from manual rows
        const validRows = manualCandles.filter(r => r.open && r.close);
        if (validRows.length === 0) throw new Error('حداقل یک کندل کامل وارد کنید');
        const csvLines = ['timestamp,open,high,low,close,volume',
          ...validRows.map(r => {
            const ts = r.date ? new Date(r.date).getTime() : Date.now();
            const o = parseFloat(r.open), c = parseFloat(r.close);
            const h = r.high ? parseFloat(r.high) : Math.max(o, c);
            const l = r.low ? parseFloat(r.low) : Math.min(o, c);
            const v = r.volume ? parseFloat(r.volume) : '';
            return `${ts},${o},${h},${l},${c},${v}`;
          }),
        ];
        ds = await datasetService.createFromCSV(name || `${symbol} ${timeframe}`, symbol.toUpperCase(), timeframe, csvLines.join('\n'));
      } else {
        // JSON import
        if (!jsonContent.trim()) throw new Error('JSON خالی است');
        const parsed = JSON.parse(jsonContent);
        // Support array of {t/time/timestamp, o/open, h/high, l/low, c/close, v/volume}
         const rawCandles = Array.isArray(parsed)
           ? parsed
           : parsed && typeof parsed === 'object'
             ? ((parsed as Record<string, unknown>).candles ?? (parsed as Record<string, unknown>).data ?? [])
             : [];
         const candles: ReplayCandle[] = Array.isArray(rawCandles)
           ? rawCandles
             .map((item, index) => item && typeof item === 'object'
               ? normalizeReplayCandle(
                 item as Record<string, unknown>,
                 timeframe,
                 Date.now() - (rawCandles.length - index) * 60_000,
               )
               : null)
             .filter((candle): candle is ReplayCandle => candle !== null)
           : [];
        if (candles.length === 0) throw new Error('هیچ کندلی در JSON یافت نشد');
        const now = Date.now();
        const d: ReplayDataset = {
          id: crypto.randomUUID(), name: name || `${symbol} ${timeframe} JSON`,
          symbol: symbol.toUpperCase(), timeframe, type: 'candles',
          data: JSON.stringify(candles.sort((a, b) => a.timestamp - b.timestamp)),
          sourceTradeId: null, totalItems: candles.length,
          startDate: candles[0]?.timestamp ?? null,
          endDate: candles[candles.length - 1]?.timestamp ?? null,
          tags: '[]', notes: null, createdAt: now, updatedAt: now,
        };
        await db.replayDatasets.add(d);
        ds = d;
      }
      toast({ title: `دیتاست وارد شد — ${ds.totalItems} مورد` });
      onImported(ds);
      onClose();
    } catch (err) {
      toast({ title: 'خطا در وارد کردن', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4" />وارد کردن داده تاریخی</DialogTitle></DialogHeader>

        <div className="grid grid-cols-5 gap-0.5 bg-muted/30 rounded-lg p-1">
          {(['csv', 'screenshots', 'trade', 'manual', 'json'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[10px] py-1.5 rounded-md transition-colors ${tab === t ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>
              {t === 'csv' ? '📊 CSV' : t === 'screenshots' ? '🖼️ عکس' : t === 'trade' ? '📈 معامله' : t === 'manual' ? '✏️ دستی' : '{ } JSON'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {tab !== 'trade' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">نماد *</label>
                  <Input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="XAUUSD" className="mt-1 h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">تایم‌فریم</label>
                  <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['1M','5M','15M','1H','4H','1D'].map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">نام دیتاست</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: XAUUSD M15 مهر ۱۴۰۳" className="mt-1 h-8" />
              </div>
            </>
          )}

          {tab === 'csv' && (
            <div>
              <label className="text-xs text-muted-foreground">فایل CSV (timestamp,open,high,low,close,volume)</label>
              <input type="file" accept=".csv,.txt" onChange={handleCSVFile} className="mt-1 block text-xs text-muted-foreground file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground cursor-pointer" />
              {csvContent && <p className="text-[10px] text-green-400 mt-1">✓ فایل بارگذاری شد</p>}
              <div className="mt-2 p-2 bg-muted/30 rounded text-[10px] text-muted-foreground">
                <p>فرمت پشتیبانی‌شده:</p>
                <p>timestamp,open,high,low,close,volume</p>
                <p>2024-01-15 09:00,1920.5,1921.0,1919.8,1920.8,1500</p>
              </div>
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground mb-1">یا ورودی متنی:</p>
                <Textarea value={csvContent} onChange={e => setCsvContent(e.target.value)} placeholder="timestamp,open,high,low,close&#10;..." rows={4} className="text-xs font-mono" />
              </div>
            </div>
          )}

          {tab === 'screenshots' && (
            <div>
              <label className="text-xs text-muted-foreground">تصاویر (به‌ترتیب زمانی)</label>
              <input type="file" accept="image/*" multiple onChange={handleScreenshotFiles} className="mt-1 block text-xs text-muted-foreground file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground cursor-pointer" />
              {screenshots.length > 0 && (
                <div className="mt-2 space-y-1">
                  {screenshots.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <StoredImage
                        source={s.dataUrl}
                        className="h-8 w-12 object-cover rounded"
                        alt=""
                        enableViewer
                        showDownload
                        filename={s.label || 'replay-screenshot'}
                      />
                      <Input
                        value={s.label}
                        onChange={e => setScreenshots(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        className="h-7 text-xs flex-1"
                        placeholder="برچسب..."
                      />
                      <button onClick={() => setScreenshots(prev => prev.filter((_, j) => j !== i))}
                        className="text-destructive hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'trade' && (
            <div>
              <label className="text-xs text-muted-foreground">انتخاب معامله از تاریخچه</label>
              <Select value={selectedTradeId} onValueChange={setSelectedTradeId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="انتخاب معامله..." /></SelectTrigger>
                <SelectContent>
                  {trades.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.symbol} — {t.direction === 'long' ? '↑' : '↓'} — {new Date(t.openedAt).toLocaleDateString('fa-IR')} — {t.result}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">تصاویر ثبت‌شده در معامله برای ری‌پلی استفاده می‌شود</p>
            </div>
          )}

          {tab === 'manual' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">ورود کندل به کندل</label>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => setManualCandles(prev => [...prev, { date: '', open: '', high: '', low: '', close: '', volume: '' }])}>
                  <Plus className="h-3 w-3" />کندل جدید
                </Button>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {manualCandles.map((c, i) => (
                  <div key={i} className="grid grid-cols-7 gap-1 items-center">
                    <Input value={c.date} onChange={e => setManualCandles(p => p.map((r, j) => j === i ? { ...r, date: e.target.value } : r))} placeholder="2024-01-15" className="col-span-2 h-6 text-[10px]" />
                    <Input value={c.open} onChange={e => setManualCandles(p => p.map((r, j) => j === i ? { ...r, open: e.target.value } : r))} placeholder="O" className="h-6 text-[10px]" type="number" />
                    <Input value={c.high} onChange={e => setManualCandles(p => p.map((r, j) => j === i ? { ...r, high: e.target.value } : r))} placeholder="H" className="h-6 text-[10px]" type="number" />
                    <Input value={c.low} onChange={e => setManualCandles(p => p.map((r, j) => j === i ? { ...r, low: e.target.value } : r))} placeholder="L" className="h-6 text-[10px]" type="number" />
                    <Input value={c.close} onChange={e => setManualCandles(p => p.map((r, j) => j === i ? { ...r, close: e.target.value } : r))} placeholder="C" className="h-6 text-[10px]" type="number" />
                    <button onClick={() => setManualCandles(p => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive flex justify-center">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">ستون‌ها: تاریخ · باز · بالا · پایین · بسته</p>
            </div>
          )}

          {tab === 'json' && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">داده JSON کندلی</label>
              <Textarea
                value={jsonContent}
                onChange={e => setJsonContent(e.target.value)}
                placeholder={'[{"t":1704067200000,"o":1920.5,"h":1921.0,"l":1919.8,"c":1920.8,"v":1500}]'}
                rows={5}
                className="text-[10px] font-mono"
              />
              <div className="p-2 bg-muted/30 rounded text-[10px] text-muted-foreground">
                <p>پشتیبانی از: t/time/timestamp · o/open · h/high · l/low · c/close · v/volume</p>
                <p>یا: {`{"candles": [...]}`} یا {`{"data": [...]}`}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={handleImport} disabled={loading} className="gap-2">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            وارد کردن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Start Replay Dialog ────────────────────────────────────────────

function StartReplayDialog({ open, onClose, onStart, datasets }: {
  open: boolean;
  onClose: () => void;
  onStart: (params: {
    title: string; mode: ReplayMode; coachingMode: CoachingMode;
    datasetId?: string; sourceTradeId?: string; revealCount: number;
    additionalDatasets?: string;
  }) => void;
  datasets: ReplayDataset[];
}) {
  const [mode, setMode] = useState<ReplayMode>('screenshot');
  const [coachingMode, setCoachingMode] = useState<CoachingMode>('blind');
  const [datasetId, setDatasetId] = useState('');
  const [title, setTitle] = useState('');
  const [revealCount, setRevealCount] = useState(1);
  const [simSearch, setSimSearch] = useState('');
  const [simResults, setSimResults] = useState<ReplayDataset[]>([]);
  const [showSim, setShowSim] = useState(false);
  // MTF additional datasets: {[timeframe]: datasetId}
  const [mtfMap, setMtfMap] = useState<Record<string, string>>({});
  const [showMTF, setShowMTF] = useState(false);
  // Weakness mode: auto-loaded datasets from weaknesses
  const [weaknessDatasets, setWeaknessDatasets] = useState<ReplayDataset[]>([]);

  const filteredDatasets = datasets.filter(d => {
    if (mode === 'candle') return d.type === 'candles';
    if (mode === 'screenshot') return d.type === 'screenshots';
    if (mode === 'trade') return d.type === 'trade';
    return true;
  });

  // Load weakness datasets when mode = weakness
  useEffect(() => {
    if (mode === 'weakness' && datasets.length > 0) {
      // Auto-select datasets from trades with known weaknesses
      db.trades.where('status').equals('closed').toArray().then(async trades => {
        const weakTrades = trades.filter(t => {
          try {
            const ptr = JSON.parse(t.postTradeReview || '{}');
            return ptr.entryTiming === 'early' || (ptr.behaviorFlags || []).includes('fomo') || ptr.enteredWithConfirmation === false;
          } catch { return false; }
        });
        // Find or create datasets for the weakest trades
        const wds: ReplayDataset[] = [];
        for (const t of weakTrades.slice(0, 3)) {
          const existing = datasets.find(d => d.sourceTradeId === t.id);
          if (existing) {
            wds.push(existing);
          } else {
            try {
              const ds = await datasetService.createFromTrade(t.id);
              wds.push(ds);
            } catch { /* skip */ }
          }
        }
        setWeaknessDatasets(wds);
        if (wds.length > 0 && !datasetId) setDatasetId(wds[0].id);
      });
    }
  }, [mode, datasets]);

  // Similarity search
  useEffect(() => {
    if (!simSearch.trim()) { setSimResults([]); return; }
    const timer = setTimeout(async () => {
      const results = await getSimilarDatasets(simSearch, mode !== 'setup' && mode !== 'weakness' ? mode : undefined);
      setSimResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [simSearch, mode]);

  const handleStart = () => {
    const selectedDs = datasets.find(d => d.id === datasetId);
    const autoTitle = title || (selectedDs ? `${selectedDs.name} — ${new Date().toLocaleDateString('fa-IR')}` : `ری‌پلی ${new Date().toLocaleDateString('fa-IR')}`);
    const additionalDatasets = Object.keys(mtfMap).length > 0 ? JSON.stringify(mtfMap) : undefined;
    onStart({ title: autoTitle, mode, coachingMode, datasetId: datasetId || undefined, revealCount, additionalDatasets });
    onClose();
  };

  const modeOptions: { v: ReplayMode; label: string; icon: string; desc: string }[] = [
    { v: 'screenshot', label: 'تصویر محور', icon: '🖼️', desc: 'ری‌پلی با تصاویر تاریخی' },
    { v: 'candle',    label: 'کندل محور',  icon: '📊', desc: 'ری‌پلی با داده کندلی' },
    { v: 'trade',     label: 'معامله',     icon: '📈', desc: 'ری‌پلی یک معامله گذشته' },
    { v: 'setup',     label: 'تمرین ستاپ', icon: '🎯', desc: 'تمرین شناخت ستاپ معتبر' },
    { v: 'weakness',  label: 'ضعف‌ها',    icon: '💪', desc: 'تمرین روی نقاط ضعف شناخته‌شده' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Play className="h-4 w-4 text-primary" />شروع ری‌پلی جدید</DialogTitle></DialogHeader>

        <div className="space-y-4">
          {/* Mode selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">حالت ری‌پلی</label>
            <div className="grid grid-cols-1 gap-1.5 mt-1.5">
              {modeOptions.map(m => (
                <button key={m.v} onClick={() => { setMode(m.v); setDatasetId(''); }}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border text-right transition-all ${mode === m.v ? 'border-primary bg-primary/10' : 'border-border/40 hover:bg-muted/30'}`}>
                  <span className="text-xl">{m.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                  </div>
                  {mode === m.v && <CheckCircle2 className="h-4 w-4 text-primary mr-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Weakness mode: auto-loaded suggestions */}
          {mode === 'weakness' && weaknessDatasets.length > 0 && (
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <p className="text-xs font-medium text-orange-300 mb-2">💪 دیتاست‌های ضعف‌محور یافت شد:</p>
              <div className="space-y-1">
                {weaknessDatasets.map(d => (
                  <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="radio" name="weaknessDs" value={d.id} checked={datasetId === d.id}
                      onChange={() => setDatasetId(d.id)} />
                    <span className={datasetId === d.id ? 'text-foreground' : 'text-muted-foreground'}>
                      {d.name} ({d.totalItems} مورد)
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Similarity Search */}
          <div>
            <button
              onClick={() => setShowSim(!showSim)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              جستجوی مشابه
              {showSim ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showSim && (
              <div className="mt-2 space-y-2">
                <Input
                  value={simSearch}
                  onChange={e => setSimSearch(e.target.value)}
                  placeholder="نماد یا نام دیتاست..."
                  className="h-8 text-xs"
                />
                {simResults.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto border border-border/40 rounded-lg p-2">
                    {simResults.map(d => (
                      <button key={d.id} onClick={() => { setDatasetId(d.id); setShowSim(false); }}
                        className={`w-full flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted/40 text-right ${datasetId === d.id ? 'bg-primary/10 text-primary' : ''}`}>
                        <span>{d.name}</span>
                        <span className="text-muted-foreground">{d.symbol} · {d.timeframe} · {d.totalItems}</span>
                      </button>
                    ))}
                  </div>
                )}
                {simSearch && simResults.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">دیتاستی مشابه یافت نشد</p>
                )}
              </div>
            )}
          </div>

          {/* Dataset selection */}
          {(mode === 'screenshot' || mode === 'candle' || mode === 'trade' || mode === 'setup') && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">دیتاست اصلی</label>
              <Select value={datasetId} onValueChange={setDatasetId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="انتخاب دیتاست..." /></SelectTrigger>
                <SelectContent>
                  {filteredDatasets.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.totalItems} مورد)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredDatasets.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">دیتاستی موجود نیست — ابتدا داده وارد کنید</p>
              )}
            </div>
          )}

          {/* MTF multi-timeframe additional datasets */}
          {mode === 'candle' && datasets.filter(d => d.type === 'candles').length > 1 && (
            <div>
              <button
                onClick={() => setShowMTF(!showMTF)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                دیتاست‌های چند تایم‌فریم (MTF)
                {showMTF ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {Object.keys(mtfMap).length > 0 && (
                  <span className="text-primary">({Object.keys(mtfMap).length} اضافه)</span>
                )}
              </button>
              {showMTF && (
                <div className="mt-2 space-y-2 p-3 rounded-lg border border-border/40">
                  <p className="text-[10px] text-muted-foreground">دیتاست‌های بیشتری برای مقایسه تایم‌فریم اضافه کنید</p>
                  {datasets.filter(d => d.type === 'candles' && d.id !== datasetId).map(d => (
                    <div key={d.id} className="flex items-center gap-2">
                      <input type="checkbox"
                        checked={Object.values(mtfMap).includes(d.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setMtfMap(prev => ({ ...prev, [d.timeframe]: d.id }));
                          } else {
                            setMtfMap(prev => {
                              const next = { ...prev };
                              Object.entries(next).forEach(([k, v]) => { if (v === d.id) delete next[k]; });
                              return next;
                            });
                          }
                        }}
                      />
                      <span className="text-xs">{d.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4">{d.timeframe}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Coaching mode */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">حالت مربیگری</label>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {([
                { v: 'blind',      label: '🙈 کور',      desc: 'بدون راهنمایی' },
                { v: 'reflection', label: '🤔 بازتاب',  desc: 'سؤال‌پرسی' },
                { v: 'context',    label: '📋 زمینه',   desc: 'اطلاعات تاریخی' },
                { v: 'coaching',   label: '🎓 مربی',    desc: 'راهنمایی محدود' },
              ] as const).map(c => (
                <button key={c.v} onClick={() => setCoachingMode(c.v)}
                  className={`p-2 rounded-lg border text-right transition-all ${coachingMode === c.v ? 'border-primary bg-primary/10' : 'border-border/40 hover:bg-muted/30'}`}>
                  <p className="text-xs font-medium">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground">{c.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Reveal count */}
          {mode === 'candle' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">تعداد کندل در هر مرحله</label>
              <div className="flex gap-2 mt-1.5">
                {[1, 5, 10, 20].map(n => (
                  <button key={n} onClick={() => setRevealCount(n)}
                    className={`px-3 py-1.5 rounded text-sm border transition-colors ${revealCount === n ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/40'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom title */}
          <div>
            <label className="text-xs text-muted-foreground">عنوان (اختیاری)</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان ری‌پلی..." className="mt-1 h-8" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={handleStart} className="gap-2">
            <Play className="h-4 w-4" />شروع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── History Tab with Filters ──────────────────────────────────────

function HistoryTab({ sessions, modeLabels, onDelete }: {
  sessions: ReplaySession[];
  modeLabels: Record<ReplayMode, string>;
  onDelete: (id: string) => void;
}) {
  const [symbolFilter, setSymbolFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<ReplayMode | ''>('');
  const [resultFilter, setResultFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = sessions.filter(s => {
    if (symbolFilter && !s.symbol?.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
    if (modeFilter && s.mode !== modeFilter) return false;
    if (resultFilter === 'win' && s.simulatedResult !== 'win') return false;
    if (resultFilter === 'loss' && s.simulatedResult !== 'loss') return false;
    if (resultFilter === 'completed' && s.status !== 'completed') return false;
    if (resultFilter === 'abandoned' && s.status !== 'abandoned') return false;
    return true;
  });

  const statusColors: Record<string, string> = {
    completed: 'text-green-400 bg-green-500/10', active: 'text-blue-400 bg-blue-500/10',
    abandoned: 'text-gray-400 bg-gray-500/10', paused: 'text-yellow-400 bg-yellow-500/10',
  };
  const statusLabels: Record<string, string> = {
    completed: 'کامل', active: 'فعال', abandoned: 'رهاشده', paused: 'متوقف',
  };

  return (
    <TabsContent value="history" className="space-y-3">
      {/* Filters */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={symbolFilter}
              onChange={e => setSymbolFilter(e.target.value)}
              placeholder="جستجو نماد..."
              className="h-8 text-xs pr-7"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${showFilters ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            فیلتر
            {(modeFilter || resultFilter) && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
        </div>

        {showFilters && (
          <div className="flex gap-2 flex-wrap">
            <Select value={modeFilter} onValueChange={v => setModeFilter(v as ReplayMode | '')}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="حالت..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">همه حالت‌ها</SelectItem>
                {(['screenshot','candle','trade','setup','weakness'] as ReplayMode[]).map(m => (
                  <SelectItem key={m} value={m}>{modeLabels[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="نتیجه..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">همه نتایج</SelectItem>
                <SelectItem value="win">✅ برد</SelectItem>
                <SelectItem value="loss">❌ ضرر</SelectItem>
                <SelectItem value="completed">کامل‌شده</SelectItem>
                <SelectItem value="abandoned">رهاشده</SelectItem>
              </SelectContent>
            </Select>
            {(modeFilter || resultFilter || symbolFilter) && (
              <button
                onClick={() => { setModeFilter(''); setResultFilter(''); setSymbolFilter(''); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" />پاک کردن
              </button>
            )}
          </div>
        )}
        {(modeFilter || resultFilter || symbolFilter) && (
          <p className="text-[10px] text-muted-foreground">{filtered.length} از {sessions.length} جلسه</p>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{sessions.length === 0 ? 'هنوز جلسه‌ای ثبت نشده' : 'نتیجه‌ای با این فیلتر یافت نشد'}</p>
        </div>
      ) : (
        filtered.map(s => (
          <div key={s.id} className="p-3 rounded-lg border border-border/40 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {s.symbol ?? '—'} · {modeLabels[s.mode] ?? s.mode} · {new Date(s.createdAt).toLocaleDateString('fa-IR')}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[s.status] ?? ''}`}>
                  {statusLabels[s.status] ?? s.status}
                </span>
                <button onClick={() => onDelete(s.id)}
                  className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{s.currentStep}/{s.totalSteps} مرحله</span>
              {s.simulatedResult && (
                <span className={s.simulatedResult === 'win' ? 'text-green-400' : s.simulatedResult === 'loss' ? 'text-red-400' : ''}>
                  {s.simulatedResult === 'win' ? '✅ برد' : s.simulatedResult === 'loss' ? '❌ ضرر' : s.simulatedResult}
                </span>
              )}
              {s.simulatedRMultiple !== null && (
                <span className={s.simulatedRMultiple > 0 ? 'text-green-400' : 'text-red-400'}>
                  {s.simulatedRMultiple > 0 ? '+' : ''}{s.simulatedRMultiple.toFixed(2)}R
                </span>
              )}
              {s.decisionQualityScore !== null && (
                <span className={s.decisionQualityScore >= 70 ? 'text-green-400' : s.decisionQualityScore >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                  کیفیت: {s.decisionQualityScore}%
                </span>
              )}
            </div>
            {s.lessonSuggestions && (() => {
              const ls = (() => { try { return JSON.parse(s.lessonSuggestions!) as string[]; } catch { return []; } })();
              return ls.length > 0 ? (
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  {ls.slice(0, 2).map((l, i) => <p key={i} className="truncate">📌 {l}</p>)}
                </div>
              ) : null;
            })()}
          </div>
        ))
      )}
    </TabsContent>
  );
}

// ── Playlist Dialog ────────────────────────────────────────────────

function PlaylistDialog({ open, onClose, onSave, datasets, initial }: {
  open: boolean; onClose: () => void;
  onSave: (data: Omit<ReplayPlaylist, 'id' | 'totalReplayed' | 'lastUsedAt' | 'createdAt' | 'updatedAt'>) => void;
  datasets: ReplayDataset[];
  initial?: ReplayPlaylist;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '🎯');
  const [color, setColor] = useState(initial?.color ?? '#3b82f6');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(
    initial ? (() => { try { return JSON.parse(initial.datasetIds) as string[]; } catch { return []; } })() : []
  ));
  const [mode, setMode] = useState<ReplayMode>(initial?.defaultMode ?? 'screenshot');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name, description: desc || null, icon, color,
      datasetIds: JSON.stringify(Array.from(selectedIds)),
      filters: '{}',
      defaultMode: mode,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{initial ? 'ویرایش پلی‌لیست' : 'پلی‌لیست جدید'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">آیکون</label>
              <Input value={icon} onChange={e => setIcon(e.target.value)} className="h-8 mt-1 text-center text-lg" maxLength={2} />
            </div>
            <div className="col-span-3">
              <label className="text-xs text-muted-foreground">نام *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="نام پلی‌لیست..." className="h-8 mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">توضیح</label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="توضیح..." className="h-8 mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">دیتاست‌ها</label>
            <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
              {datasets.map(d => (
                <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(d.id)}
                    onChange={e => setSelectedIds(prev => {
                      const n = new Set(prev);
                      e.target.checked ? n.add(d.id) : n.delete(d.id);
                      return n;
                    })} />
                  {d.name} <span className="text-muted-foreground">({d.totalItems})</span>
                </label>
              ))}
              {datasets.length === 0 && <p className="text-xs text-muted-foreground">دیتاستی موجود نیست</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function TradeReplay() {
  const [datasets, setDatasets] = useState<ReplayDataset[]>([]);
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [playlists, setPlaylists] = useState<ReplayPlaylist[]>([]);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getReplayAnalytics>>>(null);
  const [suggestions, setSuggestions] = useState<{ label: string; description: string; icon: string; trades: Trade[]; weakness?: string }[]>([]);

  const [activeSession, setActiveSession] = useState<ReplaySession | null>(null);
  const [activeDataset, setActiveDataset] = useState<ReplayDataset | null>(null);
  const [activeDecisions, setActiveDecisions] = useState<ReplayDecision[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [originalTrade, setOriginalTrade] = useState<Trade | undefined>(undefined);

  const [showImport, setShowImport] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [showPlaylistCreate, setShowPlaylistCreate] = useState(false);
  const [activeTab, setActiveTab] = useState('start');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ds, ss, pl, an, sg] = await Promise.all([
        datasetService.getAll(),
        sessionService.getAll(),
        playlistService.getAll(),
        getReplayAnalytics(),
        getPersonalizedSuggestions(),
      ]);
      setDatasets(ds);
      setSessions(ss);
      setPlaylists(pl);
      setAnalytics(an);
      setSuggestions(sg);
    } catch (error) {
      console.error('[TradeReplay] load failed', error);
      setLoadError('بارگذاری داده‌های ری‌پلی انجام نشد. پایگاه داده محلی را دوباره امتحان کنید.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load active session decisions
  useEffect(() => {
    if (activeSession) {
      let cancelled = false;
      decisionService.forSession(activeSession.id)
        .then(decisions => { if (!cancelled) setActiveDecisions(decisions); })
        .catch(error => {
          if (!cancelled) {
            console.error('[TradeReplay] decisions load failed', error);
            toast({ title: 'تصمیم‌های این جلسه بارگذاری نشد', variant: 'destructive' });
            setActiveDecisions([]);
          }
        });
      return () => { cancelled = true; };
    }
    setActiveDecisions([]);
    return undefined;
  }, [activeSession?.id, activeSession?.currentStep]);

  const handleStartReplay = async (params: Parameters<typeof sessionService.create>[0]) => {
    try {
      const session = await sessionService.create(params);
      const ds = params.datasetId ? await datasetService.getById(params.datasetId) : null;
      setActiveSession(session);
      setActiveDataset(ds ?? null);
      setShowReview(false);
      setActiveTab('active');
      if (session.sourceTradeId) {
        const trade = await db.trades.get(session.sourceTradeId);
        setOriginalTrade(trade);
      } else {
        setOriginalTrade(undefined);
      }
      const advanced = await sessionService.advance(session.id, session.revealCount);
      if (advanced) setActiveSession(advanced);
    } catch (error) {
      console.error('[TradeReplay] start failed', error);
      toast({ title: 'شروع ری‌پلی انجام نشد', description: 'دیتاست حذف شده یا ناقص است.', variant: 'destructive' });
    }
  };

  const handleAdvance = async () => {
    if (!activeSession) return;
    try {
      const advanced = await sessionService.advance(activeSession.id, activeSession.revealCount);
      if (advanced) {
        setActiveSession(advanced);
        if (advanced.status === 'completed') toast({ title: 'داده کامل نمایش داده شد' });
      }
    } catch (error) {
      console.error('[TradeReplay] advance failed', error);
      toast({ title: 'نمایش مرحله بعد انجام نشد', variant: 'destructive' });
    }
  };

  const handleDecision = async (d: Parameters<typeof decisionService.log>[1]) => {
    if (!activeSession) return;
    try {
      const decision = await decisionService.log(activeSession.id, { ...d, step: activeSession.currentStep });
      const candles = activeDataset ? datasetService.getCandles(activeDataset) : [];
      await decisionService.scoreDecision(decision.id, activeSession, candles, activeSession.currentStep);

      if (d.action === 'long' || d.action === 'short') {
        const entry = d.entryPrice;
        const sl = d.stopLoss;
        const tp = d.takeProfit;
        if (
          typeof entry !== 'number' || !Number.isFinite(entry)
          || typeof sl !== 'number' || !Number.isFinite(sl)
          || typeof tp !== 'number' || !Number.isFinite(tp)
        ) {
          throw new Error('قیمت ورود، حد ضرر و حد سود باید معتبر باشند');
        }
        await sessionService.openSimulatedPosition(activeSession.id, {
          direction: d.action,
          entry,
          sl,
          tp,
          riskPercent: d.riskPercent,
        });
        const updated = await db.replaySessions.get(activeSession.id);
        if (updated) setActiveSession(updated);
      }

      const updatedDecisions = await decisionService.forSession(activeSession.id);
      setActiveDecisions(updatedDecisions);
      toast({ title: 'تصمیم ثبت شد ✓' });
    } catch (error) {
      console.error('[TradeReplay] decision failed', error);
      toast({ title: 'ثبت تصمیم انجام نشد', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  const handleClosePosition = async (price: number) => {
    if (!activeSession) return;
    if (!Number.isFinite(price)) {
      toast({ title: 'قیمت خروج معتبر نیست', variant: 'destructive' });
      return;
    }
    try {
      await sessionService.closeSimulatedPosition(activeSession.id, price);
      const updated = await db.replaySessions.get(activeSession.id);
      if (updated) setActiveSession(updated);
    } catch (error) {
      console.error('[TradeReplay] close position failed', error);
      toast({ title: 'بستن موقعیت انجام نشد', variant: 'destructive' });
    }
  };

  const handleUpdateSLTP = async (sl?: number, tp?: number) => {
    if (!activeSession) return;
    try {
      await sessionService.updateSLTP(activeSession.id, sl, tp);
      const updated = await db.replaySessions.get(activeSession.id);
      if (updated) setActiveSession(updated);
    } catch (error) {
      console.error('[TradeReplay] SL/TP update failed', error);
      toast({ title: 'به‌روزرسانی SL/TP انجام نشد', variant: 'destructive' });
    }
  };

  const handleComplete = () => setShowReview(true);

  const handleSaveLessons = async (lessons: string[]) => {
    if (!activeSession) return;
    await sessionService.saveReview(activeSession.id, '', lessons);
    await sessionService.setStatus(activeSession.id, 'completed');

    // Save lessons to knowledge base
    for (const lesson of lessons) {
      await knowledgeService.createNote({
        title: `درس ری‌پلی: ${lesson.slice(0, 60)}`,
        content: lesson,
        category: 'lessons-learned',
        importance: 'medium',
        color: '#2563eb',
        source: 'manual',
        status: 'active',
        isRule: false,
        tags: JSON.stringify(['ری‌پلی', activeSession.symbol ?? ''].filter(Boolean)),
      });
    }

    toast({ title: `${lessons.length} درس در پایگاه دانش ذخیره شد` });
    setShowReview(false);
    setActiveSession(null);
    setActiveDataset(null);
    setActiveDecisions([]);
    setActiveTab('history');
    load();
  };

  const handleAbandon = async () => {
    if (!activeSession) return;
    if (!confirm('از ری‌پلی خارج شوید؟')) return;
    await sessionService.setStatus(activeSession.id, 'abandoned');
    setActiveSession(null);
    setActiveDataset(null);
    setActiveDecisions([]);
    setActiveTab('start');
    load();
  };

  const handleExport = async () => {
    const data = await exportReplayData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `tradermind-replay-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'داده‌های ری‌پلی صادر شد' });
  };

  // Mode labels
  const modeLabels: Record<ReplayMode, string> = {
    screenshot: 'تصویر', candle: 'کندل', trade: 'معامله', setup: 'ستاپ', weakness: 'ضعف',
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto pb-20 md:pb-6 space-y-4 animate-in fade-in duration-300" dir="rtl">
        <div className="flex items-center justify-between mb-4 px-1">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-1 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-3" dir="rtl">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
        <p className="font-medium">{loadError}</p>
        <Button onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" />تلاش دوباره</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-20 md:pb-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" />
            ری‌پلی و شبیه‌سازی
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sessions.filter(s => s.status === 'completed').length} جلسه کامل · {datasets.length} دیتاست
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">صادرکردن</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">وارد کردن</span>
          </Button>
          <Button size="sm" onClick={() => setShowStart(true)} className="gap-1.5 text-xs">
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">شروع ری‌پلی</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5 h-9 mb-4">
          <TabsTrigger value="start"    className="text-xs gap-1"><Zap className="h-3.5 w-3.5" /><span className="hidden sm:inline">شروع</span></TabsTrigger>
          <TabsTrigger value="active"   className="text-xs gap-1 relative">
            <Activity className="h-3.5 w-3.5" /><span className="hidden sm:inline">فعال</span>
            {activeSession && <span className="absolute -top-1 -left-1 w-2 h-2 bg-green-400 rounded-full" />}
          </TabsTrigger>
          <TabsTrigger value="playlists" className="text-xs gap-1"><ListOrdered className="h-3.5 w-3.5" /><span className="hidden sm:inline">پلی‌لیست</span></TabsTrigger>
          <TabsTrigger value="history"  className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /><span className="hidden sm:inline">تاریخچه</span></TabsTrigger>
          <TabsTrigger value="progress" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /><span className="hidden sm:inline">پیشرفت</span></TabsTrigger>
        </TabsList>

        {/* ── START TAB ── */}
        <TabsContent value="start" className="space-y-4">
          {/* Quick start */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Play className="h-4 w-4 text-primary" />شروع سریع</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {(['screenshot', 'candle', 'trade', 'weakness'] as ReplayMode[]).map(m => (
                  <button key={m} onClick={() => setShowStart(true)}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-muted/30 text-right transition-all">
                    <span className="text-2xl">
                      {m === 'screenshot' ? '🖼️' : m === 'candle' ? '📊' : m === 'trade' ? '📈' : '💪'}
                    </span>
                    <div>
                      <p className="text-xs font-medium">{modeLabels[m]}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {m === 'screenshot' ? 'تصاویر ترتیبی' : m === 'candle' ? 'CSV کندلی' : m === 'trade' ? 'معامله گذشته' : 'نقاط ضعف'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Personalized suggestions */}
          {suggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />پیشنهادات شخصی‌سازی‌شده</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 hover:border-primary/30 transition-all">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{s.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground">{s.description}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                      onClick={async () => {
                        const trade = s.trades[0];
                        if (!trade) return;
                        let ds: ReplayDataset | null = null;
                        try { ds = await datasetService.createFromTrade(trade.id); } catch {}
                        await handleStartReplay({
                          title: s.label,
                          mode: 'trade',
                          coachingMode: 'reflection',
                          datasetId: ds?.id,
                          sourceTradeId: trade.id,
                          revealCount: 1,
                        });
                      }}>
                      <Play className="h-3 w-3" />شروع
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Datasets */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />دیتاست‌ها ({datasets.length})</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowImport(true)} className="h-7 text-xs gap-1">
                  <Plus className="h-3.5 w-3.5" />افزودن
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {datasets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">هنوز داده‌ای وارد نشده</p>
                  <p className="text-xs mt-1">CSV کندلی، تصاویر، یا معاملات گذشته را وارد کنید</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {datasets.slice(0, 5).map(d => (
                    <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{d.type === 'candles' ? '📊' : d.type === 'screenshots' ? '🖼️' : '📈'}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground">{d.symbol} · {d.timeframe} · {d.totalItems} مورد</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2"
                          onClick={async () => {
                            await handleStartReplay({
                              title: `ری‌پلی ${d.name}`,
                              mode: d.type === 'candles' ? 'candle' : d.type === 'trade' ? 'trade' : 'screenshot',
                              coachingMode: 'blind',
                              datasetId: d.id,
                              revealCount: 1,
                            });
                          }}>
                          <Play className="h-3 w-3" />
                        </Button>
                        <button onClick={() => datasetService.delete(d.id).then(load)}
                          className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ACTIVE REPLAY TAB ── */}
        <TabsContent value="active">
          {showReview && activeSession ? (
              <ReplayErrorBoundary key={`review-${activeSession.id}`}>
                <ReviewScreen
              session={activeSession}
              decisions={activeDecisions}
              originalTrade={originalTrade}
              onSaveLessons={handleSaveLessons}
              onClose={() => { setShowReview(false); setActiveSession(null); setActiveTab('history'); load(); }}
              candles={activeDataset ? datasetService.getCandles(activeDataset) : []}
                />
              </ReplayErrorBoundary>
          ) : activeSession ? (
            <ReplayErrorBoundary key={`active-${activeSession.id}-${activeSession.datasetId ?? 'none'}`}>
              <ActiveReplay
                session={activeSession}
                dataset={activeDataset}
                onAdvance={handleAdvance}
                onDecision={handleDecision}
                onClosePosition={handleClosePosition}
                onUpdateSLTP={handleUpdateSLTP}
                onAbandon={handleAbandon}
                onComplete={handleComplete}
                decisions={activeDecisions}
                coachingMode={activeSession.coachingMode}
              />
            </ReplayErrorBoundary>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">هیچ ری‌پلی فعالی نیست</p>
              <p className="text-sm mt-1 mb-4">از تب «شروع» یک ری‌پلی آغاز کنید</p>
              <Button onClick={() => setShowStart(true)} className="gap-2">
                <Play className="h-4 w-4" />شروع ری‌پلی جدید
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── PLAYLISTS TAB ── */}
        <TabsContent value="playlists" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowPlaylistCreate(true)} className="gap-1.5 text-xs">
              <Plus className="h-4 w-4" />پلی‌لیست جدید
            </Button>
          </div>

          {/* Default playlists */}
          {[
            { name: 'ورود زودهنگام', icon: '⏰', desc: 'تمرین صبر و انتظار', color: '#f97316' },
            { name: 'بهترین ستاپ‌ها', icon: '🏆', desc: 'معاملات برنده قوی', color: '#22c55e' },
            { name: 'سشن لندن', icon: '🇬🇧', desc: 'ستاپ‌های سشن لندن', color: '#3b82f6' },
            { name: 'FOMO و هیجان', icon: '😱', desc: 'تمرین کنترل احساسات', color: '#ef4444' },
          ].map((pl, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:border-primary/30 transition-all">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{pl.icon}</span>
                <div>
                  <p className="text-sm font-medium">{pl.name}</p>
                  <p className="text-xs text-muted-foreground">{pl.desc}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1 text-xs h-7"
                onClick={() => setShowStart(true)}>
                <Play className="h-3 w-3" />شروع
              </Button>
            </div>
          ))}

          {playlists.map(pl => (
            <div key={pl.id} className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/30" style={{ borderColor: `${pl.color}40` }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{pl.icon}</span>
                <div>
                  <p className="text-sm font-medium">{pl.name}</p>
                  <p className="text-xs text-muted-foreground">{pl.description} · {pl.totalReplayed} بار</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                  <Play className="h-3 w-3" />شروع
                </Button>
                <button onClick={() => playlistService.delete(pl.id).then(load)}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* ── HISTORY TAB ── */}
        <HistoryTab sessions={sessions} modeLabels={modeLabels} onDelete={id => sessionService.delete(id).then(load)} />

        {/* ── PROGRESS TAB ── */}
        <TabsContent value="progress" className="space-y-4">
          {!analytics ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>هنوز داده کافی برای آمار وجود ندارد</p>
              <p className="text-sm mt-1">چند ری‌پلی کامل کنید</p>
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'جلسات کامل', value: analytics.completedSessions, icon: CheckCircle2, color: 'text-green-400' },
                  { label: 'نرخ برد', value: `${Math.round(analytics.winRate * 100)}%`, icon: Target, color: 'text-blue-400' },
                  { label: 'میانگین R', value: analytics.avgR.toFixed(2), icon: TrendingUp, color: analytics.avgR > 0 ? 'text-green-400' : 'text-red-400' },
                  { label: 'کیفیت تصمیم', value: `${Math.round(analytics.avgQuality)}%`, icon: Star, color: 'text-yellow-400' },
                ].map(item => (
                  <Card key={item.label}>
                    <CardContent className="pt-4 pb-3">
                      <item.icon className={`h-5 w-5 ${item.color} mb-2`} />
                      <p className="text-xl font-bold">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Improvement trend */}
              {analytics.improving !== null && (
                <Card className={analytics.improving ? 'border-green-500/30' : 'border-red-500/30'}>
                  <CardContent className="pt-4 pb-3 flex items-center gap-3">
                    {analytics.improving
                      ? <TrendingUp className="h-8 w-8 text-green-400" />
                      : <TrendingDown className="h-8 w-8 text-red-400" />}
                    <div>
                      <p className="text-sm font-medium">
                        {analytics.improving ? '📈 در حال پیشرفت هستید!' : '📉 نیاز به تمرین بیشتر'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        کیفیت اولیه: {analytics.earlyAvg?.toFixed(0)}% → اخیر: {analytics.recentAvg?.toFixed(0)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* By mode */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">بر اساس حالت</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(analytics.byMode).map(([mode, count]) => (
                      <div key={mode} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-20">{modeLabels[mode as ReplayMode] ?? mode}</span>
                        <div className="flex-1 bg-muted/40 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-primary/60" style={{ width: `${(count / analytics.completedSessions) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium w-4 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Adaptive curriculum */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />برنامه تمرینی تطبیقی</CardTitle></CardHeader>
                <CardContent>
                  {[
                    { level: 1, title: 'شناخت ساختار بازار', done: analytics.completedSessions >= 1 },
                    { level: 2, title: 'شناسایی ستاپ معتبر', done: analytics.completedSessions >= 3 },
                    { level: 3, title: 'زمان‌بندی ورود', done: analytics.completedSessions >= 5 },
                    { level: 4, title: 'تعیین ریسک', done: analytics.avgQuality >= 60 },
                    { level: 5, title: 'مدیریت معامله باز', done: analytics.avgQuality >= 70 },
                    { level: 6, title: 'بررسی تصمیم', done: analytics.completedSessions >= 10 },
                  ].map(l => (
                    <div key={l.level} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${l.done ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-border text-muted-foreground'}`}>
                        {l.done ? '✓' : l.level}
                      </div>
                      <span className={`text-xs ${l.done ? 'text-foreground' : 'text-muted-foreground'}`}>{l.title}</span>
                      {l.done && <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mr-auto" />}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Average time to decide */}
              {analytics.avgTimeToDecide !== null && (
                <Card>
                  <CardContent className="pt-4 pb-3 flex items-center gap-3">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">میانگین زمان تصمیم</p>
                      <p className="text-lg font-bold">{(analytics.avgTimeToDecide / 1000).toFixed(0)} ثانیه</p>
                    </div>
                    <div className="mr-auto text-xs text-muted-foreground">
                      {analytics.avgTimeToDecide < 5000 ? '⚡ خیلی سریع' : analytics.avgTimeToDecide < 60000 ? '✅ مناسب' : '🐢 کند'}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <DatasetImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={() => load()} />

      <StartReplayDialog
        open={showStart}
        onClose={() => setShowStart(false)}
        onStart={handleStartReplay}
        datasets={datasets}
      />

      <PlaylistDialog
        open={showPlaylistCreate}
        onClose={() => setShowPlaylistCreate(false)}
        onSave={async data => { await playlistService.create(data); load(); }}
        datasets={datasets}
      />
    </div>
  );
}
