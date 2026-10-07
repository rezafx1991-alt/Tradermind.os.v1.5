/**
 * AnnotationCanvas — Prompt 15, Section 12
 * ────────────────────────────────────────
 * Canvas overlay for annotating chart screenshots.
 * Annotations are stored as structured data; the original image is untouched.
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import {
  ScreenshotAnnotation,
  AnnotationType,
  AnnotationPoint,
  ANNOTATION_LABELS,
} from '../types/screenshot';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  MapPin, Minus, Minus as MinusIcon, Square, Crosshair, X, RotateCcw, Eye, EyeOff
} from 'lucide-react';

const ANNOTATION_COLORS: Record<string, string> = {
  entry: '#22c55e',
  'stop-loss': '#ef4444',
  'take-profit': '#3b82f6',
  support: '#10b981',
  resistance: '#f59e0b',
  liquidity: '#a855f7',
  fibonacci: '#ec4899',
  'impulse-start': '#06b6d4',
  'impulse-end': '#0891b2',
  'range-high': '#f59e0b',
  'range-low': '#f59e0b',
  'important-candle': '#f97316',
  zone: 'rgba(251,191,36,0.3)',
  arrow: '#94a3b8',
  label: '#e2e8f0',
};

interface Props {
  imageDataUrl: string;
  annotations: ScreenshotAnnotation[];
  onChange: (annotations: ScreenshotAnnotation[]) => void;
  readOnly?: boolean;
}

type DrawMode = 'point' | 'line' | 'zone';

const MODE_FOR_TYPE: Record<AnnotationType, DrawMode> = {
  entry: 'point', 'stop-loss': 'point', 'take-profit': 'point',
  support: 'line', resistance: 'line', liquidity: 'line',
  fibonacci: 'line', 'impulse-start': 'point', 'impulse-end': 'point',
  'range-high': 'line', 'range-low': 'line', 'important-candle': 'point',
  zone: 'zone', arrow: 'line', label: 'point',
};

function uid(): string {
  return crypto.randomUUID();
}

function AnnotationCanvas({ imageDataUrl, annotations, onChange, readOnly = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [selectedType, setSelectedType] = useState<AnnotationType>('entry');
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<AnnotationPoint | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; pointIndex: number | null; last: AnnotationPoint } | null>(null);

  // Load image onto canvas background
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      renderCanvas();
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  useEffect(() => {
    renderCanvas();
  }, [annotations, showAnnotations, hoveredId, selectedId]);

  const getRelativePoint = (e: React.MouseEvent<HTMLCanvasElement>): AnnotationPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (!showAnnotations) return;

    for (const ann of annotations) {
      drawAnnotation(ctx, ann, w, h, ann.id === hoveredId);
    }
  }, [annotations, showAnnotations, hoveredId]);

  function drawAnnotation(
    ctx: CanvasRenderingContext2D,
    ann: ScreenshotAnnotation,
    w: number,
    h: number,
    hovered: boolean,
  ) {
    const color = ann.color;
    const mode = MODE_FOR_TYPE[ann.type];
    const active = ann.id === selectedId;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = hovered || active ? 3 : 2;
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'top';

    if (mode === 'point' && ann.points.length >= 1) {
      const p = ann.points[0];
      const px = p.x * w;
      const py = p.y * h;

      // Circle marker
      ctx.beginPath();
      ctx.arc(px, py, hovered ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = color + 'aa';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#fff';
      ctx.fillText(ann.label, px + 10, py - 6);
    } else if (mode === 'line' && ann.points.length >= 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.strokeStyle = color;
      ctx.stroke();

      // Label at midpoint
      const mx = ((p1.x + p2.x) / 2) * w;
      const my = ((p1.y + p2.y) / 2) * h;
      ctx.fillStyle = color;
      ctx.fillText(ann.label, mx + 4, my - 14);
    } else if (mode === 'zone' && ann.points.length >= 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      const x = Math.min(p1.x, p2.x) * w;
      const y = Math.min(p1.y, p2.y) * h;
      const rw = Math.abs(p2.x - p1.x) * w;
      const rh = Math.abs(p2.y - p1.y) * h;

      ctx.fillStyle = color;
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeStyle = ann.color.replace('0.3', '1');
      ctx.strokeRect(x, y, rw, rh);
      ctx.fillStyle = '#fff';
      ctx.fillText(ann.label, x + 4, y + 4);
    }

    if (active) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (const point of ann.points) {
        ctx.beginPath();
        ctx.arc(point.x * w, point.y * h, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  const clampPoint = (point: AnnotationPoint): AnnotationPoint => ({
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  });

  const distance = (a: AnnotationPoint, b: AnnotationPoint) => Math.hypot(a.x - b.x, a.y - b.y);

  const distanceToSegment = (point: AnnotationPoint, a: AnnotationPoint, b: AnnotationPoint) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return distance(point, a);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
  };

  const findHitAnnotation = (point: AnnotationPoint) => {
    const tolerance = 0.035;
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
      const ann = annotations[index];
      const mode = MODE_FOR_TYPE[ann.type];
      const pointIndex = ann.points.findIndex(p => distance(point, p) <= tolerance);
      if (pointIndex >= 0) return { id: ann.id, pointIndex };
      if (mode === 'line' && ann.points.length >= 2 && distanceToSegment(point, ann.points[0], ann.points[1]) <= tolerance) {
        return { id: ann.id, pointIndex: null };
      }
      if (mode === 'zone' && ann.points.length >= 2) {
        const minX = Math.min(ann.points[0].x, ann.points[1].x);
        const maxX = Math.max(ann.points[0].x, ann.points[1].x);
        const minY = Math.min(ann.points[0].y, ann.points[1].y);
        const maxY = Math.max(ann.points[0].y, ann.points[1].y);
        if (point.x >= minX - tolerance && point.x <= maxX + tolerance &&
          point.y >= minY - tolerance && point.y <= maxY + tolerance) {
          return { id: ann.id, pointIndex: null };
        }
      }
    }
    return null;
  };

  const beginDrag = (point: AnnotationPoint) => {
    const hit = findHitAnnotation(point);
    if (!hit) return false;
    setSelectedId(hit.id);
    dragRef.current = { ...hit, last: point };
    return true;
  };

  const moveSelected = (point: AnnotationPoint) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = point.x - drag.last.x;
    const dy = point.y - drag.last.y;
    onChange(annotations.map(annotation => {
      if (annotation.id !== drag.id) return annotation;
      const points = annotation.points.map((item, index) => {
        if (drag.pointIndex !== null && index !== drag.pointIndex) return item;
        return clampPoint({ x: item.x + dx, y: item.y + dy });
      });
      return { ...annotation, points };
    }));
    drag.last = point;
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const pt = getRelativePoint(e);
    if (beginDrag(pt)) return;
    const mode = MODE_FOR_TYPE[selectedType];

    if (mode === 'point') {
      // Add immediately on click
      const ann: ScreenshotAnnotation = {
        id: uid(),
        type: selectedType,
        label: ANNOTATION_LABELS[selectedType],
        points: [pt],
        color: ANNOTATION_COLORS[selectedType] ?? '#94a3b8',
        createdAt: Date.now(),
      };
      onChange([...annotations, ann]);
    } else {
      setIsDrawing(true);
      setStartPoint(pt);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      endDrag();
      return;
    }
    if (!isDrawing || !startPoint || readOnly) return;
    const pt = getRelativePoint(e);
    const mode = MODE_FOR_TYPE[selectedType];

    if (mode === 'line' || mode === 'zone') {
      const ann: ScreenshotAnnotation = {
        id: uid(),
        type: selectedType,
        label: ANNOTATION_LABELS[selectedType],
        points: [startPoint, pt],
        color: ANNOTATION_COLORS[selectedType] ?? '#94a3b8',
        createdAt: Date.now(),
      };
      onChange([...annotations, ann]);
    }

    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!readOnly && dragRef.current) moveSelected(getRelativePoint(e));
  };

  // ── Touch support (mobile) ────────────────────────────────────────
  const getTouchPoint = (e: React.TouchEvent<HTMLCanvasElement>): AnnotationPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const touch = e.changedTouches[0];
    return {
      x: (touch.clientX - rect.left) / rect.width,
      y: (touch.clientY - rect.top) / rect.height,
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // prevent scroll while drawing
    if (readOnly) return;
    const pt = getTouchPoint(e);
    if (beginDrag(pt)) return;
    const mode = MODE_FOR_TYPE[selectedType];

    if (mode === 'point') {
      const ann: ScreenshotAnnotation = {
        id: uid(),
        type: selectedType,
        label: ANNOTATION_LABELS[selectedType],
        points: [pt],
        color: ANNOTATION_COLORS[selectedType] ?? '#94a3b8',
        createdAt: Date.now(),
      };
      onChange([...annotations, ann]);
    } else {
      setIsDrawing(true);
      setStartPoint(pt);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (dragRef.current) {
      moveSelected(getTouchPoint(e));
      endDrag();
      return;
    }
    if (!isDrawing || !startPoint || readOnly) return;
    const pt = getTouchPoint(e);
    const mode = MODE_FOR_TYPE[selectedType];

    if (mode === 'line' || mode === 'zone') {
      const ann: ScreenshotAnnotation = {
        id: uid(),
        type: selectedType,
        label: ANNOTATION_LABELS[selectedType],
        points: [startPoint, pt],
        color: ANNOTATION_COLORS[selectedType] ?? '#94a3b8',
        createdAt: Date.now(),
      };
      onChange([...annotations, ann]);
    }

    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!readOnly && dragRef.current) moveSelected(getTouchPoint(e));
  };

  const removeAnnotation = (id: string) => {
    onChange(annotations.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedType} onValueChange={v => setSelectedType(v as AnnotationType)}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ANNOTATION_LABELS) as AnnotationType[]).map(t => (
                <SelectItem key={t} value={t} className="text-xs">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: ANNOTATION_COLORS[t] ?? '#94a3b8' }}
                    />
                    {ANNOTATION_LABELS[t]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1 mr-auto">
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowAnnotations(v => !v)}
              title={showAnnotations ? 'پنهان' : 'نمایش'}
            >
              {showAnnotations ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll} title="پاک کردن همه">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="relative rounded-lg overflow-hidden border border-white/10">
        <canvas
          ref={canvasRef}
          width={1000}
          height={600}
          className="w-full h-auto cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: readOnly ? 'default' : 'crosshair', touchAction: 'none' }}
        />
        {!readOnly && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
            {MODE_FOR_TYPE[selectedType] === 'point'
              ? 'کلیک کنید'
              : 'بکشید تا خط/ناحیه ایجاد شود'}
          </div>
        )}
      </div>

      {/* Annotation list */}
      {annotations.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {annotations.map(ann => (
            <div
              key={ann.id}
              className={`flex items-center justify-between px-2 py-1 rounded text-xs
                          ${selectedId === ann.id ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-white/5'}
                         hover:bg-white/10 transition-colors cursor-pointer`}
              onClick={() => setSelectedId(ann.id)}
              onMouseEnter={() => setHoveredId(ann.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: ann.color }}
                />
                {ann.label}
              </span>
              {!readOnly && (
                <button
                  onClick={() => removeAnnotation(ann.id)}
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && selectedId && (() => {
        const selected = annotations.find(annotation => annotation.id === selectedId);
        if (!selected) return null;
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
            <span className="text-xs text-muted-foreground">ویرایش حاشیه‌نویسی:</span>
            <input
              value={selected.label}
              onChange={e => onChange(annotations.map(annotation =>
                annotation.id === selected.id ? { ...annotation, label: e.target.value } : annotation
              ))}
              className="h-7 min-w-36 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              aria-label="عنوان حاشیه‌نویسی"
            />
            <input
              type="color"
              value={selected.color.startsWith('#') ? selected.color.slice(0, 7) : '#f59e0b'}
              onChange={e => onChange(annotations.map(annotation =>
                annotation.id === selected.id ? { ...annotation, color: e.target.value } : annotation
              ))}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-background p-0.5"
              aria-label="رنگ حاشیه‌نویسی"
            />
            <span className="text-[10px] text-muted-foreground">دستگیره‌ها یا خود شکل را بکشید</span>
          </div>
        );
      })()}
    </div>
  );
}

export default memo(AnnotationCanvas);
