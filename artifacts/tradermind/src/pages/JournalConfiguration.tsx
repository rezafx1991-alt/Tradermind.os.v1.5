import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Check, Pencil, Plus, RotateCcw, Save, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JournalOption } from '../db/database';
import {
  JOURNAL_OPTION_CATEGORIES,
  journalSessionService,
} from '../services/journalSessionService';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

export default function JournalConfiguration() {
  const [categoryId, setCategoryId] = useState<string>(JOURNAL_OPTION_CATEGORIES[0].id);
  const [options, setOptions] = useState<JournalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const categoryLabel = useMemo(
    () => JOURNAL_OPTION_CATEGORIES.find(category => category.id === categoryId)?.label ?? categoryId,
    [categoryId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await journalSessionService.ensureDefaultOptions();
      setOptions(await journalSessionService.getOptions(categoryId, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'بارگذاری گزینه‌ها ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setDescription('');
    setRequired(false);
  };

  const startEdit = (option: JournalOption) => {
    setEditingId(option.id);
    setLabel(option.label);
    setDescription(option.description);
    setRequired(option.required ?? false);
  };

  const save = async () => {
    if (!label.trim()) {
      toast.error('عنوان گزینه را وارد کنید.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await journalSessionService.updateOption(editingId, { label, description, required });
        toast.success('گزینه به‌روزرسانی شد.');
      } else {
        await journalSessionService.createOption({ category: categoryId, label, description, required });
        toast.success('گزینه اضافه شد.');
      }
      resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ذخیره گزینه ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (option: JournalOption) => {
    try {
      await journalSessionService.setOptionEnabled(option.id, !option.enabled);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'به‌روزرسانی وضعیت گزینه ناموفق بود.');
    }
  };

  const reorder = async (option: JournalOption, direction: -1 | 1) => {
    try {
      await journalSessionService.reorderOption(option.id, direction);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'مرتب‌سازی ناموفق بود.');
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 pb-10" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-journal-config-title">پیکربندی ژورنال</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            گزینه‌های شخصی ژورنال را مدیریت کنید. گزینه‌های استفاده‌شده بایگانی می‌شوند تا سابقه معاملات حفظ شود.
          </p>
        </div>
        <SlidersHorizontal className="h-6 w-6 text-primary" aria-hidden="true" />
      </header>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">دسته‌ها</CardTitle>
            <CardDescription>هر دسته مستقل قابل تنظیم است.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {JOURNAL_OPTION_CATEGORIES.map(category => (
              <button
                key={category.id}
                type="button"
                data-testid={`button-option-category-${category.id}`}
                onClick={() => { setCategoryId(category.id); resetForm(); }}
                className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 text-right text-sm transition-colors ${
                  categoryId === category.id ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted'
                }`}
              >
                <span>{category.label}</span>
                <span className="text-xs text-muted-foreground">
                  {options.filter(option => option.enabled && option.category === category.id).length || ''}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editingId ? 'ویرایش گزینه' : `افزودن به ${categoryLabel}`}</CardTitle>
              <CardDescription>متن دلخواه خود را به هر زبانی وارد کنید.</CardDescription>
            </CardHeader>
            <CardContent className={`grid gap-3 sm:items-start ${categoryId === 'checklist' ? 'sm:grid-cols-[1fr_1fr_auto]' : 'sm:grid-cols-[1fr_1fr_auto]'}`}>
              <Input
                data-testid="input-journal-option-label"
                value={label}
                onChange={event => setLabel(event.target.value)}
                placeholder="عنوان گزینه"
                aria-label="عنوان گزینه"
                maxLength={100}
              />
              <Textarea
                data-testid="input-journal-option-description"
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="توضیح (اختیاری)"
                aria-label="توضیح گزینه"
                maxLength={500}
                className="min-h-10"
              />
              {categoryId === 'checklist' && (
                <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm sm:col-span-2" data-testid="label-checklist-required">
                  <input data-testid="checkbox-checklist-option-required" type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />
                  هنگام ثبت مرور معامله اجباری باشد
                </label>
              )}
              <div className="flex gap-2">
                <Button data-testid="button-save-journal-option" onClick={() => void save()} disabled={saving} className="gap-2">
                  {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingId ? 'ذخیره' : 'افزودن'}
                </Button>
                {editingId && (
                  <Button data-testid="button-cancel-journal-option-edit" variant="outline" onClick={resetForm} aria-label="لغو ویرایش">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{categoryLabel}</CardTitle>
              <CardDescription>غیرفعال‌کردن، گزینه را از انتخاب‌های جدید پنهان می‌کند و سابقه را نگه می‌دارد.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-options-loading">در حال بارگذاری…</p>
              ) : options.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-options-empty">هنوز گزینه‌ای ثبت نشده است.</p>
              ) : (
                <div className="divide-y">
                  {options.map((option, index) => (
                    <div key={option.id} data-testid={`row-journal-option-${option.id}`} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words" data-testid={`text-journal-option-${option.id}`}>{option.label}</span>
                          {option.category === 'checklist' && option.required && <Badge variant="outline">الزامی</Badge>}
                          {!option.enabled && <Badge variant="secondary">بایگانی</Badge>}
                        </div>
                        {option.description && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{option.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          data-testid={`button-option-up-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label="انتقال به بالا"
                          disabled={index === 0}
                          onClick={() => void reorder(option, -1)}
                        ><ArrowUp className="h-4 w-4" /></Button>
                        <Button
                          data-testid={`button-option-down-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label="انتقال به پایین"
                          disabled={index === options.length - 1}
                          onClick={() => void reorder(option, 1)}
                        ><ArrowDown className="h-4 w-4" /></Button>
                        <Button
                          data-testid={`button-edit-option-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label={`ویرایش ${option.label}`}
                          onClick={() => startEdit(option)}
                        ><Pencil className="h-4 w-4" /></Button>
                        <Button
                          data-testid={`button-toggle-option-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label={option.enabled ? `بایگانی ${option.label}` : `فعال‌سازی ${option.label}`}
                          onClick={() => void toggleEnabled(option)}
                        >
                          {option.enabled ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                        {editingId === option.id && <Check className="h-4 w-4 text-primary" aria-label="در حال ویرایش" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
