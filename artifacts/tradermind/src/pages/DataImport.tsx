/**
 * DataImport.tsx — Prompt 23 §18 / §10 / §11
 * ویزارد چند مرحله‌ای برای وارد کردن معاملات از CSV یا JSON.
 * 100% آفلاین — بدون هیچ اتصال به بروکر یا API خارجی.
 */

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  parseCSVHeaders, autoMapColumns, previewCSV, importCSV,
  validateJSONTrades, importJSON,
  IMPORT_FIELDS, ImportFieldKey, ColumnMapping, ImportPreview, ImportResult,
} from "../services/importService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Progress } from "../components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "../components/ui/select";
import {
  FileText, Upload, Table, CheckCircle2, AlertTriangle,
  XCircle, ArrowLeft, ArrowRight, Download, Layers, Image as ImageIcon,
  Lightbulb, Tag, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { exportTradesAsCSV, parseMT4HTMLReport } from "../services/importService";
import { db, Trade } from "../db/database";
import { TradeScreenshot, LifecyclePosition } from "../types/screenshot";
import { tradeService } from "../services/tradeService";
import StoredImage from "../components/StoredImage";

// ─── Wizard steps ──────────────────────────────────────────────────────────────

type Step = 'type' | 'upload' | 'map' | 'preview' | 'duplicates' | 'confirm' | 'done';
type DataType = 'csv' | 'json' | 'screenshots' | 'html';

// ── Screenshot import types ──
interface PendingScreenshot {
  file: File;
  dataUrl: string;
  label: string;
  customTimeframe?: string;
  customPosition?: string;
}

// ─── Helper: Step indicator ───────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: 'type',       label: 'نوع داده' },
  { id: 'upload',     label: 'انتخاب فایل' },
  { id: 'map',        label: 'نگاشت ستون‌ها' },
  { id: 'preview',    label: 'پیش‌نمایش' },
  { id: 'duplicates', label: 'تکراری‌ها' },
  { id: 'confirm',    label: 'تأیید' },
  { id: 'done',       label: 'نتیجه' },
];

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <div className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
            i < idx ? 'bg-emerald-500/20 text-emerald-500' :
            i === idx ? 'bg-primary/20 text-primary' :
            'bg-muted/30 text-muted-foreground'
          }`}>
            {s.label}
          </div>
          {i < STEPS.length - 1 && <div className="w-3 h-px bg-muted-foreground/30" />}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function DataImport() {
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>('type');
  const [dataType, setDataType] = useState<DataType>('csv');
  const [fileText, setFileText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [jsonValidation, setJsonValidation] = useState<{ valid: boolean; count: number; errors: string[]; preview: object[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Screenshot import state ──
  const [pendingScreenshots, setPendingScreenshots] = useState<PendingScreenshot[]>([]);
  const [ssTradeId, setSsTradeId] = useState('');
  const [ssTimeframe, setSsTimeframe] = useState('');
  const [ssPosition, setSsPosition] = useState('');
  const [ssTags, setSsTags] = useState('');
  const [ssTagInput, setSsTagInput] = useState('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [suggestedTrades, setSuggestedTrades] = useState<Trade[]>([]);
  const [ssImporting, setSsImporting] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  // بارگذاری معاملات برای انتخاب در ایمپورت اسکرین‌شات
  useEffect(() => {
    db.trades.orderBy('openedAt').reverse().limit(100).toArray().then(all => {
      setTrades(all);
      // پیشنهاد: معاملاتی که اسکرین‌شات کمتری دارند
      const noSS = all.filter(t => {
        try { const s = JSON.parse(t.screenshots || '[]'); return !Array.isArray(s) || s.length === 0; }
        catch { return true; }
      }).slice(0, 5);
      setSuggestedTrades(noSS);
    });
  }, []);

  // ── Upload ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileText(text);
    setFileName(file.name);
    if (fileRef.current) fileRef.current.value = '';

    if (dataType === 'csv') {
      const { headers: h, sampleRows: rows } = parseCSVHeaders(text);
      setHeaders(h);
      setSampleRows(rows);
      setMapping(autoMapColumns(h));
      setStep('map');
    } else if (dataType === 'html') {
      // گزارش HTML متاتریدر را مستقیم پارس کن بدون نگاشت
      const v = parseMT4HTMLReport(text);
      if (!v.valid) {
        toast.error('فایل HTML شناسایی نشد. مطمئن شوید گزارش تاریخچه MT4/MT5 است.');
        return;
      }
      setJsonValidation({ valid: true, count: v.recordCount, errors: v.errors, preview: v.preview });
      setFileText(JSON.stringify(v.trades)); // تبدیل به JSON برای ایمپورت
      setDataType('json'); // از مسیر JSON استفاده کن
      setStep('preview');
    } else {
      const v = validateJSONTrades(text);
      setJsonValidation({ valid: v.valid, count: v.recordCount, errors: v.errors, preview: v.preview });
      setStep('preview');
    }
  };

  // ── Build CSV preview ──
  const handleBuildPreview = async () => {
    setPreviewing(true);
    try {
      const p = await previewCSV(fileText, mapping);
      setPreview(p);
      setStep('preview');
    } catch (e) {
      toast.error('خطا در پیش‌نمایش داده‌ها');
    } finally {
      setPreviewing(false);
    }
  };

  // ── Import ──
  const handleImport = async () => {
    setImporting(true);
    try {
      let res: ImportResult;
      if (dataType === 'csv' && preview) {
        res = await importCSV(preview, { skipDuplicates, skipInvalid });
      } else {
        res = await importJSON(fileText, { skipDuplicates });
      }
      setResult(res);
      setStep('done');
      if (res.imported > 0) toast.success(`${res.imported} معامله با موفقیت وارد شد`);
    } catch (e) {
      toast.error('خطا در وارد کردن داده‌ها');
    } finally {
      setImporting(false);
    }
  };

  // ── Reset ──
  const reset = () => {
    setStep('type'); setFileText(''); setFileName(''); setHeaders([]); setSampleRows([]);
    setMapping({}); setPreview(null); setJsonValidation(null); setResult(null);
    setPendingScreenshots([]); setSsTradeId(''); setSsTimeframe(''); setSsPosition(''); setSsTags(''); setSsTagInput('');
  };

  // ── Screenshot file upload ──
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (imageRef.current) imageRef.current.value = '';

    const converted: PendingScreenshot[] = [];
    for (const file of files) {
      const dataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target?.result as string);
        reader.readAsDataURL(file);
      });
      converted.push({ file, dataUrl, label: file.name.replace(/\.[^.]+$/, '') });
    }
    setPendingScreenshots(prev => [...prev, ...converted]);
    setStep('map'); // برو به مرحله تخصیص متادیتا
  };

  // ── Screenshot import ──
  const handleScreenshotImport = async () => {
    if (!ssTradeId || pendingScreenshots.length === 0) return;
    setSsImporting(true);
    try {
      const trade = await tradeService.getTradeById(ssTradeId);
      if (!trade) { toast.error('معامله یافت نشد'); return; }

      const existing: TradeScreenshot[] = JSON.parse(trade.screenshots || '[]');
      const posMap: Record<string, LifecyclePosition> = {
        before: 'before-entry', during: 'during-trade', after: 'after-trade',
      };
      const newSS: TradeScreenshot[] = pendingScreenshots.map(p => {
        const rawPos = p.customPosition || ssPosition || '';
        return {
          id: crypto.randomUUID(),
          dataUrl: p.dataUrl,
          label: p.label,
          type: 'analysis' as const,
          linkedTo: null,
          timeframe: ((p.customTimeframe || ssTimeframe || null) as TradeScreenshot['timeframe']),
          lifecyclePosition: posMap[rawPos] ?? null,
          width: null,
          height: null,
          fileSize: null,
          quality: null,
          extractedFeatures: [],
          fibonacci: null,
          analysisNotes: null,
          userAddedFeatures: [],
          annotations: [],
          createdAt: Date.now(),
        };
      });
      await tradeService.updateTrade(trade.id, {
        screenshots: JSON.stringify([...existing, ...newSS]),
      });
      setResult({ imported: newSS.length, skipped: 0, errors: [] });
      setStep('done');
      toast.success(`${newSS.length} اسکرین‌شات به معامله ${trade.symbol} اضافه شد`);
    } catch {
      toast.error('خطا در ذخیره اسکرین‌شات‌ها');
    } finally {
      setSsImporting(false);
    }
  };

  // ── Export CSV ──
  const handleExportCSV = async () => {
    const csv = await exportTradesAsCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tradermind-trades.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('فایل CSV دانلود شد');
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/journal/trades')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">وارد کردن داده</h1>
          <p className="text-muted-foreground text-sm">وارد کردن معاملات از CSV یا JSON — کاملاً آفلاین</p>
        </div>
      </div>

      <StepBar current={step} />

      {/* ── STEP 1: Type ── */}
      {step === 'type' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">نوع داده را انتخاب کنید</CardTitle>
              <CardDescription>چه نوع فایلی می‌خواهید وارد کنید؟</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'csv' as DataType, icon: Table, title: 'فایل CSV', desc: 'وارد کردن از فایل گسترده‌نگار (Excel، اپلیکیشن بروکر، Google Sheets)' },
                { id: 'json' as DataType, icon: FileText, title: 'فایل JSON', desc: 'وارد کردن از فایل JSON ساختاریافته' },
                { id: 'html' as DataType, icon: FileText, title: 'گزارش HTML متاتریدر', desc: 'وارد کردن گزارش تاریخچه حساب از MT4 / MT5 (فرمت HTML)' },
                { id: 'screenshots' as DataType, icon: ImageIcon, title: 'اسکرین‌شات‌ها', desc: 'ایمپورت دسته‌جمعی تصاویر و اسکرین‌شات به یک معامله' },
              ].map(opt => (
                <button key={opt.id} onClick={() => setDataType(opt.id)}
                  className={`p-4 rounded-xl border-2 text-right transition-colors ${dataType === opt.id
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/40'
                  }`}>
                  <opt.icon className="w-6 h-6 mb-2" />
                  <div className="font-semibold">{opt.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Alert className="border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-sm text-amber-600 dark:text-amber-400">
              این سیستم هیچ اتصالی به بروکر، پلتفرم معاملاتی، یا اینترنت برقرار نمی‌کند. تمام داده‌ها به‌صورت محلی ذخیره می‌شوند.
            </AlertDescription>
          </Alert>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download className="w-4 h-4" /> خروجی CSV معاملات فعلی
            </Button>
            <Button onClick={() => setStep('upload')} className="gap-2">
              ادامه <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Upload ── */}
      {step === 'upload' && dataType !== 'screenshots' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {dataType === 'csv' ? 'فایل CSV را انتخاب کنید' : dataType === 'html' ? 'فایل HTML گزارش متاتریدر را انتخاب کنید' : 'فایل JSON را انتخاب کنید'}
              </CardTitle>
              {dataType === 'html' && (
                <CardDescription>
                  در MT4/MT5: Account History → راست‌کلیک → Save as Report (HTML)
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <input ref={fileRef} type="file"
                accept={dataType === 'csv' ? '.csv,.txt' : dataType === 'html' ? '.html,.htm' : '.json'}
                onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Upload className="w-10 h-10" />
                <div className="font-medium">کلیک کنید تا فایل انتخاب شود</div>
                <div className="text-sm">
                  {dataType === 'csv' ? '*.csv یا *.txt' : dataType === 'html' ? '*.html یا *.htm' : '*.json'}
                </div>
              </button>
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => setStep('type')}>
            <ArrowLeft className="w-4 h-4 ml-2" /> بازگشت
          </Button>
        </div>
      )}

      {/* ── STEP 2: Screenshots — انتخاب تصاویر ── */}
      {step === 'upload' && dataType === 'screenshots' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">انتخاب تصاویر</CardTitle>
              <CardDescription>یک یا چند تصویر را به یکجا انتخاب کنید</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input ref={imageRef} type="file" accept="image/*" multiple
                onChange={handleImageUpload} className="hidden" />
              <button onClick={() => imageRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <ImageIcon className="w-10 h-10" />
                <div className="font-medium">کلیک کنید تا تصویر(ها) انتخاب شوند</div>
                <div className="text-sm">PNG، JPG، WEBP — می‌توانید چندتا انتخاب کنید</div>
              </button>
              {pendingScreenshots.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {pendingScreenshots.map((s, i) => (
                    <div key={i} className="relative group">
                      <StoredImage
                        source={s.dataUrl}
                        alt={s.label}
                        enableViewer
                        showDownload
                        filename={s.label || 'imported-screenshot'}
                        className="w-full aspect-video object-cover rounded-lg border border-border"
                      />
                      <button onClick={() => setPendingScreenshots(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 left-1 w-5 h-5 rounded-full bg-destructive/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                      <div className="text-[10px] truncate text-muted-foreground mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => setStep('type')}>
            <ArrowLeft className="w-4 h-4 ml-2" /> بازگشت
          </Button>
        </div>
      )}

      {/* ── STEP 3: Screenshots — تخصیص متادیتا (Section 19 & 23) ── */}
      {step === 'map' && dataType === 'screenshots' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تخصیص به معامله و متادیتا</CardTitle>
              <CardDescription>{pendingScreenshots.length} تصویر انتخاب شده — اطلاعات مشترک را وارد کنید</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* انتخاب معامله */}
              <div className="space-y-2">
                <label className="text-sm font-medium">معامله مقصد <span className="text-destructive">*</span></label>
                <Select value={ssTradeId} onValueChange={setSsTradeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="یک معامله انتخاب کنید..." />
                  </SelectTrigger>
                  <SelectContent>
                    {trades.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.symbol} — {t.direction === 'long' ? '▲ Long' : '▼ Short'} — {t.result || 'باز'} ({new Date(t.openedAt).toLocaleDateString('fa-IR')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* پیشنهاد لینک خودکار (Section 23) */}
                {suggestedTrades.length > 0 && !ssTradeId && (
                  <div className="mt-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center gap-2 text-xs text-amber-500 font-medium mb-2">
                      <Lightbulb className="w-3.5 h-3.5" />
                      پیشنهاد: معاملاتی که هنوز اسکرین‌شات ندارند
                    </div>
                    <div className="space-y-1">
                      {suggestedTrades.map(t => (
                        <button key={t.id} onClick={() => setSsTradeId(t.id)}
                          className="w-full text-right text-xs px-2.5 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors flex items-center gap-2">
                          <span className="font-medium">{t.symbol}</span>
                          <span className="text-muted-foreground">{t.direction === 'long' ? '▲' : '▼'} — {t.result || 'باز'}</span>
                          <span className="text-muted-foreground mr-auto text-[10px]">{new Date(t.openedAt).toLocaleDateString('fa-IR')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* تایم‌فریم مشترک */}
              <div className="space-y-2">
                <label className="text-sm font-medium">تایم‌فریم (اختیاری)</label>
                <Select value={ssTimeframe} onValueChange={setSsTimeframe}>
                  <SelectTrigger>
                    <SelectValue placeholder="تایم‌فریم..." />
                  </SelectTrigger>
                  <SelectContent>
                    {['', 'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'].map(tf => (
                      <SelectItem key={tf} value={tf || '_none'}>{tf || 'انتخاب نشده'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* مرحله معامله */}
              <div className="space-y-2">
                <label className="text-sm font-medium">مرحله معامله (اختیاری)</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { v: 'before', label: 'قبل از ورود' },
                    { v: 'during', label: 'حین معامله' },
                    { v: 'after', label: 'پس از خروج' },
                  ].map(p => (
                    <button key={p.v} onClick={() => setSsPosition(ssPosition === p.v ? '' : p.v)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${ssPosition === p.v ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* تگ‌ها */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> تگ‌های مشترک (اختیاری)
                </label>
                <div className="flex gap-2">
                  <input type="text" value={ssTagInput} onChange={e => setSsTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && ssTagInput.trim()) { setSsTags(prev => prev ? `${prev},${ssTagInput.trim()}` : ssTagInput.trim()); setSsTagInput(''); }}}
                    placeholder="یک تگ بنویسید و Enter بزنید..."
                    className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                {ssTags && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {ssTags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                        #{tag}
                        <button onClick={() => setSsTags(ssTags.split(',').filter(t => t.trim() !== tag).join(','))}
                          className="text-primary/60 hover:text-primary">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* پیش‌نمایش تصاویر */}
              <div>
                <div className="text-sm font-medium mb-2">تصاویر انتخاب‌شده</div>
                <div className="grid grid-cols-3 gap-2">
                  {pendingScreenshots.map((s, i) => (
                    <div key={i} className="relative group">
                      <StoredImage
                        source={s.dataUrl}
                        alt={s.label}
                        enableViewer
                        showDownload
                        filename={s.label || 'imported-screenshot'}
                        className="w-full aspect-video object-cover rounded-lg border border-border"
                      />
                      <div className="text-[9px] truncate text-muted-foreground mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setStep('upload')} className="mt-2 text-xs text-primary hover:underline">+ افزودن تصاویر بیشتر</button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('upload')}>
              <ArrowLeft className="w-4 h-4 ml-2" /> بازگشت
            </Button>
            <Button onClick={handleScreenshotImport} disabled={!ssTradeId || pendingScreenshots.length === 0 || ssImporting} className="gap-2">
              {ssImporting
                ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> در حال ذخیره...</>
                : <><CheckCircle2 className="w-4 h-4" /> ذخیره {pendingScreenshots.length} اسکرین‌شات</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Map columns (CSV only) ── */}
      {step === 'map' && dataType === 'csv' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">نگاشت ستون‌ها</CardTitle>
              <CardDescription>
                مشخص کنید هر ستون فایل <span className="font-medium">{fileName}</span> به چه فیلدی تبدیل شود.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* سطرهای نمونه */}
              {sampleRows.length > 0 && (
                <div className="overflow-x-auto rounded-lg border bg-muted/10 mb-4">
                  <table className="text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b">
                        {headers.map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleRows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {headers.map(h => <td key={h} className="px-3 py-1.5 text-muted-foreground">{row[h]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* نگاشت — محدود به ارتفاع صفحه با اسکرول */}
              <div className="space-y-2 max-h-[45vh] overflow-y-auto border rounded-lg p-3 bg-muted/5">
                {headers.map(col => (
                  <div key={col} className="flex items-center gap-3">
                    <span className="w-32 sm:w-40 text-sm font-mono bg-muted/20 px-2 py-1 rounded truncate shrink-0">{col}</span>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <Select
                      value={mapping[col] ?? 'ignore'}
                      onValueChange={(v) => setMapping(prev => ({ ...prev, [col]: v as ImportFieldKey }))}>
                      <SelectTrigger className="flex-1 h-8 text-sm min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="max-h-[280px] overflow-y-auto">
                        {IMPORT_FIELDS.map(f => (
                          <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('upload')}>
              <ArrowLeft className="w-4 h-4 ml-2" /> بازگشت
            </Button>
            <Button onClick={handleBuildPreview} disabled={previewing} className="gap-2">
              {previewing ? 'در حال پردازش…' : <>پیش‌نمایش <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Preview ── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* CSV preview */}
          {dataType === 'csv' && preview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">پیش‌نمایش داده‌ها</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* خلاصه */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'کل ردیف‌ها', v: preview.totalRows, cls: '' },
                    { label: 'معتبر', v: preview.validRows, cls: 'text-emerald-500' },
                    { label: 'خطا', v: preview.invalidRows, cls: 'text-rose-500' },
                  ].map(s => (
                    <div key={s.label} className="p-3 rounded-lg bg-muted/20 text-center">
                      <div className={`text-2xl font-bold ${s.cls}`}>{s.v}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* ۵ ردیف اول */}
                <div className="space-y-2">
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <div key={i} className={`p-3 rounded-lg border text-sm ${
                      row.errors.length > 0 ? 'border-rose-500/30 bg-rose-500/5' :
                      row.isDuplicate ? 'border-amber-500/30 bg-amber-500/5' :
                      'border-border bg-muted/10'
                    }`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="font-medium">
                          {row.mapped.symbol || '?'} — {row.mapped.direction || '?'} @ {row.mapped.entryPrice || '?'}
                        </div>
                        {row.errors.length > 0 && <Badge variant="destructive" className="text-[9px] py-0">خطا</Badge>}
                        {row.isDuplicate && <Badge variant="outline" className="text-[9px] py-0 border-amber-500/40 text-amber-500">احتمال تکرار</Badge>}
                        {!row.errors.length && !row.isDuplicate && <Badge variant="outline" className="text-[9px] py-0 border-emerald-500/40 text-emerald-500">معتبر</Badge>}
                      </div>
                      {row.errors.map((e, j) => <div key={j} className="text-rose-500 text-xs">{e}</div>)}
                      {row.warnings.map((w, j) => <div key={j} className="text-amber-500 text-xs">{w}</div>)}
                    </div>
                  ))}
                  {preview.rows.length > 5 && (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      و {preview.rows.length - 5} ردیف دیگر…
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* JSON preview */}
          {dataType === 'json' && jsonValidation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">اعتبارسنجی JSON</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  {jsonValidation.valid
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : <XCircle className="w-5 h-5 text-rose-500" />}
                  <span className="font-medium">
                    {jsonValidation.count} معامله یافت شد
                  </span>
                </div>
                {jsonValidation.errors.slice(0, 5).map((e, i) => (
                  <Alert key={i} variant="destructive" className="py-2">
                    <AlertDescription className="text-sm">{e}</AlertDescription>
                  </Alert>
                ))}
                {jsonValidation.errors.length > 5 && (
                  <div className="text-sm text-muted-foreground">و {jsonValidation.errors.length - 5} خطای دیگر…</div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(dataType === 'csv' ? 'map' : 'upload')}>
              <ArrowLeft className="w-4 h-4 ml-2" /> بازگشت
            </Button>
            <Button onClick={() => setStep('duplicates')} className="gap-2">
              ادامه <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Duplicates ── */}
      {step === 'duplicates' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تنظیمات تکراری‌ها و خطاها</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dataType === 'csv' && preview && preview.duplicateRows > 0 && (
                <Alert className="border-amber-500/30 bg-amber-500/5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <AlertDescription>
                    <strong>{preview.duplicateRows} ردیف</strong> احتمالاً در پایگاه داده وجود دارد.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                  <input type="checkbox" checked={skipDuplicates}
                    onChange={e => setSkipDuplicates(e.target.checked)}
                    className="mt-0.5 cursor-pointer" />
                  <div>
                    <div className="font-medium">نادیده گرفتن احتمال تکرار</div>
                    <div className="text-xs text-muted-foreground">معاملاتی که قبلاً ثبت شده‌اند، وارد نشوند</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                  <input type="checkbox" checked={skipInvalid}
                    onChange={e => setSkipInvalid(e.target.checked)}
                    className="mt-0.5 cursor-pointer" />
                  <div>
                    <div className="font-medium">نادیده گرفتن ردیف‌های نامعتبر</div>
                    <div className="text-xs text-muted-foreground">ردیف‌هایی که فیلدهای اجباری ندارند وارد نشوند</div>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('preview')}>
              <ArrowLeft className="w-4 h-4 ml-2" /> بازگشت
            </Button>
            <Button onClick={() => setStep('confirm')} className="gap-2">
              ادامه <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 6: Confirm ── */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تأیید نهایی</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/20 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">نوع داده:</span>
                  <span className="font-medium">{dataType === 'csv' ? 'CSV' : 'JSON'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">فایل:</span>
                  <span className="font-medium">{fileName}</span>
                </div>
                {dataType === 'csv' && preview && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">کل ردیف‌ها:</span>
                      <span className="font-medium">{preview.totalRows}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ردیف‌های معتبر:</span>
                      <span className="font-medium text-emerald-500">{preview.validRows}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">احتمال تکرار:</span>
                      <span className="font-medium text-amber-500">{preview.duplicateRows}</span>
                    </div>
                  </>
                )}
                {dataType === 'json' && jsonValidation && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">معاملات:</span>
                    <span className="font-medium">{jsonValidation.count}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">رفتار تکراری:</span>
                  <span className="font-medium">{skipDuplicates ? 'نادیده گرفتن' : 'وارد کردن'}</span>
                </div>
              </div>

              <Alert className="border-primary/30 bg-primary/5">
                <Layers className="h-4 w-4 text-primary" />
                <AlertDescription>
                  تمام داده‌ها به‌صورت محلی در مرورگر ذخیره می‌شوند. هیچ اطلاعاتی به سرور یا بروکر ارسال نمی‌شود.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('duplicates')}>
              <ArrowLeft className="w-4 h-4 ml-2" /> بازگشت
            </Button>
            <Button onClick={handleImport} disabled={importing} className="gap-2">
              {importing ? (
                <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> در حال وارد کردن…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> شروع وارد کردن</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 7: Done ── */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
                result.imported > 0 ? 'bg-emerald-500/20' : 'bg-muted/20'
              }`}>
                {result.imported > 0
                  ? <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  : <AlertTriangle className="w-8 h-8 text-amber-500" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{result.imported}</h2>
                <p className="text-muted-foreground">معامله با موفقیت وارد شد</p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto text-sm">
                <div className="p-3 rounded-lg bg-muted/20">
                  <div className="text-lg font-bold text-amber-500">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">رد شده</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <div className="text-lg font-bold text-rose-500">{result.errors.length}</div>
                  <div className="text-xs text-muted-foreground">خطا</div>
                </div>
              </div>

              {result.errors.slice(0, 3).map((e, i) => (
                <Alert key={i} variant="destructive" className="text-right text-sm">
                  <AlertDescription>{e}</AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={reset}>وارد کردن جدید</Button>
            <Button onClick={() => setLocation('/journal/trades')}>
              مشاهده معاملات
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
