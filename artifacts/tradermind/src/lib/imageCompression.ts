/**
 * Image Compression Utility
 * فشرده‌سازی تصاویر قبل از ذخیره‌سازی
 * در آینده: قابل جایگزینی با Native Image API در Android
 */

export interface CompressOptions {
  maxWidth?: number;   // پیش‌فرض: 1280
  maxHeight?: number;  // پیش‌فرض: 1280
  quality?: number;    // 0-1، پیش‌فرض: 0.75
  mimeType?: string;   // پیش‌فرض: image/jpeg
}

export interface CompressResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export async function compressImage(
  file: File | Blob,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.75,
    mimeType = 'image/jpeg',
  } = options;

  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('فشرده‌سازی تصویر انجام نشد')); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({
            dataUrl: reader.result as string,
            blob,
            width,
            height,
            originalSize,
            compressedSize: blob.size,
          });
          reader.readAsDataURL(blob);
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('فایل تصویر نامعتبر است'));
    };
    img.src = url;
  });
}

/** تبدیل فایل به dataURL با فشرده‌سازی */
export async function fileToCompressedDataUrl(
  file: File,
  options?: CompressOptions
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('خواندن فایل انجام نشد'));
      reader.readAsDataURL(file);
    });
  }
  const result = await compressImage(file, options);
  return result.dataUrl;
}

/** گرفتن تصویر از دوربین یا گالری */
export function openImagePicker(options: {
  accept?: string;
  capture?: 'environment' | 'user';
  multiple?: boolean;
  onSelect: (files: File[]) => void;
}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = options.accept ?? 'image/*';
  if (options.capture) input.capture = options.capture;
  if (options.multiple) input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    if (files.length > 0) options.onSelect(files);
  };
  input.click();
}
