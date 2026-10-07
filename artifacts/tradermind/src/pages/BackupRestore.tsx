import { useState, useRef, useEffect } from "react";
import { backupService, BackupMetadata, ValidationResult, MergeStats } from "../services/backupService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Download, Upload, AlertTriangle, CheckCircle2, Clock,
  FileArchive, RefreshCcw, Trash2, ChevronDown, ChevronUp,
  ShieldCheck, Layers, XCircle, KeyRound, Eye, EyeOff, Lock, AlertCircle
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { toast } from "sonner";
import { appStorage } from "../services/storageService";
import { HardDrive } from "lucide-react";

// ─────────────────────────────────────────────
// ثوابت و انواع
// ─────────────────────────────────────────────
type ImportStep = 'idle' | 'validating' | 'reviewed' | 'need-password' | 'mode-select' | 'confirm-replace' | 'importing' | 'success' | 'error';

interface HistoryItem {
  id: string;
  createdAt: string;
  size: number;
  type: 'export' | 'import';
  mode?: 'replace' | 'merge';
  status: 'success' | 'failed';
  recordCount: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' — ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// ─────────────────────────────────────────────
// صفحه اصلی
// ─────────────────────────────────────────────
export default function BackupRestore() {
  // ── Export state
  const [exporting, setExporting] = useState(false);

  // ── Import state
  const [importStep, setImportStep] = useState<ImportStep>('idle');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [mergeStats, setMergeStats] = useState<MergeStats | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── رمزگشایی Backup رمزگذاری‌شده
  const [decryptPw, setDecryptPw] = useState('');
  const [showDecryptPw, setShowDecryptPw] = useState(false);
  const [decryptBusy, setDecryptBusy] = useState(false);
  const [decryptError, setDecryptError] = useState('');

  // ── History
  const [history, setHistory] = useState<HistoryItem[]>(() => backupService.getHistory());
  const [showHistory, setShowHistory] = useState(false);

  // ── Storage monitoring
  const [storageUsed, setStorageUsed] = useState<number | null>(null);
  const [storageQuota, setStorageQuota] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const est = await navigator.storage.estimate();
          setStorageUsed(est.usage ?? null);
          setStorageQuota(est.quota ?? null);
        } else {
          const used = await appStorage.estimateSize();
          setStorageUsed(used);
        }
      } catch {
        // storage API not available — skip
      }
    })();
  }, []);

  // ── Reset All Data
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const handleResetAll = async () => {
    if (resetConfirmText !== 'پاک شود') return;
    setResetting(true);
    try {
      await backupService.resetAll();
      toast.success('تمام داده‌ها با موفقیت حذف شدند');
      setShowResetDialog(false);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error('خطا در حذف داده‌ها');
    } finally {
      setResetting(false);
      setResetConfirmText('');
    }
  };

  // ── Excel Export state
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExcelExport = async () => {
    setExportingExcel(true);
    try {
      await backupService.exportToExcel();
      toast.success('فایل Excel با موفقیت دانلود شد');
    } catch {
      toast.error('خطا در ساخت فایل Excel. لطفاً دوباره تلاش کنید.');
    } finally {
      setExportingExcel(false);
    }
  };

  // ──────────────── Export ────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      await backupService.exportAll();
      setHistory(backupService.getHistory());
      toast.success('نسخه پشتیبان با موفقیت ایجاد و دانلود شد');
    } catch (e) {
      toast.error('خطا در ایجاد نسخه پشتیبان. لطفاً دوباره تلاش کنید.');
    } finally {
      setExporting(false);
    }
  };

  // ──────────────── Import: انتخاب فایل ────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setSelectedFile(file);
    setImportStep('validating');
    setValidation(null);
    setImportError('');

    try {
      const result = await backupService.validateFile(file);
      setValidation(result);
      // اگر فایل رمزگذاری‌شده باشد، مرحله ورود رمز
      if (result.valid && result.needsPassword) {
        setImportStep('need-password');
      } else {
        setImportStep('reviewed');
      }
    } catch {
      setImportStep('error');
      setImportError('خطا در خواندن فایل. فایل ممکن است آسیب دیده باشد.');
    }
  };

  // ──────────────── رمزگشایی Backup رمزگذاری‌شده ────────────────
  const handleDecrypt = async () => {
    if (!selectedFile || !decryptPw) return;
    setDecryptBusy(true);
    setDecryptError('');
    try {
      const result = await backupService.decryptBackup(selectedFile, decryptPw);
      if (!result.valid) {
        setDecryptError(result.errors[0] ?? 'رمز عبور اشتباه است');
        setDecryptBusy(false);
        return;
      }
      setValidation(result);
      setImportStep('reviewed');
    } catch {
      setDecryptError('خطا در رمزگشایی. رمز عبور ممکن است اشتباه باشد.');
    } finally {
      setDecryptBusy(false);
    }
  };

  const resetImport = () => {
    setImportStep('idle');
    setValidation(null);
    setSelectedFile(null);
    setMergeStats(null);
    setImportError('');
    setDecryptPw('');
    setDecryptError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ──────────────── Import: تأیید نهایی ────────────────
  const handleConfirmImport = async () => {
    if (!validation?.parsedData) return;
    setImportStep('importing');
    try {
      if (restoreMode === 'replace') {
        await backupService.importReplace(validation.parsedData);
        setHistory(backupService.getHistory());
        backupService.addToHistory({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          size: selectedFile?.size ?? 0,
          type: 'import',
          mode: 'replace',
          status: 'success',
          recordCount: validation.metadata?.totalRecords ?? 0,
        });
        setHistory(backupService.getHistory());
        setImportStep('success');
        toast.success('اطلاعات با موفقیت بازیابی شد');
      } else {
        const stats = await backupService.importMerge(validation.parsedData);
        setMergeStats(stats);
        backupService.addToHistory({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          size: selectedFile?.size ?? 0,
          type: 'import',
          mode: 'merge',
          status: 'success',
          recordCount: stats.added + stats.updated,
        });
        setHistory(backupService.getHistory());
        setImportStep('success');
        toast.success('ادغام اطلاعات با موفقیت انجام شد');
      }
    } catch (e: any) {
      setImportStep('error');
      setImportError('خطا در بازیابی اطلاعات. لطفاً دوباره تلاش کنید.');
      backupService.addToHistory({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        size: selectedFile?.size ?? 0,
        type: 'import',
        status: 'failed',
        recordCount: 0,
      });
      setHistory(backupService.getHistory());
    }
  };

  // ─────────────────────────────────────────────
  // رابط کاربری
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto" dir="rtl">
      {/* عنوان صفحه */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">پشتیبان‌گیری و بازیابی</h1>
        <p className="text-muted-foreground mt-1">
          اطلاعات شما کاملاً در مرورگر ذخیره می‌شود. می‌توانید از آن‌ها نسخه پشتیبان تهیه کنید یا به دستگاه دیگری منتقل کنید.
        </p>
      </div>

      {/* ──── مانیتورینگ فضای ذخیره‌سازی ──── */}
      {storageUsed !== null && (
        <Card className={storageQuota && storageUsed / storageQuota > 0.8 ? 'border-orange-500/40' : ''}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <HardDrive className={`w-5 h-5 shrink-0 ${storageQuota && storageUsed / storageQuota > 0.8 ? 'text-orange-400' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">فضای ذخیره‌سازی IndexedDB</span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(storageUsed)}
                    {storageQuota ? ` از ${formatSize(storageQuota)}` : ''}
                  </span>
                </div>
                {storageQuota && (
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        storageUsed / storageQuota > 0.9 ? 'bg-red-500' :
                        storageUsed / storageQuota > 0.8 ? 'bg-orange-400' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, (storageUsed / storageQuota) * 100).toFixed(1)}%` }}
                    />
                  </div>
                )}
                {storageQuota && storageUsed / storageQuota > 0.8 && (
                  <p className="text-xs text-orange-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    فضای ذخیره‌سازی در حال پر شدن است — پیش از رسیدن به محدودیت، پشتیبان تهیه کنید.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ──── ایجاد نسخه پشتیبان ──── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            ایجاد نسخه پشتیبان
          </CardTitle>
          <CardDescription>
            تمام اطلاعات برنامه (استراتژی‌ها، معاملات، ژورنال و تنظیمات) را در یک فایل ZIP ذخیره کنید.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
            <div>
              <p className="font-medium">دانلود فایل پشتیبان</p>
              <p className="text-sm text-muted-foreground">
                {localStorage.getItem('tradermind-last-backup')
                  ? `آخرین پشتیبان: ${formatDate(localStorage.getItem('tradermind-last-backup')!)}`
                  : 'هنوز پشتیبانی تهیه نشده است'}
              </p>
            </div>
            <Button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 shrink-0">
              {exporting
                ? <><RefreshCcw className="w-4 h-4 animate-spin" /> در حال ایجاد...</>
                : <><Download className="w-4 h-4" /> ایجاد نسخه پشتیبان</>
              }
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            فایل پشتیبان فقط در دستگاه شما ذخیره می‌شود. هیچ اطلاعاتی به سرور ارسال نمی‌شود.
          </p>
           <p className="text-xs text-muted-foreground mt-2 rounded-md border border-primary/20 bg-primary/5 p-3">
             در اندروید، فایل ابتدا به‌صورت قطعی در مسیر Documents/TraderMind/Backups ذخیره می‌شود و بعد پنجره «ذخیره یا ارسال» باز می‌شود.
             اگر پنجره را ببندید، فایل همچنان در همان مسیر قابل مشاهده است؛ از برنامه Files وارد Documents و سپس TraderMind و Backups شوید.
           </p>
        </CardContent>
      </Card>

       {/* ──── خروجی سازگار با Excel ──── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-500" />
             خروجی Spreadsheet / Excel
          </CardTitle>
          <CardDescription>
             تمام داده‌ها را در یک فایل Excel چندبرگه دریافت کنید؛ شامل معاملات، حساب‌ها، باکس‌ها، تحلیل‌ها، ژورنال‌ها و تصاویر.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
            <div>
               <p className="font-medium">دانلود Spreadsheet کامل</p>
               <p className="text-sm text-muted-foreground">۶ شیت داده‌ای با پشتیبانی از تصویر و Excel</p>
            </div>
            <Button
              onClick={handleExcelExport}
              disabled={exportingExcel}
              variant="outline"
              className="flex items-center gap-2 shrink-0 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
            >
              {exportingExcel
                ? <><RefreshCcw className="w-4 h-4 animate-spin" /> در حال ساخت...</>
                 : <><Download className="w-4 h-4" /> دانلود Excel</>
              }
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ──── بازیابی اطلاعات ──── */}
      <Card className={importStep !== 'idle' && importStep !== 'validating' ? 'border-primary/30' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            بازیابی اطلاعات
          </CardTitle>
          <CardDescription>
             اطلاعات را از یک فایل پشتیبان قبلی بازیابی کنید. فرمت‌های پشتیبانی‌شده: GZ، ZIP و JSON
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* مرحله: انتخاب فایل */}
          {importStep === 'idle' && (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/10 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileArchive className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">انتخاب فایل پشتیبان</p>
              <p className="text-sm text-muted-foreground">روی اینجا کلیک کنید یا فایل را بکشید</p>
               <p className="text-xs text-muted-foreground mt-2">پسوند مجاز: .gz، .zip یا .json</p>
              <input
                ref={fileInputRef}
                type="file"
                 accept=".gz,.tradermind-backup.gz,.zip,.json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* مرحله: در حال بررسی */}
          {importStep === 'validating' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <RefreshCcw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">در حال بررسی فایل پشتیبان...</p>
            </div>
          )}

          {/* مرحله: ورود رمز برای Backup رمزگذاری‌شده */}
          {importStep === 'need-password' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Lock className="w-7 h-7 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-lg">Backup رمزگذاری‌شده</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    این فایل با رمز عبور محافظت شده است.<br />
                    رمز عبوری که هنگام ایجاد Backup تعیین کردید را وارد کنید.
                  </p>
                </div>
              </div>
              <div className="relative">
                <Input
                  type={showDecryptPw ? 'text' : 'password'}
                  value={decryptPw}
                  onChange={e => { setDecryptPw(e.target.value); setDecryptError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleDecrypt()}
                  placeholder="رمز عبور Backup"
                  className="pl-10 text-center tracking-widest"
                  dir="ltr"
                  autoFocus
                />
                <button
                  onClick={() => setShowDecryptPw(s => !s)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showDecryptPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {decryptError && (
                <p className="text-sm text-destructive text-center animate-in fade-in">{decryptError}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={handleDecrypt} disabled={!decryptPw || decryptBusy} className="flex-1">
                  {decryptBusy
                    ? <><RefreshCcw className="w-4 h-4 animate-spin ml-2" />در حال رمزگشایی...</>
                    : <><KeyRound className="w-4 h-4 ml-2" />رمزگشایی و ادامه</>
                  }
                </Button>
                <Button variant="outline" onClick={resetImport}>لغو</Button>
              </div>
            </div>
          )}

          {/* مرحله: نتیجه اعتبارسنجی */}
          {importStep === 'reviewed' && validation && (
            <div className="space-y-4">
              {/* اطلاعات فایل */}
              <div className={`rounded-lg border p-4 ${validation.valid ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                <div className="flex items-center gap-2 mb-3">
                  {validation.valid
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <XCircle className="w-5 h-5 text-destructive" />
                  }
                  <span className={`font-semibold ${validation.valid ? 'text-green-500' : 'text-destructive'}`}>
                    {validation.valid ? 'فایل پشتیبان معتبر است' : 'فایل پشتیبان معتبر نیست'}
                  </span>
                </div>

                {validation.valid && validation.metadata && (
                  <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                    <InfoRow label="تاریخ ایجاد" value={formatDate(validation.metadata.createdAt)} />
                    <InfoRow label="نسخه پشتیبان" value={validation.metadata.backupVersion} />
                    <InfoRow label="کل رکوردها" value={validation.metadata.totalRecords.toLocaleString('fa-IR')} />
                    <InfoRow label="نسخه پایگاه داده" value={String(validation.metadata.databaseVersion)} />
                    {selectedFile && <InfoRow label="حجم فایل" value={formatSize(selectedFile.size)} />}
                  </div>
                )}

                {validation.errors.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {validation.errors.map((e, i) => (
                      <li key={i} className="text-sm text-destructive flex items-start gap-2">
                        <XCircle className="w-3 h-3 mt-0.5 shrink-0" /> {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* هشدارها */}
              {validation.warnings.length > 0 && (
                <Alert className="border-yellow-500/30 bg-yellow-500/5">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <AlertDescription className="space-y-1">
                    {validation.warnings.map((w, i) => <div key={i} className="text-sm">{w}</div>)}
                  </AlertDescription>
                </Alert>
              )}

              {/* دکمه‌ها */}
              <div className="flex gap-2">
                {validation.valid && (
                  <Button onClick={() => setImportStep('mode-select')} className="flex-1">
                    <Layers className="w-4 h-4 ml-2" /> ادامه و انتخاب روش بازیابی
                  </Button>
                )}
                <Button variant="outline" onClick={resetImport}>لغو</Button>
              </div>
            </div>
          )}

          {/* مرحله: انتخاب روش بازیابی */}
          {importStep === 'mode-select' && (
            <div className="space-y-4">
              <p className="font-medium">روش بازیابی را انتخاب کنید:</p>

              {/* جایگزینی کامل */}
              <button
                onClick={() => setRestoreMode('replace')}
                className={`w-full text-right p-4 rounded-lg border-2 transition-all ${restoreMode === 'replace' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${restoreMode === 'replace' ? 'border-primary' : 'border-muted-foreground'}`}>
                    {restoreMode === 'replace' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="font-semibold">جایگزینی کامل اطلاعات</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      تمام اطلاعات فعلی حذف می‌شوند و اطلاعات نسخه پشتیبان جایگزین می‌شوند.
                    </p>
                  </div>
                </div>
              </button>

              {/* ادغام */}
              <button
                onClick={() => setRestoreMode('merge')}
                className={`w-full text-right p-4 rounded-lg border-2 transition-all ${restoreMode === 'merge' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${restoreMode === 'merge' ? 'border-primary' : 'border-muted-foreground'}`}>
                    {restoreMode === 'merge' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="font-semibold">ادغام اطلاعات</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      اطلاعات پشتیبان با اطلاعات فعلی ترکیب می‌شوند. در صورت تکراری بودن، جدیدترین نسخه حفظ می‌شود.
                    </p>
                  </div>
                </div>
              </button>

              {/* هشدار جایگزینی */}
              {restoreMode === 'replace' && (
                <Alert className="border-destructive/30 bg-destructive/5">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <AlertDescription className="text-destructive text-sm">
                    تمام اطلاعات فعلی برنامه با اطلاعات نسخه پشتیبان جایگزین خواهد شد. این عملیات ممکن است قابل بازگشت نباشد.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleConfirmImport}
                  variant={restoreMode === 'replace' ? 'destructive' : 'default'}
                  className="flex-1"
                >
                  {restoreMode === 'replace' ? 'تأیید جایگزینی' : 'تأیید ادغام'}
                </Button>
                <Button variant="outline" onClick={resetImport}>لغو</Button>
              </div>
            </div>
          )}

          {/* مرحله: در حال بازیابی */}
          {importStep === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <RefreshCcw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">در حال بازیابی اطلاعات، لطفاً صبر کنید...</p>
            </div>
          )}

          {/* مرحله: موفقیت */}
          {importStep === 'success' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-5 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-green-500 text-lg mb-1">بازیابی با موفقیت انجام شد</p>
                {restoreMode === 'replace' && (
                  <p className="text-sm text-muted-foreground">
                    تمام اطلاعات با موفقیت جایگزین شدند.
                  </p>
                )}
                {restoreMode === 'merge' && mergeStats && (
                  <div className="flex justify-center gap-6 mt-3 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-500">{mergeStats.added}</p>
                      <p className="text-muted-foreground">رکورد جدید</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-500">{mergeStats.updated}</p>
                      <p className="text-muted-foreground">به‌روزرسانی</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-muted-foreground">{mergeStats.skipped}</p>
                      <p className="text-muted-foreground">بدون تغییر</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {restoreMode === 'replace' && (
                  <Button onClick={() => window.location.reload()} className="flex-1">
                    بارگذاری مجدد برنامه
                  </Button>
                )}
                <Button variant="outline" onClick={resetImport} className={restoreMode === 'merge' ? 'flex-1' : ''}>
                  بازگشت
                </Button>
              </div>
            </div>
          )}

          {/* مرحله: خطا */}
          {importStep === 'error' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-center">
                <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
                <p className="font-semibold text-destructive mb-1">خطا در بازیابی</p>
                <p className="text-sm text-muted-foreground">{importError}</p>
              </div>
              <Button variant="outline" onClick={resetImport} className="w-full">تلاش مجدد</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ──── تاریخچه ──── */}
      {history.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setShowHistory(v => !v)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="w-4 h-4 text-primary" />
                تاریخچه نسخه‌های پشتیبان
                <Badge variant="secondary" className="text-xs">{history.length}</Badge>
              </CardTitle>
              {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>

          {showHistory && (
            <CardContent className="pt-0">
              <div className="divide-y divide-border">
                {history.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-3 text-sm">
                    <div className="flex items-center gap-3">
                      {item.type === 'export'
                        ? <Download className="w-4 h-4 text-primary shrink-0" />
                        : <Upload className="w-4 h-4 text-orange-500 shrink-0" />
                      }
                      <div>
                        <span className="font-medium">
                          {item.type === 'export' ? 'ایجاد پشتیبان' : item.mode === 'merge' ? 'ادغام' : 'بازیابی'}
                        </span>
                        <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {item.size > 0 && <span>{formatSize(item.size)}</span>}
                      {item.recordCount > 0 && <span>{item.recordCount.toLocaleString('fa-IR')} رکورد</span>}
                      <Badge
                        variant={item.status === 'success' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {item.status === 'success' ? 'موفق' : 'ناموفق'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 text-muted-foreground hover:text-destructive"
                onClick={() => { backupService.clearHistory(); setHistory([]); }}
              >
                <Trash2 className="w-3 h-3 ml-1" /> پاک کردن تاریخچه
              </Button>
            </CardContent>
          )}
        </Card>
      )}
      {/* ──── بخش خطرناک: پاک‌کردن همه داده‌ها ──── */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            پاک‌کردن همه داده‌ها
          </CardTitle>
          <CardDescription>
            این عملیات تمام معاملات، تحلیل‌ها، ژورنال و اسکرین‌شات‌ها را حذف می‌کند.
            <strong className="text-destructive"> غیر قابل بازگشت است.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => { setShowResetDialog(true); setResetConfirmText(''); }}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            پاک‌کردن همه داده‌ها
          </Button>
        </CardContent>
      </Card>

      {/* دیالوگ تأیید Reset */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              پاک‌کردن همه داده‌ها؟
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>این عملیات <strong>تمام</strong> معاملات، تحلیل‌ها، ژورنال روزانه، پایگاه دانش، استراتژی‌ها و اسکرین‌شات‌ها را حذف می‌کند.</p>
              <p className="text-destructive font-medium">این عملیات قابل بازگشت نیست. ابتدا از داده‌های خود پشتیبان بگیرید.</p>
              <div className="mt-4">
                <label className="text-sm font-medium">برای تأیید، «پاک شود» را تایپ کنید:</label>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={e => setResetConfirmText(e.target.value)}
                  placeholder="پاک شود"
                  className="mt-2 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  dir="rtl"
                />
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>لغو</Button>
            <Button
              variant="destructive"
              disabled={resetConfirmText !== 'پاک شود' || resetting}
              onClick={handleResetAll}
            >
              {resetting ? 'در حال حذف...' : 'تأیید — پاک کردن همه'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────
// کامپوننت کمکی
// ─────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
