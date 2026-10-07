import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { analysisService } from "../services/analysisService";
import { strategyService } from "../services/strategyService";
import { db, AnalysisSession, Strategy, Phase, Step, Rule, Trade } from "../db/database";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import {
  ArrowRight, Check, CheckCircle, XCircle, Pause, ChevronLeft,
  TrendingUp, TrendingDown, Clock, X, Camera, Search,
} from "lucide-react";
import { toast } from "sonner";
import { openImagePicker, fileToCompressedDataUrl } from "../lib/imageCompression";
import { extractInitialFeatures, findSimilarScreenshots } from "../services/visualAnalysisService";
import VisualSimilarityPanel from "../components/VisualSimilarityPanel";
import StoredImage from "../components/StoredImage";
import { TradeScreenshot } from "../types/screenshot";

type ViewMode = 'runner' | 'phaseSummary' | 'finalDecision' | 'finished';

export default function SessionRunner() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [steps, setSteps] = useState<Record<string, Step[]>>({});
  const [rules, setRules] = useState<Record<string, Rule[]>>({});
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [results, setResults] = useState<Record<string, { value: any; answeredAt: number }>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('runner');
  const [finalDecisionReason, setFinalDecisionReason] = useState('');
  const [freeNotes, setFreeNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageStepId, setImageStepId] = useState<string | null>(null);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  // ردیابی تعامل واقعی کاربر — auto-advance فقط بعد از پاسخ‌دهی فعال
  const hasInteractedRef = useRef(false);

  useEffect(() => { if (id) loadData(); }, [id]);
  useEffect(() => { db.trades.toArray().then(setAllTrades); }, []);

  const loadData = async () => {
    const sess = await analysisService.getSessionById(id!);
    if (!sess) return;
    setSession(sess);
    setResults(JSON.parse(sess.stepResults || '{}'));
    setFreeNotes(sess.notes || '');

    const strat = await strategyService.getStrategyById(sess.strategyId);
    if (!strat) return;
    setStrategy(strat);
    const phs = await strategyService.getPhasesByStrategyId(strat.id);
    setPhases(phs);

    const stps: Record<string, Step[]> = {};
    for (const p of phs) {
      stps[p.id] = await strategyService.getStepsByPhaseId(p.id);
    }
    setSteps(stps);
    const loadedRules: Record<string, Rule[]> = {};
    for (const phaseSteps of Object.values(stps)) {
      for (const step of phaseSteps) {
        loadedRules[step.id] = await strategyService.getRulesByStepId(step.id);
      }
    }
    setRules(loadedRules);

    if (sess.currentPhaseId) {
      const idx = phs.findIndex(p => p.id === sess.currentPhaseId);
      if (idx !== -1) setCurrentPhaseIndex(idx);
    }

    if (sess.status !== 'in-progress') setViewMode('finished');
  };

  const saveResults = async (newResults: typeof results) => {
    await analysisService.updateSession(id!, { stepResults: JSON.stringify(newResults) });
  };

  const handleUpdateResult = (stepId: string, value: any) => {
    hasInteractedRef.current = true;
    const newResults = { ...results, [stepId]: { value, answeredAt: Date.now() } };
    setResults(newResults);
    saveResults(newResults);
  };

  const handleMultiSelectToggle = (stepId: string, option: string) => {
    const current: string[] = results[stepId]?.value || [];
    const updated = current.includes(option) ? current.filter(o => o !== option) : [...current, option];
    handleUpdateResult(stepId, updated);
  };

  // آپلود تصویر — پشتیبانی از Camera در موبایل
  const handleImagePick = (stepId: string) => {
    setImageStepId(stepId);
    openImagePicker({
      accept: 'image/*',
      onSelect: async (files) => {
        if (!files.length) return;
        try {
          const dataUrls = await Promise.all(files.map(file =>
            fileToCompressedDataUrl(file, { maxWidth: 1280, quality: 0.82 })
          ));
          setResults(current => {
            const old = current[stepId]?.value;
            const existing = Array.isArray(old) ? old : old ? [old] : [];
            const newResults = { ...current, [stepId]: { value: [...existing, ...dataUrls], answeredAt: Date.now() } };
            void saveResults(newResults);
            return newResults;
          });
          hasInteractedRef.current = true;
        } catch {
          toast.error('خطا در بارگذاری تصویر');
        }
      },
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!imageStepId || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }))).then(dataUrls => {
      setResults(current => {
        const old = current[imageStepId]?.value;
        const existing = Array.isArray(old) ? old : old ? [old] : [];
        const newResults = { ...current, [imageStepId]: { value: [...existing, ...dataUrls], answeredAt: Date.now() } };
        void saveResults(newResults);
        return newResults;
      });
      hasInteractedRef.current = true;
    }).catch(() => toast.error('خطا در بارگذاری تصویر'));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const imageValues = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : typeof value === 'string' && value ? [value] : [];

  const currentPhase = phases[currentPhaseIndex];
  const currentPhaseSteps = currentPhase ? steps[currentPhase.id] || [] : [];

  const isPhaseComplete = currentPhaseSteps.every(step => {
    if (!step.required) return true;
    const res = results[step.id];
    const val = res?.value;
    return val !== null && val !== undefined && val !== '' && val !== false
      && !(Array.isArray(val) && val.length === 0);
  });

  const completedStepsCount = currentPhaseSteps.filter(step => {
    const val = results[step.id]?.value;
    return val !== null && val !== undefined && val !== '' && val !== false
      && !(Array.isArray(val) && val.length === 0);
  }).length;

  let totalRequired = 0, answeredRequired = 0;
  for (const phase of phases) {
    for (const step of steps[phase.id] || []) {
      if (step.required) {
        totalRequired++;
        const val = results[step.id]?.value;
        if (val !== null && val !== undefined && val !== '' && val !== false
          && !(Array.isArray(val) && val.length === 0)) answeredRequired++;
      }
    }
  }
  const adherencePct = totalRequired === 0 ? 100
    : Math.round((answeredRequired / totalRequired) * 100);

  const overallProgress = phases.length === 0 ? 0
    : ((currentPhaseIndex + (isPhaseComplete ? 1 : 0)) / phases.length) * 100;

  const handleBack = async () => {
    if (currentPhaseIndex === 0) return;
    const newIdx = currentPhaseIndex - 1;
    // ریست تعامل — کاربر باید دوباره در فاز قبلی چیزی پاسخ دهد تا auto-advance فعال شود
    hasInteractedRef.current = false;
    setCurrentPhaseIndex(newIdx);
    setViewMode('runner');
    await analysisService.updateSession(id!, { currentPhaseId: phases[newIdx].id });
  };

  // رفتن خودکار به مرحله بعد فقط پس از تعامل فعال کاربر با این فاز
  // جلوگیری از: loop بین فازهای all-optional، پرش خودکار هنگام بارگذاری
  useEffect(() => {
    if (!currentPhase) return;
    if (!isPhaseComplete) return;
    if (!hasInteractedRef.current) return;

    const timer = setTimeout(() => {
      if (currentPhaseIndex < phases.length - 1) {
        setViewMode('phaseSummary');
      } else {
        setViewMode('finalDecision');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [isPhaseComplete, currentPhaseIndex, currentPhase, phases.length]);
  const handleNext = async () => {
    if (currentPhaseIndex < phases.length - 1) {
      setViewMode('phaseSummary');
    } else {
      setViewMode('finalDecision');
    }
  };

  const handleConfirmNextPhase = async () => {
    const newIdx = currentPhaseIndex + 1;
    // ریست تعامل — تا در فاز جدید auto-advance بدون تعامل کاربر فعال نشود
    hasInteractedRef.current = false;
    setCurrentPhaseIndex(newIdx);
    setViewMode('runner');
    await analysisService.updateSession(id!, { currentPhaseId: phases[newIdx].id });
  };

  const handlePause = async () => {
    toast.success('تحلیل متوقف شد — می‌توانید از لیست تحلیل‌ها ادامه دهید.');
    setLocation('/analysis');
  };

  const handleAbandon = async () => {
    if (!confirm('این تحلیل را رها کنید؟ اطلاعات ذخیره خواهد شد اما تحلیل ناتمام می‌ماند.')) return;
    await analysisService.abandonSession(id!);
    toast.success('جلسه تحلیل رها شد');
    loadData();
  };

  const handleFinalDecision = async (choice: 'execute' | 'no-trade' | 'wait' | 'cancelled') => {
    const finalDecision = JSON.stringify({ choice, reason: finalDecisionReason });
    await analysisService.updateSession(id!, { finalDecision } as any);

    if (choice === 'cancelled') {
      await analysisService.abandonSession(id!);
      toast.success('تحلیل لغو شد');
      setLocation('/analysis');
      return;
    }

    await analysisService.completeSession(id!);
    toast.success('تحلیل با موفقیت تکمیل شد!');

    if (choice === 'execute') {
      setLocation('/journal/trades/new?sessionId=' + id);
    } else {
      setViewMode('finished');
      loadData();
    }
  };

  // ── Helper: minimal Trade object for visual feature extraction ───
  function makeAnalysisTrade(notes: string): Trade {
    const now = Date.now();
    return {
      id: '__analysis_preview__',
      sessionId: id ?? null,
      strategyId: strategy?.id ?? null,
      accountId: null,
      boxId: null,
      symbol: '',
      market: null,
      direction: 'long',
      entryPrice: 0,
      exitPrice: null,
      stopLoss: 0,
      takeProfit: null,
      positionSize: null,
      riskPercentage: null,
      riskAmount: null,
      rMultiple: null,
      result: 'open',
      profitLoss: null,
      fees: null,
      status: 'open',
      openedAt: now,
      closedAt: null,
      reasonForExit: null,
      emotions: '[]',
      emotionNotes: null,
      notes,
      screenshots: '[]',
      adherenceScore: null,
      adherenceRating: null,
      adherenceNotes: null,
      review: '{}',
      postTradeReview: '{}',
      tags: '[]',
      liveMonitoring: null,
      createdAt: now,
      plannedEntry: null, plannedSL: null, plannedTP: null, plannedRR: null,
      plannedRisk: null, plannedPositionSize: null,
      tradingSession: null, setupType: null, timezone: null,
      entryReason: null, lesson: null,
      slMoved: null, tpMoved: null, partialClose: null, addedToPosition: null,
      reducedPosition: null, manualExit: null, managementReason: null,
      mtfAnalysis: null,
    };
  }

  if (!session || !strategy || phases.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">
        در حال بارگذاری...
      </div>
    );
  }

  // ─── حالت پایان‌یافته ─────────────────────────────────────────
  if (viewMode === 'finished' || session.status !== 'in-progress') {
    return (
      <div className="max-w-2xl mx-auto py-8 animate-in fade-in">
        {session.status === 'completed' ? (
          <Card className="bg-muted/10 border-emerald-500/30">
            <CardContent className="p-8 sm:p-12 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-500" />
              <h2 className="text-2xl font-bold mb-2">تحلیل تکمیل شد</h2>
              <div className="my-6 p-4 rounded-xl bg-card border max-w-xs mx-auto">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">امتیاز پیروی از استراتژی</div>
                <div className="text-3xl font-bold text-primary mb-1">{adherencePct}٪</div>
                <div className="text-xs text-muted-foreground mb-2">
                  {answeredRequired} از {totalRequired} گام اجباری تکمیل شد
                </div>
                <Progress value={adherencePct} className="h-1.5" />
              </div>
              <p className="text-muted-foreground mb-8">تحلیل شما ذخیره شد.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" onClick={() => setLocation('/journal/trades/new?sessionId=' + session.id)}>
                  ثبت معامله
                </Button>
                <Button size="lg" variant="outline" onClick={() => setLocation('/analysis')}>
                  بازگشت به تحلیل‌ها
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-muted/10">
            <CardContent className="p-8 sm:p-12 text-center">
              <XCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">
                {session.status === 'abandoned' ? 'تحلیل رها شد' : 'تحلیل پایان یافت'}
              </h2>
              <p className="text-muted-foreground mb-8">
                تحلیل ذخیره شد اما تکمیل نشد.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" variant="outline" onClick={() => setLocation('/analysis/new')}>
                  شروع تحلیل جدید
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setLocation('/analysis')}>
                  بازگشت به لیست
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ─── تصمیم نهایی ─────────────────────────────────────────────
  if (viewMode === 'finalDecision') {
    return (
      <div className="max-w-2xl mx-auto py-8 animate-in fade-in">
        <div className="mb-8 text-center">
          <div className="text-sm font-medium text-primary mb-2">{strategy.name}</div>
          <h1 className="text-2xl sm:text-3xl font-bold">تصمیم نهایی</h1>
          <p className="text-muted-foreground mt-2">همه فازها تکمیل شد. تصمیم شما چیست؟</p>
        </div>

        {/* خلاصه پیروی */}
        <div className="mb-6 p-4 rounded-xl bg-card border flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">تحلیل تکمیل شد</div>
            <div className="text-sm font-medium">{phases.length} فاز · {adherencePct}٪ پیروی</div>
          </div>
          <div className="text-3xl font-bold text-primary">{adherencePct}٪</div>
        </div>

        {/* گزینه‌های تصمیم */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button onClick={() => handleFinalDecision('execute')}
            className="p-4 sm:p-5 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/60 transition-all text-right">
            <TrendingUp className="w-7 h-7 text-emerald-500 mb-2" />
            <div className="font-semibold text-emerald-500">ورود به معامله</div>
            <div className="text-xs text-muted-foreground mt-0.5">همه شرایط برقرار است</div>
          </button>
          <button onClick={() => handleFinalDecision('no-trade')}
            className="p-4 sm:p-5 rounded-xl border-2 border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10 hover:border-rose-500/60 transition-all text-right">
            <TrendingDown className="w-7 h-7 text-rose-500 mb-2" />
            <div className="font-semibold text-rose-500">عدم ورود</div>
            <div className="text-xs text-muted-foreground mt-0.5">شرایط کافی نیست</div>
          </button>
          <button onClick={() => handleFinalDecision('wait')}
            className="p-4 sm:p-5 rounded-xl border-2 border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all text-right">
            <Clock className="w-7 h-7 text-amber-500 mb-2" />
            <div className="font-semibold text-amber-500">صبر کنید</div>
            <div className="text-xs text-muted-foreground mt-0.5">شرایط جزئی برقرار است</div>
          </button>
          <button onClick={() => handleFinalDecision('cancelled')}
            className="p-4 sm:p-5 rounded-xl border-2 border-muted/50 bg-muted/10 hover:bg-muted/20 transition-all text-right">
            <X className="w-7 h-7 text-muted-foreground mb-2" />
            <div className="font-semibold text-muted-foreground">لغو تحلیل</div>
            <div className="text-xs text-muted-foreground mt-0.5">رها کردن بدون تکمیل</div>
          </button>
        </div>

        {/* دلیل تصمیم */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            چرا این تصمیم را گرفتید؟ <span className="text-muted-foreground font-normal">(اختیاری)</span>
          </Label>
          <Textarea
            value={finalDecisionReason}
            onChange={e => setFinalDecisionReason(e.target.value)}
            placeholder="دلیل تصمیم خود را بنویسید..."
            className="h-28"
          />
        </div>
      </div>
    );
  }

  // ─── خلاصه فاز ───────────────────────────────────────────────
  if (viewMode === 'phaseSummary') {
    const phaseSteps = steps[currentPhase.id] || [];
    const answeredCount = phaseSteps.filter(s => {
      const val = results[s.id]?.value;
      return val !== null && val !== undefined && val !== '' && val !== false
        && !(Array.isArray(val) && val.length === 0);
    }).length;
    const isLastPhase = currentPhaseIndex === phases.length - 1;

    return (
      <div className="max-w-2xl mx-auto py-8 animate-in fade-in">
        <div className="mb-8 text-center">
          <Badge variant="secondary" className="mb-3 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            فاز تکمیل شد
          </Badge>
          <h2 className="text-2xl font-bold">{currentPhase.name}</h2>
          <p className="text-muted-foreground mt-1">
            {answeredCount} از {phaseSteps.length} گام تکمیل شد
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="space-y-2">
              {phaseSteps.map(step => {
                const val = results[step.id]?.value;
                const answered = val !== null && val !== undefined && val !== '' && val !== false
                  && !(Array.isArray(val) && val.length === 0);
                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
                      ${answered ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                      <Check className="w-3 h-3" />
                    </div>
                    <span className={`text-sm ${answered ? '' : 'text-muted-foreground'}`}>{step.name}</span>
                    {step.required && !answered && (
                      <Badge variant="outline" className="text-rose-500 border-rose-500/30 text-xs h-4 px-1">
                        اجباری
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setViewMode('runner')}>
            <ArrowRight className="w-4 h-4 ml-1" /> بازگشت به فاز
          </Button>
          <Button onClick={handleConfirmNextPhase}>
            {isLastPhase
              ? 'تکمیل تحلیل'
              : `ادامه: ${phases[currentPhaseIndex + 1]?.name}`}
            <ChevronLeft className="w-4 h-4 mr-1" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── MAIN RUNNER ──────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100dvh-8rem)] animate-in fade-in">
      {/* input مخفی برای فال‌بک */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* هدر */}
      <div className="flex items-center justify-between border-b pb-4 shrink-0 mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/analysis">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="text-xs font-medium text-primary uppercase tracking-wide truncate">
              {strategy.name}
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{currentPhase.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5 h-8 px-2 sm:px-3"
            onClick={handlePause}>
            <Pause className="w-4 h-4" />
            <span className="hidden sm:inline">توقف</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-500 hover:bg-rose-500/10 gap-1.5 h-8 px-2 sm:px-3"
            onClick={handleAbandon}>
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">رها کردن</span>
          </Button>
        </div>
      </div>

      {/* گام‌نمای فازها */}
      <div className="flex items-center gap-1.5 mb-5 shrink-0 overflow-x-auto pb-1">
        {phases.map((p, idx) => {
          const done = idx < currentPhaseIndex;
          const active = idx === currentPhaseIndex;
          return (
            <div key={p.id} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                ${done ? 'bg-emerald-500/15 text-emerald-500'
                : active ? 'bg-primary/15 text-primary'
                : 'bg-muted/50 text-muted-foreground'}`}>
                {done
                  ? <Check className="w-3 h-3" />
                  : active
                    ? <span className="w-3 h-3 rounded-full bg-primary inline-block" />
                    : <span className="w-3 h-3 rounded-full border border-muted-foreground/40 inline-block" />}
                {p.name}
              </div>
              {idx < phases.length - 1 && (
                <ChevronLeft className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <Progress value={overallProgress} className="h-1 mb-6 shrink-0" />

      {/* کارت‌های گام‌ها */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-28">
        <Card className="mb-5 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <Label className="font-semibold">تحلیل آزاد قبل از چک‌لیست</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              برداشت اولیه، سناریوی بازار و نواحی مهم را قبل از پاسخ‌دادن به مراحل ثبت کنید.
            </p>
            <Textarea
              value={freeNotes}
              onChange={e => setFreeNotes(e.target.value)}
              onBlur={() => void analysisService.updateSession(id!, { notes: freeNotes || null })}
              placeholder="سناریوی بازار و فرضیه اولیه خود را بنویسید…"
              className="min-h-[100px] bg-background"
            />
          </CardContent>
        </Card>
        {currentPhase.description && (
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">{currentPhase.description}</p>
        )}
        <div className="space-y-4">
          {currentPhaseSteps.map(step => {
            const res = results[step.id]?.value;
            const answered = res !== null && res !== undefined && res !== '' && res !== false
              && !(Array.isArray(res) && res.length === 0);
            return (
              <Card key={step.id} className={`transition-all duration-200 ${answered ? 'border-primary/40 bg-primary/5' : ''}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Label className="text-base font-semibold flex items-center gap-2 flex-wrap">
                        <span>{step.name}</span>
                        {step.required && <span className="text-rose-500 text-sm">*</span>}
                        {answered && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </Label>
                      {step.hint && <p className="text-sm text-muted-foreground mt-1">{step.hint}</p>}
                      {rules[step.id]?.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {rules[step.id].map(rule => (
                            <div key={rule.id} className="rounded-md border border-dashed border-primary/25 bg-background/50 px-3 py-2 text-xs">
                              <span className="font-medium">{rule.title}</span>
                              {rule.type === 'conditional' && (rule.condition || rule.action) && (
                                <span className="text-muted-foreground"> — اگر {rule.condition || '…'}، آنگاه {rule.action || '…'}</span>
                              )}
                              {rule.description && <p className="mt-1 text-muted-foreground">{rule.description}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">

                    {/* CHECKBOX */}
                    {step.type === 'checkbox' && (
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`step-${step.id}`}
                          checked={!!res}
                          onCheckedChange={c => handleUpdateResult(step.id, c)}
                          className="w-6 h-6 rounded-md"
                        />
                        <Label htmlFor={`step-${step.id}`} className="text-base cursor-pointer">
                          علامت‌گذاری به‌عنوان تکمیل شده
                        </Label>
                      </div>
                    )}

                    {/* TEXT */}
                    {step.type === 'text' && (
                      <Input
                        value={res || ''}
                        onChange={e => handleUpdateResult(step.id, e.target.value)}
                        placeholder="پاسخ خود را بنویسید..."
                      />
                    )}

                    {/* TEXTAREA */}
                    {step.type === 'textarea' && (
                      <Textarea
                        value={res || ''}
                        onChange={e => handleUpdateResult(step.id, e.target.value)}
                        placeholder="یادداشت تفصیلی..."
                        className="min-h-[90px]"
                      />
                    )}

                    {/* NUMBER */}
                    {step.type === 'number' && (
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={res || ''}
                        onChange={e => handleUpdateResult(step.id, e.target.value)}
                        placeholder="0.00"
                        className="max-w-[200px]"
                      />
                    )}

                    {/* RATING */}
                    {step.type === 'rating' && (
                      <div className="flex gap-2 flex-wrap">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Button
                            key={n}
                            variant={res === n ? 'default' : 'outline'}
                            className="w-11 h-11"
                            onClick={() => handleUpdateResult(step.id, n)}
                          >
                            {n}
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* SINGLE CHOICE */}
                    {step.type === 'select' && (
                      <RadioGroup
                        value={res || ''}
                        onValueChange={v => handleUpdateResult(step.id, v)}
                        className="flex flex-col gap-2"
                      >
                        {JSON.parse(step.options || '[]').map((opt: string) => (
                          <div key={opt} className="flex items-center gap-2">
                            <RadioGroupItem value={opt} id={`opt-${step.id}-${opt}`} />
                            <Label htmlFor={`opt-${step.id}-${opt}`} className="cursor-pointer">{opt}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}

                    {/* MULTI-SELECT */}
                    {step.type === 'multi-select' && (
                      <div className="flex flex-col gap-2">
                        {JSON.parse(step.options || '[]').map((opt: string) => {
                          const selected: string[] = res || [];
                          return (
                            <div key={opt} className="flex items-center gap-2">
                              <Checkbox
                                id={`mopt-${step.id}-${opt}`}
                                checked={selected.includes(opt)}
                                onCheckedChange={() => handleMultiSelectToggle(step.id, opt)}
                              />
                              <Label htmlFor={`mopt-${step.id}-${opt}`} className="cursor-pointer">{opt}</Label>
                            </div>
                          );
                        })}
                        {(res as string[] || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {(res as string[]).map(o => (
                              <Badge key={o} variant="secondary" className="text-xs">{o}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* DATE */}
                    {step.type === 'date' && (
                      <Input
                        type="datetime-local"
                        value={res || ''}
                        onChange={e => handleUpdateResult(step.id, e.target.value)}
                        className="max-w-[260px]"
                      />
                    )}

                    {/* IMAGE / SCREENSHOT — Prompt 15 §14 */}
                    {step.type === 'image' && (
                      <div className="space-y-3">
                        {imageValues(res).length > 0 ? (
                          <>
                            <div className="flex flex-wrap gap-3">
                              {imageValues(res).map((image, imageIndex) => (
                                <div key={`${step.id}-image-${imageIndex}`} className="relative inline-block">
                                  <StoredImage
                                    source={image}
                                    alt={`اسکرین‌شات ${imageIndex + 1}`}
                                    enableViewer
                                    showDownload
                                    filename={`${step.name || 'session-screenshot'}-${imageIndex + 1}`}
                                    className="max-h-48 rounded-lg border object-contain"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1 right-1 h-7 w-7 bg-background/80 hover:bg-background"
                                    onClick={() => {
                                      const remaining = imageValues(res).filter((_, index) => index !== imageIndex);
                                      handleUpdateResult(step.id, remaining.length ? remaining : null);
                                    }}
                                    aria-label="حذف تصویر"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                            <Button variant="outline" size="sm" className="gap-2 border-dashed" onClick={() => handleImagePick(step.id)}>
                              <Camera className="w-4 h-4" /> افزودن تصویر
                            </Button>
                            {/* Visual similarity — compare with historical setups */}
                            {(() => {
                              const contextText = [
                                step.name,
                                step.hint ?? '',
                                session?.notes ?? '',
                              ].filter(Boolean).join(' ');
                              const mockTrade = makeAnalysisTrade(contextText);
                              const now = Date.now();
                              const mockScreenshot: TradeScreenshot = {
                                id: `runner-${step.id}`,
                                label: step.name,
                                dataUrl: res as string,
                                type: 'analysis',
                                linkedTo: null,
                                timeframe: null,
                                lifecyclePosition: 'before-entry',
                                width: null,
                                height: null,
                                fileSize: null,
                                quality: null,
                                extractedFeatures: extractInitialFeatures(mockTrade, contextText),
                                userAddedFeatures: [],
                                fibonacci: null,
                                analysisNotes: null,
                                annotations: [],
                                createdAt: now,
                              };
                              const matches = findSimilarScreenshots(
                                mockScreenshot,
                                allTrades,
                                { limit: 3, minScore: 25 },
                              );
                              if (matches.length === 0) return null;
                              return (
                                <div className="border border-white/10 rounded-lg p-3 bg-white/2 space-y-2">
                                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Search className="w-3 h-3 shrink-0" />
                                    ستاپ‌های بصری مشابه در تاریخچه معاملات شما:
                                  </p>
                                  <VisualSimilarityPanel matches={matches} />
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              className="gap-2 border-dashed"
                              onClick={() => handleImagePick(step.id)}
                            >
                              <Camera className="w-4 h-4" /> آپلود اسکرین‌شات
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* نوار اقدامات پایین
          موبایل: bottom-14 = بالای bottom-nav (56px) — z-20 چون bottom-nav خود z-30 دارد
          دسکتاپ: md:bottom-0 + md:right-64 = جای sidebar راست را خالی می‌کند (RTL)
      */}
      <div className="fixed left-0 right-0 md:right-64 bottom-14 md:bottom-0 bg-background/95 backdrop-blur border-t z-20 p-3 sm:p-4 flex justify-between items-center gap-4"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPhaseIndex === 0}
            onClick={handleBack}
            className="gap-1.5"
          >
            <ArrowRight className="w-4 h-4" />
            <span className="hidden sm:inline">قبلی</span>
          </Button>
          <div className="text-xs text-muted-foreground">
            فاز {currentPhaseIndex + 1} از {phases.length} · {completedStepsCount}/{currentPhaseSteps.length} گام
          </div>
        </div>
        <Button
          size="lg"
          onClick={handleNext}
          disabled={!isPhaseComplete}
          className="gap-2 px-4 sm:px-6"
        >
          {currentPhaseIndex === phases.length - 1 ? (
            <><Check className="w-4 h-4" /> تکمیل تحلیل</>
          ) : (
            <>فاز بعدی <ChevronLeft className="w-4 h-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}
