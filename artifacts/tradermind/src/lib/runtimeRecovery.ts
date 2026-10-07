import { errorService } from '../services/errorService';

const CHUNK_RECOVERY_KEY = 'tradermind:chunk-recovery-attempted';

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
}

export function clearRuntimeCaches(): void {
  if (typeof window === 'undefined') return;

  void navigator.serviceWorker?.getRegistrations()
    .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
    .catch(error => errorService.logWarning('RuntimeRecovery', 'پاک‌سازی service worker ناموفق بود', { error: String(error) }));

  if ('caches' in window) {
    void caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .catch(error => errorService.logWarning('RuntimeRecovery', 'پاک‌سازی cache ناموفق بود', { error: String(error) }));
  }
}

/**
 * A stale PWA cache can mix a new index.html with old lazy chunks. Recover
 * once per tab, then leave the error visible instead of creating a reload loop.
 */
export function recoverFromChunkLoadError(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (sessionStorage.getItem(CHUNK_RECOVERY_KEY) === '1') return false;
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, '1');
  } catch {
    // Private browsing can deny sessionStorage. A reload is still useful.
  }

  clearRuntimeCaches();
  window.setTimeout(() => window.location.reload(), 50);
  return true;
}

export function clearChunkRecoveryMarker(): void {
  try {
    sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}