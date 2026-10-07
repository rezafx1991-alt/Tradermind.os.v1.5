import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { tradeService } from "../services/tradeService";
import { analysisService } from "../services/analysisService";
import { strategyService } from "../services/strategyService";
import { db, Trade, Strategy, AnalysisSession, Phase, TradeVersion } from "../db/database";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { ArrowRight, Pencil, Trash2, CheckCircle2, ClipboardList, Brain, AlertCircle, Activity, Clock, Plus, AlertTriangle, History, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { tradeEventService, tradeVersionService } from "../services/tradeEventService";
import { getMissingFieldsForTrade, scoreOneTrade } from "../services/dataQualityService";
import { TradeEvent } from "../db/database";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription, DialogTrigger,
} from "../components/ui/dialog";
import { Progress } from "../components/ui/progress";
import { format } from "date-fns";
import ScreenshotManager from "../components/ScreenshotManager";
import { TradeScreenshot } from "../types/screenshot";
import { getNetPnl } from "../lib/tradeHelpers";

// نگاشت ID احساس (انگلیسی) به برچسب فارسی برای نمایش
const EMOTION_LABELS_FA: Record<string, string> = {
  'Calm':            'آرام',
  'Confident':       'مطمئن',
  'Uncertain':       'نامطمئن',
  'Fearful':         'ترسیده',
  'Anxious':         'مضطرب',
  'Excited':         'هیجان‌زده',
  'Frustrated':      'ناکام',
  'FOMO':            'ترس از دست دادن',
  'Revenge Trading': 'معامله انتقامی',
  'Overconfident':   'بیش از حد مطمئن',
  'Tired':           'خسته',
  'Distracted':      'حواس‌پرت',
};

const RESULT_COLORS: Record<string, string> = {
  win:           'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
  loss:          'bg-rose-500/20 text-rose-500 border-rose-500/30',
  breakeven:     'bg-slate-500/20 text-slate-500 border-slate-500/30',
  'partial-win': 'bg-teal-500/20 text-teal-500 border-teal-500/30',
  'partial-loss':'bg-amber-500/20 text-amber-500 border-amber-500/30',
  open:          'bg-blue-500/20 text-blue-500 border-blue-500/30',
  cancelled:     'bg-muted text-muted-foreground',
};

const RESULT_FA: Record<string, string> = {
  win: 'سود', loss: 'ضرر', breakeven: 'سر به سر',
  'partial-win': 'سود جزئی', 'partial-loss': 'ضرر جزئی',
  open: 'باز', cancelled: 'لغو',
};

const DIRECTION_FA: Record<string, string> = { long: 'خرید (Long)', short: 'فروش (Short)' };

const RATING_COLORS: Record<string, string> = {
  fully:     'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
  mostly:    'bg-teal-500/20 text-teal-500 border-teal-500/30',
  partially: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
  not:       'bg-rose-500/20 text-rose-500 border-rose-500/30',
};

const ADHERENCE_FA: Record<string, string> = {
  fully: 'کاملاً پیروی',  mostly: 'تا حد زیادی',
  partially: 'کمی',       not: 'اصلاً پیروی نکرده',
};

const SESSION_STATUS_FA: Record<string, string> = {
  completed: 'تکمیل شده', 'in-progress': 'در حال انجام', abandoned: 'رها شده',
};

