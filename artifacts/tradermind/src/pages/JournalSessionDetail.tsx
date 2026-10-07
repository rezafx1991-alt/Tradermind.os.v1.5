import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import {
  ArrowRight, CalendarClock, CircleAlert, Crosshair, FilePlus2, Film, Image as ImageIcon,
  LineChart, Paperclip, Plus, Save, ShieldCheck, Target, Trash2, TrendingDown, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { accountService } from '../services/accountService';
import {
  buildSessionTimeline, journalSessionService, parseJournalArray, parsePreTradePsychology,
  type JournalSessionBundle, type SessionTimelineItem,
} from '../services/journalSessionService';
import { tradingBoxService } from '../services/tradingBoxService';
import type { JournalMedia, JournalOption, JournalTriggerStatus, Trade, TradingBox } from '../db/database';
import { SessionAnalysisPanel } from '../components/journal/SessionAnalysisPanel';
import { MediaThumb } from '../components/journal/MediaThumb';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Textarea } from '../components/ui/textarea';

const localDate = (timestamp: number) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
const money = (value: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value);
const statusName = (status: string) => status === 'active' ? 'در جریان' : status === 'completed' ? 'تکمیل‌شده' : 'لغوشده';
const safeOptions = (options: JournalOption[], category: string) => options.filter(option => option.enabled && option.category === category);

