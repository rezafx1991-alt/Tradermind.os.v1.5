import { useState, useEffect, useRef, useCallback, type ComponentProps } from "react";
import { Link, useLocation } from "wouter";
import { tradeService } from "../services/tradeService";
import { analysisService } from "../services/analysisService";
import { strategyService } from "../services/strategyService";
import { accountService } from "../services/accountService";
import { tradingBoxService } from "../services/tradingBoxService";
import { db, Trade, Strategy, AnalysisSession, Account, TradingBox, MTFScenario } from "../db/database";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ArrowLeft, Save, Eye, Plus, X, Image as ImageIcon, Zap, BookOpen, ChevronDown, ChevronUp, CheckSquare, Square, CreditCard, Box } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "../components/ui/progress";
import { format } from "date-fns";
import PreTradeInsightPanel from "../components/PreTradeInsightPanel";
import ScreenshotManager from "../components/ScreenshotManager";
import { TradeScreenshot } from "../types/screenshot";
import { getTradingDateTimeInput, parseTradingDateTimeInput } from "../lib/tradingTime";
import { detectTradingSession } from "../lib/tradeClassification";
import { useNavigationGuard, useGuardedNavigation } from "../navigation/NavigationGuard";
import { useAppStore } from "../store/useAppStore";
import { getNetPnl } from "../lib/tradeHelpers";
import { journalSessionService } from "../services/journalSessionService";
import type { JournalOption } from "../db/database";
import { SessionContextCard, TradeMediaSection, TradeTriggerSection } from "../components/journal/TradeSessionContext";

const MARKETS = ['Forex', 'Crypto', 'Indices', 'Stocks', 'Commodities', 'Other'];
const DEFAULT_MTF_TIMEFRAMES = ['4H', '15M', '5M', '1M'];
const normalizeMtfTimeframes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return DEFAULT_MTF_TIMEFRAMES;
  const result = value
    .filter(item => typeof item === 'string')
    .map(item => item.trim().toUpperCase())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
  return result.length ? result.slice(0, 8) : DEFAULT_MTF_TIMEFRAMES;
};

// ── لیست نمادهای معاملاتی رایج ──────────────────────────────────────────────
const TRADING_SYMBOLS: { label: string; value: string; market: string }[] = [
  // فارکس — جفت‌ارزهای اصلی
  { label: 'EURUSD', value: 'EURUSD', market: 'Forex' },
  { label: 'GBPUSD', value: 'GBPUSD', market: 'Forex' },
  { label: 'USDJPY', value: 'USDJPY', market: 'Forex' },
  { label: 'USDCHF', value: 'USDCHF', market: 'Forex' },
  { label: 'AUDUSD', value: 'AUDUSD', market: 'Forex' },
  { label: 'NZDUSD', value: 'NZDUSD', market: 'Forex' },
  { label: 'USDCAD', value: 'USDCAD', market: 'Forex' },
  // فارکس — جفت‌ارزهای متقاطع
  { label: 'EURGBP', value: 'EURGBP', market: 'Forex' },
  { label: 'EURJPY', value: 'EURJPY', market: 'Forex' },
  { label: 'EURCHF', value: 'EURCHF', market: 'Forex' },
  { label: 'GBPJPY', value: 'GBPJPY', market: 'Forex' },
  { label: 'GBPCHF', value: 'GBPCHF', market: 'Forex' },
  { label: 'AUDJPY', value: 'AUDJPY', market: 'Forex' },
  { label: 'AUDNZD', value: 'AUDNZD', market: 'Forex' },
  { label: 'CADJPY', value: 'CADJPY', market: 'Forex' },
  { label: 'CHFJPY', value: 'CHFJPY', market: 'Forex' },
  { label: 'EURAUD', value: 'EURAUD', market: 'Forex' },
  { label: 'EURCAD', value: 'EURCAD', market: 'Forex' },
  { label: 'EURNZD', value: 'EURNZD', market: 'Forex' },
  { label: 'GBPAUD', value: 'GBPAUD', market: 'Forex' },
  { label: 'GBPCAD', value: 'GBPCAD', market: 'Forex' },
  { label: 'GBPNZD', value: 'GBPNZD', market: 'Forex' },
  { label: 'NZDJPY', value: 'NZDJPY', market: 'Forex' },
  // کالاها
  { label: 'XAUUSD — طلا', value: 'XAUUSD', market: 'Commodities' },
  { label: 'XAGUSD — نقره', value: 'XAGUSD', market: 'Commodities' },
  { label: 'XPTUSD — پلاتین', value: 'XPTUSD', market: 'Commodities' },
  { label: 'USOIL — نفت خام WTI', value: 'USOIL', market: 'Commodities' },
  { label: 'UKOIL — نفت برنت', value: 'UKOIL', market: 'Commodities' },
  { label: 'NATGAS — گاز طبیعی', value: 'NATGAS', market: 'Commodities' },
  // شاخص‌ها
  { label: 'US30 — داو جونز', value: 'US30', market: 'Indices' },
  { label: 'NAS100 — نزدک', value: 'NAS100', market: 'Indices' },
  { label: 'SPX500 — اس‌اند‌پی ۵۰۰', value: 'SPX500', market: 'Indices' },
  { label: 'GER40 — داکس', value: 'GER40', market: 'Indices' },
  { label: 'UK100 — فوتسی ۱۰۰', value: 'UK100', market: 'Indices' },
  { label: 'JPN225 — نیکی', value: 'JPN225', market: 'Indices' },
  { label: 'FRA40 — کک', value: 'FRA40', market: 'Indices' },
  { label: 'AUS200 — ASX200', value: 'AUS200', market: 'Indices' },
  { label: 'VIX — شاخص نوسان', value: 'VIX', market: 'Indices' },
  // کریپتو
  { label: 'BTCUSDT — بیت‌کوین', value: 'BTCUSDT', market: 'Crypto' },
  { label: 'ETHUSDT — اتریوم', value: 'ETHUSDT', market: 'Crypto' },
  { label: 'BNBUSDT — بایننس', value: 'BNBUSDT', market: 'Crypto' },
  { label: 'SOLUSDT — سولانا', value: 'SOLUSDT', market: 'Crypto' },
  { label: 'XRPUSDT — ریپل', value: 'XRPUSDT', market: 'Crypto' },
  { label: 'ADAUSDT — کاردانو', value: 'ADAUSDT', market: 'Crypto' },
  { label: 'DOGEUSDT — دوج‌کوین', value: 'DOGEUSDT', market: 'Crypto' },
  { label: 'DOTUSDT — پولکادات', value: 'DOTUSDT', market: 'Crypto' },
  { label: 'LTCUSDT — لایت‌کوین', value: 'LTCUSDT', market: 'Crypto' },
  { label: 'AVAXUSDT — آوالانچ', value: 'AVAXUSDT', market: 'Crypto' },
  { label: 'MATICUSDT — پالیگان', value: 'MATICUSDT', market: 'Crypto' },
  { label: 'LINKUSDT — چین‌لینک', value: 'LINKUSDT', market: 'Crypto' },
  { label: 'ATOMUSDT — کازموس', value: 'ATOMUSDT', market: 'Crypto' },
  { label: 'NEARUSDT — نیر', value: 'NEARUSDT', market: 'Crypto' },
  { label: 'SUIUSDT — سوئی', value: 'SUIUSDT', market: 'Crypto' },
  { label: 'PEPEUSDT — پپه', value: 'PEPEUSDT', market: 'Crypto' },
  { label: 'TRUMPUSDT — ترامپ', value: 'TRUMPUSDT', market: 'Crypto' },
];

const CUSTOM_SYMBOLS_KEY = 'tradermind-custom-symbols';

