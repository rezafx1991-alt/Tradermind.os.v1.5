import { useEffect, useMemo, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Download, ExternalLink, ImageOff, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export type StoredImageSource =
  | string
  | Blob
  | { dataUrl?: string | null; imageBlob?: Blob | null }
  | null
  | undefined;

function unpackSource(source: StoredImageSource): { dataUrl: string; blob: Blob | null } {
  if (typeof source === 'string') return { dataUrl: source, blob: null };
  if (source instanceof Blob) return { dataUrl: '', blob: source };
  if (source) return { dataUrl: source.dataUrl ?? '', blob: source.imageBlob ?? null };
  return { dataUrl: '', blob: null };
}

/**
 * Resolves both legacy Base64 images and the Blob-backed screenshot records
 * introduced in database v21. The object URL is revoked whenever the Blob
 * changes or the component unmounts.
 */
export function useStoredImageUrl(source: StoredImageSource): string | null {
  const { dataUrl, blob } = useMemo(() => unpackSource(source), [source]);
  const [url, setUrl] = useState<string | null>(dataUrl || null);

  useEffect(() => {
    if (!blob) {
      setUrl(dataUrl || null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(current => current === objectUrl ? null : current);
    };
  }, [blob, dataUrl]);

  return url;
}

async function sourceToBlob(source: StoredImageSource, resolvedUrl: string): Promise<Blob> {
  const { dataUrl, blob } = unpackSource(source);
  if (blob) return blob;
  const response = await fetch(dataUrl || resolvedUrl);
  if (!response.ok) throw new Error('تصویر قابل خواندن نیست');
  return response.blob();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خواندن تصویر انجام نشد'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.readAsDataURL(blob);
  });
}

function extensionFor(blob: Blob, fallback = 'webp'): string {
  const type = blob.type.split('/')[1]?.toLowerCase();
  return type === 'jpeg' ? 'jpg' : type || fallback;
}

async function downloadStoredImage(source: StoredImageSource, resolvedUrl: string, filename: string) {
  const blob = await sourceToBlob(source, resolvedUrl);
  const safeFilename = filename.replace(/[\\/:*?"<>|]+/g, '-').trim() || `tradermind-image.${extensionFor(blob)}`;

  if (Capacitor.isNativePlatform()) {
    const path = `TraderMind/${Date.now()}-${safeFilename}`;
    await Filesystem.writeFile({
      path,
      data: await blobToBase64(blob),
      directory: Directory.Documents,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
    await Share.share({
      title: 'تصویر TraderMind',
      text: 'تصویر ذخیره‌شده در TraderMind',
      url: uri,
      dialogTitle: 'ذخیره یا اشتراک‌گذاری تصویر',
    });
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = safeFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

interface StoredImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  source: StoredImageSource;
  enableViewer?: boolean;
  showDownload?: boolean;
  filename?: string;
  viewerTitle?: string;
  fallback?: ReactNode;
}

/**
 * Image element for persisted app images. It renders a clear missing-image
 * state instead of silently showing a broken/empty image.
 */
export default function StoredImage({
  source,
  enableViewer = false,
  showDownload = false,
  filename = 'tradermind-image',
  viewerTitle,
  fallback,
  className,
  alt = '',
  ...imgProps
}: StoredImageProps) {
  const url = useStoredImageUrl(source);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const displayName = viewerTitle || alt || 'تصویر TraderMind';

  useEffect(() => setError(false), [url]);

  const image = url && !error ? (
    <img
      {...imgProps}
      src={url}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  ) : (
    fallback ?? (
      <div className={cn('flex h-full min-h-16 w-full items-center justify-center gap-2 bg-muted/20 text-xs text-muted-foreground', className)}>
        <ImageOff className="h-4 w-4 shrink-0" />
        تصویر در دسترس نیست
      </div>
    )
  );

  const download = async () => {
    if (!url || downloading) return;
    setDownloading(true);
    try {
      await downloadStoredImage(source, url, `${filename}.${extensionFor(await sourceToBlob(source, url))}`);
    } catch {
      toast.error('ذخیره یا اشتراک‌گذاری تصویر انجام نشد');
    } finally {
      setDownloading(false);
    }
  };

  if (!enableViewer || !url || error) return image;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="relative block h-full w-full cursor-zoom-in text-left"
          aria-label={`نمایش ${displayName}`}
        >
          {image}
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/70 p-1.5 text-white opacity-80">
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl border-white/10 bg-black/95 p-2">
        <div className="space-y-2">
          <div className="max-h-[78vh] overflow-auto rounded-lg">
            <img src={url} alt={alt} className="mx-auto h-auto max-h-[78vh] w-full object-contain" />
          </div>
          <div className="flex items-center gap-2 px-1">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{displayName}</p>
            {showDownload && (
              <Button type="button" size="sm" variant="outline" className="gap-2" onClick={download} disabled={downloading}>
                <Download className="h-4 w-4" />
                {downloading ? 'در حال آماده‌سازی...' : 'دانلود'}
              </Button>
            )}
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
              <ExternalLink className="h-4 w-4" />
              باز کردن
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}