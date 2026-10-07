import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { journalService } from "../services/journalService";
import { tradeService } from "../services/tradeService";
import { DailyJournal, Trade, PreTradingState, EndOfDayReview, defaultJournalData } from "../db/database";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import {
  ArrowRight, Save, Trash2, Plus, X, Zap, Brain, TrendingUp, TrendingDown,
  CheckCircle2, Clock, AlertCircle, BookOpen, Minus, Equal
} from "lucide-react";
import { toast } from "sonner";
import { t, formatDateFullFa, toDateStr } from "../lib/i18n";
import { cn } from "../lib/utils";
import { useNavigationGuard } from "../navigation/NavigationGuard";

// ================================================================
// کامپوننت‌های کمکی
// ================================================================

/** انتخابگر سطح ۱ تا ۱۰ */
function LevelPicker({
  value, onChange, colorFn
}: {
  value: number;
  onChange: (v: number) => void;
  colorFn: (n: number, selected: boolean) => string;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "flex-1 h-9 rounded-md text-xs font-semibold transition-all",
            n <= value
              ? colorFn(n, n === value)
              : "bg-muted/60 text-muted-foreground hover:bg-muted"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** انتخابگر حال کلی (۱ تا ۵ با ایموجی) */
const MOODS = [
  { value: 1, emoji: '😞', label: t.mood[1] },
  { value: 2, emoji: '😕', label: t.mood[2] },
  { value: 3, emoji: '😐', label: t.mood[3] },
  { value: 4, emoji: '😊', label: t.mood[4] },
  { value: 5, emoji: '😄', label: t.mood[5] },
];

function MoodPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {MOODS.map(m => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all",
            value === m.value
              ? "border-primary bg-primary/10 shadow-sm scale-105"
              : "border-transparent bg-muted/40 hover:bg-muted/70 hover:border-border"
          )}
        >
          <span className="text-2xl">{m.emoji}</span>
          <span className={cn("text-xs font-medium", value === m.value ? "text-primary" : "text-muted-foreground")}>
            {m.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** تگ احساس */
function EmotionTag({ label, selected, onClick, onRemove, isCustom }: {
  label: string;
  selected: boolean;
  onClick: () => void;
  onRemove?: () => void;
  isCustom?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border transition-all",
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-muted/50 text-muted-foreground border-transparent hover:border-border hover:text-foreground"
      )}
    >
      {label}
      {isCustom && selected && onRemove && (
        <X className="h-3 w-3 opacity-70 hover:opacity-100" onClick={e => { e.stopPropagation(); onRemove(); }} />
      )}
    </button>
  );
}

/** سکشن کارت با عنوان */
function Section({ title, icon, children, className }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3 pt-5 px-6">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-6 space-y-5">
        {children}
      </CardContent>
    </Card>
  );
}