function getCustomSymbols(): { label: string; value: string; market: string }[] {
  try {
    const values = JSON.parse(localStorage.getItem(CUSTOM_SYMBOLS_KEY) ?? '[]');
    if (!Array.isArray(values)) return [];
    return values.filter((item): item is { label: string; value: string; market: string } =>
      item && typeof item.value === 'string' && typeof item.label === 'string'
    );
  } catch {
    return [];
  }
}

// لیست حجم پوزیشن (لات) با گام ۰.۰۱ تا یک لات، سپس مقادیر بزرگ‌تر
const POSITION_SIZE_OPTIONS = [
  ...Array.from({ length: 100 }, (_, index) => Number(((index + 1) / 100).toFixed(2))),
  1.25, 1.50, 1.75, 2.00, 2.50, 3.00, 4.00, 5.00, 7.50, 10.00,
  15.00, 20.00, 25.00, 30.00, 50.00, 100.00,
];

// لیست درصد ریسک
const RISK_PERCENTAGE_OPTIONS = [
  0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00,
  2.50, 3.00, 4.00, 5.00, 7.50, 10.00,
];

function normalizeDecimalInput(value: string): string {
  const normalized = value
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٫,]/g, '.')
    .replace(/[^\d.-]/g, '');
  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = normalized.replace(/-/g, '');
  const [whole = '', ...fraction] = unsigned.split('.');
  return `${sign}${whole}${fraction.length > 0 ? `.${fraction.join('')}` : ''}`;
}

