/**
 * صفحه قفل برنامه
 * در صورت فعال بودن قفل، روی تمام محتوا نمایش داده می‌شود.
 * دو حالت: PIN (صفحه‌کلید عددی) و Password (فیلد متنی)
 */

import { useState, useCallback, useEffect } from 'react';
import { ShieldCheck, Delete, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useSecurityStore } from '../security/useSecurityStore';
import { securityService } from '../security/securityService';
import { cn } from '../lib/utils';

// ── صفحه‌کلید عددی PIN ──────────────────────────────────
const PIN_LENGTH = 6;
const NUMPAD = ['۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '', '۰', '⌫'];
const FA_DIGIT: Record<string, string> = { '۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','۰':'0' };

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex gap-3 justify-center my-6">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-3.5 h-3.5 rounded-full border-2 transition-all duration-150',
            i < filled
              ? 'bg-primary border-primary scale-110'
              : 'border-muted-foreground/40',
          )}
        />
      ))}
    </div>
  );
}

function NumpadButton({ label, onPress }: { label: string; onPress: (v: string) => void }) {
  if (!label) return <div />;
  return (
    <button
      onClick={() => onPress(label)}
      className={cn(
        'h-16 w-full rounded-2xl text-xl font-semibold transition-all active:scale-95',
        label === '⌫'
          ? 'text-muted-foreground hover:bg-muted/60'
          : 'bg-card border border-border hover:bg-muted/60 active:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

// ── رابط PIN ─────────────────────────────────────────────
function PinUnlock({
  onUnlock, failedAttempts, onFail,
}: {
  onUnlock: () => void;
  failedAttempts: number;
  onFail: () => void;
}) {
  const { storedCredential, recordFailedAttempt } = useSecurityStore();
  const [pin, setPin] = useState('');
  const [shake, setShake]   = useState(false);
  const [error, setError]   = useState('');

  const doVerify = useCallback(async (fullPin: string) => {
    if (!storedCredential) return;
    const ok = await securityService.verifyCredential(fullPin, storedCredential);
    if (ok) {
      onUnlock();
    } else {
      recordFailedAttempt();
      setShake(true);
      setError('PIN اشتباه است');
      setPin('');
      setTimeout(() => setShake(false), 600);
      onFail();
    }
  }, [storedCredential, onUnlock, recordFailedAttempt, onFail]);

  const handleKey = (label: string) => {
    if (label === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    const digit = FA_DIGIT[label] ?? '';
    if (!digit) return;
    const next = pin + digit;
    if (next.length > PIN_LENGTH) return;
    setPin(next);
    setError('');
    if (next.length === PIN_LENGTH) doVerify(next);
  };

  return (
    <div className={cn('w-full max-w-xs mx-auto', shake && 'animate-[shake_0.5s_ease-in-out]')}>
      <PinDots filled={pin.length} />
      {error && (
        <p className="text-center text-sm text-destructive mb-2 animate-in fade-in">{error}</p>
      )}
      {failedAttempts >= 3 && (
        <p className="text-center text-xs text-amber-500 mb-3">
          {failedAttempts} بار اشتباه وارد شد
        </p>
      )}
      <div className="grid grid-cols-3 gap-3 px-4">
        {NUMPAD.map((k, i) => (
          <NumpadButton key={i} label={k} onPress={handleKey} />
        ))}
      </div>
    </div>
  );
}

// ── رابط Password ─────────────────────────────────────────
function PasswordUnlock({
  onUnlock, failedAttempts, onFail,
}: {
  onUnlock: () => void;
  failedAttempts: number;
  onFail: () => void;
}) {
  const { storedCredential, recordFailedAttempt } = useSecurityStore();
  const [pw, setPw]       = useState('');
  const [show, setShow]   = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  const handleUnlock = async () => {
    if (!pw || busy || !storedCredential) return;
    setBusy(true);
    const ok = await securityService.verifyCredential(pw, storedCredential);
    setBusy(false);
    if (ok) {
      onUnlock();
    } else {
      recordFailedAttempt();
      setError('رمز عبور اشتباه است');
      setPw('');
      onFail();
    }
  };

  return (
    <div className="w-full max-w-xs mx-auto space-y-4 px-4 mt-6">
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={pw}
          onChange={e => { setPw(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleUnlock()}
          placeholder="رمز عبور"
          className="pr-4 pl-10 text-center tracking-widest"
          autoFocus
          dir="ltr"
        />
        <button
          onClick={() => setShow(s => !s)}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      {failedAttempts >= 3 && (
        <p className="text-center text-xs text-amber-500">
          {failedAttempts} بار اشتباه وارد شد
        </p>
      )}
      <Button onClick={handleUnlock} disabled={!pw || busy} className="w-full">
        {busy ? 'در حال بررسی...' : 'باز کردن قفل'}
      </Button>
    </div>
  );
}

// ── صفحه قفل اصلی ────────────────────────────────────────
export function LockScreen() {
  const { credentialType, unlock, failedAttempts } = useSecurityStore();
  const [showForgot, setShowForgot] = useState(false);

  // جلوگیری از scroll پشت صفحه قفل
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleUnlock = () => {
    unlock();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-background"
      dir="rtl"
      // جلوگیری از context menu و select در صفحه قفل
      onContextMenu={e => e.preventDefault()}
    >
      {/* سربرگ */}
      <div className="flex flex-col items-center pt-16 pb-6 px-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">TraderMind</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {credentialType === 'pin' ? 'PIN خود را وارد کنید' : 'رمز عبور خود را وارد کنید'}
        </p>
      </div>

      {/* رابط باز کردن قفل */}
      <div className="flex-1 flex flex-col justify-start">
        {credentialType === 'pin' ? (
          <PinUnlock onUnlock={handleUnlock} failedAttempts={failedAttempts} onFail={() => {}} />
        ) : (
          <PasswordUnlock onUnlock={handleUnlock} failedAttempts={failedAttempts} onFail={() => {}} />
        )}
      </div>

      {/* پیوند فراموش کردن */}
      <div className="pb-12 px-6 text-center">
        <button
          onClick={() => setShowForgot(s => !s)}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {credentialType === 'pin' ? 'PIN را فراموش کردید؟' : 'رمز عبور را فراموش کردید؟'}
        </button>
        {showForgot && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-right animate-in fade-in">
            <div className="flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                <p className="font-semibold">بازیابی بدون رمز ممکن نیست</p>
                <p>
                  چون برنامه کاملاً آفلاین است، امکان بازیابی رمز از طریق ایمیل یا سرور وجود ندارد.
                </p>
                <p>
                  اگر نسخه پشتیبان دارید، می‌توانید برنامه را Reset کنید و داده‌ها را بازگردانید.
                </p>
                <p>
                  برای Reset، برنامه را در تنظیمات مرورگر Clear Site Data کنید.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
