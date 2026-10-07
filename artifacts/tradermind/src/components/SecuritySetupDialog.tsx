/**
 * دیالوگ تنظیم / تغییر قفل برنامه
 * مراحل:
 * ۱. انتخاب نوع: PIN یا رمز عبور
 * ۲. وارد کردن
 * ۳. تأیید مجدد
 * ۴. hash + ذخیره
 */

import { useState } from 'react';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useSecurityStore } from '../security/useSecurityStore';
import { securityService } from '../security/securityService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const PIN_LENGTH = 6;
const FA_DIGIT: Record<string, string> = { '۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','۰':'0' };
const NUMPAD = ['۱','۲','۳','۴','۵','۶','۷','۸','۹','','۰','⌫'];

interface Props {
  open: boolean;
  onClose: () => void;
  mode: 'enable' | 'change';
}

type Step = 'type' | 'enter' | 'confirm';
type CredType = 'pin' | 'password';

function PinDots({ filled, total = PIN_LENGTH }: { filled: number; total?: number }) {
  return (
    <div className="flex gap-2 justify-center my-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={cn(
          'w-3 h-3 rounded-full border-2 transition-all',
          i < filled ? 'bg-primary border-primary scale-110' : 'border-muted-foreground/40',
        )} />
      ))}
    </div>
  );
}

export function SecuritySetupDialog({ open, onClose, mode }: Props) {
  const { enableSecurity, changeCredential } = useSecurityStore();

  const [step, setStep]       = useState<Step>('type');
  const [credType, setCredType] = useState<CredType>('pin');
  const [pin1, setPin1]       = useState('');
  const [pin2, setPin2]       = useState('');
  const [pw1, setPw1]         = useState('');
  const [pw2, setPw2]         = useState('');
  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  const reset = () => {
    setStep('type');
    setPin1(''); setPin2('');
    setPw1(''); setPw2('');
    setError(''); setBusy(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── PIN numpad ────────────────────────────────────────
  const handleNumpad = (label: string) => {
    const setter = step === 'enter' ? setPin1 : setPin2;
    const current = step === 'enter' ? pin1 : pin2;

    if (label === '⌫') { setter(p => p.slice(0, -1)); setError(''); return; }
    const digit = FA_DIGIT[label] ?? '';
    if (!digit) return;
    const next = current + digit;
    if (next.length > PIN_LENGTH) return;
    setter(next);
    setError('');

    if (next.length === PIN_LENGTH) {
      if (step === 'enter') {
        setStep('confirm');
      } else {
        // تأیید
        if (next !== pin1) {
          setError('PIN ها یکسان نیستند');
          setPin2('');
          return;
        }
        doSave(next);
      }
    }
  };

  // ── ذخیره نهایی ──────────────────────────────────────
  const doSave = async (credential: string) => {
    setBusy(true);
    try {
      const hashed = await securityService.hashCredential(credential);
      if (mode === 'enable') {
        enableSecurity(hashed, credType);
        toast.success('قفل برنامه فعال شد');
      } else {
        changeCredential(hashed, credType);
        toast.success(credType === 'pin' ? 'PIN تغییر کرد' : 'رمز عبور تغییر کرد');
      }
      handleClose();
    } catch {
      setError('خطا در پردازش. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordConfirm = async () => {
    if (step === 'enter') {
      if (pw1.length < 4) { setError('رمز عبور باید حداقل ۴ کاراکتر باشد'); return; }
      setStep('confirm');
      setError('');
      return;
    }
    if (pw1 !== pw2) { setError('رمز عبورها یکسان نیستند'); setPw2(''); return; }
    await doSave(pw1);
  };

  // ── رندر ─────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {mode === 'enable' ? 'فعال کردن قفل برنامه' : 'تغییر اعتبارنامه'}
          </DialogTitle>
          <DialogDescription>
            {step === 'type' && 'نوع قفل را انتخاب کنید'}
            {step === 'enter' && (credType === 'pin' ? `PIN ${PIN_LENGTH} رقمی تنظیم کنید` : 'رمز عبور جدید را وارد کنید')}
            {step === 'confirm' && (credType === 'pin' ? 'PIN را دوباره وارد کنید' : 'رمز عبور را تأیید کنید')}
          </DialogDescription>
        </DialogHeader>

        {/* مرحله ۱: انتخاب نوع */}
        {step === 'type' && (
          <div className="space-y-3 py-2">
            {(['pin', 'password'] as CredType[]).map(t => (
              <button key={t} onClick={() => setCredType(t)}
                className={cn(
                  'w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-right',
                  credType === t ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                )}>
                <div className={cn('w-4 h-4 rounded-full border-2 shrink-0',
                  credType === t ? 'border-primary bg-primary' : 'border-muted-foreground')} />
                <div>
                  <p className="font-semibold text-sm">{t === 'pin' ? `PIN ${PIN_LENGTH} رقمی` : 'رمز عبور'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t === 'pin' ? 'سریع‌تر و مناسب موبایل' : 'امنیت بیشتر با حروف و اعداد'}
                  </p>
                </div>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setStep('enter')} className="flex-1">ادامه</Button>
              <Button variant="outline" onClick={handleClose} className="flex-1">لغو</Button>
            </div>
          </div>
        )}

        {/* مرحله ۲ و ۳: PIN */}
        {step !== 'type' && credType === 'pin' && (
          <div className="py-2">
            <PinDots filled={step === 'enter' ? pin1.length : pin2.length} />
            {error && <p className="text-center text-sm text-destructive mb-2">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              {NUMPAD.map((k, i) => (
                <button key={i} onClick={() => k && handleNumpad(k)}
                  className={cn(
                    'h-14 rounded-xl text-lg font-semibold transition-all active:scale-95',
                    k === '⌫' ? 'text-muted-foreground hover:bg-muted' :
                    k ? 'bg-card border border-border hover:bg-muted' : '',
                  )}>
                  {k}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setStep('enter'); setPin1(''); setPin2(''); setError(''); }}
              className="w-full mt-3 text-muted-foreground">
              بازگشت
            </Button>
          </div>
        )}

        {/* مرحله ۲ و ۳: Password */}
        {step !== 'type' && credType === 'password' && (
          <div className="space-y-3 py-2">
            <div className="relative">
              <Input type={showPw1 ? 'text' : 'password'} value={pw1}
                onChange={e => { setPw1(e.target.value); setError(''); }}
                placeholder={step === 'enter' ? 'رمز عبور جدید' : 'همان رمز را دوباره وارد کنید'}
                readOnly={step === 'confirm'} className="pl-10" dir="ltr" autoFocus />
              <button onClick={() => setShowPw1(s => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {step === 'confirm' && (
              <div className="relative">
                <Input type={showPw2 ? 'text' : 'password'} value={pw2}
                  onChange={e => { setPw2(e.target.value); setError(''); }}
                  placeholder="تأیید رمز عبور" className="pl-10" dir="ltr" autoFocus />
                <button onClick={() => setShowPw2(s => !s)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPw2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handlePasswordConfirm} disabled={busy || (step === 'enter' ? !pw1 : !pw2)} className="flex-1">
                {busy ? 'در حال ذخیره...' : step === 'enter' ? 'ادامه' : 'ذخیره'}
              </Button>
              <Button variant="outline" onClick={() => { step === 'confirm' ? setStep('enter') : handleClose(); }} className="flex-1">
                {step === 'confirm' ? 'بازگشت' : 'لغو'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