function customDecimalValue(value: string): number | null {
  if (!value || value === '.') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function decimalValue(value: string): number | null {
  if (!value || value === '.' || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function NumericInput({
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const lastSyncedValue = useRef<number | null>(value ?? null);

  useEffect(() => {
    const externalValue = value ?? null;
    if (externalValue !== lastSyncedValue.current) {
      setText(externalValue == null ? '' : String(externalValue));
      lastSyncedValue.current = externalValue;
    }
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      step="any"
      value={text}
      onChange={event => {
        const nextText = normalizeDecimalInput(event.target.value);
        const nextValue = decimalValue(nextText);
        setText(nextText);
        lastSyncedValue.current = nextValue;
        onValueChange(nextValue);
      }}
      dir="ltr"
    />
  );
}

// حالت‌های احساسی به فارسی
const EMOTIONS = [
  { id: 'Calm',            label: 'آرام',                 color: 'bg-sky-500' },
  { id: 'Confident',       label: 'مطمئن',                color: 'bg-emerald-500' },
  { id: 'Uncertain',       label: 'نامطمئن',              color: 'bg-amber-500' },
  { id: 'Fearful',         label: 'ترسیده',               color: 'bg-orange-500' },
  { id: 'Anxious',         label: 'مضطرب',                color: 'bg-orange-500' },
  { id: 'Excited',         label: 'هیجان‌زده',            color: 'bg-violet-500' },
  { id: 'Frustrated',      label: 'ناکام',                color: 'bg-red-500' },
  { id: 'FOMO',            label: 'ترس از دست دادن',      color: 'bg-rose-500' },
  { id: 'Revenge Trading', label: 'معامله انتقامی',       color: 'bg-red-600' },
  { id: 'Overconfident',   label: 'بیش از حد مطمئن',      color: 'bg-yellow-500' },
  { id: 'Tired',           label: 'خسته',                 color: 'bg-slate-500' },
  { id: 'Distracted',      label: 'حواس‌پرت',             color: 'bg-slate-500' },
];

// ── کامپوننت انتخاب نماد با جستجو ──────────────────────────────────────────
function SymbolSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [customSymbols, setCustomSymbols] = useState(getCustomSymbols);
  const [customInput, setCustomInput] = useState('');
  const allSymbols = [...TRADING_SYMBOLS, ...customSymbols];

  const displayValue = value || '';

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          placeholder="وارد کردن نماد (مثلاً EURUSD، BTCUSDT، XAUUSD)"
          value={displayValue}
          onChange={e => {
            const v = e.target.value.toUpperCase();
            onChange(v);
          }}
          className="text-lg font-bold uppercase"
          autoComplete="off"
        />
      </div>
      {displayValue && (
        <p className="text-xs text-muted-foreground">
          {allSymbols.find(s => s.value === displayValue)?.market || 'نماد سفارشی'}
          {' • '}
          {allSymbols.find(s => s.value === displayValue)?.label.includes('—')
            ? allSymbols.find(s => s.value === displayValue)?.label.split('—')[1].trim()
            : displayValue}
        </p>
      )}
      {customSymbols.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground">نمادهای من:</span>
          {customSymbols.map(sym => (
            <span key={sym.value} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
              <button type="button" onClick={() => onChange(sym.value)} className={displayValue === sym.value ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}>
                {sym.value}
              </button>
              <button
                type="button"
                aria-label={`حذف نماد ${sym.value}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const next = customSymbols.filter(item => item.value !== sym.value);
                  setCustomSymbols(next);
                  localStorage.setItem(CUSTOM_SYMBOLS_KEY, JSON.stringify(next));
                  if (displayValue === sym.value) onChange('');
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Input
          value={customInput}
          onChange={e => setCustomInput(e.target.value.toUpperCase())}
          placeholder="نماد سفارشی، مثلاً US100"
          className="h-8 text-sm"
          dir="ltr"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          disabled={!customInput.trim()}
          onClick={() => {
            const symbol = customInput.trim().toUpperCase();
            if (!symbol) return;
            const next = [...customSymbols.filter(s => s.value !== symbol), { value: symbol, label: 'نماد سفارشی', market: tradeMarket(symbol) }];
            setCustomSymbols(next);
            localStorage.setItem(CUSTOM_SYMBOLS_KEY, JSON.stringify(next));
            onChange(symbol);
            setCustomInput('');
          }}
        >
          افزودن
        </Button>
      </div>
    </div>
  );
}

function tradeMarket(symbol: string): string {
  if (symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('JPY')) return 'Forex';
  return 'Other';
}

export default function NewTrade() {
  const [, setLocation] = useLocation();
  // FIX: در hash routing الکترون، query params باید مستقیماً از hash خوانده شوند
  // چون useElectronHashLocation اکنون فقط path را برمی‌گرداند (بدون query string)
  // تا Wouter بتواند route matching درستی انجام دهد
  const _searchStr = window.location.protocol === 'file:'
    ? (() => {
        const hash = window.location.hash.replace(/^#/, '');
        const qIdx = hash.indexOf('?');
        return qIdx >= 0 ? hash.slice(qIdx + 1) : '';
      })()
    : window.location.search;
  const searchParams = new URLSearchParams(_searchStr);
  const sessionId = searchParams.get('sessionId');
  const journalSessionId = searchParams.get('journalSessionId');
  const analysisEventId = searchParams.get('analysisEventId');
  const triggerEventId = searchParams.get('triggerEventId');
  const editId = searchParams.get('editId');
  const returnTo = searchParams.get('returnTo');
  // idFromUrl فقط برای بازیابی پیش‌نویس پس از رفرش صفحه استفاده می‌شود
  // اگر new=true باشد یا editId وجود داشته باشد، از آن صرف‌نظر می‌شود
  const isNewTrade = searchParams.get('new') === 'true';
  const idFromUrl = (isNewTrade || editId) ? null : searchParams.get('id');

  const [trade, setTrade] = useState<Trade | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [linkedStrategy, setLinkedStrategy] = useState<Strategy | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tradingBoxes, setTradingBoxes] = useState<TradingBox[]>([]);
  // ورودی متن جداست تا مقدارهای میانی مثل «۰.» هنگام تایپ با رندر مجدد پاک نشوند.
  const [positionSizeInput, setPositionSizeInput] = useState('');
  const [riskPercentageInput, setRiskPercentageInput] = useState('');
  const [newMtfTimeframe, setNewMtfTimeframe] = useState('');
  const [newScenarioDirection, setNewScenarioDirection] = useState<MTFScenario['direction']>('both');
  const [newScenarioTimeframe, setNewScenarioTimeframe] = useState('');
  const [journalOptions, setJournalOptions] = useState<JournalOption[]>([]);
  const [contextRefresh, setContextRefresh] = useState(0);
  useEffect(() => {
    // گزینه‌های پویای ژورنال (تریگر، تایم‌فریم، …) — فقط برای معامله‌های متصل به سشن لازم است
    void journalSessionService.getOptions(undefined, true).then(setJournalOptions).catch(() => setJournalOptions([]));
  }, []);
  const journalCustomTags = useAppStore(s => s.journalCustomTags);
  const journalCustomEmotions = useAppStore(s => s.journalCustomEmotions);

  useEffect(() => {
    db.trades.toArray().then(setAllTrades);
    accountService.getAll().then(setAccounts);
    tradingBoxService.getAll().then(setTradingBoxes);
  }, []);

  // بررسی معامله تکراری
  useEffect(() => {
    if (!trade || !trade.symbol || !trade.entryPrice || !initialized.current) return;
    const check = async () => {
      const existing = await db.trades
        .where('symbol').equalsIgnoreCase(trade.symbol).toArray();
      const dup = existing.find(t =>
        t.id !== trade.id &&
        t.direction === trade.direction &&
        Math.abs(t.entryPrice - trade.entryPrice) < trade.entryPrice * 0.001 &&
        Math.abs(t.openedAt - trade.openedAt) < 60_000
      );
      if (dup) {
        setDuplicateWarning(`احتمال تکرار: معامله مشابهی در ${new Date(dup.openedAt).toLocaleDateString('fa-IR')} ثبت شده است.`);
      } else {
        setDuplicateWarning(null);
      }
    };
    const timer = setTimeout(check, 1000);
    return () => clearTimeout(timer);
  }, [trade?.symbol, trade?.direction, trade?.entryPrice, trade?.openedAt]);

  const tradeIdRef = useRef<string | null>(editId || idFromUrl || null);
  const lastSavedRef = useRef<Trade | null>(null);
  const initialized = useRef(false);
  // Tracks the last set of URL params we initialized for — re-init when they change
  const lastInitKey = useRef<string>('__unset__');
  const requestNavigation = useGuardedNavigation();

  useEffect(() => {
    // Build a key from the current URL params that identify which trade to open
    // Keep strategy-analysis sessions and journal sessions as separate links.
    const currentKey = `${editId ?? ''}|${idFromUrl ?? ''}|${sessionId ?? ''}|${journalSessionId ?? ''}|${analysisEventId ?? ''}|${triggerEventId ?? ''}`;

    // Skip if we already initialized for this exact combination (prevents StrictMode double-run)
    if (lastInitKey.current === currentKey && initialized.current) return;
    lastInitKey.current = currentKey;

    // Reset state for fresh initialization
    initialized.current = false;
    tradeIdRef.current = editId || idFromUrl || null;
    lastSavedRef.current = null;
    setTrade(null);

    const init = async () => {
      if (initialized.current) return;
      initialized.current = true;

      const strats = await strategyService.getAllStrategies();
      setStrategies(strats);

      let currentTrade: Trade | null = null;

      const requestedTradeId = tradeIdRef.current;

      if (requestedTradeId) {
        const existing = await tradeService.getTradeById(requestedTradeId);
        if (existing) {
          currentTrade = existing;
        }
      } 
      
      if (!currentTrade) {
        // Never replace a missing edit/recovery target with a new blank trade.
        // That used to create an empty record when an editId was stale or the
        // IndexedDB read raced with navigation.
        if (requestedTradeId) {
          toast.error('معاملهٔ موردنظر پیدا نشد و معاملهٔ جدیدی ساخته نشد.');
          setLocation('/journal/trades');
          return;
        }

        if (journalSessionId) {
          // Session-based trades must be created through the Session service so the
          // Analysis/Trigger relationships are established before the user edits execution data.
          currentTrade = await journalSessionService.createTradeFromSession({
            sessionId: journalSessionId,
            analysisEventId: analysisEventId || undefined,
            triggerEventId: triggerEventId || undefined,
          });
        } else {
          currentTrade = await tradeService.createTrade({
            sessionId: sessionId || null,
            journalSessionId: null,
          });
        }
        tradeIdRef.current = currentTrade.id;
        // Update URL so a page refresh reloads this draft (doesn't go through Wouter
        // to avoid a re-render loop; query string is only used for recovery on refresh)
        const newSearch = '?id=' + currentTrade.id
          + (sessionId ? `&sessionId=${sessionId}` : '')
          + (journalSessionId ? `&journalSessionId=${journalSessionId}` : '')
          + (analysisEventId ? `&analysisEventId=${analysisEventId}` : '')
          + (triggerEventId ? `&triggerEventId=${triggerEventId}` : '');
        window.history.replaceState(null, '', window.location.pathname + newSearch);
        // Keep our init key in sync so Wouter re-renders don't re-trigger init
        lastInitKey.current = `|${currentTrade.id}|${sessionId ?? ''}|${journalSessionId ?? ''}|${analysisEventId ?? ''}|${triggerEventId ?? ''}`;
      }

      // Repair older drafts that were saved before market defaults existed.
      // A known symbol always wins; otherwise keep a valid stored market.
      const symbolMarket = TRADING_SYMBOLS.find(s => s.value === currentTrade!.symbol)?.market;
      if (!currentTrade.market && (symbolMarket || currentTrade.symbol)) {
        currentTrade = {
          ...currentTrade,
          market: symbolMarket ?? tradeMarket(currentTrade.symbol),
        };
        await tradeService.updateTrade(currentTrade.id, { market: currentTrade.market });
      }

      setTrade(currentTrade);
      setPositionSizeInput(
        currentTrade.positionSize != null && !POSITION_SIZE_OPTIONS.includes(currentTrade.positionSize)
          ? String(currentTrade.positionSize)
          : ''
      );
      setRiskPercentageInput(
        currentTrade.riskPercentage != null && !RISK_PERCENTAGE_OPTIONS.includes(currentTrade.riskPercentage)
          ? String(currentTrade.riskPercentage)
          : ''
      );
      lastSavedRef.current = currentTrade;

      const targetSessionId = currentTrade.sessionId || sessionId;
      if (targetSessionId) {
        const sess = await analysisService.getSessionById(targetSessionId);
        if (sess) {
          setSession(sess);
          const strat = await strategyService.getStrategyById(sess.strategyId);
          if (strat) setLinkedStrategy(strat);

          if (currentTrade.adherenceScore === null) {
            const score = await tradeService.computeAdherenceScore(sess.id);
            handleChange('adherenceScore', score);
          }
        }
      }
    };
    init();
  }, [editId, idFromUrl, sessionId, journalSessionId, analysisEventId, triggerEventId]);

  const handleChange = useCallback((field: keyof Trade, value: any) => {
    setTrade(prev => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  }, []);

  const mtfAnalysis = (() => {
    try {
      const parsed = JSON.parse((trade as any)?.mtfAnalysis || 'null');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch {
      return {};
    }
  })();
  const mtfTimeframes = normalizeMtfTimeframes(mtfAnalysis.__timeframes);
  const mtfScenarios = Array.isArray(mtfAnalysis.scenarios) ? mtfAnalysis.scenarios as MTFScenario[] : [];
  const updateMtfTimeframes = (timeframes: string[]) => {
    const next = { ...mtfAnalysis, __timeframes: normalizeMtfTimeframes(timeframes) };
    handleChange('mtfAnalysis' as any, JSON.stringify(next));
  };
  const addMtfTimeframe = () => {
    const value = newMtfTimeframe.trim().toUpperCase();
    if (!value) return;
    if (mtfTimeframes.includes(value)) {
      toast.error('این تایم‌فریم قبلاً اضافه شده است');
      return;
    }
    if (mtfTimeframes.length >= 8) {
      toast.error('حداکثر ۸ تایم‌فریم قابل افزودن است');
      return;
    }
    updateMtfTimeframes([...mtfTimeframes, value]);
    setNewMtfTimeframe('');
  };
  const updateMtfScenarios = (scenarios: MTFScenario[]) => {
    handleChange('mtfAnalysis' as any, JSON.stringify({
      ...mtfAnalysis,
      scenarios,
      __timeframes: mtfTimeframes,
    }));
  };
  const addMtfScenario = () => {
    const timeframe = newScenarioTimeframe.trim().toUpperCase() || mtfTimeframes[0] || '15M';
    updateMtfScenarios([
      ...mtfScenarios,
      {
        id: crypto.randomUUID(),
        direction: newScenarioDirection,
        timeframe,
        trigger: '',
        invalidation: '',
        action: '',
        enabled: true,
      },
    ]);
    setNewScenarioTimeframe('');
  };

  const saveTrade = useCallback(async (dataToSave: Trade, source: 'manual' | 'autosave' | 'navigation' = 'autosave') => {
    if (!dataToSave.id) {
      toast.error('شناسهٔ معامله برای ذخیره پیدا نشد؛ معاملهٔ جدیدی ساخته نشد.');
      console.error('[TradeSave] rejected UPDATE without trade ID', { source });
      return false;
    }
    const operationId = crypto.randomUUID();
    console.debug('[TradeSave]', {
      mode: 'UPDATE',
      tradeId: dataToSave.id,
      source,
      operationId,
      timestamp: Date.now(),
    });
    setIsSaving(true);
    try {
      const saved = await tradeService.updateTrade(dataToSave.id, dataToSave);
      if (saved) lastSavedRef.current = saved;
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 2000);
      return true;
    } catch (error) {
      console.error('[TradeSave] UPDATE failed', { tradeId: dataToSave.id, source, operationId, error });
      toast.error('ذخیرهٔ معامله ناموفق بود.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  useNavigationGuard({
    isDirty: Boolean(trade && JSON.stringify(trade) !== JSON.stringify(lastSavedRef.current)),
    onSave: async () => {
      if (trade) await saveTrade(trade);
    },
  });

  useEffect(() => {
    if (!trade || !initialized.current) return;
    const timer = setTimeout(() => {
       if (JSON.stringify(trade) !== JSON.stringify(lastSavedRef.current)) {
         void saveTrade(trade, 'autosave');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [trade, saveTrade]);

  // اتودیتکت نتیجه بر اساس سود/زیان
  useEffect(() => {
    if (!trade || !initialized.current || trade.status !== 'closed') return;
    // نتیجه بر اساس سود «خالص» (پس از کسر کارمزد/کمیسیون/اسپرد) تعیین می‌شود
    const net = getNetPnl(trade);
    if (net === null) return;
    let autoResult: string;
    if (net > 0) autoResult = trade.result === 'partial-win' ? 'partial-win' : 'win';
    else if (net < 0) autoResult = trade.result === 'partial-loss' ? 'partial-loss' : 'loss';
    else autoResult = 'breakeven';
    if (trade.result !== autoResult) {
      handleChange('result', autoResult);
    }
  }, [trade?.profitLoss, trade?.fees, trade?.commission, trade?.spread, trade?.swap, trade?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // اگر سود/زیان وارد شده باشد، معامله پایان‌یافته است؛ این برای معاملات
  // قدیمی که دستی تکمیل می‌شوند هم همان رفتار ایمپورت را حفظ می‌کند.
  useEffect(() => {
    if (!trade || !initialized.current) return;
    const net = getNetPnl(trade);
    if (net === null) return;
    const computed = net > 0 ? 'win' : net < 0 ? 'loss' : 'breakeven';
    const result = (trade.result === 'partial-win' && computed === 'win') || (trade.result === 'partial-loss' && computed === 'loss')
      ? trade.result
      : computed;
    if (trade.status !== 'closed' || trade.result !== result) {
      setTrade(prev => prev ? { ...prev, status: 'closed', result } : prev);
    }
  }, [trade?.profitLoss, trade?.fees, trade?.commission, trade?.spread, trade?.swap, trade?.status, trade?.result]);

  // باگ ۲: وقتی در حال ویرایش معامله هستیم، برگشت به صفحه جزئیات معامله می‌رود نه لیست
  const backUrl = returnTo
    || (journalSessionId ? `/journal/sessions/${journalSessionId}` : null)
    || (editId ? `/journal/trades/${editId}` : '/journal/trades');

  const handleCancel = async () => {
    requestNavigation(backUrl);
  };

  const handleDateChange = (field: 'openedAt' | 'closedAt', dateString: string) => {
    const timestamp = parseTradingDateTimeInput(dateString);
    if (Number.isNaN(timestamp)) return;
    handleChange(field, timestamp);

    // اگر سشن قبلی خالی یا خودکار بوده، با تغییر ساعت بازشدن آن را دوباره
    // محاسبه کن؛ سشن انتخاب‌شدهٔ دستی کاربر را بازنویسی نکن.
    if (field === 'openedAt' && trade) {
      const previousAutoSession = detectTradingSession(trade.openedAt);
      if (!trade.tradingSession || trade.tradingSession === previousAutoSession) {
        handleChange('tradingSession', detectTradingSession(timestamp));
      }
    }
  };

  const formatDateForInput = (timestamp: number | null) => {
    return getTradingDateTimeInput(timestamp);
  };

  const computeRMultiple = () => {
    if (!trade || trade.exitPrice === null || trade.exitPrice === undefined) return;
    const diff = Math.abs(trade.entryPrice - trade.stopLoss);
    if (diff === 0) return;

    let r = 0;
    if (trade.direction === 'long') {
      r = (trade.exitPrice - trade.entryPrice) / diff;
    } else {
      r = (trade.entryPrice - trade.exitPrice) / diff;
    }
    return r.toFixed(2);
  };

  const toggleEmotion = (emotionId: string) => {
    if (!trade) return;
    const currentEmotions = JSON.parse(trade.emotions || '[]') as string[];
    let updated;
    if (currentEmotions.includes(emotionId)) {
      updated = currentEmotions.filter(e => e !== emotionId);
    } else {
      updated = [...currentEmotions, emotionId];
    }
    handleChange('emotions', JSON.stringify(updated));
  };

  const currentEmotions = trade ? (JSON.parse(trade.emotions || '[]') as string[]) : [];
  const review = trade ? JSON.parse(trade.review || '{}') : {};
  const tags = trade ? JSON.parse(trade.tags || '[]') as string[] : [];
  // معامله‌ای که از دل یک سشن ساخته شده: داده‌های سشن فقط‌خواندنی‌اند و دوباره پرسیده نمی‌شوند
  const sessionMode = Boolean(trade?.journalSessionId);
  const computedR = computeRMultiple();
  const netPnl = trade ? getNetPnl(trade) : null;
  const availableEmotions = [
    ...EMOTIONS,
    ...journalCustomEmotions
      .filter(id => !EMOTIONS.some(emotion => emotion.id === id))
      .map(id => ({ id, label: id, color: 'bg-sky-500' })),
  ];

  if (!trade) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Initializing trade...</div>;
  }

  return (
    <div className="w-full min-w-0 max-w-4xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 border-b pb-4 sticky top-0 bg-background/80 backdrop-blur z-10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => requestNavigation(backUrl)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{editId ? 'Edit Trade' : 'Log Trade'}</h1>
            {trade.journalSessionId && (
              <p className="text-xs text-primary" data-testid="status-journal-session-linked">
                Linked to journal session
              </p>
            )}
            <div className="flex items-center gap-2 text-sm">
              <span className={`text-muted-foreground transition-opacity ${showSavedIndicator ? 'opacity-100' : 'opacity-0'}`}>
                Saved
              </span>
              {isSaving && <span className="text-muted-foreground animate-pulse">Saving...</span>}
            </div>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          {/* Quick/Full toggle */}
          <div className="order-3 flex w-full min-w-0 rounded-lg border overflow-hidden sm:order-none sm:w-auto sm:flex-none">
            <Button
              variant={isQuickMode ? 'default' : 'ghost'}
              size="sm"
              className="min-w-0 flex-1 rounded-none gap-1.5 h-9 px-2 sm:flex-none sm:px-3"
              onClick={() => setIsQuickMode(true)}
            >
              <Zap className="w-3.5 h-3.5" /> سریع
            </Button>
            <Button
              variant={!isQuickMode ? 'default' : 'ghost'}
              size="sm"
              className="min-w-0 flex-1 rounded-none gap-1.5 h-9 px-2 sm:flex-none sm:px-3"
              onClick={() => setIsQuickMode(false)}
            >
              <BookOpen className="w-3.5 h-3.5" /> کامل
            </Button>
          </div>
          <Button className="order-1 flex-1 sm:order-none sm:flex-none" variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button className="order-2 flex-1 whitespace-nowrap sm:order-none sm:flex-none" onClick={async () => {
            if (trade) {
               const saved = await saveTrade(trade, 'manual');
               if (saved) {
                 const detailPath = returnTo
                   ? `/journal/trades/${trade.id}?returnTo=${encodeURIComponent(returnTo)}`
                   : `/journal/trades/${trade.id}`;
                 setLocation(detailPath);
               }
            }
          }}>
            <Eye className="w-4 h-4 mr-2" /> Save & View
          </Button>
        </div>
      </div>

      {/* هشدار تکرار */}
      {duplicateWarning && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{duplicateWarning}</span>
          <button onClick={() => setDuplicateWarning(null)} className="mr-auto shrink-0 hover:opacity-70">✕</button>
        </div>
      )}

      <div className="space-y-12">
        {/* حالت سشن: زمینه فقط‌خواندنی + تریگر ۱ دقیقه‌ای؛ بدون انتخاب دوبارهٔ نماد/حساب/باکس/استراتژی */}
        {sessionMode ? (
          <>
            <SessionContextCard tradeId={trade.id} refreshKey={contextRefresh} />
            <TradeTriggerSection trade={trade} options={journalOptions} onSaved={() => setContextRefresh(n => n + 1)} />
            <section className="space-y-4" data-testid="section-session-trade-basics">
              <h2 className="text-lg font-semibold border-b pb-2">جهت و وضعیت</h2>
              <div className="flex gap-2">
                <Button variant={trade.direction === 'long' ? 'default' : 'outline'} onClick={() => handleChange('direction', 'long')}
                  className={`flex-1 ${trade.direction === 'long' ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50 hover:bg-emerald-500/30' : ''}`}>LONG</Button>
                <Button variant={trade.direction === 'short' ? 'default' : 'outline'} onClick={() => handleChange('direction', 'short')}
                  className={`flex-1 ${trade.direction === 'short' ? 'bg-rose-500/20 text-rose-500 border-rose-500/50 hover:bg-rose-500/30' : ''}`}>SHORT</Button>
              </div>
              <div className="flex gap-2">
                {['open', 'closed', 'cancelled'].map(status => (
                  <Button key={status} variant={trade.status === status ? 'default' : 'outline'} onClick={() => handleChange('status', status)} className="flex-1 capitalize">{status}</Button>
                ))}
              </div>
            </section>
          </>
        ) : (
        <>
        {/* SECTION 1: Trade Info */}
        <section className="space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">1. Trade Info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>نماد معاملاتی (Symbol)</Label>
              <SymbolSelector
                value={trade.symbol}
                onChange={v => {
                  const symbol = v.toUpperCase();
                  handleChange('symbol', symbol);
                  // Keep the market in sync whenever the symbol changes,
                  // including when replacing an existing default symbol.
                  const found = TRADING_SYMBOLS.find(s => s.value === symbol);
                  handleChange('market', found?.market ?? tradeMarket(symbol));
                }}
              />
            </div>

            {/* پانل بینش پیش از معامله — بعد از ورود نماد ظاهر می‌شود */}
            {trade.symbol && trade.symbol.length >= 2 && (
              <div className="lg:col-span-3">
                <PreTradeInsightPanel
                  symbol={trade.symbol}
                  tags={tags}
                  allTrades={allTrades}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Market</Label>
              <Select value={trade.market || ''} onValueChange={v => handleChange('market', v)}>
               <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select Market" /></SelectTrigger>
                <SelectContent>
                  {MARKETS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-3">
              <Label>Direction</Label>
              <div className="flex gap-2">
                <Button 
                  variant={trade.direction === 'long' ? 'default' : 'outline'}
                  onClick={() => handleChange('direction', 'long')}
                  className={`flex-1 ${trade.direction === 'long' ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50 hover:bg-emerald-500/30' : ''}`}
                >
                  LONG
                </Button>
                <Button 
                  variant={trade.direction === 'short' ? 'default' : 'outline'}
                  onClick={() => handleChange('direction', 'short')}
                  className={`flex-1 ${trade.direction === 'short' ? 'bg-rose-500/20 text-rose-500 border-rose-500/50 hover:bg-rose-500/30' : ''}`}
                >
                  SHORT
                </Button>
              </div>
            </div>

            <div className="space-y-2 lg:col-span-3">
              <Label>Status</Label>
              <div className="flex gap-2">
                {['open', 'closed', 'cancelled'].map(status => (
                  <Button 
                    key={status}
                    variant={trade.status === status ? 'default' : 'outline'}
                    onClick={() => handleChange('status', status)}
                    className="flex-1 capitalize"
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2 lg:col-span-3">
              <Label>Strategy</Label>
              <Select value={trade.strategyId || 'none'} onValueChange={v => handleChange('strategyId', v === 'none' ? null : v)}>
                 <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select Strategy" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Strategy</SelectItem>
                  {strategies.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* حساب معاملاتی */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> حساب معاملاتی</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-1.5" onClick={() => setLocation('/accounts')}>
                  <Plus className="w-3 h-3" /> مدیریت
                </Button>
              </div>
               <Select value={(trade as any).accountId || 'none'} onValueChange={v => {
                 const nextAccountId = v === 'none' ? null : v;
                 handleChange('accountId' as any, nextAccountId);
                 const selectedBox = tradingBoxes.find(box => box.id === (trade as any).boxId);
                 if (selectedBox?.accountId && selectedBox.accountId !== nextAccountId) {
                   handleChange('boxId' as any, null);
                 }
               }}>
                 <SelectTrigger dir="rtl" className="h-9 text-sm whitespace-normal [&>span]:!line-clamp-none [&>span]:!whitespace-normal">
                  <SelectValue placeholder="انتخاب حساب (اختیاری)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون حساب</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex min-w-0 items-center gap-2 whitespace-normal break-words text-right" dir="rtl">
                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                        {a.name}{a.broker ? ` — ${a.broker}` : ''}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* باکس معاملاتی */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Box className="w-3.5 h-3.5" /> باکس معاملاتی</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-1.5" onClick={() => setLocation('/trading-boxes')}>
                  <Plus className="w-3 h-3" /> مدیریت
                </Button>
              </div>
               <Select value={(trade as any).boxId || 'none'} onValueChange={v => handleChange('boxId' as any, v === 'none' ? null : v)}>
                 <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="انتخاب باکس (اختیاری)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون باکس</SelectItem>
                   {tradingBoxes.filter(b => b.status === 'active' && (!(b as any).accountId || (b as any).accountId === (trade as any).accountId)).map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
        </>)}

        {/* ── سشن + ستاپ (بخشی از Section 1) ── */}
        {!isQuickMode && !sessionMode && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold border-b pb-2">۱ب. سشن معاملاتی و ستاپ</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>سشن معاملاتی</Label>
                <Select value={(trade as any).tradingSession || ''} onValueChange={v => handleChange('tradingSession' as any, v || null)}>
                 <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="انتخاب کنید…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="london">لندن</SelectItem>
                    <SelectItem value="new-york">نیویورک</SelectItem>
                    <SelectItem value="asia">آسیا</SelectItem>
                    <SelectItem value="overlap">اوورلپ</SelectItem>
                    <SelectItem value="other">سایر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نوع ستاپ</Label>
                <Select value={(trade as any).setupType || ''} onValueChange={v => handleChange('setupType' as any, v || null)}>
                 <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="انتخاب کنید…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="break-and-retest">Break and Retest</SelectItem>
                    <SelectItem value="fvg">FVG (Fair Value Gap)</SelectItem>
                    <SelectItem value="liquidity-grab">Liquidity Grab</SelectItem>
                    <SelectItem value="order-block">Order Block</SelectItem>
                    <SelectItem value="trend-continuation">Trend Continuation</SelectItem>
                    <SelectItem value="reversal">Reversal</SelectItem>
                    <SelectItem value="support-resistance">حمایت/مقاومت</SelectItem>
                    <SelectItem value="other">سایر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 2: Entry Details */}
        <section className="space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">2. Entry Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label>Opened At</Label>
              <Input 
                type="datetime-local" 
                value={formatDateForInput(trade.openedAt)}
                onChange={e => handleDateChange('openedAt', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Entry Price</Label>
              <NumericInput value={trade.entryPrice} onValueChange={value => handleChange('entryPrice', value ?? 0)} />
            </div>
            <div className="space-y-2">
              <Label>Stop Loss</Label>
              <NumericInput value={trade.stopLoss} onValueChange={value => handleChange('stopLoss', value ?? 0)} />
            </div>
            <div className="space-y-2">
              <Label>Take Profit</Label>
              <NumericInput value={trade.takeProfit} onValueChange={value => handleChange('takeProfit', value)} />
            </div>
          </div>
        </section>

        {/* ── برنامه معامله (Planned Trade) — همیشه قابل ویرایش است ── */}
        <section className="space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">۲ب. برنامه معامله (Planned)</h2>
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { key: 'plannedEntry', label: 'ورود برنامه‌ریزی‌شده' },
              { key: 'plannedSL', label: 'حد ضرر برنامه‌ریزی‌شده' },
              { key: 'plannedTP', label: 'حد سود برنامه‌ریزی‌شده' },
              { key: 'plannedRR', label: 'R:R برنامه‌ریزی‌شده' },
              { key: 'plannedRisk', label: 'ریسک برنامه‌ریزی‌شده (%)' },
              { key: 'plannedPositionSize', label: 'حجم برنامه‌ریزی‌شده' },
            ].map(f => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <NumericInput
                  value={(trade as any)[f.key]}
                  onValueChange={value => handleChange(f.key as any, value)}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 3: Position Sizing — از ۰.۰۱ لات شروع می‌شود */}
        <section className="space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">3. حجم و ریسک</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* حجم پوزیشن — لیست از ۰.۰۱ */}
            <div className="space-y-2">
              <Label>حجم پوزیشن (لات)</Label>
              <Select
                value={trade.positionSize != null ? String(trade.positionSize) : ''}
                onValueChange={v => {
                  setPositionSizeInput('');
                  handleChange('positionSize', v ? parseFloat(v) : null);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="انتخاب حجم…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {POSITION_SIZE_OPTIONS.map(v => (
                    <SelectItem key={v} value={String(v)}>
                      {v % 1 === 0 ? v.toFixed(2) : v < 0.1 ? v.toFixed(2) : v.toFixed(2)} لات
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* ورودی دستی برای مقادیر سفارشی */}
              <Input
                type="text" inputMode="decimal" placeholder="یا مقدار دلخواه وارد کنید…"
                value={positionSizeInput}
                onChange={e => {
                  const value = normalizeDecimalInput(e.target.value);
                  setPositionSizeInput(value);
                  handleChange('positionSize', customDecimalValue(value));
                }}
                className="h-8 text-sm mt-1"
                dir="ltr"
              />
            </div>

            {/* درصد ریسک — لیست */}
            <div className="space-y-2">
              <Label>ریسک (٪)</Label>
              <Select
                value={trade.riskPercentage != null ? String(trade.riskPercentage) : ''}
                onValueChange={v => {
                  setRiskPercentageInput('');
                  handleChange('riskPercentage', v ? parseFloat(v) : null);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="انتخاب ریسک…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {RISK_PERCENTAGE_OPTIONS.map(v => (
                    <SelectItem key={v} value={String(v)}>
                      {v}٪
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="text" inputMode="decimal" placeholder="یا مقدار دلخواه…"
                value={riskPercentageInput}
                onChange={e => {
                  const value = normalizeDecimalInput(e.target.value);
                  setRiskPercentageInput(value);
                  handleChange('riskPercentage', customDecimalValue(value));
                }}
                className="h-8 text-sm mt-1"
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label>مقدار ریسک ($)</Label>
              <NumericInput value={trade.riskAmount} onValueChange={value => handleChange('riskAmount', value)} />
            </div>
          </div>
        </section>

        {/* ── دلیل ورود ── */}
        {!isQuickMode && !sessionMode && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">۳ب. دلیل ورود</h2>
            <div className="space-y-2">
              <Label>دلیل ورود به معامله</Label>
              <Textarea
                placeholder="چرا وارد این معامله شدید؟ چه چیزی را در چارت دیدید؟ ستاپ چه بود؟"
                value={(trade as any).entryReason || ''}
                onChange={e => handleChange('entryReason' as any, e.target.value || null)}
                className="min-h-[100px]"
              />
            </div>
          </section>
        )}

        {!isQuickMode && !sessionMode && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <h2 className="text-lg font-semibold">۳ج. briefing پیش از معامله</h2>
              <span className="text-xs text-muted-foreground">قابل ویرایش و ذخیره</span>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <Label>تصویر ذهنی و برنامهٔ اجرای معامله</Label>
              <Textarea
                placeholder="اگر بازار این شرایط را داشت وارد می‌شوم؛ اگر این شرط نقض شد، معامله را لغو می‌کنم…"
                value={trade.preTradeBriefing || ''}
                onChange={e => handleChange('preTradeBriefing' as any, e.target.value || null)}
                className="min-h-[110px] bg-background/70"
              />
              <p className="text-xs text-muted-foreground">
                این متن همراه معامله ذخیره می‌شود تا قبل و بعد از اجرا بتوانید برنامهٔ اولیه را مقایسه کنید.
              </p>
            </div>
          </section>
        )}

        {/* SECTION 4: Exit Details */}
        {trade.status === 'closed' && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4">
            <h2 className="text-lg font-semibold border-b pb-2">4. Exit Details</h2>
            
            <div className="space-y-2">
              <Label>Result</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 'win', l: 'Win', c: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50' },
                  { v: 'loss', l: 'Loss', c: 'bg-rose-500/20 text-rose-500 border-rose-500/50' },
                  { v: 'breakeven', l: 'Break Even', c: 'bg-slate-500/20 text-slate-500 border-slate-500/50' },
                  { v: 'partial-win', l: 'Partial Win', c: 'bg-teal-500/20 text-teal-500 border-teal-500/50' },
                  { v: 'partial-loss', l: 'Partial Loss', c: 'bg-amber-500/20 text-amber-500 border-amber-500/50' }
                ].map(res => (
                  <Button
                    key={res.v}
                    variant={trade.result === res.v ? 'default' : 'outline'}
                    onClick={() => handleChange('result', res.v)}
                    className={trade.result === res.v ? res.c : ''}
                  >
                    {res.l}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label>Closed At</Label>
                <Input 
                  type="datetime-local" 
                  value={formatDateForInput(trade.closedAt)}
                  onChange={e => handleDateChange('closedAt', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Exit Price</Label>
                <NumericInput value={trade.exitPrice} onValueChange={value => handleChange('exitPrice', value)} />
              </div>
              <div className="space-y-2">
                <Label>P&L</Label>
                <NumericInput value={trade.profitLoss} onValueChange={value => handleChange('profitLoss', value)} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>R Multiple</Label>
                  {computedR && <span className="text-xs text-muted-foreground">Auto: {computedR}R</span>}
                </div>
                <NumericInput value={trade.rMultiple} onValueChange={value => handleChange('rMultiple', value)} />
              </div>
              <div className="space-y-2">
                <Label>سایر هزینه‌ها</Label>
                <NumericInput value={trade.fees} onValueChange={value => handleChange('fees', value)} />
              </div>
              <div className="space-y-2">
                <Label>کمیسیون</Label>
                <NumericInput value={trade.commission ?? null} onValueChange={value => handleChange('commission', value)} />
              </div>
              <div className="space-y-2">
                <Label>اسپرد</Label>
                <NumericInput value={trade.spread ?? null} onValueChange={value => handleChange('spread', value)} />
              </div>
              <div className="space-y-2">
                <Label>سواپ <span className="text-[10px] text-muted-foreground">(منفی = هزینه)</span></Label>
                <NumericInput value={trade.swap ?? null} onValueChange={value => handleChange('swap', value)} />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Reason for Exit</Label>
                <Input value={trade.reasonForExit || ''} onChange={e => handleChange('reasonForExit', e.target.value)} placeholder="Hit target, trailed stop, etc." />
              </div>
              {trade.profitLoss !== null && (
                <div className="lg:col-span-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">سود/زیان خالص پس از هزینه‌ها: </span>
                  <strong className={netPnl !== null && netPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'} dir="ltr">
                    {netPnl?.toFixed(2)}
                  </strong>
                  <span className="text-xs text-muted-foreground"> (کمیسیون، اسپرد و سایر هزینه‌ها کسر و سواپ اعمال شده است)</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── مدیریت معامله ── */}
        {!isQuickMode && trade.status === 'closed' && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">۴ب. مدیریت معامله</h2>
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { key: 'slMoved',         label: 'جابجایی حد ضرر' },
                { key: 'tpMoved',         label: 'جابجایی حد سود' },
                { key: 'partialClose',    label: 'بستن بخشی از پوزیشن' },
                { key: 'addedToPosition', label: 'افزودن به پوزیشن' },
                { key: 'reducedPosition', label: 'کاهش پوزیشن' },
                { key: 'manualExit',      label: 'خروج دستی' },
              ].map(item => {
                const val = (trade as any)[item.key];
                return (
                  <button key={item.key}
                    onClick={() => handleChange(item.key as any, val === true ? false : val === false ? null : true)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm text-right transition-colors ${
                      val === true ? 'border-primary bg-primary/10 text-primary' :
                      val === false ? 'border-muted-foreground/30 text-muted-foreground/50' :
                      'border-border hover:border-primary/40'
                    }`}>
                    {val === true ? <CheckSquare className="w-4 h-4 shrink-0" /> :
                     val === false ? <Square className="w-4 h-4 shrink-0 opacity-40" /> :
                     <Square className="w-4 h-4 shrink-0" />}
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label>توضیح تصمیمات مدیریت</Label>
              <Textarea
                placeholder="چرا حد ضرر را جابجا کردید؟ دلیل خروج زودهنگام چه بود؟"
                value={(trade as any).managementReason || ''}
                onChange={e => handleChange('managementReason' as any, e.target.value || null)}
                className="min-h-[80px]"
              />
            </div>
          </section>
        )}

        {/* SECTION 5: Strategy Adherence */}
        {(trade.sessionId || sessionId) && !sessionMode && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold border-b pb-2">5. Strategy Adherence</h2>
            
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Linked Session</div>
                    <div className="font-semibold">{linkedStrategy?.name || 'Unknown Strategy'}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation(`/analysis/${trade.sessionId || sessionId}`)}>
                    View Session
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Adherence Score</span>
                      <span className="font-bold">{trade.adherenceScore ?? 0}%</span>
                    </div>
                    <Progress value={trade.adherenceScore ?? 0} className="h-2" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>How well did you follow the rules?</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { v: 'fully', l: 'Fully Followed', c: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50' },
                        { v: 'mostly', l: 'Mostly Followed', c: 'bg-teal-500/20 text-teal-500 border-teal-500/50' },
                        { v: 'partially', l: 'Partially Followed', c: 'bg-amber-500/20 text-amber-500 border-amber-500/50' },
                        { v: 'not', l: 'Did Not Follow', c: 'bg-rose-500/20 text-rose-500 border-rose-500/50' }
                      ].map(rating => (
                        <Button
                          key={rating.v}
                          variant={trade.adherenceRating === rating.v ? 'default' : 'outline'}
                          onClick={() => handleChange('adherenceRating', rating.v)}
                          className={trade.adherenceRating === rating.v ? rating.c : ''}
                        >
                          {rating.l}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Adherence Notes</Label>
                    <Textarea 
                      placeholder="Why did you deviate from the rules?"
                      value={trade.adherenceNotes || ''}
                      onChange={e => handleChange('adherenceNotes', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* SECTION 6: Emotions — به فارسی */}
        {!isQuickMode && !sessionMode && (<section className="space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">۶. وضعیت احساسی</h2>
          <div className="flex flex-wrap gap-2">
            {availableEmotions.map(emo => {
              const isSelected = currentEmotions.includes(emo.id);
              return (
                <button
                  key={emo.id}
                  onClick={() => toggleEmotion(emo.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isSelected 
                      ? `${emo.color} text-white shadow-md scale-105` 
                      : `bg-muted/50 text-muted-foreground hover:bg-muted border border-border`
                  }`}
                >
                  {emo.label}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            <Label>یادداشت احساسی</Label>
            <Textarea 
              placeholder="در طول این معامله چه احساسی داشتید؟"
              value={trade.emotionNotes || ''}
              onChange={e => handleChange('emotionNotes', e.target.value)}
            />
          </div>
        </section>)}

        {/* ── تحلیل چند تایم‌فریمی (MTF) ── */}
        {!isQuickMode && !sessionMode && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">۶ب. تحلیل چند تایم‌فریمی</h2>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
              <span className="text-xs text-muted-foreground">تایم‌فریم‌ها:</span>
              {mtfTimeframes.map(tf => (
                <span key={tf} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs">
                  {tf}
                  {mtfTimeframes.length > 1 && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        const next = { ...mtfAnalysis };
                        delete next[tf];
                        handleChange('mtfAnalysis' as any, JSON.stringify({ ...next, __timeframes: mtfTimeframes.filter(item => item !== tf) }));
                      }}
                      aria-label={`حذف تایم‌فریم ${tf}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  value={newMtfTimeframe}
                  onChange={e => setNewMtfTimeframe(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMtfTimeframe(); } }}
                  placeholder="مثلاً 1H"
                  className="h-7 w-24 text-xs"
                  dir="ltr"
                />
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addMtfTimeframe}>
                  <Plus className="h-3 w-3" /> افزودن
                </Button>
              </div>
            </div>
            {mtfTimeframes.map(tf => {
              const tfData = mtfAnalysis[tf] || {};
              const update = (field: string, value: string) => {
                const newMtf = { ...mtfAnalysis, [tf]: { ...tfData, [field]: value }, __timeframes: mtfTimeframes };
                handleChange('mtfAnalysis' as any, JSON.stringify(newMtf));
              };
              return (
                <Card key={tf} className="bg-muted/10">
                  <CardContent className="p-4 space-y-3">
                    <div className="font-semibold text-sm">{tf}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">بایاس / جهت</Label>
                        <Input value={tfData.bias || ''} onChange={e => update('bias', e.target.value)} placeholder="صعودی / نزولی / خنثی" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">ساختار بازار</Label>
                        <Input value={tfData.structure || ''} onChange={e => update('structure', e.target.value)} placeholder="HH/HL، LL/LH" className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">زمینه و یادداشت</Label>
                        <Textarea value={tfData.notes || ''} onChange={e => update('notes', e.target.value)} placeholder={`تحلیل ${tf} را وارد کنید…`} className="min-h-[60px] text-sm" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm">سناریوهای شرطی خرید و فروش</h3>
                  <p className="text-xs text-muted-foreground mt-1">برای هر تایم‌فریم، trigger، شرط نقض و اقدام بعدی را ثبت کنید.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={newScenarioDirection} onValueChange={value => setNewScenarioDirection(value as MTFScenario['direction'])}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">هر دو جهت</SelectItem>
                      <SelectItem value="long">خرید (Long)</SelectItem>
                      <SelectItem value="short">فروش (Short)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={newScenarioTimeframe}
                    onChange={e => setNewScenarioTimeframe(e.target.value)}
                    placeholder="تایم‌فریم"
                    className="h-8 w-24 text-xs"
                    dir="ltr"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={addMtfScenario}>
                    <Plus className="h-3 w-3" /> سناریو
                  </Button>
                </div>
              </div>
              {mtfScenarios.length === 0 ? (
                <p className="rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                  هنوز سناریویی ثبت نشده است. سناریوهای جایگزین، شرط ورود و نقطهٔ لغو را اینجا نگه دارید.
                </p>
              ) : (
                <div className="space-y-3">
                  {mtfScenarios.map((scenario, index) => (
                    <div key={scenario.id} className="rounded-lg border bg-card/70 p-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-primary">سناریو {index + 1}</span>
                        <Select
                          value={scenario.direction}
                          onValueChange={value => updateMtfScenarios(mtfScenarios.map(item => item.id === scenario.id ? { ...item, direction: value as MTFScenario['direction'] } : item))}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="both">هر دو جهت</SelectItem>
                            <SelectItem value="long">خرید (Long)</SelectItem>
                            <SelectItem value="short">فروش (Short)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={scenario.timeframe}
                          onChange={e => updateMtfScenarios(mtfScenarios.map(item => item.id === scenario.id ? { ...item, timeframe: e.target.value.toUpperCase() } : item))}
                          className="h-8 w-24 text-xs"
                          dir="ltr"
                          placeholder="15M"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mr-auto h-8 text-xs text-destructive hover:text-destructive"
                          onClick={() => updateMtfScenarios(mtfScenarios.filter(item => item.id !== scenario.id))}
                        >
                          <X className="h-3.5 w-3.5 ml-1" /> حذف
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">شرط فعال‌شدن (Trigger)</Label>
                          <Textarea
                            value={scenario.trigger}
                            onChange={e => updateMtfScenarios(mtfScenarios.map(item => item.id === scenario.id ? { ...item, trigger: e.target.value } : item))}
                            placeholder="مثلاً شکست سقف و تثبیت"
                            className="min-h-[64px] text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">شرط نقض (Invalidation)</Label>
                          <Textarea
                            value={scenario.invalidation}
                            onChange={e => updateMtfScenarios(mtfScenarios.map(item => item.id === scenario.id ? { ...item, invalidation: e.target.value } : item))}
                            placeholder="چه چیزی سناریو را باطل می‌کند؟"
                            className="min-h-[64px] text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">اقدام بعدی</Label>
                          <Textarea
                            value={scenario.action}
                            onChange={e => updateMtfScenarios(mtfScenarios.map(item => item.id === scenario.id ? { ...item, action: e.target.value } : item))}
                            placeholder="ورود، صبر، لغو یا بررسی مجدد"
                            className="min-h-[64px] text-xs"
                          />
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scenario.enabled}
                          onChange={e => updateMtfScenarios(mtfScenarios.map(item => item.id === scenario.id ? { ...item, enabled: e.target.checked } : item))}
                        />
                        سناریو در briefing فعال باشد
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* SECTION 7: Screenshots */}
        {!sessionMode && (<section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">۷. اسکرین‌شات‌ها</h2>
          <ScreenshotManager
            trade={trade}
            allTrades={allTrades}
            onChange={screenshots => handleChange('screenshots', JSON.stringify(screenshots))}
          />
        </section>)}
        {sessionMode && <TradeMediaSection trade={trade} />}

        {/* SECTION 8: Review */}
        {!isQuickMode && !sessionMode && trade.status === 'closed' && (
          <section className="space-y-6 animate-in slide-in-from-bottom-4">
            <h2 className="text-lg font-semibold border-b pb-2">8. Trade Review</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>What did I do well?</Label>
                <Textarea 
                  value={review.didWell || ''} 
                  onChange={e => handleChange('review', JSON.stringify({ ...review, didWell: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>What did I do wrong?</Label>
                <Textarea 
                  value={review.didWrong || ''} 
                  onChange={e => handleChange('review', JSON.stringify({ ...review, didWrong: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>What did I learn?</Label>
                <Textarea 
                  value={review.learned || ''} 
                  onChange={e => handleChange('review', JSON.stringify({ ...review, learned: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Would I take this trade again?</Label>
                <div className="flex gap-2">
                  {['yes', 'no', 'maybe'].map(val => (
                    <Button
                      key={val}
                      variant={review.wouldTakeAgain === val ? 'default' : 'outline'}
                      onClick={() => handleChange('review', JSON.stringify({ ...review, wouldTakeAgain: val }))}
                      className="flex-1 capitalize"
                    >
                      {val}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Was this a valid setup?</Label>
                <div className="flex gap-2">
                  {['yes', 'no', 'unclear'].map(val => (
                    <Button
                      key={val}
                      variant={review.validSetup === val ? 'default' : 'outline'}
                      onClick={() => handleChange('review', JSON.stringify({ ...review, validSetup: val }))}
                      className="flex-1 capitalize"
                    >
                      {val}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 9: Notes & Tags */}
        {!isQuickMode && (<section className="space-y-6">
          <h2 className="text-lg font-semibold border-b pb-2">{sessionMode ? "9. یادداشت" : "9. Notes & Tags"}</h2>
          <div className="space-y-4">
            {!sessionMode && (
            <div className="space-y-2">
              <Label>Tags</Label>
              <Input 
                 placeholder="با Enter برچسب اضافه کنید (مثلاً FVG، اسکالپ)"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if (val && !tags.includes(val)) {
                      handleChange('tags', JSON.stringify([...tags, val]));
                      e.currentTarget.value = '';
                    }
                  }
                }}
              />
              {journalCustomTags.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  برچسب‌های شخصی شما: {journalCustomTags.join('، ')}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map(tag => (
                  <span key={tag} className="bg-primary/10 text-primary px-2 py-1 rounded-md text-sm flex items-center gap-1">
                    {tag}
                    <X 
                      className="w-3 h-3 cursor-pointer hover:text-primary/70" 
                      onClick={() => handleChange('tags', JSON.stringify(tags.filter(t => t !== tag)))} 
                    />
                  </span>
                ))}
              </div>
            </div>
            )}
            <div className="space-y-2">
              <Label>General Notes</Label>
              <Textarea 
                placeholder="Any additional thoughts on this trade..."
                value={trade.notes || ''}
                onChange={e => handleChange('notes', e.target.value)}
                className="min-h-[120px]"
              />
            </div>
          </div>
        </section>)}

      </div>

    </div>
  );
}
