/**
 * SymbolsList — لیست رتبه‌بندی نمادهای معاملاتی
 * همه نمادهایی که کاربر روی آن‌ها معامله کرده + مقایسه سریع
 */
import { useMemo, useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  TrendingUp, TrendingDown, Minus, ChevronLeft, BarChart3,
  Star, AlertCircle, ArrowUpDown, GitCompare, Trophy
} from 'lucide-react';
import { db } from '../db/database';
import { computeAllSymbolProfiles, rankSymbols, compareSymbols, SymbolBehaviorProfile } from '../services/symbolIntelligenceService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';

// ── AssetClass Badge ──────────────────────────────────────────────
const ASSET_CLASS_LABELS: Record<string, string> = {
  forex: 'فارکس', crypto: 'کریپتو', commodity: 'کالا',
  index: 'شاخص', stock: 'سهام', other: 'سایر',
};
const ASSET_CLASS_COLORS: Record<string, string> = {
  forex: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  crypto: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  commodity: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  index: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  stock: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

function AssetBadge({ assetClass }: { assetClass: string }) {
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', ASSET_CLASS_COLORS[assetClass] || ASSET_CLASS_COLORS.other)}>
      {ASSET_CLASS_LABELS[assetClass] || assetClass}
    </span>
  );
}

// ── Score Ring ─────────────────────────────────────────────────────
function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 65 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth={3.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3.5}
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round" />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Comparison Panel ──────────────────────────────────────────────
function ComparePanel({ profiles }: { profiles: SymbolBehaviorProfile[] }) {
  const [sym1, setSym1] = useState(profiles[0]?.symbol || '');
  const [sym2, setSym2] = useState(profiles[1]?.symbol || '');

  const comparison = useMemo(() => {
    if (!sym1 || !sym2 || sym1 === sym2) return null;
    return compareSymbols(profiles, sym1, sym2);
  }, [profiles, sym1, sym2]);

  if (profiles.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary" />
          مقایسه نمادها
        </CardTitle>
        <CardDescription>مقایسه مستقیم دو نماد بر اساس داده‌های تاریخی شما</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Select value={sym1} onValueChange={setSym1}>
            <SelectTrigger><SelectValue placeholder="نماد اول" /></SelectTrigger>
            <SelectContent>{profiles.map(p => <SelectItem key={p.symbol} value={p.symbol}>{p.symbol}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sym2} onValueChange={v => v !== sym1 && setSym2(v)}>
            <SelectTrigger><SelectValue placeholder="نماد دوم" /></SelectTrigger>
            <SelectContent>{profiles.filter(p => p.symbol !== sym1).map(p => <SelectItem key={p.symbol} value={p.symbol}>{p.symbol}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {comparison && (
          <div className="space-y-3">
            {/* سرستون */}
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground border-b pb-1">
              <span className="w-28 shrink-0">متریک</span>
              <span className="flex-1 text-center">{sym1}</span>
              <span className="w-6 text-center">vs</span>
              <span className="flex-1 text-center">{sym2}</span>
            </div>
            {comparison.metrics.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground w-28 shrink-0 text-xs leading-tight">{m.label}</span>
                <span className={cn(
                  'flex-1 text-center text-xs rounded-md py-1',
                  m.winner === sym1
                    ? 'font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : ''
                )}>
                  {String(m.values[sym1])}
                </span>
                <span className="w-6 text-center text-muted-foreground text-[10px]">—</span>
                <span className={cn(
                  'flex-1 text-center text-xs rounded-md py-1',
                  m.winner === sym2
                    ? 'font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : ''
                )}>
                  {String(m.values[sym2])}
                </span>
              </div>
            ))}

            {/* یافته‌های داخلی هر نماد */}
            {comparison.sameSymbolFindings.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">یافته‌های کلیدی</p>
                {comparison.sameSymbolFindings.map((f, i) => (
                  <p key={i} className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 leading-relaxed">{f}</p>
                ))}
              </div>
            )}

            {/* یافته‌های متقاطع */}
            {comparison.crossSymbolFindings.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">تفاوت‌های رفتاری</p>
                {comparison.crossSymbolFindings.map((f, i) => (
                  <p key={i} className="text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-md p-2 leading-relaxed">{f}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Symbol Card ────────────────────────────────────────────────────
function SymbolCard({ profile, rank }: { profile: SymbolBehaviorProfile; rank: number }) {
  const wr = profile.winRate;
  const wrColor = wr >= 55 ? 'text-green-600 dark:text-green-400' : wr >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500';
  const avgR = profile.avgR;
  const rColor = avgR == null ? '' : avgR > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500';

  return (
    <Link href={`/symbols/${encodeURIComponent(profile.symbol)}`}>
      <Card className="hover:border-primary/40 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {/* رتبه */}
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              {rank <= 3
                ? <Trophy className={cn('w-3.5 h-3.5', rank === 1 ? 'text-yellow-500' : rank === 2 ? 'text-gray-400' : 'text-amber-600')} />
                : <span className="text-xs font-bold text-muted-foreground">{rank}</span>}
            </div>

            {/* اطلاعات اصلی */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-base">{profile.symbol}</span>
                <AssetBadge assetClass={profile.assetClass} />
                {profile.dataConfidence === 'low' && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3" /> داده محدود
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{profile.totalTrades} معامله</p>
            </div>

            {/* امتیاز */}
            <ScoreRing score={profile.compositeScore} />
          </div>

          {/* آمار سریع */}
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">نرخ برد</p>
              <p className={cn('text-sm font-semibold', wrColor)}>{wr.toFixed(0)}٪</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">میانگین R</p>
              <p className={cn('text-sm font-semibold', rColor)}>
                {avgR != null ? `${avgR.toFixed(2)}R` : '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">سود/زیان</p>
              <p className={cn('text-sm font-semibold', profile.totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
                {profile.totalPnl >= 0 ? '+' : ''}{profile.totalPnl.toFixed(0)}
              </p>
            </div>
          </div>

          {/* روند اخیر */}
          {profile.recent.total > 0 && profile.historical.total > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              {profile.recent.winRate > profile.historical.winRate
                ? <TrendingUp className="w-3.5 h-3.5 text-green-500 shrink-0" />
                : profile.recent.winRate < profile.historical.winRate
                ? <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                : <Minus className="w-3.5 h-3.5 shrink-0" />}
              <span>
                اخیر: {profile.recent.winRate.toFixed(0)}٪ | تاریخی: {profile.historical.winRate.toFixed(0)}٪
              </span>
            </div>
          )}

          <div className="flex items-center justify-end mt-2">
            <span className="text-xs text-primary flex items-center gap-1">مشاهده پروفایل <ChevronLeft className="w-3 h-3" /></span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
type SortKey = 'composite' | 'winrate' | 'avgr' | 'trades';

export default function SymbolsList() {
  const [trades, setTrades] = useState<import('../db/database').Trade[]>([]);
  useEffect(() => { db.trades.toArray().then(setTrades); }, []);
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [filterClass, setFilterClass] = useState('all');

  const profiles = useMemo(() => {
    const all = computeAllSymbolProfiles(trades);
    return rankSymbols(all);
  }, [trades]);

  const filtered = useMemo(() => {
    let list = [...profiles];
    if (filterClass !== 'all') list = list.filter(p => p.assetClass === filterClass);
    switch (sortKey) {
      case 'winrate': list.sort((a, b) => b.winRate - a.winRate); break;
      case 'avgr': list.sort((a, b) => (b.avgR ?? -999) - (a.avgR ?? -999)); break;
      case 'trades': list.sort((a, b) => b.totalTrades - a.totalTrades); break;
      default: /* composite — already sorted */ break;
    }
    return list;
  }, [profiles, sortKey, filterClass]);

  const assetClasses = useMemo(() => {
    const set = new Set(profiles.map(p => p.assetClass));
    return Array.from(set);
  }, [profiles]);

  if (profiles.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">نمادهای معاملاتی</h1>
          <p className="text-muted-foreground text-sm mt-1">هوش رفتاری هر نماد بر اساس تاریخچه معاملات شما</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">هنوز معامله‌ای ثبت نشده.</p>
            <p className="text-sm text-muted-foreground mt-1">با ثبت معاملات، پروفایل رفتاری هر نماد ساخته می‌شود.</p>
            <Link href="/journal/trades/new">
              <Button className="mt-4">ثبت معامله</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* هدر */}
      <div>
        <h1 className="text-2xl font-bold">نمادهای معاملاتی</h1>
        <p className="text-muted-foreground text-sm mt-1">
          هوش رفتاری {profiles.length} نماد — بر اساس {trades.length} معامله ثبت‌شده
        </p>
      </div>

      {/* خلاصه آماری */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'نمادها', value: profiles.length, icon: Star },
          { label: 'کل معاملات', value: trades.length, icon: BarChart3 },
          { label: 'بهترین نماد', value: profiles[0]?.symbol || '—', icon: Trophy },
          { label: 'متوسط Win Rate', value: `${(profiles.reduce((s, p) => s + p.winRate, 0) / profiles.length).toFixed(0)}٪`, icon: TrendingUp },
        ].map((item, i) => (
          <Card key={i}>
            <CardContent className="p-3 text-center">
              <item.icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
              <p className="font-semibold text-sm">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* فیلتر و مرتب‌سازی */}
      <div className="flex gap-2 flex-wrap">
        <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-44 h-9">
            <ArrowUpDown className="w-3.5 h-3.5 me-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="composite">امتیاز ترکیبی</SelectItem>
            <SelectItem value="winrate">نرخ برد</SelectItem>
            <SelectItem value="avgr">میانگین R</SelectItem>
            <SelectItem value="trades">تعداد معامله</SelectItem>
          </SelectContent>
        </Select>

        {assetClasses.length > 1 && (
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه دارایی‌ها</SelectItem>
              {assetClasses.map(ac => (
                <SelectItem key={ac} value={ac}>{ASSET_CLASS_LABELS[ac] || ac}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* لیست نمادها */}
      <div className="space-y-3">
        {filtered.map((profile, i) => (
          <SymbolCard key={profile.symbol} profile={profile} rank={i + 1} />
        ))}
      </div>

      {/* مقایسه */}
      {profiles.length >= 2 && <ComparePanel profiles={profiles} />}

      {/* راهنما */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>امتیاز ترکیبی (۰–۱۰۰):</strong> بر اساس نرخ برد (۳۰٪)، میانگین R (۳۵٪)، حجم معاملات (۲۰٪) و کیفیت اجرا (۱۵٪) محاسبه می‌شود.
            نمادهایی با داده محدود (کمتر از ۵ معامله) سطح اطمینان پایین دارند.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
