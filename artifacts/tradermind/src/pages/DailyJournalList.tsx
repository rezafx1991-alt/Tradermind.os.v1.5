import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { journalService } from "../services/journalService";
import { DailyJournal } from "../db/database";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { PlusCircle, Calendar as CalIcon, List, ChevronRight, ChevronLeft, BookOpen } from "lucide-react";
import { t, formatDateFa, formatDateFullFa, toDateStr } from "../lib/i18n";
import { cn } from "../lib/utils";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday
} from "date-fns";

// ==================== تقویم ====================

function CalendarView({ journals, journalDates }: { journals: DailyJournal[]; journalDates: Set<string> }) {
  const [, setLocation] = useLocation();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 6 }); // شنبه
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const moodColorMap: Record<number, string> = {
    1: 'bg-red-500',
    2: 'bg-orange-400',
    3: 'bg-yellow-400',
    4: 'bg-green-400',
    5: 'bg-emerald-500',
  };

  const journalByDate = Object.fromEntries(journals.map(j => [j.date, j]));

  return (
    <div className="space-y-4">
      {/* هدر تقویم */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-lg">
          {t.months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* روزهای هفته */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(d => (
          <div key={d} className="text-xs text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>

      {/* خانه‌های تقویم */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dateStr = toDateStr(day);
          const hasJournal = journalDates.has(dateStr);
          const journal = journalByDate[dateStr];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDay = isToday(day);

          return (
            <button
              key={dateStr}
              onClick={() => setLocation(`/journal/daily/${dateStr}`)}
              className={cn(
                "relative h-10 rounded-lg text-sm font-medium transition-all flex flex-col items-center justify-center gap-0.5",
                isCurrentMonth ? "text-foreground" : "text-muted-foreground/40",
                isTodayDay && "ring-2 ring-primary ring-offset-1",
                hasJournal ? "bg-primary/10 hover:bg-primary/20" : "hover:bg-muted/60",
              )}
            >
              <span className={cn("text-xs", isTodayDay && "font-bold text-primary")}>
                {day.getDate()}
              </span>
              {hasJournal && journal && (
                <span className={cn("w-1.5 h-1.5 rounded-full", moodColorMap[journal.mood] || 'bg-primary')} />
              )}
            </button>
          );
        })}
      </div>

      {/* راهنمای رنگ */}
      <div className="flex items-center gap-4 pt-2 justify-center flex-wrap text-xs text-muted-foreground">
        {[
          { color: 'bg-emerald-500', label: 'عالی' },
          { color: 'bg-green-400', label: 'خوب' },
          { color: 'bg-yellow-400', label: 'معمولی' },
          { color: 'bg-orange-400', label: 'بد' },
          { color: 'bg-red-500', label: 'خیلی بد' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className={cn("w-2 h-2 rounded-full", color)} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== کارت ژورنال ====================

function JournalCard({ journal }: { journal: DailyJournal }) {
  const moodEmoji = t.moodEmoji[journal.mood] || '😐';
  const moodLabel = t.mood[journal.mood] || 'معمولی';

  const emotions: string[] = (() => {
    try { return JSON.parse(journal.emotions); } catch { return []; }
  })();

  return (
    <Link href={`/journal/daily/${journal.date}`}>
      <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full group">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">{formatDateFullFa(journal.date)}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xl">{moodEmoji}</span>
              <Badge variant="secondary" className="text-xs">{moodLabel}</Badge>
            </div>
          </div>

          {/* نمودار سطوح */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'انرژی', value: journal.energyLevel, color: 'bg-blue-500' },
              { label: 'تمرکز', value: journal.focusLevel, color: 'bg-emerald-500' },
              { label: 'استرس', value: journal.stressLevel, color: 'bg-orange-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{label}</span>
                  <span>{value}/۱۰</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", color)}
                    style={{ width: `${(value / 10) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {emotions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {emotions.slice(0, 4).map(e => (
                <span key={e} className="text-xs bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full">{e}</span>
              ))}
              {emotions.length > 4 && (
                <span className="text-xs text-muted-foreground">+{emotions.length - 4}</span>
              )}
            </div>
          )}

          {journal.notes && (
            <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{journal.notes}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ==================== صفحه اصلی ====================

export default function DailyJournalList() {
  const [journals, setJournals] = useState<DailyJournal[]>([]);
  const [journalDates, setJournalDates] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [loading, setLoading] = useState(true);

  const todayStr = toDateStr(new Date());
  const hasToday = journalDates.has(todayStr);

  useEffect(() => {
    async function load() {
      const all = await journalService.getAllJournals();
      setJournals(all);
      setJournalDates(new Set(all.map(j => j.date)));
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.journal.title}</h1>
          <p className="text-muted-foreground mt-1">{t.journal.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* تغییر نما */}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={cn("px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors", view === 'list' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              <List className="h-4 w-4" />
              {t.journal.listView}
            </button>
            <button
              onClick={() => setView('calendar')}
              className={cn("px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors", view === 'calendar' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              <CalIcon className="h-4 w-4" />
              {t.journal.calendarView}
            </button>
          </div>

          <Link href={`/journal/daily/${todayStr}`}>
            <Button size="sm">
              <PlusCircle className="h-4 w-4 ml-1.5" />
              {hasToday ? t.journal.editToday : t.journal.addToday}
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : journals.length === 0 ? (
        /* حالت خالی */
        <div className="text-center py-16 border border-dashed rounded-2xl bg-card/30">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">{t.journal.noEntries}</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{t.journal.noEntriesDesc}</p>
          <Link href={`/journal/daily/${todayStr}`}>
            <Button>
              <PlusCircle className="h-4 w-4 ml-2" />
              {t.journal.writeToday}
            </Button>
          </Link>
        </div>
      ) : view === 'calendar' ? (
        <Card>
          <CardContent className="p-6">
            <CalendarView journals={journals} journalDates={journalDates} />
          </CardContent>
        </Card>
      ) : (
        /* نمای لیست */
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {journals.map(j => (
            <JournalCard key={j.id} journal={j} />
          ))}
        </div>
      )}
    </div>
  );
}
