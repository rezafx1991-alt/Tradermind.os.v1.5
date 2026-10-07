import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useLocation } from "wouter";
import { Skeleton } from "../components/ui/skeleton";
import { tradeService } from "../services/tradeService";
import { strategyService } from "../services/strategyService";
import { accountService } from "../services/accountService";
import { tradingBoxService } from "../services/tradingBoxService";
import { Trade, Strategy, Account, TradingBox } from "../db/database";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import {
  PlusCircle, TrendingUp, Search, Filter,
  CalendarIcon, ChevronDown, ChevronUp, CreditCard, Box, Trash2,
} from "lucide-react";
import { scoreOneTrade } from "../services/dataQualityService";
import { format } from "date-fns";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { t } from "../lib/i18n";
import { getNetPnl } from "../lib/tradeHelpers";

// ── PART 9 / Prompt 3 — Virtualized trade list ────────────────────────────────
const ROW_HEIGHT = 49; // px — ارتفاع هر سطر جدول
const CARD_HEIGHT = 156; // px — ارتفاع هر کارت موبایل

function TradeListVirtualized({
  trades,
  onSelect,
  selectedIds,
  onToggle,
  onSelectAll,
}: {
  trades: Trade[];
  onSelect: (id: string) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  const tableVirtualizer = useVirtualizer({
    count: trades.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const mobileVirtualizer = useVirtualizer({
    count: trades.length,
    getScrollElement: () => mobileRef.current,
    estimateSize: () => CARD_HEIGHT + 12, // gap
    overscan: 5,
  });

  return (
    <>
      {/* جدول — دسکتاپ */}
      <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 w-10">
                  <Checkbox
                    checked={trades.length > 0 && selectedIds.size === trades.length}
                    onCheckedChange={onSelectAll}
                  />
                </th>
                <th className="px-4 py-3 font-medium text-right">تاریخ</th>
                <th className="px-4 py-3 font-medium text-right">نماد</th>
                <th className="px-4 py-3 font-medium text-right">جهت</th>
                <th className="px-4 py-3 font-medium text-right">نتیجه</th>
                <th className="px-4 py-3 font-medium text-left">ورود</th>
                <th className="px-4 py-3 font-medium text-left">خروج</th>
                <th className="px-4 py-3 font-medium text-left">سود/زیان</th>
                <th className="px-4 py-3 font-medium text-left">R</th>
                <th className="px-4 py-3 font-medium text-center">پیروی</th>
                <th className="px-4 py-3 font-medium text-center">کامل‌بودن</th>
              </tr>
            </thead>
          </table>
        </div>
        <div ref={tableRef} className="overflow-y-auto max-h-[600px]" style={{ overscrollBehavior: 'contain' }}>
          <div style={{ height: tableVirtualizer.getTotalSize(), position: 'relative' }}>
            <table className="w-full text-sm whitespace-nowrap">
              <tbody>
                {tableVirtualizer.getVirtualItems().map(vi => {
                  const trade = trades[vi.index];
                  const s = scoreOneTrade(trade).score;
                  const isSelected = selectedIds.has(trade.id);
                  return (
                    <tr
                      key={trade.id}
                      data-index={vi.index}
                      ref={tableVirtualizer.measureElement}
                      onClick={() => onSelect(trade.id)}
                      className={`hover:bg-muted/30 transition-colors cursor-pointer border-b last:border-b-0 ${isSelected ? 'bg-primary/5' : ''}`}
                      style={{ position: 'absolute', top: vi.start, width: '100%', display: 'table-row' }}
                    >
                      <td className="px-3 py-3 w-10" onClick={e => { e.stopPropagation(); onToggle(trade.id); }}>
                        <Checkbox checked={isSelected} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground w-[120px]">
                        {format(new Date(trade.openedAt), 'MM/dd HH:mm')}
                      </td>
                      <td className="px-4 py-3 font-bold">{trade.symbol}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`h-6 text-[10px] ${trade.direction === 'long'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                          {DIRECTION_FA[trade.direction] || trade.direction}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`h-6 ${RESULT_COLORS[trade.result] || ''}`}>
                          {RESULT_FA[trade.result] || trade.result}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{trade.entryPrice}</td>
                      <td className="px-4 py-3 tabular-nums">{trade.exitPrice ?? '-'}</td>
                      <td className={`px-4 py-3 tabular-nums font-medium ${trade.profitLoss
                        ? (trade.profitLoss > 0 ? 'text-emerald-500' : 'text-rose-500') : ''}`}>
                        {getNetPnl(trade) !== null ? `$${getNetPnl(trade)!.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {trade.rMultiple !== null ? `${trade.rMultiple}R` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {trade.adherenceScore !== null ? (
                          <span className="font-medium text-primary">{trade.adherenceScore}٪</span>
                        ) : trade.adherenceRating ? (
                          <span className="text-muted-foreground text-xs">
                            {ADHERENCE_FA[trade.adherenceRating] || trade.adherenceRating}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium tabular-nums ${s >= 80 ? 'text-emerald-500' : s >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                          {s}٪
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* کارت — موبایل */}
      <div
        ref={mobileRef}
        className="md:hidden overflow-y-auto max-h-[calc(100vh-280px)]"
        style={{ overscrollBehavior: 'contain' }}
      >
        <div style={{ height: mobileVirtualizer.getTotalSize(), position: 'relative' }}>
          {mobileVirtualizer.getVirtualItems().map(vi => {
            const trade = trades[vi.index];
            const s = scoreOneTrade(trade).score;
            const isSelected = selectedIds.has(trade.id);
            return (
              <div
                key={trade.id}
                data-index={vi.index}
                ref={mobileVirtualizer.measureElement}
                style={{ position: 'absolute', top: vi.start, width: '100%', paddingBottom: 12 }}
              >
                <Card className={`cursor-pointer hover:border-primary/50 transition-colors card-pressable ${isSelected ? 'border-primary/50 bg-primary/5' : ''}`}
                  onClick={() => onSelect(trade.id)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div onClick={e => { e.stopPropagation(); onToggle(trade.id); }}>
                          <Checkbox checked={isSelected} />
                        </div>
                        <h3 className="font-bold text-lg truncate">{trade.symbol}</h3>
                        <Badge variant="outline" className={`h-5 text-[10px] shrink-0 ${trade.direction === 'long'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                          {DIRECTION_FA[trade.direction] || trade.direction}
                        </Badge>
                      </div>
                      <Badge variant="outline" className={`${RESULT_COLORS[trade.result] || ''} shrink-0`}>
                        {RESULT_FA[trade.result] || trade.result}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3 shrink-0" />
                        {format(new Date(trade.openedAt), 'MMM d, yyyy HH:mm')}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1 rounded-full bg-muted/30 overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${s}%`,
                            backgroundColor: s >= 80 ? '#22c55e' : s >= 60 ? '#eab308' : '#ef4444'
                          }} />
                        </div>
                        <span className={`text-[10px] font-medium ${s >= 80 ? 'text-emerald-500' : s >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{s}٪</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t text-sm">
                      <div>
                        <div className="text-muted-foreground text-[10px] uppercase mb-0.5">ورود</div>
                        <div className="font-medium">{trade.entryPrice}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px] uppercase mb-0.5">سود/زیان</div>
                        <div className={`font-medium ${trade.profitLoss
                          ? (trade.profitLoss > 0 ? 'text-emerald-500' : 'text-rose-500') : ''}`}>
                          {getNetPnl(trade) !== null ? `$${getNetPnl(trade)!.toFixed(2)}` : '-'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground text-[10px] uppercase mb-0.5">R</div>
                        <div className="font-medium">
                          {trade.rMultiple !== null ? `${trade.rMultiple}R` : '-'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

const RESULT_COLORS: Record<string, string> = {
  win:           'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  loss:          'bg-rose-500/10 text-rose-500 border-rose-500/20',
  breakeven:     'bg-slate-500/10 text-slate-500 border-slate-500/20',
  'partial-win': 'bg-teal-500/10 text-teal-500 border-teal-500/20',
  'partial-loss':'bg-amber-500/10 text-amber-500 border-amber-500/20',
  open:          'bg-blue-500/10 text-blue-500 border-blue-500/20',
  cancelled:     'bg-muted text-muted-foreground border-border',
};

const RESULT_FA: Record<string, string> = {
  win: 'سود', loss: 'ضرر', breakeven: 'سر به سر',
  'partial-win': 'سود جزئی', 'partial-loss': 'ضرر جزئی',
  open: 'باز', cancelled: 'لغو',
};

const DIRECTION_FA: Record<string, string> = { long: 'خرید', short: 'فروش' };

const ADHERENCE_FA: Record<string, string> = {
  fully: 'کاملاً', mostly: 'تا حد زیادی', partially: 'کمی', not: 'اصلاً',
};

type TradeJournalFilters = {
  search: string;
  result: string;
  direction: string;
  strategyId: string;
  emotion: string;
  adherenceRating: string;
  dateFrom: string;
  dateTo: string;
  accountId: string;
  boxId: string;
};

function getRouteSearch(location: string): string {
  if (location.includes('?')) return location.slice(location.indexOf('?') + 1);
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    const hash = window.location.hash.replace(/^#/, '');
    const queryIndex = hash.indexOf('?');
    return queryIndex >= 0 ? hash.slice(queryIndex + 1) : '';
  }
  return typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
}

function buildTradeJournalPath(filters: TradeJournalFilters): string {
  const params = new URLSearchParams();
  const defaults: Record<keyof TradeJournalFilters, string> = {
    search: '', result: 'all', direction: 'all', strategyId: 'all',
    emotion: 'all', adherenceRating: 'all', dateFrom: '', dateTo: '',
    accountId: 'all', boxId: 'all',
  };

  (Object.keys(defaults) as (keyof TradeJournalFilters)[]).forEach(key => {
    if (filters[key] !== defaults[key]) params.set(key, filters[key]);
  });

  const query = params.toString();
  return query ? `/journal/trades?${query}` : '/journal/trades';
}

export default function TradeJournal() {
  const [location, setLocation] = useLocation();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tradingBoxes, setTradingBoxes] = useState<TradingBox[]>([]);
  const [stats, setStats] = useState({ total: 0, winRate: 0, totalPnl: 0, avgRMultiple: 0 });
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // خواندن پارامترهای URL برای پیش‌فیلتر (مثلاً ?boxId=xxx از صفحه باکس‌ها)
  const urlParams = useMemo(() => new URLSearchParams(getRouteSearch(location)), [location]);

  const [filters, setFilters] = useState<TradeJournalFilters>({
    // The URL is the source of truth so the filter survives list → detail →
    // edit → save navigation and a page remount.
    search: urlParams.get('search') || '',
    result: urlParams.get('result') || 'all',
    direction: urlParams.get('direction') || 'all',
    strategyId: urlParams.get('strategyId') || 'all',
    emotion: urlParams.get('emotion') || 'all',
    adherenceRating: urlParams.get('adherenceRating') || 'all',
    dateFrom: urlParams.get('dateFrom') || '',
    dateTo: urlParams.get('dateTo') || '',
    accountId: urlParams.get('accountId') || 'all',
    boxId: urlParams.get('boxId') || 'all',
  });

  useEffect(() => {
    strategyService.getAllStrategies().then(setStrategies);
    accountService.getAll().then(setAccounts);
    tradingBoxService.getAll().then(setTradingBoxes);
    // اگر فیلتر URL وجود داشت، پنل فیلتر را باز کن
    if ([...urlParams.keys()].length > 0) setFiltersOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    const f = {
      ...filters,
      dateFrom: filters.dateFrom ? new Date(filters.dateFrom).getTime() : undefined,
      dateTo: filters.dateTo ? new Date(filters.dateTo).setHours(23, 59, 59, 999) : undefined,
    };
    const [data, currentStats] = await Promise.all([
      tradeService.getTradesWithFilters(f),
      tradeService.getStats(),
    ]);
    setTrades(data);
    setStats(currentStats);
    setLoading(false);
  };

  const handleFilterChange = (key: keyof TradeJournalFilters, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      setLocation(buildTradeJournalPath(next));
      return next;
    });
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === trades.length ? new Set() : new Set(trades.map(t => t.id)));
  }, [trades]);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const count = selectedIds.size;
    for (const id of selectedIds) {
      await tradeService.deleteTrade(id);
    }
    setSelectedIds(new Set());
    setShowBulkDeleteDialog(false);
    setBulkDeleting(false);
    await loadData();
    const { toast } = await import('sonner');
    toast.success(`${count} معامله حذف شد`);
  };

  const clearFilters = () => {
    const cleared: TradeJournalFilters = {
      search: '', result: 'all', direction: 'all', strategyId: 'all',
      emotion: 'all', adherenceRating: 'all', dateFrom: '', dateTo: '',
      accountId: 'all', boxId: 'all',
    };
    setFilters(cleared);
    // حذف پارامترهای URL
    setLocation('/journal/trades');
  };

  const activeFiltersCount = Object.values(filters).filter(v => v !== 'all' && v !== '').length;
  const emotions = t.defaultEmotions;

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
          <Skeleton className="h-11 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">

      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">دفتر معاملات</h1>
          <p className="text-muted-foreground mt-1">معاملات خود را ثبت و بررسی کنید.</p>
        </div>
        {/* باگ ۱: ?new=true تضمین می‌کند که همیشه معامله جدید ساخته می‌شود */}
        <Link href="/journal/trades/new?new=true">
          <Button size="lg" className="gap-2 shadow-lg w-full sm:w-auto">
            <PlusCircle className="h-5 w-5" /> ثبت معامله جدید
          </Button>
        </Link>
      </div>

      {/* آمار سریع */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'کل معاملات', value: stats.total },
          { label: 'نرخ برد', value: `${stats.winRate.toFixed(1)}٪` },
          {
            label: 'سود/زیان کل',
            value: `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}`,
            cls: stats.totalPnl > 0 ? 'text-emerald-500' : stats.totalPnl < 0 ? 'text-rose-500' : '',
          },
          { label: 'میانگین R', value: `${stats.avgRMultiple.toFixed(2)}R` },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.cls ?? ''}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* جستجو و فیلتر */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}
        className="border rounded-xl bg-card overflow-hidden">
        <div className="flex items-center justify-between p-3 sm:p-4 bg-muted/20 gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="جستجو نماد..."
              value={filters.search}
              onChange={e => handleFilterChange('search', e.target.value)}
              className="pr-9 h-9 bg-background"
            />
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 shrink-0">
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">فیلترها</span>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="rounded-full px-1.5 py-0 min-w-[20px] h-5">
                  {activeFiltersCount}
                </Badge>
              )}
              {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="p-4 border-t bg-muted/5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* نتیجه */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">نتیجه</div>
              <Select value={filters.result} onValueChange={v => handleFilterChange('result', v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه نتایج</SelectItem>
                  <SelectItem value="win">سود</SelectItem>
                  <SelectItem value="loss">ضرر</SelectItem>
                  <SelectItem value="breakeven">سر به سر</SelectItem>
                  <SelectItem value="partial-win">سود جزئی</SelectItem>
                  <SelectItem value="partial-loss">ضرر جزئی</SelectItem>
                  <SelectItem value="open">باز</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* جهت */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">جهت</div>
              <Select value={filters.direction} onValueChange={v => handleFilterChange('direction', v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه جهت‌ها</SelectItem>
                  <SelectItem value="long">خرید (Long)</SelectItem>
                  <SelectItem value="short">فروش (Short)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* استراتژی */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">استراتژی</div>
              <Select value={filters.strategyId} onValueChange={v => handleFilterChange('strategyId', v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه استراتژی‌ها</SelectItem>
                  {strategies.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* احساس */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">احساس</div>
              <Select value={filters.emotion} onValueChange={v => handleFilterChange('emotion', v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه احساسات</SelectItem>
                  {emotions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* پیروی از قوانین */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">پیروی از قوانین</div>
              <Select value={filters.adherenceRating} onValueChange={v => handleFilterChange('adherenceRating', v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="fully">کاملاً پیروی</SelectItem>
                  <SelectItem value="mostly">تا حد زیادی</SelectItem>
                  <SelectItem value="partially">کمی</SelectItem>
                  <SelectItem value="not">اصلاً پیروی نکرده</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* حساب معاملاتی */}
            {accounts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CreditCard className="w-3 h-3" /> حساب معاملاتی
                </div>
                <Select value={filters.accountId} onValueChange={v => handleFilterChange('accountId', v)}>
                  <SelectTrigger dir="rtl" className="h-auto min-h-9 bg-background whitespace-normal [&>span]:!line-clamp-none [&>span]:!whitespace-normal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه حساب‌ها</SelectItem>
                    <SelectItem value="none_set">بدون حساب</SelectItem>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex min-w-0 items-center gap-2 whitespace-normal break-words text-right" dir="rtl">
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                          {a.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* باکس معاملاتی */}
            {tradingBoxes.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Box className="w-3 h-3" /> باکس معاملاتی
                </div>
                <Select value={filters.boxId} onValueChange={v => handleFilterChange('boxId', v)}>
                  <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه باکس‌ها</SelectItem>
                    <SelectItem value="none_set">بدون باکس</SelectItem>
                    {tradingBoxes.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                          {b.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* از تاریخ */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">از تاریخ</div>
              <Input type="date" value={filters.dateFrom}
                onChange={e => handleFilterChange('dateFrom', e.target.value)}
                className="h-9 bg-background" />
            </div>

            {/* تا تاریخ */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">تا تاریخ</div>
              <Input type="date" value={filters.dateTo}
                onChange={e => handleFilterChange('dateTo', e.target.value)}
                className="h-9 bg-background" />
            </div>

            {activeFiltersCount > 0 && (
              <div className="flex items-end">
                <Button variant="ghost" className="h-9 w-full text-muted-foreground hover:text-foreground"
                  onClick={clearFilters}>
                  پاک کردن فیلترها
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* نوار حذف دسته‌جمعی */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-xl animate-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-medium">{selectedIds.size} معامله انتخاب شده</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>لغو</Button>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setShowBulkDeleteDialog(true)}>
              <Trash2 className="w-3.5 h-3.5" /> حذف انتخاب‌شده‌ها
            </Button>
          </div>
        </div>
      )}

      {/* تعداد نتایج */}
      <div className="text-sm text-muted-foreground">
        نمایش {trades.length} معامله
        {selectedIds.size > 0 && <span className="text-destructive font-medium mr-2">({selectedIds.size} انتخاب شده)</span>}
      </div>

      {/* دیالوگ تأیید حذف دسته‌جمعی */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف {selectedIds.size} معامله؟</DialogTitle>
            <DialogDescription>
              این عملیات غیرقابل بازگشت است. {selectedIds.size} معامله به‌طور دائم حذف خواهند شد.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)} disabled={bulkDeleting}>لغو</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? 'در حال حذف...' : `حذف ${selectedIds.size} معامله`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حالت خالی */}
      {trades.length === 0 ? (
        <Card className="border-dashed bg-transparent">
          <CardContent className="flex flex-col items-center justify-center py-16 sm:py-24 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">معامله‌ای یافت نشد</h2>
            <p className="text-muted-foreground max-w-sm">
              {activeFiltersCount > 0
                ? 'فیلترها را تغییر دهید تا نتایج بیشتری ببینید.'
                : 'اولین معامله خود را ثبت کنید.'}
            </p>
            {activeFiltersCount > 0 ? (
              <Button variant="outline" onClick={clearFilters}>پاک کردن فیلترها</Button>
            ) : (
              <Button onClick={() => setLocation('/journal/trades/new')}>
                <PlusCircle className="w-4 h-4 ml-2" /> ثبت اولین معامله
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <TradeListVirtualized
          trades={trades}
          onSelect={id => setLocation(`/journal/trades/${id}?returnTo=${encodeURIComponent(buildTradeJournalPath(filters))}`)}
          selectedIds={selectedIds}
          onToggle={handleToggleSelect}
          onSelectAll={handleSelectAll}
        />
      )}
    </div>
  );
}
