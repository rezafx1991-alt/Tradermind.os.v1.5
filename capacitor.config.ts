import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.tradermind.os',
  appName: 'TraderMind OS',
  // خروجی vite.capacitor.config.ts
  webDir: 'dist/capacitor',
  server: {
    // Capacitor روی Android از https://localhost سرو می‌کند
    // → protocol = 'https:' → wouter از مسیریابی عادی استفاده می‌کند (نه hash)
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
    // اجازه دسترسی به اینترنت برای به‌روزرسانی‌های آینده
    allowMixedContent: false,
    // از InputConnection جایگزین Capacitor استفاده نکن؛ این حالت با
    // دیکتهٔ صوتی بعضی کیبوردهای Android سازگار نیست. WebView باید مسیر
    // استاندارد IME خود Android را برای تایپ و voice typing استفاده کند.
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // تنظیمات اختیاری برای SplashScreen اگر در آینده اضافه شود
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
