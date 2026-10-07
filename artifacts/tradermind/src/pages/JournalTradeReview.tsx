import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, FilePlus2, Save, Trash2 } from 'lucide-react';
import { useRoute, useLocation } from 'wouter';
import { toast } from 'sonner';
import type { JournalMedia, JournalOption, JournalTradeData, StrategyVersion, Trade } from '../db/database';
import { db } from '../db/database';
import { journalSessionService, parseJournalArray, parsePreTradePsychology } from '../services/journalSessionService';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

type PsychologyPhase = { optionIds: string[]; intensity: number };
type Psychology = { before: PsychologyPhase; during: PsychologyPhase; after: PsychologyPhase };
type ChecklistResults = Record<string, boolean>;

const emptyPhase = (): PsychologyPhase => ({ optionIds: [], intensity: 0 });
const emptyPsychology = (): Psychology => ({ before: emptyPhase(), during: emptyPhase(), after: emptyPhase() });
const blankMeta = (tradeId: string, sessionId: string): Omit<JournalTradeData, 'id' | 'createdAt' | 'updatedAt'> => ({
  tradeId,
  journalSessionId: sessionId,
  entryTriggerOptionIds: '[]',
  entryReasonOptionId: null,
  exitReasonOptionId: null,
  setupTypeOptionId: null,
  setupGradeOptionId: null,
  scoTypeOptionId: null,
  fvgTypeOptionId: null,
  checklistResults: '{}',
  psychology: JSON.stringify(emptyPsychology()),
  mistakeOptionIds: '[]',
  strategyCompliance: null,
  violatedRuleIds: '[]',
  setupQuality: null,
  executionQuality: null,
  scenarioOutcome: null,
  scenarioOutcomeNotes: '',
  lesson: '',
  finalReflection: '',
  reviewTagOptionIds: '[]',
  whatHappened: '',
  entryValid: null,
  slRespected: null,
  managementCorrect: null,
  emotionalReaction: '',
  tradeQuality: null,
  riskManagementQuality: null,
});

