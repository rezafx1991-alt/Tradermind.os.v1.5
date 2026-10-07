/**
 * Store مدیریت امنیت و قفل برنامه
 * از Zustand + persist استفاده می‌کند.
 *
 * چه چیزی ذخیره می‌شود: تنظیمات (isEnabled, credential, autoLockMinutes)
 * چه چیزی ذخیره نمی‌شود: isLocked, failedAttempts (وضعیت جاری)
 *
 * قانون قفل‌شدن:
 * - اگر برنامه بسته و دوباره باز شود و isEnabled=true باشد → قفل
 * - اگر autoLockMinutes=0 → به محض رفتن به Background قفل
 * - اگر autoLockMinutes>0 → بعد از X دقیقه بی‌فعالی قفل
 * - اگر autoLockMinutes=-1 → هرگز قفل نمی‌شود (تا زمان بستن برنامه)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HashedCredential } from './securityService';

export type AutoLockOption = -1 | 0 | 1 | 5 | 15;

export const AUTO_LOCK_LABELS: Record<number, string> = {
  [-1]: 'هرگز',
  [0]:  'بلافاصله',
  [1]:  'بعد از ۱ دقیقه',
  [5]:  'بعد از ۵ دقیقه',
  [15]: 'بعد از ۱۵ دقیقه',
};

// ── نوع‌ها ──────────────────────────────────────────────
interface PersistedState {
  isEnabled: boolean;
  credentialType: 'pin' | 'password';
  storedCredential: HashedCredential | null;
  autoLockMinutes: AutoLockOption;
  encryptedBackupEnabled: boolean;
  lastActiveAt: number;
}

interface TransientState {
  isLocked: boolean;
  failedAttempts: number;
}

interface Actions {
  /** فعال کردن قفل برنامه با اعتبارنامه جدید */
  enableSecurity(cred: HashedCredential, type: 'pin' | 'password'): void;
  /** غیرفعال کردن کامل قفل */
  disableSecurity(): void;
  /** تغییر PIN یا رمز عبور (قفل باید فعال باشد) */
  changeCredential(cred: HashedCredential, type: 'pin' | 'password'): void;
  setAutoLockMinutes(v: AutoLockOption): void;
  setEncryptedBackup(v: boolean): void;
  lock(): void;
  unlock(): void;
  recordFailedAttempt(): void;
  resetFailedAttempts(): void;
  /** به‌روزرسانی آخرین زمان فعالیت کاربر */
  touchActivity(): void;
}

type SecurityStore = PersistedState & TransientState & Actions;

// ── مقادیر پیش‌فرض ──────────────────────────────────────
const defaultPersisted: PersistedState = {
  isEnabled: false,
  credentialType: 'pin',
  storedCredential: null,
  autoLockMinutes: 5,
  encryptedBackupEnabled: false,
  lastActiveAt: Date.now(),
};

// ── Store ────────────────────────────────────────────────
export const useSecurityStore = create<SecurityStore>()(
  persist(
    (set, get) => ({
      ...defaultPersisted,
      isLocked: false,
      failedAttempts: 0,

      enableSecurity: (cred, type) =>
        set({ isEnabled: true, storedCredential: cred, credentialType: type, isLocked: false, failedAttempts: 0 }),

      disableSecurity: () =>
        set({ isEnabled: false, storedCredential: null, isLocked: false, failedAttempts: 0 }),

      changeCredential: (cred, type) =>
        set({ storedCredential: cred, credentialType: type, failedAttempts: 0 }),

      setAutoLockMinutes: (v) => set({ autoLockMinutes: v }),
      setEncryptedBackup: (v) => set({ encryptedBackupEnabled: v }),

      lock: () => {
        if (get().isEnabled) set({ isLocked: true });
      },

      unlock: () =>
        set({ isLocked: false, failedAttempts: 0, lastActiveAt: Date.now() }),

      recordFailedAttempt: () =>
        set((s) => ({ failedAttempts: s.failedAttempts + 1 })),

      resetFailedAttempts: () => set({ failedAttempts: 0 }),

      touchActivity: () => set({ lastActiveAt: Date.now() }),
    }),
    {
      name: 'tradermind-security',
      // فقط تنظیمات ذخیره می‌شوند — وضعیت قفل و خطا ذخیره نمی‌شوند
      partialize: (state): PersistedState => ({
        isEnabled: state.isEnabled,
        credentialType: state.credentialType,
        storedCredential: state.storedCredential,
        autoLockMinutes: state.autoLockMinutes,
        encryptedBackupEnabled: state.encryptedBackupEnabled,
        lastActiveAt: state.lastActiveAt,
      }),
    }
  )
);