function getReturnToFromLocation(location: string): string {
  const locationQuery = location.includes('?')
    ? location.slice(location.indexOf('?') + 1)
    : '';
  const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const browserQuery = typeof window !== 'undefined'
    ? window.location.search.replace(/^\?/, '')
    : '';
  return new URLSearchParams(locationQuery || hashQuery || browserQuery).get('returnTo') || '/journal/trades';
}

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [missingFields, setMissingFields] = useState<{ key: string; label: string; importance: string }[]>([]);
  const [completeness, setCompleteness] = useState<number | null>(null);
  const [newEventNote, setNewEventNote] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);
  const [versions, setVersions] = useState<TradeVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);

  const returnTo = getReturnToFromLocation(location);
  const editPath = `/journal/trades/new?editId=${encodeURIComponent(trade?.id || id || '')}&returnTo=${encodeURIComponent(returnTo)}`;

  useEffect(() => { loadTrade(); }, [id]);
  useEffect(() => { db.trades.toArray().then(setAllTrades); }, []);
  useEffect(() => {
    if (!id) return;
    tradeEventService.getEventsForTrade(id).then(setEvents);
  }, [id]);

  const handleToggleVersions = async () => {
    if (!versionsLoaded && id) {
      const v = await tradeVersionService.getVersionsForTrade(id);
      setVersions(v);
      setVersionsLoaded(true);
    }
    setVersionsOpen(o => !o);
  };

  const loadTrade = async () => {
    if (!id) return;
    const tr = await tradeService.getTradeById(id);
    if (!tr) { setLocation(returnTo); return; }
    setTrade(tr);

    if (tr.sessionId) {
      const sess = await analysisService.getSessionById(tr.sessionId);
      if (sess) {
        setSession(sess);
        const strat = await strategyService.getStrategyById(sess.strategyId);
        if (strat) {
          setStrategy(strat);
          const phs = await strategyService.getPhasesByStrategyId(strat.id);
          setPhases(phs);
        }
      }
    } else if (tr.strategyId) {
      const strat = await strategyService.getStrategyById(tr.strategyId);
      if (strat) setStrategy(strat);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    await tradeService.deleteTrade(id);
    setLocation(returnTo);
  };

  const handleComputeAdherence = async () => {
    if (!trade || !session) return;
    const score = await tradeService.computeAdherenceScore(session.id);
    if (score !== null) {
      const updated = await tradeService.updateTrade(trade.id, { adherenceScore: score });
      if (updated) setTrade(updated);
    }
  };

  if (!trade) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in duration-300">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-6 w-20 rounded-full mr-auto" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const currentEmotions = JSON.parse(trade.emotions || '[]') as string[];
  const review = JSON.parse(trade.review || '{}');
  const tags = JSON.parse(trade.tags || '[]') as string[];
  const missing = getMissingFieldsForTrade(trade);
  const score = scoreOneTrade(trade);

  const handleScreenshotsChange = async (screenshots: TradeScreenshot[]) => {
    const updated = await tradeService.updateTrade(trade.id, {
      screenshots: JSON.stringify(screenshots),
    });
    if (updated) setTrade(updated);
  };

  const handleAddEvent = async () => {
    if (!newEventNote.trim()) return;
    setAddingEvent(true);
    await tradeEventService.addEvent({
      tradeId: trade.id,
      eventType: 'note',
      timestamp: Date.now(),
      description: newEventNote.trim(),
      price: null,
      data: null,
    });
    const updated = await tradeEventService.getEventsForTrade(trade.id);
    setEvents(updated);
    setNewEventNote('');
    setAddingEvent(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500">

      {/* ── هشدار داده‌های ناقص ── */}
      {missing.filter(f => f.importance === 'high').length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/8 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">داده‌های مهم وارد نشده:</span>
          {missing.filter(f => f.importance === 'high').map(f => (
            <Badge key={f.key} variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] py-0">{f.label}</Badge>
          ))}
          <Button size="sm" variant="ghost" className="mr-auto h-6 text-xs"
            onClick={() => setLocation(editPath)}>
            تکمیل
          </Button>
        </div>
      )}

      {/* هدر */}
      <div className="flex items-start sm:items-center justify-between border-b pb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation(returnTo)} className="shrink-0">
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{trade.symbol}</h1>
            <Badge variant="outline" className={trade.direction === 'long'
              ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-500 border-rose-500/30'}>
              {DIRECTION_FA[trade.direction] || trade.direction}
            </Badge>
            <Badge variant="outline" className={RESULT_COLORS[trade.result] || RESULT_COLORS.open}>
              {RESULT_FA[trade.result] || trade.result}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {trade.status === 'open' && (
            <Button variant="outline" size="sm" className="gap-2 border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
              onClick={() => setLocation(`/journal/trades/${trade.id}/live`)}>
              <Activity className="w-4 h-4" /> پایش زنده
            </Button>
          )}
          {trade.status === 'closed' && (
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => setLocation(`/journal/trades/${trade.id}/review`)}>
              <ClipboardList className="w-4 h-4" />
              {(() => { try { const ptr = JSON.parse(trade.postTradeReview || '{}'); return ptr.completedAt > 0 ? 'مشاهده ریویو' : 'مرور پس از معامله'; } catch { return 'مرور پس از معامله'; } })()}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2"
            onClick={() => setLocation(editPath)}>
            <Pencil className="w-4 h-4" /> ویرایش
          </Button>
          <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="icon" className="h-9 w-9">
                <Trash2 className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>حذف معامله؟</DialogTitle>
                <DialogDescription>
                  این عملیات غیرقابل بازگشت است و معامله به‌طور دائم حذف خواهد شد.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsDeleting(false)}>لغو</Button>
                <Button variant="destructive" onClick={handleDelete}>حذف</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* کارت‌های قیمت */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'قیمت ورود', value: trade.entryPrice },
          {
            label: 'قیمت خروج',
            value: trade.exitPrice !== null ? trade.exitPrice : <span className="text-primary text-lg">باز</span>,
          },
          {
            label: 'سود / زیان خالص',
            value: getNetPnl(trade) !== null ? `$${getNetPnl(trade)!.toFixed(2)}` : '-',
            cls: getNetPnl(trade) ? (getNetPnl(trade)! > 0 ? 'text-emerald-500' : 'text-rose-500') : '',
          },
          { label: 'R Multiple', value: trade.rMultiple !== null ? `${trade.rMultiple}R` : '-' },
        ].map((c, i) => (
          <Card key={i} className="bg-muted/10">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
              <div className={`text-xl sm:text-2xl font-semibold ${c.cls ?? ''}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* محتوای اصلی */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ستون اصلی */}
        <div className="md:col-span-2 space-y-6">

          {/* جزئیات معامله */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">جزئیات معامله</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                {[
                  { label: 'بازار', value: trade.market || '-' },
                  { label: 'استراتژی', value: strategy?.name || '-' },
                  { label: 'زمان ورود', value: format(new Date(trade.openedAt), 'MMM d, yyyy HH:mm') },
                  { label: 'زمان خروج', value: trade.closedAt ? format(new Date(trade.closedAt), 'MMM d, yyyy HH:mm') : '-' },
                  { label: 'حجم پوزیشن', value: trade.positionSize || '-' },
                  { label: 'ریسک (٪)', value: trade.riskPercentage !== null ? `${trade.riskPercentage}٪` : '-' },
                  { label: 'مقدار ریسک', value: trade.riskAmount !== null ? `$${trade.riskAmount}` : '-' },
                  { label: 'سایر هزینه‌ها', value: trade.fees != null ? `$${trade.fees}` : '-' },
                  { label: 'کمیسیون', value: trade.commission != null ? `$${trade.commission}` : '-' },
                  { label: 'اسپرد', value: trade.spread != null ? `$${trade.spread}` : '-' },
                ].map((f, i) => (
                  <div key={i}>
                    <div className="text-muted-foreground">{f.label}</div>
                    <div className="font-medium mt-0.5">{f.value}</div>
                  </div>
                ))}
                {trade.reasonForExit && (
                  <div className="col-span-2 mt-2 pt-2 border-t">
                    <div className="text-muted-foreground">دلیل خروج</div>
                    <div className="font-medium mt-1">{trade.reasonForExit}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* مرور معامله */}
          {trade.status === 'closed' && (review.didWell || review.didWrong || review.learned) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">مرور معامله</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex gap-3 flex-wrap mb-2">
                  {review.wouldTakeAgain && (
                    <Badge variant="outline">دوباره می‌گیرم: <span className="font-semibold mr-1">{review.wouldTakeAgain}</span></Badge>
                  )}
                  {review.validSetup && (
                    <Badge variant="outline">ستاپ معتبر: <span className="font-semibold mr-1">{review.validSetup}</span></Badge>
                  )}
                </div>
                {review.didWell && (
                  <div>
                    <div className="text-emerald-500 font-medium mb-1">چه کاری را خوب انجام دادم؟</div>
                    <div className="bg-muted/30 p-3 rounded-lg">{review.didWell}</div>
                  </div>
                )}
                {review.didWrong && (
                  <div>
                    <div className="text-rose-500 font-medium mb-1">کجا اشتباه کردم؟</div>
                    <div className="bg-muted/30 p-3 rounded-lg">{review.didWrong}</div>
                  </div>
                )}
                {review.learned && (
                  <div>
                    <div className="text-primary font-medium mb-1">چه چیزی یاد گرفتم؟</div>
                    <div className="bg-muted/30 p-3 rounded-lg">{review.learned}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* مرور ساختاریافته پس از معامله */}
          {trade.status === 'closed' && (() => {
            try {
              const ptr = JSON.parse(trade.postTradeReview || '{}');
              const completed = ptr.completedAt > 0;
              const aiDone = !!ptr.aiAnalysis;
              const qualityAvg = ([ptr.tradeQualityScore, ptr.analysisQualityScore, ptr.executionQualityScore] as (number | null | undefined)[]).filter((n): n is number => typeof n === 'number');
              const avgQ = qualityAvg.length > 0 ? (qualityAvg.reduce((a, b) => a + b, 0) / qualityAvg.length).toFixed(1) : null;
              return (
                <Card className={completed ? 'border-primary/20' : 'border-dashed border-border'}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-primary" />
                        مرور ساختاریافته پس از معامله
                      </span>
                      {completed
                        ? <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-xs">تکمیل شده</Badge>
                        : <Badge variant="outline" className="text-muted-foreground text-xs">انجام نشده</Badge>
                      }
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {completed ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {avgQ && (
                            <div className="bg-muted/30 p-2.5 rounded-lg">
                              <div className="text-xs text-muted-foreground">کیفیت میانگین</div>
                              <div className="font-bold text-lg text-primary">{avgQ}/5</div>
                            </div>
                          )}
                          {ptr.directionalAccuracy && (
                            <div className="bg-muted/30 p-2.5 rounded-lg">
                              <div className="text-xs text-muted-foreground">دقت جهت</div>
                              <div className="font-medium text-sm">
                                {ptr.directionalAccuracy === 'correct' ? '✅ درست' : ptr.directionalAccuracy === 'partial' ? '🔶 جزئی' : '❌ نادرست'}
                              </div>
                            </div>
                          )}
                          {ptr.entryFollowedPlan !== null && (
                            <div className="bg-muted/30 p-2.5 rounded-lg">
                              <div className="text-xs text-muted-foreground">پیروی از پلن</div>
                              <div className="font-medium text-sm">{ptr.entryFollowedPlan ? '✅ بله' : '❌ خیر'}</div>
                            </div>
                          )}
                          {ptr.slRespected !== null && (
                            <div className="bg-muted/30 p-2.5 rounded-lg">
                              <div className="text-xs text-muted-foreground">حد ضرر</div>
                              <div className="font-medium text-sm">{ptr.slRespected ? '✅ رعایت شد' : '❌ رعایت نشد'}</div>
                            </div>
                          )}
                        </div>
                        {aiDone && ptr.aiAnalysis?.summary && (
                          <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg">
                            <div className="flex items-center gap-2 text-primary text-xs font-medium mb-1">
                              <Brain className="w-3.5 h-3.5" /> تحلیل هوشمند
                            </div>
                            <p className="text-xs leading-relaxed">{ptr.aiAnalysis.summary}</p>
                          </div>
                        )}
                        {ptr.aiAnalysis?.repeatedMistakes?.length > 0 && (
                          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            <span className="text-xs text-rose-300">{ptr.aiAnalysis.repeatedMistakes.length} اشتباه تکراری شناسایی شد</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-3 space-y-3">
                        <p className="text-xs text-muted-foreground">مرور ساختاریافته برای این معامله تکمیل نشده است.</p>
                        <p className="text-xs text-muted-foreground">با تکمیل ریویو، سیستم از این معامله یاد می‌گیرد و الگوهای شما را شناسایی می‌کند.</p>
                      </div>
                    )}
                    <Button className="w-full gap-2" size="sm" variant={completed ? 'outline' : 'default'}
                      onClick={() => setLocation(`/journal/trades/${trade.id}/review`)}>
                      <ClipboardList className="w-4 h-4" />
                      {completed ? 'مشاهده و ویرایش ریویو' : 'شروع مرور پس از معامله'}
                    </Button>
                  </CardContent>
                </Card>
              );
            } catch { return null; }
          })()}

          {/* اسکرین‌شات‌ها */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">اسکرین‌شات‌ها</CardTitle>
            </CardHeader>
            <CardContent>
              <ScreenshotManager
                trade={trade}
                allTrades={allTrades}
                onChange={handleScreenshotsChange}
                compactMode={false}
              />
            </CardContent>
          </Card>
        </div>

        {/* ستون کناری */}
        <div className="space-y-6">

          {/* جلسه تحلیل */}
          {session && (
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex justify-between items-center gap-2">
                  جلسه تحلیل
                  <Badge variant="outline" className={session.status === 'completed' ? 'text-emerald-500' : ''}>
                    {SESSION_STATUS_FA[session.status] || session.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">امتیاز پیروی</div>
                  {trade.adherenceScore !== null ? (
                    <div className="flex items-center gap-3">
                      <Progress value={trade.adherenceScore} className="h-2 flex-1" />
                      <span className="font-bold text-lg">{trade.adherenceScore}٪</span>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" className="w-full" onClick={handleComputeAdherence}>
                      محاسبه امتیاز پیروی
                    </Button>
                  )}
                </div>
                {trade.adherenceRating && (
                  <Badge variant="outline" className={RATING_COLORS[trade.adherenceRating] || ''}>
                    {ADHERENCE_FA[trade.adherenceRating] || trade.adherenceRating}
                  </Badge>
                )}
                {trade.adherenceNotes && (
                  <div className="bg-muted/50 p-3 rounded-md text-muted-foreground italic text-xs">
                    «{trade.adherenceNotes}»
                  </div>
                )}
                {phases.length > 0 && (
                  <div className="pt-2">
                    <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">فازها</div>
                    <div className="space-y-2">
                      {phases.map(p => (
                        <div key={p.id} className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500/50 shrink-0" />
                          <span className="text-sm">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button variant="outline" className="w-full"
                  onClick={() => setLocation(`/analysis/${session.id}`)}>
                  مشاهده کامل تحلیل
                </Button>
              </CardContent>
            </Card>
          )}

          {/* وضعیت احساسی */}
          {currentEmotions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">وضعیت احساسی</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  {currentEmotions.map(emo => (
                    <span key={emo} className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {EMOTION_LABELS_FA[emo] ?? emo}
                    </span>
                  ))}
                </div>
                {trade.emotionNotes && (
                  <div className="text-sm bg-muted/30 p-3 rounded-lg">{trade.emotionNotes}</div>
                )}
              </CardContent>
            </Card>
          )}

          {/* یادداشت‌ها */}
          {(trade.notes || tags.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">یادداشت‌ها</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {trade.notes && (
                  <div className="text-sm whitespace-pre-wrap">{trade.notes}</div>
                )}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">#{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── درس آموخته ── */}
          {(trade as any).lesson && (
            <Card className="border-indigo-500/30 bg-indigo-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" /> درس آموخته
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap">{(trade as any).lesson}</div>
              </CardContent>
            </Card>
          )}

          {/* ── تایم‌لاین رویدادها ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> تایم‌لاین رویدادها
                <Badge variant="outline" className="text-[10px] py-0 mr-auto">{events.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* افزودن یادداشت جدید */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newEventNote}
                  onChange={e => setNewEventNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddEvent()}
                  placeholder="یادداشت جدید بزنید…"
                  className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button size="sm" onClick={handleAddEvent} disabled={addingEvent || !newEventNote.trim()} className="h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* فهرست رویدادها */}
              {events.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-3">هنوز رویدادی ثبت نشده.</div>
              ) : (
                <div className="relative">
                  <div className="absolute right-[7px] top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4 pr-6">
                    {events.map(ev => (
                      <div key={ev.id} className="relative">
                        <div className="absolute -right-6 top-1 w-3.5 h-3.5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        </div>
                        <div className="text-xs text-muted-foreground mb-0.5">
                          {format(new Date(ev.timestamp), 'MM/dd HH:mm')}
                          {ev.eventType !== 'note' && (
                            <Badge variant="outline" className="mr-2 text-[9px] py-0">{ev.eventType}</Badge>
                          )}
                        </div>
                        {ev.description && <div className="text-sm">{ev.description}</div>}
                        {ev.price && <div className="text-xs text-muted-foreground">قیمت: {ev.price}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── کیفیت داده ── */}
          <Card className="bg-muted/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">کامل‌بودن داده</div>
                <span className={`text-sm font-bold ${
                  score.score >= 80 ? 'text-emerald-500' :
                  score.score >= 60 ? 'text-amber-500' : 'text-rose-500'
                }`}>{score.score}٪</span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${score.score}%` }} />
              </div>
              {missing.filter(f => f.importance !== 'high').length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {missing.filter(f => f.importance !== 'high').slice(0, 4).map(f => (
                    <Badge key={f.key} variant="outline" className="text-[9px] py-0 text-muted-foreground">{f.label}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── تاریخچه تغییرات (Section 17) ── */}
          <Card>
            <CardHeader
              className="pb-3 cursor-pointer select-none"
              onClick={handleToggleVersions}
            >
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4 text-muted-foreground" />
                  تاریخچه تغییرات فیلدها
                </span>
                <div className="flex items-center gap-2">
                  {versionsLoaded && (
                    <Badge variant="outline" className="text-[10px] py-0">{versions.length}</Badge>
                  )}
                  {versionsOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </CardTitle>
            </CardHeader>
            {versionsOpen && (
              <CardContent className="pt-0">
                {versions.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-3">
                    هیچ تغییری در فیلدهای اصلی ثبت نشده.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {versions.map((v, vi) => {
                      const changes = tradeVersionService.parseChanges(v);
                      return (
                        <div key={v.id} className="relative pr-5">
                          {/* خط عمودی */}
                          {vi < versions.length - 1 && (
                            <div className="absolute right-[7px] top-4 bottom-[-1rem] w-px bg-border" />
                          )}
                          {/* نقطه */}
                          <div className="absolute right-0 top-1 w-3.5 h-3.5 rounded-full bg-background border-2 border-primary/50 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          </div>
                          <div className="text-xs text-muted-foreground mb-1.5">
                            {format(new Date(v.changedAt), 'yyyy/MM/dd — HH:mm')}
                          </div>
                          <div className="space-y-1.5">
                            {changes.map(c => (
                              <div key={c.field} className="flex items-center gap-2 text-xs bg-muted/20 rounded-lg px-2.5 py-1.5">
                                <span className="text-muted-foreground shrink-0">{c.label}:</span>
                                <span className="line-through text-rose-400 font-mono">{String(c.oldValue ?? '—')}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-emerald-400 font-mono">{String(c.newValue ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
