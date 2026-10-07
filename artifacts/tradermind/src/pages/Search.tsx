/**
 * Search.tsx — Prompt 23 §21: Data Search
 * جستجوی جهانی آفلاین در تمام داده‌ها
 * کاملاً آفلاین — بدون هیچ اتصال خارجی
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { db } from '../db/database';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Search, TrendingUp, BookOpen, Brain, Wallet,
  ArrowRight, Calendar, FileText, Tag, X, SlidersHorizontal,
} from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '../components/ui/input';

// ── انواع نتایج ──────────────────────────────────────────────────────────────

type ResultType = 'trade' | 'knowledge' | 'journal' | 'analysis';

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  tags?: string[];
  href: string;
  meta?: string;
  meta2?: string;
  date?: string;
}

type FilterType = 'all' | ResultType;

const FILTER_LABELS: Record<FilterType, { label: string; icon: React.ElementType }> = {
  all:       { label: 'همه', icon: Search },
  trade:     { label: 'معاملات', icon: Wallet },
  analysis:  { label: 'تحلیل', icon: TrendingUp },
  knowledge: { label: 'دانش', icon: Brain },
  journal:   { label: 'ژورنال', icon: BookOpen },
};

const RESULT_META_FA: Record<string, string> = {
  win: 'سود', loss: 'ضرر', breakeven: 'سر به سر',
  'partial-win': 'سود جزئی', 'partial-loss': 'ضرر جزئی',
  open: 'باز', cancelled: 'لغو',
  completed: 'تکمیل', 'in-progress': 'در حال انجام',
};

const RESULT_META_COLORS: Record<string, string> = {
  win: 'bg-emerald-500/20 text-emerald-500',
  loss: 'bg-rose-500/20 text-rose-500',
  breakeven: 'bg-slate-500/20 text-slate-500',
  open: 'bg-blue-500/20 text-blue-500',
  completed: 'bg-emerald-500/20 text-emerald-500',
  'in-progress': 'bg-amber-500/20 text-amber-500',
};

const TYPE_COLORS: Record<ResultType, string> = {
  trade:     'bg-primary/10 text-primary',
  analysis:  'bg-violet-500/10 text-violet-500',
  knowledge: 'bg-indigo-500/10 text-indigo-500',
  journal:   'bg-teal-500/10 text-teal-500',
};

const TYPE_ICONS: Record<ResultType, React.ElementType> = {
  trade:     Wallet,
  analysis:  TrendingUp,
  knowledge: Brain,
  journal:   BookOpen,
};

// ── صفحه اصلی ───────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [dirFilter, setDirFilter] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // ── جستجو ──────────────────────────────────────────────────────────────────

  const performSearch = useCallback(async (q: string, f: FilterType, dir: string, result: string) => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const lower = q.toLowerCase();
    const res: SearchResult[] = [];

    try {
      // ── معاملات ──
      if (f === 'all' || f === 'trade') {
        const trades = await db.trades.toArray();
        for (const t of trades) {
          if (dir && t.direction !== dir) continue;
          if (result && t.result !== result) continue;

          const tags = JSON.parse(t.tags || '[]') as string[];
          const hit =
            t.symbol?.toLowerCase().includes(lower) ||
            t.notes?.toLowerCase().includes(lower) ||
            (t as any).entryReason?.toLowerCase().includes(lower) ||
            (t as any).lesson?.toLowerCase().includes(lower) ||
            (t as any).setupType?.toLowerCase().includes(lower) ||
            (t as any).tradingSession?.toLowerCase().includes(lower) ||
            t.direction?.toLowerCase().includes(lower) ||
            t.result?.toLowerCase().includes(lower) ||
            tags.some(tag => tag.toLowerCase().includes(lower)) ||
            t.emotionNotes?.toLowerCase().includes(lower) ||
            (t as any).managementReason?.toLowerCase().includes(lower);

          if (hit) {
            const subtitle =
              (t as any).entryReason || t.notes ||
              (t as any).lesson || '';
            res.push({
              id: t.id,
              type: 'trade',
              title: `${t.symbol} — ${t.direction === 'long' ? 'Long ▲' : 'Short ▼'}`,
              subtitle: subtitle.substring(0, 120),
              tags: tags.slice(0, 3),
              href: `/journal/trades/${t.id}`,
              meta: t.result,
              meta2: (t as any).setupType || '',
              date: t.openedAt ? format(new Date(t.openedAt), 'yyyy/MM/dd') : '',
            });
          }
        }
      }

      // ── تحلیل‌ها ──
      if (f === 'all' || f === 'analysis') {
        const sessions = await db.analysisSessions.toArray();
        for (const s of sessions) {
          const hit =
            s.title?.toLowerCase().includes(lower) ||
            s.notes?.toLowerCase().includes(lower) ||
            s.finalDecision?.toLowerCase().includes(lower);
          if (hit) {
            res.push({
              id: s.id,
              type: 'analysis',
              title: s.title || 'جلسه تحلیل',
              subtitle: (s.finalDecision || s.notes || '').substring(0, 120),
              href: `/analysis/${s.id}`,
              meta: s.status,
              date: s.startedAt ? format(new Date(s.startedAt), 'yyyy/MM/dd') : '',
            });
          }
        }
      }

      // ── پایگاه دانش ──
      if (f === 'all' || f === 'knowledge') {
        const notes = await db.knowledgeNotes.toArray();
        for (const n of notes) {
          let tags: string[] = [];
          try { tags = Array.isArray(n.tags) ? n.tags as string[] : JSON.parse(n.tags as unknown as string || '[]'); } catch { tags = []; }
          const hit =
            n.title?.toLowerCase().includes(lower) ||
            n.content?.toLowerCase().includes(lower) ||
            n.category?.toLowerCase().includes(lower) ||
            tags.some(tag => tag.toLowerCase().includes(lower));
          if (hit) {
            res.push({
              id: n.id,
              type: 'knowledge',
              title: n.title,
              subtitle: n.content?.substring(0, 120),
              tags: tags.slice(0, 3),
              href: '/knowledge',
              meta: n.category,
              meta2: n.isRule ? 'قانون' : undefined,
              date: n.createdAt ? format(new Date(n.createdAt), 'yyyy/MM/dd') : '',
            });
          }
        }
      }

      // ── ژورنال روزانه ──
      if (f === 'all' || f === 'journal') {
        const journals = await db.dailyJournals.toArray();
        for (const j of journals) {
          const hit =
            j.notes?.toLowerCase().includes(lower) ||
            (j as any).lessons?.toLowerCase().includes(lower) ||
            (j as any).improvements?.toLowerCase().includes(lower) ||
            j.endOfDayReview?.toLowerCase().includes(lower) ||
            j.preTradingState?.toLowerCase().includes(lower);
          if (hit) {
            const text = j.notes || j.endOfDayReview || (j as any).lessons || '';
            res.push({
              id: j.id,
              type: 'journal',
              title: `ژورنال روزانه — ${j.date}`,
              subtitle: text.substring(0, 120),
              href: `/journal/daily/${j.date}`,
              date: j.date,
            });
          }
        }
      }
    } finally {
      setLoading(false);
    }

    setResults(res);
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => performSearch(query, filter, dirFilter, resultFilter), 280);
    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current); };
  }, [query, filter, dirFilter, resultFilter, performSearch]);

  const filtered = results.filter(r => filter === 'all' || r.type === filter);
  const counts: Record<string, number> = {};
  results.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24 animate-in fade-in duration-500">

      {/* هدر */}
      <div className="flex items-center gap-3 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/journal/trades')}>
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">جستجو</h1>
          <p className="text-muted-foreground text-sm">جستجو در تمام معاملات، تحلیل‌ها، دانش و ژورنال — کاملاً آفلاین</p>
        </div>
      </div>

      {/* نوار جستجو */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="جستجو در نمادها، یادداشت‌ها، تحلیل، درس‌ها، تگ‌ها..."
          className="w-full h-12 bg-muted/20 border border-border rounded-xl pr-10 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          dir="rtl"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* فیلترها */}
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map(f => {
          const Icon = FILTER_LABELS[f].icon;
          const cnt = f === 'all' ? results.length : counts[f] || 0;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {FILTER_LABELS[f].label}
              {query.trim().length >= 2 && cnt > 0 && (
                <span className={`text-[10px] px-1 rounded-full ${filter === f ? 'bg-white/20' : 'bg-muted-foreground/20'}`}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}

        {/* فیلتر پیشرفته معاملات */}
        {(filter === 'all' || filter === 'trade') && (
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ml-auto ${
              showFilters || dirFilter || resultFilter
                ? 'bg-violet-500/20 text-violet-400'
                : 'bg-muted/20 text-muted-foreground hover:bg-muted/30'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            فیلتر
          </button>
        )}
      </div>

      {/* فیلترهای پیشرفته */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 bg-muted/20 rounded-xl border border-border text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">جهت:</span>
            {['', 'long', 'short'].map(d => (
              <button key={d} onClick={() => setDirFilter(d)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${dirFilter === d ? 'bg-primary text-primary-foreground' : 'bg-muted/30 hover:bg-muted/50'}`}>
                {d === '' ? 'همه' : d === 'long' ? 'Long ▲' : 'Short ▼'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">نتیجه:</span>
            {['', 'win', 'loss', 'breakeven', 'open'].map(r => (
              <button key={r} onClick={() => setResultFilter(r)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${resultFilter === r ? 'bg-primary text-primary-foreground' : 'bg-muted/30 hover:bg-muted/50'}`}>
                {r === '' ? 'همه' : RESULT_META_FA[r] || r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* حالت اولیه */}
      {!query.trim() && (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">جستجوی جهانی آفلاین</p>
            <p className="text-sm text-muted-foreground mt-1">
              در معاملات، تحلیل‌ها، پایگاه دانش و ژورنال جستجو کنید
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {['XAUUSD', 'لانگ', 'سود', 'FVG', 'London'].map(hint => (
              <button
                key={hint}
                onClick={() => setQuery(hint)}
                className="px-3 py-1.5 rounded-full bg-muted/30 text-sm hover:bg-muted/50 transition-colors"
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* در حال جستجو */}
      {loading && query.trim().length >= 2 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          در حال جستجو...
        </div>
      )}

      {/* نتایج */}
      {!loading && query.trim().length >= 2 && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <div className="text-muted-foreground">هیچ نتیجه‌ای یافت نشد</div>
              <div className="text-xs text-muted-foreground">
                «{query}» را در دسته‌بندی دیگری امتحان کنید
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground pb-1">
                {filtered.length} نتیجه
              </div>
              {filtered.map(r => {
                const Icon = TYPE_ICONS[r.type];
                return (
                  <Card
                    key={`${r.type}-${r.id}`}
                    className="hover:border-primary/30 cursor-pointer transition-all hover:bg-muted/10 active:scale-[0.99]"
                    onClick={() => setLocation(r.href)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* آیکون نوع */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${TYPE_COLORS[r.type]}`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* محتوا */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-semibold text-sm leading-tight">{r.title}</span>
                            {r.meta && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                RESULT_META_COLORS[r.meta] || 'bg-muted/30 text-muted-foreground'
                              }`}>
                                {RESULT_META_FA[r.meta] || r.meta}
                              </span>
                            )}
                            {r.meta2 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground font-medium">
                                {r.meta2}
                              </span>
                            )}
                          </div>

                          {r.subtitle && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
                              {r.subtitle}
                            </p>
                          )}

                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {r.date && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                {r.date}
                              </span>
                            )}
                            {r.tags && r.tags.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Tag className="w-3 h-3" />
                                {r.tags.map(tag => `#${tag}`).join(' ')}
                              </span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TYPE_COLORS[r.type]}`}>
                              {FILTER_LABELS[r.type].label}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* راهنمای جستجو */}
      {!query.trim() && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: Wallet, label: 'نماد معامله', hint: 'مثلاً XAUUSD یا EURUSD' },
            { icon: Tag, label: 'تگ یا ستاپ', hint: 'مثلاً FVG، Order Block' },
            { icon: FileText, label: 'متن یادداشت', hint: 'کلمه‌ای از متن یادداشت' },
            { icon: Brain, label: 'درس آموخته', hint: 'کلمه از درس‌های ثبت‌شده' },
          ].map((tip, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/10 border border-border text-sm">
              <tip.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <div className="font-medium text-xs">{tip.label}</div>
                <div className="text-muted-foreground text-xs">{tip.hint}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
