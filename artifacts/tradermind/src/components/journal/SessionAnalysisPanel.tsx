import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JournalOption } from '../../db/database';
import { journalSessionService, type AnalysisEventInput } from '../../services/journalSessionService';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { FilePicker } from './MediaThumb';

type Draft = {
  directionOptionId: string;
  expectedDirectionOptionId: string;
  marketStructureOptionId: string;
  liquidityContextOptionIds: string[];
  analysisText: string;
  scenario: string;
  triggerContext: string;
  marketContext: string;
  zones: string;
  notes: string;
  tags: string;
  files: File[];
};

const blank = (): Draft => ({
  directionOptionId: 'none', expectedDirectionOptionId: 'none', marketStructureOptionId: 'none',
  liquidityContextOptionIds: [], analysisText: '', scenario: '', triggerContext: '', marketContext: '',
  zones: '', notes: '', tags: '', files: [],
});

const enabled = (options: JournalOption[], category: string) =>
  options.filter(o => o.enabled && o.category === category).sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * پنل «ثبت تحلیل»: چند تایم‌فریم انتخاب می‌شود و برای هر کدام یک «رویداد تحلیل» مستقل ساخته می‌شود.
 * تایم‌فریم‌ها کاملاً از گزینه‌های پویای تنظیمات (دستهٔ timeframe) می‌آیند؛ هیچ مقدار ثابتی در کد نیست.
 */
