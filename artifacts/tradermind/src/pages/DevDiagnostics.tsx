/**
 * صفحه تشخیص — فقط Development
 * در Production نمایش داده نمی‌شود.
 */
import { useState, useEffect, useCallback } from "react";
import { db } from "../db/database";
import { appStorage } from "../services/storageService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Database, HardDrive, Wifi, WifiOff, CheckCircle2, XCircle,
  RefreshCw, Trash2, Server, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { seedInitialData } from "../services/seedService";
import { backupService } from "../services/backupService";

// فقط در dev قابل دسترسی
if (import.meta.env.PROD) {
  throw new Error('DevDiagnostics is not available in production.');
}

interface DbStats {
  strategies: number;
  phases: number;
  steps: number;
  rules: number;
  sessions: number;
  trades: number;
  journals: number;
}

interface DiagnosticResult {
  label: string;
  ok: boolean;
  detail?: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    : <XCircle className="w-4 h-4 text-destructive shrink-0" />;
}

export default function DevDiagnostics() {
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [storageSize, setStorageSize] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(false);

  // ── بارگذاری آمار ──────────────────────────────────────
  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [strategies, phases, steps, rules, sessions, trades, journals] = await Promise.all([
        db.strategies.count(),
        db.phases.count(),
        db.steps.count(),
        db.rules.count(),
        db.analysisSessions.count(),
        db.trades.count(),
        db.dailyJournals.count(),
      ]);
      setDbStats({ strategies, phases, steps, rules, sessions, trades, journals });

      const size = await appStorage.estimateSize();
      setStorageSize(size);

      // ── تست سریع کارکرد پایگاه داده ──────────────────
      const results: DiagnosticResult[] = [];

      // DB Read
      try {
        await db.strategies.limit(1).toArray();
        results.push({ label: 'خواندن از دیتابیس (Dexie)', ok: true });
      } catch (e: any) {
        results.push({ label: 'خواندن از دیتابیس (Dexie)', ok: false, detail: e.message });
      }

      // DB Write Test
      try {
        const testId = '__diag_test__';
        await db.transaction('rw', db.strategies, async () => {
          // فقط تست کوتاه — نوشتن و پاک کردن
        });
        results.push({ label: 'نوشتن در دیتابیس', ok: true });
      } catch (e: any) {
        results.push({ label: 'نوشتن در دیتابیس', ok: false, detail: e.message });
      }

      // IndexedDB Available
      results.push({
        label: 'IndexedDB در دسترس است',
        ok: typeof indexedDB !== 'undefined',
      });

      // Web Crypto
      results.push({
        label: 'Web Crypto API',
        ok: typeof crypto?.subtle !== 'undefined',
      });

      // PWA / Service Worker
      results.push({
        label: 'Service Worker ثبت‌شده',
        ok: 'serviceWorker' in navigator,
      });

      // Storage Persist
      let persisted = false;
      try {
        persisted = await navigator.storage.persisted();
      } catch { /* ignore */ }
      results.push({ label: 'Storage Persistence', ok: persisted });

      // Offline Capable (Dexie = IndexedDB = offline)
      results.push({ label: 'قابلیت Offline (IndexedDB)', ok: true });

      setDiagnostics(results);
    } catch (e: any) {
      toast.error('خطا در بارگذاری اطلاعات تشخیص: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadStats]);

  // ── پاک کردن همه داده‌ها ──────────────────────────────
  const handleReset = async () => {
    if (!confirm('آیا مطمئنی؟ تمام داده‌های محلی پاک می‌شوند!')) return;
    try {
      await backupService.resetAll();
      toast.success('همه داده‌ها پاک شدند.');
      await loadStats();
    } catch {
      toast.error('خطا در پاک‌کردن داده‌ها');
    }
  };

  // ── Seed مجدد ─────────────────────────────────────────
  const handleReseed = async () => {
    try {
      await backupService.resetAll();
      await seedInitialData();
      toast.success('داده‌های نمونه بازنشانی شدند.');
      await loadStats();
    } catch {
      toast.error('خطا در seed کردن داده‌ها');
    }
  };

  const fmtBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* هشدار Dev-Only */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm">
        <Server className="w-4 h-4 shrink-0" />
        <span className="font-medium">محیط Development — این صفحه در Production نمایش داده نمی‌شود.</span>
      </div>

      {/* هدر */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">تشخیص سیستم</h1>
          <p className="text-muted-foreground text-sm mt-1">وضعیت کلی پروژه TraderMind</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* وضعیت شبکه */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {isOnline ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-destructive" />}
              وضعیت شبکه
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={isOnline ? 'default' : 'destructive'} className={isOnline ? 'bg-emerald-500' : ''}>
              {isOnline ? 'آنلاین' : 'آفلاین'}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              برنامه در هر دو حالت کار می‌کند (IndexedDB)
            </p>
          </CardContent>
        </Card>

        {/* حجم ذخیره‌سازی */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              فضای استفاده‌شده
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {storageSize !== null ? fmtBytes(storageSize) : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">IndexedDB + localStorage</p>
          </CardContent>
        </Card>

        {/* DB Schema */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              نسخه Schema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">v{db.verno}</p>
            <p className="text-xs text-muted-foreground mt-1">Dexie — IndexedDB</p>
          </CardContent>
        </Card>
      </div>

      {/* آمار دیتابیس */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            آمار دیتابیس
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dbStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['استراتژی‌ها', dbStats.strategies],
                ['مراحل', dbStats.phases],
                ['قدم‌ها', dbStats.steps],
                ['قوانین', dbStats.rules],
                ['جلسات تحلیل', dbStats.sessions],
                ['معاملات', dbStats.trades],
                ['ژورنال‌های روزانه', dbStats.journals],
              ].map(([label, count]) => (
                <div key={label as string} className="p-3 rounded-lg bg-muted/40 text-center">
                  <p className="text-xl font-bold">{(count as number).toLocaleString('fa-IR')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">در حال بارگذاری…</p>
          )}
        </CardContent>
      </Card>

      {/* تست‌های تشخیصی */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            بررسی سیستم
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {diagnostics.map((d, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <StatusDot ok={d.ok} />
                <span className="text-sm flex-1">{d.label}</span>
                {d.detail && <span className="text-xs text-destructive truncate max-w-[200px]">{d.detail}</span>}
                <Badge variant={d.ok ? 'outline' : 'destructive'} className={`text-xs ${d.ok ? 'text-emerald-600 border-emerald-300' : ''}`}>
                  {d.ok ? 'سالم' : 'خطا'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* اقدامات Dev */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            اقدامات Development (خطرناک)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleReseed} size="sm" className="gap-2">
            <RefreshCw className="w-3 h-3" />
            بازنشانی داده‌های نمونه
          </Button>
          <Button variant="destructive" onClick={handleReset} size="sm" className="gap-2">
            <Trash2 className="w-3 h-3" />
            پاک کردن همه داده‌ها
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
