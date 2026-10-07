// راه‌اندازی محیط تست — باید قبل از هر چیز import شود
import 'fake-indexeddb/auto';

// اطمینان از اینکه Web Crypto API در محیط Node موجود است
// Node 20+ آن را به صورت global ارائه می‌دهد
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
