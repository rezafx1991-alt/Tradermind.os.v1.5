import { useEffect, useState } from 'react';
import { FilePlus2, Film, Trash2 } from 'lucide-react';
import type { JournalMedia } from '../../db/database';

/**
 * پیش‌نمایش یک فایل ژورنال (Blob در IndexedDB). تصویر بندانگشتی، ویدیو/فایل با آیکن.
 * هیچ Base64ای در رکوردهای اصلی ذخیره نمی‌شود؛ URL فقط موقت و از Blob ساخته می‌شود.
 */
export function MediaThumb({
  item, onDelete, disabled,
}: { item: JournalMedia; onDelete?: () => void; disabled?: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(item.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [item.blob]);

  const isImage = item.mimeType.startsWith('image/');
  const isVideo = item.mimeType.startsWith('video/');
  return (
    <div className="group relative flex w-28 flex-col overflow-hidden rounded-lg border border-border/70 bg-muted/20" data-testid={`media-thumb-${item.id}`}>
      <a href={url || undefined} target="_blank" rel="noreferrer" download={isImage ? undefined : item.fileName} className="block">
        {isImage && url ? (
          <img src={url} alt={item.caption || item.fileName} className="h-20 w-full object-cover" />
        ) : (
          <span className="grid h-20 w-full place-items-center text-muted-foreground">
            {isVideo ? <Film className="h-6 w-6" /> : <FilePlus2 className="h-6 w-6" />}
          </span>
        )}
      </a>
      <span className="truncate px-2 py-1 text-[10px] text-muted-foreground" title={item.fileName}>{item.caption || item.fileName}</span>
      {onDelete && (
        <button
          type="button" onClick={onDelete} disabled={disabled} aria-label="حذف فایل"
          className="absolute left-1 top-1 rounded-md bg-background/90 p-1 text-destructive opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100"
          data-testid={`button-delete-media-${item.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** ورودی چندفایلی (تصویر/ویدیو) که فایل‌های انتخاب‌شده را به والد می‌دهد */
export function FilePicker({
  label = 'افزودن تصویر یا ویدیو', files, onChange, testId,
}: { label?: string; files: File[]; onChange: (files: File[]) => void; testId?: string }) {
  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted">
        <FilePlus2 className="h-4 w-4" /> {label}
        <input
          type="file" multiple accept="image/*,video/*" className="sr-only" data-testid={testId}
          onChange={event => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length) onChange([...files, ...picked]);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-[11px]">
              <span className="max-w-40 truncate">{file.name}</span>
              <button type="button" aria-label="حذف از لیست" className="text-destructive" onClick={() => onChange(files.filter((_, i) => i !== index))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
