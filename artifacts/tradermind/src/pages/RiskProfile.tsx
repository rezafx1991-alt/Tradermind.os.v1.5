/**
 * RiskProfile.tsx — پروفایل ریسک شخصی (Prompt 24 — Section 2)
 * تعریف قوانین شخصی ریسک — آفلاین کامل
 */
import { useState, useEffect } from 'react';
import { ShieldCheck, Save, Plus, Trash2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { db } from '../db/database';
import type { RiskProfileData, RiskUnit, SessionRule, SetupRule } from '../services/riskService';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const defaultProfile: RiskProfileData = {
  id: 'default',
  defaultRiskPct: null,
  maxRiskPct: null,
  maxDailyRiskPct: null,
  maxWeeklyRiskPct: null,
  maxTradesPerDay: null,
  maxConsecutiveLosses: null,
  maxDrawdownPct: null,
  minRR: null,
  accountBalance: null,
  accountEquity: null,
  currency: 'USD',
  riskUnit: 'percentage',
  sessionRules: null,
  setupRules: null,
  updatedAt: Date.now(),
};

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="sm:w-60 shrink-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NumField({ value, onChange, placeholder, suffix }: {
  value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '—'}
        className="w-28 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
export default function RiskProfile() {
  const [profile, setProfile] = useState<RiskProfileData>({ ...defaultProfile });
  const [sessionRules, setSessionRules] = useState<SessionRule[]>([]);
  const [setupRules, setSetupRules] = useState<SetupRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Controlled inputs (string for empty state)
  const f = (v: number | null) => (v !== null ? String(v) : '');
  const [defaultRisk, setDefaultRisk] = useState('');
  const [maxRisk, setMaxRisk] = useState('');
  const [maxDailyRisk, setMaxDailyRisk] = useState('');
  const [maxWeeklyRisk, setMaxWeeklyRisk] = useState('');
  const [maxTradesDay, setMaxTradesDay] = useState('');
  const [maxConsecLoss, setMaxConsecLoss] = useState('');
  const [maxDrawdown, setMaxDrawdown] = useState('');
  const [minRR, setMinRR] = useState('');
  const [balance, setBalance] = useState('');
  const [equity, setEquity] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [riskUnit, setRiskUnit] = useState<RiskUnit>('percentage');

  useEffect(() => {
    db.table('riskProfiles').get('default').then((p: RiskProfileData | undefined) => {
      if (p) {
        setProfile(p);
        setDefaultRisk(f(p.defaultRiskPct));
        setMaxRisk(f(p.maxRiskPct));
        setMaxDailyRisk(f(p.maxDailyRiskPct));
        setMaxWeeklyRisk(f(p.maxWeeklyRiskPct));
        setMaxTradesDay(f(p.maxTradesPerDay));
        setMaxConsecLoss(f(p.maxConsecutiveLosses));
        setMaxDrawdown(f(p.maxDrawdownPct));
        setMinRR(f(p.minRR));
        setBalance(f(p.accountBalance));
        setEquity(f(p.accountEquity));
        setCurrency(p.currency ?? 'USD');
        setRiskUnit(p.riskUnit ?? 'percentage');
        try { setSessionRules(JSON.parse(p.sessionRules ?? '[]')); } catch { setSessionRules([]); }
        try { setSetupRules(JSON.parse(p.setupRules ?? '[]')); } catch { setSetupRules([]); }
      }
      setLoaded(true);
    });
  }, []);

  const n = (v: string) => (v.trim() === '' ? null : parseFloat(v));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated: RiskProfileData = {
        id: 'default',
        defaultRiskPct: n(defaultRisk),
        maxRiskPct: n(maxRisk),
        maxDailyRiskPct: n(maxDailyRisk),
        maxWeeklyRiskPct: n(maxWeeklyRisk),
        maxTradesPerDay: n(maxTradesDay),
        maxConsecutiveLosses: n(maxConsecLoss),
        maxDrawdownPct: n(maxDrawdown),
        minRR: n(minRR),
        accountBalance: n(balance),
        accountEquity: n(equity),
        currency,
        riskUnit,
        sessionRules: sessionRules.length > 0 ? JSON.stringify(sessionRules) : null,
        setupRules: setupRules.length > 0 ? JSON.stringify(setupRules) : null,
        updatedAt: Date.now(),
      };
      await db.table('riskProfiles').put(updated);
      setProfile(updated);
      toast.success('پروفایل ریسک ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">در حال بارگذاری...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-2xl mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            پروفایل ریسک شخصی
          </h1>
          <p className="text-sm text-muted-foreground mt-1">قوانین ریسک خود را تعریف کنید — این مقادیر منبع اصلی تحلیل هستند</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2 shrink-0">
          <Save className="w-4 h-4" />
          {saving ? 'ذخیره...' : 'ذخیره'}
        </Button>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اطلاعات حساب</CardTitle>
          <CardDescription>موجودی و واحد ریسک مورد استفاده</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldRow label="موجودی حساب" hint="آخرین موجودی ثبت‌شده">
            <NumField value={balance} onChange={setBalance} suffix={currency} />
          </FieldRow>
          <FieldRow label="ارزش حقیقی حساب (Equity)" hint="موجودی با احتساب معاملات باز">
            <NumField value={equity} onChange={setEquity} suffix={currency} />
          </FieldRow>
          <FieldRow label="واحد ارز">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['USD', 'EUR', 'GBP', 'IRR', 'USDT'].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="واحد اندازه‌گیری ریسک">
            <Select value={riskUnit} onValueChange={v => setRiskUnit(v as RiskUnit)}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">درصد از سرمایه (%)</SelectItem>
                <SelectItem value="fixed">مقدار ثابت ($)</SelectItem>
                <SelectItem value="r-multiple">مضرب R</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </CardContent>
      </Card>

      {/* Core Risk Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">قوانین ریسک اصلی</CardTitle>
          <CardDescription>تمام مقادیر اختیاری هستند — فقط مواردی که برای شما معنادار است را پر کنید</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldRow label="ریسک پیش‌فرض هر معامله" hint="مقدار معمول ریسک شما">
            <NumField value={defaultRisk} onChange={setDefaultRisk} placeholder="مثلاً 1" suffix="%" />
          </FieldRow>
          <FieldRow label="حداکثر ریسک هر معامله" hint="بالاتر = نقض قانون">
            <NumField value={maxRisk} onChange={setMaxRisk} placeholder="مثلاً 2" suffix="%" />
          </FieldRow>
          <FieldRow label="حداکثر ریسک روزانه" hint="مجموع ریسک در یک روز">
            <NumField value={maxDailyRisk} onChange={setMaxDailyRisk} placeholder="مثلاً 3" suffix="%" />
          </FieldRow>
          <FieldRow label="حداکثر ریسک هفتگی" hint="مجموع ریسک در یک هفته">
            <NumField value={maxWeeklyRisk} onChange={setMaxWeeklyRisk} placeholder="مثلاً 6" suffix="%" />
          </FieldRow>
          <FieldRow label="حداکثر معاملات روزانه" hint="بیشتر = مرور اجباری">
            <NumField value={maxTradesDay} onChange={setMaxTradesDay} placeholder="مثلاً 3" suffix="معامله" />
          </FieldRow>
          <FieldRow label="حداکثر ضررهای متوالی" hint="بیشتر = نیاز به مرور">
            <NumField value={maxConsecLoss} onChange={setMaxConsecLoss} placeholder="مثلاً 3" suffix="ضرر" />
          </FieldRow>
          <FieldRow label="حداکثر افت سرمایه مجاز" hint="Drawdown مجاز">
            <NumField value={maxDrawdown} onChange={setMaxDrawdown} placeholder="مثلاً 10" suffix="%" />
          </FieldRow>
          <FieldRow label="حداقل نسبت ریسک به ریوارد" hint="R:R پایین‌تر = نقض قانون">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">1:</span>
              <NumField value={minRR} onChange={setMinRR} placeholder="مثلاً 2" />
            </div>
          </FieldRow>
        </CardContent>
      </Card>

      {/* Session-specific rules */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">قوانین خاص سشن</CardTitle>
            <CardDescription>حداکثر ریسک برای هر سشن معاملاتی</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSessionRules(prev => [...prev, { session: 'asian', maxRiskPct: 1 }])}>
            <Plus className="w-4 h-4" />
          </Button>
        </CardHeader>
        {sessionRules.length > 0 && (
          <CardContent className="space-y-3">
            {sessionRules.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <Select value={r.session} onValueChange={v => {
                  const u = [...sessionRules]; u[i] = { ...u[i], session: v }; setSessionRules(u);
                }}>
                  <SelectTrigger className="flex-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[['asian','آسیا'], ['london','لندن'], ['new-york','نیویورک'], ['overlap','همپوشانی']].map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="number" value={r.maxRiskPct} onChange={e => {
                  const u = [...sessionRules]; u[i] = { ...u[i], maxRiskPct: parseFloat(e.target.value) }; setSessionRules(u);
                }} className="w-20 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <span className="text-sm text-muted-foreground">%</span>
                <button onClick={() => setSessionRules(prev => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* Setup-specific rules */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">قوانین خاص ستاپ</CardTitle>
            <CardDescription>حداکثر ریسک برای ستاپ‌های خاص</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSetupRules(prev => [...prev, { setup: '', maxRiskPct: 1 }])}>
            <Plus className="w-4 h-4" />
          </Button>
        </CardHeader>
        {setupRules.length > 0 && (
          <CardContent className="space-y-3">
            {setupRules.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <input type="text" value={r.setup} onChange={e => {
                  const u = [...setupRules]; u[i] = { ...u[i], setup: e.target.value }; setSetupRules(u);
                }} placeholder="نام ستاپ (مثلاً OB)" dir="ltr"
                  className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <input type="number" value={r.maxRiskPct} onChange={e => {
                  const u = [...setupRules]; u[i] = { ...u[i], maxRiskPct: parseFloat(e.target.value) }; setSetupRules(u);
                }} className="w-20 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <span className="text-sm text-muted-foreground">%</span>
                <button onClick={() => setSetupRules(prev => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* Info note */}
      <div className="flex items-start gap-3 rounded-xl bg-muted/20 border border-border/50 p-4 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>همه مقادیر به صورت محلی ذخیره می‌شوند. این سیستم هیچ داده‌ای را آپلود نمی‌کند و هیچ اتصالی به بروکر ندارد. قوانین تعریف‌شده فقط برای تحلیل رفتار ریسک شما استفاده می‌شوند.</p>
      </div>

      <div className="pb-8">
        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'در حال ذخیره...' : 'ذخیره پروفایل ریسک'}
        </Button>
      </div>
    </div>
  );
}
