import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRoute, useLocation } from 'wouter';
import {
  marketContextService,
  MarketContextSession as MCSession,
  MarketContextDecision,
  MarketContextTradePlan,
  TFAnalysisData,
  MarketHistoricalAnalysis,
  BehavioralReminder,
  RuleMatch,
  SimilarTradeMatch,
  HistoricalStats,
  PatternInsight,
  PreTradeBriefing,
  LessonProposal,
  SETUP_LABELS,
  SESSION_LABELS,
  DOW_LABELS,
  runAndSaveAnalysis,
  buildPreTradeBriefing,
  generateLessonProposals,
  approveLessonToKnowledgeBase,
} from '../services/marketContextService';
import { defaultTFAnalysis, Trade } from '../db/database';
import { db } from '../db/database';
import StoredImage from '../components/StoredImage';
import { extractFeaturesFromText } from '../services/visualAnalysisService';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useToast } from '../hooks/use-toast';
import {
  ArrowRight, Layers, Save, Search, TrendingUp, TrendingDown, Minus,
  Upload, Image as ImageIcon, AlertTriangle, CheckCircle2, HelpCircle,
  BookOpen, Clock, BarChart2, Brain, Zap, RefreshCw, ChevronDown,
  ChevronRight, Star, Target, Shield, AlertCircle, Eye, Plus, Trash2,
  GitBranch, Activity, Calendar, History, Lightbulb, ThumbsUp, ThumbsDown,
  Sparkles, XCircle, BookMarked, DollarSign, TrendingUp as TrendUp,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────

function parseJSON<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

const SESSION_OPTIONS: { value: string; label: string }[] = [
  { value: 'asian', label: '🌏 سشن آسیا' },
  { value: 'london', label: '🇬🇧 سشن لندن' },
  { value: 'overlap', label: '🔄 اوورلپ لندن/نیویورک' },
  { value: 'newyork', label: '🗽 سشن نیویورک' },
  { value: 'custom', label: '⚙️ سفارشی' },
];

const SETUP_OPTIONS: { value: string; label: string }[] = [
  { value: 'continuation', label: '↗️ ادامه‌دهنده (Continuation)' },
  { value: 'reversal', label: '↩️ بازگشتی (Reversal)' },
  { value: 'breakout', label: '⚡ شکست (Breakout)' },
  { value: 'pullback', label: '↘️ پولبک (Pullback)' },
  { value: 'range', label: '↔️ رنج (Range)' },
  { value: 'liquidity-sweep', label: '🌊 لیکوئیدیتی سویپ' },
  { value: 'custom', label: '✏️ سفارشی' },
];

const BIAS_OPTIONS = [
  { value: 'bullish', label: '📈 صعودی', icon: TrendingUp, color: 'text-green-400' },
  { value: 'bearish', label: '📉 نزولی', icon: TrendingDown, color: 'text-red-400' },
  { value: 'neutral', label: '↔️ خنثی', icon: Minus, color: 'text-muted-foreground' },
] as const;

const TF_CONFIG = [
  { key: '4h' as const, label: '4H', desc: 'زمینه کلی بازار', color: 'text-purple-400' },
  { key: '15m' as const, label: '15M', desc: 'ساختار میانی', color: 'text-blue-400' },
  { key: '5m' as const, label: '5M', desc: 'توسعه ستاپ', color: 'text-cyan-400' },
  { key: '1m' as const, label: '1M', desc: 'اجرای ورود', color: 'text-green-400' },
];

const RULE_STATUS_CONFIG = {
  confirmed:     { label: '✅ تأیید شده',    cls: 'text-green-400 bg-green-500/10' },
  partial:       { label: '⚠️ ناقص',         cls: 'text-yellow-400 bg-yellow-500/10' },
  'not-confirmed': { label: '❌ تأیید نشده', cls: 'text-red-400 bg-red-500/10' },
  unknown:       { label: '❓ نامشخص',        cls: 'text-muted-foreground bg-muted/20' },
};

// ── Sub-components ────────────────────────────────────────────────

function StatsCard({ title, stats, icon: Icon }: {
  title: string;
  stats: HistoricalStats;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">تعداد نمونه</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">{stats.sampleSize}</span>
            <span className={`text-[10px] px-1 py-0.5 rounded ${
              stats.confidence === 'high' ? 'bg-green-500/10 text-green-400' :
              stats.confidence === 'moderate' ? 'bg-yellow-500/10 text-yellow-400' :
              'bg-red-500/10 text-red-400'
            }`}>
              {stats.confidence === 'high' ? 'قابل اعتماد' : stats.confidence === 'moderate' ? 'متوسط' : 'کم'}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">نرخ برد</span>
          <span className={`text-sm font-bold ${stats.winRate >= 60 ? 'text-green-400' : stats.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
            {stats.winRate}%
          </span>
        </div>
        {stats.avgR !== null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">میانگین R</span>
            <span className={`text-sm font-bold ${stats.avgR > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.avgR > 0 ? '+' : ''}{stats.avgR.toFixed(2)}R
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {stats.avgWin !== null && (
            <div className="p-1.5 rounded bg-green-500/5 border border-green-500/20 text-center">
              <p className="text-[10px] text-muted-foreground">میانگین برد</p>
              <p className="text-xs font-bold text-green-400">+{stats.avgWin.toFixed(2)}R</p>
            </div>
          )}
          {stats.avgLoss !== null && (
            <div className="p-1.5 rounded bg-red-500/5 border border-red-500/20 text-center">
              <p className="text-[10px] text-muted-foreground">میانگین ضرر</p>
              <p className="text-xs font-bold text-red-400">{stats.avgLoss.toFixed(2)}R</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>برد / ضرر</span>
          <span>{stats.wins}W / {stats.losses}L</span>
        </div>
        {stats.mostCommonMistake && (
          <div className="p-2 rounded bg-red-500/5 border border-red-500/20">
            <p className="text-[10px] text-muted-foreground">رایج‌ترین اشتباه</p>
            <p className="text-xs text-red-400">{stats.mostCommonMistake}</p>
          </div>
        )}
        {stats.mostSuccessfulBehavior && (
          <div className="p-2 rounded bg-green-500/5 border border-green-500/20">
            <p className="text-[10px] text-muted-foreground">رفتار موفق</p>
            <p className="text-xs text-green-400">{stats.mostSuccessfulBehavior}</p>
          </div>
        )}
        {stats.note && (
          <div className="flex items-start gap-1.5 p-2 rounded bg-yellow-500/5 border border-yellow-500/20">
            <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-yellow-400">{stats.note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TFAnalysisPanel({ tf, data, onChange }: {
  tf: typeof TF_CONFIG[number];
  data: TFAnalysisData;
  onChange: (d: TFAnalysisData) => void;
}) {
  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      // Simple feature extraction from filename/label
      onChange({
        ...data,
        screenshot: {
          dataUrl,
          label: `${tf.label} تحلیل`,
          uploadedAt: Date.now(),
          detectedFeatures: [],
        },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      {/* Screenshot upload */}
      <div>
        {data.screenshot ? (
          <div className="relative rounded-lg overflow-hidden border border-border/40">
            <StoredImage
              source={data.screenshot.dataUrl}
              alt={`${tf.label} chart`}
              enableViewer
              showDownload
              filename={`${tf.label}-chart`}
              className="w-full max-h-48 object-contain bg-black/20"
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded bg-background/80 font-medium ${tf.color}`}>{tf.label}</span>
            </div>
            <button
              onClick={() => onChange({ ...data, screenshot: null })}
              className="absolute top-2 left-2 p-1 rounded bg-background/80 hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border/40 rounded-lg cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all">
            <Upload className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground">آپلود اسکرین‌شات {tf.label}</span>
            <input type="file" accept="image/*" onChange={handleScreenshot} className="hidden" />
          </label>
        )}
      </div>

      {/* Trend */}
      <div>
        <label className="text-xs text-muted-foreground">روند {tf.label}</label>
        <div className="flex gap-2 mt-1.5">
          {(['up', 'down', 'sideways'] as const).map(t => (
            <button key={t} onClick={() => onChange({ ...data, trend: t })}
              className={`flex-1 py-1.5 rounded-lg text-xs border transition-all ${
                data.trend === t ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border/40 text-muted-foreground hover:bg-muted/30'
              }`}>
              {t === 'up' ? '📈 صعودی' : t === 'down' ? '📉 نزولی' : '↔️ خنثی'}
            </button>
          ))}
        </div>
      </div>

      {/* Key levels */}
      <div>
        <label className="text-xs text-muted-foreground">سطوح کلیدی (با کاما جدا کنید)</label>
        <Input
          value={data.keyLevels}
          onChange={e => onChange({ ...data, keyLevels: e.target.value })}
          placeholder="مثال: 1920.50, 1918.00, 1915.80"
          className="mt-1 h-8 text-xs font-mono"
        />
      </div>

      {/* Notes with detected features */}
      <div>
        <label className="text-xs text-muted-foreground">تحلیل و مشاهدات {tf.label}</label>
        <Textarea
          value={data.notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
          placeholder={`تحلیل تایم‌فریم ${tf.label} — ${tf.desc}...`}
          rows={4}
          className="mt-1 text-xs resize-none"
        />
        <DetectedFeatureTags notes={data.notes} />
      </div>
    </div>
  );
}

/** نمایش ویژگی‌های شناسایی‌شده از متن تحلیل کاربر */
function DetectedFeatureTags({ notes }: { notes: string }) {
  const features = useMemo(() => {
    if (!notes || notes.trim().length < 10) return [];
    return extractFeaturesFromText(notes).slice(0, 8);
  }, [notes]);

  if (features.length === 0) return null;

  const FEATURE_FA: Record<string, string> = {
    'bullish-impulse': 'ایمپالس صعودی', 'bearish-impulse': 'ایمپالس نزولی',
    'strong-displacement': 'جابجایی قوی', 'small-range-consolidation': 'تراکم کوچک',
    'large-range-consolidation': 'تراکم بزرگ', 'trend-up': 'روند صعودی',
    'trend-down': 'روند نزولی', 'range': 'رنج', 'expansion': 'انبساط',
    'compression': 'فشردگی', 'reversal': 'بازگشت', 'breakout': 'شکست',
    'false-breakout': 'شکست کاذب', 'higher-highs': 'HH', 'higher-lows': 'HL',
    'lower-highs': 'LH', 'lower-lows': 'LL', 'break-of-structure': 'BOS',
    'change-of-character': 'CHOCH', 'swing-structure': 'سوئینگ',
    'shallow-retracement': 'پولبک کم‌عمق', 'medium-retracement': 'پولبک متوسط',
    'deep-retracement': 'پولبک عمیق', 'rejection': 'رد قیمت',
    'strong-continuation': 'ادامه قوی', 'fib-61.8': 'فیب ۶۱.۸',
    'fib-50': 'فیب ۵۰', 'fib-38.2': 'فیب ۳۸.۲', 'range-breakout': 'شکست رنج',
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1 items-center">
      <span className="text-[9px] text-muted-foreground shrink-0">از متن شناسایی شد:</span>
      {features.map(f => (
        <span key={f} className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
          {FEATURE_FA[f] ?? f}
        </span>
      ))}
    </div>
  );
}

/** لینک معامله تکمیل‌شده به جلسه و نمایش مقایسه نتیجه — Section 22 */
function LinkedTradeSection({ session, onUpdate }: {
  session: MCSession;
  onUpdate: (fields: Partial<MCSession>) => Promise<void>;
}) {
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [linkedTrade, setLinkedTrade] = useState<Trade | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    db.trades.where('status').equals('closed').toArray().then(trades => {
      const sorted = trades.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setAllTrades(sorted);
    });
  }, []);

  useEffect(() => {
    if (session.linkedTradeId) {
      db.trades.get(session.linkedTradeId).then(t => setLinkedTrade(t ?? null));
    } else {
      setLinkedTrade(null);
    }
  }, [session.linkedTradeId]);

  const filtered = allTrades.filter(t =>
    (!search || t.symbol?.includes(search.toUpperCase()) || t.id === search) &&
    (!session.symbol || t.symbol === session.symbol)
  ).slice(0, 6);

  const ptr = linkedTrade ? parseJSON<import('../db/database').PostTradeReviewData>(linkedTrade.postTradeReview, {} as import('../db/database').PostTradeReviewData) : null;

  if (linkedTrade) {
    const isWin = linkedTrade.result === 'win';
    return (
      <div className="space-y-2">
        <div className={`border rounded-lg p-3 space-y-2 ${isWin ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                {isWin ? '✅ برد' : '❌ ضرر'}
              </span>
              <span className="text-xs text-muted-foreground">{linkedTrade.symbol} · {linkedTrade.createdAt ? new Date(linkedTrade.createdAt).toLocaleDateString('fa-IR') : ''}</span>
            </div>
            {linkedTrade.rMultiple != null && (
              <span className={`text-sm font-bold font-mono ${linkedTrade.rMultiple > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {linkedTrade.rMultiple > 0 ? '+' : ''}{linkedTrade.rMultiple.toFixed(2)}R
              </span>
            )}
          </div>
          {ptr?.analysisNotes && (
            <div className="flex items-start gap-1.5">
              <Lightbulb className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-300">{ptr.analysisNotes}</p>
            </div>
          )}
          {ptr?.userReflection && (
            <p className="text-[10px] text-muted-foreground">{ptr.userReflection}</p>
          )}
          <button
            onClick={() => onUpdate({ linkedTradeId: null })}
            className="text-[10px] text-muted-foreground hover:text-destructive underline"
          >
            حذف لینک
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={`جستجوی معامله ${session.symbol ?? ''}...`}
        className="h-7 text-xs"
      />
      {filtered.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => onUpdate({ linkedTradeId: t.id, status: 'completed' })}
              className="w-full flex items-center justify-between p-2 rounded border border-border/40 hover:bg-muted/30 text-xs text-right transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.symbol}</span>
                <span className="text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString('fa-IR') : ''}</span>
                <span className={t.direction === 'long' ? 'text-green-400' : 'text-red-400'}>{t.direction === 'long' ? '↑' : '↓'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={t.result === 'win' ? 'text-green-400' : t.result === 'loss' ? 'text-red-400' : 'text-muted-foreground'}>
                  {t.result === 'win' ? '✅' : t.result === 'loss' ? '❌' : '—'}
                </span>
                {t.rMultiple != null && (
                  <span className={`font-mono ${t.rMultiple > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.rMultiple > 0 ? '+' : ''}{t.rMultiple.toFixed(2)}R
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground text-center py-2">
          {allTrades.length === 0 ? 'هنوز معامله‌ای ثبت نشده' : `معامله‌ای برای ${session.symbol ?? ''} یافت نشد`}
        </p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function MarketContextSessionPage() {
  const [, params] = useRoute('/market-context/:id');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const sessionId = params?.id;

  const [session, setSession] = useState<MCSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('analysis');
  const [activeTF, setActiveTF] = useState<'4h' | '15m' | '5m' | '1m'>('4h');
  const [analysis, setAnalysis] = useState<MarketHistoricalAnalysis | null>(null);
  const [briefing, setBriefing] = useState<PreTradeBriefing | null>(null);
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [tradeDetails, setTradeDetails] = useState<Record<string, Trade>>({});

  // Lesson loop state
  const [lessonProposals, setLessonProposals] = useState<LessonProposal[]>([]);
  const [dismissedLessons, setDismissedLessons] = useState<Set<string>>(new Set());
  const [approvedLessons, setApprovedLessons] = useState<Set<string>>(new Set());
  const [approvingLesson, setApprovingLesson] = useState<string | null>(null);

  // Decision state
  const [decisionChoice, setDecisionChoice] = useState<MarketContextDecision['choice']>('wait');
  const [decisionEntry, setDecisionEntry] = useState('');
  const [decisionSL, setDecisionSL] = useState('');
  const [decisionTP, setDecisionTP] = useState('');
  const [decisionRisk, setDecisionRisk] = useState('');
  const [decisionConf, setDecisionConf] = useState(5);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionImportant, setDecisionImportant] = useState('');
  const [decisionIgnored, setDecisionIgnored] = useState('');
  const [decisionInvalidation, setDecisionInvalidation] = useState('');

  const load = useCallback(async () => {
    if (!sessionId) return;
    const s = await marketContextService.getById(sessionId);
    if (!s) { setLocation('/market-context'); return; }
    setSession(s);
    if (s.historicalAnalysis) {
      const a = parseJSON<MarketHistoricalAnalysis>(s.historicalAnalysis, null as unknown as MarketHistoricalAnalysis);
      setAnalysis(a);
      if (a) setBriefing(buildPreTradeBriefing(a, s));
    }
    if (s.finalDecision) {
      const d = parseJSON<MarketContextDecision>(s.finalDecision, null as unknown as MarketContextDecision);
      if (d) {
        setDecisionChoice(d.choice);
        setDecisionEntry(d.entry?.toString() ?? '');
        setDecisionSL(d.stopLoss?.toString() ?? '');
        setDecisionTP(d.takeProfit?.toString() ?? '');
        setDecisionRisk(d.riskPercent?.toString() ?? '');
        setDecisionConf(d.confidence);
        setDecisionReason(d.reasoning);
        setDecisionImportant(d.mostImportantInfo);
        setDecisionIgnored(d.ignoredInfo);
        setDecisionInvalidation(d.invalidation);
      }
    }
    setLoading(false);
  }, [sessionId, setLocation]);

  useEffect(() => { load(); }, [load]);

  const getTFData = (tf: '4h' | '15m' | '5m' | '1m'): TFAnalysisData => {
    if (!session) return defaultTFAnalysis;
    const key = tf === '4h' ? 'tf4h' : tf === '15m' ? 'tf15m' : tf === '5m' ? 'tf5m' : 'tf1m';
    return parseJSON<TFAnalysisData>(session[key], defaultTFAnalysis);
  };

  const handleTFChange = async (tf: '4h' | '15m' | '5m' | '1m', data: TFAnalysisData) => {
    if (!session) return;
    await marketContextService.saveTFAnalysis(session.id, tf, data);
    const key = tf === '4h' ? 'tf4h' : tf === '15m' ? 'tf15m' : tf === '5m' ? 'tf5m' : 'tf1m';
    setSession(prev => prev ? { ...prev, [key]: JSON.stringify(data) } : prev);
  };

  const handleFieldUpdate = async (fields: Partial<MCSession>) => {
    if (!session) return;
    await marketContextService.update(session.id, fields);
    setSession(prev => prev ? { ...prev, ...fields } : prev);
  };

  const handleRunAnalysis = async () => {
    if (!session) return;
    setAnalyzing(true);
    try {
      const a = await runAndSaveAnalysis(session.id);
      if (a) {
        setAnalysis(a);
        setBriefing(buildPreTradeBriefing(a, session));
        setSession(prev => prev ? { ...prev, status: 'analyzed', historicalAnalysis: JSON.stringify(a) } : prev);
        // Generate lesson proposals from analysis
        const proposals = generateLessonProposals(a, session);
        setLessonProposals(proposals);
        setDismissedLessons(new Set());
        setApprovedLessons(new Set());
        toast({ title: `تحلیل کامل شد — ${a.similarTrades.length} معامله مشابه، ${proposals.length} درس پیشنهادی` });
        setActiveTab('history');
      }
    } catch {
      toast({ title: 'خطا در تحلیل', variant: 'destructive' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApproveLesson = async (proposal: LessonProposal) => {
    setApprovingLesson(proposal.id);
    try {
      await approveLessonToKnowledgeBase(proposal);
      setApprovedLessons(prev => new Set([...prev, proposal.id]));
      toast({ title: 'درس به پایگاه دانش اضافه شد', description: proposal.title });
    } catch {
      toast({ title: 'خطا در ذخیره درس', variant: 'destructive' });
    } finally {
      setApprovingLesson(null);
    }
  };

  const handleDismissLesson = (id: string) => {
    setDismissedLessons(prev => new Set([...prev, id]));
  };

  const handleSaveDecision = async () => {
    if (!session) return;
    const d: MarketContextDecision = {
      choice: decisionChoice,
      entry: decisionEntry ? parseFloat(decisionEntry) : null,
      stopLoss: decisionSL ? parseFloat(decisionSL) : null,
      takeProfit: decisionTP ? parseFloat(decisionTP) : null,
      riskPercent: decisionRisk ? parseFloat(decisionRisk) : null,
      confidence: decisionConf,
      reasoning: decisionReason,
      mostImportantInfo: decisionImportant,
      ignoredInfo: decisionIgnored,
      invalidation: decisionInvalidation,
      decidedAt: Date.now(),
    };
    await marketContextService.saveDecision(session.id, d);
    setSession(prev => prev ? { ...prev, finalDecision: JSON.stringify(d), status: 'decided' } : prev);
    toast({ title: 'تصمیم ذخیره شد' });
  };

  const loadTradeDetail = async (tradeId: string) => {
    if (tradeDetails[tradeId]) return;
    const t = await db.trades.get(tradeId);
    if (t) setTradeDetails(prev => ({ ...prev, [tradeId]: t }));
  };

  const handleExpandTrade = (id: string) => {
    if (expandedTrade === id) { setExpandedTrade(null); return; }
    setExpandedTrade(id);
    loadTradeDetail(id);
  };

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">بارگذاری جلسه...</span>
        </div>
      </div>
    );
  }

  const biasColor = session.overallBias === 'bullish' ? 'text-green-400'
    : session.overallBias === 'bearish' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div className="max-w-4xl mx-auto pb-20 md:pb-8 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setLocation('/market-context')} className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2 truncate">
              <Layers className="h-5 w-5 text-primary shrink-0" />
              تحلیل زمینه بازار
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {session.date} · {session.time} · {SESSION_LABELS[session.session] ?? session.session}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.status === 'draft' || session.status === 'analyzed' ? (
            <Button onClick={handleRunAnalysis} disabled={analyzing} size="sm" className="gap-1.5 text-xs h-8">
              {analyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{analyzing ? 'در حال تحلیل...' : 'تحلیل تاریخچه'}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Symbol + Context bar */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">نماد</label>
              <Input
                value={session.symbol}
                onChange={e => handleFieldUpdate({ symbol: e.target.value.toUpperCase() })}
                placeholder="XAUUSD"
                className="mt-0.5 h-8 text-sm font-bold uppercase"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">سشن</label>
              <Select value={session.session} onValueChange={v => handleFieldUpdate({ session: v as MCSession['session'] })}>
                <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">تاریخ</label>
              <Input type="date" value={session.date} onChange={e => handleFieldUpdate({ date: e.target.value, dayOfWeek: new Date(e.target.value).getDay() })} className="mt-0.5 h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">ساعت</label>
              <Input type="time" value={session.time} onChange={e => handleFieldUpdate({ time: e.target.value })} className="mt-0.5 h-8 text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pre-trade briefing (if analysis done) */}
      {briefing && briefing.similarCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              خلاصه زمینه تاریخی شخصی شما
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{briefing.similarCount}</p>
                <p className="text-[10px] text-muted-foreground">معامله مشابه</p>
              </div>
              {briefing.winRate !== null && (
                <div className="text-center">
                  <p className={`text-2xl font-bold ${briefing.winRate >= 60 ? 'text-green-400' : briefing.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{briefing.winRate}%</p>
                  <p className="text-[10px] text-muted-foreground">نرخ برد تاریخی</p>
                </div>
              )}
              {briefing.avgR !== null && (
                <div className="text-center">
                  <p className={`text-2xl font-bold ${briefing.avgR > 0 ? 'text-green-400' : 'text-red-400'}`}>{briefing.avgR > 0 ? '+' : ''}{briefing.avgR.toFixed(2)}R</p>
                  <p className="text-[10px] text-muted-foreground">میانگین R</p>
                </div>
              )}
              <div className="text-center">
                <p className={`text-sm font-bold mt-1 ${
                  briefing.confidence === 'high' ? 'text-green-400' :
                  briefing.confidence === 'moderate' ? 'text-yellow-400' : 'text-red-400'
                }`}>{briefing.confidence === 'high' ? 'بالا' : briefing.confidence === 'moderate' ? 'متوسط' : 'کم'}</p>
                <p className="text-[10px] text-muted-foreground">اعتماد</p>
              </div>
            </div>
            {briefing.commonMistake && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded p-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                رایج‌ترین اشتباه: {briefing.commonMistake}
              </div>
            )}
            {briefing.strongestBehavior && (
              <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 rounded p-2 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                قوی‌ترین رفتار: {briefing.strongestBehavior}
              </div>
            )}
            {briefing.sampleNote && (
              <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded p-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {briefing.sampleNote}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              این اطلاعات صرفاً زمینه تاریخی شخصی شماست. تصمیم نهایی با شماست.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-6 h-9 mb-2">
          <TabsTrigger value="analysis" className="text-xs gap-1 px-1">
            <Activity className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">تحلیل MTF</span>
          </TabsTrigger>
          <TabsTrigger value="setup" className="text-xs gap-1 px-1">
            <Target className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">ستاپ</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1 relative px-1">
            <History className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">تاریخچه</span>
            {analysis && analysis.similarTrades.length > 0 && (
              <span className="absolute -top-1 -left-1 w-4 h-4 bg-primary rounded-full text-[8px] flex items-center justify-center text-primary-foreground font-bold">
                {Math.min(analysis.similarTrades.length, 9)}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules" className="text-xs gap-1 px-1">
            <BookOpen className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">قوانین</span>
          </TabsTrigger>
          <TabsTrigger value="decision" className="text-xs gap-1 px-1">
            <Zap className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">تصمیم</span>
          </TabsTrigger>
          <TabsTrigger value="lessons" className="text-xs gap-1 relative px-1">
            <Lightbulb className="h-3.5 w-3.5 shrink-0" /><span className="hidden sm:inline truncate">درس‌ها</span>
            {lessonProposals.filter(p => !dismissedLessons.has(p.id) && !approvedLessons.has(p.id)).length > 0 && (
              <span className="absolute -top-1 -left-1 w-4 h-4 bg-amber-500 rounded-full text-[8px] flex items-center justify-center text-white font-bold">
                {Math.min(lessonProposals.filter(p => !dismissedLessons.has(p.id) && !approvedLessons.has(p.id)).length, 9)}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: MTF Analysis ── */}
        <TabsContent value="analysis" className="space-y-4">
          {/* TF selector */}
          <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
            {TF_CONFIG.map(tf => (
              <button key={tf.key} onClick={() => setActiveTF(tf.key)}
                className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${activeTF === tf.key ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <span className={activeTF === tf.key ? tf.color : ''}>{tf.label}</span>
                <span className="block text-[9px] opacity-60 mt-0.5 hidden sm:block">{tf.desc}</span>
              </button>
            ))}
          </div>

          {/* Active TF panel */}
          {TF_CONFIG.map(tf => (
            <div key={tf.key} className={activeTF === tf.key ? 'block' : 'hidden'}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className={`font-bold ${tf.color}`}>{tf.label}</span>
                    <span className="text-muted-foreground font-normal">— {tf.desc}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TFAnalysisPanel
                    tf={tf}
                    data={getTFData(tf.key)}
                    onChange={d => handleTFChange(tf.key, d)}
                  />
                </CardContent>
              </Card>
            </div>
          ))}

          {/* Overall reasoning */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                تحلیل کلی و استدلال
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">جهت کلی بازار</label>
                <div className="flex gap-2 mt-1.5">
                  {BIAS_OPTIONS.map(b => {
                    const Icon = b.icon;
                    return (
                      <button key={b.value} onClick={() => handleFieldUpdate({ overallBias: b.value as MCSession['overallBias'] })}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs transition-all ${session.overallBias === b.value ? 'border-primary bg-primary/10 font-medium' : 'border-border/40 text-muted-foreground hover:bg-muted/30'}`}>
                        <Icon className={`h-3.5 w-3.5 ${session.overallBias === b.value ? b.color : ''}`} />
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">استدلال کلی</label>
                <Textarea value={session.overallReasoning ?? ''} onChange={e => handleFieldUpdate({ overallReasoning: e.target.value })} placeholder="چرا این تحلیل را دارید؟ چه دلایلی پشتوانه‌ی این جهت‌گیری است؟" rows={3} className="mt-1 text-xs resize-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">سناریوی مورد انتظار</label>
                <Textarea value={session.expectedScenario ?? ''} onChange={e => handleFieldUpdate({ expectedScenario: e.target.value })} placeholder="انتظار دارید بازار چه مسیری طی کند؟" rows={2} className="mt-1 text-xs resize-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">شرایط ابطال</label>
                <Textarea value={session.invalidationConditions ?? ''} onChange={e => handleFieldUpdate({ invalidationConditions: e.target.value })} placeholder="چه اتفاقی تحلیل شما را نقض می‌کند؟" rows={2} className="mt-1 text-xs resize-none" />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleRunAnalysis} disabled={analyzing} className="gap-2">
              {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {analyzing ? 'در حال جستجوی تاریخچه...' : 'جستجو در تاریخچه شخصی'}
            </Button>
          </div>
        </TabsContent>

        {/* ── TAB 2: Setup & Plan ── */}
        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                طبقه‌بندی ستاپ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">نوع ستاپ</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
                  {SETUP_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleFieldUpdate({ setupType: opt.value as MCSession['setupType'] })}
                      className={`p-2.5 rounded-lg border text-right text-xs transition-all ${session.setupType === opt.value ? 'border-primary bg-primary/10' : 'border-border/40 hover:bg-muted/30 text-muted-foreground'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {session.setupType === 'custom' && (
                <div>
                  <label className="text-xs text-muted-foreground">نام ستاپ سفارشی</label>
                  <Input value={session.setupCustom ?? ''} onChange={e => handleFieldUpdate({ setupCustom: e.target.value })} placeholder="نام ستاپ خود را بنویسید..." className="mt-1 h-8" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Setup stats */}
          {analysis?.setupStats && (
            <StatsCard title={`نتایج تاریخی ستاپ: ${session.setupType ? SETUP_LABELS[session.setupType] : ''}`} stats={analysis.setupStats} icon={Target} />
          )}

          {/* Trade Plan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                پلن معاملاتی پیشنهادی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">جهت معامله</label>
                <div className="flex gap-2 mt-1.5">
                  {(['long', 'short'] as const).map(d => (
                    <button key={d} onClick={() => {
                      const current = parseJSON<MarketContextTradePlan>(session.tradePlan, {} as MarketContextTradePlan);
                      marketContextService.saveTradePlan(session.id, { ...current, direction: d });
                      setSession(prev => prev ? { ...prev, tradePlan: JSON.stringify({ ...current, direction: d }) } : prev);
                    }}
                      className={`flex-1 py-2 rounded-lg border text-xs transition-all ${
                        parseJSON<MarketContextTradePlan>(session.tradePlan, {} as MarketContextTradePlan).direction === d
                          ? 'border-primary bg-primary/10 font-medium'
                          : 'border-border/40 text-muted-foreground hover:bg-muted/30'
                      }`}>
                      {d === 'long' ? '📈 Long' : '📉 Short'}
                    </button>
                  ))}
                </div>
              </div>
              {(['entry', 'stopLoss', 'takeProfit', 'riskPercent'] as const).map(field => {
                const plan = parseJSON<MarketContextTradePlan>(session.tradePlan, {} as MarketContextTradePlan);
                const labels: Record<string, string> = { entry: 'قیمت ورود', stopLoss: 'حد ضرر', takeProfit: 'حد سود', riskPercent: 'ریسک (%)' };
                return (
                  <div key={field}>
                    <label className="text-xs text-muted-foreground">{labels[field]}</label>
                    <Input
                      type="number"
                      value={plan[field] ?? ''}
                      onChange={e => {
                        const v = e.target.value ? parseFloat(e.target.value) : null;
                        const updated = { ...plan, [field]: v };
                        // Auto-calc R:R
                        if (updated.entry && updated.stopLoss && updated.takeProfit) {
                          const risk = Math.abs(updated.entry - updated.stopLoss);
                          const reward = Math.abs(updated.takeProfit - updated.entry);
                          updated.rRatio = risk > 0 ? Math.round((reward / risk) * 100) / 100 : null;
                        }
                        marketContextService.saveTradePlan(session.id, updated);
                        setSession(prev => prev ? { ...prev, tradePlan: JSON.stringify(updated) } : prev);
                      }}
                      placeholder={field === 'riskPercent' ? '1.0' : '0.00'}
                      className="mt-1 h-8 text-xs font-mono"
                    />
                  </div>
                );
              })}
              {(() => {
                const plan = parseJSON<MarketContextTradePlan>(session.tradePlan, {} as MarketContextTradePlan);
                return plan.rRatio ? (
                  <div className={`p-2 rounded text-center text-sm font-bold ${plan.rRatio >= 2 ? 'bg-green-500/10 text-green-400' : plan.rRatio >= 1 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                    نسبت R:R = 1:{plan.rRatio}
                  </div>
                ) : null;
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: Historical Comparison ── */}
        <TabsContent value="history" className="space-y-4">
          {!analysis ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">هنوز تحلیل تاریخچه اجرا نشده</p>
              <p className="text-sm mt-1 mb-4">تحلیل را در تب «تحلیل MTF» اجرا کنید</p>
              <Button onClick={handleRunAnalysis} disabled={analyzing} className="gap-2">
                {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {analyzing ? 'در حال جستجو...' : 'شروع جستجوی تاریخچه'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Overall stats */}
              {analysis.overallStats && (
                <StatsCard title="نتایج کلی — معاملات مشابه" stats={analysis.overallStats} icon={BarChart2} />
              )}

              {/* Multi-dim stats */}
              {analysis.multiDimStats && (
                <StatsCard
                  title={`ترکیبی: ${session.symbol} در سشن ${SESSION_LABELS[session.session]}`}
                  stats={analysis.multiDimStats}
                  icon={GitBranch}
                />
              )}

              {/* Session + DOW stats side by side */}
              <div className="grid sm:grid-cols-2 gap-3">
                {analysis.sessionStats && <StatsCard title={`سشن ${SESSION_LABELS[session.session]}`} stats={analysis.sessionStats} icon={Clock} />}
                {analysis.dowStats && <StatsCard title={`${DOW_LABELS[session.dayOfWeek]}ها`} stats={analysis.dowStats} icon={Calendar} />}
              </div>

              {/* Time of day stats */}
              {analysis.timeOfDayStats && (
                <StatsCard title={`ساعت ${session.time} (±۲ ساعت)`} stats={analysis.timeOfDayStats} icon={Clock} />
              )}

              {/* Pattern insights */}
              {analysis.patternInsights.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      الگوهای رفتاری شخصی
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {analysis.patternInsights.map((p, i) => (
                      <div key={i} className="p-2.5 rounded-lg border border-border/40 bg-muted/10">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{p.pattern}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold ${p.rate >= 60 ? 'text-green-400' : p.rate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{p.rate}% موفق</span>
                            <span className="text-[10px] text-muted-foreground">({p.count}/{p.total})</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{p.suggestion}</p>
                        <div className="mt-1.5 bg-muted/30 rounded-full h-1.5">
                          <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${p.rate}%` }} />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Similar trade cards */}
              {analysis.similarTrades.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 justify-between">
                      <span className="flex items-center gap-2">
                        <History className="h-4 w-4 text-primary" />
                        معاملات مشابه
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">{analysis.similarTrades.length} مورد</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {analysis.similarTrades.map((t, i) => (
                      <div key={t.tradeId} className="border border-border/40 rounded-lg overflow-hidden">
                        <button
                          onClick={() => handleExpandTrade(t.tradeId)}
                          className="w-full flex items-center justify-between p-2.5 hover:bg-muted/20 transition-colors text-right"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                            <span className="font-medium text-sm">{t.symbol}</span>
                            <span className={`text-xs ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                              {t.direction === 'long' ? '↑' : '↓'}
                            </span>
                            <span className={`text-xs ${t.result === 'win' ? 'text-green-400' : t.result === 'loss' ? 'text-red-400' : 'text-muted-foreground'}`}>
                              {t.result === 'win' ? '✅' : t.result === 'loss' ? '❌' : '—'}
                            </span>
                            {t.rMultiple !== null && (
                              <span className={`text-xs font-mono ${t.rMultiple > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {t.rMultiple > 0 ? '+' : ''}{t.rMultiple.toFixed(2)}R
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex flex-wrap gap-1 justify-end max-w-48">
                              {t.matchReasons.slice(0, 2).map((r, j) => (
                                <span key={j} className="text-[9px] bg-primary/10 text-primary px-1 rounded">{r}</span>
                              ))}
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">{t.score}%</span>
                            {expandedTrade === t.tradeId ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </div>
                        </button>

                        {expandedTrade === t.tradeId && (
                          <div className="border-t border-border/30 p-3 bg-muted/10 space-y-2">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">تاریخ</span>
                                <p>{t.date}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">سشن</span>
                                <p>{t.session ?? '—'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">شباهت</span>
                                <p className="text-primary font-bold">{t.score}%</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">دلایل شباهت:</p>
                              <div className="flex flex-wrap gap-1">
                                {t.matchReasons.map((r, j) => (
                                  <span key={j} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{r}</span>
                                ))}
                              </div>
                            </div>
                            {tradeDetails[t.tradeId] && (() => {
                              const td = tradeDetails[t.tradeId];
                              const ptr = parseJSON<import('../db/database').PostTradeReviewData>(td.postTradeReview, {} as import('../db/database').PostTradeReviewData);
                              const screenshots = parseJSON<{dataUrl: string; label: string; timeframe?: string}[]>(td.screenshots, []);
                              // Compute R:R and management flags
                              const rr = td.entryPrice && td.stopLoss && td.takeProfit
                                ? Math.abs((td.takeProfit - td.entryPrice) / (td.entryPrice - td.stopLoss))
                                : null;
                              const mgmtFlags = [
                                ptr.closedEarly ? 'خروج زودهنگام' : null,
                                ptr.heldTooLong ? 'نگه‌داری بیش از حد' : null,
                                ptr.slMoved ? 'SL جابجا شد' : null,
                                ptr.behaviorFlags?.includes('fomo') ? 'FOMO' : null,
                                ptr.enteredWithConfirmation === true ? 'ورود تأیید‌شده ✅' : null,
                                ptr.entryTiming === 'early' ? 'ورود زودهنگام' : ptr.entryTiming === 'late' ? 'ورود دیرهنگام' : null,
                              ].filter(Boolean);
                              return (
                                <div className="space-y-3">
                                  {/* Trade metrics grid */}
                                  <div className="grid grid-cols-4 gap-2 bg-background/40 rounded-lg p-2">
                                    {td.entryPrice != null && (
                                      <div className="text-center">
                                        <p className="text-[9px] text-muted-foreground">ورود</p>
                                        <p className="text-xs font-mono font-bold">{td.entryPrice}</p>
                                      </div>
                                    )}
                                    {td.stopLoss != null && (
                                      <div className="text-center">
                                        <p className="text-[9px] text-muted-foreground">SL</p>
                                        <p className="text-xs font-mono text-red-400">{td.stopLoss}</p>
                                      </div>
                                    )}
                                    {td.takeProfit != null && (
                                      <div className="text-center">
                                        <p className="text-[9px] text-muted-foreground">TP</p>
                                        <p className="text-xs font-mono text-green-400">{td.takeProfit}</p>
                                      </div>
                                    )}
                                    {rr !== null && (
                                      <div className="text-center">
                                        <p className="text-[9px] text-muted-foreground">R:R</p>
                                        <p className={`text-xs font-bold ${rr >= 2 ? 'text-green-400' : rr >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                                          1:{rr.toFixed(1)}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Management behavior */}
                                  {mgmtFlags.length > 0 && (
                                    <div>
                                      <p className="text-[10px] text-muted-foreground mb-1">رفتار مدیریت</p>
                                      <div className="flex flex-wrap gap-1">
                                        {mgmtFlags.map((flag, fi) => (
                                          <span key={fi} className={`text-[10px] px-1.5 py-0.5 rounded ${
                                            (flag ?? '').includes('✅') ? 'bg-green-500/10 text-green-400' :
                                            (flag ?? '').includes('FOMO') || (flag ?? '').includes('جابجا') || (flag ?? '').includes('زودهنگام') || (flag ?? '').includes('دیرهنگام') ? 'bg-orange-500/10 text-orange-400' :
                                            'bg-muted/20 text-muted-foreground'
                                          }`}>{flag}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* مقایسه تحلیل فعلی با تاریخی — Section 10/21 */}
                                  {(session.overallReasoning || ptr.expectationText) && (
                                    <div className="border border-border/30 rounded-lg overflow-hidden">
                                      <div className="bg-muted/20 px-3 py-1 border-b border-border/30">
                                        <p className="text-[9px] text-muted-foreground font-medium">مقایسه موقعیت فعلی با تاریخی</p>
                                      </div>
                                      <div className="grid grid-cols-2 divide-x divide-border/30">
                                        <div className="p-2 space-y-1">
                                          <p className="text-[9px] font-semibold text-primary">📍 الان (شما)</p>
                                          {session.overallBias && (
                                            <span className={`text-[10px] font-bold ${session.overallBias === 'bullish' ? 'text-green-400' : session.overallBias === 'bearish' ? 'text-red-400' : 'text-muted-foreground'}`}>
                                              {session.overallBias === 'bullish' ? '📈 صعودی' : session.overallBias === 'bearish' ? '📉 نزولی' : '↔️ خنثی'}
                                            </span>
                                          )}
                                          {session.overallReasoning && <p className="text-[10px] text-muted-foreground line-clamp-3">{session.overallReasoning}</p>}
                                          {session.expectedScenario && <p className="text-[10px] text-blue-400 line-clamp-2">انتظار: {session.expectedScenario}</p>}
                                        </div>
                                        <div className="p-2 space-y-1">
                                          <p className={`text-[9px] font-semibold ${t.result === 'win' ? 'text-green-400' : t.result === 'loss' ? 'text-red-400' : 'text-muted-foreground'}`}>
                                            📂 {t.result === 'win' ? 'برد' : t.result === 'loss' ? 'ضرر' : '—'} {t.rMultiple !== null ? `(${t.rMultiple > 0 ? '+' : ''}${t.rMultiple.toFixed(2)}R)` : ''}
                                          </p>
                                          {ptr.expectationText && <p className="text-[10px] text-muted-foreground line-clamp-3">{ptr.expectationText}</p>}
                                          {ptr.actualBehaviorText && <p className="text-[10px] text-orange-400 line-clamp-2">واقعیت: {ptr.actualBehaviorText}</p>}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {td.notes && (
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">یادداشت اصلی</p>
                                      <p className="text-xs bg-background/50 rounded p-2 mt-1 leading-relaxed">{td.notes}</p>
                                    </div>
                                  )}
                                  {ptr.userReflection && (
                                    <div>
                                      <p className="text-[10px] text-muted-foreground">تأمل پس از معامله</p>
                                      <p className="text-xs bg-background/50 rounded p-2 mt-1 leading-relaxed">{ptr.userReflection}</p>
                                    </div>
                                  )}
                                  {ptr.analysisNotes && (
                                    <div className="flex items-start gap-1.5 bg-amber-500/5 border border-amber-500/20 rounded p-2">
                                      <Lightbulb className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                      <p className="text-xs text-amber-300">{ptr.analysisNotes}</p>
                                    </div>
                                  )}
                                  {screenshots.length > 0 && (
                                    <div>
                                      <p className="text-[10px] text-muted-foreground mb-1">اسکرین‌شات‌های تاریخی</p>
                                      <div className="flex gap-2 overflow-x-auto pb-1">
                                        {screenshots.slice(0, 4).map((s, si) => (
                                          <div key={si} className="shrink-0">
                                            <StoredImage
                                              source={s.dataUrl}
                                              alt={s.label}
                                              enableViewer
                                              showDownload
                                              filename={s.label || 'historical-screenshot'}
                                              className="h-16 w-24 object-cover rounded border border-border/40"
                                            />
                                            <p className="text-[9px] text-center text-muted-foreground mt-0.5">{s.timeframe ?? s.label}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <a href={`/journal/trades/${t.tradeId}`} className="block">
                                    <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1">
                                      <Eye className="h-3 w-3" />
                                      مشاهده معامله کامل
                                    </Button>
                                  </a>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {analysis.similarTrades.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">هیچ معامله مشابهی یافت نشد</p>
                  <p className="text-xs mt-1">معاملات بیشتری ثبت کنید تا مقایسه تاریخی امکان‌پذیر شود</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={handleRunAnalysis} disabled={analyzing} size="sm" className="gap-1.5 text-xs">
                  {analyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  بروزرسانی تحلیل
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── TAB 4: Rules & Reminders ── */}
        <TabsContent value="rules" className="space-y-4">
          {!analysis ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>ابتدا تحلیل تاریخچه را اجرا کنید</p>
            </div>
          ) : (
            <>
              {/* Behavioral reminders */}
              {analysis.behavioralReminders.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      یادآوری‌های رفتاری شخصی
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {analysis.behavioralReminders.map((r, i) => (
                      <div key={i} className={`p-3 rounded-lg border ${
                        r.type === 'warning' ? 'border-orange-500/30 bg-orange-500/5' :
                        r.type === 'strength' ? 'border-green-500/30 bg-green-500/5' :
                        'border-blue-500/30 bg-blue-500/5'
                      }`}>
                        <div className="flex items-start gap-2">
                          {r.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" /> :
                           r.type === 'strength' ? <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" /> :
                           <HelpCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />}
                          <div>
                            <p className="text-sm font-medium">{r.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              چرا این را می‌بینید: {r.reason}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="bg-muted/30 rounded-full h-1.5 flex-1">
                                <div className="h-full rounded-full bg-current opacity-60 transition-all" style={{ width: `${Math.round((r.supportingCount / r.supportingTotal) * 100)}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{r.supportingCount}/{r.supportingTotal} معامله</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Rule matches */}
              {analysis.ruleMatches.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      قوانین و درس‌های مرتبط
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {analysis.ruleMatches.map(rule => {
                      const statusCfg = RULE_STATUS_CONFIG[rule.status];
                      return (
                        <div key={rule.noteId} className="p-3 rounded-lg border border-border/40 bg-muted/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {rule.isRule && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">قانون</span>}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${rule.importance === 'critical' ? 'bg-red-500/10 text-red-400' : rule.importance === 'high' ? 'bg-orange-500/10 text-orange-400' : 'bg-muted/30 text-muted-foreground'}`}>
                                  {rule.importance === 'critical' ? 'بحرانی' : rule.importance === 'high' ? 'بالا' : rule.importance === 'medium' ? 'متوسط' : 'پایین'}
                                </span>
                              </div>
                              <p className="text-sm font-medium mt-1">{rule.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rule.content}</p>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${statusCfg.cls}`}>
                              {statusCfg.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                            <HelpCircle className="h-3 w-3" />{rule.statusReason}
                          </p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {analysis.behavioralReminders.length === 0 && analysis.ruleMatches.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">قانون یا یادآوری مرتبطی یافت نشد</p>
                  <p className="text-xs mt-1">معاملات بیشتری ثبت کنید یا قوانین به پایگاه دانش اضافه کنید</p>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── TAB 5: Decision ── */}
        <TabsContent value="decision" className="space-y-4">
          {/* Briefing reminder */}
          {briefing && briefing.reminders.length > 0 && (
            <div className="space-y-2">
              {briefing.reminders.map((r, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-orange-300">{r.message}</p>
                </div>
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                تصمیم نهایی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Decision choice */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">تصمیم</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
                  {([
                    { v: 'long',     label: '📈 Long',        cls: 'hover:border-green-400/50 data-[active=true]:border-green-400 data-[active=true]:bg-green-400/10' },
                    { v: 'short',    label: '📉 Short',       cls: 'hover:border-red-400/50 data-[active=true]:border-red-400 data-[active=true]:bg-red-400/10' },
                    { v: 'no-trade', label: '🚫 معامله نه',  cls: 'hover:border-gray-400/50 data-[active=true]:border-gray-400 data-[active=true]:bg-gray-400/10' },
                    { v: 'wait',     label: '⏳ انتظار',     cls: 'hover:border-yellow-400/50 data-[active=true]:border-yellow-400 data-[active=true]:bg-yellow-400/10' },
                  ] as const).map(opt => (
                    <button key={opt.v} data-active={decisionChoice === opt.v} onClick={() => setDecisionChoice(opt.v)}
                      className={`p-2.5 rounded-lg border border-border/40 text-xs transition-all ${opt.cls}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trade details if entering */}
              {(decisionChoice === 'long' || decisionChoice === 'short') && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'قیمت ورود', key: 'entry', val: decisionEntry, set: setDecisionEntry },
                    { label: 'حد ضرر', key: 'sl', val: decisionSL, set: setDecisionSL },
                    { label: 'حد سود', key: 'tp', val: decisionTP, set: setDecisionTP },
                    { label: 'ریسک (%)', key: 'risk', val: decisionRisk, set: setDecisionRisk },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-xs text-muted-foreground">{f.label}</label>
                      <Input type="number" value={f.val} onChange={e => f.set(e.target.value)} className="mt-1 h-8 text-xs font-mono" />
                    </div>
                  ))}
                </div>
              )}

              {/* Confidence */}
              <div>
                <label className="text-xs text-muted-foreground">اطمینان: {decisionConf}/10</label>
                <input type="range" min={1} max={10} value={decisionConf} onChange={e => setDecisionConf(parseInt(e.target.value))}
                  className="w-full mt-1 accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>کم</span><span>متوسط</span><span>بالا</span>
                </div>
              </div>

              {/* Reasoning */}
              <div>
                <label className="text-xs text-muted-foreground">استدلال تصمیم *</label>
                <Textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="چرا این تصمیم را گرفتید؟" rows={3} className="mt-1 text-xs resize-none" />
              </div>

              {/* Post-decision learning */}
              <div className="border-t border-border/30 pt-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">یادگیری پس از تصمیم (اختیاری)</p>
                <div>
                  <label className="text-xs text-muted-foreground">مهم‌ترین اطلاعاتی که بر این تصمیم تأثیر گذاشت</label>
                  <Textarea value={decisionImportant} onChange={e => setDecisionImportant(e.target.value)} rows={2} className="mt-1 text-xs resize-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">اطلاعاتی که نادیده گرفتید</label>
                  <Textarea value={decisionIgnored} onChange={e => setDecisionIgnored(e.target.value)} rows={2} className="mt-1 text-xs resize-none" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">چه چیزی این ایده را ابطال می‌کند؟</label>
                  <Textarea value={decisionInvalidation} onChange={e => setDecisionInvalidation(e.target.value)} rows={2} className="mt-1 text-xs resize-none" />
                </div>
              </div>

              <Button onClick={handleSaveDecision} disabled={!decisionReason.trim()} className="w-full gap-2">
                <Save className="h-4 w-4" />
                ذخیره تصمیم
              </Button>

              {session.finalDecision && (
                <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 rounded p-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  تصمیم ذخیره شده — {new Date(parseJSON<MarketContextDecision>(session.finalDecision, {} as MarketContextDecision).decidedAt ?? 0).toLocaleTimeString('fa-IR')}
                </div>
              )}

              {/* ── لینک به معامله تکمیل‌شده (Section 22) ── */}
              <div className="border-t border-border/30 pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-primary" />
                  لینک به معامله (اختیاری — بخش ۲۲)
                </p>
                <p className="text-[10px] text-muted-foreground">
                  پس از اتمام معامله، آن را اینجا لینک کنید تا سیستم نتیجه را با موقعیت‌های مشابه تاریخی مقایسه کند.
                </p>
                <LinkedTradeSection session={session} onUpdate={handleFieldUpdate} />
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                این سیستم صرفاً زمینه تاریخی شخصی ارائه می‌دهد.
                هیچ‌گونه پیش‌بینی یا تضمینی ارائه نمی‌شود. تصمیم نهایی با شماست.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 6: Learning Loop ── */}
        <TabsContent value="lessons" className="space-y-4">
          {lessonProposals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                <Lightbulb className="h-8 w-8 text-amber-400" />
              </div>
              <p className="font-medium text-base">درس‌های پیشنهادی</p>
              <p className="text-sm mt-2 mb-5 max-w-sm mx-auto">
                پس از اجرای تحلیل تاریخچه، سیستم الگوهای رفتاری شما را بررسی کرده و درس‌هایی برای تأیید یا رد پیشنهاد می‌دهد.
              </p>
              <Button onClick={handleRunAnalysis} disabled={analyzing} className="gap-2">
                {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {analyzing ? 'در حال تحلیل...' : 'اجرای تحلیل و تولید درس‌ها'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium">
                    {lessonProposals.filter(p => !dismissedLessons.has(p.id) && !approvedLessons.has(p.id)).length} درس در انتظار بررسی
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 text-green-400">
                    <ThumbsUp className="h-3 w-3" />{approvedLessons.size} تأیید شده
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />{dismissedLessons.size} رد شده
                  </span>
                </div>
              </div>

              {/* Lesson cards */}
              {lessonProposals.map(proposal => {
                const isApproved = approvedLessons.has(proposal.id);
                const isDismissed = dismissedLessons.has(proposal.id);
                const isApproving = approvingLesson === proposal.id;

                if (isDismissed) return null;

                const importanceConfig = {
                  critical: { cls: 'border-red-500/40 bg-red-500/5', badge: 'bg-red-500/10 text-red-400', label: 'بحرانی' },
                  high:     { cls: 'border-orange-500/40 bg-orange-500/5', badge: 'bg-orange-500/10 text-orange-400', label: 'مهم' },
                  medium:   { cls: 'border-amber-500/40 bg-amber-500/5', badge: 'bg-amber-500/10 text-amber-400', label: 'متوسط' },
                  low:      { cls: 'border-border/40 bg-muted/10', badge: 'bg-muted/20 text-muted-foreground', label: 'پایین' },
                }[proposal.importance];

                return (
                  <div key={proposal.id}
                    className={`rounded-xl border p-4 space-y-3 transition-all ${
                      isApproved
                        ? 'border-green-500/40 bg-green-500/5 opacity-80'
                        : importanceConfig.cls
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Lightbulb className={`h-4 w-4 mt-0.5 shrink-0 ${
                          isApproved ? 'text-green-400' :
                          proposal.importance === 'critical' ? 'text-red-400' :
                          proposal.importance === 'high' ? 'text-orange-400' : 'text-amber-400'
                        }`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${importanceConfig.badge}`}>
                              {importanceConfig.label}
                            </span>
                            {proposal.isRule && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">قانون</span>
                            )}
                            {isApproved && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium flex items-center gap-0.5">
                                <CheckCircle2 className="h-2.5 w-2.5" /> به پایگاه دانش اضافه شد
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold leading-snug">{proposal.title}</p>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <p className="text-xs text-muted-foreground leading-relaxed pr-6">{proposal.content}</p>

                    {/* Evidence bar */}
                    <div className="pr-6 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <BarChart2 className="h-3 w-3 shrink-0" />
                      <span>پشتیبانی: {proposal.evidence.sampleSize} نمونه</span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        proposal.evidence.confidence === 'high' ? 'bg-green-500/10 text-green-400' :
                        proposal.evidence.confidence === 'moderate' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {proposal.evidence.confidence === 'high' ? 'اعتماد بالا' :
                         proposal.evidence.confidence === 'moderate' ? 'اعتماد متوسط' : 'اعتماد کم'}
                      </span>
                    </div>

                    {/* Tags */}
                    {proposal.tags.length > 0 && (
                      <div className="pr-6 flex flex-wrap gap-1">
                        {proposal.tags.filter(Boolean).slice(0, 5).map((tag, i) => (
                          <span key={i} className="text-[10px] bg-muted/30 text-muted-foreground px-1.5 py-0.5 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    {!isApproved && (
                      <div className="pr-6 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveLesson(proposal)}
                          disabled={isApproving}
                          className="flex-1 gap-1.5 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                        >
                          {isApproving
                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                            : <ThumbsUp className="h-3 w-3" />}
                          اضافه به پایگاه دانش
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDismissLesson(proposal.id)}
                          className="gap-1.5 h-8 text-xs text-muted-foreground"
                        >
                          <ThumbsDown className="h-3 w-3" />
                          رد
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Dismissed count notice */}
              {dismissedLessons.size > 0 && (
                <p className="text-center text-[11px] text-muted-foreground">
                  {dismissedLessons.size} درس رد شده — برای بازنگری، تحلیل را مجدداً اجرا کنید
                </p>
              )}

              {/* Refresh */}
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleRunAnalysis} disabled={analyzing} size="sm" className="gap-1.5 text-xs">
                  {analyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  بازتولید درس‌ها
                </Button>
              </div>

              {/* Knowledge base link nudge */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/20 border border-border/30">
                <BookMarked className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground">
                  درس‌های تأیید شده در بخش <strong>پایگاه دانش</strong> ذخیره می‌شوند و در تحلیل‌های بعدی نمایش داده می‌شوند.
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
