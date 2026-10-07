/**
 * TradeInsights.tsx
 * ماژول نکات معاملاتی هوشمند — سه بخش:
 * ۱. نکات دستی (CRUD روی knowledgeNotes)
 * ۲. بینش‌های خودکار (محاسبه‌شده از معاملات)
 * ۳. مرور قبل از معامله (نمایش نکات مهم)
 *
 * فایل‌های تغییر نیافته: database.ts، KnowledgeBase.tsx، journalService.ts،
 * tradeService.ts، DailyEntry.tsx، TradeJournal.tsx، DailyJournalList.tsx
 */
import { useState, useEffect, useCallback } from 'react';
import { db, KnowledgeNote, KnowledgeCategory, NoteImportance } from '../db/database';
import { insightsService, AutoInsight } from '../services/insightsService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { useToast } from '../hooks/use-toast';
import {
  Plus, Search, Trash2, Edit2, Pin, RefreshCw, AlertTriangle, Star,
  Info, ChevronDown, TrendingUp, TrendingDown, Clock, Calendar,
  Brain, Lightbulb, BookOpen, Shield, BarChart3, Zap, CheckCircle2,
  Activity, Target, Eye,
} from 'lucide-react';
import { format } from 'date-fns';

// ── ثابت‌ها ─────────────────────────────────────────────────────────────────

/** شناسه دسته‌بندی اختصاصی این ماژول در جدول knowledgeNotes */
const JOURNAL_INSIGHTS_CATEGORY = 'journal-trading-insights';

