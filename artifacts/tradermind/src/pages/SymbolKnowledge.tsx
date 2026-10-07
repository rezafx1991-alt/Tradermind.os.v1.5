/**
 * SymbolKnowledge — صفحه دانش رفتاری هر نماد
 * تحلیل کامل رفتار نماد بر اساس تاریخچه معاملات کاربر
 */
import { useMemo, useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import {
  ChevronRight, AlertCircle, TrendingUp, TrendingDown, Minus,
  Clock, Target, Activity, Layers, BarChart3, BookOpen,
  Calendar, Award, Shield, Zap, Globe, Fingerprint, Cpu,
  CheckCircle2, XCircle, GitCompare, Brain
} from 'lucide-react';
import { db } from '../db/database';
import {
  computeSymbolProfile, SymbolBehaviorProfile, FibStat,
  SessionStat, RegimeStat, TemporalStat, ConfidenceLevel,
  BehavioralSignatureEntry, TimeframeStat, PTRSummary, ExecutionStat
} from '../services/symbolIntelligenceService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '../lib/utils';

// ── Helpers ───────────────────────────────────────────────────────
const FMT = {
  pct: (v: number) => `${v.toFixed(0)}٪`,
  r: (v: number | null) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` : '—',
  hours: (v: number | null) => v != null ? `${v.toFixed(1)} ساعت` : '—',
  date: (ts: number | null) => ts != null ? new Date(ts).toLocaleDateString('fa-IR') : '—',
};

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  low: 'داده محدود', medium: 'متوسط', high: 'اطمینان بالا',
};
const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  low: 'text-yellow-600 dark:text-yellow-400',
  medium: 'text-blue-600 dark:text-blue-400',
  high: 'text-green-600 dark:text-green-400',
};

// ── Insight Card ──────────────────────────────────────────────────
function InsightBadge({ type, text }: { type: 'positive' | 'negative' | 'neutral'; text: string }) {
  const conf = {
    positive: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300',
    negative: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
    neutral: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
  }[type];
  return <div className={cn('rounded-lg border p-3 text-sm leading-relaxed', conf)}>{text}</div>;
}

// ── Stat Row ──────────────────────────────────────────────────────
function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold', highlight && 'text-primary')}>{value}</span>
    </div>
  );
}

// ── Win Rate Bar ──────────────────────────────────────────────────
function WinBar({ winRate, total }: { winRate: number; total: number }) {
  const color = winRate >= 55 ? 'bg-green-500' : winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{FMT.pct(winRate)} برد</span>
        <span>{total} معامله</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, winRate)}%` }} />
      </div>
    </div>
  );
}

