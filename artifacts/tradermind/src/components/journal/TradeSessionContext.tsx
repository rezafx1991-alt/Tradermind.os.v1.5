import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import type { JournalMedia, JournalOption, JournalTriggerEvent, Trade } from '../../db/database';
import { journalSessionService, parseJournalArray, parsePreTradePsychology } from '../../services/journalSessionService';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { FilePicker, MediaThumb } from './MediaThumb';

type Context = NonNullable<Awaited<ReturnType<typeof journalSessionService.getTradeContext>>>;

const labelOf = (options: JournalOption[], id: string | null | undefined) =>
  id ? options.find(option => option.id === id)?.label : undefined;

/**
 * زمینهٔ فقط‌خواندنی سشن برای فرم معامله.
 * هیچ‌کدام از این داده‌ها در خود معامله کپی نمی‌شوند؛ فقط از روی ارتباط‌ها (sessionId / analysisEventId) نمایش داده می‌شوند.
 */
export function SessionContextCard({ tradeId, refreshKey = 0 }: { tradeId: string; refreshKey?: number }) {
  const [ctx, setCtx] = useState<Context>();

  useEffect(() => {
    let alive = true;
    void journalSessionService.getTradeContext(tradeId).then(result => { if (alive) setCtx(result); });
    return () => { alive = false; };
  }, [tradeId, refreshKey]);

  if (!ctx?.session) return null;
  const { session, options, analysis, account, strategy, strategyVersion } = ctx;
  const psychology = parsePreTradePsychology(session.preTradePsychology);
  const psychLabels = psychology.optionIds.map(id => labelOf(options, id)).filter(Boolean);
  const symbols = parseJournalArray(session.symbols);

  const row = (label: string, value: string | undefined | null) => (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value || '—'}</div>
    </div>
  );

  return (
    <section className="space-y-4" data-testid="section-session-context">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-lg font-semibold">زمینهٔ سشن <span className="text-xs font-normal text-muted-foreground">(فقط‌خواندنی)</span></h2>
        <Link href={`/journal/sessions/${session.id}`} className="text-xs text-primary hover:underline" data-testid="link-back-to-session">بازگشت به سشن</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-3">
        {row('نماد', symbols.join(' / '))}
        {row('حساب', account?.name)}
        {row('استراتژی', strategyVersion?.strategyName ?? strategy?.name)}
        {row('نسخه استراتژی', strategyVersion?.versionNumber)}
        {row('سشن', labelOf(options, session.sessionTypeOptionId))}
        {row('روانشناسی پیش از سشن', psychLabels.length ? psychLabels.join('، ') : undefined)}
      </div>
      {analysis && (
        <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-5" data-testid="card-linked-analysis">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{labelOf(options, analysis.timeframeOptionId) ?? 'تحلیل'}</Badge>
            <span className="font-medium">آخرین تحلیل متصل</span>
          </div>
          {analysis.scenario && <p><span className="font-medium">سناریوی مورد انتظار: </span>{analysis.scenario}</p>}
          {analysis.analysisText && <p className="text-muted-foreground">{analysis.analysisText}</p>}
        </div>
      )}
    </section>
  );
}

type Draft = {
  triggerTypeOptionId: string;
  triggerDescription: string;
  marketMovement: string;
  entryReason: string;
  confirmation: string;
  notes: string;
};
const blank: Draft = {
  triggerTypeOptionId: 'none', triggerDescription: '', marketMovement: '', entryReason: '', confirmation: '', notes: '',
};

/**
 * بخش «تریگر ورود ۱ دقیقه‌ای». فقط اطلاعات همان ورود را ثبت می‌کند و به‌صورت یک رویداد مستقل
 * (JournalTriggerEvent) به معامله وصل می‌شود؛ تصویرها/ویدیوها به همان تریگر متصل‌اند.
 */