const IMPORTANCE_CFG: Record<NoteImportance, {
  label: string; color: string; bg: string; border: string;
  icon: React.ElementType; badgeClass: string;
}> = {
  critical: {
    label: 'حیاتی', color: 'text-red-500', bg: 'bg-red-500/10',
    border: 'border-red-500/30', icon: AlertTriangle,
    badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  high: {
    label: 'بالا', color: 'text-orange-500', bg: 'bg-orange-500/10',
    border: 'border-orange-500/30', icon: Star,
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  },
  medium: {
    label: 'متوسط', color: 'text-yellow-500', bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30', icon: Info,
    badgeClass: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  },
  low: {
    label: 'کم', color: 'text-muted-foreground', bg: 'bg-muted/30',
    border: 'border-border', icon: ChevronDown,
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
};

const SEVERITY_CFG: Record<string, {
  label: string; bg: string; border: string; icon: React.ElementType; metric: string;
}> = {
  critical: { label: 'حیاتی', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertTriangle, metric: 'text-red-400' },
  warning:  { label: 'هشدار', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: TrendingDown, metric: 'text-orange-400' },
  positive: { label: 'مثبت', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: TrendingUp, metric: 'text-emerald-400' },
  info:     { label: 'اطلاعاتی', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Info, metric: 'text-blue-400' },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'زمان‌بندی': Clock,
  'استراتژی': BarChart3,
  'رفتار': Brain,
  'انضباط': Shield,
  'مدیریت ریسک': Target,
  'یادگیری': BookOpen,
  'سشن': Calendar,
};

// ── Helper — ایجاد نکته پیش‌فرض برای جدول knowledgeNotes ──────────────────

function makeNote(
  partial: { title: string; content: string; importance: NoteImportance; isPinned?: boolean }
): KnowledgeNote {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: partial.title,
    content: partial.content,
    category: JOURNAL_INSIGHTS_CATEGORY,
    importance: partial.importance,
    color: { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280' }[partial.importance],
    tags: '[]',
    relatedSymbols: '[]',
    relatedSetups: '[]',
    relatedStrategies: '[]',
    relatedSessions: '[]',
    relatedMarketRegimes: '[]',
    relatedTimeframes: '[]',
    relatedDays: '[]',
    source: 'manual',
    status: 'active',
    isActive: true,
    isPinned: partial.isPinned ?? false,
    isRule: false,
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
    reviewFrequency: 'weekly',
    userFeedback: null,
    evidence: null,
    requireConfirmation: false,
    snoozedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── کامپوننت کارت نکته دستی ───────────────────────────────────────────────

interface ManualNoteCardProps {
  note: KnowledgeNote;
  onEdit: (note: KnowledgeNote) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
}

function ManualNoteCard({ note, onEdit, onDelete, onPin }: ManualNoteCardProps) {
  const cfg = IMPORTANCE_CFG[note.importance] ?? IMPORTANCE_CFG.medium;
  const ImpIcon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.bg} ${cfg.border} transition-all group`}
      style={{ borderLeftColor: note.color, borderLeftWidth: 3 }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ImpIcon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
            <h3 className="font-semibold text-sm leading-snug line-clamp-2">{note.title}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => onPin(note.id, !note.isPinned)}
              title={note.isPinned ? 'رفع پین' : 'پین کردن'}
            >
              <Pin className={`h-3.5 w-3.5 ${note.isPinned ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(note)}>
              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(note.id)}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
            </Button>
          </div>
        </div>

        {note.content && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">
            {note.content}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${cfg.badgeClass}`}>
              {cfg.label}
            </Badge>
            {note.isPinned && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary border-primary/20">
                📌 پین شده
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(note.createdAt), 'yyyy/MM/dd')}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── کامپوننت کارت بینش خودکار ─────────────────────────────────────────────

function InsightCard({ insight }: { insight: AutoInsight }) {
  const cfg = SEVERITY_CFG[insight.severity] ?? SEVERITY_CFG.info;
  const SevIcon = cfg.icon;
  const CatIcon = CATEGORY_ICONS[insight.category] ?? Lightbulb;

  return (
    <div className={`rounded-lg border ${cfg.bg} ${cfg.border} transition-all`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 ${insight.severity === 'positive' ? 'text-emerald-500' :
            insight.severity === 'critical' ? 'text-red-500' :
            insight.severity === 'warning' ? 'text-orange-500' : 'text-blue-500'}`}>
            <SevIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm leading-snug">{insight.title}</h3>
              {insight.metric && (
                <span className={`text-xs font-bold shrink-0 tabular-nums ${cfg.metric}`}>
                  {insight.metric}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {insight.description}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center gap-1 text-muted-foreground">
                <CatIcon className="h-3 w-3" />
                <span className="text-[10px]">{insight.category}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Activity className="h-3 w-3" />
                <span className="text-[10px]">{insight.dataPoints} داده</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── کامپوننت فرم نکته (add/edit) ──────────────────────────────────────────

interface NoteFormData {
  title: string;
  content: string;
  importance: NoteImportance;
  isPinned: boolean;
}

interface NoteDialogProps {
  open: boolean;
  editNote: KnowledgeNote | null;
  onClose: () => void;
  onSave: (data: NoteFormData) => Promise<void>;
}

function NoteDialog({ open, editNote, onClose, onSave }: NoteDialogProps) {
  const [form, setForm] = useState<NoteFormData>({
    title: '', content: '', importance: 'medium', isPinned: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editNote) {
      setForm({ title: editNote.title, content: editNote.content,
        importance: editNote.importance, isPinned: editNote.isPinned });
    } else {
      setForm({ title: '', content: '', importance: 'medium', isPinned: false });
    }
  }, [editNote, open]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editNote ? 'ویرایش نکته' : 'نکته جدید'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* عنوان */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">عنوان *</label>
            <Input
              placeholder="مثال: بعد از ۳ ضرر متوالی معامله نکن"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              autoFocus
            />
          </div>

          {/* توضیحات */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">توضیحات</label>
            <Textarea
              placeholder="جزئیات، دلیل یا مثال..."
              value={form.content}
              onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* اهمیت */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">سطح اهمیت</label>
            <Select
              value={form.importance}
              onValueChange={v => setForm(p => ({ ...p, importance: v as NoteImportance }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> حیاتی
                  </span>
                </SelectItem>
                <SelectItem value="high">
                  <span className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-orange-500" /> بالا
                  </span>
                </SelectItem>
                <SelectItem value="medium">
                  <span className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 text-yellow-500" /> متوسط
                  </span>
                </SelectItem>
                <SelectItem value="low">
                  <span className="flex items-center gap-2">
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> کم
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* پین */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={e => setForm(p => ({ ...p, isPinned: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm">در مرور قبل از معامله نمایش داده شود (پین)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button onClick={handleSave} disabled={!form.title.trim() || saving}>
            {saving ? '...' : editNote ? 'ذخیره تغییرات' : 'افزودن نکته'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── صفحه اصلی ─────────────────────────────────────────────────────────────

export default function TradeInsights() {
  const { toast } = useToast();

  // ── state: نکات دستی ─────────────────────────────
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [search, setSearch] = useState('');
  const [filterImp, setFilterImp] = useState<'all' | NoteImportance>('all');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editNote, setEditNote] = useState<KnowledgeNote | null>(null);
  const [notesLoading, setNotesLoading] = useState(true);

  // ── state: بینش‌های خودکار ───────────────────────
  const [insights, setInsights] = useState<AutoInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsGenerated, setInsightsGenerated] = useState(false);
  const [insightsFilter, setInsightsFilter] = useState<string>('all');

  // ── بارگذاری نکات دستی ───────────────────────────

  const loadNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const all = await db.knowledgeNotes
        .where('category').equals(JOURNAL_INSIGHTS_CATEGORY)
        .toArray();
      // مرتب‌سازی: پین‌شده‌ها اول، بعد بر اساس اهمیت
      const order: Record<NoteImportance, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      all.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (order[a.importance] ?? 3) - (order[b.importance] ?? 3);
      });
      setNotes(all);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // اطمینان از وجود دسته‌بندی
  useEffect(() => {
    const ensureCategory = async () => {
      const existing = await db.knowledgeCategories.get(JOURNAL_INSIGHTS_CATEGORY);
      if (!existing) {
        await db.knowledgeCategories.put({
          id: JOURNAL_INSIGHTS_CATEGORY,
          name: 'نکات معاملاتی ژورنال',
          icon: '📝',
          color: '#6366f1',
          isDefault: false,
          createdAt: Date.now(),
        });
      }
    };
    ensureCategory();
  }, []);

  // ── عملیات CRUD نکات ─────────────────────────────

  const handleSaveNote = async (data: { title: string; content: string; importance: NoteImportance; isPinned: boolean }) => {
    const now = Date.now();
    if (editNote) {
      await db.knowledgeNotes.update(editNote.id, {
        title: data.title, content: data.content,
        importance: data.importance, isPinned: data.isPinned,
        color: { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280' }[data.importance],
        updatedAt: now,
      });
      toast({ title: 'نکته ویرایش شد' });
    } else {
      const note = makeNote(data);
      await db.knowledgeNotes.add(note);
      toast({ title: 'نکته جدید اضافه شد' });
    }
    setDialogOpen(false);
    setEditNote(null);
    await loadNotes();
  };

  const handleDeleteNote = async (id: string) => {
    await db.knowledgeNotes.delete(id);
    toast({ title: 'نکته حذف شد' });
    await loadNotes();
  };

  const handlePin = async (id: string, pinned: boolean) => {
    await db.knowledgeNotes.update(id, { isPinned: pinned, updatedAt: Date.now() });
    await loadNotes();
  };

  const handleEdit = (note: KnowledgeNote) => {
    setEditNote(note);
    setDialogOpen(true);
  };

  // ── تولید بینش‌های خودکار ────────────────────────

  const generateInsights = async () => {
    setInsightsLoading(true);
    try {
      const result = await insightsService.generateAutoInsights();
      setInsights(result);
      setInsightsGenerated(true);
    } finally {
      setInsightsLoading(false);
    }
  };

  // ── فیلتر نکات ───────────────────────────────────

  const filteredNotes = notes.filter(n => {
    if (showPinnedOnly && !n.isPinned) return false;
    if (filterImp !== 'all' && n.importance !== filterImp) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s);
    }
    return true;
  });

  // ── فیلتر بینش‌ها ────────────────────────────────

  const insightCategories = ['all', ...new Set(insights.map(i => i.category))];
  const filteredInsights = insightsFilter === 'all'
    ? insights
    : insights.filter(i => i.category === insightsFilter);

  // ── نکات مرور قبل از معامله ──────────────────────

  const reviewNotes = notes.filter(n =>
    n.isPinned || n.importance === 'critical' || n.importance === 'high'
  );
  const reviewOrder: Record<NoteImportance, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedReviewNotes = [...reviewNotes].sort((a, b) => {
    if (a.importance !== b.importance) return reviewOrder[a.importance] - reviewOrder[b.importance];
    return a.isPinned === b.isPinned ? 0 : a.isPinned ? -1 : 1;
  });

  // ── رندر ─────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">

      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            نکات معاملاتی
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ثبت نکات شخصی، استخراج الگوهای خودکار و مرور قبل از شروع معامله
          </p>
        </div>
      </div>

      {/* تب‌ها */}
      <Tabs defaultValue="manual" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="manual" className="py-2.5 text-xs sm:text-sm gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">نکات</span>
            <span className="sm:hidden">نکات</span>
            {notes.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1 rounded-full">
                {notes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="auto" className="py-2.5 text-xs sm:text-sm gap-1.5">
            <Zap className="h-4 w-4" />
            <span>بینش‌های خودکار</span>
            {insights.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1 rounded-full">
                {insights.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="review" className="py-2.5 text-xs sm:text-sm gap-1.5">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">مرور معامله</span>
            <span className="sm:hidden">مرور</span>
            {reviewNotes.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1 rounded-full">
                {reviewNotes.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── تب ۱: نکات دستی ─────────────────────────────────────────── */}
        <TabsContent value="manual" className="space-y-4 mt-0">

          {/* نوار ابزار */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="جستجو در نکات..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select
              value={filterImp}
              onValueChange={v => setFilterImp(v as typeof filterImp)}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="اهمیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه سطوح</SelectItem>
                <SelectItem value="critical">حیاتی</SelectItem>
                <SelectItem value="high">بالا</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="low">کم</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={showPinnedOnly ? 'secondary' : 'outline'}
              size="icon"
              className="shrink-0"
              onClick={() => setShowPinnedOnly(p => !p)}
              title="فقط پین‌شده‌ها"
            >
              <Pin className="h-4 w-4" />
            </Button>
            <Button
              className="gap-2 shrink-0"
              onClick={() => { setEditNote(null); setDialogOpen(true); }}
            >
              <Plus className="h-4 w-4" /> نکته جدید
            </Button>
          </div>

          {/* آمار سریع */}
          {notes.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {(['critical', 'high', 'medium', 'low'] as NoteImportance[]).map(imp => {
                const cnt = notes.filter(n => n.importance === imp).length;
                const cfg = IMPORTANCE_CFG[imp];
                return (
                  <button
                    key={imp}
                    onClick={() => setFilterImp(filterImp === imp ? 'all' : imp)}
                    className={`rounded-lg border p-2.5 text-center transition-all ${cfg.bg} ${cfg.border}
                      ${filterImp === imp ? 'ring-1 ring-primary' : ''}`}
                  >
                    <div className={`text-lg font-bold ${cfg.color}`}>{cnt}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{cfg.label}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* لیست نکات */}
          {notesLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin ml-2" />
              در حال بارگذاری...
            </div>
          ) : filteredNotes.length === 0 ? (
            <Card className="border-dashed bg-transparent">
              <CardContent className="flex flex-col items-center py-16 gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
                  <BookOpen className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    {notes.length === 0 ? 'اولین نکته را اضافه کنید' : 'نکته‌ای یافت نشد'}
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                    {notes.length === 0
                      ? 'قوانین، درس‌های آموخته‌شده یا نکات مهم معاملاتی خود را اینجا ثبت کنید.'
                      : 'فیلترها را تغییر دهید.'}
                  </p>
                </div>
                {notes.length === 0 && (
                  <Button onClick={() => { setEditNote(null); setDialogOpen(true); }} className="gap-2">
                    <Plus className="h-4 w-4" /> افزودن نکته
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredNotes.map(note => (
                <ManualNoteCard
                  key={note.id}
                  note={note}
                  onEdit={handleEdit}
                  onDelete={handleDeleteNote}
                  onPin={handlePin}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── تب ۲: بینش‌های خودکار ───────────────────────────────────── */}
        <TabsContent value="auto" className="space-y-4 mt-0">

          {!insightsGenerated ? (
            <Card className="border-dashed bg-transparent">
              <CardContent className="flex flex-col items-center py-16 gap-5 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">استخراج بینش از معاملات شما</h3>
                  <p className="text-muted-foreground text-sm mt-2 max-w-sm">
                    این بخش معاملات شما را تحلیل می‌کند و الگوهای مهم مانند پرضررترین ساعت،
                    تأثیر احساسات، عملکرد استراتژی‌ها و سلسله ضررها را شناسایی می‌کند.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={generateInsights}
                  disabled={insightsLoading}
                >
                  {insightsLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      در حال تحلیل...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" /> شروع تحلیل
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* نوار ابزار */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Select
                  value={insightsFilter}
                  onValueChange={setInsightsFilter}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {insightCategories.map(c => (
                      <SelectItem key={c} value={c}>
                        {c === 'all' ? 'همه دسته‌ها' : c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  className="gap-2 sm:ms-auto"
                  onClick={generateInsights}
                  disabled={insightsLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${insightsLoading ? 'animate-spin' : ''}`} />
                  بروزرسانی
                </Button>
              </div>

              {/* خلاصه */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['critical','warning','positive','info'] as const).map(sev => {
                  const cnt = insights.filter(i => i.severity === sev).length;
                  const cfg = SEVERITY_CFG[sev];
                  const SIcon = cfg.icon;
                  return (
                    <div key={sev}
                      className={`rounded-lg border ${cfg.bg} ${cfg.border} p-3 text-center`}>
                      <SIcon className={`h-4 w-4 mx-auto mb-1 ${cfg.metric}`} />
                      <div className={`text-lg font-bold ${cfg.metric}`}>{cnt}</div>
                      <div className="text-[10px] text-muted-foreground">{cfg.label}</div>
                    </div>
                  );
                })}
              </div>

              {filteredInsights.length === 0 ? (
                <Card className="border-dashed bg-transparent">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
                    <p>داده کافی برای تولید بینش در این دسته وجود ندارد.</p>
                    <p className="text-sm mt-1">بیشتر معامله ثبت کنید تا الگوها شناسایی شوند.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {/* اول بحرانی‌ها، بعد هشدارها، بعد مثبت‌ها */}
                  {(['critical', 'warning', 'info', 'positive'] as const)
                    .flatMap(sev =>
                      filteredInsights
                        .filter(i => i.severity === sev)
                        .map(i => <InsightCard key={i.id} insight={i} />)
                    )}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── تب ۳: مرور قبل از معامله ─────────────────────────────────── */}
        <TabsContent value="review" className="space-y-4 mt-0">

          {/* بنر */}
          <div className="rounded-xl border bg-gradient-to-r from-primary/10 to-transparent p-4 flex items-start gap-3">
            <Eye className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-sm">مرور قبل از شروع معامله</h3>
              <p className="text-muted-foreground text-xs mt-0.5">
                هر روز قبل از معامله این نکات را مرور کنید. برای نمایش یک نکته در اینجا،
                آن را در تب «نکات» پین کنید یا اهمیت آن را «حیاتی» یا «بالا» تنظیم کنید.
              </p>
            </div>
          </div>

          {/* تاریخ امروز */}
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="h-4 w-4" />
            <span>امروز: {format(new Date(), 'EEEE — yyyy/MM/dd')}</span>
          </div>

          {sortedReviewNotes.length === 0 ? (
            <Card className="border-dashed bg-transparent">
              <CardContent className="flex flex-col items-center py-16 gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
                  <Eye className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">هنوز نکته‌ای برای مرور ندارید</h3>
                  <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                    در تب «نکات» نکات مهم را اضافه کنید و آن‌ها را پین کنید یا اهمیت «حیاتی» / «بالا» بدهید
                    تا اینجا نمایش داده شوند.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => { setEditNote(null); setDialogOpen(true); }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> افزودن نکته مهم
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-3">
                {sortedReviewNotes.map((note, idx) => {
                  const cfg = IMPORTANCE_CFG[note.importance] ?? IMPORTANCE_CFG.medium;
                  const ImpIcon = cfg.icon;
                  return (
                    <div
                      key={note.id}
                      className={`rounded-xl border ${cfg.bg} ${cfg.border} p-4 transition-all`}
                      style={{ borderLeftColor: note.color, borderLeftWidth: 4 }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${cfg.bg}`}>
                          <ImpIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
                            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${cfg.badgeClass}`}>
                              {cfg.label}
                            </Badge>
                            {note.isPinned && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">
                                📌
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-sm mt-1.5 leading-snug">{note.title}</h3>
                          {note.content && (
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                              {note.content}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* چک‌باکس تأیید مرور */}
              <Card className="mt-6 border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">آماده معامله هستید؟</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sortedReviewNotes.length} نکته مهم را مرور کردید. معامله آگاهانه انجام دهید.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* دیالوگ افزودن/ویرایش */}
      <NoteDialog
        open={dialogOpen}
        editNote={editNote}
        onClose={() => { setDialogOpen(false); setEditNote(null); }}
        onSave={handleSaveNote}
      />
    </div>
  );
}