// ── Temporal Compare ──────────────────────────────────────────────
function TemporalCard({ recent, historical }: { recent: TemporalStat; historical: TemporalStat }) {
  if (recent.total === 0 && historical.total === 0) return null;
  const trend = recent.total > 0 && historical.total > 0
    ? recent.winRate > historical.winRate + 5 ? 'better'
      : recent.winRate < historical.winRate - 5 ? 'worse' : 'same'
    : 'same';

  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: '۳۰ روز اخیر', data: recent, badge: trend === 'better' ? 'بهتر' : trend === 'worse' ? 'بدتر' : null },
        { label: 'تاریخی', data: historical, badge: null },
      ].map(({ label, data, badge }) => (
        <Card key={label} className={cn(data.total === 0 && 'opacity-50')}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{label}</span>
              {badge && (
                <Badge variant="secondary" className={cn('text-[10px]', trend === 'better' ? 'text-green-600' : 'text-red-500')}>
                  {badge}
                </Badge>
              )}
            </div>
            {data.total > 0 ? (
              <>
                <p className="text-lg font-bold">{FMT.pct(data.winRate)}</p>
                <p className="text-xs text-muted-foreground">{data.total} معامله | {FMT.r(data.avgR)} میانگین R</p>
              </>
            ) : <p className="text-xs text-muted-foreground">داده‌ای موجود نیست</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Session Table ─────────────────────────────────────────────────
function SessionTable({ sessions }: { sessions: SessionStat[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">اطلاعات جلسه معاملاتی ثبت نشده.</p>;
  }
  return (
    <div className="space-y-3">
      {sessions.map(s => (
        <div key={s.session} className="p-3 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{s.label}</span>
            <span className="text-xs text-muted-foreground">{s.total} معامله</span>
          </div>
          <WinBar winRate={s.winRate} total={s.total} />
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
            <span>میانگین R: <span className={cn('font-medium', s.avgR != null && (s.avgR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'))}>{FMT.r(s.avgR)}</span></span>
            <span>سود/زیان: <span className={cn('font-medium', s.totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>{s.totalPnl >= 0 ? '+' : ''}{s.totalPnl.toFixed(0)}</span></span>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground text-center">جلسات بر اساس ساعت UTC تشخیص داده می‌شوند.</p>
    </div>
  );
}

// ── Fib Chart ─────────────────────────────────────────────────────
function FibChart({ fibStats }: { fibStats: FibStat[] }) {
  if (fibStats.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">سطح فیبوناچی در تگ‌های معاملات ثبت نشده.</p>
        <p className="text-xs text-muted-foreground mt-1">از تگ‌هایی مثل «38.2» یا «fib-61.8» استفاده کنید.</p>
      </div>
    );
  }
  const maxCount = Math.max(...fibStats.map(f => f.count));
  return (
    <div className="space-y-3">
      {fibStats.map(f => (
        <div key={f.level} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-primary">{f.level}٪</span>
              <Badge variant="outline" className="text-[10px] h-4">{CONFIDENCE_LABELS[f.confidence]}</Badge>
            </div>
            <span className="text-muted-foreground text-xs">{f.count} نمونه | برد: {FMT.pct(f.winRate)}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(f.count / maxCount) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Pattern Table ─────────────────────────────────────────────────
function PatternTable({ patterns }: { patterns: SymbolBehaviorProfile['patternStats'] }) {
  const shown = patterns.slice(0, 12);
  if (shown.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">تگی در معاملات این نماد ثبت نشده.</p>
        <p className="text-xs text-muted-foreground mt-1">در فرم ثبت معامله، تگ‌های مرتبط (مثل «impulse» یا «range») اضافه کنید.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {shown.map(p => (
        <div key={p.tag} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{p.tag}</span>
              <span className={cn('text-[10px]', CONFIDENCE_COLORS[p.confidence])}>{CONFIDENCE_LABELS[p.confidence]}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
              <div className={cn('h-full rounded-full', p.winRate >= 55 ? 'bg-green-500' : p.winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500')}
                style={{ width: `${Math.min(100, p.winRate)}%` }} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold">{FMT.pct(p.winRate)}</p>
            <p className="text-xs text-muted-foreground">{p.count} نمونه</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Regime Table ──────────────────────────────────────────────────
function RegimeTable({ regimes }: { regimes: RegimeStat[] }) {
  if (regimes.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">رژیم بازار در تگ‌های معاملات ثبت نشده.</p>
        <p className="text-xs text-muted-foreground mt-1">از تگ‌هایی مثل «range»، «expansion»، یا «strong-trend» استفاده کنید.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {regimes.map(r => (
        <div key={r.regime} className="p-3 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{r.label}</span>
            <Badge variant="outline" className="text-xs">{r.total} نمونه</Badge>
          </div>
          <WinBar winRate={r.winRate} total={r.total} />
          {r.avgR != null && (
            <p className="text-xs text-muted-foreground mt-1">میانگین R: <span className={cn('font-medium', r.avgR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>{FMT.r(r.avgR)}</span></p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Impulse Section ───────────────────────────────────────────────
function ImpulseSection({ impulses }: { impulses: SymbolBehaviorProfile['impulseStats'] }) {
  if (impulses.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">ایمپالسی در تگ‌های معاملات ثبت نشده.</p>
        <p className="text-xs text-muted-foreground mt-1">از تگ‌هایی مثل «impulse-bullish» یا «spike-down» استفاده کنید.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {impulses.map((imp, i) => (
        <div key={i} className="p-3 rounded-lg border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              {imp.type}
            </span>
            <span className="text-xs text-muted-foreground">{imp.count} نمونه</span>
          </div>
          {imp.outcomes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">رفتار بعد از ایمپالس:</p>
              {imp.outcomes.map((o, j) => (
                <div key={j} className="flex items-center gap-2 text-xs">
                  <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${o.pct}%` }} />
                  </div>
                  <span className="text-muted-foreground w-20 shrink-0">{o.label}</span>
                  <span className="font-medium w-8 text-right">{o.pct}٪</span>
                </div>
              ))}
            </div>
          )}
          {imp.outcomes.length === 0 && (
            <p className="text-xs text-muted-foreground">رفتار بعد از ایمپالس هنوز تگ‌گذاری نشده.</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Behavioral Signature Section ─────────────────────────────────
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  impulse: Zap, retracement: Activity, range: Layers, execution: Target,
  session: Clock, regime: Globe, direction: TrendingUp, pattern: BarChart3,
};
const CATEGORY_COLORS: Record<string, string> = {
  impulse: 'text-yellow-500', retracement: 'text-blue-500', range: 'text-purple-500',
  execution: 'text-primary', session: 'text-cyan-500', regime: 'text-orange-500',
  direction: 'text-green-500', pattern: 'text-rose-400',
};

function BehavioralSignatureSection({ entries }: { entries: BehavioralSignatureEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Fingerprint className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">امضای رفتاری هنوز شکل نگرفته.</p>
        <p className="text-xs text-muted-foreground">با ثبت معاملات بیشتر و تکمیل ریویوها، الگوهای تکراری شناسایی می‌شوند.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {entries.map((entry, i) => {
        const Icon = CATEGORY_ICONS[entry.category] || BarChart3;
        const iconColor = CATEGORY_COLORS[entry.category] || 'text-primary';
        return (
          <div key={i} className="flex gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors">
            <div className={cn('shrink-0 mt-0.5', iconColor)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed">{entry.observation}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {entry.evidence > 0 && (
                  <span className="text-xs text-muted-foreground">{entry.evidence} نمونه</span>
                )}
                <span className={cn('text-xs', CONFIDENCE_COLORS[entry.confidence])}>
                  {CONFIDENCE_LABELS[entry.confidence]}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground text-center pt-1">
        امضای رفتاری از داده‌های واقعی معاملات استخراج می‌شود — هیچ فرض از پیش‌تعریف‌شده‌ای وجود ندارد.
      </p>
    </div>
  );
}

// ── Timeframe Section ─────────────────────────────────────────────
function TimeframeSection({ stats }: { stats: TimeframeStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">تایم‌فریم در تگ‌های معاملات ثبت نشده.</p>
        <p className="text-xs text-muted-foreground mt-1">از تگ‌هایی مثل «4H»، «15M»، «5M»، «1M» استفاده کنید.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {stats.map(s => (
        <div key={s.timeframe} className="p-3 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-bold text-sm text-primary">{s.timeframe}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{s.count} نمونه</Badge>
              <span className={cn('text-xs', CONFIDENCE_COLORS[s.confidence])}>{CONFIDENCE_LABELS[s.confidence]}</span>
            </div>
          </div>
          <WinBar winRate={s.winRate} total={s.count} />
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
            <span>برد: <span className="text-green-500 font-medium">{s.wins}</span></span>
            <span>ضرر: <span className="text-red-500 font-medium">{s.losses}</span></span>
            <span>میانگین R: <span className={cn('font-medium', s.avgR != null && s.avgR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>{FMT.r(s.avgR)}</span></span>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground text-center">تایم‌فریم‌ها از تگ‌های معاملات (مثلاً «4H» یا «15M») استخراج می‌شوند.</p>
    </div>
  );
}

// ── Execution Section (from PTR) ──────────────────────────────────
function ExecutionSection({ ptrSummary }: { ptrSummary: PTRSummary | null }) {
  if (!ptrSummary || ptrSummary.reviewedCount === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Cpu className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">هیچ ریویو ساختاریافته‌ای تکمیل نشده.</p>
        <p className="text-xs text-muted-foreground">برای هر معامله بسته‌شده، مرور پس از معامله را تکمیل کنید.</p>
      </div>
    );
  }
  const { reviewedCount, avgTradeQuality, avgExecutionQuality, avgAnalysisQuality,
          directionalAccuracy, executionStats, topBehaviorFlags, commonLossCategories } = ptrSummary;
  const hasDir = directionalAccuracy.total > 0;

  return (
    <div className="space-y-4">
      {/* امتیاز کیفیت */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'کیفیت معامله', value: avgTradeQuality },
          { label: 'کیفیت اجرا', value: avgExecutionQuality },
          { label: 'کیفیت تحلیل', value: avgAnalysisQuality },
        ].map(({ label, value }) => (
          <div key={label} className="text-center p-3 rounded-lg bg-muted/50 space-y-1">
            <p className={cn('text-xl font-bold', value != null && value >= 3.5 ? 'text-green-500' : value != null && value >= 2.5 ? 'text-yellow-500' : 'text-red-400')}>
              {value != null ? value.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center">{reviewedCount} ریویو ساختاریافته تکمیل‌شده</p>

      {/* دقت جهت */}
      {hasDir && (
        <div className="p-3 rounded-lg border">
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> دقت تحلیل جهت
          </p>
          <div className="flex gap-2">
            {[
              { label: 'درست', count: directionalAccuracy.correct, color: 'bg-green-500' },
              { label: 'جزئی', count: directionalAccuracy.partial, color: 'bg-yellow-500' },
              { label: 'اشتباه', count: directionalAccuracy.incorrect, color: 'bg-red-500' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex-1 text-center">
                <div className={cn('h-1.5 rounded-full', color)} style={{ opacity: directionalAccuracy.total > 0 ? count / directionalAccuracy.total : 0 }} />
                <p className="text-xs font-semibold mt-1">{count}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* آمار اجرا */}
      {executionStats.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">آمار اجرا</p>
          {executionStats.slice(0, 6).map(stat => (
            <div key={stat.metric} className="flex items-center justify-between p-2.5 rounded-lg border text-xs gap-3">
              <span className="text-muted-foreground flex-1">{stat.label}</span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 className="w-3 h-3" /> {stat.trueCount}
                  {stat.trueWinRate != null && <span className="text-muted-foreground">({stat.trueWinRate.toFixed(0)}٪)</span>}
                </span>
                <span className="flex items-center gap-1 text-red-400">
                  <XCircle className="w-3 h-3" /> {stat.falseCount}
                  {stat.falseWinRate != null && <span className="text-muted-foreground">({stat.falseWinRate.toFixed(0)}٪)</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* رفتارهای منفی رایج */}
      {topBehaviorFlags.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-500" /> رفتارهای منفی رایج
          </p>
          {topBehaviorFlags.map(f => (
            <div key={f.flag} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 text-xs">
              <span className="text-red-700 dark:text-red-300">{f.label}</span>
              <span className="text-muted-foreground">{f.count} بار ({f.pct}٪)</span>
            </div>
          ))}
        </div>
      )}

      {/* دسته‌بندی ضررها */}
      {commonLossCategories.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">دسته‌بندی ضررها</p>
          {commonLossCategories.map(c => (
            <div key={c.category} className="flex items-center gap-2 text-xs">
              <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-rose-500/70 rounded-full" style={{ width: `${c.pct}%` }} />
              </div>
              <span className="shrink-0 w-32 text-muted-foreground">{c.label}</span>
              <span className="shrink-0 font-medium">{c.pct}٪</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function SymbolKnowledge() {
  const [, params] = useRoute('/symbols/:symbol');
  const symbol = params?.symbol ? decodeURIComponent(params.symbol) : '';

  const [trades, setTrades] = useState<import('../db/database').Trade[]>([]);
  useEffect(() => { db.trades.toArray().then(setTrades); }, []);
  const [tab, setTab] = useState('overview');

  const profile: SymbolBehaviorProfile | null = useMemo(() => {
    if (!symbol || trades.length === 0) return null;
    const symbolTrades = trades.filter(t => t.symbol === symbol);
    if (symbolTrades.length === 0) return null;
    return computeSymbolProfile(symbol, trades);
  }, [symbol, trades]);

  if (!symbol) return null;

  if (!profile) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/symbols" className="hover:text-foreground">نمادها</Link>
          <ChevronRight className="w-4 h-4" />
          <span>{symbol}</span>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">هیچ معامله‌ای برای {symbol} یافت نشد.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const assetLabels: Record<string, string> = {
    forex: 'فارکس', crypto: 'کریپتو', commodity: 'کالا',
    index: 'شاخص', stock: 'سهام', other: 'سایر',
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5 pb-20 md:pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/symbols" className="hover:text-foreground">نمادها</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-medium">{symbol}</span>
      </div>

      {/* هدر نماد */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Globe className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <h1 className="text-2xl font-bold">{symbol}</h1>
            <Badge variant="outline">{assetLabels[profile.assetClass]}</Badge>
            <span className={cn('text-xs font-medium', CONFIDENCE_COLORS[profile.dataConfidence])}>
              {CONFIDENCE_LABELS[profile.dataConfidence]}
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {profile.totalTrades} معامله | اولین: {FMT.date(profile.firstTradeDate)} | آخرین: {FMT.date(profile.lastTradeDate)}
          </p>
        </div>
        <div className="text-center shrink-0">
          <p className="text-2xl font-bold text-primary">{profile.compositeScore}</p>
          <p className="text-xs text-muted-foreground">امتیاز</p>
        </div>
      </div>

      {/* اطلاعیه داده محدود */}
      {profile.dataConfidence === 'low' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>داده‌های این نماد محدود است. با ثبت معاملات بیشتر، تحلیل دقیق‌تر خواهد شد. همیشه شواهد و حجم نمونه را در نظر بگیرید.</p>
        </div>
      )}

      {/* Insights */}
      {profile.insights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">الگوهای مشاهده‌شده</h3>
          {profile.insights.map((ins, i) => (
            <InsightBadge key={i} type={ins.type} text={ins.text} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full overflow-x-auto flex h-auto gap-1 p-1 justify-start">
          {[
            { value: 'overview', label: 'نمای کلی', icon: BarChart3 },
            { value: 'signature', label: 'امضا', icon: Fingerprint },
            { value: 'execution', label: 'اجرا', icon: Cpu },
            { value: 'patterns', label: 'الگوها', icon: Activity },
            { value: 'sessions', label: 'جلسات', icon: Clock },
            { value: 'regimes', label: 'رژیم‌ها', icon: Layers },
            { value: 'personal', label: 'شخصی', icon: BookOpen },
            { value: 'timeline', label: 'زمان‌بندی', icon: Calendar },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <Icon className="w-3.5 h-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── تب نمای کلی ────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* عملکرد کلی */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> عملکرد کلی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {[
                  { label: 'نرخ برد', value: FMT.pct(profile.winRate), color: profile.winRate >= 55 ? 'text-green-600 dark:text-green-400' : profile.winRate >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500' },
                  { label: 'میانگین R', value: FMT.r(profile.avgR), color: profile.avgR != null && profile.avgR > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500' },
                  { label: 'میانه R', value: FMT.r(profile.medianR), color: '' },
                  { label: 'سود/زیان', value: `${profile.totalPnl >= 0 ? '+' : ''}${profile.totalPnl.toFixed(0)}`, color: profile.totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500' },
                ].map(item => (
                  <div key={item.label} className="text-center p-2 rounded-lg bg-muted/50">
                    <p className={cn('text-lg font-bold', item.color)}>{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
              <StatRow label="کل معاملات" value={profile.totalTrades} />
              <StatRow label="برد" value={`${profile.wins} (${FMT.pct(profile.wins / Math.max(1, profile.totalTrades) * 100)})`} />
              <StatRow label="ضرر" value={`${profile.losses} (${FMT.pct(profile.losses / Math.max(1, profile.totalTrades) * 100)})`} />
              <StatRow label="سربه‌سر" value={profile.breakeven} />
              <StatRow label="متوسط زمان نگهداری" value={FMT.hours(profile.avgHoldingHours)} />
            </CardContent>
          </Card>

          {/* Long vs Short */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Long در مقابل Short
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Long', data: profile.longStats, icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
                { label: 'Short', data: profile.shortStats, icon: TrendingDown, color: 'text-red-500' },
              ].map(({ label, data, icon: Icon, color }) => (
                <div key={label} className={cn('p-3 rounded-lg border', data.total === 0 && 'opacity-40')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Icon className={cn('w-4 h-4', color)} /> {label}
                    </span>
                    <span className="text-xs text-muted-foreground">{data.total} معامله</span>
                  </div>
                  {data.total > 0
                    ? <WinBar winRate={data.winRate} total={data.total} />
                    : <p className="text-xs text-muted-foreground">هنوز معامله‌ای در این جهت وجود ندارد</p>}
                  {data.avgR != null && <p className="text-xs text-muted-foreground mt-1">میانگین R: <span className={cn('font-medium', data.avgR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>{FMT.r(data.avgR)}</span></p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── تب امضای رفتاری ────────────────────────────────────── */}
        <TabsContent value="signature" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-primary" /> امضای رفتاری {symbol}
              </CardTitle>
              <CardDescription>مشاهدات تکراری کشف‌شده از داده‌های واقعی معاملات — بدون فرض از پیش‌تعریف‌شده</CardDescription>
            </CardHeader>
            <CardContent>
              <BehavioralSignatureSection entries={profile.behavioralSignature} />
            </CardContent>
          </Card>

          {/* مقایسه سریع */}
          <Card className="bg-muted/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">مقایسه با سایر نمادها</p>
                <p className="text-xs text-muted-foreground mt-0.5">امضای رفتاری این نماد را با نمادهای دیگر مقایسه کنید</p>
              </div>
              <Link href="/symbols">
                <button className="flex items-center gap-1.5 text-xs text-primary">
                  <GitCompare className="w-3.5 h-3.5" /> مقایسه
                </button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── تب اجرا (از PTR) ────────────────────────────────────── */}
        <TabsContent value="execution" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" /> تحلیل اجرا روی {symbol}
              </CardTitle>
              <CardDescription>داده‌های مرور ساختاریافته پس از معامله — شواهد واقعی از اجرای شما</CardDescription>
            </CardHeader>
            <CardContent>
              <ExecutionSection ptrSummary={profile.ptrSummary} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── تب الگوها ──────────────────────────────────────────── */}
        <TabsContent value="patterns" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> الگوهای رایج
              </CardTitle>
              <CardDescription>الگوها از تگ‌های معاملات استخراج می‌شوند — {profile.patternStats.length} تگ منحصربه‌فرد</CardDescription>
            </CardHeader>
            <CardContent><PatternTable patterns={profile.patternStats} /></CardContent>
          </Card>

          {/* تایم‌فریم‌ها */}
          {profile.timeframeStats.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" /> عملکرد بر اساس تایم‌فریم
                </CardTitle>
                <CardDescription>بررسی چندتایم‌فریم — نتایج از تگ‌های معاملات</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeframeSection stats={profile.timeframeStats} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" /> ریتریسمنت فیبوناچی
              </CardTitle>
              <CardDescription>تحلیل سطوح فیبوناچی ثبت‌شده در معاملات</CardDescription>
            </CardHeader>
            <CardContent><FibChart fibStats={profile.fibStats} /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" /> رفتار بعد از ایمپالس
              </CardTitle>
              <CardDescription>بعد از حرکت‌های قوی معمولاً چه اتفاقی افتاده؟</CardDescription>
            </CardHeader>
            <CardContent><ImpulseSection impulses={profile.impulseStats} /></CardContent>
          </Card>
        </TabsContent>

        {/* ── تب جلسات ──────────────────────────────────────────── */}
        <TabsContent value="sessions" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> عملکرد بر اساس جلسه
              </CardTitle>
              <CardDescription>آسیا، لندن، نیویورک — کدام جلسه بهتر کار می‌کند؟</CardDescription>
            </CardHeader>
            <CardContent><SessionTable sessions={profile.sessionStats} /></CardContent>
          </Card>
        </TabsContent>

        {/* ── تب رژیم‌های بازار ─────────────────────────────────── */}
        <TabsContent value="regimes" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> عملکرد بر اساس رژیم بازار
              </CardTitle>
              <CardDescription>کدام رژیم برای این نماد مناسب‌تر است؟</CardDescription>
            </CardHeader>
            <CardContent><RegimeTable regimes={profile.regimeStats} /></CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                برای ثبت رژیم بازار، از تگ‌هایی مثل <code className="bg-muted px-1 rounded">range</code>،{' '}
                <code className="bg-muted px-1 rounded">strong-trend</code>،{' '}
                <code className="bg-muted px-1 rounded">expansion</code>،{' '}
                <code className="bg-muted px-1 rounded">high-vol</code> در معاملات استفاده کنید.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── تب شخصی ───────────────────────────────────────────── */}
        <TabsContent value="personal" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" /> خطاهای رایج
              </CardTitle>
              <CardDescription>از بخش «چه اشتباهی کردم» ژورنال معاملات استخراج شده</CardDescription>
            </CardHeader>
            <CardContent>
              {profile.commonMistakes.length > 0 ? (
                <ul className="space-y-2">
                  {profile.commonMistakes.map((m, i) => (
                    <li key={i} className="text-sm p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-100 dark:border-red-900">
                      {m}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  فیلد «چه اشتباهی کردم» در جزئیات معاملات پر نشده.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-green-500" /> رفتارهای موفق
              </CardTitle>
              <CardDescription>از بخش «چه خوب انجام دادم» ژورنال معاملات استخراج شده</CardDescription>
            </CardHeader>
            <CardContent>
              {profile.successfulBehaviors.length > 0 ? (
                <ul className="space-y-2">
                  {profile.successfulBehaviors.map((b, i) => (
                    <li key={i} className="text-sm p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-100 dark:border-green-900">
                      {b}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  فیلد «چه خوب انجام دادم» در جزئیات معاملات پر نشده.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── تب زمان‌بندی ───────────────────────────────────────── */}
        <TabsContent value="timeline" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> تحول رفتار در طول زمان
              </CardTitle>
              <CardDescription>مقایسه ۳۰ روز اخیر با کل تاریخچه</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TemporalCard recent={profile.recent} historical={profile.historical} />

              <div className="space-y-2">
                {profile.recent.total > 0 && profile.historical.total > 0 && (() => {
                  const diff = profile.recent.winRate - profile.historical.winRate;
                  const Icon = diff > 5 ? TrendingUp : diff < -5 ? TrendingDown : Minus;
                  const color = diff > 5 ? 'text-green-600 dark:text-green-400' : diff < -5 ? 'text-red-500' : 'text-muted-foreground';
                  const text = diff > 5 ? 'عملکرد اخیر بهتر از تاریخی است.' : diff < -5 ? 'عملکرد اخیر ضعیف‌تر از تاریخی است.' : 'عملکرد اخیر مشابه میانگین تاریخی است.';
                  return (
                    <div className={cn('flex items-center gap-2 text-sm', color)}>
                      <Icon className="w-4 h-4 shrink-0" />
                      {text}
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  داده‌های قدیمی حذف نمی‌شوند — هر دوره به صورت جداگانه نمایش داده می‌شود تا تغییر رفتار قابل مقایسه باشد.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