export function TradeTriggerSection({
  trade, options, onSaved,
}: { trade: Trade; options: JournalOption[]; onSaved?: () => void }) {
  const sessionId = trade.journalSessionId ?? '';
  const [trigger, setTrigger] = useState<JournalTriggerEvent>();
  const [media, setMedia] = useState<JournalMedia[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const existing = await journalSessionService.getTriggerForTrade(trade.id);
    setTrigger(existing);
    if (existing) {
      setDraft({
        triggerTypeOptionId: existing.triggerTypeOptionId ?? 'none',
        triggerDescription: existing.triggerDescription, marketMovement: existing.marketMovement,
        entryReason: existing.entryReason, confirmation: existing.confirmation, notes: existing.notes,
      });
      const all = await journalSessionService.getSessionMedia(sessionId);
      setMedia(all.filter(item => item.triggerId === existing.id));
    } else { setDraft(blank); setMedia([]); }
  }, [trade.id, sessionId]);
  useEffect(() => { void load(); }, [load]);

  const triggerTypes = options.filter(o => o.enabled && o.category === 'entry_trigger').sort((a, b) => a.sortOrder - b.sortOrder);
  const oneMinute = options.find(o => o.category === 'timeframe' && /^1\s*m$/i.test(o.label.trim()))
    ?? options.find(o => o.category === 'timeframe' && o.enabled);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        triggerTypeOptionId: draft.triggerTypeOptionId === 'none' ? null : draft.triggerTypeOptionId,
        triggerDescription: draft.triggerDescription, marketMovement: draft.marketMovement,
        entryReason: draft.entryReason, confirmation: draft.confirmation, notes: draft.notes,
        direction: trade.direction,
      };
      const record = trigger
        ? await journalSessionService.updateTriggerEvent(trigger.id, { ...payload, tradeId: trade.id, status: 'traded' })
        : await journalSessionService.createTriggerEvent({
            sessionId, tradeId: trade.id, analysisEventId: trade.analysisEventId ?? null,
            timeframeOptionId: oneMinute?.id ?? null, triggeredAt: trade.openedAt, status: 'traded', ...payload,
          });
      for (const file of files) {
        await journalSessionService.saveMedia({
          sessionId, tradeId: trade.id, triggerId: record.id, category: 'trigger', file,
        });
      }
      setFiles([]);
      toast.success('تریگر ثبت شد.');
      await load();
      onSaved?.();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ثبت تریگر انجام نشد.');
    } finally { setSaving(false); }
  };

  const removeMedia = async (id: string) => {
    await journalSessionService.deleteMedia(id);
    await load();
  };

  return (
    <section className="space-y-4" data-testid="section-trade-trigger">
      <h2 className="border-b pb-2 text-lg font-semibold">تریگر ورود {oneMinute ? `(${oneMinute.label})` : ''}</h2>
      <p className="text-xs text-muted-foreground">فقط آنچه در همین ورود اتفاق افتاد. تحلیل تایم‌فریم‌های بالاتر در «ثبت تحلیل» سشن ثبت شده است.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>نوع تریگر</Label>
          <Select value={draft.triggerTypeOptionId} onValueChange={value => setDraft(current => ({ ...current, triggerTypeOptionId: value }))}>
            <SelectTrigger data-testid="select-trigger-type"><SelectValue placeholder="انتخاب" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ثبت نشده</SelectItem>
              {triggerTypes.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>توضیح تریگر</Label>
          <Input value={draft.triggerDescription} onChange={e => setDraft(current => ({ ...current, triggerDescription: e.target.value }))} data-testid="input-trigger-description" />
        </div>
        <div className="space-y-2">
          <Label>چه اتفاقی افتاد؟ (حرکت بازار / نقدینگی)</Label>
          <Textarea rows={2} value={draft.marketMovement} onChange={e => setDraft(current => ({ ...current, marketMovement: e.target.value }))} data-testid="input-trigger-movement" />
        </div>
        <div className="space-y-2">
          <Label>چرا وارد شدیم؟</Label>
          <Textarea rows={2} value={draft.entryReason} onChange={e => setDraft(current => ({ ...current, entryReason: e.target.value }))} data-testid="input-trigger-entry-reason" />
        </div>
        <div className="space-y-2">
          <Label>تأیید ورود</Label>
          <Textarea rows={2} value={draft.confirmation} onChange={e => setDraft(current => ({ ...current, confirmation: e.target.value }))} data-testid="input-trigger-confirmation" />
        </div>
        <div className="space-y-2">
          <Label>یادداشت</Label>
          <Textarea rows={2} value={draft.notes} onChange={e => setDraft(current => ({ ...current, notes: e.target.value }))} data-testid="input-trigger-notes" />
        </div>
      </div>
      {media.length > 0 && (
        <div className="flex flex-wrap gap-2">{media.map(item => <MediaThumb key={item.id} item={item} onDelete={() => void removeMedia(item.id)} />)}</div>
      )}
      <FilePicker files={files} onChange={setFiles} testId="input-trigger-files" label="تصویر یا ویدیوی تریگر" />
      <div className="flex justify-end">
        <Button type="button" className="gap-2" onClick={() => void save()} disabled={saving} data-testid="button-save-trigger">
          <Save className="h-4 w-4" />{saving ? 'در حال ذخیره…' : trigger ? 'به‌روزرسانی تریگر' : 'ذخیرهٔ تریگر'}
        </Button>
      </div>
    </section>
  );
}

/**
 * رسانهٔ خود معامله (ورود، حین معامله، خروج). فایل‌ها به‌صورت Blob در جدول رسانهٔ ژورنال و با
 * tradeId ذخیره می‌شوند؛ هیچ Base64ای داخل رکورد معامله نوشته نمی‌شود.
 */
export function TradeMediaSection({ trade }: { trade: Trade }) {
  const sessionId = trade.journalSessionId ?? null;
  const [media, setMedia] = useState<JournalMedia[]>([]);
  const [category, setCategory] = useState<'entry' | 'during-trade' | 'after-exit'>('entry');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const all = await journalSessionService.getTradeMedia(trade.id);
    setMedia(all);
  }, [trade.id]);
  useEffect(() => { void load(); }, [load]);

  const add = async (files: File[]) => {
    setBusy(true);
    try {
      for (const file of files) {
        await journalSessionService.saveMedia({ sessionId, tradeId: trade.id, category, file });
      }
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ فایل انجام نشد.');
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-4" data-testid="section-trade-media">
      <h2 className="border-b pb-2 text-lg font-semibold">۷. تصویر و ویدیوی معامله</h2>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={category} onValueChange={value => setCategory(value as typeof category)}>
          <SelectTrigger className="w-44" data-testid="select-trade-media-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="entry">لحظه ورود</SelectItem>
            <SelectItem value="during-trade">حین معامله</SelectItem>
            <SelectItem value="after-exit">پس از خروج</SelectItem>
          </SelectContent>
        </Select>
        <FilePicker files={[]} onChange={files => { if (!busy) void add(files); }} testId="input-trade-media-files" />
      </div>
      {media.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {media.map(item => <MediaThumb key={item.id} item={item} onDelete={() => { void journalSessionService.deleteMedia(item.id).then(load); }} />)}
        </div>
      )}
    </section>
  );
}
