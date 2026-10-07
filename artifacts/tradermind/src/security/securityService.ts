/**
 * سرویس امنیتی TraderMind
 *
 * از Web Crypto API استاندارد مرورگر استفاده می‌کند — بدون کتابخانه خارجی.
 * هرگز الگوریتم اختصاصی پیاده‌سازی نشده؛ همه توابع استاندارد W3C هستند.
 *
 * - PBKDF2 + SHA-256 → هش رمز عبور / PIN (ذخیره امن)
 * - AES-GCM 256-bit  → رمزگذاری داده و Backup
 * - SHA-256           → بررسی یکپارچگی Backup (Checksum)
 */

export interface HashedCredential {
  /** salt تصادفی ۱۶ بایتی به صورت hex */
  salt: string;
  /** نتیجه PBKDF2 به صورت hex — رمز اصلی قابل بازیابی نیست */
  hash: string;
  iterations: number;
}

// OWASP 2023 recommendation: 600,000 iterations for PBKDF2-HMAC-SHA256
// Existing stored credentials use their own `iterations` field for verification,
// so increasing this value here only affects newly created credentials — no migration needed.
const PBKDF2_ITERATIONS = 600_000;
const KEY_BITS = 256;

// ── ابزارهای داخلی ──────────────────────────────────────
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  // استفاده از ArrayBuffer صریح برای سازگاری با Web Crypto API
  const buffer = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < hex.length; i += 2)
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

function randomBytes(n: number): Uint8Array {
  // ایجاد ArrayBuffer صریح تا TypeScript راضی باشد
  const buffer = new ArrayBuffer(n);
  const view = new Uint8Array(buffer);
  crypto.getRandomValues(view);
  return view;
}

async function importPasswordKey(password: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    { name: 'PBKDF2' },
    false,
    usages,
  );
}

// ── سرویس اصلی ───────────────────────────────────────────
export const securityService = {
  /**
   * هش کردن رمز عبور/PIN با PBKDF2 + SHA-256
   * خروجی JSON-serializable است و می‌تواند در localStorage ذخیره شود.
   * رمز اصلی از روی این hash قابل بازیابی نیست.
   */
  async hashCredential(password: string): Promise<HashedCredential> {
    const salt = randomBytes(16);
    const keyMat = await importPasswordKey(password, ['deriveBits']);
    const hashBuf = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
      keyMat,
      KEY_BITS,
    );
    return { salt: toHex(salt.buffer as ArrayBuffer), hash: toHex(hashBuf), iterations: PBKDF2_ITERATIONS };
  },

  /**
   * تأیید رمز عبور در برابر hash ذخیره‌شده
   * زمان‌بندی ثابت نیست اما برای محیط Offline کافی است.
   */
  async verifyCredential(password: string, stored: HashedCredential): Promise<boolean> {
    try {
      const salt   = fromHex(stored.salt);
      const keyMat = await importPasswordKey(password, ['deriveBits']);
      const hashBuf = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations: stored.iterations },
        keyMat,
        KEY_BITS,
      );
      return toHex(hashBuf) === stored.hash;
    } catch {
      return false;
    }
  },

  /** مشتق کردن کلید AES-GCM از رمز عبور و salt */
  async _deriveAesKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
    const keyMat = await importPasswordKey(password, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
      keyMat,
      { name: 'AES-GCM', length: 256 },
      false,
      usage,
    );
  },

  /**
   * رمزگذاری یک رشته با AES-GCM
   * قالب خروجی (base64): salt(16B) + iv(12B) + ciphertext
   */
  async encrypt(plaintext: string, password: string): Promise<string> {
    const salt = randomBytes(16);
    const iv   = randomBytes(12);
    const key  = await this._deriveAesKey(password, salt, ['encrypt']);
    const ct   = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    );
    const out = new Uint8Array(28 + ct.byteLength);
    out.set(salt, 0);
    out.set(iv, 16);
    out.set(new Uint8Array(ct), 28);
    // btoa برای داده‌های باینری بزرگ
    let binary = '';
    out.forEach(b => (binary += String.fromCharCode(b)));
    return btoa(binary);
  },

  /** رمزگشایی — در صورت اشتباه بودن رمز، خطا پرتاب می‌شود */
  async decrypt(encB64: string, password: string): Promise<string> {
    const binary = atob(encB64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const salt = bytes.slice(0, 16);
    const iv   = bytes.slice(16, 28);
    const ct   = bytes.slice(28);
    const key  = await this._deriveAesKey(password, salt, ['decrypt']);
    const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  },

  /**
   * محاسبه SHA-256 از یک رشته
   * برای بررسی یکپارچگی Backup استفاده می‌شود.
   */
  async sha256(data: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return toHex(buf);
  },
};
