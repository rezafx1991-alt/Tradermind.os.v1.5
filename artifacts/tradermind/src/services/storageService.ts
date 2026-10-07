/**
 * storageService.ts — PART 3
 * سرویس نظارت بر حافظه — Storage Monitoring
 * استفاده از navigator.storage.estimate() برای گزارش دقیق
 */

import { db } from '../db/database';

// ── نتایج تخمین ────────────────────────────────────────────────────────────

export interface StorageInfo {
  usage: number;        // بایت مصرفی
  quota: number;        // حداکثر مجاز
  percentage: number;   // درصد مصرف (0-100)
  available: number;    // بایت آزاد
  level: 'normal' | 'warning' | 'critical';
}

export interface ScreenshotStorageEstimate {
  count: number;
  estimatedBytes: number;
  averageBytesPerScreenshot: number;
}

// ── کمک‌ها ──────────────────────────────────────────────────────────────────

/** تبدیل بایت به رشته خوانا */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ── سرویس اصلی ──────────────────────────────────────────────────────────────

export const storageMonitorService = {

  /**
   * دریافت مقدار حافظه مصرفی (بایت)
   */
  async getStorageUsage(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const est = await navigator.storage.estimate();
      return est.usage ?? 0;
    }
    // fallback از localStorage
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    return total * 2;
  },

  /**
   * دریافت سقف حافظه مجاز (بایت)
   */
  async getStorageQuota(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const est = await navigator.storage.estimate();
      return est.quota ?? 0;
    }
    return 0;
  },

  /**
   * دریافت درصد مصرف حافظه (0-100)
   */
  async getStoragePercentage(): Promise<number> {
    const [usage, quota] = await Promise.all([
      storageMonitorService.getStorageUsage(),
      storageMonitorService.getStorageQuota(),
    ]);
    if (quota === 0) return 0;
    return Math.min(100, (usage / quota) * 100);
  },

  /**
   * دریافت اطلاعات کامل storage
   */
  async getStorageInfo(): Promise<StorageInfo> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const est = await navigator.storage.estimate();
      const usage = est.usage ?? 0;
      const quota = est.quota ?? 0;
      const percentage = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;
      const available = Math.max(0, quota - usage);
      const level: StorageInfo['level'] =
        percentage >= 90 ? 'critical' :
        percentage >= 70 ? 'warning' : 'normal';
      return { usage, quota, percentage, available, level };
    }
    return { usage: 0, quota: 0, percentage: 0, available: 0, level: 'normal' };
  },

  /**
   * تخمین حجم اشغال‌شده توسط screenshot ها
   */
  async getScreenshotStorageEstimate(): Promise<ScreenshotStorageEstimate> {
    const screenshots = await db.chartScreenshots.toArray();
    const count = screenshots.length;

    let totalBytes = 0;
    for (const ss of screenshots) {
      // Blob
      if (ss.imageBlob) {
        totalBytes += ss.imageBlob.size;
      } else if (ss.dataUrl) {
        // تخمین از Base64 (فقط داده‌های واقعی، نه overhead)
        const base64Part = ss.dataUrl.split(',')[1] ?? ss.dataUrl;
        totalBytes += Math.floor(base64Part.length * 0.75);
      } else if (ss.fileSize) {
        totalBytes += ss.fileSize;
      }
    }

    return {
      count,
      estimatedBytes: totalBytes,
      averageBytesPerScreenshot: count > 0 ? Math.floor(totalBytes / count) : 0,
    };
  },
};

// ── Storage Abstraction (backward-compatible) ───────────────────────────────

export interface IKeyValueStore {
  get<T = string>(key: string): T | null;
  set<T = string>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
  keys(): string[];
}

class LocalStorageAdapter implements IKeyValueStore {
  private prefix: string;

  constructor(prefix = 'tradermind') {
    this.prefix = prefix;
  }

  private k(key: string) { return `${this.prefix}-${key}`; }

  get<T = string>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.k(key));
      if (raw === null) return null;
      try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
    } catch { return null; }
  }

  set<T = string>(key: string, value: T): void {
    try {
      localStorage.setItem(this.k(key), typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'QuotaExceededError') {
        throw new Error('Storage is full. Please remove old screenshots or export backup.');
      }
      throw e;
    }
  }

  remove(key: string): void {
    try { localStorage.removeItem(this.k(key)); } catch { /* ignore */ }
  }

  clear(): void {
    const toRemove = this.keys();
    toRemove.forEach(k => localStorage.removeItem(this.k(k)));
  }

  keys(): string[] {
    const prefix = this.k('');
    return Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length));
  }
}

export const kvStore: IKeyValueStore = new LocalStorageAdapter('tradermind');

export const appStorage = {
  getLastBackupDate: (): string | null => kvStore.get('last-backup'),
  setLastBackupDate: (iso: string) => kvStore.set('last-backup', iso),
  getBackupHistory: (): unknown[] => kvStore.get<unknown[]>('backup-history') ?? [],
  setBackupHistory: (history: unknown[]) => kvStore.set('backup-history', history),
  clearCache: () => {
    kvStore.remove('last-backup');
    kvStore.remove('backup-history');
  },
  estimateSize: async (): Promise<number> => storageMonitorService.getStorageUsage(),
};
