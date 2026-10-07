/**
 * ScreenshotManager — Prompt 15, Sections 2, 3, 14, 18
 * ───────────────────────────────────────────────────────
 * Full-featured screenshot management component:
 * - Upload with timeframe + lifecycle position metadata
 * - Image quality assessment
 * - Visual feature extraction (rule-based AI suggestions)
 * - Annotation canvas
 * - Visual comparison (user text vs visual features)
 * - Historical similarity search
 * - Multi-timeframe sequence view
 * - Mobile-first, responsive
 */

import { useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Trade } from '../db/database';
import {
  TradeScreenshot,
  ScreenshotType,
  ScreenshotTimeframe,
  LifecyclePosition,
  VisualFeature,
  ScreenshotAnnotation,
  TIMEFRAME_LABELS,
  LIFECYCLE_LABELS,
} from '../types/screenshot';
import {
  assessImageQuality,
  extractInitialFeatures,
  findSimilarScreenshots,
  compareUserTextWithVisualFeatures,
  analyzeMTFRelationship,
  generateAnalysisNotes,
  compareLifecycleScreenshots,
  LifecycleComparison,
} from '../services/visualAnalysisService';
import { compressImage } from '../lib/imageCompression';
import AnnotationCanvas from './AnnotationCanvas';
import VisualFeatureEditor from './VisualFeatureEditor';
import VisualComparisonView from './VisualComparisonView';
import VisualSimilarityPanel from './VisualSimilarityPanel';
import MTFSequenceView from './MTFSequenceView';
import StoredImage from './StoredImage';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import {
  Upload, X, Eye, Edit2, Trash2, Maximize2, Layers, Search,
  GitCompare, LayoutGrid, Image as ImageIcon, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp, ZoomIn, Camera as CameraIcon, MonitorDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

function uid() { return crypto.randomUUID(); }

const TYPE_LABELS: Record<string, string> = {
  analysis: 'تحلیل',
  entry: 'ورود',
  exit: 'خروج',
  'post-trade': 'پس از معامله',
};

const QUALITY_COLOR = (score: number) =>
  score >= 70 ? 'text-green-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';

interface ActiveView {
  screenshotId: string;
  tab: 'view' | 'annotate' | 'features' | 'compare' | 'similar';
}

interface Props {
  trade: Trade;
  allTrades?: Trade[];
  onChange: (screenshots: TradeScreenshot[]) => void;
  readOnly?: boolean;
  compactMode?: boolean; // for TradeDetail — no editing, just viewing
}

interface PendingCapture {
  file: File;
  dataUrl: string;
  label: string;
}

function fileFromDataUrl(dataUrl: string, filename: string): File {
  const [header, payload] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

export default function ScreenshotManager({
  trade,
  allTrades = [],
  onChange,
  readOnly = false,
  compactMode = false,
}: Props) {
  const [activeView, setActiveView] = useState<ActiveView | null>(null);
  const [showMTF, setShowMTF] = useState(false);
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isElectron = window.electronAPI?.isElectron === true || window.location.protocol === 'file:';
  const isAndroid = Capacitor.getPlatform() === 'android';

  // Parse screenshots from trade JSON
  const screenshots: TradeScreenshot[] = (() => {
    try { return JSON.parse(trade.screenshots || '[]') as TradeScreenshot[]; }
    catch { return []; }
  })();

  const save = (updated: TradeScreenshot[]) => {
    onChange(updated);
  };

  // ── Upload ──────────────────────────────────────────────────────

  const handleUpload = useCallback(async (files: File[]) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const newScreenshots: TradeScreenshot[] = [];

      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} تصویر نیست`);
          continue;
        }

        // Compress
        let dataUrl: string;
        let fileSize = file.size;
        try {
          const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 });
          dataUrl = compressed.dataUrl;
        } catch {
          const reader = new FileReader();
          dataUrl = await new Promise<string>(res => {
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(file);
          });
        }

        // Quality assessment
        const quality = await assessImageQuality(dataUrl, fileSize);

        // Rule-based feature extraction
        const extractedFeatures = extractInitialFeatures(trade, file.name);

        const ss: TradeScreenshot = {
          id: uid(),
          label: file.name.replace(/\.[^.]+$/, '') || 'اسکرین‌شات',
          dataUrl,
          type: 'analysis',
          linkedTo: null,
          timeframe: null,
          lifecyclePosition: null,
          width: quality.width,
          height: quality.height,
          fileSize,
          quality,
          extractedFeatures,
          fibonacci: null,
          analysisNotes: null,
          userAddedFeatures: [],
          annotations: [],
          createdAt: Date.now(),
        };

        newScreenshots.push(ss);
      }

      const updated = [...screenshots, ...newScreenshots];
      try {
        save(updated);
      } catch (saveErr: unknown) {
        const msg = (saveErr as { message?: string })?.message ?? '';
        if (msg.includes('Storage is full') || (saveErr as { name?: string })?.name === 'QuotaExceededError') {
          toast.error('Storage is full. Please remove old screenshots or export backup.');
        } else {
          throw saveErr;
        }
        return;
      }

      if (newScreenshots.length > 0) {
        toast.success(`${newScreenshots.length} اسکرین‌شات اضافه شد`);
        // Open the first uploaded screenshot for feature editing
        if (!readOnly && newScreenshots[0]) {
          setActiveView({ screenshotId: newScreenshots[0].id, tab: 'features' });
        }
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('Storage is full') || (err as { name?: string })?.name === 'QuotaExceededError') {
        toast.error('Storage is full. Please remove old screenshots or export backup.');
      } else {
        toast.error('خطا در پردازش تصویر');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [trade, screenshots, isProcessing, readOnly]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleUpload(files);
    e.target.value = '';
  };

  const handleNativeCapture = useCallback(async () => {
    if (isProcessing || pendingCapture) return;

    try {
      if (isElectron) {
        if (!window.electronAPI?.captureScreen) {
          toast.error('قابلیت گرفتن اسکرین‌شات در این نسخه در دسترس نیست.');
          return;
        }
        const capture = await window.electronAPI.captureScreen();
        if (!capture?.dataUrl) {
          toast.error('گرفتن تصویر لغو شد یا صفحه‌ای برای ثبت پیدا نشد.');
          return;
        }
        setPendingCapture({
          file: fileFromDataUrl(capture.dataUrl, `screen-${Date.now()}.png`),
          dataUrl: capture.dataUrl,
          label: `اسکرین‌شات صفحه (${capture.sourceName})`,
        });
        return;
      }

      if (isAndroid) {
        const permissions = await Camera.checkPermissions();
        if (permissions.camera !== 'granted') {
          const requested = await Camera.requestPermissions({ permissions: ['camera'] });
          if (requested.camera !== 'granted') {
            toast.error('دسترسی دوربین داده نشده است.');
            return;
          }
        }
        const photo = await Camera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.DataUrl,
          quality: 90,
          width: 2400,
          correctOrientation: true,
          allowEditing: false,
        });
        if (!photo.dataUrl) {
          toast.error('گرفتن تصویر لغو شد.');
          return;
        }
        setPendingCapture({
          file: fileFromDataUrl(photo.dataUrl, `camera-${Date.now()}.jpg`),
          dataUrl: photo.dataUrl,
          label: 'عکس دوربین',
        });
      }
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error).toLowerCase();
      if (message.includes('permission') || message.includes('denied') || message.includes('not authorized')) {
        toast.error('دسترسی دوربین داده نشده است.');
      } else if (message.includes('cancel') || message.includes('dismiss')) {
        toast.error('گرفتن تصویر لغو شد.');
      } else {
        console.error('[ScreenshotCapture] native capture failed', error);
        toast.error(isElectron ? 'گرفتن اسکرین‌شات ناموفق بود.' : 'گرفتن عکس ناموفق بود.');
      }
    }
  }, [isAndroid, isElectron, isProcessing, pendingCapture]);

  const confirmNativeCapture = useCallback(async () => {
    if (!pendingCapture || isProcessing) return;
    await handleUpload([pendingCapture.file]);
    setPendingCapture(null);
  }, [handleUpload, isProcessing, pendingCapture]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    handleUpload(files);
  };

  // ── Screenshot update helpers ────────────────────────────────────

  const updateScreenshot = (id: string, patch: Partial<TradeScreenshot>) => {
    const updated = screenshots.map(s => s.id === id ? { ...s, ...patch } : s);
    save(updated);
    // Sync activeView state stays open
  };

  const deleteScreenshot = (id: string) => {
    const updated = screenshots.filter(s => s.id !== id);
    save(updated);
    if (activeView?.screenshotId === id) setActiveView(null);
  };

  // ── Active screenshot ────────────────────────────────────────────

  const activeSS = activeView
    ? screenshots.find(s => s.id === activeView.screenshotId)
    : null;

  // MTF analysis
  const mtfRelationship = screenshots.some(s => s.timeframe)
    ? analyzeMTFRelationship(screenshots)
    : null;

  // Lifecycle comparison
  const lifecycleComparison: LifecycleComparison | null =
    screenshots.some(s => s.lifecyclePosition)
      ? compareLifecycleScreenshots(screenshots, trade)
      : null;

  // ── Tabs for active screenshot ───────────────────────────────────

  const tabs = [
    { id: 'view' as const, icon: Eye, label: 'نمایش' },
    ...(!readOnly ? [{ id: 'annotate' as const, icon: Edit2, label: 'حاشیه‌نویسی' }] : []),
    { id: 'features' as const, icon: Layers, label: 'ویژگی‌ها' },
    { id: 'compare' as const, icon: GitCompare, label: 'مقایسه' },
    { id: 'similar' as const, icon: Search, label: 'مشابه' },
  ];

  const similarMatches = activeSS
    ? findSimilarScreenshots(activeSS, allTrades, {
        targetTrade: trade,
        sameSymbol: false,
        minScore: 15,
        limit: 6,
      })
    : [];

  const comparison = activeSS
    ? compareUserTextWithVisualFeatures(
        trade.notes ?? '',
        [...(activeSS.extractedFeatures ?? []), ...(activeSS.userAddedFeatures ?? [])],
      )
    : null;

  // ── Render ───────────────────────────────────────────────────────

  if (screenshots.length === 0 && readOnly) {
    return (
      <div className="border-2 border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm">
        اسکرین‌شاتی اضافه نشده است
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            {isProcessing ? 'در حال پردازش...' : 'آپلود تصویر'}
          </Button>
           {(isElectron || isAndroid) && (
             <Button
               variant="default"
               size="sm"
               onClick={handleNativeCapture}
               disabled={isProcessing || Boolean(pendingCapture)}
               className="gap-2"
             >
               {isElectron ? <MonitorDown className="w-4 h-4" /> : <CameraIcon className="w-4 h-4" />}
               {isElectron ? 'گرفتن اسکرین‌شات' : 'گرفتن عکس با دوربین'}
             </Button>
           )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />

          {screenshots.length >= 2 && (
            <>
              <Button
                variant={showMTF ? 'default' : 'ghost'} size="sm"
                onClick={() => { setShowMTF(v => !v); setShowLifecycle(false); setActiveView(null); }}
                className="gap-2"
              >
                <LayoutGrid className="w-4 h-4" />
                چند تایم‌فریم
              </Button>
              <Button
                variant={showLifecycle ? 'default' : 'ghost'} size="sm"
                onClick={() => { setShowLifecycle(v => !v); setShowMTF(false); setActiveView(null); }}
                className="gap-2"
              >
                <GitCompare className="w-4 h-4" />
                یادگیری پس از معامله
              </Button>
            </>
          )}
        </div>
      )}

      {/* MTF View */}
      {showMTF && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">تحلیل چند تایم‌فریم</CardTitle>
          </CardHeader>
          <CardContent>
            <MTFSequenceView screenshots={screenshots} mtfRelationship={mtfRelationship} />
          </CardContent>
        </Card>
      )}

      {/* Lifecycle View */}
      {showLifecycle && lifecycleComparison && (
        <Card className="border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-amber-400" />
              یادگیری پس از معامله — مقایسه قبل / حین / بعد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Three columns */}
            <div className="grid grid-cols-3 gap-3">
              {(['before', 'during', 'after'] as const).map(phase => {
                const group = lifecycleComparison[phase];
                const labels = { before: 'قبل از ورود', during: 'حین معامله', after: 'پس از معامله' };
                const colors = {
                  before: 'border-blue-500/25 bg-blue-500/5',
                  during: 'border-amber-500/25 bg-amber-500/5',
                  after: 'border-green-500/25 bg-green-500/5',
                };
                return (
                  <div key={phase} className={cn('rounded-lg border p-2 space-y-2', colors[phase])}>
                    <p className="text-xs font-medium text-center">{labels[phase]}</p>
                    {group.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">—</p>
                    ) : (
                      group.map(ss => (
                        <div key={ss.id} className="aspect-video rounded overflow-hidden">
                          <StoredImage source={ss.dataUrl} alt={ss.label} className="w-full h-full object-cover" />
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>

            {/* Observations */}
            {lifecycleComparison.observations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">مشاهدات:</p>
                {lifecycleComparison.observations.map((obs, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-amber-400 flex-shrink-0 mt-0.5">◆</span>
                    {obs}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Screenshot grid */}
      <div
        className={cn(
          'grid gap-3',
          compactMode ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
        )}
        onDragOver={e => e.preventDefault()}
        onDrop={readOnly ? undefined : handleDrop}
      >
        {screenshots.map(ss => (
          <div
            key={ss.id}
            className={cn(
              'group relative rounded-xl border overflow-hidden transition-all cursor-pointer',
              activeView?.screenshotId === ss.id
                ? 'border-primary ring-1 ring-primary/30'
                : 'border-white/10 hover:border-white/25',
            )}
            onClick={() => setActiveView(prev =>
              prev?.screenshotId === ss.id ? null : { screenshotId: ss.id, tab: 'view' }
            )}
          >
            {/* Thumbnail */}
            <div className="aspect-video relative overflow-hidden bg-black/20">
              <StoredImage
                source={ss.dataUrl}
                alt={ss.label}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />

              {/* Quality badge */}
              {ss.quality && (
                <div className="absolute top-1.5 right-1.5">
                  <span className={cn(
                    'text-[10px] px-1 py-0.5 rounded bg-black/70 backdrop-blur-sm font-mono',
                    QUALITY_COLOR(ss.quality.score),
                  )}>
                    {ss.quality.score}
                  </span>
                </div>
              )}

              {/* Timeframe badge */}
              {ss.timeframe && (
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/80 text-white backdrop-blur-sm font-mono">
                    {ss.timeframe}
                  </span>
                </div>
              )}

              {/* Lifecycle badge */}
              {ss.lifecyclePosition && (
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                  <span className="text-[10px] text-white">
                    {LIFECYCLE_LABELS[ss.lifecyclePosition]}
                  </span>
                </div>
              )}

              {/* Feature count */}
              {((ss.extractedFeatures ?? []).filter(f => f.confirmed !== false).length +
                (ss.userAddedFeatures ?? []).length) > 0 && (
                <div className="absolute bottom-1.5 right-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/80 text-white backdrop-blur-sm">
                    {(ss.extractedFeatures ?? []).filter(f => f.confirmed !== false).length +
                      (ss.userAddedFeatures ?? []).length} ویژگی
                  </span>
                </div>
              )}

              {/* Delete button */}
              {!readOnly && (
                <button
                  className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity
                             w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded flex items-center justify-center"
                  onClick={e => { e.stopPropagation(); deleteScreenshot(ss.id); }}
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>

            {/* Label row */}
            <div className="px-2 py-1.5 bg-black/30">
              <p className="text-xs truncate">{ss.label || 'اسکرین‌شات'}</p>
              <p className="text-[10px] text-muted-foreground">{TYPE_LABELS[ss.type] ?? ss.type}</p>
            </div>
          </div>
        ))}

        {/* Upload drop zone */}
        {!readOnly && (
          <label
            className={cn(
              'border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2',
              'text-muted-foreground hover:text-foreground hover:border-white/30 transition-all cursor-pointer',
              'aspect-video',
            )}
          >
            <ImageIcon className="w-6 h-6 opacity-50" />
            <span className="text-xs">افزودن</span>
            <input
              type="file" accept="image/*" multiple className="hidden"
              onChange={handleFileInput}
            />
          </label>
        )}
      </div>

      {pendingCapture && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{pendingCapture.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg overflow-hidden border border-white/10 bg-black/30">
              <StoredImage
                source={pendingCapture.dataUrl}
                alt={pendingCapture.label}
                className="max-h-[45vh] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={confirmNativeCapture} disabled={isProcessing}>
                <CheckCircle2 className="w-4 h-4 ml-1" /> تأیید و ذخیره
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleNativeCapture()} disabled={isProcessing}>
                <CameraIcon className="w-4 h-4 ml-1" /> گرفتن دوباره
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingCapture(null)} disabled={isProcessing}>
                لغو
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active screenshot panel */}
      {activeView && activeSS && (
        <Card className="border-primary/20 bg-primary/3">
          <CardHeader className="pb-0">
            {/* Tab bar */}
            <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(prev => prev ? { ...prev, tab: tab.id } : null)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all',
                    activeView.tab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}

              {/* Screenshot metadata (always visible) */}
              {!readOnly && (
                <div className="mr-auto flex items-center gap-2">
                  <Select
                    value={activeSS.timeframe ?? ''}
                    onValueChange={v => updateScreenshot(activeSS.id, { timeframe: (v || null) as ScreenshotTimeframe })}
                  >
                    <SelectTrigger className="h-7 text-xs w-24">
                      <SelectValue placeholder="تایم‌فریم" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="text-xs">بدون TF</SelectItem>
                      {Object.entries(TIMEFRAME_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={activeSS.lifecyclePosition ?? ''}
                    onValueChange={v => updateScreenshot(activeSS.id, { lifecyclePosition: (v || null) as LifecyclePosition })}
                  >
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue placeholder="مرحله معامله" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="text-xs">بدون مرحله</SelectItem>
                      {Object.entries(LIFECYCLE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={activeSS.type}
                    onValueChange={v => updateScreenshot(activeSS.id, { type: v as ScreenshotType })}
                  >
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue placeholder="نوع تصویر" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={activeSS.label}
                    onChange={e => updateScreenshot(activeSS.id, { label: e.target.value })}
                    className="h-7 text-xs w-32"
                    placeholder="برچسب"
                  />
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-3">
            {/* Image quality warning */}
            {activeSS.quality && activeSS.quality.score < 50 && (
              <div className="mb-3 flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="text-amber-400 font-medium">کیفیت تصویر: {activeSS.quality.score}/100</p>
                  {activeSS.quality.issues.map((issue, i) => (
                    <p key={i}>{issue}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: View */}
            {activeView.tab === 'view' && (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border border-white/10">
                  <StoredImage
                    source={activeSS.dataUrl}
                    alt={activeSS.label}
                    enableViewer
                    showDownload
                    filename={activeSS.label || 'trade-screenshot'}
                    className="w-full h-auto max-h-[60vh] object-contain bg-black/20"
                  />
                </div>
                {activeSS.analysisNotes && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{activeSS.analysisNotes}</p>
                )}
                {/* Metadata */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {activeSS.width && activeSS.height && (
                    <span>{activeSS.width} × {activeSS.height} px</span>
                  )}
                  {activeSS.fileSize && (
                    <span>{(activeSS.fileSize / 1024).toFixed(0)} KB</span>
                  )}
                  {activeSS.quality && (
                    <span className={QUALITY_COLOR(activeSS.quality.score)}>
                      کیفیت: {activeSS.quality.score}/100
                    </span>
                  )}
                  {activeSS.annotations.length > 0 && (
                    <span>{activeSS.annotations.length} حاشیه‌نویسی</span>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Annotate */}
            {activeView.tab === 'annotate' && !readOnly && (
              <AnnotationCanvas
                imageDataUrl={activeSS.dataUrl}
                annotations={activeSS.annotations ?? []}
                onChange={anns => updateScreenshot(activeSS.id, { annotations: anns })}
              />
            )}

            {/* Tab: Features */}
            {activeView.tab === 'features' && (
              <VisualFeatureEditor
                features={activeSS.extractedFeatures ?? []}
                userAddedFeatures={activeSS.userAddedFeatures ?? []}
                onChange={(extracted, userAdded) => {
                  const analysisNotes = generateAnalysisNotes(
                    { ...activeSS, extractedFeatures: extracted, userAddedFeatures: userAdded },
                    trade,
                  );
                  updateScreenshot(activeSS.id, {
                    extractedFeatures: extracted,
                    userAddedFeatures: userAdded,
                    analysisNotes,
                  });
                }}
              />
            )}

            {/* Tab: Compare */}
            {activeView.tab === 'compare' && comparison && (
              <VisualComparisonView
                comparison={comparison}
                userTextLabel="یادداشت‌های معامله"
              />
            )}

            {/* Tab: Similar */}
            {activeView.tab === 'similar' && (
              <VisualSimilarityPanel matches={similarMatches} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
