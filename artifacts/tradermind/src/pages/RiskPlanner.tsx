/**
 * RiskPlanner.tsx — ماشین‌حساب پیش از معامله (Prompt 24 — Section 4)
 * آفلاین کامل — بدون اتصال به بروکر یا اینترنت
 */
import { useState, useEffect } from 'react';
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, Info, BarChart3, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { db } from '../db/database';
import { calculatePreTradeRisk, getPreTradeBriefing } from '../services/riskService';
import type { RiskProfileData } from '../services/riskService';

// ─────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, placeholder = '0', hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground/90">{label}</label>
      <input
        type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MetricCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3.5 space-y-0.5 border ${highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${highlight ? 'text-primary' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export default function RiskPlanner() {
  const [profile, setProfile] = useState<RiskProfileData | null>(null);

  // Calculator inputs
  const [equity, setEquity] = useState('');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [riskPct, setRiskPct] = useState('');
  const [riskAmt, setRiskAmt] = useState('');
  const [direction, setDirection] = useState<'long' | 'short'>('long');

  // Pre-trade briefing
  const [briefingData, setBriefingData] = useState<ReturnType<typeof getPreTradeBriefing> | null>(null);

  useEffect(() => {
    db.table('riskProfiles').get('default').then((p: RiskProfileData | undefined) => {
      if (p) {
        setProfile(p);
        if (p.accountEquity) setEquity(String(p.accountEquity));
        else if (p.accountBalance) setEquity(String(p.accountBalance));
        if (p.defaultRiskPct) setRiskPct(String(p.defaultRiskPct));
      }
    });
    // Pre-trade briefing
    db.trades.toArray().then(trades => {
      db.table('riskProfiles').get('default').then((p: RiskProfileData | undefined) => {
        const today = new Date().toISOString().slice(0, 10);
        setBriefingData(getPreTradeBriefing(trades, p ?? null, today, null, null));
      });
    });
  }, []);

  const calc = calculatePreTradeRisk({
    accountEquity: equity ? parseFloat(equity) : null,
    entryPrice: entry ? parseFloat(entry) : null,
    stopLoss: sl ? parseFloat(sl) : null,
    takeProfit: tp ? parseFloat(tp) : null,
    riskPct: riskPct ? parseFloat(riskPct) : null,
    riskAmount: riskAmt ? parseFloat(riskAmt) : null,
    positionSize: null,
  });

  const hasResult = calc.missingFields.length === 0 || (calc.slDistance !== null);
  const rrColor = calc.plannedRR !== null
    ? calc.plannedRR >= (profile?.minRR ?? 2) ? 'text-green-500' : 'text-amber-500'
    : '';

  const handleSaveToProfile = async () => {
    if (equity && parseFloat(equity) > 0) {
      const existing: RiskProfileData | undefined = await db.table('riskProfiles').get('default');
      if (existing) {
        await db.table('riskProfiles').update('default', { accountEquity: parseFloat(equity), updatedAt: Date.now() });
      } else {
        const def: RiskProfileData = {
          id: 'default', defaultRiskPct: riskPct ? parseFloat(riskPct) : null,
          maxRiskPct: null, maxDailyRiskPct: null, maxWeeklyRiskPct: null, maxTradesPerDay: null,
          maxConsecutiveLosses: null, maxDrawdownPct: null, minRR: null,
          accountBalance: null, accountEquity: parseFloat(equity),
          currency: 'USD', riskUnit: 'percentage', sessionRules: null, setupRules: null, updatedAt: Date.now(),
        };
        await db.table('riskProfiles').put(def);
      }
      toast.success('موجودی حساب ذخیره شد');
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-2xl mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" />
            ماشین‌حساب ریسک
          </h1>
          <p className="text-sm text-muted-foreground mt-1">برنامه‌ریزی پیش از معامله — کاملاً آفلاین</p>
        </div>
      </div>

      {/* Pre-trade Briefing */}
      {briefingData && (
        <Card className="border-primary/20 bg-primary/3">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              وضعیت ریسک امروز
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="space-y-0.5">
                <p className="text-muted-foreground">ریسک مصرف‌شده امروز</p>
                <p className="font-semibold tabular-nums">
                  {briefingData.todayRiskUsed !== null ? `${briefingData.todayRiskUsed.toFixed(1)}%` : '—'}
                  {briefingData.todayRiskLimit !== null && (
                    <span className="text-muted-foreground"> / {briefingData.todayRiskLimit}%</span>
                  )}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground">معاملات امروز</p>
                <p className="font-semibold tabular-nums">
                  {briefingData.todayTradeCount}
                  {briefingData.todayTradeLimit !== null && (
                    <span className="text-muted-foreground"> / {briefingData.todayTradeLimit}</span>
                  )}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground">ضررهای متوالی</p>
                <p className={`font-semibold tabular-nums ${briefingData.currentConsecutiveLosses >= (briefingData.maxConsecutiveLossLimit ?? 999) ? 'text-destructive' : ''}`}>
                  {briefingData.currentConsecutiveLosses}
                  {briefingData.maxConsecutiveLossLimit !== null && (
                    <span className="text-muted-foreground"> / {briefingData.maxConsecutiveLossLimit}</span>
                  )}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground">افت فعلی</p>
                <p className={`font-semibold tabular-nums ${briefingData.currentDrawdownPct > (briefingData.maxDrawdownLimit ?? 100) * 0.8 ? 'text-amber-500' : ''}`}>
                  {briefingData.currentDrawdownPct.toFixed(1)}%
                </p>
              </div>
            </div>
            {briefingData.warnings.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {briefingData.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calculator Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اطلاعات معامله</CardTitle>
          <CardDescription>فیلدهای موجود را پر کنید — محاسبات خودکار هستند</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Direction */}
          <div className="flex gap-3">
            {(['long', 'short'] as const).map(d => (
              <button key={d} onClick={() => setDirection(d)}
                className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium border transition-all ${
                  direction === d
                    ? d === 'long' ? 'bg-green-500/15 border-green-500/40 text-green-500' : 'bg-red-500/15 border-red-500/40 text-red-500'
                    : 'border-border text-muted-foreground hover:bg-muted/30'
                }`}>
                {d === 'long' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {d === 'long' ? 'خرید (Long)' : 'فروش (Short)'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumInput label="موجودی/سرمایه ($)" value={equity} onChange={setEquity}
              hint="برای محاسبه درصد ریسک" />
            <NumInput label="قیمت ورود" value={entry} onChange={setEntry} placeholder="مثلاً 2045.50" />
            <NumInput label="حد ضرر (Stop Loss)" value={sl} onChange={setSl}
              hint={direction === 'long' ? 'زیر قیمت ورود' : 'بالای قیمت ورود'} />
            <NumInput label="هدف سود (Take Profit)" value={tp} onChange={setTp} hint="اختیاری" />
            <NumInput label="ریسک (٪ از سرمایه)" value={riskPct} onChange={v => { setRiskPct(v); setRiskAmt(''); }}
              placeholder={profile?.defaultRiskPct ? String(profile.defaultRiskPct) : '1'} />
            <NumInput label="ریسک (مقدار $)" value={riskAmt} onChange={v => { setRiskAmt(v); setRiskPct(''); }}
              hint="یا مقدار ریالی/دلاری" />
          </div>

          <Button variant="outline" size="sm" onClick={handleSaveToProfile} className="w-full text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            ذخیره موجودی در پروفایل ریسک
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {(entry || sl) && (
        <Card className={hasResult && !calc.warning ? 'border-green-500/20' : 'border-amber-500/20'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              نتایج محاسبه
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {calc.missingFields.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">محاسبه ناقص</p>
                  <p>{calc.warning}</p>
                  <p className="mt-1 text-amber-400/80">فیلدهای لازم: {calc.missingFields.join('، ')}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="فاصله حد ضرر"
                value={calc.slDistance !== null ? calc.slDistance.toFixed(calc.slDistance < 1 ? 5 : 2) : '—'}
                sub={calc.slDistancePct !== null ? `${calc.slDistancePct.toFixed(2)}% از ورود` : undefined}
              />
              <MetricCard
                label="ریسک مالی"
                value={calc.monetaryRisk !== null ? `$${calc.monetaryRisk.toFixed(2)}` : '—'}
                sub={calc.percentageRisk !== null ? `${calc.percentageRisk.toFixed(2)}% حساب` : undefined}
                highlight
              />
              <MetricCard
                label="حجم معامله"
                value={calc.positionSize !== null ? calc.positionSize.toFixed(4) : '—'}
                sub="واحد / لات"
              />
              <MetricCard
                label="سود بالقوه"
                value={calc.potentialReward !== null ? `$${calc.potentialReward.toFixed(2)}` : '—'}
              />
            </div>

            {/* R:R Display */}
            {calc.plannedRR !== null && (
              <div className={`rounded-xl p-4 text-center border ${
                calc.plannedRR >= (profile?.minRR ?? 2)
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}>
                <p className="text-xs text-muted-foreground mb-1">نسبت ریسک به ریوارد</p>
                <p className={`text-3xl font-bold tabular-nums ${rrColor}`}>1:{calc.plannedRR.toFixed(2)}</p>
                {profile?.minRR && (
                  <p className={`text-xs mt-1 ${calc.plannedRR >= profile.minRR ? 'text-green-500' : 'text-amber-500'}`}>
                    {calc.plannedRR >= profile.minRR ? '✓ بالاتر از حداقل مجاز' : `⚠ زیر حداقل مجاز (1:${profile.minRR})`}
                  </p>
                )}
              </div>
            )}

            {/* Violation Check */}
            {profile && (
              <div className="space-y-2">
                {profile.maxRiskPct !== null && calc.percentageRisk !== null && calc.percentageRisk > profile.maxRiskPct && (
                  <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    ریسک {calc.percentageRisk.toFixed(2)}% بیشتر از محدودیت مجاز ({profile.maxRiskPct}%) است
                  </div>
                )}
                {profile.minRR !== null && calc.plannedRR !== null && calc.plannedRR < profile.minRR && (
                  <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    نسبت R:R کمتر از حداقل مجاز شما (1:{profile.minRR}) است
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Historical context */}
      {briefingData && (briefingData.historicalAvgRiskInSetup !== null || briefingData.historicalAvgRiskInSession !== null) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              زمینه تاریخی
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {briefingData.historicalAvgRiskInSetup !== null && (
              <div className="flex justify-between">
                <span>میانگین ریسک در این ستاپ</span>
                <span className="font-medium text-foreground">{briefingData.historicalAvgRiskInSetup.toFixed(2)}% ({briefingData.setupSampleSize} معامله)</span>
              </div>
            )}
            {briefingData.historicalAvgRiskInSession !== null && (
              <div className="flex justify-between">
                <span>میانگین ریسک در این سشن</span>
                <span className="font-medium text-foreground">{briefingData.historicalAvgRiskInSession.toFixed(2)}% ({briefingData.sessionSampleSize} معامله)</span>
              </div>
            )}
            {briefingData.currentConsecutiveLosses > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-500 mt-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                {briefingData.currentConsecutiveLosses} ضرر متوالی — در نظر بگیرید قبل از ادامه مرور کنید
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="text-center text-xs text-muted-foreground pt-2 pb-6">
        این سیستم هیچ معامله‌ای ثبت یا ارسال نمی‌کند. فقط اطلاعات محاسباتی نمایش می‌دهد.
      </div>
    </div>
  );
}