function parseObject<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function MediaAttachment({ item, onDelete }: { item: JournalMedia; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const nextUrl = URL.createObjectURL(item.blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [item.blob]);

  return (
    <div className="flex items-center gap-3 rounded-md border p-3" data-testid={`card-journal-media-${item.id}`}>
      {item.mimeType.startsWith('image/') && url ? (
        <img src={url} alt={item.caption || item.fileName} className="h-12 w-16 rounded object-cover" />
      ) : <FilePlus2 className="h-5 w-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        {url ? <a href={url} download={item.fileName} className="block truncate text-sm font-medium hover:underline">{item.fileName}</a> : <p className="truncate text-sm">{item.fileName}</p>}
        <p className="text-xs text-muted-foreground">{item.category} · {(item.blob.size / 1024).toFixed(0)} KB</p>
      </div>
      <Button type="button" data-testid={`button-delete-journal-media-${item.id}`} variant="ghost" size="icon" onClick={onDelete} aria-label="حذف فایل">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export default function JournalTradeReview() {
  const [, params] = useRoute('/journal/trades/:id/journal');
  const [, setLocation] = useLocation();
  const tradeId = params?.id ?? '';
  const [trade, setTrade] = useState<Trade | null>(null);
  const [meta, setMeta] = useState<Omit<JournalTradeData, 'id' | 'createdAt' | 'updatedAt'> | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [options, setOptions] = useState<JournalOption[]>([]);
  const [rules, setRules] = useState<Array<{ id: string; title: string }>>([]);
  const [media, setMedia] = useState<JournalMedia[]>([]);
  const [fileCategory, setFileCategory] = useState<JournalMedia['category']>('entry');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof journalSessionService.getTradeContext>>>();
  const [reviewId, setReviewId] = useState('');

  const load = useCallback(async () => {
    if (!tradeId) return;
    setLoading(true);
    try {
      await journalSessionService.ensureDefaultOptions();
      const found = await db.trades.get(tradeId);
      if (!found?.journalSessionId) {
        toast.error('این معامله به ژورنال سشنی وصل نیست.');
        setLocation('/journal/trades');
        return;
      }
      const [session, version, previous, allOptions, attachments] = await Promise.all([
        db.journalSessions.get(found.journalSessionId),
        db.strategyVersions.get((await db.journalSessions.get(found.journalSessionId))?.strategyVersionId ?? ''),
        db.journalTradeData.where('tradeId').equals(found.id).first(),
        journalSessionService.getOptions(undefined, true),
        db.journalMedia.where('tradeId').equals(found.id).sortBy('createdAt'),
      ]);
      if (!session) throw new Error('سشن معاملاتی این معامله پیدا نشد.');
      const symbols = parseJournalArray(session.symbols);
      setTrade(found);
      setSessionTitle(`${symbols.join(', ') || found.symbol} · ${new Date(session.startTime).toLocaleDateString()}`);
      setOptions(allOptions);
      setMedia(attachments);
      // تمام فیلدهای مرور (از جمله درس، نتیجهٔ سناریو و جمع‌بندی) حفظ می‌شوند؛ نه فقط فیلدهای قدیمی
      setReviewId(previous?.id ?? found.id);
      setCtx(await journalSessionService.getTradeContext(found.id));
      setMeta(previous
        ? (({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest)(previous)
        : blankMeta(found.id, found.journalSessionId));
      setRules(snapshotRules(version));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'بارگذاری مرور معامله ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [setLocation, tradeId]);

  useEffect(() => { void load(); }, [load]);

  const byCategory = useMemo(() => {
    const result = new Map<string, JournalOption[]>();
    for (const option of options) result.set(option.category, [...(result.get(option.category) ?? []), option]);
    for (const entries of result.values()) entries.sort((a, b) => a.sortOrder - b.sortOrder);
    return result;
  }, [options]);

  const selectedList = (key: 'entryTriggerOptionIds' | 'mistakeOptionIds', optionId: string) => {
    if (!meta) return;
    const current = parseJournalArray(meta[key]);
    const next = current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId];
    setMeta({ ...meta, [key]: JSON.stringify(next) });
  };

  const toggleChecklist = (optionId: string) => {
    if (!meta) return;
    const checklist = parseObject<ChecklistResults>(meta.checklistResults, {});
    setMeta({ ...meta, checklistResults: JSON.stringify({ ...checklist, [optionId]: !checklist[optionId] }) });
  };

  const changePsychology = (phase: keyof Psychology, patch: Partial<PsychologyPhase>) => {
    if (!meta) return;
    const current = parseObject<Psychology>(meta.psychology, emptyPsychology());
    const updated: Psychology = { ...current, [phase]: { ...emptyPhase(), ...current[phase], ...patch } };
    setMeta({ ...meta, psychology: JSON.stringify(updated) });
  };

  const togglePsychology = (phase: keyof Psychology, optionId: string) => {
    if (!meta) return;
    const current = parseObject<Psychology>(meta.psychology, emptyPsychology())[phase];
    const optionIds = current.optionIds.includes(optionId)
      ? current.optionIds.filter(id => id !== optionId)
      : [...current.optionIds, optionId];
    changePsychology(phase, { optionIds });
  };

  const save = async () => {
    if (!meta || !trade) return;
    const checklist = parseObject<ChecklistResults>(meta.checklistResults, {});
    const missingRequired = (byCategory.get('checklist') ?? [])
      .filter(option => option.enabled && option.required && !checklist[option.id]);
    if (missingRequired.length) {
      toast.error(`موارد اجباری چک‌لیست را تأیید کنید: ${missingRequired.map(item => item.label).join('، ')}`);
      return;
    }
    setSaving(true);
    try {
      // نوع تریگر ثبت‌شده در رویداد تریگر برای فیلترهای تحلیلی هم‌گام می‌شود (بدون پرسش دوباره از کاربر)
      const triggerType = ctx?.trigger?.triggerTypeOptionId;
      const triggerList = parseJournalArray(meta.entryTriggerOptionIds);
      const next = triggerType && !triggerList.includes(triggerType)
        ? { ...meta, entryTriggerOptionIds: JSON.stringify([...triggerList, triggerType]) }
        : meta;
      await journalSessionService.saveTradeData(next);
      toast.success('مرور ژورنال معامله ذخیره شد.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ذخیره مرور معامله ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file || !trade) return;
    try {
      const attachment = await journalSessionService.saveMedia({
        sessionId: trade.journalSessionId,
        tradeId: trade.id,
        reviewId: fileCategory === 'review' ? reviewId : null,
        category: fileCategory,
        file,
      });
      setMedia(current => [...current, attachment]);
      toast.success('فایل به معامله پیوست شد.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'افزودن فایل ناموفق بود.');
    }
  };

  const deleteAttachment = async (item: JournalMedia) => {
    await journalSessionService.deleteMedia(item.id);
    setMedia(current => current.filter(entry => entry.id !== item.id));
  };

  if (loading) return <p className="p-8 text-center text-sm text-muted-foreground" data-testid="status-journal-trade-loading">در حال بارگذاری مرور معامله…</p>;
  if (!trade || !meta) return <p className="p-8 text-center text-sm text-muted-foreground" data-testid="status-journal-trade-missing">معامله پیدا نشد.</p>;

  const triggerIds = parseJournalArray(meta.entryTriggerOptionIds);
  const mistakeIds = parseJournalArray(meta.mistakeOptionIds);
  const checklist = parseObject<ChecklistResults>(meta.checklistResults, {});
  const psychology = parseObject<Psychology>(meta.psychology, emptyPsychology());
  const selectedRules = parseJournalArray(meta.violatedRuleIds);

  const multiOptions = (
    category: string,
    selected: string[],
    onToggle: (id: string) => void,
  ) => {
    const categoryOptions = byCategory.get(category) ?? [];
    return categoryOptions.length ? (
      <div className="grid gap-2 sm:grid-cols-2">
        {categoryOptions.map(option => (
          <label key={option.id} className={`flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${option.enabled ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed opacity-60'}`}>
            <input type="checkbox" data-testid={`checkbox-journal-${category}-${option.id}`} checked={selected.includes(option.id)} disabled={!option.enabled && !selected.includes(option.id)} onChange={() => onToggle(option.id)} />
            <span>{option.label}</span>
            {!option.enabled && <span className="text-xs text-muted-foreground">(بایگانی)</span>}
          </label>
        ))}
      </div>
    ) : <p className="text-xs text-muted-foreground">گزینه‌ای تعریف نشده است.</p>;
  };

  const singleOptionSelect = (
    key: 'entryReasonOptionId' | 'exitReasonOptionId' | 'setupTypeOptionId' | 'setupGradeOptionId' | 'scoTypeOptionId' | 'fvgTypeOptionId',
    category: string,
    label: string,
  ) => {
    const categoryOptions = byCategory.get(category) ?? [];
    return (
      <label className="space-y-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <Select value={meta[key] ?? '__none__'} onValueChange={value => setMeta({ ...meta, [key]: value === '__none__' ? null : value })}>
          <SelectTrigger data-testid={`select-journal-${key}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">انتخاب نشده</SelectItem>
            {categoryOptions.filter(option => option.enabled || option.id === meta[key]).map(option => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 pb-24" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => setLocation(`/journal/sessions/${trade.journalSessionId}`)} aria-label="بازگشت به سشن">
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-journal-trade-review-title">مرور ژورنال معامله</h1>
            <p className="mt-1 text-sm text-muted-foreground">{trade.symbol} · {sessionTitle}</p>
          </div>
        </div>
        <Button data-testid="button-save-journal-trade-review" className="gap-2" disabled={saving} onClick={() => void save()}>
          <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره…' : 'ذخیره مرور'}
        </Button>
      </header>

      {ctx?.session && (
        <Card className="border-primary/20 bg-primary/5" data-testid="card-review-context-summary">
          <CardHeader><CardTitle className="text-base">خلاصهٔ زمینه <span className="text-xs font-normal text-muted-foreground">(فقط‌خواندنی)</span></CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{ctx.strategyVersion?.strategyName ?? ctx.strategy?.name ?? 'استراتژی'}</Badge>
              {ctx.analysis && <Badge>{options.find(o => o.id === ctx.analysis?.timeframeOptionId)?.label ?? 'تحلیل'}</Badge>}
              {ctx.trigger && <Badge variant="secondary">تریگر: {options.find(o => o.id === ctx.trigger?.triggerTypeOptionId)?.label ?? 'ثبت‌شده'}</Badge>}
            </div>
            {parsePreTradePsychology(ctx.session.preTradePsychology).optionIds.length > 0 && (
              <p className="text-xs text-muted-foreground">روانشناسی پیش از سشن: {parsePreTradePsychology(ctx.session.preTradePsychology).optionIds.map(id => options.find(o => o.id === id)?.label).filter(Boolean).join('، ')}</p>
            )}
            {ctx.analysis?.scenario && <p className="text-xs"><span className="font-medium">سناریوی مورد انتظار: </span>{ctx.analysis.scenario}</p>}
            {ctx.trigger?.entryReason && <p className="text-xs"><span className="font-medium">دلیل ورود: </span>{ctx.trigger.entryReason}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">ستاپ و ورود</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {singleOptionSelect('entryReasonOptionId', 'entry_reason', 'دلیل ورود')}
            {singleOptionSelect('setupTypeOptionId', 'setup_type', 'نوع ستاپ')}
            {singleOptionSelect('setupGradeOptionId', 'setup_grade', 'درجه ستاپ')}
            {singleOptionSelect('exitReasonOptionId', 'exit_reason', 'دلیل خروج')}
            {singleOptionSelect('scoTypeOptionId', 'sco_type', 'نوع SCO')}
            {singleOptionSelect('fvgTypeOptionId', 'fvg_type', 'نوع FVG')}
          </div>
          {!ctx?.trigger && <div className="space-y-2"><h2 className="text-sm font-medium">تریگرهای ورود</h2>{multiOptions('entry_trigger', triggerIds, id => selectedList('entryTriggerOptionIds', id))}</div>}
          <div className="space-y-2">
            <h2 className="text-sm font-medium">چک‌لیست ورود</h2>
            {(byCategory.get('checklist') ?? []).length === 0 ? <p className="text-xs text-muted-foreground">گزینه‌ای تعریف نشده است.</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(byCategory.get('checklist') ?? []).map(option => (
                  <label key={option.id} className={`flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm ${option.enabled ? 'cursor-pointer' : 'opacity-60'}`}>
                    <input type="checkbox" data-testid={`checkbox-journal-checklist-${option.id}`} checked={Boolean(checklist[option.id])} disabled={!option.enabled && !checklist[option.id]} onChange={() => toggleChecklist(option.id)} />
                    {option.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">رعایت استراتژی و کیفیت</CardTitle>
          <CardDescription>کیفیت ستاپ و کیفیت اجرای معامله مستقل از نتیجه ثبت می‌شوند.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block max-w-sm space-y-1.5 text-sm">
            <span className="text-muted-foreground">آیا استراتژی رعایت شد؟</span>
            <Select value={meta.strategyCompliance ?? '__none__'} onValueChange={value => setMeta({ ...meta, strategyCompliance: value === '__none__' ? null : value as JournalTradeData['strategyCompliance'] })}>
              <SelectTrigger data-testid="select-strategy-compliance"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">انتخاب نشده</SelectItem>
                <SelectItem value="yes">بله</SelectItem>
                <SelectItem value="partially">تاحدی</SelectItem>
                <SelectItem value="no">خیر</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {meta.strategyCompliance && meta.strategyCompliance !== 'yes' && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">قوانین نقض‌شده از نسخه استفاده‌شده</h2>
              {rules.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {rules.map(rule => (
                    <label key={rule.id} className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
                      <input
                        type="checkbox"
                        data-testid={`checkbox-violated-rule-${rule.id}`}
                        checked={selectedRules.includes(rule.id)}
                        onChange={() => {
                          const next = selectedRules.includes(rule.id) ? selectedRules.filter(id => id !== rule.id) : [...selectedRules, rule.id];
                          setMeta({ ...meta, violatedRuleIds: JSON.stringify(next) });
                        }}
                      />
                      {rule.title}
                    </label>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">در نسخه ثبت‌شده قانونی ذخیره نشده است.</p>}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ['setupQuality', 'کیفیت ستاپ'],
              ['executionQuality', 'کیفیت اجرا'],
            ] as const).map(([key, label]) => (
              <label key={key} className="space-y-1.5 text-sm">
                <span className="text-muted-foreground">{label} (۰ تا ۱۰)</span>
                <Input
                  data-testid={`input-${key}`}
                  type="number" min="0" max="10" step="1"
                  value={meta[key] ?? ''}
                  onChange={event => {
                    const value = event.target.value === '' ? null : Math.min(10, Math.max(0, Number(event.target.value)));
                    setMeta({ ...meta, [key]: value });
                  }}
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">روانشناسی</CardTitle><CardDescription>روانشناسی پیش از شروع در خود سشن ثبت شده و اینجا دوباره پرسیده نمی‌شود.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {([
            ['during', 'حین ورود و مدیریت معامله'],
            ['after', 'پس از معامله'],
          ] as const).map(([phase, label]) => (
            <section key={phase} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium">{label}</h2>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  شدت (۰ تا ۱۰)
                  <Input
                    data-testid={`input-psychology-intensity-${phase}`}
                    className="h-8 w-20"
                    type="number" min="0" max="10" step="1"
                    value={psychology[phase].intensity}
                    onChange={event => changePsychology(phase, { intensity: Math.min(10, Math.max(0, Number(event.target.value) || 0)) })}
                  />
                </label>
              </div>
              {multiOptions('psychology', psychology[phase].optionIds, id => togglePsychology(phase, id))}
            </section>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">اشتباه‌ها</CardTitle></CardHeader>
        <CardContent>{multiOptions('mistake', mistakeIds, id => selectedList('mistakeOptionIds', id))}</CardContent>
      </Card>

      <Card data-testid="card-post-trade-review">
        <CardHeader><CardTitle className="text-base">مرور پس از معامله</CardTitle><CardDescription>فقط آنچه بعد از معامله مشخص می‌شود.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><span className="text-sm text-muted-foreground">چه اتفاقی افتاد؟</span>
            <Textarea rows={3} value={meta.whatHappened ?? ''} onChange={e => setMeta({ ...meta, whatHappened: e.target.value })} data-testid="input-review-what-happened" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['entryValid', 'آیا ورود معتبر بود؟'], ['slRespected', 'آیا حد ضرر رعایت شد؟'], ['managementCorrect', 'آیا مدیریت معامله درست بود؟']] as const).map(([key, label]) => (
              <label key={key} className="space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span>
                <Select value={meta[key] ?? '__none__'} onValueChange={value => setMeta({ ...meta, [key]: value === '__none__' ? null : value as 'yes' | 'partially' | 'no' })}>
                  <SelectTrigger data-testid={`select-review-${key}`}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">ثبت نشده</SelectItem><SelectItem value="yes">بله</SelectItem><SelectItem value="partially">تا حدی</SelectItem><SelectItem value="no">خیر</SelectItem></SelectContent>
                </Select></label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['tradeQuality', 'کیفیت معامله (۰ تا ۱۰)'], ['riskManagementQuality', 'مدیریت ریسک (۰ تا ۱۰)']] as const).map(([key, label]) => (
              <label key={key} className="space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span>
                <Input type="number" min="0" max="10" value={meta[key] ?? ''} data-testid={`input-review-${key}`}
                  onChange={e => setMeta({ ...meta, [key]: e.target.value === '' ? null : Math.min(10, Math.max(0, Number(e.target.value) || 0)) })} /></label>
            ))}
          </div>
          <div className="space-y-1.5"><span className="text-sm text-muted-foreground">واکنش احساسی</span>
            <Textarea rows={2} value={meta.emotionalReaction ?? ''} onChange={e => setMeta({ ...meta, emotionalReaction: e.target.value })} data-testid="input-review-emotional-reaction" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm"><span className="text-muted-foreground">نتیجهٔ سناریوی تحلیل</span>
              <Select value={meta.scenarioOutcome ?? '__none__'} onValueChange={value => setMeta({ ...meta, scenarioOutcome: value === '__none__' ? null : value as NonNullable<JournalTradeData['scenarioOutcome']> })}>
                <SelectTrigger data-testid="select-review-scenario-outcome"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">ثبت نشده</SelectItem><SelectItem value="played-out">طبق سناریو پیش رفت</SelectItem><SelectItem value="partially">نسبتاً</SelectItem><SelectItem value="failed">شکست خورد</SelectItem><SelectItem value="invalidated">باطل شد</SelectItem></SelectContent>
              </Select></label>
            <div className="space-y-1.5"><span className="text-sm text-muted-foreground">توضیح نتیجهٔ سناریو</span>
              <Input value={meta.scenarioOutcomeNotes ?? ''} onChange={e => setMeta({ ...meta, scenarioOutcomeNotes: e.target.value })} data-testid="input-review-scenario-notes" /></div>
          </div>
          <div className="space-y-2"><h2 className="text-sm font-medium">برچسب‌های مرور</h2>
            {multiOptions('tag', parseJournalArray(meta.reviewTagOptionIds), id => {
              const list = parseJournalArray(meta.reviewTagOptionIds);
              setMeta({ ...meta, reviewTagOptionIds: JSON.stringify(list.includes(id) ? list.filter(x => x !== id) : [...list, id]) });
            })}</div>
          <div className="space-y-1.5"><span className="text-sm text-muted-foreground">درس معامله</span>
            <Textarea rows={3} value={meta.lesson ?? ''} onChange={e => setMeta({ ...meta, lesson: e.target.value })} data-testid="input-review-lesson" /></div>
          <div className="space-y-1.5"><span className="text-sm text-muted-foreground">جمع‌بندی نهایی</span>
            <Textarea rows={3} value={meta.finalReflection ?? ''} onChange={e => setMeta({ ...meta, finalReflection: e.target.value })} data-testid="input-review-final-reflection" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">رسانه و فایل‌ها</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fileCategory} onValueChange={value => setFileCategory(value as JournalMedia['category'])}>
              <SelectTrigger className="w-48" data-testid="select-trade-media-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="before-entry">پیش از ورود</SelectItem>
                <SelectItem value="entry">ورود</SelectItem>
                <SelectItem value="during-trade">حین معامله</SelectItem>
                <SelectItem value="after-exit">پس از خروج</SelectItem>
                <SelectItem value="review">مرور (تصویر/ویدیوی تحلیل پس از معامله)</SelectItem>
              </SelectContent>
            </Select>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
              <FilePlus2 className="h-4 w-4" /> افزودن تصویر، ویدیو یا فایل
              <input data-testid="input-journal-trade-media" type="file" className="sr-only" onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ''; }} />
            </label>
          </div>
          {media.length === 0 ? <p className="text-xs text-muted-foreground">فایلی پیوست نشده است.</p> : (
            <div className="space-y-2">{media.map(item => <MediaAttachment key={item.id} item={item} onDelete={() => void deleteAttachment(item)} />)}</div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function snapshotRules(version?: StrategyVersion): Array<{ id: string; title: string }> {
  if (!version?.rulesSnapshot) return [];
  try {
    const snapshot = JSON.parse(version.rulesSnapshot) as { rules?: Array<{ id?: string; title?: string }> };
    return (snapshot.rules ?? []).filter(rule => typeof rule.id === 'string' && typeof rule.title === 'string')
      .map(rule => ({ id: rule.id!, title: rule.title! }));
  } catch {
    return [];
  }
}
