/**
 * Screenshot Intelligence — Prompt 27
 * ───────────────────────────────────────────────────────────────
 * موتور هوشمند اسکرین‌شات چارت، مقایسه بصری معاملات،
 * و سیستم تشخیص الگوی شخصی
 * کاملاً آفلاین | ذخیره‌سازی محلی | بدون ارسال به سرور
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Upload, Image as ImageIcon, Layers, FolderOpen, BarChart3, X,
  Plus, Search, Eye, Edit2, Trash2, Camera, ChevronDown, ChevronUp,
  BookOpen, Zap, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  Tag, Grid3x3, List, Filter, Save, FolderPlus, Brain, ArrowRight,
  Shield, History, Target, Sparkles, Info, Package, RotateCcw,
  SlidersHorizontal, Calendar, Clock, Globe2, Users, MonitorUp
} from 'lucide-react';
import { db, ChartScreenshot, ScreenshotCollection, VisualPattern, ScreenshotGroup, Trade } from '../db/database';
import {
  getAllChartScreenshots, saveChartScreenshot, updateChartScreenshot, deleteChartScreenshot,
  getAllCollections, saveCollection, updateCollection, deleteCollection, addToCollection, removeFromCollection,
  getAllPatterns, savePattern, updatePattern, deletePattern,
  getAllGroups, saveGroup, updateGroup, deleteGroup,
  findSimilarChartScreenshots, computePatternPerformance, computePatternBySession,
  computePatternByDay, detectVisualMistakes, detectVisualStrengths,
  computeOutcomeDistribution, generateVisualBriefing, getScreenshotStats,
} from '../services/screenshotIntelligenceService';
import { assessImageQuality } from '../services/visualAnalysisService';
import { compressImage } from '../lib/imageCompression';
import {
  ChartScreenshotType, PatternTag, PATTERN_TAG_LABELS,
  SCREENSHOT_TYPE_LABELS, SESSION_LABELS, RepeatedPattern,
  PatternPerformanceStats,
} from '../types/chartScreenshot';
import { VisualFeature, ScreenshotAnnotation, FEATURE_CATEGORIES, FEATURE_LABELS } from '../types/screenshot';
import AnnotationCanvas from '../components/AnnotationCanvas';
import StoredImage, { useStoredImageUrl } from '../components/StoredImage';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';

// ── Helpers ────────────────────────────────────────────────────────

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `screenshot_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('خواندن تصویر نتیجه‌ای نداشت'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('خواندن تصویر ناموفق بود'));
    reader.onabort = () => reject(new Error('خواندن تصویر لغو شد'));
    reader.readAsDataURL(file);
  });
}
function safeJson<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

const ALL_PATTERN_TAGS: PatternTag[] = [
  'breakout', 'pullback', 'reversal', 'continuation', 'range',
  'liquidity-sweep', 'compression', 'expansion', 'trend', 'countertrend',
];

const RESULT_COLORS: Record<string, string> = {
  win: 'text-green-400', loss: 'text-red-400', breakeven: 'text-slate-400',
  'partial-win': 'text-emerald-400', 'partial-loss': 'text-orange-400',
};

// ── Tab type ────────────────────────────────────────────────────────
type Tab = 'gallery' | 'groups' | 'patterns' | 'collections' | 'analytics' | 'briefing';

// ── Main page ────────────────────────────────────────────────────────
export default function ScreenshotIntelligence() {
  const [activeTab, setActiveTab] = useState<Tab>('gallery');
  const qc = useQueryClient();

  const { data: allTrades = [] } = useQuery<Trade[]>({
    queryKey: ['trades'],
    queryFn: () => db.trades.toArray(),
  });

  const { data: stats } = useQuery({
    queryKey: ['screenshot-stats'],
    queryFn: getScreenshotStats,
  });

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'gallery', label: 'گالری', icon: Grid3x3 },
    { id: 'groups', label: 'گروه‌ها', icon: Layers },
    { id: 'patterns', label: 'کتابخانه الگو', icon: BookOpen },
    { id: 'collections', label: 'کالکشن‌ها', icon: FolderOpen },
    { id: 'analytics', label: 'تحلیل عملکرد', icon: BarChart3 },
    { id: 'briefing', label: 'بریفینگ بصری', icon: Brain },
  ];

  return (
    <div className="min-h-full p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* هدر */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Camera className="w-5 h-5 text-violet-400" />
          </div>
          هوش اسکرین‌شات چارت
        </h1>
        <p className="text-sm text-muted-foreground">
          آپلود، تحلیل، مقایسه و جستجوی الگوهای بصری — کاملاً آفلاین
        </p>
      </div>

      {/* آمار سریع */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'اسکرین‌شات', value: stats.totalScreenshots, icon: ImageIcon, color: 'text-violet-400' },
            { label: 'گروه MTF', value: stats.totalGroups, icon: Layers, color: 'text-blue-400' },
            { label: 'الگوی شخصی', value: stats.totalPatterns, icon: BookOpen, color: 'text-amber-400' },
            { label: 'کالکشن', value: stats.totalCollections, icon: FolderOpen, color: 'text-green-400' },
          ].map(s => (
            <Card key={s.label} className="border-white/8">
              <CardContent className="p-3 flex items-center gap-3">
                <s.icon className={cn('w-5 h-5 shrink-0', s.color)} />
                <div>
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* تب‌ها */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide border-b border-white/8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-t-md text-sm font-medium whitespace-nowrap transition-colors border-b-2',
              activeTab === tab.id
                ? 'text-primary border-primary bg-primary/5'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4 shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* محتوا */}
      <div>
        {activeTab === 'gallery' && <GalleryTab allTrades={allTrades} onRefresh={() => qc.invalidateQueries({ queryKey: ['screenshot-stats'] })} />}
        {activeTab === 'groups' && <GroupsTab />}
        {activeTab === 'patterns' && <PatternsTab allTrades={allTrades} />}
        {activeTab === 'collections' && <CollectionsTab />}
        {activeTab === 'analytics' && <AnalyticsTab allTrades={allTrades} />}
        {activeTab === 'briefing' && <BriefingTab allTrades={allTrades} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB: GALLERY
// ════════════════════════════════════════════════════════════════════

function GalleryTab({ allTrades, onRefresh }: { allTrades: Trade[]; onRefresh: () => void }) {
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterType, setFilterType] = useState<ChartScreenshotType | 'all'>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const qc = useQueryClient();

  const { data: screenshots = [] } = useQuery<ChartScreenshot[]>({
    queryKey: ['chart-screenshots'],
    queryFn: getAllChartScreenshots,
  });

  const { data: collections = [] } = useQuery<ScreenshotCollection[]>({
    queryKey: ['screenshot-collections'],
    queryFn: getAllCollections,
  });

  const filtered = useMemo(() => {
    return screenshots.filter(ss => {
      if (filterSymbol && ss.symbol?.toLowerCase() !== filterSymbol.toLowerCase()) return false;
      if (filterType !== 'all' && ss.screenshotType !== filterType) return false;
      if (filterTag !== 'all') {
        const tags = safeJson<string[]>(ss.patternTags, []);
        const custom = safeJson<string[]>(ss.customTags, []);
        if (!tags.includes(filterTag) && !custom.includes(filterTag)) return false;
      }
      return true;
    });
  }, [screenshots, filterSymbol, filterType, filterTag]);

  const selected = selectedId ? screenshots.find(s => s.id === selectedId) : null;

  const handleFiles = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} تصویر نیست`); continue; }
        let dataUrl: string;
        try {
          const c = await compressImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 });
          dataUrl = c.dataUrl;
        } catch {
          dataUrl = await readFileAsDataUrl(file);
        }
        const quality = await assessImageQuality(dataUrl, file.size);
        await saveChartScreenshot({
          symbol: null, timeframe: null, date: null, time: null, timezone: null,
          session: null, direction: null, setup: null, strategy: null, tradeId: null,
          screenshotType: 'pre-trade', label: file.name.replace(/\.[^.]+$/, ''),
          notes: null, dataUrl,
          width: quality.width, height: quality.height, fileSize: file.size,
          quality: JSON.stringify(quality),
          extractedFeatures: '[]', userAddedFeatures: '[]',
          patternTags: '[]', customTags: '[]', annotations: '[]',
          analysisNotes: null, groupId: null, collectionIds: '[]', linkedKnowledgeIds: '[]',
          imageBlob: null,
        });
      }
      await qc.invalidateQueries({ queryKey: ['chart-screenshots'] });
      onRefresh();
      toast.success('اسکرین‌شات‌ها اضافه شدند');
    } catch (error) {
      console.error('[ScreenshotIntelligence] upload failed', error);
      toast.error(error instanceof Error ? error.message : 'آپلود اسکرین‌شات ناموفق بود');
    } finally { setIsProcessing(false); }
  }, [qc, onRefresh]);

  const captureScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error('گرفتن تصویر از صفحه در این دستگاه پشتیبانی نمی‌شود؛ از آپلود یا دوربین استفاده کنید.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise<void>(resolve => {
        if (video.readyState >= 2) resolve();
        else video.addEventListener('loadeddata', () => resolve(), { once: true });
      });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach(track => track.stop());
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('ساخت تصویر از صفحه ناموفق بود');
      await handleFiles([new File([blob], `screen-${Date.now()}.png`, { type: 'image/png' })]);
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        toast.error('گرفتن تصویر از صفحه انجام نشد');
      }
    }
  };

  const handleDelete = async (id: string) => {
    await deleteChartScreenshot(id);
    await qc.invalidateQueries({ queryKey: ['chart-screenshots', 'screenshot-collections'] });
    onRefresh();
    if (selectedId === id) setSelectedId(null);
    toast.success('اسکرین‌شات حذف شد');
  };

  return (
    <div className="space-y-4">
      {/* نوار ابزار */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
          <Upload className="w-4 h-4" />
          {isProcessing ? 'در حال پردازش...' : 'آپلود اسکرین‌شات'}
        </Button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpg,image/jpeg,image/webp" multiple className="hidden"
          onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) handleFiles(f); e.target.value = ''; }} />
        <Button size="sm" variant="outline" className="gap-2" onClick={() => cameraInputRef.current?.click()} disabled={isProcessing}>
          <Camera className="w-4 h-4" /> دوربین
        </Button>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) handleFiles(f); e.target.value = ''; }} />
        <Button size="sm" variant="outline" className="gap-2" onClick={() => void captureScreen()} disabled={isProcessing}>
          <MonitorUp className="w-4 h-4" /> تصویر از صفحه
        </Button>
        <Input placeholder="فیلتر نماد..." value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)} className="w-32 h-8 text-sm" />
        <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="نوع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه انواع</SelectItem>
            {Object.entries(SCREENSHOT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="تگ الگو" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه الگوها</SelectItem>
            {ALL_PATTERN_TAGS.map(t => <SelectItem key={t} value={t}>{PATTERN_TAG_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground mr-auto">{filtered.length} اسکرین‌شات</span>
      </div>

      {/* ناحیه درگ اند دراپ */}
      <div
        className="border-2 border-dashed border-white/15 rounded-xl p-4 text-center text-muted-foreground text-sm hover:border-white/30 transition-colors cursor-pointer"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Camera className="w-6 h-6 mx-auto mb-2 opacity-40" />
        <p>اسکرین‌شات را اینجا رها کنید یا کلیک کنید</p>
        <p className="text-xs mt-1">PNG · JPG · JPEG · WEBP — داده‌ها فقط به صورت محلی ذخیره می‌شوند</p>
      </div>

      {/* گرید اسکرین‌شات‌ها */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">هنوز اسکرین‌شاتی اضافه نشده</p>
          <p className="text-xs mt-1">اولین اسکرین‌شات چارت خود را آپلود کنید</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(ss => (
            <ScreenshotCard
              key={ss.id}
              ss={ss}
              isSelected={selectedId === ss.id}
              onSelect={() => setSelectedId(s => s === ss.id ? null : ss.id)}
              onDelete={() => handleDelete(ss.id)}
              collections={collections}
            />
          ))}
        </div>
      )}

      {/* پنل جزئیات */}
      {selected && (
        <ScreenshotDetailPanel
          ss={selected}
          allTrades={allTrades}
          allScreenshots={screenshots}
          onClose={() => setSelectedId(null)}
          onUpdate={async (patch) => {
            await updateChartScreenshot(selected.id, patch);
            await qc.invalidateQueries({ queryKey: ['chart-screenshots'] });
          }}
          collections={collections}
        />
      )}
    </div>
  );
}

// ── Screenshot Card ───────────────────────────────────────────────

function ScreenshotCard({ ss, isSelected, onSelect, onDelete, collections }: {
  ss: ChartScreenshot;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  collections: ScreenshotCollection[];
}) {
  const tags = safeJson<string[]>(ss.patternTags, []);
  const quality = safeJson<any>(ss.quality, null);
  const qScore = quality?.score ?? null;

  return (
    <div
      className={cn(
        'group relative rounded-xl border overflow-hidden cursor-pointer transition-all',
        isSelected ? 'border-primary ring-1 ring-primary/30' : 'border-white/10 hover:border-white/25'
      )}
      onClick={onSelect}
    >
      <div className="aspect-video relative overflow-hidden bg-black/20">
        <StoredImage source={ss} alt={ss.label ?? ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        {qScore !== null && (
          <span className={cn('absolute top-1.5 right-1.5 text-[10px] px-1 py-0.5 rounded bg-black/70 font-mono',
            qScore >= 70 ? 'text-green-400' : qScore >= 40 ? 'text-amber-400' : 'text-red-400')}>
            {qScore}
          </span>
        )}
        {ss.timeframe && (
          <span className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/80 text-white font-mono">
            {ss.timeframe}
          </span>
        )}
        {ss.screenshotType && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
            <span className="text-[10px] text-white">{SCREENSHOT_TYPE_LABELS[ss.screenshotType as ChartScreenshotType] ?? ss.screenshotType}</span>
          </div>
        )}
        <button
          className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded flex items-center justify-center transition-opacity"
          onClick={e => { e.stopPropagation(); onDelete(); }}
        >
          <X className="w-3 h-3 text-white" />
        </button>
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs truncate font-medium">{ss.label ?? 'اسکرین‌شات'}</p>
        {ss.symbol && <p className="text-[10px] text-muted-foreground">{ss.symbol}</p>}
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.slice(0, 2).map(t => (
              <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-300">{PATTERN_TAG_LABELS[t] ?? t}</span>
            ))}
            {tags.length > 2 && <span className="text-[9px] text-muted-foreground">+{tags.length - 2}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Screenshot Detail Panel ────────────────────────────────────────

function ScreenshotDetailPanel({ ss, allTrades, allScreenshots, onClose, onUpdate, collections }: {
  ss: ChartScreenshot;
  allTrades: Trade[];
  allScreenshots: ChartScreenshot[];
  onClose: () => void;
  onUpdate: (patch: Partial<ChartScreenshot>) => Promise<void>;
  collections: ScreenshotCollection[];
}) {
  const [tab, setTab] = useState<'meta' | 'tags' | 'annotate' | 'similar' | 'compare'>('meta');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    symbol: ss.symbol ?? '',
    timeframe: ss.timeframe ?? '',
    date: ss.date ?? '',
    time: ss.time ?? '',
    session: ss.session ?? '',
    direction: ss.direction ?? '',
    setup: ss.setup ?? '',
    screenshotType: ss.screenshotType,
    label: ss.label ?? '',
    notes: ss.notes ?? '',
  });
  const [patternTags, setPatternTags] = useState<string[]>(safeJson<string[]>(ss.patternTags, []));
  const [customTag, setCustomTag] = useState('');
  const [customTags, setCustomTags] = useState<string[]>(safeJson<string[]>(ss.customTags, []));
  const [annotations, setAnnotations] = useState<ScreenshotAnnotation[]>(safeJson<ScreenshotAnnotation[]>(ss.annotations, []));
  const [similarMatches, setSimilarMatches] = useState<any[]>([]);
  const qc = useQueryClient();
  const annotationImageUrl = useStoredImageUrl(ss);

  useEffect(() => {
    if (tab !== 'similar') return;
    let cancelled = false;
    findSimilarChartScreenshots(ss.id, { minScore: 20, limit: 8 })
      .then(matches => { if (!cancelled) setSimilarMatches(matches); })
      .catch(error => {
        if (!cancelled) {
          console.error('[ScreenshotIntelligence] similarity search failed', error);
          setSimilarMatches([]);
          toast.error('جستجوی تصاویر مشابه انجام نشد');
        }
      });
    return () => { cancelled = true; };
  }, [tab, ss.id]);

  const save = async () => {
    try {
      await onUpdate({
        ...form,
        symbol: form.symbol || null,
        timeframe: form.timeframe || null,
        date: form.date || null,
        time: form.time || null,
        session: form.session || null,
        direction: form.direction || null,
        setup: form.setup || null,
        notes: form.notes || null,
        label: form.label || null,
        patternTags: JSON.stringify(patternTags),
        customTags: JSON.stringify(customTags),
        annotations: JSON.stringify(annotations),
      });
      setEditing(false);
      toast.success('ذخیره شد');
    } catch (error) {
      console.error('[ScreenshotIntelligence] screenshot update failed', error);
      toast.error('ذخیره اطلاعات اسکرین‌شات انجام نشد');
    }
  };

  const saveAnnotations = async () => {
    try {
      await onUpdate({ annotations: JSON.stringify(annotations) });
      toast.success('حاشیه‌نویسی ذخیره شد');
    } catch (error) {
      console.error('[ScreenshotIntelligence] annotation update failed', error);
      toast.error('ذخیره حاشیه‌نویسی انجام نشد');
    }
  };

  const toggleTag = (tag: string) => {
    setPatternTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  const addCustomTag = () => {
    if (customTag.trim() && !customTags.includes(customTag.trim())) {
      setCustomTags(prev => [...prev, customTag.trim()]);
      setCustomTag('');
    }
  };

  const tabs2 = [
    { id: 'meta', label: 'متادیتا' },
    { id: 'tags', label: 'تگ‌ها' },
    { id: 'annotate', label: 'حاشیه‌نویسی' },
    { id: 'similar', label: 'مشابه' },
  ];

  return (
    <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
      {/* هدر */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-primary/5">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{ss.label ?? 'اسکرین‌شات'}</h3>
          {ss.symbol && <Badge variant="secondary" className="text-xs">{ss.symbol}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="text-xs h-7">لغو</Button>
              <Button size="sm" onClick={save} className="text-xs h-7 gap-1"><Save className="w-3 h-3" />ذخیره</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="text-xs h-7 gap-1"><Edit2 className="w-3 h-3" />ویرایش</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* تصویر */}
        <div className="rounded-lg overflow-hidden border border-white/10">
          <StoredImage
            source={ss}
            alt={ss.label ?? ''}
            enableViewer
            showDownload
            filename={ss.label || 'chart-screenshot'}
            className="w-full h-auto max-h-72 object-contain bg-black/30"
          />
        </div>

        {/* پنل تب‌دار */}
        <div className="space-y-3">
          <div className="flex gap-1 border-b border-white/8">
            {tabs2.map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={cn('px-3 py-1.5 text-xs rounded-t transition-colors border-b-2',
                  tab === t.id ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground')}>
                {t.label}
              </button>
            ))}
          </div>

          {/* متادیتا */}
          {tab === 'meta' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {editing ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">برچسب</Label>
                    <Input className="h-7 text-xs" value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))} placeholder="برچسب..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">نماد</Label>
                    <Input className="h-7 text-xs" value={form.symbol} onChange={e => setForm(f => ({...f, symbol: e.target.value}))} placeholder="مثلاً XAUUSD" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">تایم‌فریم</Label>
                    <Select value={form.timeframe} onValueChange={v => setForm(f => ({...f, timeframe: v}))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="تایم‌فریم" /></SelectTrigger>
                      <SelectContent>
                        {['1m','5m','15m','1h','4h','D','W'].map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">نوع</Label>
                    <Select value={form.screenshotType} onValueChange={v => setForm(f => ({...f, screenshotType: v}))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SCREENSHOT_TYPE_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">تاریخ</Label>
                    <Input className="h-7 text-xs" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">سشن</Label>
                    <Select value={form.session} onValueChange={v => setForm(f => ({...f, session: v}))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="سشن" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SESSION_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">جهت</Label>
                    <Select value={form.direction} onValueChange={v => setForm(f => ({...f, direction: v}))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="جهت" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="long">خرید (Long)</SelectItem>
                        <SelectItem value="short">فروش (Short)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ستاپ</Label>
                    <Input className="h-7 text-xs" value={form.setup} onChange={e => setForm(f => ({...f, setup: e.target.value}))} placeholder="نوع ستاپ..." />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">یادداشت</Label>
                    <Textarea className="text-xs min-h-[60px]" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="یادداشت..." />
                  </div>
                </>
              ) : (
                <>
                  {[
                    { label: 'نماد', value: ss.symbol },
                    { label: 'تایم‌فریم', value: ss.timeframe },
                    { label: 'نوع', value: ss.screenshotType ? SCREENSHOT_TYPE_LABELS[ss.screenshotType as ChartScreenshotType] : null },
                    { label: 'تاریخ', value: ss.date },
                    { label: 'سشن', value: ss.session ? SESSION_LABELS[ss.session] : null },
                    { label: 'جهت', value: ss.direction === 'long' ? 'خرید' : ss.direction === 'short' ? 'فروش' : null },
                    { label: 'ستاپ', value: ss.setup },
                  ].map(item => item.value ? (
                    <div key={item.label} className="space-y-0.5">
                      <p className="text-muted-foreground">{item.label}</p>
                      <p className="font-medium">{item.value}</p>
                    </div>
                  ) : null)}
                  {ss.notes && (
                    <div className="col-span-2 space-y-0.5 border-t border-white/8 pt-2 mt-1">
                      <p className="text-muted-foreground">یادداشت</p>
                      <p className="leading-relaxed">{ss.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* تگ‌ها */}
          {tab === 'tags' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">الگوهای استاندارد:</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_PATTERN_TAGS.map(t => (
                  <button key={t} onClick={() => { toggleTag(t); }}
                    className={cn('text-xs px-2 py-1 rounded-full border transition-colors',
                      patternTags.includes(t)
                        ? 'bg-violet-500/30 border-violet-500/50 text-violet-300'
                        : 'border-white/15 text-muted-foreground hover:border-white/30')}>
                    {PATTERN_TAG_LABELS[t]}
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-muted-foreground">تگ‌های دلخواه:</p>
              <div className="flex gap-2">
                <Input className="h-7 text-xs flex-1" value={customTag}
                  onChange={e => setCustomTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomTag()}
                  placeholder="تگ جدید..." />
                <Button size="sm" variant="outline" onClick={addCustomTag} className="h-7 px-2"><Plus className="w-3 h-3" /></Button>
              </div>
              {customTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {customTags.map(t => (
                    <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300">
                      {t}
                      <button onClick={() => setCustomTags(prev => prev.filter(x => x !== t))} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                </div>
              )}
              <Button size="sm" onClick={save} className="w-full gap-2"><Save className="w-3 h-3" />ذخیره تگ‌ها</Button>
            </div>
          )}

          {/* حاشیه‌نویسی */}
          {tab === 'annotate' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">تصویر اصلی دست‌نخورده می‌ماند — حاشیه‌نویسی‌ها جداگانه ذخیره می‌شوند</p>
              <div className="rounded-lg overflow-hidden border border-white/10">
                <AnnotationCanvas
                  imageDataUrl={annotationImageUrl ?? ''}
                  annotations={annotations}
                  onChange={setAnnotations}
                />
              </div>
              <Button size="sm" onClick={saveAnnotations} className="w-full gap-2"><Save className="w-3 h-3" />ذخیره حاشیه‌نویسی‌ها</Button>
            </div>
          )}

          {/* مشابه */}
          {tab === 'similar' && (
            <div className="space-y-3">
              {similarMatches.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>نمونه مشابهی یافت نشد</p>
                  <p className="text-xs mt-1">با افزودن تگ‌ها، جستجو دقیق‌تر می‌شود</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{similarMatches.length} نمونه مشابه یافت شد</p>
                  <div className="grid grid-cols-2 gap-2">
                    {similarMatches.map(m => (
                      <div key={m.screenshotId} className="rounded-lg border border-white/10 overflow-hidden">
                        <div className="aspect-video relative overflow-hidden">
                          <StoredImage source={m} alt="" className="w-full h-full object-cover" />
                          <span className="absolute top-1 right-1 text-[10px] px-1 py-0.5 rounded bg-black/70 text-white">{m.matchScore}٪</span>
                        </div>
                        <div className="p-1.5 text-xs">
                          <p className="text-muted-foreground">{m.symbol ?? '—'} {m.timeframe && `· ${m.timeframe}`}</p>
                          {m.matchedTags.length > 0 && (
                            <p className="text-[10px] text-violet-300 mt-0.5 truncate">{m.matchedTags.slice(0,3).map((t: string) => PATTERN_TAG_LABELS[t] ?? t).join('، ')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB: GROUPS (Multi-Timeframe)
// ════════════════════════════════════════════════════════════════════

function GroupsTab() {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const qc = useQueryClient();

  const { data: groups = [] } = useQuery<ScreenshotGroup[]>({
    queryKey: ['screenshot-groups'],
    queryFn: getAllGroups,
  });

  const { data: allChartSS = [] } = useQuery<ChartScreenshot[]>({
    queryKey: ['chart-screenshots'],
    queryFn: getAllChartScreenshots,
  });

  const createGroup = async () => {
    if (!newName.trim()) return;
    await saveGroup({
      name: newName.trim(), symbol: newSymbol.trim() || null, date: null,
      session: null, setup: null, tradeId: null, screenshotIds: '[]',
      notes: null, mtfRelationship: null,
    });
    await qc.invalidateQueries({ queryKey: ['screenshot-groups'] });
    setShowNew(false); setNewName(''); setNewSymbol('');
    toast.success('گروه ایجاد شد');
  };

  const deleteGroupFn = async (id: string) => {
    await deleteGroup(id);
    await qc.invalidateQueries({ queryKey: ['screenshot-groups', 'chart-screenshots'] });
    toast.success('گروه حذف شد');
  };

  const addToGroup = async (groupId: string, screenshotId: string) => {
    const grp = groups.find(g => g.id === groupId);
    if (!grp) return;
    const ids = safeJson<string[]>(grp.screenshotIds, []);
    if (!ids.includes(screenshotId)) {
      await updateGroup(groupId, { screenshotIds: JSON.stringify([...ids, screenshotId]) });
      await updateChartScreenshot(screenshotId, { groupId });
      await qc.invalidateQueries({ queryKey: ['screenshot-groups', 'chart-screenshots'] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowNew(true)} className="gap-2"><Plus className="w-4 h-4" />گروه جدید</Button>
        <p className="text-xs text-muted-foreground mr-auto">{groups.length} گروه MTF</p>
      </div>

      {showNew && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">گروه MTF جدید</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">نام گروه *</Label>
                <Input className="h-8 text-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder="مثلاً: تحلیل XAUUSD لندن" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نماد</Label>
                <Input className="h-8 text-sm" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} placeholder="مثلاً: XAUUSD" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createGroup} className="gap-2"><Save className="w-3 h-3" />ایجاد</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>لغو</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">گروهی ایجاد نشده</p>
          <p className="text-xs mt-1">گروه‌های چند تایم‌فریم برای تحلیل همزمان تایم‌فریم‌ها</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(grp => {
            const ids = safeJson<string[]>(grp.screenshotIds, []);
            const ssInGroup = allChartSS.filter(s => ids.includes(s.id));
            const ungrouped = allChartSS.filter(s => !s.groupId || s.groupId === grp.id);
            return (
              <Card key={grp.id} className="border-white/8">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{grp.name}</CardTitle>
                    {grp.symbol && <p className="text-xs text-muted-foreground">{grp.symbol}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{ids.length} اسکرین‌شات</Badge>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => deleteGroupFn(grp.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* اسکرین‌شات‌های گروه */}
                  {ssInGroup.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {ssInGroup.map(ss => (
                        <div key={ss.id} className="relative group rounded-lg overflow-hidden border border-white/10">
                          <div className="aspect-video">
                            <StoredImage source={ss} alt={ss.label ?? ''} className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-1">
                            <p className="text-[9px] text-white truncate">{ss.timeframe ?? ss.label ?? '—'}</p>
                          </div>
                          <button
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 w-4 h-4 bg-red-500/80 rounded flex items-center justify-center"
                            onClick={async () => {
                              const newIds = ids.filter(i => i !== ss.id);
                              await updateGroup(grp.id, { screenshotIds: JSON.stringify(newIds) });
                              await updateChartScreenshot(ss.id, { groupId: null });
                              await qc.invalidateQueries({ queryKey: ['screenshot-groups', 'chart-screenshots'] });
                            }}>
                            <X className="w-2.5 h-2.5 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">هنوز اسکرین‌شاتی اضافه نشده</p>
                  )}
                  {/* افزودن اسکرین‌شات */}
                  {ungrouped.filter(s => !ids.includes(s.id)).length > 0 && (
                    <Select onValueChange={id => addToGroup(grp.id, id)}>
                      <SelectTrigger className="h-7 text-xs border-dashed"><SelectValue placeholder="+ افزودن اسکرین‌شات..." /></SelectTrigger>
                      <SelectContent>
                        {ungrouped.filter(s => !ids.includes(s.id)).slice(0, 20).map(ss => (
                          <SelectItem key={ss.id} value={ss.id} className="text-xs">
                            {ss.label ?? 'اسکرین‌شات'} {ss.symbol ? `· ${ss.symbol}` : ''} {ss.timeframe ? `· ${ss.timeframe}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB: PATTERNS (Visual Pattern Library)
// ════════════════════════════════════════════════════════════════════

function PatternsTab({ allTrades }: { allTrades: Trade[] }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', notes: '', commonMistakes: '', personalLessons: '' });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const qc = useQueryClient();

  const { data: patterns = [] } = useQuery<VisualPattern[]>({
    queryKey: ['visual-patterns'],
    queryFn: getAllPatterns,
  });
  const { data: allChartSS = [] } = useQuery<ChartScreenshot[]>({
    queryKey: ['chart-screenshots'],
    queryFn: getAllChartScreenshots,
  });

  const createPattern = async () => {
    if (!form.name.trim()) return;
    const tags = [...selectedTags, ...(customTag.trim() ? [customTag.trim()] : [])];
    await savePattern({
      name: form.name.trim(),
      description: form.description.trim() || null,
      patternTags: JSON.stringify(tags),
      screenshotIds: '[]',
      relatedTradeIds: '[]',
      relatedSetups: '[]',
      notes: form.notes.trim() || null,
      commonMistakes: form.commonMistakes.trim() || null,
      personalLessons: form.personalLessons.trim() || null,
    });
    await qc.invalidateQueries({ queryKey: ['visual-patterns'] });
    setShowNew(false);
    setForm({ name: '', description: '', notes: '', commonMistakes: '', personalLessons: '' });
    setSelectedTags([]);
    toast.success('الگو ایجاد شد');
  };

  const deletePatternFn = async (id: string) => {
    await deletePattern(id);
    await qc.invalidateQueries({ queryKey: ['visual-patterns'] });
    toast.success('الگو حذف شد');
  };

  const addSSToPattern = async (patternId: string, ssId: string) => {
    const p = patterns.find(x => x.id === patternId);
    if (!p) return;
    const ids = safeJson<string[]>(p.screenshotIds, []);
    if (!ids.includes(ssId)) {
      await updatePattern(patternId, { screenshotIds: JSON.stringify([...ids, ssId]) });
      await qc.invalidateQueries({ queryKey: ['visual-patterns'] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowNew(true)} className="gap-2"><Plus className="w-4 h-4" />الگوی جدید</Button>
        <p className="text-xs text-muted-foreground mr-auto">{patterns.length} الگوی شخصی</p>
      </div>

      {showNew && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">الگوی بصری جدید</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">نام الگو *</Label>
                <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="مثلاً: پولبک لندن پس از انبساط" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">توضیح کوتاه</Label>
                <Input className="h-8 text-sm" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="توضیح..." />
              </div>
              <div className="col-span-full space-y-1">
                <Label className="text-xs">تگ‌های الگو</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PATTERN_TAGS.map(t => (
                    <button key={t} onClick={() => setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                      className={cn('text-xs px-2 py-1 rounded-full border transition-colors',
                        selectedTags.includes(t) ? 'bg-violet-500/30 border-violet-500 text-violet-300' : 'border-white/15 text-muted-foreground')}>
                      {PATTERN_TAG_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">یادداشت</Label>
                <Textarea className="text-xs min-h-[60px]" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="توضیحات..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">درس‌های شخصی</Label>
                <Textarea className="text-xs min-h-[60px]" value={form.personalLessons} onChange={e => setForm(f => ({...f, personalLessons: e.target.value}))} placeholder="چه آموختم..." />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createPattern} className="gap-2"><Save className="w-3 h-3" />ایجاد</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>لغو</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {patterns.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">کتابخانه الگوی شخصی خالی است</p>
          <p className="text-xs mt-1">الگوهای بصری خود را با اسکرین‌شات‌ها و معاملات مرتبط ثبت کنید</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {patterns.map(p => {
            const tags = safeJson<string[]>(p.patternTags, []);
            const ssIds = safeJson<string[]>(p.screenshotIds, []);
            const tradeIds = safeJson<string[]>(p.relatedTradeIds, []);
            const relatedTrades = allTrades.filter(t => tradeIds.includes(t.id) && t.status === 'closed');
            const wins = relatedTrades.filter(t => t.result === 'win' || t.result === 'partial-win').length;
            const rVals = relatedTrades.map(t => t.rMultiple).filter((r): r is number => r !== null);
            const avgR = rVals.length > 0 ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null;
            const ssInPattern = allChartSS.filter(s => ssIds.includes(s.id));

            return (
              <Card key={p.id} className="border-white/8">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm">{p.name}</CardTitle>
                      {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300 shrink-0" onClick={() => deletePatternFn(p.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{PATTERN_TAG_LABELS[t] ?? t}</Badge>)}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* آمار */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-white/3">
                      <p className="text-base font-bold">{relatedTrades.length}</p>
                      <p className="text-muted-foreground">معامله</p>
                    </div>
                    <div className="p-2 rounded-lg bg-white/3">
                      <p className={cn('text-base font-bold', relatedTrades.length > 0 ? (wins / relatedTrades.length >= 0.5 ? 'text-green-400' : 'text-red-400') : '')}>
                        {relatedTrades.length > 0 ? `${Math.round((wins / relatedTrades.length) * 100)}٪` : '—'}
                      </p>
                      <p className="text-muted-foreground">نرخ برد</p>
                    </div>
                    <div className="p-2 rounded-lg bg-white/3">
                      <p className={cn('text-base font-bold', avgR !== null ? (avgR >= 0 ? 'text-green-400' : 'text-red-400') : '')}>
                        {avgR !== null ? `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—'}
                      </p>
                      <p className="text-muted-foreground">میانگین R</p>
                    </div>
                  </div>

                  {/* اسکرین‌شات‌های الگو */}
                  {ssInPattern.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {ssInPattern.slice(0, 6).map(ss => (
                        <div key={ss.id} className="aspect-video rounded overflow-hidden border border-white/10">
                          <StoredImage source={ss} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* افزودن اسکرین‌شات به الگو */}
                  {allChartSS.filter(s => !ssIds.includes(s.id)).length > 0 && (
                    <Select onValueChange={id => addSSToPattern(p.id, id)}>
                      <SelectTrigger className="h-7 text-xs border-dashed"><SelectValue placeholder="+ افزودن اسکرین‌شات..." /></SelectTrigger>
                      <SelectContent>
                        {allChartSS.filter(s => !ssIds.includes(s.id)).slice(0, 15).map(ss => (
                          <SelectItem key={ss.id} value={ss.id} className="text-xs">{ss.label ?? 'اسکرین‌شات'} {ss.symbol && `· ${ss.symbol}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {p.personalLessons && (
                    <div className="text-xs p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <p className="font-medium text-amber-400 mb-1">درس‌های شخصی:</p>
                      <p className="text-muted-foreground">{p.personalLessons}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB: COLLECTIONS
// ════════════════════════════════════════════════════════════════════

function CollectionsTab() {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: collections = [] } = useQuery<ScreenshotCollection[]>({
    queryKey: ['screenshot-collections'],
    queryFn: getAllCollections,
  });
  const { data: allChartSS = [] } = useQuery<ChartScreenshot[]>({
    queryKey: ['chart-screenshots'],
    queryFn: getAllChartScreenshots,
  });

  const createCollection = async () => {
    if (!newName.trim()) return;
    await saveCollection({
      name: newName.trim(), description: newDesc.trim() || null, icon: null, color: '#6366f1',
      screenshotIds: '[]', isDefault: false,
    });
    await qc.invalidateQueries({ queryKey: ['screenshot-collections'] });
    setShowNew(false); setNewName(''); setNewDesc('');
    toast.success('کالکشن ایجاد شد');
  };

  const activeCollection = selectedCol ? collections.find(c => c.id === selectedCol) : null;
  const colSSIds = activeCollection ? safeJson<string[]>(activeCollection.screenshotIds, []) : [];
  const colScreenshots = allChartSS.filter(s => colSSIds.includes(s.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowNew(true)} className="gap-2"><FolderPlus className="w-4 h-4" />کالکشن جدید</Button>
        <p className="text-xs text-muted-foreground mr-auto">{collections.length} کالکشن</p>
      </div>

      {showNew && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">نام کالکشن *</Label>
                <Input className="h-8 text-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder="مثلاً: بهترین معاملات" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">توضیح</Label>
                <Input className="h-8 text-sm" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="توضیح..." />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={createCollection} className="gap-2"><Save className="w-3 h-3" />ایجاد</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>لغو</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {collections.map(col => {
          const ids = safeJson<string[]>(col.screenshotIds, []);
          const preview = allChartSS.filter(s => ids.includes(s.id)).slice(0, 4);
          return (
            <Card key={col.id}
              className={cn('border cursor-pointer transition-all', selectedCol === col.id ? 'border-primary ring-1 ring-primary/30' : 'border-white/8 hover:border-white/20')}
              onClick={() => setSelectedCol(s => s === col.id ? null : col.id)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-sm font-medium truncate">{col.icon && `${col.icon} `}{col.name}</p>
                  {!col.isDefault && (
                    <button onClick={async e => {
                      e.stopPropagation();
                      try {
                        await deleteCollection(col.id);
                        await qc.invalidateQueries({ queryKey: ['screenshot-collections'] });
                        if (selectedCol === col.id) setSelectedCol(null);
                        toast.success('کالکشن حذف شد');
                      } catch { toast.error('کالکشن پیش‌فرض قابل حذف نیست'); }
                    }} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                  )}
                </div>
                {col.description && <p className="text-xs text-muted-foreground">{col.description}</p>}
                {preview.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1">
                    {preview.map(ss => (
                      <div key={ss.id} className="aspect-video rounded overflow-hidden bg-black/20">
                        <StoredImage source={ss} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="aspect-video rounded border border-dashed border-white/15 flex items-center justify-center text-xs text-muted-foreground">خالی</div>
                )}
                <p className="text-xs text-muted-foreground text-center">{ids.length} اسکرین‌شات</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* محتوای کالکشن انتخاب‌شده */}
      {activeCollection && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{activeCollection.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* افزودن */}
            {allChartSS.filter(s => !colSSIds.includes(s.id)).length > 0 && (
              <Select onValueChange={async id => {
                await addToCollection(activeCollection.id, id);
                await qc.invalidateQueries({ queryKey: ['screenshot-collections', 'chart-screenshots'] });
              }}>
                <SelectTrigger className="h-7 text-xs border-dashed"><SelectValue placeholder="+ افزودن اسکرین‌شات..." /></SelectTrigger>
                <SelectContent>
                  {allChartSS.filter(s => !colSSIds.includes(s.id)).slice(0, 20).map(ss => (
                    <SelectItem key={ss.id} value={ss.id} className="text-xs">{ss.label ?? 'اسکرین‌شات'} {ss.symbol && `· ${ss.symbol}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {colScreenshots.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">این کالکشن خالی است</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {colScreenshots.map(ss => (
                  <div key={ss.id} className="relative group rounded-lg overflow-hidden border border-white/10">
                    <div className="aspect-video">
                      <StoredImage source={ss} alt={ss.label ?? ''} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-1.5 text-xs">
                      <p className="truncate">{ss.label ?? 'اسکرین‌شات'}</p>
                      {ss.symbol && <p className="text-muted-foreground">{ss.symbol}</p>}
                    </div>
                    <button
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 w-5 h-5 bg-red-500/80 rounded flex items-center justify-center"
                      onClick={async () => {
                        await removeFromCollection(activeCollection.id, ss.id);
                        await qc.invalidateQueries({ queryKey: ['screenshot-collections', 'chart-screenshots'] });
                      }}>
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB: ANALYTICS
// ════════════════════════════════════════════════════════════════════

function AnalyticsTab({ allTrades }: { allTrades: Trade[] }) {
  const [analyticsSub, setAnalyticsSub] = useState<'performance' | 'sessions' | 'days' | 'mistakes' | 'strengths'>('performance');
  const [selectedTag, setSelectedTag] = useState<string>('');

  const { data: patternStats = [] } = useQuery<PatternPerformanceStats[]>({
    queryKey: ['pattern-performance', allTrades.length],
    queryFn: () => computePatternPerformance(allTrades),
    enabled: allTrades.length > 0,
  });

  const sessionStats = useMemo(() => {
    if (!selectedTag || allTrades.length === 0) return [];
    return computePatternBySession(allTrades, selectedTag);
  }, [selectedTag, allTrades]);

  const dayStats = useMemo(() => {
    if (!selectedTag || allTrades.length === 0) return [];
    return computePatternByDay(allTrades, selectedTag);
  }, [selectedTag, allTrades]);

  const mistakes = useMemo(() => detectVisualMistakes(allTrades), [allTrades]);
  const strengths = useMemo(() => detectVisualStrengths(allTrades), [allTrades]);

  const subTabs = [
    { id: 'performance', label: 'عملکرد الگوها' },
    { id: 'sessions', label: 'به تفکیک سشن' },
    { id: 'days', label: 'به تفکیک روز' },
    { id: 'mistakes', label: 'اشتباهات تکراری' },
    { id: 'strengths', label: 'نقاط قوت' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setAnalyticsSub(t.id as any)}
            className={cn('px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors',
              analyticsSub === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* عملکرد الگوها */}
      {analyticsSub === 'performance' && (
        <div className="space-y-3">
          {patternStats.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">داده کافی برای تحلیل عملکرد وجود ندارد</p>
              <p className="text-xs mt-1">معاملات را با تگ‌های الگو علامت‌گذاری کنید</p>
            </div>
          ) : (
            patternStats.map(stat => (
              <Card key={stat.patternTag} className="border-white/8">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">{stat.label}</p>
                      <p className="text-xs text-muted-foreground">{stat.tradeCount} معامله{stat.sampleWarning && ' — ⚠️ حجم نمونه کم'}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={cn('font-bold', stat.winRate >= 55 ? 'text-green-400' : stat.winRate >= 40 ? 'text-amber-400' : 'text-red-400')}>
                        {stat.winRate.toFixed(0)}٪
                      </span>
                      {stat.avgR !== null && (
                        <span className={cn('font-bold', stat.avgR >= 0 ? 'text-green-400' : 'text-red-400')}>
                          {stat.avgR >= 0 ? '+' : ''}{stat.avgR.toFixed(2)}R
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="text-green-400">{stat.winCount} برد</span>
                    <span className="text-red-400">{stat.lossCount} ضرر</span>
                    {stat.breakevenCount > 0 && <span>{stat.breakevenCount} سربه‌سر</span>}
                    {stat.maxLoss !== null && <span>بدترین: {stat.maxLoss.toFixed(2)}R</span>}
                  </div>
                  {/* نوار win rate */}
                  <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', stat.winRate >= 55 ? 'bg-green-500' : stat.winRate >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${stat.winRate}%` }} />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* به تفکیک سشن */}
      {analyticsSub === 'sessions' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">انتخاب الگو</Label>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="یک الگو انتخاب کنید..." /></SelectTrigger>
              <SelectContent>
                {patternStats.map(s => <SelectItem key={s.patternTag} value={s.patternTag} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!selectedTag ? (
            <p className="text-center text-sm text-muted-foreground py-8">یک الگو انتخاب کنید</p>
          ) : sessionStats.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">داده کافی برای این الگو و سشن وجود ندارد</p>
          ) : (
            <div className="space-y-2">
              {sessionStats.map(s => (
                <Card key={s.session} className="border-white/8">
                  <CardContent className="p-3 flex items-center gap-4">
                    <p className="text-sm font-medium w-32 shrink-0">{s.sessionLabel}</p>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', s.winRate >= 55 ? 'bg-green-500' : s.winRate >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                        style={{ width: `${s.winRate}%` }} />
                    </div>
                    <span className={cn('text-sm font-bold w-12 text-right', s.winRate >= 55 ? 'text-green-400' : s.winRate >= 40 ? 'text-amber-400' : 'text-red-400')}>
                      {s.winRate.toFixed(0)}٪
                    </span>
                    {s.avgR !== null && (
                      <span className={cn('text-sm w-16 text-right', s.avgR >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {s.avgR >= 0 ? '+' : ''}{s.avgR.toFixed(2)}R
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground w-12 text-right">({s.tradeCount})</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* به تفکیک روز */}
      {analyticsSub === 'days' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">انتخاب الگو</Label>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="یک الگو انتخاب کنید..." /></SelectTrigger>
              <SelectContent>
                {patternStats.map(s => <SelectItem key={s.patternTag} value={s.patternTag} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!selectedTag ? (
            <p className="text-center text-sm text-muted-foreground py-8">یک الگو انتخاب کنید</p>
          ) : dayStats.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">داده کافی برای این الگو و روزها وجود ندارد</p>
          ) : (
            <div className="space-y-2">
              {dayStats.map(d => (
                <Card key={d.dayOfWeek} className="border-white/8">
                  <CardContent className="p-3 flex items-center gap-4">
                    <p className="text-sm font-medium w-24 shrink-0">{d.dayLabel}</p>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', d.winRate >= 55 ? 'bg-green-500' : d.winRate >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                        style={{ width: `${d.winRate}%` }} />
                    </div>
                    <span className={cn('text-sm font-bold w-12 text-right', d.winRate >= 55 ? 'text-green-400' : d.winRate >= 40 ? 'text-amber-400' : 'text-red-400')}>
                      {d.winRate.toFixed(0)}٪
                    </span>
                    {d.avgR !== null && (
                      <span className={cn('text-sm w-16 text-right', d.avgR >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {d.avgR >= 0 ? '+' : ''}{d.avgR.toFixed(2)}R
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground w-12 text-right">({d.tradeCount})</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* اشتباهات تکراری */}
      {analyticsSub === 'mistakes' && (
        <RepeatedPatternsView patterns={mistakes} type="mistake" />
      )}

      {/* نقاط قوت */}
      {analyticsSub === 'strengths' && (
        <RepeatedPatternsView patterns={strengths} type="strength" />
      )}
    </div>
  );
}

function RepeatedPatternsView({ patterns, type }: { patterns: RepeatedPattern[]; type: 'mistake' | 'strength' }) {
  const icon = type === 'mistake' ? AlertTriangle : CheckCircle2;
  const Icon = icon;
  const emptyLabel = type === 'mistake' ? 'اشتباه تکراری بصری' : 'نقطه قوت بصری';
  const emptyNote = type === 'mistake' ? 'با ثبت بیشتر معاملات، الگوهای اشتباه شناسایی می‌شوند' : 'با ثبت بیشتر معاملات، نقاط قوت کشف می‌شوند';

  if (patterns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Icon className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p className="text-sm">هنوز {emptyLabel} شناسایی نشده</p>
        <p className="text-xs mt-1">{emptyNote}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {patterns.map((p, i) => (
        <Card key={i} className={cn('border', type === 'mistake' ? 'border-red-500/20' : 'border-green-500/20')}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                type === 'mistake' ? 'bg-red-500/20' : 'bg-green-500/20')}>
                <Icon className={cn('w-4 h-4', type === 'mistake' ? 'text-red-400' : 'text-green-400')} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-medium text-sm">{p.label}</p>
                  <Badge variant="secondary" className={cn('text-xs shrink-0',
                    p.severity === 'high' ? 'border-red-500/30 text-red-400' :
                    p.severity === 'medium' ? 'border-amber-500/30 text-amber-400' : '')}>
                    {p.severity === 'high' ? 'شدید' : p.severity === 'medium' ? 'متوسط' : 'کم'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{p.evidence}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span>{p.count} بار از {p.total} معامله</span>
                  <span className="text-muted-foreground">({p.rate.toFixed(0)}٪)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TAB: VISUAL PRE-TRADE BRIEFING
// ════════════════════════════════════════════════════════════════════

function BriefingTab({ allTrades }: { allTrades: Trade[] }) {
  const [symbol, setSymbol] = useState('');
  const [setup, setSetup] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [briefing, setBriefing] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generate = async () => {
    if (selectedTags.length === 0 && !symbol) return;
    setIsLoading(true);
    try {
      const result = await generateVisualBriefing(symbol || null, setup || null, selectedTags, allTrades);
      setBriefing(result);
    } catch (error) {
      console.error('[ScreenshotIntelligence] briefing generation failed', error);
      toast.error('تولید بریفینگ بصری انجام نشد');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-xl border border-white/8 bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-violet-400" />
          <h3 className="font-medium">بریفینگ بصری پیش از معامله</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          قبل از ورود به معامله، سابقه تصویری الگوهای مشابه خود را مرور کنید
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">نماد</Label>
            <Input className="h-8 text-sm" value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="مثلاً XAUUSD" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ستاپ</Label>
            <Input className="h-8 text-sm" value={setup} onChange={e => setSetup(e.target.value)} placeholder="نوع ستاپ..." />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">الگوهای موجود در این موقعیت:</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_PATTERN_TAGS.map(t => (
              <button key={t} onClick={() => toggleTag(t)}
                className={cn('text-xs px-2 py-1 rounded-full border transition-colors',
                  selectedTags.includes(t) ? 'bg-violet-500/30 border-violet-500 text-violet-300' : 'border-white/15 text-muted-foreground hover:border-white/30')}>
                {PATTERN_TAG_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={generate} disabled={isLoading || (selectedTags.length === 0 && !symbol)} className="w-full gap-2">
          <Sparkles className="w-4 h-4" />
          {isLoading ? 'در حال تحلیل...' : 'تولید بریفینگ بصری'}
        </Button>
      </div>

      {briefing && (
        <div className="space-y-4">
          {/* هشدار کیفیت داده */}
          {briefing.dataQualityNote && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/25 bg-amber-500/5 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {briefing.dataQualityNote}
            </div>
          )}

          {/* اسکرین‌شات‌های مشابه */}
          {briefing.similarScreenshots.length > 0 && (
            <Card className="border-white/8">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-violet-400" />
                  نمونه‌های تاریخی مشابه ({briefing.similarScreenshots.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {briefing.similarScreenshots.map((m: any) => (
                    <div key={m.screenshotId} className="rounded-lg border border-white/10 overflow-hidden">
                      <div className="aspect-video relative">
                        <StoredImage source={m} alt="" className="w-full h-full object-cover" />
                        <span className="absolute top-1 right-1 text-[10px] px-1 py-0.5 rounded bg-black/70 text-white">{m.matchScore}٪</span>
                      </div>
                      <div className="p-1.5 text-xs">
                        <p>{m.symbol ?? '—'} {m.timeframe && `· ${m.timeframe}`}</p>
                        {m.matchedTags.length > 0 && (
                          <p className="text-violet-300 text-[10px]">{m.matchedTags.slice(0,2).map((t: string) => PATTERN_TAG_LABELS[t] ?? t).join('، ')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* توزیع نتایج */}
          {briefing.outcomeDistribution && briefing.outcomeDistribution.total > 0 && (
            <Card className="border-white/8">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-400" />
                  توزیع نتایج تاریخی
                  {briefing.outcomeDistribution.sampleWarning && (
                    <Badge variant="secondary" className="text-[10px] border-amber-500/30 text-amber-400">حجم کم</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
                  {[
                    { label: 'کل معاملات', value: briefing.outcomeDistribution.total, className: '' },
                    { label: 'نرخ برد', value: `${briefing.outcomeDistribution.winRate.toFixed(0)}٪`, className: briefing.outcomeDistribution.winRate >= 55 ? 'text-green-400' : 'text-red-400' },
                    { label: 'میانگین R', value: briefing.outcomeDistribution.avgR !== null ? `${briefing.outcomeDistribution.avgR >= 0 ? '+' : ''}${briefing.outcomeDistribution.avgR.toFixed(2)}R` : '—', className: briefing.outcomeDistribution.avgR !== null && briefing.outcomeDistribution.avgR >= 0 ? 'text-green-400' : 'text-red-400' },
                    { label: 'بدترین ضرر', value: briefing.outcomeDistribution.maxLoss !== null ? `${briefing.outcomeDistribution.maxLoss.toFixed(2)}R` : '—', className: 'text-red-400' },
                  ].map(item => (
                    <div key={item.label} className="p-2 rounded-lg bg-white/3">
                      <p className={cn('text-lg font-bold', item.className)}>{item.value}</p>
                      <p className="text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  این آمار نشان‌دهنده تضمین نتیجه نیست — تریدر تصمیم نهایی را می‌گیرد
                </p>
              </CardContent>
            </Card>
          )}

          {/* اشتباهات شناخته‌شده */}
          {briefing.knownMistakes.length > 0 && (
            <Card className="border-red-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  اشتباهات شناخته‌شده برای این موقعیت
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {briefing.knownMistakes.slice(0, 3).map((m: RepeatedPattern, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-red-500/5 border border-red-500/15">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-300">{m.label}</p>
                      <p className="text-muted-foreground mt-0.5">{m.evidence}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="p-3 rounded-lg border border-white/8 bg-white/2 text-xs text-muted-foreground text-center">
            <Shield className="w-4 h-4 mx-auto mb-1 opacity-50" />
            این بریفینگ فقط اطلاعات تاریخی شخصی شما را نشان می‌دهد — نه پیش‌بینی بازار.
            تریدر همیشه تصمیم نهایی را می‌گیرد.
          </div>
        </div>
      )}
    </div>
  );
}
