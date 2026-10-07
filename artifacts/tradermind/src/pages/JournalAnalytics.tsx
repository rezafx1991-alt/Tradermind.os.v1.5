import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Filter, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { Account, JournalOption, JournalSession, StrategyVersion, Trade, TradingBox, Strategy } from '../db/database';
import { db } from '../db/database';
import { journalSessionService, parseJournalArray, type JournalAnalyticsFilters } from '../services/journalSessionService';
import { accountService } from '../services/accountService';
import { tradingBoxService } from '../services/tradingBoxService';
import { strategyService } from '../services/strategyService';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { getNetPnl } from '../lib/tradeHelpers';

const ALL = '__all__';

function localDayStart(date: string): number | undefined {
  if (!date) return undefined;
  const value = new Date(`${date}T00:00:00`);
  return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
}

function localDayEnd(date: string): number | undefined {
  if (!date) return undefined;
  const value = new Date(`${date}T23:59:59.999`);
  return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
}

function money(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export default function JournalAnalytics() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [boxes, setBoxes] = useState<TradingBox[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [versions, setVersions] = useState<StrategyVersion[]>([]);
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [options, setOptions] = useState<JournalOption[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState(() => journalSessionService.calculateMetrics([]));
  const [loading, setLoading] = useState(true);

  const loadSources = useCallback(async () => {
    try {
      await journalSessionService.ensureDefaultOptions();
      const [allAccounts, allBoxes, allStrategies, allSessions, allOptions, allVersions] = await Promise.all([
        accountService.getAll(),
        tradingBoxService.getAll(),
        strategyService.getAllStrategies(),
        journalSessionService.getSessions(),
        journalSessionService.getOptions(undefined, false),
        db.strategyVersions.toArray(),
      ]);
      setAccounts(allAccounts);
      setBoxes(allBoxes);
      setStrategies(allStrategies);
      setVersions(allVersions);
      setSessions(allSessions);
      setOptions(allOptions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'بارگذاری فیلترها ناموفق بود.');
    }
  }, []);

  const runQuery = useCallback(async (values: Record<string, string>) => {
    setLoading(true);
    try {
      const query: JournalAnalyticsFilters = {
        accountId: values.accountId || undefined,
        tradingBoxId: values.tradingBoxId || undefined,
        strategyId: values.strategyId || undefined,
        strategyVersionId: values.strategyVersionId || undefined,
        symbol: values.symbol || undefined,
        from: localDayStart(values.from),
        to: localDayEnd(values.to),
        sessionId: values.sessionId || undefined,
        timeframeOptionId: values.timeframeOptionId || undefined,
        entryTriggerOptionId: values.entryTriggerOptionId || undefined,
        exitReasonOptionId: values.exitReasonOptionId || undefined,
        psychologyOptionId: values.psychologyOptionId || undefined,
        mistakeOptionId: values.mistakeOptionId || undefined,
        setupGradeOptionId: values.setupGradeOptionId || undefined,
        scoTypeOptionId: values.scoTypeOptionId || undefined,
        fvgTypeOptionId: values.fvgTypeOptionId || undefined,
        minSetupQuality: values.minSetupQuality === '' ? undefined : Number(values.minSetupQuality),
        maxSetupQuality: values.maxSetupQuality === '' ? undefined : Number(values.maxSetupQuality),
        minExecutionQuality: values.minExecutionQuality === '' ? undefined : Number(values.minExecutionQuality),
        maxExecutionQuality: values.maxExecutionQuality === '' ? undefined : Number(values.maxExecutionQuality),
        strategyCompliance: values.strategyCompliance
          ? values.strategyCompliance as JournalAnalyticsFilters['strategyCompliance']
          : undefined,
      };
      const result = await journalSessionService.getAnalytics(query);
      setTrades(result.trades);
      setMetrics(result.metrics);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تحلیل معاملات ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
    void runQuery({});
  }, [loadSources, runQuery]);

  const setFilter = (key: string, value: string) => setFilters(current => ({ ...current, [key]: value === ALL ? '' : value }));
  const optionsFor = (category: string) => options.filter(option => option.category === category);
  const sessionTitle = (session: JournalSession) => {
    const symbolList = parseJournalArray(session.symbols);
    return `${symbolList.join(', ') || 'بدون نماد'} · ${new Date(session.startTime).toLocaleDateString()}`;
  };

  const selectField = (key: string, label: string, items: Array<{ id: string; label: string }>) => (
    <label key={key} className="space-y-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select value={filters[key] || ALL} onValueChange={value => setFilter(key, value)}>
        <SelectTrigger data-testid={`select-journal-filter-${key}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>همه</SelectItem>
          {items.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );

  const optionSelect = (key: string, category: string, label: string) =>
    selectField(key, label, optionsFor(category).map(option => ({ id: option.id, label: option.label })));

  const metricCards = [
    { label: 'تعداد معاملات', value: String(metrics.totalTrades) },
    { label: 'برد / باخت / سربه‌سر', value: `${metrics.wins} / ${metrics.losses} / ${metrics.breakeven}` },
    { label: 'نرخ برد', value: metrics.winRate == null ? '—' : `${metrics.winRate.toFixed(1)}%` },
    { label: 'سود خالص', value: money(metrics.netPnl) },
    { label: 'مجموع R', value: `${metrics.totalR >= 0 ? '+' : ''}${metrics.totalR.toFixed(2)}R` },
    { label: 'میانگین R', value: metrics.averageR == null ? '—' : `${metrics.averageR >= 0 ? '+' : ''}${metrics.averageR.toFixed(2)}R` },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 pb-10" dir="rtl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-journal-analytics-title">تحلیل ژورنال</h1>
          <p className="mt-1 text-sm text-muted-foreground">معاملات session-based را با گزینه‌های قابل تنظیم فیلتر کنید.</p>
        </div>
        <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" /> فیلترها</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selectField('accountId', 'حساب', accounts.filter(item => !item.isArchived).map(item => ({ id: item.id, label: item.name })))}
            {selectField('tradingBoxId', 'باکس', boxes.filter(item => item.status === 'active').map(item => ({ id: item.id, label: item.name })))}
            {selectField('strategyId', 'استراتژی', strategies.map(item => ({ id: item.id, label: item.name })))}
            {selectField('strategyVersionId', 'نسخه استراتژی', versions
              .filter(version => !filters.strategyId || version.strategyId === filters.strategyId)
              .map(version => ({
                id: version.id,
                label: `${version.strategyName} · v${version.versionNumber}`,
              })))}
            {selectField('sessionId', 'سشن', sessions.map(item => ({ id: item.id, label: sessionTitle(item) })))}
            {optionSelect('timeframeOptionId', 'timeframe', 'تایم‌فریم')}
            {optionSelect('entryTriggerOptionId', 'entry_trigger', 'تریگر ورود')}
            {optionSelect('exitReasonOptionId', 'exit_reason', 'دلیل خروج')}
            {optionSelect('psychologyOptionId', 'psychology', 'حالت روانی')}
            {optionSelect('mistakeOptionId', 'mistake', 'اشتباه')}
            {optionSelect('setupGradeOptionId', 'setup_grade', 'درجه ستاپ')}
            {optionSelect('scoTypeOptionId', 'sco_type', 'نوع SCO')}
            {optionSelect('fvgTypeOptionId', 'fvg_type', 'نوع FVG')}
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">رعایت استراتژی</span>
              <Select value={filters.strategyCompliance || ALL} onValueChange={value => setFilter('strategyCompliance', value)}>
                <SelectTrigger data-testid="select-journal-filter-compliance"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>همه</SelectItem>
                  <SelectItem value="yes">بله</SelectItem>
                  <SelectItem value="partially">تاحدی</SelectItem>
                  <SelectItem value="no">خیر</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">نماد</span>
              <Input data-testid="input-journal-filter-symbol" value={filters.symbol ?? ''} onChange={event => setFilter('symbol', event.target.value)} placeholder="جستجوی نماد" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">از تاریخ</span>
              <Input data-testid="input-journal-filter-from" type="date" value={filters.from ?? ''} onChange={event => setFilter('from', event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">تا تاریخ</span>
              <Input data-testid="input-journal-filter-to" type="date" value={filters.to ?? ''} onChange={event => setFilter('to', event.target.value)} />
            </label>
            {(['minSetupQuality', 'maxSetupQuality', 'minExecutionQuality', 'maxExecutionQuality'] as const).map(key => (
              <label key={key} className="space-y-1.5 text-sm">
                <span className="text-muted-foreground">{key.includes('Setup') ? 'کیفیت ستاپ' : 'کیفیت اجرا'} {key.startsWith('min') ? 'از' : 'تا'}</span>
                <Input
                  data-testid={`input-journal-filter-${key}`}
                  type="number" min="0" max="10" step="1"
                  value={filters[key] ?? ''}
                  onChange={event => setFilter(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="button-run-journal-filters" onClick={() => void runQuery(filters)}>اعمال فیلتر</Button>
            <Button data-testid="button-reset-journal-filters" variant="outline" className="gap-2" onClick={() => { setFilters({}); void runQuery({}); }}>
              <RotateCcw className="h-4 w-4" /> پاک‌کردن فیلترها
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="خلاصه عملکرد">
        {metricCards.map(metric => (
          <Card key={metric.label} data-testid={`card-journal-metric-${metric.label}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">معاملات نتیجه فیلتر</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-journal-analytics-loading">در حال محاسبه…</p>
          ) : trades.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-journal-analytics-empty">معامله‌ای با این فیلترها پیدا نشد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b text-right text-muted-foreground">
                  <th className="py-2">نماد</th><th>جهت</th><th>نتیجه</th><th>سود/زیان خالص</th><th>R</th><th>تاریخ</th>
                </tr></thead>
                <tbody>
                  {trades.slice().sort((a, b) => b.openedAt - a.openedAt).map(trade => (
                    <tr key={trade.id} data-testid={`row-journal-analytics-trade-${trade.id}`} className="border-b last:border-0">
                      <td className="py-3 font-medium" dir="ltr">{trade.symbol || '—'}</td>
                      <td>{trade.direction === 'long' ? 'خرید' : 'فروش'}</td>
                      <td>{trade.result}</td>
                      <td dir="ltr">{getNetPnl(trade) == null ? '—' : money(getNetPnl(trade)!)}</td>
                      <td dir="ltr">{trade.rMultiple == null ? '—' : `${trade.rMultiple >= 0 ? '+' : ''}${trade.rMultiple.toFixed(2)}R`}</td>
                      <td>{new Date(trade.openedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