export function SessionAnalysisPanel({
  sessionId, options, onSaved, onClose,
}: { sessionId: string; options: JournalOption[]; onSaved: () => void | Promise<void>; onClose: () => void }) {
  const timeframes = useMemo(() => enabled(options, 'timeframe'), [options]);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);

  const labelOf = (id: string) => timeframes.find(t => t.id === id)?.label ?? 'تایم‌فریم';
  const draftOf = (id: string) => drafts[id] ?? blank();
  const patch = (id: string, change: Partial<Draft>) =>
    setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? blank()), ...change } }));

  const toggle = (id: string) =>
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const move = (id: string, delta: -1 | 1) =>
    setSelected(current => {
      const index = current.indexOf(id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const hasContent = (d: Draft) =>
    Boolean(d.analysisText.trim() || d.scenario.trim() || d.triggerContext.trim() || d.marketContext.trim()
      || d.zones.trim() || d.notes.trim() || d.files.length
      || d.directionOptionId !== 'none' || d.expectedDirectionOptionId !== 'none' || d.marketStructureOptionId !== 'none'
      || d.liquidityContextOptionIds.length);

  const save = async () => {
    if (selected.length === 0) { toast.error('حداقل یک تایم‌فریم انتخاب کنید.'); return; }
    const empty = selected.filter(id => !hasContent(draftOf(id)));
    if (empty.length) { toast.error(`برای ${empty.map(labelOf).join('، ')} چیزی ثبت نشده است.`); return; }
    setSaving(true);
    try {
      const inputs: AnalysisEventInput[] = selected.map(id => {
        const d = draftOf(id);
        return {
          sessionId, timeframeOptionId: id,
          directionOptionId: d.directionOptionId === 'none' ? null : d.directionOptionId,
          expectedDirectionOptionId: d.expectedDirectionOptionId === 'none' ? null : d.expectedDirectionOptionId,
          marketStructureOptionId: d.marketStructureOptionId === 'none' ? null : d.marketStructureOptionId,
          liquidityContextOptionIds: d.liquidityContextOptionIds,
          analysisText: d.analysisText, scenario: d.scenario, triggerContext: d.triggerContext,
          marketContext: d.marketContext, zones: d.zones, notes: d.notes,
          tags: d.tags.split(/[،,]+/).map(v => v.trim()).filter(Boolean),
        };
      });
      const created = await journalSessionService.createAnalysisEvents(inputs);
      // رسانه‌ها به همان رویداد تحلیلِ خودشان وصل می‌شوند (نه به سشن یا معامله)
      for (const [index, record] of created.entries()) {
        for (const file of draftOf(selected[index]).files) {
          await journalSessionService.saveMedia({ sessionId, analysisId: record.id, category: 'analysis', file });
        }
      }
      toast.success(created.length === 1 ? 'تحلیل ثبت شد.' : `${created.length} تحلیل ثبت شد.`);
      setSelected([]); setDrafts({});
      await onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ثبت تحلیل انجام نشد.');
    } finally { setSaving(false); }
  };

  const optionSelect = (label: string, category: string, value: string, onChange: (v: string) => void, testId: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId}><SelectValue placeholder="ثبت نشده" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">ثبت نشده</SelectItem>
          {enabled(options, category).map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card className="tradermind-card border-primary/30" data-testid="panel-session-analysis">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div><h2 className="font-semibold">ثبت تحلیل</h2><p className="text-xs text-muted-foreground">برای هر تایم‌فریم یک رویداد تحلیل جدید ساخته می‌شود؛ تحلیل‌های قبلی تغییر نمی‌کنند.</p></div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="بستن" data-testid="button-close-analysis-panel"><X className="h-4 w-4" /></Button>
      </div>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <Label className="text-xs">تایم‌فریم‌ها</Label>
          {timeframes.length === 0
            ? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground" data-testid="empty-enabled-timeframes">تایم‌فریم فعالی وجود ندارد؛ از تنظیمات ژورنال یکی اضافه یا فعال کنید.</p>
            : <div className="flex flex-wrap gap-2" data-testid="list-timeframe-toggles">
                {timeframes.map(t => {
                  const on = selected.includes(t.id);
                  return (
                    <button key={t.id} type="button" aria-pressed={on} onClick={() => toggle(t.id)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      data-testid={`toggle-timeframe-${t.id}`}>{on ? '☑' : '☐'} {t.label}</button>
                  );
                })}
              </div>}
        </div>

        {selected.map((id, index) => {
          const d = draftOf(id);
          const liquidity = enabled(options, 'liquidity_type');
          return (
            <Card key={id} className="overflow-hidden" data-testid={`card-new-analysis-${id}`}>
              <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-3 py-2">
                <h3 className="font-semibold">{labelOf(id)}</h3>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => move(id, -1)} aria-label="بالا"><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === selected.length - 1} onClick={() => move(id, 1)} aria-label="پایین"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => toggle(id)} aria-label="حذف از این ثبت"><X className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <CardContent className="space-y-3 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  {optionSelect('جهت بازار', 'direction', d.directionOptionId, v => patch(id, { directionOptionId: v }), `select-direction-${id}`)}
                  {optionSelect('جهت مورد انتظار', 'direction', d.expectedDirectionOptionId, v => patch(id, { expectedDirectionOptionId: v }), `select-expected-${id}`)}
                  {optionSelect('ساختار بازار', 'market_structure', d.marketStructureOptionId, v => patch(id, { marketStructureOptionId: v }), `select-structure-${id}`)}
                </div>
                <div className="space-y-1.5"><Label className="text-xs">تحلیل</Label>
                  <Textarea rows={3} value={d.analysisText} onChange={e => patch(id, { analysisText: e.target.value })} placeholder="چه می‌بینید؟" data-testid={`input-analysis-text-${id}`} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label className="text-xs">سناریوی مورد انتظار</Label>
                    <Textarea rows={2} value={d.scenario} onChange={e => patch(id, { scenario: e.target.value })} placeholder="مثلاً ادامه‌دهنده صعودی، یا شکار نقدینگی و برگشت" data-testid={`input-scenario-${id}`} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">تریگر / زمینهٔ مورد انتظار</Label>
                    <Textarea rows={2} value={d.triggerContext} onChange={e => patch(id, { triggerContext: e.target.value })} data-testid={`input-trigger-context-${id}`} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">زمینهٔ بازار</Label>
                    <Textarea rows={2} value={d.marketContext} onChange={e => patch(id, { marketContext: e.target.value })} data-testid={`input-market-context-${id}`} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">مناطق و سطوح</Label>
                    <Textarea rows={2} value={d.zones} onChange={e => patch(id, { zones: e.target.value })} data-testid={`input-zones-${id}`} /></div>
                </div>
                {liquidity.length > 0 && (
                  <div className="space-y-1.5"><Label className="text-xs">نقدینگی</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {liquidity.map(o => {
                        const on = d.liquidityContextOptionIds.includes(o.id);
                        return <button key={o.id} type="button" aria-pressed={on}
                          onClick={() => patch(id, { liquidityContextOptionIds: on ? d.liquidityContextOptionIds.filter(x => x !== o.id) : [...d.liquidityContextOptionIds, o.id] })}
                          className={`rounded-md border px-2 py-1 text-[11px] ${on ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{o.label}</button>;
                      })}
                    </div></div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label className="text-xs">یادداشت</Label>
                    <Textarea rows={2} value={d.notes} onChange={e => patch(id, { notes: e.target.value })} data-testid={`input-notes-${id}`} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">برچسب‌های تحلیل</Label>
                    <Input value={d.tags} onChange={e => patch(id, { tags: e.target.value })} placeholder="با ویرگول جدا کنید" data-testid={`input-tags-${id}`} /></div>
                </div>
                <FilePicker files={d.files} onChange={files => patch(id, { files })} testId={`input-analysis-files-${id}`} />
              </CardContent>
            </Card>
          );
        })}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>انصراف</Button>
          <Button type="button" className="gap-2" onClick={() => void save()} disabled={saving || selected.length === 0} data-testid="button-save-analysis-events">
            <Save className="h-4 w-4" />{saving ? 'در حال ذخیره…' : 'ذخیرهٔ تحلیل'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
