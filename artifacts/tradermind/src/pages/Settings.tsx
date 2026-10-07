import { useState, useEffect, useCallback } from "react";
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from "../store/useAppStore";
import { useSecurityStore, AUTO_LOCK_LABELS, AutoLockOption } from "../security/useSecurityStore";
import { securityService } from "../security/securityService";
import { backupService } from "../services/backupService";
import { DB_VERSION, APP_VERSION } from "../services/backupService";
import { storageMonitorService, formatBytes, type StorageInfo } from "../services/storageService";
import { accountService } from "../services/accountService";
import { tradingBoxService } from "../services/tradingBoxService";
import type { Account, TradingBox } from "../db/database";
import { SecuritySetupDialog } from "../components/SecuritySetupDialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { useLocation } from "wouter";
import {
  Moon, Sun, Monitor, Type, Palette, Globe, Activity, BookOpen, Clock,
  LayoutDashboard, HardDrive, Info, Database, Trash2,
  Plus, X, Download, Upload, WifiOff, ShieldCheck, Lock, LockOpen,
  Bell, RefreshCw, Smile, KeyRound, Eye, EyeOff, CheckCircle2, AlertTriangle, SlidersHorizontal
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { t } from "../lib/i18n";
import { formatTradingOffset } from "../lib/tradingTime";

// ─────────────────────────────────────────────
// کامپوننت‌های کمکی
// ─────────────────────────────────────────────
function Section({ icon: Icon, title, description, children, danger }: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card className={danger ? 'border-destructive/20' : ''}>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2 text-base", danger && "text-destructive")}>
          <Icon className="w-4 h-4 shrink-0" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SwitchRow({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <SettingRow label={label} description={description}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </SettingRow>
  );
}

function TagManager({ items, placeholder, onAdd, onRemove }: {
  items: string[]; placeholder: string;
  onAdd: (v: string) => void; onRemove: (v: string) => void;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    if (!input.trim()) return;
    onAdd(input.trim());
    setInput('');
  };
  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {items.map((item) => (
            <span key={item} className="flex items-center gap-1 text-xs bg-muted rounded-full px-3 py-1">
              {item}
              <button onClick={() => onRemove(item)} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="text-sm"
          dir="rtl"
        />
        <Button size="sm" onClick={add} variant="outline"><Plus className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fa-IR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ─────────────────────────────────────────────
// دیالوگ Backup رمزگذاری‌شده
// ─────────────────────────────────────────────
function EncryptedBackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pw1, setPw1]   = useState('');
  const [pw2, setPw2]   = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setStep('enter'); setPw1(''); setPw2(''); setError(''); setBusy(false); };
  const handleClose = () => { reset(); onClose(); };

  const handleNext = async () => {
    if (step === 'enter') {
      if (pw1.length < 6) { setError('رمز عبور باید حداقل ۶ کاراکتر باشد'); return; }
      setStep('confirm'); setError(''); return;
    }
    if (pw1 !== pw2) { setError('رمز عبورها یکسان نیستند'); setPw2(''); return; }
    setBusy(true);
    try {
      await backupService.exportEncrypted(pw1);
      toast.success('Backup رمزگذاری‌شده ایجاد شد');
      handleClose();
    } catch (e: any) {
      setError('خطا در ایجاد Backup: ' + (e?.message ?? ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            Backup رمزگذاری‌شده
          </DialogTitle>
          <DialogDescription>
            {step === 'enter'
              ? 'یک رمز عبور برای این Backup تعیین کنید. بدون این رمز، بازیابی ممکن نیست.'
              : 'رمز عبور را دوباره وارد کنید'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="relative">
            <Input
              type={show1 ? 'text' : 'password'}
              value={pw1}
              onChange={e => { setPw1(e.target.value); setError(''); }}
              readOnly={step === 'confirm'}
              placeholder={step === 'enter' ? 'رمز عبور Backup' : 'همان رمز'}
              className="pl-10"
              dir="ltr"
              autoFocus
            />
            <button onClick={() => setShow1(s => !s)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {show1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {step === 'confirm' && (
            <div className="relative">
              <Input
                type={show2 ? 'text' : 'password'}
                value={pw2}
                onChange={e => { setPw2(e.target.value); setError(''); }}
                placeholder="تأیید رمز عبور"
                className="pl-10"
                dir="ltr"
                autoFocus
              />
              <button onClick={() => setShow2(s => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {show2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>رمز عبور این Backup را یادداشت کنید. بدون آن بازیابی ممکن نیست.</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleNext} disabled={busy || (step === 'enter' ? !pw1 : !pw2)} className="flex-1">
              {busy ? 'در حال پردازش...' : step === 'enter' ? 'ادامه' : 'ایجاد Backup'}
            </Button>
            <Button variant="outline" onClick={step === 'confirm' ? () => { setStep('enter'); setPw2(''); setError(''); } : handleClose} className="flex-1">
              {step === 'confirm' ? 'بازگشت' : 'لغو'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// بخش امنیت
// ─────────────────────────────────────────────
function SecuritySection() {
  const {
    isEnabled, credentialType, storedCredential, autoLockMinutes,
    encryptedBackupEnabled,
    enableSecurity, disableSecurity, setAutoLockMinutes, setEncryptedBackup,
  } = useSecurityStore();

  const [setupOpen, setSetupOpen]   = useState(false);
  const [encBackupOpen, setEncBackupOpen] = useState(false);
  const [disableStep, setDisableStep] = useState(0);

  // غیرفعال کردن قفل با تأیید
  const handleDisable = () => {
    disableSecurity();
    setDisableStep(0);
    toast.success('قفل برنامه غیرفعال شد');
  };

  const autoLockOptions: AutoLockOption[] = [-1, 0, 1, 5, 15];

  return (
    <>
      <SecuritySetupDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        mode={isEnabled ? 'change' : 'enable'}
      />
      <EncryptedBackupDialog open={encBackupOpen} onClose={() => setEncBackupOpen(false)} />

      <Section icon={ShieldCheck} title="امنیت و حریم خصوصی" description="قفل برنامه، رمزگذاری و حفاظت از داده‌ها">

        {/* وضعیت کلی */}
        <div className={cn(
          'flex items-center gap-3 p-3 rounded-xl border',
          isEnabled ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/30 border-border',
        )}>
          {isEnabled
            ? <Lock className="w-5 h-5 text-green-500 shrink-0" />
            : <LockOpen className="w-5 h-5 text-muted-foreground shrink-0" />}
          <div className="flex-1">
            <p className="text-sm font-medium">{isEnabled ? 'قفل برنامه فعال است' : 'قفل برنامه غیرفعال است'}</p>
            {isEnabled && (
              <p className="text-xs text-muted-foreground mt-0.5">
                نوع: {credentialType === 'pin' ? 'PIN ۶ رقمی' : 'رمز عبور'}
                {' — '}
                قفل خودکار: {AUTO_LOCK_LABELS[autoLockMinutes]}
              </p>
            )}
          </div>
          {isEnabled
            ? <Badge variant="secondary" className="text-green-600 bg-green-500/10 text-xs">فعال</Badge>
            : <Badge variant="outline" className="text-xs">غیرفعال</Badge>}
        </div>

        {/* دکمه‌های فعال/غیرفعال کردن */}
        {!isEnabled ? (
          <Button variant="outline" className="w-full" onClick={() => setSetupOpen(true)}>
            <Lock className="w-4 h-4 me-2" />
            فعال کردن قفل برنامه
          </Button>
        ) : (
          <div className="space-y-3">
            {/* تغییر PIN/رمز */}
            <Button variant="outline" className="w-full" onClick={() => setSetupOpen(true)}>
              <KeyRound className="w-4 h-4 me-2" />
              تغییر {credentialType === 'pin' ? 'PIN' : 'رمز عبور'}
            </Button>

            {/* تنظیم Auto-Lock */}
            <div>
              <p className="text-sm font-medium mb-2">قفل خودکار بعد از بی‌فعالی</p>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {autoLockOptions.map(opt => (
                  <button key={opt} onClick={() => setAutoLockMinutes(opt)}
                    className={cn(
                      'py-2 px-1 rounded-lg text-xs font-medium border-2 transition-all',
                      autoLockMinutes === opt
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/40 text-muted-foreground',
                    )}>
                    {AUTO_LOCK_LABELS[opt]}
                  </button>
                ))}
              </div>
            </div>

            {/* غیرفعال کردن */}
            {disableStep === 0 && (
              <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => setDisableStep(1)}>
                <LockOpen className="w-4 h-4 me-2" />
                غیرفعال کردن قفل
              </Button>
            )}
            {disableStep === 1 && (
              <div className="p-3 border-2 border-destructive/30 rounded-xl bg-destructive/5 space-y-2">
                <p className="text-sm text-destructive font-medium">⚠️ آیا مطمئن هستید؟</p>
                <p className="text-xs text-destructive/70">قفل برنامه و PIN/رمز عبور حذف می‌شوند.</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDisable}>غیرفعال کن</Button>
                  <Button variant="outline" size="sm" onClick={() => setDisableStep(0)}>لغو</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Backup رمزگذاری‌شده */}
        <div className="pt-2 border-t border-border/50">
          <p className="text-sm font-medium mb-1">Backup رمزگذاری‌شده</p>
          <p className="text-xs text-muted-foreground mb-3">
            یک Backup ایجاد کنید که محتوایش با رمز عبور محافظت شده باشد (AES-GCM 256-bit).
            این ویژگی مستقل از قفل برنامه است.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setEncBackupOpen(true)}>
            <KeyRound className="w-4 h-4 me-2" />
            ایجاد Backup رمزگذاری‌شده
          </Button>
        </div>

        {/* اطلاعات امنیتی */}
        <div className="pt-2 border-t border-border/50 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span>رمز عبور/PIN هرگز ذخیره نمی‌شود — فقط hash (PBKDF2 + SHA-256)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span>رمزگذاری: Web Crypto API استاندارد مرورگر — بدون کتابخانه خارجی</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span>تمام داده‌ها فقط روی دستگاه شما ذخیره می‌شوند</span>
          </div>
        </div>
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────
// صفحه اصلی
// ─────────────────────────────────────────────
export default function Settings() {
  const [, navigate] = useLocation();
  // PART 8 / Prompt 3 — selector برای جلوگیری از re-render غیرضروری
  const store = useAppStore(
    useShallow(s => ({
       theme: s.theme, fontSize: s.fontSize, colorTheme: s.colorTheme, textColor: s.textColor,
      analysisAutosave: s.analysisAutosave, analysisShowNextStep: s.analysisShowNextStep,
      analysisPhaseSummary: s.analysisPhaseSummary, analysisConfirmPhase: s.analysisConfirmPhase,
      analysisProgressBar: s.analysisProgressBar,
      journalAutosave: s.journalAutosave,
      journalCustomTags: s.journalCustomTags, journalCustomEmotions: s.journalCustomEmotions,
      dashShowTrades: s.dashShowTrades, dashShowWinRate: s.dashShowWinRate,
      dashShowPnl: s.dashShowPnl, dashShowAvgR: s.dashShowAvgR,
      dashShowRecentTrades: s.dashShowRecentTrades, dashShowLastJournal: s.dashShowLastJournal,
      dashShowAdherence: s.dashShowAdherence,
       dashboardMessage: s.dashboardMessage,
      defaultAccountId: s.defaultAccountId, defaultTradingBoxId: s.defaultTradingBoxId,
      defaultSymbol: s.defaultSymbol, defaultMarket: s.defaultMarket,
      tradingTimeMode: s.tradingTimeMode, brokerUtcOffsetMinutes: s.brokerUtcOffsetMinutes,
      // setters
       setTheme: s.setTheme, setFontSize: s.setFontSize,
       setColorTheme: s.setColorTheme, setTextColor: s.setTextColor,
      setAnalysisAutosave: s.setAnalysisAutosave, setAnalysisShowNextStep: s.setAnalysisShowNextStep,
      setAnalysisPhaseSummary: s.setAnalysisPhaseSummary, setAnalysisConfirmPhase: s.setAnalysisConfirmPhase,
      setAnalysisProgressBar: s.setAnalysisProgressBar,
      setJournalAutosave: s.setJournalAutosave,
      addJournalTag: s.addJournalTag, removeJournalTag: s.removeJournalTag,
      addJournalEmotion: s.addJournalEmotion, removeJournalEmotion: s.removeJournalEmotion,
      setDashShowTrades: s.setDashShowTrades, setDashShowWinRate: s.setDashShowWinRate,
      setDashShowPnl: s.setDashShowPnl, setDashShowAvgR: s.setDashShowAvgR,
      setDashShowRecentTrades: s.setDashShowRecentTrades, setDashShowLastJournal: s.setDashShowLastJournal,
      setDashShowAdherence: s.setDashShowAdherence,
       setDashboardMessage: s.setDashboardMessage,
      setDefaultAccountId: s.setDefaultAccountId, setDefaultTradingBoxId: s.setDefaultTradingBoxId,
      setDefaultSymbol: s.setDefaultSymbol, setDefaultMarket: s.setDefaultMarket,
      setTradingTimeMode: s.setTradingTimeMode, setBrokerUtcOffsetMinutes: s.setBrokerUtcOffsetMinutes,
      resetToDefaults: s.resetToDefaults,
    }))
  );

  const [storageSize, setStorageSize] = useState(0);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [screenshotEstimate, setScreenshotEstimate] = useState<{ count: number; estimatedBytes: number } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tradingBoxes, setTradingBoxes] = useState<TradingBox[]>([]);
  const deviceUtcOffsetMinutes = -new Date().getTimezoneOffset();
  const brokerDeviceDifferenceMinutes = store.brokerUtcOffsetMinutes - deviceUtcOffsetMinutes;
  const brokerDeviceDifferenceOptions = Array.from(
    { length: 209 },
    (_, index) => (index - 104) * 15,
  ).filter(difference => {
    const brokerOffset = deviceUtcOffsetMinutes + difference;
    return brokerOffset >= -720 && brokerOffset <= 840;
  });

  const refreshStorageInfo = useCallback(async () => {
    const [info, est] = await Promise.all([
      storageMonitorService.getStorageInfo(),
      storageMonitorService.getScreenshotStorageEstimate(),
    ]);
    setStorageInfo(info);
    setStorageSize(info.usage);
    setScreenshotEstimate(est);
  }, []);

  useEffect(() => { refreshStorageInfo(); }, [refreshStorageInfo]);
  useEffect(() => {
    void Promise.all([accountService.getAll(), tradingBoxService.getAll()])
      .then(([loadedAccounts, loadedBoxes]) => {
        setAccounts(loadedAccounts);
        setTradingBoxes(loadedBoxes);
      })
      .catch(() => {
        toast.error('بارگذاری حساب‌ها و باکس‌های معاملاتی انجام نشد');
      });
  }, []);

  // ── حذف داده‌ها (۳ مرحله‌ای)
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteInput, setDeleteInput] = useState('');

  const handleDelete = async () => {
    if (deleteInput !== 'حذف شود') { toast.error('متن تأیید صحیح نیست'); return; }
    await backupService.resetAll();
    toast.success('تمام اطلاعات حذف شد');
    setTimeout(() => navigate('/'), 1000);
  };

  // ── پاک کردن Cache
  const handleClearCache = () => {
    const keysToRemove = ['tradermind-backup-history', 'tradermind-last-backup'];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    toast.success('حافظه موقت پاک شد');
  };

  const lastBackup = localStorage.getItem('tradermind-last-backup');
  const backupHistory = backupService.getHistory();

  return (
    <div className="space-y-5 animate-in fade-in duration-500 max-w-2xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t.settings.title}</h1>
        <p className="text-muted-foreground mt-1">{t.settings.subtitle}</p>
      </div>

      {/* ── ۱. ظاهر برنامه */}
      <Section icon={Sun} title={t.settings.appearance} description={t.settings.appearanceDesc}>
        <div>
          <p className="text-sm font-medium mb-2">{t.settings.displayMode}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'light', label: t.settings.light, icon: Sun },
              { value: 'dark',  label: t.settings.dark,  icon: Moon },
              { value: 'system', label: t.settings.system, icon: Monitor },
            ].map(({ value, label, icon: Icon }) => (
              <button key={value} onClick={() => store.setTheme(value as any)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all',
                  store.theme === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}>
                <Icon className="w-5 h-5" />{label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2">{t.settings.fontSize}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { value: 'xs', label: 'خیلی کوچک', cls: 'text-xs' },
              { value: 'sm', label: t.settings.fontSizeSm, cls: 'text-xs' },
              { value: 'md', label: t.settings.fontSizeMd, cls: 'text-sm' },
              { value: 'lg', label: t.settings.fontSizeLg, cls: 'text-base' },
              { value: 'xl', label: 'خیلی بزرگ', cls: 'text-lg' },
            ].map(({ value, label, cls }) => (
              <button key={value} onClick={() => store.setFontSize(value as any)}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 font-medium transition-all',
                  value === 'xl' && 'col-span-2 sm:col-span-1',
                  cls,
                  store.fontSize === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}>
                <Type className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <p className="text-sm font-medium">رنگ اصلی برنامه</p>
              <p className="text-xs text-muted-foreground mt-0.5">رنگ دکمه‌ها، لینک‌ها، نمودارها و وضعیت فعال منو</p>
            </div>
            <Palette className="w-4 h-4 text-primary shrink-0" />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              { value: 'blue', label: 'آبی', color: '#3b82f6' },
              { value: 'violet', label: 'بنفش', color: '#8b5cf6' },
              { value: 'emerald', label: 'سبز', color: '#10b981' },
              { value: 'amber', label: 'کهربایی', color: '#f59e0b' },
              { value: 'rose', label: 'رز', color: '#f43f5e' },
            ].map(({ value, label, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => store.setColorTheme(value as any)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 text-xs font-medium transition-all',
                  store.colorTheme === value
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}
                aria-label={`انتخاب رنگ ${label}`}
              >
                <span className="h-6 w-6 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: color }} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">رنگ متن برنامه</p>
              <p className="text-xs text-muted-foreground mt-0.5">برای خوانایی بهتر متن‌ها را در حالت تاریک روشن‌تر کنید</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={store.textColor === 'auto' ? (store.theme === 'light' ? '#1a202c' : '#e2e8f0') : store.textColor}
                onChange={e => store.setTextColor(e.target.value as `#${string}`)}
                className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent p-1"
                aria-label="انتخاب رنگ متن"
              />
              <button
                type="button"
                onClick={() => store.setTextColor('auto')}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  store.textColor === 'auto'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}
              >
                خودکار
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: store.textColor === 'auto' ? 'hsl(var(--foreground))' : store.textColor }} />
            <span className="text-sm">نمونه متن اصلی</span>
            <span className="text-xs text-muted-foreground">متن کمکی برای بررسی کنتراست</span>
          </div>
        </div>
      </Section>

      {/* ── ۲. زبان */}
      <Section icon={Globe} title={t.settings.language} description={t.settings.languageDesc}>
        <SettingRow label="زبان فعلی" description="پشتیبانی از زبان‌های بیشتر در نسخه‌های آینده">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{t.settings.languageFa}</Badge>
            <Badge variant="outline" className="text-muted-foreground text-xs">RTL</Badge>
          </div>
        </SettingRow>
      </Section>

      {/* ── ۳. امنیت */}
      <SecuritySection />

      {/* ── ۴. تنظیمات تحلیل */}
      <Section icon={SlidersHorizontal} title="پیش‌فرض‌های ثبت معامله" description="این مقادیر هنگام ایجاد معامله جدید به‌صورت خودکار انتخاب می‌شوند.">
        <SettingRow label="حساب معاملاتی" description="حسابی که معمولاً با آن معامله می‌کنید">
          <Select
            value={store.defaultAccountId ?? 'none'}
            onValueChange={value => store.setDefaultAccountId(value === 'none' ? null : value)}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="بدون پیش‌فرض" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون پیش‌فرض</SelectItem>
              {accounts.map(account => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="باکس معاملاتی" description="باکسی که معامله جدید در آن قرار می‌گیرد">
          <Select
            value={store.defaultTradingBoxId ?? 'none'}
            onValueChange={value => store.setDefaultTradingBoxId(value === 'none' ? null : value)}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="بدون پیش‌فرض" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون پیش‌فرض</SelectItem>
              {tradingBoxes.map(box => <SelectItem key={box.id} value={box.id}>{box.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="نماد معاملاتی" description="نماد اولیه فرم ثبت معامله">
          <Input
            value={store.defaultSymbol}
            onChange={e => store.setDefaultSymbol(e.target.value.toUpperCase())}
            className="w-44 uppercase"
            dir="ltr"
            placeholder="XAUUSD"
          />
        </SettingRow>
        <SettingRow label="بازار" description="بازار اولیه فرم ثبت معامله">
          <Select value={store.defaultMarket} onValueChange={store.setDefaultMarket}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[
                ['Forex', 'فارکس'],
                ['Crypto', 'ارز دیجیتال'],
                ['Indices', 'شاخص‌ها'],
                ['Stocks', 'سهام'],
                ['Commodities', 'کالاها'],
                ['Other', 'سایر'],
              ].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label="مبنای ساعت معاملات"
          description="گزارش‌ها و تحلیل ساعت/روز بر اساس این مبنا دسته‌بندی می‌شوند"
        >
          <Select
            value={store.tradingTimeMode}
            onValueChange={value => store.setTradingTimeMode(value as 'device' | 'broker')}
          >
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="device">ساعت دستگاه</SelectItem>
              <SelectItem value="broker">ساعت بروکر</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        {store.tradingTimeMode === 'broker' && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="w-4 h-4 text-primary" />
              اختلاف ساعت بروکر با ساعت گوشی
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                اختلاف ساعت بروکر نسبت به ساعت فعلی دستگاه را انتخاب کنید؛ این روش در اندروید بدون ورود عدد با کیبورد کار می‌کند.
              </p>
              <Select
                value={String(brokerDeviceDifferenceMinutes)}
                onValueChange={value => {
                  const difference = Number(value);
                  if (Number.isFinite(difference)) {
                    store.setBrokerUtcOffsetMinutes(deviceUtcOffsetMinutes + difference);
                  }
                }}
              >
                <SelectTrigger className="w-full min-h-11" dir="ltr">
                  <SelectValue placeholder="اختلاف ساعت را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {brokerDeviceDifferenceOptions.map(difference => (
                    <SelectItem key={difference} value={String(difference)} dir="ltr">
                      {formatTradingOffset(difference).replace('UTC', '')}
                      {difference === 0 ? ' — برابر با ساعت گوشی' : difference > 0 ? ' — جلوتر از گوشی' : ' — عقب‌تر از گوشی'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-md bg-background/60 px-2.5 py-2">
                <span className="text-muted-foreground">ساعت گوشی</span>
                <strong className="block mt-0.5" dir="ltr">{formatTradingOffset(deviceUtcOffsetMinutes)}</strong>
              </div>
              <div className="rounded-md bg-background/60 px-2.5 py-2">
                <span className="text-muted-foreground">ساعت بروکر</span>
                <strong className="block mt-0.5" dir="ltr">{formatTradingOffset(store.brokerUtcOffsetMinutes)}</strong>
              </div>
              <div className="rounded-md bg-background/60 px-2.5 py-2">
                <span className="text-muted-foreground">اختلاف انتخاب‌شده</span>
                <strong className="block mt-0.5" dir="ltr">{formatTradingOffset(brokerDeviceDifferenceMinutes).replace('UTC', '')}</strong>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              مثال: اگر ساعت گوشی UTC+3:30 و ساعت بروکر UTC+2:00 است، گزینهٔ <span className="font-semibold" dir="ltr">-1:30</span> را انتخاب کنید.
              این تنظیم فقط مبنای نمایش و گزارش‌ها را عوض می‌کند و زمان خام معاملات و بکاپ‌ها را تغییر نمی‌دهد.
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground rounded-md bg-muted/30 border p-3">
          اگر حساب یا باکس انتخاب‌شده بعداً حذف شود، معامله جدید بدون آن مقدار ایجاد می‌شود و اطلاعات قبلی شما تغییر نمی‌کند.
        </p>
      </Section>

      {/* ── ۵. تنظیمات تحلیل */}
      <Section icon={Activity} title={t.settings.analysis} description={t.settings.analysisDesc}>
        <SwitchRow label={t.settings.analysisAutosave} description={t.settings.analysisAutosaveDesc}
          checked={store.analysisAutosave} onChange={store.setAnalysisAutosave} />
        <SwitchRow label={t.settings.analysisShowNext} description={t.settings.analysisShowNextDesc}
          checked={store.analysisShowNextStep} onChange={store.setAnalysisShowNextStep} />
        <SwitchRow label={t.settings.analysisPhaseSummary} description={t.settings.analysisPhaseSummaryDesc}
          checked={store.analysisPhaseSummary} onChange={store.setAnalysisPhaseSummary} />
        <SwitchRow label={t.settings.analysisConfirm} description={t.settings.analysisConfirmDesc}
          checked={store.analysisConfirmPhase} onChange={store.setAnalysisConfirmPhase} />
        <SwitchRow label={t.settings.analysisProgress} description={t.settings.analysisProgressDesc}
          checked={store.analysisProgressBar} onChange={store.setAnalysisProgressBar} />
      </Section>

      {/* ── ۵. تنظیمات ژورنال */}
      <Section icon={BookOpen} title={t.settings.journal} description={t.settings.journalDesc}>
        <SwitchRow label={t.settings.journalAutosave} description={t.settings.journalAutosaveDesc}
          checked={store.journalAutosave} onChange={store.setJournalAutosave} />
        <div>
          <p className="text-sm font-medium mb-2">{t.settings.journalTags}</p>
          <TagManager
            items={store.journalCustomTags}
            placeholder="برچسب جدید..."
            onAdd={store.addJournalTag}
            onRemove={store.removeJournalTag}
          />
        </div>
        <div>
          <p className="text-sm font-medium mb-1 flex items-center gap-1.5">
            <Smile className="w-3.5 h-3.5 text-muted-foreground" />
            احساسات شخصی
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            علاوه بر احساسات پیش‌فرض، می‌توانید احساسات اختصاصی اضافه کنید
          </p>
          <TagManager
            items={store.journalCustomEmotions}
            placeholder="احساس جدید..."
            onAdd={store.addJournalEmotion}
            onRemove={store.removeJournalEmotion}
          />
        </div>
      </Section>

      {/* ── ۶. شخصی‌سازی داشبورد */}
      <Section icon={LayoutDashboard} title={t.settings.dashboard} description={t.settings.dashboardDesc}>
        <SwitchRow label="تعداد معاملات" checked={store.dashShowTrades} onChange={store.setDashShowTrades} />
        <SwitchRow label="درصد برد" checked={store.dashShowWinRate} onChange={store.setDashShowWinRate} />
        <SwitchRow label="مجموع سود/زیان" checked={store.dashShowPnl} onChange={store.setDashShowPnl} />
        <SwitchRow label="میانگین R:R" checked={store.dashShowAvgR} onChange={store.setDashShowAvgR} />
        <SwitchRow label="آخرین تحلیل‌ها" checked={store.dashShowRecentTrades} onChange={store.setDashShowRecentTrades} />
        <SwitchRow label="آخرین ژورنال روزانه" checked={store.dashShowLastJournal} onChange={store.setDashShowLastJournal} />
        <SwitchRow label="میزان پایبندی به استراتژی" checked={store.dashShowAdherence} onChange={store.setDashShowAdherence} />
       <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
         <div>
           <p className="text-sm font-medium">پیام داشبورد</p>
           <p className="text-xs text-muted-foreground mt-0.5">این متن زیر پیام خوش‌آمدگویی نمایش داده می‌شود؛ خالی بگذارید تا متن پیش‌فرض نشان داده شود.</p>
         </div>
         <Textarea
           value={store.dashboardMessage}
           onChange={e => store.setDashboardMessage(e.target.value)}
           placeholder="مثلاً امروز فقط ستاپ‌های باکیفیت را بررسی کن."
           maxLength={240}
           className="min-h-[80px] bg-background"
         />
         <div className="text-left text-[10px] text-muted-foreground">{store.dashboardMessage.length}/۲۴۰</div>
       </div>
      </Section>

      {/* ── ۷. تنظیمات اعلان‌ها */}
      <Section icon={Bell} title="تنظیمات اعلان‌ها" description="مدیریت اعلان‌های برنامه">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-dashed">
          <Bell className="w-5 h-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">اعلان‌های مرورگر</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              این قابلیت در نسخه‌های آینده اضافه می‌شود.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">به‌زودی</Badge>
        </div>
      </Section>

      {/* ── ۸. تنظیمات ذخیره‌سازی */}
      <Section icon={HardDrive} title="تنظیمات ذخیره‌سازی" description="وضعیت و مدیریت حافظه محلی">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">نوع ذخیره‌سازی</span>
            <div className="flex items-center gap-1.5 text-primary">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-medium">IndexedDB + localStorage</span>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">حجم تقریبی مصرفی</span>
            <span className="font-medium">{formatSize(storageSize)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">دسترسی آفلاین</span>
            <div className="flex items-center gap-1.5 text-green-500">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="font-medium">کاملاً آفلاین</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── ۹. پشتیبان‌گیری */}
      <Section icon={HardDrive} title={t.settings.backupSection} description={t.settings.backupDesc}>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.settings.lastBackup}</span>
            <span className="font-medium">{lastBackup ? formatDate(lastBackup) : t.settings.never}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.settings.backupCount}</span>
            <span className="font-medium">{backupHistory.filter(h => h.type === 'export').length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.settings.lastRestore}</span>
            <span className="font-medium">
              {backupHistory.find(h => h.type === 'import')
                ? formatDate(backupHistory.find(h => h.type === 'import')!.createdAt)
                : t.settings.never}
            </span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate('/backup')}>
            <Download className="w-4 h-4 me-1" /> ایجاد پشتیبان
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate('/backup')}>
            <Upload className="w-4 h-4 me-1" /> بازیابی
          </Button>
        </div>
      </Section>

      {/* ── ۱۰. درباره برنامه */}
      <Section icon={Info} title={t.settings.about}>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">نام برنامه</span>
            <span className="font-semibold">TraderMind</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.settings.appVersion}</span>
            <Badge variant="secondary">{APP_VERSION}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.settings.dbVersion}</span>
            <Badge variant="secondary">v{DB_VERSION}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">{t.settings.connectionMode}</span>
            <div className="flex items-center gap-1.5 text-green-500">
              <WifiOff className="w-4 h-4" />
              <span className="font-medium">{t.settings.offlineMode}</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">{t.settings.storageType}</span>
            <div className="flex items-center gap-1.5 text-primary">
              <ShieldCheck className="w-4 h-4" />
              <span className="font-medium">{t.settings.localStorage}</span>
            </div>
          </div>
           <div className="pt-2 border-t">
             <a
               href={`${import.meta.env.BASE_URL}tradermind-user-guide-fa.pdf`}
               download="tradermind-user-guide-fa.pdf"
               className="inline-flex w-full items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
             >
               <Download className="w-4 h-4 me-2" />
               دانلود راهنمای کامل TraderMind
             </a>
           </div>
        </div>
      </Section>

      {/* ── ۱۱. مدیریت داده‌ها */}
      <Section icon={Database} title={t.settings.dataManagement} description={t.settings.dataManagementDesc} danger>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">حجم داده‌ها (ذخیره محلی روی سیستم — IndexedDB)</span>
          <span className="font-medium">{formatSize(storageSize)}</span>
        </div>
        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
          <div>
            <p className="text-sm font-medium">پاک کردن حافظه موقت</p>
            <p className="text-xs text-muted-foreground mt-0.5">تاریخچه پشتیبان‌ها و cache‌های موقت پاک می‌شوند</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleClearCache}>
            <RefreshCw className="w-4 h-4 me-1" /> پاک‌سازی
          </Button>
        </div>

        {deleteStep === 0 && (
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
            <div>
              <p className="font-medium text-destructive text-sm">{t.settings.deleteAll}</p>
              <p className="text-xs text-destructive/70 mt-0.5">{t.settings.deleteAllDesc}</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setDeleteStep(1)}>
              <Trash2 className="w-4 h-4 me-1" /> حذف
            </Button>
          </div>
        )}
        {deleteStep === 1 && (
          <div className="p-4 border-2 border-destructive rounded-lg bg-destructive/5 space-y-3">
            <p className="font-semibold text-destructive text-sm">⚠️ هشدار جدی</p>
            <p className="text-sm text-destructive/80">{t.settings.deleteWarning}</p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => setDeleteStep(2)}>با این وجود ادامه می‌دهم</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteStep(0)}>لغو</Button>
            </div>
          </div>
        )}
        {deleteStep === 2 && (
          <div className="p-4 border-2 border-destructive rounded-lg bg-destructive/5 space-y-3">
            <p className="font-semibold text-destructive text-sm">تأیید نهایی</p>
            <p className="text-sm text-destructive/80">
              برای تأیید، عبارت <span className="font-bold font-mono">{t.settings.deleteConfirmText}</span> را تایپ کنید:
            </p>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={t.settings.deleteConfirmPlaceholder}
              className="border-destructive/50 font-mono"
              dir="rtl"
            />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm"
                disabled={deleteInput !== t.settings.deleteConfirmText}
                onClick={handleDelete}>
                <Trash2 className="w-4 h-4 me-1" /> حذف تمام داده‌ها
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setDeleteStep(0); setDeleteInput(''); }}>لغو</Button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