/** نمایش سطح به صورت progress */
function LevelBar({ value, max = 10, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden flex-1">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

/** نمایش نتیجه معامله */
function TradeResultBadge({ result }: { result: Trade['result'] }) {
  const map: Record<string, { label: string; icon: React.ElementType; class: string }> = {
    win: { label: t.trades.win, icon: TrendingUp, class: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
    loss: { label: t.trades.loss, icon: TrendingDown, class: 'text-red-500 bg-red-50 dark:bg-red-950/40' },
    breakeven: { label: t.trades.breakeven, icon: Equal, class: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40' },
    open: { label: t.trades.open, icon: Clock, class: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40' },
    'partial-win': { label: t.trades.partialWin, icon: TrendingUp, class: 'text-green-500 bg-green-50 dark:bg-green-950/40' },
    'partial-loss': { label: t.trades.partialLoss, icon: TrendingDown, class: 'text-orange-500 bg-orange-50 dark:bg-orange-950/40' },
    cancelled: { label: t.trades.cancelled, icon: Minus, class: 'text-muted-foreground bg-muted' },
  };
  const info = map[result] || map.open;
  const Icon = info.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", info.class)}>
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
}

// ================================================================
// کامپوننت اصلی
// ================================================================

type FormData = {
  mood: number;
  energyLevel: number;
  focusLevel: number;
  stressLevel: number;
  emotions: string[];
  importantEventsToday: string;
  importantEventsYesterday: string;
  preTradingState: PreTradingState;
  endOfDayReview: EndOfDayReview;
  notes: string;
  tags: string[];
};

const defaultForm: FormData = {
  mood: 3,
  energyLevel: 5,
  focusLevel: 5,
  stressLevel: 3,
  emotions: [],
  importantEventsToday: '',
  importantEventsYesterday: '',
  preTradingState: { mood: 3, energy: 5, focus: 5, stress: 3, readiness: 3, notes: '' },
  endOfDayReview: { didWell: '', didWrong: '', learned: '', followedRules: null },
  notes: '',
  tags: [],
};

function journalToForm(j: DailyJournal): FormData {
  const parseArr = (s: string): string[] => { try { return JSON.parse(s) || []; } catch { return []; } };
  function parseObj<T>(s: string, fallback: T): T { try { return JSON.parse(s) || fallback; } catch { return fallback; } }
  return {
    mood: j.mood ?? 3,
    energyLevel: j.energyLevel ?? 5,
    focusLevel: j.focusLevel ?? 5,
    stressLevel: j.stressLevel ?? 3,
    emotions: parseArr(j.emotions),
    importantEventsToday: j.importantEventsToday ?? '',
    importantEventsYesterday: j.importantEventsYesterday ?? '',
    preTradingState: parseObj<PreTradingState>(j.preTradingState, defaultForm.preTradingState),
    endOfDayReview: parseObj<EndOfDayReview>(j.endOfDayReview, defaultForm.endOfDayReview),
    notes: j.notes ?? '',
    tags: parseArr(j.tags),
  };
}

function formToJournal(form: FormData, date: string): Omit<DailyJournal, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...defaultJournalData,
    date,
    mood: form.mood,
    energyLevel: form.energyLevel,
    focusLevel: form.focusLevel,
    stressLevel: form.stressLevel,
    emotions: JSON.stringify(form.emotions),
    importantEventsToday: form.importantEventsToday || null,
    importantEventsYesterday: form.importantEventsYesterday || null,
    preTradingState: JSON.stringify(form.preTradingState),
    endOfDayReview: JSON.stringify(form.endOfDayReview),
    notes: form.notes,
    tags: JSON.stringify(form.tags),
  };
}

export default function DailyEntry() {
  const { date } = useParams<{ date: string }>();
  const [, setLocation] = useLocation();

  const [form, setForm] = useState<FormData>(defaultForm);
  const [customEmotions, setCustomEmotions] = useState<string[]>([]);
  const [newEmotion, setNewEmotion] = useState('');
  const [showAddEmotion, setShowAddEmotion] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedFormRef = useRef<FormData | null>(null);

  // بارگذاری اطلاعات
  useEffect(() => {
    if (!date) return;
    async function load() {
      const [existing, dayTrades] = await Promise.all([
        journalService.getJournalByDate(date),
        tradeService.getTradesByDate(date),
      ]);
      if (existing) {
        setForm(journalToForm(existing));
        lastSavedFormRef.current = journalToForm(existing);
        setExistingId(existing.id);
      } else {
        lastSavedFormRef.current = defaultForm;
      }
      setTrades(dayTrades);
      setHasLoaded(true);
    }
    load();
  }, [date]);

  // ذخیره خودکار با debounce
  const saveJournal = useCallback(async (formData: FormData, silent = true) => {
    if (!date) return;
    setIsSaving(true);
    try {
      const saved = await journalService.saveJournal(formToJournal(formData, date));
      lastSavedFormRef.current = formData;
      setExistingId(saved.id);
      setLastSaved(new Date().toLocaleTimeString('fa-IR'));
      if (!silent) toast.success(t.common.savedSuccess);
    } catch {
      if (!silent) toast.error(t.common.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [date]);

  useNavigationGuard({
    isDirty: hasLoaded && JSON.stringify(form) !== JSON.stringify(lastSavedFormRef.current),
    onSave: async () => { await saveJournal(form, false); },
  });

  // Autosave
  useEffect(() => {
    if (!hasLoaded) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveJournal(form, true), 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form, hasLoaded]);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const updatePre = <K extends keyof PreTradingState>(key: K, value: PreTradingState[K]) =>
    setForm(prev => ({ ...prev, preTradingState: { ...prev.preTradingState, [key]: value } }));

  const updateEod = <K extends keyof EndOfDayReview>(key: K, value: EndOfDayReview[K]) =>
    setForm(prev => ({ ...prev, endOfDayReview: { ...prev.endOfDayReview, [key]: value } }));

  const toggleEmotion = (emotion: string) => {
    setForm(prev => ({
      ...prev,
      emotions: prev.emotions.includes(emotion)
        ? prev.emotions.filter(e => e !== emotion)
        : [...prev.emotions, emotion],
    }));
  };

  const addCustomEmotion = () => {
    const trimmed = newEmotion.trim();
    if (!trimmed) return;
    setCustomEmotions(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    setForm(prev => ({ ...prev, emotions: [...prev.emotions, trimmed] }));
    setNewEmotion('');
    setShowAddEmotion(false);
  };

  const handleDelete = async () => {
    if (!existingId) { setLocation('/journal/daily'); return; }
    if (!confirm(t.journal.deleteEntryConfirm)) return;
    try {
      await journalService.deleteJournal(existingId);
      toast.success(t.common.deleteSuccess);
      setLocation('/journal/daily');
    } catch {
      toast.error(t.common.deleteError);
    }
  };

  const allEmotions = [...t.defaultEmotions, ...customEmotions.filter(e => !t.defaultEmotions.includes(e))];
  const displayDate = date ? formatDateFullFa(date) : '';
  const isToday = date === toDateStr(new Date());

  // رنگ‌بندی سطح انرژی
  const energyColor = (n: number, sel: boolean) =>
    sel ? 'bg-blue-500 text-white scale-110' : n <= 7 ? 'bg-blue-500/30 text-blue-600 dark:text-blue-400' : 'bg-blue-500/50 text-blue-600 dark:text-blue-400';
  const focusColor = (n: number, sel: boolean) =>
    sel ? 'bg-emerald-500 text-white scale-110' : n <= 7 ? 'bg-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-emerald-500/50 text-emerald-600 dark:text-emerald-400';
  const stressColor = (n: number, sel: boolean) =>
    sel ? (n <= 4 ? 'bg-emerald-500 text-white scale-110' : n <= 7 ? 'bg-orange-500 text-white scale-110' : 'bg-red-500 text-white scale-110') :
      n <= 4 ? 'bg-emerald-500/30 text-emerald-600' : n <= 7 ? 'bg-orange-400/30 text-orange-600' : 'bg-red-500/30 text-red-600';

  if (!hasLoaded) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t.common.loading}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-500">

      {/* ===== هدر ===== */}
      <div className="flex items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <Link href="/journal/daily">
            <Button variant="ghost" size="icon">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{displayDate}</h1>
            <p className="text-sm text-muted-foreground">
              {isToday ? t.common.today : t.journal.dailyReflection}
              {isSaving && <span className="text-xs mr-2 opacity-60">{t.journal.saving}</span>}
              {!isSaving && lastSaved && (
                <span className="text-xs mr-2 text-emerald-600 dark:text-emerald-400">✓ {lastSaved}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {existingId && (
            <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={() => saveJournal(form, false)} disabled={isSaving}>
            <Save className="h-4 w-4 ml-2" />
            {t.common.save}
          </Button>
        </div>
      </div>

      {/* ===== وضعیت کلی روز ===== */}
      <Section title={t.journal.generalStatus} icon={<span className="text-lg">{t.moodEmoji[form.mood]}</span>}>
        {/* حال کلی */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{t.journal.mood}</p>
          <MoodPicker value={form.mood} onChange={v => update('mood', v)} />
        </div>

        {/* انرژی */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-blue-500" />
              {t.journal.energyLevel}
            </p>
            <span className="text-sm font-bold text-blue-500">{form.energyLevel}/۱۰</span>
          </div>
          <LevelPicker value={form.energyLevel} onChange={v => update('energyLevel', v)} colorFn={energyColor} />
          <div className="flex justify-between text-xs text-muted-foreground px-0.5">
            <span>{t.journal.veryLow}</span>
            <span>{t.journal.veryHigh}</span>
          </div>
        </div>

        {/* تمرکز */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-emerald-500" />
              {t.journal.focusLevel}
            </p>
            <span className="text-sm font-bold text-emerald-500">{form.focusLevel}/۱۰</span>
          </div>
          <LevelPicker value={form.focusLevel} onChange={v => update('focusLevel', v)} colorFn={focusColor} />
          <div className="flex justify-between text-xs text-muted-foreground px-0.5">
            <span>{t.journal.veryLow}</span>
            <span>{t.journal.veryHigh}</span>
          </div>
        </div>

        {/* استرس */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              {t.journal.stressLevel}
            </p>
            <span className={cn(
              "text-sm font-bold",
              form.stressLevel <= 3 ? "text-emerald-500" : form.stressLevel <= 6 ? "text-orange-500" : "text-red-500"
            )}>{form.stressLevel}/۱۰</span>
          </div>
          <LevelPicker value={form.stressLevel} onChange={v => update('stressLevel', v)} colorFn={stressColor} />
          <div className="flex justify-between text-xs text-muted-foreground px-0.5">
            <span>{t.journal.low}</span>
            <span>{t.journal.high}</span>
          </div>
        </div>
      </Section>

      {/* ===== وضعیت ذهنی ===== */}
      <Section title={t.journal.mentalState}>
        <div className="flex flex-wrap gap-2">
          {allEmotions.map(emotion => (
            <EmotionTag
              key={emotion}
              label={emotion}
              selected={form.emotions.includes(emotion)}
              onClick={() => toggleEmotion(emotion)}
              isCustom={customEmotions.includes(emotion)}
              onRemove={() => {
                setCustomEmotions(prev => prev.filter(e => e !== emotion));
                setForm(prev => ({ ...prev, emotions: prev.emotions.filter(e => e !== emotion) }));
              }}
            />
          ))}
        </div>

        {/* افزودن احساس دلخواه */}
        {showAddEmotion ? (
          <div className="flex gap-2 pt-1">
            <input
              autoFocus
              value={newEmotion}
              onChange={e => setNewEmotion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomEmotion(); if (e.key === 'Escape') setShowAddEmotion(false); }}
              placeholder={t.journal.customEmotionPlaceholder}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={addCustomEmotion}>{t.common.add}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddEmotion(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddEmotion(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t.journal.addCustomEmotion}
          </button>
        )}
      </Section>

      {/* ===== اتفاقات روز ===== */}
      <Section title={t.journal.eventsSection}>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.journal.eventsToday}</p>
          <Textarea
            className="min-h-[110px] resize-none text-sm"
            placeholder={t.journal.eventsTodayPlaceholder}
            value={form.importantEventsToday}
            onChange={e => update('importantEventsToday', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.journal.eventsYesterday}</p>
          <Textarea
            className="min-h-[90px] resize-none text-sm"
            placeholder={t.journal.eventsYesterdayPlaceholder}
            value={form.importantEventsYesterday}
            onChange={e => update('importantEventsYesterday', e.target.value)}
          />
        </div>
      </Section>

      {/* ===== وضعیت قبل از معامله ===== */}
      <Section title={t.journal.preTradingSection} icon={<Clock className="h-4 w-4 text-muted-foreground" />}>
        <div className="grid grid-cols-2 gap-5">
          {/* حال */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t.journal.mood}</p>
            <div className="flex gap-1">
              {MOODS.map(m => (
                <button key={m.value} type="button"
                  onClick={() => updatePre('mood', m.value)}
                  className={cn(
                    "flex-1 flex flex-col items-center py-2 rounded-lg border transition-all text-xs",
                    form.preTradingState.mood === m.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}>
                  <span className="text-lg">{m.emoji}</span>
                </button>
              ))}
            </div>
          </div>

          {/* آمادگی */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t.journal.readiness}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button"
                  onClick={() => updatePre('readiness', n)}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-all",
                    form.preTradingState.readiness === n
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}>
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">{t.readiness[form.preTradingState.readiness]}</p>
          </div>
        </div>

        {/* سطوح */}
        <div className="space-y-3">
          {[
            { key: 'energy' as const, label: t.journal.energyLevel, color: 'bg-blue-500', textColor: 'text-blue-500' },
            { key: 'focus' as const, label: t.journal.focusLevel, color: 'bg-emerald-500', textColor: 'text-emerald-500' },
            { key: 'stress' as const, label: t.journal.stressLevel, color: form.preTradingState.stress <= 4 ? 'bg-emerald-500' : form.preTradingState.stress <= 7 ? 'bg-orange-400' : 'bg-red-500', textColor: 'text-muted-foreground' },
          ].map(({ key, label, color, textColor }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
              <div className="flex gap-0.5 flex-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button"
                    onClick={() => updatePre(key, n)}
                    className={cn(
                      "flex-1 h-6 rounded transition-all",
                      n <= form.preTradingState[key] ? color : "bg-muted/60 hover:bg-muted"
                    )} />
                ))}
              </div>
              <span className={cn("text-xs font-semibold w-6 text-end", textColor)}>
                {form.preTradingState[key]}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t.journal.preTradingNotes}</p>
          <Textarea
            className="min-h-[80px] resize-none text-sm"
            placeholder={t.journal.preTradingNotesPlaceholder}
            value={form.preTradingState.notes}
            onChange={e => updatePre('notes', e.target.value)}
          />
        </div>
      </Section>

      {/* ===== جمع‌بندی پایان روز ===== */}
      <Section title={t.journal.endOfDaySection} icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}>
        {/* پیروی از قوانین */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.journal.followedRules}</p>
          <div className="flex gap-2 flex-wrap">
            {(Object.entries(t.followedRules) as [keyof typeof t.followedRules, string][]).map(([key, label]) => (
              <button key={key} type="button"
                onClick={() => updateEod('followedRules', key)}
                className={cn(
                  "px-4 py-2 rounded-xl border text-sm font-medium transition-all",
                  form.endOfDayReview.followedRules === key
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                )}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {[
          { key: 'didWell' as const, label: t.journal.didWell, placeholder: t.journal.didWellPlaceholder },
          { key: 'didWrong' as const, label: t.journal.didWrong, placeholder: t.journal.didWrongPlaceholder },
          { key: 'learned' as const, label: t.journal.learned, placeholder: t.journal.learnedPlaceholder },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-2">
            <p className="text-sm font-medium">{label}</p>
            <Textarea
              className="min-h-[90px] resize-none text-sm"
              placeholder={placeholder}
              value={form.endOfDayReview[key]}
              onChange={e => updateEod(key, e.target.value)}
            />
          </div>
        ))}
      </Section>

      {/* ===== معاملات امروز ===== */}
      <Section title={t.journal.todayTrades} icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}>
        {trades.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            {t.journal.noTodayTrades}
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map(trade => (
              <Link key={trade.id} href={`/journal/trades/${trade.id}`}>
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer border border-transparent hover:border-border">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      trade.direction === 'long' ? "bg-emerald-500" : "bg-red-500"
                    )} />
                    <span className="font-semibold text-sm">{trade.symbol}</span>
                    <Badge variant="outline" className="text-xs">
                      {trade.direction === 'long' ? t.trades.long : t.trades.short}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <TradeResultBadge result={trade.result} />
                    {trade.profitLoss != null && (
                      <span className={cn(
                        "text-sm font-semibold",
                        trade.profitLoss > 0 ? "text-emerald-600" : trade.profitLoss < 0 ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {trade.profitLoss > 0 ? '+' : ''}{trade.profitLoss.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* ===== یادداشت کلی ===== */}
      <Section title={t.journal.generalNotes}>
        <Textarea
          className="min-h-[120px] resize-none text-sm"
          placeholder={t.journal.generalNotesPlaceholder}
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
        />
      </Section>

      {/* دکمه ذخیره پایین صفحه */}
      <div className="pb-4 flex gap-3">
        <Button className="flex-1" size="lg" onClick={() => saveJournal(form, false)} disabled={isSaving}>
          <Save className="h-4 w-4 ml-2" />
          {isSaving ? t.journal.saving : t.common.save}
        </Button>
        {existingId && (
          <Button variant="outline" size="lg" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
