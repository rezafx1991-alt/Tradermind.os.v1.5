/**
 * PostTradeReview — مرور ساختاریافته پس از معامله
 * ۱۰ بخش: خلاصه | انتظار vs واقعیت | تحلیل | اجرا | ریسک | رفتار بازار | کیفیت | احساسات | تأمل | تحلیل AI
 */
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { tradeService } from '../services/tradeService';
import { analysisService } from '../services/analysisService';
import { postTradeReviewService } from '../services/postTradeReviewService';
import { Trade, AnalysisSession, PostTradeReviewData, defaultPostTradeReview, BehaviorFlag } from '../db/database';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Progress } from '../components/ui/progress';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import {
  ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Brain,
  BarChart2, Target, Shield, TrendingUp, TrendingDown, Minus,
  Lightbulb, BookOpen, Clock, RotateCcw, Save, ChevronDown, ChevronUp,
  Camera, Activity, History, Zap, Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../db/database';
import ScreenshotManager from '../components/ScreenshotManager';
import { TradeScreenshot } from '../types/screenshot';
import { compareLifecycleScreenshots } from '../services/visualAnalysisService';
import { parseLiveMonitoring } from '../services/liveTradeService';
import {
  LIVE_STATE_LABELS, EVENT_LABELS, EVENT_ICONS, SCENARIO_TYPE_LABELS, SCENARIO_STATUS_LABELS,
  LiveMonitoringData, LIVE_STATE_COLORS,
} from '../types/liveTrade';

// ── Constants ───────────────────────────────────────────────────────

const RESULT_FA: Record<string, string> = {
  win: 'سود', loss: 'ضرر', breakeven: 'سر به سر',
  'partial-win': 'سود جزئی', 'partial-loss': 'ضرر جزئی',
  open: 'باز', cancelled: 'لغو',
};
const RESULT_COLORS: Record<string, string> = {
  win: 'text-emerald-500', loss: 'text-rose-500', breakeven: 'text-slate-400',
  'partial-win': 'text-teal-500', 'partial-loss': 'text-amber-500',
  open: 'text-blue-500', cancelled: 'text-muted-foreground',
};

const STEPS = [
  { id: 'summary',    icon: BarChart2,    label: 'خلاصه معامله' },
  { id: 'expectation', icon: Target,      label: 'انتظار vs واقعیت' },
  { id: 'analysis',  icon: Brain,        label: 'تحلیل بازار' },
  { id: 'execution', icon: TrendingUp,   label: 'اجرا' },
  { id: 'risk',      icon: Shield,       label: 'مدیریت ریسک' },
  { id: 'market',    icon: BarChart2,    label: 'رفتار بازار' },
  { id: 'quality',   icon: CheckCircle2, label: 'کیفیت معامله' },
  { id: 'behavior',  icon: Lightbulb,    label: 'رفتار و احساسات' },
  { id: 'reflection', icon: BookOpen,    label: 'تأمل شخصی' },
  { id: 'ai',        icon: Brain,        label: 'تحلیل هوشمند' },
];

const BEHAVIOR_FLAGS: { id: BehaviorFlag; label: string; color: string }[] = [
  { id: 'hesitation',       label: 'تردید',            color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { id: 'fear',             label: 'ترس',              color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { id: 'fomo',             label: 'FOMO',             color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  { id: 'impatience',       label: 'بی‌صبری',          color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { id: 'overconfidence',   label: 'اعتماد کاذب',      color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { id: 'revenge-trading',  label: 'معامله انتقامی',   color: 'bg-red-600/20 text-red-400 border-red-600/30' },
  { id: 'uncertainty',      label: 'عدم اطمینان',      color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
];

// ── TriToggle ────────────────────────────────────────────────────────

function TriToggle({
  value, onChange, labels = ['بله', 'نه', '؟'],
}: { value: boolean | null; onChange: (v: boolean | null) => void; labels?: [string, string, string] }) {
  return (
    <div className="flex gap-1">
      {[true, false, null].map((v, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(v === value ? null : v)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
            value === v
              ? v === true
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : v === false
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : 'bg-muted text-muted-foreground border-border'
              : 'bg-transparent border-border text-muted-foreground hover:bg-muted/50',
          )}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

// ── QualitySlider ─────────────────────────────────────────────────────

function QualitySlider({
  value, onChange, label,
}: { value: number | null; onChange: (v: number) => void; label: string }) {
  const colors = ['', 'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-teal-500', 'bg-emerald-500'];
  const textColors = ['', 'text-rose-400', 'text-orange-400', 'text-amber-400', 'text-teal-400', 'text-emerald-400'];
  const labels = ['', 'خیلی بد', 'ضعیف', 'متوسط', 'خوب', 'عالی'];
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">{label}</span>
        {value !== null && (
          <span className={cn('text-sm font-bold', textColors[value])}>{value}/5 — {labels[value]}</span>
        )}
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-8 rounded-md border text-xs font-bold transition-all',
              value === n
                ? cn(colors[n], 'text-white border-transparent')
                : 'border-border text-muted-foreground hover:bg-muted/50',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── OptionGroup ───────────────────────────────────────────────────────

function OptionGroup<T extends string>({
  value, onChange, options,
}: { value: T | null; onChange: (v: T | null) => void; options: { value: T; label: string; color?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
            value === o.value
              ? o.color || 'bg-primary/20 text-primary border-primary/40'
              : 'bg-transparent border-border text-muted-foreground hover:bg-muted/50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── TradeTimeline ─────────────────────────────────────────────────────

function TradeTimeline({ trade, review, hasSession }: {
  trade: Trade; review: PostTradeReviewData; hasSession: boolean;
}) {
  const events = [
    { label: 'پلن پیش از معامله', icon: '📋', done: hasSession, time: trade.openedAt ? format(new Date(trade.openedAt), 'MM/dd') : null },
    { label: 'اجرای معامله', icon: '⚡', done: true, time: trade.openedAt ? format(new Date(trade.openedAt), 'HH:mm') : null },
    { label: 'بازار در حال حرکت', icon: '📈', done: trade.status === 'closed', time: null },
    { label: 'بسته شدن معامله', icon: '🔒', done: trade.status === 'closed', time: trade.closedAt ? format(new Date(trade.closedAt), 'MM/dd HH:mm') : null },
    { label: 'مرور پس از معامله', icon: '🔍', done: review.completedAt > 0, time: review.completedAt > 0 ? format(new Date(review.completedAt), 'MM/dd') : null },
    { label: 'تحلیل هوشمند', icon: '🧠', done: review.aiAnalysis !== null, time: null },
    { label: 'آپدیت دانش', icon: '📚', done: review.aiAnalysis !== null, time: null },
  ];
  return (
    <div className="space-y-1">
      {events.map((e, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 border', e.done ? 'bg-primary/20 border-primary/40' : 'bg-muted border-border')}>
            {e.icon}
          </div>
          <div className="flex-1">
            <span className={cn('text-xs', e.done ? 'text-foreground' : 'text-muted-foreground')}>{e.label}</span>
          </div>
          {e.time && <span className="text-xs text-muted-foreground">{e.time}</span>}
          {e.done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
          {!e.done && i > 0 && <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export default function PostTradeReview() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [review, setReview] = useState<PostTradeReviewData>({ ...defaultPostTradeReview });
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showCorrection, setShowCorrection] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [allTrades, setAllTrades] = useState<import('../db/database').Trade[]>([]);
  const [showVisualLearning, setShowVisualLearning] = useState(false);
  const [showLiveMonitoringCard, setShowLiveMonitoringCard] = useState(false);

  useEffect(() => { load(); }, [id]);
  useEffect(() => { db.trades.toArray().then(setAllTrades); }, []);

  const load = async () => {
    if (!id) return;
    const tr = await tradeService.getTradeById(id);
    if (!tr) { setLocation('/journal/trades'); return; }
    setTrade(tr);
    if (tr.sessionId) {
      const sess = await analysisService.getSessionById(tr.sessionId);
      if (sess) setSession(sess);
    }
    try {
      const existing = JSON.parse(tr.postTradeReview || '{}');
      if (existing && typeof existing === 'object') {
        setReview({ ...defaultPostTradeReview, ...existing });
      }
    } catch { /* use default */ }
  };

  const set = <K extends keyof PostTradeReviewData>(key: K, value: PostTradeReviewData[K]) =>
    setReview(prev => ({ ...prev, [key]: value }));

  const toggleBehaviorFlag = (flag: BehaviorFlag) => {
    setReview(prev => ({
      ...prev,
      behaviorFlags: prev.behaviorFlags.includes(flag)
        ? prev.behaviorFlags.filter(f => f !== flag)
        : [...prev.behaviorFlags, flag],
    }));
  };

  const handleSave = async (generateAI = false) => {
    if (!trade) return;
    setIsSaving(true);
    try {
      const toSave: PostTradeReviewData = {
        ...review,
        completedAt: review.completedAt || Date.now(),
      };
      if (generateAI) {
        setIsGenerating(true);
        const allTrades = await tradeService.getAllTrades();
        const { generateAIAnalysis } = await import('../services/postTradeReviewService');
        const ai = generateAIAnalysis(trade, toSave, allTrades);
        toSave.aiAnalysis = ai;
      }
      await postTradeReviewService.savePostTradeReview(trade.id, toSave);
      setReview(toSave);
      toast.success('ریویو ذخیره شد');
      if (generateAI) setCurrentStep(9);
    } catch (e) {
      toast.error('خطا در ذخیره');
    } finally {
      setIsSaving(false);
      setIsGenerating(false);
    }
  };

  const addUserCorrection = (field: string, label: string, original: string, corrected: string) => {
    if (!corrected.trim()) return;
    const correction = { field, label, originalValue: original, correctedValue: corrected, reason: correctionText, correctedAt: Date.now() };
    setReview(prev => ({ ...prev, userCorrections: [...(prev.userCorrections || []), correction] }));
    setShowCorrection(null);
    setCorrectionText('');
    toast.success('تصحیح ثبت شد');
  };

  if (!trade) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const isLoss = trade.result === 'loss' || trade.result === 'partial-loss';
  const isWin = trade.result === 'win' || trade.result === 'partial-win';
  const isClosed = trade.status === 'closed';
  const completedSteps = STEPS.filter((_, i) => {
    if (i === 0) return true;
    if (i === 1) return !!review.expectationText || review.directionalAccuracy !== null;
    if (i === 2) return review.htfAnalysisCorrect !== null;
    if (i === 3) return review.entryFollowedPlan !== null;
    if (i === 4) return review.slRespected !== null;
    if (i === 5) return review.marketAsExpected !== null;
    if (i === 6) return review.tradeQualityScore !== null;
    if (i === 7) return true;
    if (i === 8) return !!review.userReflection;
    if (i === 9) return review.aiAnalysis !== null;
    return false;
  }).length;

  return (
    <div className="min-h-screen pb-24" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/journal/trades/${id}`)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate">مرور پس از معامله — {trade.symbol}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('text-xs font-medium', RESULT_COLORS[trade.result])}>{RESULT_FA[trade.result]}</span>
              {trade.rMultiple !== null && <span className="text-xs text-muted-foreground">R: {trade.rMultiple.toFixed(2)}</span>}
              <span className="text-xs text-muted-foreground">{completedSteps}/{STEPS.length} بخش</span>
            </div>
          </div>
          <Button size="sm" onClick={() => handleSave(false)} disabled={isSaving} className="gap-1.5 shrink-0">
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'در حال ذخیره...' : 'ذخیره'}
          </Button>
        </div>

        {/* Step Progress Bar */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <Progress value={(completedSteps / STEPS.length) * 100} className="h-1.5" />
        </div>

        {/* Step Tabs */}
        <div className="max-w-2xl mx-auto px-2 pb-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 min-w-max">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = i < completedSteps;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(i)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap',
                    currentStep === i
                      ? 'bg-primary text-primary-foreground border-primary'
                      : done
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-transparent text-muted-foreground border-border hover:bg-muted/50',
                  )}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* ── Step 0: Trade Summary ─────────────────────────────── */}
        {currentStep === 0 && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  خلاصه معامله
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'نماد', value: trade.symbol },
                    { label: 'جهت', value: trade.direction === 'long' ? 'خرید (Long)' : 'فروش (Short)' },
                    { label: 'نتیجه', value: RESULT_FA[trade.result], className: RESULT_COLORS[trade.result] },
                    { label: 'R-Multiple', value: trade.rMultiple !== null ? trade.rMultiple.toFixed(2) : '—' },
                    { label: 'ورود', value: trade.entryPrice.toString() },
                    { label: 'خروج', value: trade.exitPrice?.toString() || '—' },
                    { label: 'حد ضرر', value: trade.stopLoss.toString() },
                    { label: 'هدف', value: trade.takeProfit?.toString() || '—' },
                  ].map(({ label, value, className }) => (
                    <div key={label} className="bg-muted/30 p-2.5 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                      <div className={cn('text-sm font-semibold', className)}>{value}</div>
                    </div>
                  ))}
                </div>
                {session && (
                  <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg">
                    <div className="text-xs text-primary font-medium mb-1">🔗 تحلیل پیش از معامله موجود است</div>
                    <Button size="sm" variant="outline" onClick={() => setLocation(`/analysis/${session.id}`)} className="text-xs h-7">
                      مشاهده تحلیل اولیه
                    </Button>
                  </div>
                )}
                {isClosed && trade.notes && (
                  <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">یادداشت‌ها</div>
                    <div className="text-sm">{trade.notes}</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-2">
                <button
                  className="flex items-center justify-between w-full"
                  onClick={() => setShowTimeline(v => !v)}
                >
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    مسیر یادگیری
                  </CardTitle>
                  {showTimeline ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
              </CardHeader>
              {showTimeline && (
                <CardContent>
                  <TradeTimeline trade={trade} review={review} hasSession={!!session} />
                </CardContent>
              )}
            </Card>

            {/* ── Live Monitoring History (Prompt 16, Section 20) ──── */}
            {(() => {
              try {
                const lm: LiveMonitoringData = parseLiveMonitoring(trade);
                const hasData = lm.events.length > 0 || lm.planDeviations.length > 0 || lm.rProgression.length > 0;
                if (!hasData) return null;
                const keyEvents = lm.events.filter(e => e.type !== 'state-change').slice(-10);
                const stateChanges = lm.stateHistory ?? [];
                const maxR = lm.rProgression.length ? Math.max(...lm.rProgression.map(p => p.rMultiple)) : null;
                const minR = lm.rProgression.length ? Math.min(...lm.rProgression.map(p => p.rMultiple)) : null;
                return (
                  <Card className="border-blue-500/20">
                    <CardHeader className="pb-2">
                      <button
                        className="flex items-center justify-between w-full"
                        onClick={() => setShowLiveMonitoringCard(v => !v)}
                      >
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="w-4 h-4 text-blue-400" />
                          تاریخچه مانیتورینگ زنده
                          <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-none">
                            {lm.events.length} رویداد
                          </Badge>
                        </CardTitle>
                        {showLiveMonitoringCard
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </CardHeader>
                    {showLiveMonitoringCard && (
                      <CardContent className="space-y-4">

                        {/* State journey */}
                        {stateChanges.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                              <History className="w-3.5 h-3.5" /> مسیر وضعیت معامله
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {stateChanges.map((sc, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <span className={cn(
                                    'px-2 py-0.5 rounded text-xs font-medium border',
                                    LIVE_STATE_COLORS[sc.state] || 'bg-muted/30 border-border text-muted-foreground',
                                  )}>
                                    {LIVE_STATE_LABELS[sc.state] ?? sc.state}
                                  </span>
                                  {i < stateChanges.length - 1 && (
                                    <span className="text-muted-foreground text-xs">←</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* R Progression summary */}
                        {lm.rProgression.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                              <div className="text-xs text-muted-foreground mb-0.5">آخرین R</div>
                              <div className={cn('text-sm font-bold', (lm.rProgression.at(-1)?.rMultiple ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                {lm.rProgression.at(-1)?.rMultiple?.toFixed(2) ?? '—'}R
                              </div>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                              <div className="text-xs text-muted-foreground mb-0.5">MFE</div>
                              <div className="text-sm font-bold text-emerald-400">{maxR !== null ? `${maxR.toFixed(2)}R` : '—'}</div>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 text-center">
                              <div className="text-xs text-muted-foreground mb-0.5">MAE</div>
                              <div className="text-sm font-bold text-rose-400">{minR !== null ? `${minR.toFixed(2)}R` : '—'}</div>
                            </div>
                          </div>
                        )}

                        {/* Plan deviations */}
                        {lm.planDeviations.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> انحراف از پلن اصلی ({lm.planDeviations.length})
                            </div>
                            <div className="space-y-1.5">
                              {lm.planDeviations.map((d, i) => (
                                 <div key={i} className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-xs">
                                   <span className="font-medium text-amber-400">{d.label}</span>
                                   {' — '}
                                   <span className="text-muted-foreground">اصلی: {d.original} ← فعلی: {d.current}</span>
                                 </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Scenarios */}
                        {lm.scenarios.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                              <Target className="w-3.5 h-3.5 text-primary" /> سناریوهای معامله
                            </div>
                            <div className="space-y-1.5">
                              {lm.scenarios.map(sc => (
                                <div key={sc.id} className="bg-muted/30 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate">{sc.description}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{SCENARIO_TYPE_LABELS[sc.type]}</div>
                                  </div>
                                  <Badge variant="outline" className={cn('text-xs shrink-0', sc.status === 'triggered' ? 'text-rose-400 border-rose-500/30' : sc.status === 'consistent' ? 'text-emerald-400 border-emerald-500/30' : 'text-muted-foreground')}>
                                    {SCENARIO_STATUS_LABELS[sc.status]}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Behavior observations */}
                        {lm.behaviorObservations.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                              <Eye className="w-3.5 h-3.5 text-violet-400" /> مشاهدات رفتاری در معامله
                            </div>
                            <div className="space-y-1.5">
                              {lm.behaviorObservations.map((obs, i) => (
                                <div key={i} className={cn('rounded-lg px-3 py-2 text-xs border',
                                  obs.pattern === 'sl-widened' || obs.pattern === 'added-position'
                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                                    : obs.pattern === 'tp-reduced' || obs.pattern === 'early-close'
                                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                                      : 'bg-muted/30 border-border text-muted-foreground',
                                )}>
                                  <div className="font-medium mb-0.5">{obs.description}</div>
                                  {obs.historicalCount > 0 && <div className="opacity-75">{obs.historicalCount} بار در گذشته</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Key events from live */}
                        {keyEvents.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                              <Zap className="w-3.5 h-3.5 text-primary" /> رویدادهای ثبت‌شده حین معامله
                            </div>
                            <div className="space-y-1.5">
                              {keyEvents.map(ev => (
                                <div key={ev.id} className="flex items-start gap-2.5 text-xs">
                                  <span className="text-base leading-none mt-0.5 shrink-0">{EVENT_ICONS?.[ev.type] ?? '•'}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="font-medium">{EVENT_LABELS[ev.type]}</span>
                                      {ev.rMultiple !== null && <Badge variant="secondary" className="text-xs h-4 px-1">{ev.rMultiple > 0 ? '+' : ''}{ev.rMultiple.toFixed(2)}R</Badge>}
                                      <span className="text-muted-foreground ml-auto">{format(new Date(ev.timestamp), 'MM/dd HH:mm')}</span>
                                    </div>
                                    {ev.note && <div className="text-muted-foreground leading-relaxed truncate">{ev.note}</div>}
                                    {ev.screenshotDataUrl && <div className="text-violet-400 mt-0.5">📸 اسکرین‌شات ضمیمه</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Plan snapshot */}
                        {lm.planSnapshot && (lm.planSnapshot.expectedBehavior || lm.planSnapshot.invalidationCondition) && (
                          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
                            <div className="text-xs font-medium text-primary flex items-center gap-1">
                              <Shield className="w-3.5 h-3.5" /> پلن اصلی (تغییرناپذیر)
                            </div>
                            {lm.planSnapshot.expectedBehavior && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-0.5">رفتار مورد انتظار</div>
                                <div className="text-xs leading-relaxed">{lm.planSnapshot.expectedBehavior}</div>
                              </div>
                            )}
                            {lm.planSnapshot.invalidationCondition && (
                              <div>
                                <div className="text-xs text-rose-400 mb-0.5">شرط باطل‌شدن</div>
                                <div className="text-xs leading-relaxed text-rose-300">{lm.planSnapshot.invalidationCondition}</div>
                              </div>
                            )}
                          </div>
                        )}

                      </CardContent>
                    )}
                  </Card>
                );
              } catch { return null; }
            })()}

            {/* ── Visual Screenshot Learning (Prompt 15, Section 15) ── */}
            <Card className="border-violet-500/20">
              <CardHeader className="pb-2">
                <button
                  className="flex items-center justify-between w-full"
                  onClick={() => setShowVisualLearning(v => !v)}
                >
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Camera className="w-4 h-4 text-violet-400" />
                    یادگیری بصری — اسکرین‌شات‌های قبل / حین / بعد
                  </CardTitle>
                  {showVisualLearning
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
              </CardHeader>
              {showVisualLearning && (
                <CardContent className="space-y-4">
                  {/* Lifecycle summary */}
                  {(() => {
                    try {
                      const screenshots: TradeScreenshot[] = JSON.parse(trade.screenshots || '[]');
                      const hasLifecycle = screenshots.some(s => s.lifecyclePosition);
                      if (hasLifecycle) {
                        const comp = compareLifecycleScreenshots(screenshots, trade);
                        if (comp.observations.length > 0) {
                          return (
                            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 space-y-1.5">
                              <p className="text-xs font-medium text-amber-400">مشاهدات یادگیری بصری:</p>
                              {comp.observations.map((obs, i) => (
                                <p key={i} className="text-xs text-muted-foreground flex gap-2">
                                  <span className="text-amber-400 flex-shrink-0">◆</span>
                                  {obs}
                                </p>
                              ))}
                            </div>
                          );
                        }
                      }
                    } catch { /* empty */ }
                    return null;
                  })()}

                  <p className="text-xs text-muted-foreground">
                    برای هر اسکرین‌شات مرحله معامله (قبل از ورود / حین / بعد) را مشخص کنید تا سیستم بتواند تحول بازار را ثبت و یاد بگیرد.
                  </p>

                  <ScreenshotManager
                    trade={trade}
                    allTrades={allTrades}
                    onChange={async (screenshots) => {
                      const updated = await tradeService.updateTrade(trade.id, {
                        screenshots: JSON.stringify(screenshots),
                      });
                      if (updated) setTrade(updated);
                    }}
                  />
                </CardContent>
              )}
            </Card>

            {!isClosed && (
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-amber-400 font-medium text-sm mb-1">
                  <AlertCircle className="w-4 h-4" />
                  معامله هنوز باز است
                </div>
                <p className="text-xs text-muted-foreground">ریویو پس از معامله برای معاملات بسته‌شده بیشترین ارزش را دارد. پس از بستن معامله بازگردید.</p>
              </div>
            )}
          </>
        )}

        {/* ── Step 1: Expectation vs Reality ───────────────────── */}
        {currentStep === 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                انتظار در مقابل واقعیت
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm font-medium block mb-2">🎯 انتظار اولیه</label>
                <Textarea
                  value={review.expectationText}
                  onChange={e => set('expectationText', e.target.value)}
                  placeholder="مثال: قیمت باید در سطح ۳۸.۲٪ فیبو رد شده و روند نزولی را ادامه دهد..."
                  className="min-h-[80px] text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">📊 رفتار واقعی بازار</label>
                <Textarea
                  value={review.actualBehaviorText}
                  onChange={e => set('actualBehaviorText', e.target.value)}
                  placeholder="مثال: قیمت تا ۶۱.۸٪ رفت سپس روند نزولی ادامه یافت..."
                  className="min-h-[80px] text-sm"
                />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">دقت جهت</label>
                  <OptionGroup
                    value={review.directionalAccuracy}
                    onChange={v => set('directionalAccuracy', v)}
                    options={[
                      { value: 'correct', label: '✅ درست', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                      { value: 'partial', label: '🔶 جزئی', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                      { value: 'incorrect', label: '❌ نادرست', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">دقت زمان‌بندی</label>
                  <OptionGroup
                    value={review.timingAccuracy}
                    onChange={v => set('timingAccuracy', v)}
                    options={[
                      { value: 'early', label: 'زود', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                      { value: 'on-time', label: '✅ به موقع', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                      { value: 'late', label: 'دیر', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">دقت ورود</label>
                  <OptionGroup
                    value={review.entryAccuracy}
                    onChange={v => set('entryAccuracy', v)}
                    options={[
                      { value: 'precise', label: '✅ دقیق', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                      { value: 'acceptable', label: '🔶 قابل قبول', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                      { value: 'poor', label: '❌ ضعیف', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">دقت خروج</label>
                  <OptionGroup
                    value={review.exitAccuracy}
                    onChange={v => set('exitAccuracy', v)}
                    options={[
                      { value: 'at-target', label: '✅ در هدف', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                      { value: 'early', label: '⬆️ زودهنگام', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                      { value: 'late', label: '⬇️ دیرهنگام', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">بازگشت (Retracement)</label>
                  <OptionGroup
                    value={review.retracementAccuracy}
                    onChange={v => set('retracementAccuracy', v)}
                    options={[
                      { value: 'accurate', label: '✅ مطابق انتظار', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                      { value: 'deeper-than-expected', label: 'عمیق‌تر', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                      { value: 'shallower', label: 'کم‌عمق‌تر', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-2">تأیید (Confirmation)</label>
                  <OptionGroup
                    value={review.confirmationAccuracy}
                    onChange={v => set('confirmationAccuracy', v)}
                    options={[
                      { value: 'valid', label: '✅ معتبر', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                      { value: 'partial', label: '🔶 جزئی', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                      { value: 'invalid', label: '❌ نامعتبر', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
                    ]}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Market Analysis ───────────────────────────── */}
        {currentStep === 2 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                بررسی تحلیل بازار
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'htfAnalysisCorrect', label: 'تایم‌فریم بالا (HTF) — جهت کلی بازار', desc: 'آیا تحلیل روند بلندمدت درست بود؟' },
                { key: 'm15StructureCorrect', label: 'ساختار ۱۵ دقیقه', desc: 'آیا ساختار Price Action صحیح شناسایی شد؟' },
                { key: 'm5SetupCorrect', label: 'ستاپ ۵ دقیقه', desc: 'آیا ستاپ در تایم‌فریم اجرایی درست بود؟' },
                { key: 'm1EntryValid', label: 'تأیید ورود ۱ دقیقه', desc: 'آیا تأیید ورود در ۱ دقیقه معتبر بود؟' },
              ].map(item => (
                <div key={item.key} className="bg-muted/30 p-3 rounded-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                    </div>
                    <TriToggle
                      value={review[item.key as keyof PostTradeReviewData] as boolean | null}
                      onChange={v => set(item.key as keyof PostTradeReviewData, v)}
                      labels={['✅', '❌', '؟']}
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-sm font-medium block mb-2">یادداشت تحلیل</label>
                <Textarea
                  value={review.analysisNotes}
                  onChange={e => set('analysisNotes', e.target.value)}
                  placeholder="هر نکته‌ای درباره کیفیت تحلیل..."
                  className="min-h-[80px] text-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Execution ─────────────────────────────────── */}
        {currentStep === 3 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                بررسی اجرا
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="bg-muted/30 p-3 rounded-lg">
                <div className="text-sm font-medium mb-2">آیا طبق برنامه وارد شدید؟</div>
                <TriToggle
                  value={review.entryFollowedPlan}
                  onChange={v => set('entryFollowedPlan', v)}
                  labels={['✅ بله', '❌ خیر', '؟']}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">زمان‌بندی ورود</label>
                <OptionGroup
                  value={review.entryTiming}
                  onChange={v => set('entryTiming', v)}
                  options={[
                    { value: 'early', label: '⬅️ زودهنگام', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                    { value: 'on-time', label: '✅ به موقع', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                    { value: 'late', label: '➡️ دیرهنگام', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
                    { value: 'chased', label: '🏃 دنبال موو', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
                  ]}
                />
              </div>
              <div className="bg-muted/30 p-3 rounded-lg">
                <div className="text-sm font-medium mb-2">آیا با تأیید کافی وارد شدید؟</div>
                <TriToggle
                  value={review.enteredWithConfirmation}
                  onChange={v => set('enteredWithConfirmation', v)}
                  labels={['✅ بله', '❌ خیر', '؟']}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">یادداشت اجرا</label>
                <Textarea
                  value={review.executionNotes}
                  onChange={e => set('executionNotes', e.target.value)}
                  placeholder="جزئیات اجرای معامله..."
                  className="min-h-[80px] text-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Risk Management ───────────────────────────── */}
        {currentStep === 4 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                مدیریت ریسک
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'slRespected',   label: 'حد ضرر رعایت شد',         desc: 'آیا SL اولیه تغییر نکرد یا به نفع شما جابجا شد؟' },
                { key: 'slMoved',       label: 'حد ضرر جابجا شد (بد)',     desc: 'آیا SL را به ضرر خود جابجا کردید؟', invert: true },
                { key: 'riskIncreased', label: 'ریسک افزایش یافت',         desc: 'آیا در طول معامله ریسک را بیشتر کردید؟', invert: true },
                { key: 'closedEarly',   label: 'زودتر از هدف بستید',       desc: 'آیا قبل از رسیدن به TP معامله را بستید؟', invert: true },
                { key: 'heldTooLong',   label: 'خیلی دیر بستید',           desc: 'آیا بیشتر از حد لازم در معامله ماندید؟', invert: true },
              ].map(item => (
                <div key={item.key} className={cn('p-3 rounded-lg', item.invert ? 'bg-muted/30' : 'bg-muted/30')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                    </div>
                    <TriToggle
                      value={review[item.key as keyof PostTradeReviewData] as boolean | null}
                      onChange={v => set(item.key as keyof PostTradeReviewData, v)}
                      labels={item.invert ? ['❌ بله', '✅ خیر', '؟'] : ['✅ بله', '❌ خیر', '؟']}
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-sm font-medium block mb-2">یادداشت ریسک</label>
                <Textarea
                  value={review.riskNotes}
                  onChange={e => set('riskNotes', e.target.value)}
                  placeholder="جزئیات مدیریت ریسک..."
                  className="min-h-[80px] text-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: Market Behavior ───────────────────────────── */}
        {currentStep === 5 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                رفتار بازار
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'marketAsExpected',   label: 'بازار طبق انتظار رفتار کرد',         desc: '' },
                { key: 'unexpectedEvent',    label: 'رویداد غیرمنتظره‌ای رخ داد',          desc: 'نیوز، رویداد سیاسی، فاندامنتال ناگهانی' },
                { key: 'priceEnteredRange',  label: 'قیمت وارد رنج شد',                    desc: 'بازار به جای روند، وارد فاز رنج شد' },
                { key: 'deeperRetracement',  label: 'بازگشت عمیق‌تری داشت',                desc: 'Retracement عمیق‌تر از حد پیش‌بینی‌شده' },
              ].map(item => (
                <div key={item.key} className="bg-muted/30 p-3 rounded-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{item.label}</div>
                      {item.desc && <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>}
                    </div>
                    <TriToggle
                      value={review[item.key as keyof PostTradeReviewData] as boolean | null}
                      onChange={v => set(item.key as keyof PostTradeReviewData, v)}
                      labels={['✅', '❌', '؟']}
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-sm font-medium block mb-2">یادداشت رفتار بازار</label>
                <Textarea
                  value={review.marketBehaviorNotes}
                  onChange={e => set('marketBehaviorNotes', e.target.value)}
                  placeholder="توضیح رفتار بازار در این معامله..."
                  className="min-h-[80px] text-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 6: Trade Quality ─────────────────────────────── */}
        {currentStep === 6 && (
          <>
            <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg text-xs text-muted-foreground">
              <strong className="text-foreground">⚠️ مهم:</strong> کیفیت معامله را جدا از نتیجه ارزیابی کنید. یک معامله خوب ممکن است ضررده باشد و یک معامله بد ممکن است سودده.
            </div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  ارزیابی کیفیت
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <QualitySlider value={review.tradeQualityScore} onChange={v => set('tradeQualityScore', v)} label="کیفیت کل معامله — آیا پلن دنبال شد؟" />
                <QualitySlider value={review.analysisQualityScore} onChange={v => set('analysisQualityScore', v)} label="کیفیت تحلیل — آیا تحلیل بازار درست بود؟" />
                <QualitySlider value={review.executionQualityScore} onChange={v => set('executionQualityScore', v)} label="کیفیت اجرا — آیا ورود/خروج طبق پلن بود؟" />
                <QualitySlider value={review.riskMgmtQualityScore} onChange={v => set('riskMgmtQualityScore', v)} label="کیفیت مدیریت ریسک — آیا SL/TP درست بود؟" />
              </CardContent>
            </Card>

            {isLoss && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">طبقه‌بندی ضرر</CardTitle>
                </CardHeader>
                <CardContent>
                  <OptionGroup
                    value={review.lossCategory}
                    onChange={v => set('lossCategory', v)}
                    options={[
                      { value: 'valid-setup', label: '✅ ستاپ معتبر / ضرر طبیعی', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                      { value: 'invalid-setup', label: '❌ ستاپ نامعتبر', color: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
                      { value: 'execution-error', label: '⚠️ خطای اجرا', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
                      { value: 'timing-error', label: '⏱ خطای زمان‌بندی', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
                      { value: 'regime-mismatch', label: '🔀 رژیم اشتباه', color: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
                      { value: 'unexpected', label: '🌪 رویداد غیرمنتظره', color: 'bg-slate-500/20 text-slate-400 border-slate-500/40' },
                    ]}
                  />
                </CardContent>
              </Card>
            )}

            {isWin && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">آیا این یک برد شانسی بود؟</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground mb-3">اگر اجرای شما ضعیف بود ولی بازار اتفاقاً سودده شد، تیک بزنید تا سیستم از این برد درس غلط نگیرد.</div>
                  <TriToggle
                    value={review.luckyWin}
                    onChange={v => set('luckyWin', v)}
                    labels={['بله، شانسی بود', 'خیر، درست بود', '؟']}
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── Step 7: Behavioral Context ────────────────────────── */}
        {currentStep === 7 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                رفتار و احساسات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-3">آیا هیچکدام از این‌ها در این معامله نقش داشت؟</label>
                <div className="flex flex-wrap gap-2">
                  {BEHAVIOR_FLAGS.map(flag => (
                    <button
                      key={flag.id}
                      type="button"
                      onClick={() => toggleBehaviorFlag(flag.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        review.behaviorFlags.includes(flag.id)
                          ? flag.color
                          : 'bg-transparent border-border text-muted-foreground hover:bg-muted/50',
                      )}
                    >
                      {review.behaviorFlags.includes(flag.id) ? '✓ ' : ''}{flag.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-muted/20 border border-border p-3 rounded-lg text-xs text-muted-foreground">
                <strong className="text-foreground">یادآوری:</strong> این یادداشت‌ها مشاهدات شما هستند. سیستم این اطلاعات را برای الگویابی در معاملات آینده استفاده می‌کند — نه برای قضاوت.
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">یادداشت رفتاری (اختیاری)</label>
                <Textarea
                  value={review.behaviorNotes}
                  onChange={e => set('behaviorNotes', e.target.value)}
                  placeholder="هر احساس یا رفتاری که مهم می‌دانید..."
                  className="min-h-[100px] text-sm"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 8: User Reflection ───────────────────────────── */}
        {currentStep === 8 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                تأمل شخصی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
                این بخش برای تأملات آزاد شماست. چه چیزی آموختید؟ دفعه بعد چه کاری متفاوت انجام می‌دهید؟
              </div>
              <Textarea
                value={review.userReflection}
                onChange={e => set('userReflection', e.target.value)}
                placeholder="افکار، درس‌ها، تصمیمات آینده..."
                className="min-h-[180px] text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleSave(true)}
                  disabled={isSaving || isGenerating}
                  className="flex-1 gap-2"
                >
                  <Brain className="w-4 h-4" />
                  {isGenerating ? 'در حال تولید تحلیل...' : 'ذخیره و تولید تحلیل هوشمند'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 9: AI Analysis ───────────────────────────────── */}
        {currentStep === 9 && (
          <>
            {!review.aiAnalysis ? (
              <Card>
                <CardContent className="py-8 text-center space-y-4">
                  <Brain className="w-12 h-12 text-primary/50 mx-auto" />
                  <div className="text-sm text-muted-foreground">تحلیل هنوز تولید نشده است.</div>
                  <Button onClick={() => handleSave(true)} disabled={isSaving || isGenerating} className="gap-2">
                    <Brain className="w-4 h-4" />
                    {isGenerating ? 'در حال تحلیل...' : 'تولید تحلیل هوشمند'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* خلاصه */}
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs text-primary font-medium mb-1">خلاصه تحلیل</div>
                        <p className="text-sm leading-relaxed">{review.aiAnalysis.summary}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* کیفیت جدا از نتیجه */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">کیفیت در مقابل نتیجه</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm leading-relaxed">{review.aiAnalysis.qualitySeparation}</div>
                  </CardContent>
                </Card>

                {/* مقایسه انتظار و واقعیت */}
                {review.aiAnalysis.expectationVsReality && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">انتظار vs واقعیت</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm leading-relaxed">{review.aiAnalysis.expectationVsReality}</p>
                      {review.expectationText && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-lg">
                            <div className="text-xs text-blue-400 font-medium mb-1">انتظار</div>
                            <div className="text-xs">{review.expectationText}</div>
                          </div>
                          {review.actualBehaviorText && (
                            <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
                              <div className="text-xs text-amber-400 font-medium mb-1">واقعیت</div>
                              <div className="text-xs">{review.actualBehaviorText}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ارزیابی اجرا */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">ارزیابی اجرا</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">{review.aiAnalysis.executionAssessment}</p>
                  </CardContent>
                </Card>

                {/* یافته‌های کلیدی */}
                {review.aiAnalysis.keyFindings.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">یافته‌های کلیدی</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {review.aiAnalysis.keyFindings.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-primary mt-0.5 shrink-0">•</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* اشتباهات تکراری */}
                {review.aiAnalysis.repeatedMistakes.length > 0 && (
                  <Card className="border-rose-500/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-rose-400">
                        <AlertCircle className="w-4 h-4" />
                        اشتباهات تکراری شناسایی‌شده
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {review.aiAnalysis.repeatedMistakes.map((m, i) => (
                        <div key={i} className="border border-rose-500/20 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-rose-400">{m.label}</span>
                            <Badge variant="outline" className="text-rose-400 border-rose-500/30 text-xs">
                              {m.count}/{m.total} معامله ({m.rate}٪)
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{m.evidence}</p>
                          <div className="flex items-start gap-1.5 bg-rose-500/10 p-2 rounded">
                            <Lightbulb className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-rose-300">{m.recommendation}</p>
                          </div>
                          {/* User Correction */}
                          {showCorrection === `mistake-${i}` ? (
                            <div className="space-y-2 border-t border-border pt-2">
                              <div className="text-xs text-muted-foreground">دلیل تصحیح:</div>
                              <Textarea value={correctionText} onChange={e => setCorrectionText(e.target.value)} className="text-xs min-h-[60px]" placeholder="چرا این تشخیص نادرست است؟" />
                              <div className="flex gap-2">
                                <Button size="sm" className="flex-1 text-xs" onClick={() => addUserCorrection(`mistake-${i}`, m.label, m.evidence, `کاربر رد کرد: ${correctionText}`)}>ثبت تصحیح</Button>
                                <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowCorrection(null)}>لغو</Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-xs h-6 text-muted-foreground" onClick={() => { setShowCorrection(`mistake-${i}`); setCorrectionText(''); }}>
                              <RotateCcw className="w-3 h-3 ml-1" /> این تشخیص درست نیست
                            </Button>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* رفتارهای موفق */}
                {review.aiAnalysis.successfulBehaviors.length > 0 && (
                  <Card className="border-emerald-500/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        رفتارهای موفق
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {review.aiAnalysis.successfulBehaviors.map((b, i) => (
                        <div key={i} className="border border-emerald-500/20 rounded-lg p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-emerald-400">{b.label}</span>
                            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs">
                              {b.count} معامله
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{b.evidence}</p>
                          <p className="text-xs text-emerald-400/80">{b.recommendation}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* آپدیت‌های دانش */}
                {review.aiAnalysis.knowledgeUpdates.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-primary" />
                        آپدیت‌های دانش
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {review.aiAnalysis.knowledgeUpdates.map((k, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            {k}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* تصحیح‌های کاربر */}
                {review.userCorrections.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">تصحیح‌های ثبت‌شده توسط شما</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {review.userCorrections.map((c, i) => (
                        <div key={i} className="bg-muted/30 p-2.5 rounded-lg">
                          <div className="text-xs font-medium mb-0.5">{c.label}</div>
                          <div className="text-xs text-muted-foreground">دلیل: {c.reason || c.correctedValue}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(c.correctedAt), 'yyyy/MM/dd HH:mm')}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <div className="text-xs text-muted-foreground text-center">
                  تحلیل در {format(new Date(review.aiAnalysis.generatedAt), 'yyyy/MM/dd HH:mm')} تولید شده
                </div>

                <Button variant="outline" className="w-full gap-2" onClick={() => handleSave(true)} disabled={isSaving || isGenerating}>
                  <RotateCcw className="w-4 h-4" />
                  {isGenerating ? 'در حال بازتولید...' : 'بازتولید تحلیل'}
                </Button>
              </>
            )}
          </>
        )}

        {/* ── Navigation ───────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          {currentStep > 0 && (
            <Button variant="outline" onClick={() => setCurrentStep(s => s - 1)} className="flex-1 gap-2">
              <ArrowRight className="w-4 h-4" />
              قبلی
            </Button>
          )}
          {currentStep < STEPS.length - 1 && (
            <Button
              onClick={() => { handleSave(false); setCurrentStep(s => s + 1); }}
              className="flex-1 gap-2"
              disabled={isSaving}
            >
              بعدی
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          {currentStep === STEPS.length - 1 && (
            <Button
              onClick={() => setLocation(`/journal/trades/${id}`)}
              variant="outline"
              className="flex-1"
            >
              بازگشت به معامله
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