export default function JournalSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const [, setLocation] = useLocation();
  const [bundle, setBundle] = useState<JournalSessionBundle>();
  const [box, setBox] = useState<TradingBox>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sessionDraft, setSessionDraft] = useState({
    notes: '', lessonsLearned: '', mistakesReview: '', psychologicalReview: '',
    strategyObservations: '', strategyChangeProposal: '', status: 'active' as 'active' | 'completed' | 'cancelled',
  });
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [psychDraft, setPsychDraft] = useState({ optionIds: [] as string[], intensity: 0, notes: '' });
  const [reviewExtra, setReviewExtra] = useState({ finalReflection: '', sessionQuality: '', strategyCompliance: 'none' });
  const [eventType, setEventType] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileCaption, setFileCaption] = useState('');
  const [attachmentAnalysisId, setAttachmentAnalysisId] = useState('session');
  const [mediaSaving, setMediaSaving] = useState(false);
  const [busyMediaId, setBusyMediaId] = useState('');
  const [busyEventId, setBusyEventId] = useState('');
  const [accountName, setAccountName] = useState('');

  const reload = async () => {
    if (!sessionId) { setLoading(false); setLoadError('شناسهٔ سشن معتبر نیست.'); return; }
    setLoading(true); setLoadError('');
    try {
      const result = await journalSessionService.getBundle(sessionId);
      if (!result) { setBundle(undefined); setLoadError('این سشن پیدا نشد یا از دستگاه حذف شده است.'); return; }
      setBundle(result);
      const [account, currentBox] = await Promise.all([
        accountService.getAll().then(rows => rows.find(row => row.id === result.session.accountId)),
        tradingBoxService.getById(result.session.tradingBoxId),
      ]);
      setAccountName(account?.name ?? 'حساب در دسترس نیست');
      setBox(currentBox);
      setSessionDraft({
        notes: result.session.notes ?? '', lessonsLearned: result.session.lessonsLearned ?? '',
        mistakesReview: result.session.mistakesReview ?? '', psychologicalReview: result.session.psychologicalReview ?? '',
        strategyObservations: result.session.strategyObservations ?? '', strategyChangeProposal: result.session.strategyChangeProposal ?? '',
        status: result.session.status,
      });
      setPsychDraft(parsePreTradePsychology(result.session.preTradePsychology));
      setReviewExtra({
        finalReflection: result.session.finalReflection ?? '',
        sessionQuality: result.session.sessionQuality == null ? '' : String(result.session.sessionQuality),
        strategyCompliance: result.session.strategyCompliance ?? 'none',
      });
      setEventType(safeOptions(result.options, 'session_event_type')[0]?.id ?? '');
      setAttachmentAnalysisId('session');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'خواندن اطلاعات سشن انجام نشد.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, [sessionId]);

  const bundleOptions = bundle?.options ?? [];
  const timeframes = safeOptions(bundleOptions, 'timeframe');
  const eventTypes = safeOptions(bundleOptions, 'session_event_type');
  const sessionType = bundleOptions.find(option => option.id === bundle?.session.sessionTypeOptionId)?.label;
  const metrics = useMemo(() => bundle ? journalSessionService.calculateMetrics(bundle.trades) : null, [bundle]);
  const media = bundle?.media ?? [];
  const analyses = bundle?.analyses ?? [];

  const timeline = useMemo<SessionTimelineItem[]>(() => bundle ? buildSessionTimeline(bundle) : [], [bundle]);
  const optionLabel = (optionId: string | null | undefined) => (optionId ? bundleOptions.find(option => option.id === optionId)?.label : undefined);

  const savePsychology = async () => {
    setSaving(true);
    try {
      await journalSessionService.updateSession(sessionId, { preTradePsychology: JSON.stringify(psychDraft) });
      toast.success('روانشناسی پیش از معامله ذخیره شد.');
      await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ذخیره انجام نشد.'); }
    finally { setSaving(false); }
  };
  const removeAnalysis = async (analysisId: string) => {
    if (!window.confirm('این تحلیل و فایل‌هایش حذف شود؟ معامله‌های متصل حذف نمی‌شوند.')) return;
    try { await journalSessionService.deleteAnalysisEvent(analysisId); toast.success('تحلیل حذف شد.'); await reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'حذف انجام نشد.'); }
  };
  const setTriggerStatus = async (triggerId: string, status: JournalTriggerStatus) => {
    try { await journalSessionService.updateTriggerEvent(triggerId, { status }); await reload(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'تغییر وضعیت انجام نشد.'); }
  };
  const saveSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bundle) return;
    setSaving(true);
    try {
      await journalSessionService.updateSession(sessionId, {
        ...sessionDraft,
        finalReflection: reviewExtra.finalReflection,
        sessionQuality: reviewExtra.sessionQuality === '' ? null : Math.min(10, Math.max(0, Number(reviewExtra.sessionQuality) || 0)),
        strategyCompliance: reviewExtra.strategyCompliance === 'none' ? null : reviewExtra.strategyCompliance as 'yes' | 'partially' | 'no',
        endTime: sessionDraft.status === 'active' ? null : (bundle.session.endTime ?? Date.now()),
      });
      toast.success('یادداشت و وضعیت سشن ذخیره شد.');
      await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ سشن انجام نشد.'); }
    finally { setSaving(false); }
  };
  const addEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eventType) { toast.error('نوع رویداد فعال در دسترس نیست.'); return; }
    setEventSaving(true);
    try {
      await journalSessionService.addEvent({
        sessionId, typeOptionId: eventType, notes: eventNotes,
        eventAt: eventTime ? new Date(eventTime).getTime() : Date.now(),
      });
      setEventNotes(''); setEventTime('');
      toast.success('رویداد ثبت شد.');
      await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ثبت رویداد انجام نشد.'); }
    finally { setEventSaving(false); }
  };
  const removeEvent = async (eventId: string) => {
    setBusyEventId(eventId);
    try { await journalSessionService.deleteEvent(eventId); await reload(); toast.success('رویداد حذف شد.'); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'حذف رویداد انجام نشد.'); }
    finally { setBusyEventId(''); }
  };
  const addMedia = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { toast.error('ابتدا یک فایل انتخاب کنید.'); return; }
    setMediaSaving(true);
    try {
      const targetAnalysis = attachmentAnalysisId === 'session' ? undefined : attachmentAnalysisId;
      await journalSessionService.saveMedia({
        sessionId, analysisId: targetAnalysis, category: targetAnalysis ? 'analysis' : 'session', file, caption: fileCaption,
      });
      setFile(null); setFileCaption('');
      const input = document.getElementById('session-media-file') as HTMLInputElement | null;
      if (input) input.value = '';
      toast.success('پیوست در حافظهٔ محلی ذخیره شد.');
      await reload();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ فایل انجام نشد.'); }
    finally { setMediaSaving(false); }
  };
  const removeMedia = async (mediaId: string) => {
    setBusyMediaId(mediaId);
    try { await journalSessionService.deleteMedia(mediaId); await reload(); toast.success('پیوست حذف شد.'); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'حذف پیوست انجام نشد.'); }
    finally { setBusyMediaId(''); }
  };
  const openMedia = (item: JournalMedia) => {
    const url = URL.createObjectURL(item.blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = item.fileName; anchor.target = '_blank'; anchor.rel = 'noreferrer';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  if (loading) return <main dir="rtl" className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8" data-testid="loading-session-detail">
    <Skeleton className="h-9 w-56" /><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" />
  </main>;

  if (!bundle) return <main dir="rtl" className="mx-auto w-full max-w-3xl space-y-5 p-4 pt-10 md:p-8" data-testid="status-session-not-found">
    <Button variant="ghost" onClick={() => setLocation('/journal/sessions')} className="gap-2" data-testid="button-back-sessions"><ArrowRight className="h-4 w-4" />همهٔ سشن‌ها</Button>
    <Card className="border-destructive/30"><CardContent className="flex flex-col items-center gap-3 p-8 text-center">
      <CircleAlert className="h-8 w-8 text-destructive" /><h1 className="font-semibold">دسترسی به سشن ممکن نیست</h1><p className="text-sm text-muted-foreground">{loadError || 'اطلاعاتی برای نمایش وجود ندارد.'}</p>
      <Button variant="outline" onClick={() => void reload()} data-testid="button-retry-session-detail">تلاش دوباره</Button>
    </CardContent></Card>
  </main>;

  const metricItems = [
    { label: 'معامله', value: metrics?.totalTrades ?? 0 },
    { label: 'برد', value: metrics?.wins ?? 0, tone: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'باخت', value: metrics?.losses ?? 0, tone: 'text-rose-700 dark:text-rose-300' },
    { label: 'نرخ برد', value: metrics?.winRate == null ? '—' : `${money(metrics.winRate)}٪` },
    { label: 'خالص سود/زیان', value: metrics ? money(metrics.netPnl) : '—', tone: (metrics?.netPnl ?? 0) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300' },
    { label: 'میانگین R', value: metrics?.averageR == null ? '—' : `${money(metrics.averageR)}R` },
    { label: 'مجموع R', value: metrics?.totalR == null ? '—' : `${money(metrics.totalR)}R` },
    { label: 'تریگر / معامله', value: `${bundle.triggers.length} / ${bundle.trades.length}` },
  ];
  const directionName = (trade: Trade) => trade.direction === 'long' ? 'خرید' : 'فروش';

  return <main dir="rtl" className="tradermind-page-shell mx-auto w-full max-w-6xl space-y-5 p-4 pb-14 md:p-8" data-testid="page-journal-session-detail">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="ghost" className="gap-2 px-2 text-muted-foreground" onClick={() => setLocation('/journal/sessions')} data-testid="button-back-sessions"><ArrowRight className="h-4 w-4" />بازگشت به سشن‌ها</Button>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className="gap-2" onClick={() => setShowAnalysisPanel(open => !open)} data-testid="button-add-analysis"><LineChart className="h-4 w-4" />ثبت تحلیل</Button>
        <Button className="gap-2" onClick={() => setLocation(`/journal/trades/new?journalSessionId=${encodeURIComponent(sessionId)}`)} data-testid="button-start-session-trade"><Crosshair className="h-4 w-4" />ثبت معامله</Button>
      </div>
    </div>
    {showAnalysisPanel && <SessionAnalysisPanel sessionId={sessionId} options={bundleOptions} onClose={() => setShowAnalysisPanel(false)} onSaved={async () => { setShowAnalysisPanel(false); await reload(); }} />}

    <Card className="tradermind-card overflow-hidden" data-testid="card-session-overview">
      <div className="h-1 bg-gradient-to-l from-primary via-primary/45 to-transparent" />
      <CardContent className="p-5 md:p-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={bundle.session.status === 'active' ? 'default' : 'secondary'} data-testid="status-session-detail">{statusName(bundle.session.status)}</Badge>
              {sessionType && <Badge variant="outline" data-testid="text-session-type">{sessionType}</Badge>}
              {parseJournalArray(bundle.session.tags).map((tag, index) => <Badge key={`${tag}-${index}`} variant="outline" className="text-muted-foreground">{tag}</Badge>)}
            </div>
            <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{parseJournalArray(bundle.session.symbols).join(' / ') || 'سشن بدون نماد'}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span data-testid="text-session-account">{accountName}</span><span>·</span><span data-testid="text-session-box">{box?.name ?? 'باکس در دسترس نیست'}</span><span>·</span><span data-testid="text-session-strategy">{bundle.strategyVersion?.strategyName ?? bundle.strategy?.name ?? 'استراتژی در دسترس نیست'}</span>
                {bundle.strategyVersion && <span className="font-mono text-[11px]">نسخه {bundle.strategyVersion.versionNumber}</span>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" /><span data-testid="text-session-start-time">{localDate(bundle.session.startTime)}</span>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-8">
          {metricItems.map(item => <div key={item.label} className="rounded-lg border border-border/70 bg-background/60 px-3 py-3" data-testid={`metric-session-${item.label}`}>
            <div className="text-[11px] text-muted-foreground">{item.label}</div><div className={`mt-1 font-mono text-lg font-semibold ${item.tone ?? ''}`}>{item.value}</div>
          </div>)}
        </div>
      </CardContent>
    </Card>

    <Card className="tradermind-card" data-testid="card-pre-trade-psychology">
      <div className="border-b border-border/70 px-5 py-3"><h2 className="font-semibold">روانشناسی پیش از شروع سشن</h2><p className="mt-0.5 text-xs text-muted-foreground">فقط یک بار برای کل سشن ثبت می‌شود؛ در فرم معامله دوباره پرسیده نمی‌شود.</p></div>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {safeOptions(bundleOptions, 'psychology').map(option => {
            const on = psychDraft.optionIds.includes(option.id);
            return <button key={option.id} type="button" aria-pressed={on} onClick={() => setPsychDraft(current => ({ ...current, optionIds: on ? current.optionIds.filter(x => x !== option.id) : [...current.optionIds, option.id] }))}
              className={`rounded-md border px-2 py-1 text-[11px] ${on ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`} data-testid={`toggle-psychology-${option.id}`}>{option.label}</button>;
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <div className="space-y-1.5"><Label className="text-xs">شدت (۰ تا ۱۰)</Label><Input type="number" min={0} max={10} value={psychDraft.intensity} onChange={event => setPsychDraft(current => ({ ...current, intensity: Math.min(10, Math.max(0, Number(event.target.value) || 0)) }))} data-testid="input-psychology-intensity" /></div>
          <div className="space-y-1.5"><Label className="text-xs">یادداشت</Label><Input value={psychDraft.notes} onChange={event => setPsychDraft(current => ({ ...current, notes: event.target.value }))} placeholder="قبل از شروع چه حسی داشتم؟" data-testid="input-psychology-notes" /></div>
          <Button onClick={() => void savePsychology()} disabled={saving} className="gap-2" data-testid="button-save-psychology"><Save className="h-4 w-4" />ذخیره</Button>
        </div>
      </CardContent>
    </Card>

    <section className="space-y-3" aria-labelledby="timeline-heading" data-testid="section-session-timeline">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-medium tracking-[0.18em] text-primary">SESSION TIMELINE</p><h2 id="timeline-heading" className="mt-1 text-xl font-semibold">تایم‌لاین سشن</h2></div><span className="text-xs text-muted-foreground">{bundle.analyses.length} تحلیل · {bundle.triggers.length} تریگر · {bundle.trades.length} معامله</span></div>
      {timeline.length === 0 ? <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground" data-testid="empty-session-timeline">هنوز رویدادی ثبت نشده است. با «ثبت تحلیل» شروع کنید.</CardContent></Card> : (
        <ol className="space-y-2 border-r-2 border-border/70 pr-4">
          {timeline.map(item => {
            const when = <span className="text-[10px] text-muted-foreground">{localDate(item.at)}</span>;
            if (item.kind === 'analysis') {
              const a = item.analysis;
              return <li key={item.id} data-testid={`timeline-analysis-${a.id}`}><Card className="tradermind-card"><CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge>{optionLabel(a.timeframeOptionId) ?? 'تایم‌فریم'}</Badge><span className="text-sm font-semibold">تحلیل</span>{when}</div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label="حذف تحلیل" onClick={() => void removeAnalysis(a.id)} data-testid={`button-delete-analysis-${a.id}`}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  {optionLabel(a.directionOptionId) && <Badge variant="outline">جهت: {optionLabel(a.directionOptionId)}</Badge>}
                  {optionLabel(a.marketStructureOptionId) && <Badge variant="outline">ساختار: {optionLabel(a.marketStructureOptionId)}</Badge>}
                  {parseJournalArray(a.liquidityContextOptionIds).map(id => <Badge key={id} variant="outline">{optionLabel(id) ?? 'نقدینگی'}</Badge>)}
                </div>
                {a.analysisText && <p className="whitespace-pre-wrap text-xs leading-5">{a.analysisText}</p>}
                {a.scenario && <p className="text-xs leading-5"><span className="font-medium">سناریو: </span>{a.scenario}</p>}
                {a.marketContext && <p className="text-xs leading-5 text-muted-foreground"><span className="font-medium">زمینه بازار: </span>{a.marketContext}</p>}
                {(a.notes || a.zones) && <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{[a.zones, a.notes].filter(Boolean).join(' — ')}</p>}
                {item.media.length > 0 && <div className="flex flex-wrap gap-2">{item.media.map(m => <MediaThumb key={m.id} item={m} onDelete={() => void removeMedia(m.id)} disabled={busyMediaId === m.id} />)}</div>}
              </CardContent></Card></li>;
            }
            if (item.kind === 'trigger') {
              const t = item.trigger;
              return <li key={item.id} data-testid={`timeline-trigger-${t.id}`}><Card className="tradermind-card border-amber-500/30"><CardContent className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{optionLabel(t.timeframeOptionId) ?? '1M'}</Badge><span className="text-sm font-semibold">تریگر ورود</span>{optionLabel(t.triggerTypeOptionId) && <Badge variant="outline">{optionLabel(t.triggerTypeOptionId)}</Badge>}<Badge variant="outline">{t.status === 'traded' ? 'معامله شد' : t.status === 'skipped' ? 'نادیده گرفته شد' : t.status === 'invalid' ? 'نامعتبر' : t.status === 'confirmed' ? 'تأییدشده' : 'در انتظار'}</Badge>{when}</div>
                {t.marketMovement && <p className="text-xs leading-5"><span className="font-medium">حرکت بازار: </span>{t.marketMovement}</p>}
                {t.entryReason && <p className="text-xs leading-5"><span className="font-medium">دلیل ورود: </span>{t.entryReason}</p>}
                {t.confirmation && <p className="text-xs leading-5 text-muted-foreground"><span className="font-medium">تأیید: </span>{t.confirmation}</p>}
                {item.media.length > 0 && <div className="flex flex-wrap gap-2">{item.media.map(m => <MediaThumb key={m.id} item={m} onDelete={() => void removeMedia(m.id)} disabled={busyMediaId === m.id} />)}</div>}
                {!t.tradeId && (t.status === 'pending' || t.status === 'confirmed') && <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setLocation(`/journal/trades/new?journalSessionId=${encodeURIComponent(sessionId)}&analysisEventId=${encodeURIComponent(t.analysisEventId ?? '')}&triggerEventId=${encodeURIComponent(t.id)}`)} data-testid={`button-trade-from-trigger-${t.id}`}>ثبت معامله از این تریگر</Button>
                  <Button size="sm" variant="outline" onClick={() => void setTriggerStatus(t.id, 'skipped')}>نادیده گرفته شد</Button>
                  <Button size="sm" variant="outline" onClick={() => void setTriggerStatus(t.id, 'invalid')}>نامعتبر بود</Button>
                </div>}
              </CardContent></Card></li>;
            }
            if (item.kind === 'trade-open') {
              const tr = item.trade;
              return <li key={item.id} data-testid={`timeline-trade-${tr.id}`}><Link href={`/journal/trades/${tr.id}`} className="block"><Card className="tradermind-card border-primary/40 transition-colors hover:bg-muted/30"><CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex items-center gap-2"><Badge>معامله</Badge><span className="font-semibold">{tr.symbol}</span><Badge variant="outline">{directionName(tr)}</Badge>{when}</div>
                <span className="font-mono text-xs text-muted-foreground">ورود {tr.entryPrice}{tr.stopLoss ? ` · SL ${tr.stopLoss}` : ''}{tr.takeProfit ? ` · TP ${tr.takeProfit}` : ''}</span>
              </CardContent></Card></Link></li>;
            }
            if (item.kind === 'trade-result') {
              const tone = item.resultTone === 'win' ? 'text-emerald-700 dark:text-emerald-300' : item.resultTone === 'loss' ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground';
              return <li key={item.id} data-testid={`timeline-result-${item.trade.id}`} className="flex flex-wrap items-center gap-3 px-2 py-1 text-xs">
                <span className={`font-semibold ${tone}`}>نتیجه معامله: {item.resultLabel}</span>{when}
                <Link href={`/journal/trades/${item.trade.id}/journal`} className="text-primary underline-offset-2 hover:underline">مرور پس از معامله</Link>
              </li>;
            }
            return <li key={item.id} className="px-2 py-1 text-xs text-muted-foreground" data-testid={`timeline-event-${item.event.id}`}>{optionLabel(item.event.typeOptionId) ?? 'رویداد'} · {localDate(item.at)}{item.event.notes ? ` — ${item.event.notes}` : ''}</li>;
          })}
        </ol>
      )}
    </section>

    <section className="grid items-start gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Card className="tradermind-card" data-testid="card-session-review">
        <div className="border-b border-border/70 px-5 py-4"><h2 className="font-semibold">مرور و جمع‌بندی</h2><p className="mt-1 text-xs text-muted-foreground">یادداشت‌های سشن پس از پایان نیز در همین دستگاه می‌مانند.</p></div>
        <CardContent className="p-5">
          <form onSubmit={saveSession} className="space-y-4" data-testid="form-session-review">
            <div className="space-y-1.5"><Label htmlFor="edit-session-notes">یادداشت زمینهٔ سشن</Label><Textarea id="edit-session-notes" rows={3} value={sessionDraft.notes} onChange={event => setSessionDraft(current => ({ ...current, notes: event.target.value }))} data-testid="input-review-session-notes" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="review-lessons">درس‌های آموخته‌شده</Label><Textarea id="review-lessons" rows={3} value={sessionDraft.lessonsLearned} onChange={event => setSessionDraft(current => ({ ...current, lessonsLearned: event.target.value }))} data-testid="input-lessons-learned" /></div>
              <div className="space-y-1.5"><Label htmlFor="review-mistakes">مرور اشتباه‌ها</Label><Textarea id="review-mistakes" rows={3} value={sessionDraft.mistakesReview} onChange={event => setSessionDraft(current => ({ ...current, mistakesReview: event.target.value }))} data-testid="input-mistakes-review" /></div>
              <div className="space-y-1.5"><Label htmlFor="review-psych">مرور روان‌شناختی</Label><Textarea id="review-psych" rows={3} value={sessionDraft.psychologicalReview} onChange={event => setSessionDraft(current => ({ ...current, psychologicalReview: event.target.value }))} data-testid="input-psychological-review" /></div>
              <div className="space-y-1.5"><Label htmlFor="review-observations">مشاهدات استراتژی</Label><Textarea id="review-observations" rows={3} value={sessionDraft.strategyObservations} onChange={event => setSessionDraft(current => ({ ...current, strategyObservations: event.target.value }))} data-testid="input-strategy-observations" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="review-change-proposal">پیشنهاد تغییر استراتژی</Label><Textarea id="review-change-proposal" rows={2} value={sessionDraft.strategyChangeProposal} onChange={event => setSessionDraft(current => ({ ...current, strategyChangeProposal: event.target.value }))} data-testid="input-strategy-change-proposal" /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label className="text-xs">کیفیت سشن (۰ تا ۱۰)</Label><Input type="number" min={0} max={10} value={reviewExtra.sessionQuality} onChange={event => setReviewExtra(current => ({ ...current, sessionQuality: event.target.value }))} data-testid="input-session-quality" /></div>
              <div className="space-y-1.5"><Label className="text-xs">رعایت استراتژی</Label><Select value={reviewExtra.strategyCompliance} onValueChange={value => setReviewExtra(current => ({ ...current, strategyCompliance: value }))}><SelectTrigger data-testid="select-session-compliance"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">ثبت نشده</SelectItem><SelectItem value="yes">کامل</SelectItem><SelectItem value="partially">نسبی</SelectItem><SelectItem value="no">خیر</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">جمع‌بندی نهایی سشن</Label><Textarea rows={3} value={reviewExtra.finalReflection} onChange={event => setReviewExtra(current => ({ ...current, finalReflection: event.target.value }))} data-testid="input-final-reflection" /></div>
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full space-y-1.5 sm:max-w-52"><Label>وضعیت سشن</Label><Select value={sessionDraft.status} onValueChange={value => setSessionDraft(current => ({ ...current, status: value as typeof current.status }))}>
                <SelectTrigger data-testid="select-session-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">در جریان</SelectItem><SelectItem value="completed">تکمیل‌شده</SelectItem><SelectItem value="cancelled">لغوشده</SelectItem></SelectContent>
              </Select></div>
              <Button type="submit" disabled={saving} className="gap-2" data-testid="button-save-session-review"><Save className="h-4 w-4" />ذخیرهٔ مرور و وضعیت</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="tradermind-card" data-testid="card-no-trade-events">
          <div className="border-b border-border/70 px-4 py-3"><h2 className="font-semibold">رویدادهای بدون معامله</h2><p className="mt-1 text-xs text-muted-foreground">فرصت‌های دیده‌شده، ازدست‌رفته یا نامعتبر را ثبت کنید.</p></div>
          <CardContent className="space-y-4 p-4">
            {eventTypes.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground" data-testid="empty-event-types">نوع رویداد فعالی وجود ندارد؛ گزینهٔ غیرفعال به رویداد جدید تبدیل نمی‌شود.</div> : <form onSubmit={addEvent} className="space-y-3" data-testid="form-add-session-event">
              <div className="space-y-1.5"><Label className="text-xs">نوع رویداد</Label><Select value={eventType} onValueChange={setEventType}><SelectTrigger data-testid="select-event-type"><SelectValue placeholder="انتخاب نوع" /></SelectTrigger><SelectContent>{eventTypes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs">زمان</Label><Input type="datetime-local" value={eventTime} onChange={event => setEventTime(event.target.value)} data-testid="input-event-time" /></div>
              <Textarea rows={2} placeholder="چه دیدید و چرا معامله نکردید؟" value={eventNotes} onChange={event => setEventNotes(event.target.value)} data-testid="input-event-notes" />
              <Button size="sm" className="w-full gap-2" disabled={eventSaving || !eventType} data-testid="button-add-event"><Plus className="h-4 w-4" />ثبت رویداد</Button>
            </form>}
            <div className="space-y-2">
              {bundle.events.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground" data-testid="empty-session-events">هنوز رویدادی ثبت نشده است.</p> : bundle.events.map(event => <div key={event.id} className="flex items-start justify-between gap-2 rounded-lg border border-border/70 p-3" data-testid={`row-event-${event.id}`}>
                <div className="min-w-0"><div className="text-sm font-medium">{bundleOptions.find(option => option.id === event.typeOptionId)?.label ?? 'نوع حذف‌شده'}</div><div className="mt-1 text-[10px] text-muted-foreground">{localDate(event.eventAt)}</div>{event.notes && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{event.notes}</p>}</div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label="حذف رویداد" onClick={() => void removeEvent(event.id)} disabled={busyEventId === event.id} data-testid={`button-delete-event-${event.id}`}><Trash2 className="h-4 w-4" /></Button>
              </div>)}
            </div>
          </CardContent>
        </Card>

        <Card className="tradermind-card" data-testid="card-session-media">
          <div className="border-b border-border/70 px-4 py-3"><h2 className="font-semibold">فایل‌های پشتیبان</h2><p className="mt-1 text-xs text-muted-foreground">تصویر، ویدیو و فایل‌های دیگر در دیتابیس محلی ذخیره می‌شوند.</p></div>
          <CardContent className="space-y-4 p-4">
            <form onSubmit={addMedia} className="space-y-3" data-testid="form-add-session-media">
              <div className="space-y-1.5"><Label htmlFor="session-media-file" className="text-xs">فایل</Label><Input id="session-media-file" type="file" onChange={event => setFile(event.target.files?.[0] ?? null)} data-testid="input-session-media-file" /></div>
              <div className="space-y-1.5"><Label className="text-xs">اتصال به</Label><Select value={attachmentAnalysisId} onValueChange={setAttachmentAnalysisId}><SelectTrigger data-testid="select-media-target"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="session">خود سشن</SelectItem>{analyses.map(analysis => <SelectItem key={analysis.id} value={analysis.id}>{bundleOptions.find(option => option.id === analysis.timeframeOptionId)?.label ?? 'تحلیل تایم‌فریم'}</SelectItem>)}</SelectContent></Select></div>
              <Input placeholder="شرح کوتاه فایل (اختیاری)" value={fileCaption} onChange={event => setFileCaption(event.target.value)} data-testid="input-media-caption" />
              <Button type="submit" variant="outline" className="w-full gap-2" disabled={mediaSaving || !file} data-testid="button-save-media"><Paperclip className="h-4 w-4" />{mediaSaving ? 'در حال ذخیره…' : 'افزودن پیوست'}</Button>
            </form>
            {media.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground" data-testid="empty-session-media">هنوز فایلی به سشن وصل نشده است.</div> : <div className="space-y-2">
              {media.map(item => {
                const attachedAnalysis = item.analysisId ? analyses.find(analysis => analysis.id === item.analysisId) : undefined;
                const Icon = item.mimeType.startsWith('image/') ? ImageIcon : item.mimeType.startsWith('video/') ? Film : FilePlus2;
                return <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3" data-testid={`row-media-${item.id}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  <button type="button" className="min-w-0 flex-1 text-right" onClick={() => openMedia(item)} data-testid={`button-open-media-${item.id}`}><span className="block truncate text-sm font-medium">{item.fileName}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{item.caption || (attachedAnalysis ? bundleOptions.find(option => option.id === attachedAnalysis.timeframeOptionId)?.label : 'پیوست سشن')}</span></button>
                  <Button variant="ghost" size="icon" aria-label="حذف پیوست" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void removeMedia(item.id)} disabled={busyMediaId === item.id} data-testid={`button-delete-media-${item.id}`}><Trash2 className="h-4 w-4" /></Button>
                </div>;
              })}
            </div>}
          </CardContent>
        </Card>
      </div>
    </section>

    <section className="space-y-3" aria-labelledby="linked-trades-heading">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-medium tracking-[0.18em] text-primary">EXECUTION LOG</p><h2 id="linked-trades-heading" className="mt-1 text-xl font-semibold">معاملات متصل</h2></div><Badge variant="outline" data-testid="text-linked-trade-count">{bundle.trades.length} معامله</Badge></div>
      {bundle.trades.length === 0 ? <Card className="border-dashed bg-card/50" data-testid="empty-linked-trades"><CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <Target className="h-7 w-7 text-muted-foreground/70" /><h3 className="font-semibold">هنوز معامله‌ای به این سشن وصل نیست</h3><p className="max-w-md text-sm leading-6 text-muted-foreground">وقتی آمادهٔ اجرا هستید، فرم ثبت معامله را از اینجا باز کنید تا پیوند سشن حفظ شود.</p>
        <Button onClick={() => setLocation(`/journal/trades/new?journalSessionId=${encodeURIComponent(sessionId)}`)} className="gap-2" data-testid="button-first-linked-trade"><Plus className="h-4 w-4" />شروع ثبت معامله</Button>
      </CardContent></Card> : <Card className="tradermind-card overflow-hidden">
        <div className="divide-y divide-border/70">{bundle.trades.map(trade => {
          const resultLabel = trade.status === 'open' ? 'باز' : trade.result === 'win' || trade.result === 'partial-win' ? 'سود' : trade.result === 'loss' || trade.result === 'partial-loss' ? 'زیان' : trade.result === 'cancelled' ? 'لغوشده' : 'سر به سر';
          const pnl = trade.profitLoss;
          return <div key={trade.id} className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5" data-testid={`row-linked-trade-${trade.id}`}>
            <Link href={`/journal/trades/${trade.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4 py-1" data-testid={`link-linked-trade-${trade.id}`}>
              <span className="flex min-w-0 items-center gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${trade.direction === 'long' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>{trade.direction === 'long' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}</span>
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 font-semibold"><span>{trade.symbol}</span><Badge variant="outline" className="text-[10px]">{directionName(trade)}</Badge><Badge variant={trade.status === 'open' ? 'secondary' : 'outline'} className="text-[10px]">{resultLabel}</Badge></span><span className="mt-1 block text-xs text-muted-foreground">{localDate(trade.openedAt)}{trade.rMultiple != null ? ` · ${money(trade.rMultiple)}R` : ''}</span></span>
              </span>
              <span className={`shrink-0 text-left font-mono text-sm font-semibold ${pnl == null ? 'text-muted-foreground' : pnl >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{pnl == null ? '—' : money(pnl)}</span>
            </Link>
            <Link href={`/journal/trades/${trade.id}/journal`} className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5" data-testid={`link-trade-review-${trade.id}`}>مرور ژورنال</Link>
          </div>;
        })}</div>
      </Card>}
    </section>
    <div className="flex items-center gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" />سوابق سشن و پیوست‌ها روی همین دستگاه نگهداری می‌شوند.</div>
  </main>;
}
