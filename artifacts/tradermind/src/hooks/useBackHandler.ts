/**
 * useBackHandler — مدیریت دکمه برگشت در PWA
 *
 * - از خروج ناخواسته از اپ جلوگیری می‌کند
 * - callback اختیاری برای رهگیری ناوبری (مثلاً هشدار داده‌های ذخیره‌نشده)
 *
 * اگر callback برابر false برگرداند، ناوبری مسدود می‌شود.
 * اگر true برگرداند یا چیزی برنگرداند، ناوبری طبیعی انجام می‌شود.
 */
import { useEffect, useRef } from 'react';

type BackHandlerCallback = () => boolean | void | Promise<boolean | void>;

export function useBackHandler(onBack?: BackHandlerCallback) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const handler = async (e: PopStateEvent) => {
      if (onBackRef.current) {
        const result = await onBackRef.current();
        if (result === false) {
          // مسدود کردن ناوبری — برگشت به حالت قبل
          window.history.pushState(null, '', window.location.href);
          return;
        }
      }
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
}
