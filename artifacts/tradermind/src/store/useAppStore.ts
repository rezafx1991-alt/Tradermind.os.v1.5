import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─────────────────────────────────────────────
// انواع
// ─────────────────────────────────────────────
export type ThemeMode = 'light' | 'dark' | 'system';
export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ColorTheme = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
export type TextColor = 'auto' | `#${string}`;
export type Language = 'fa'; // در آینده: | 'en'
export type TradingTimeMode = 'device' | 'broker';

export interface AppSettings {
  // ظاهر
  theme: ThemeMode;
  fontSize: FontSize;
  colorTheme: ColorTheme;
  textColor: TextColor;
  language: Language;

  // Sidebar
  sidebarOpen: boolean;

  // نام برنامه
  appName: string;

  // پیش‌فرض‌های ثبت معامله
  defaultAccountId: string | null;
  defaultTradingBoxId: string | null;
  defaultSymbol: string;
  defaultMarket: string;

  // مبنای زمانی ثبت و گزارش معاملات
  tradingTimeMode: TradingTimeMode;
  brokerUtcOffsetMinutes: number;

  // تنظیمات تحلیل
  analysisAutosave: boolean;
  analysisShowNextStep: boolean;
  analysisPhaseSummary: boolean;
  analysisConfirmPhase: boolean;
  analysisProgressBar: boolean;

  // تنظیمات ژورنال
  journalAutosave: boolean;
  journalCustomTags: string[];
  journalCustomEmotions: string[];

  // داشبورد
  dashShowTrades: boolean;
  dashShowWinRate: boolean;
  dashShowPnl: boolean;
  dashShowAvgR: boolean;
  dashShowRecentTrades: boolean;
  dashShowLastJournal: boolean;
  dashShowAdherence: boolean;
  dashboardMessage: string;
}

interface AppActions {
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: ThemeMode) => void;
  setFontSize: (size: FontSize) => void;
  setColorTheme: (theme: ColorTheme) => void;
  setTextColor: (color: TextColor) => void;
  setLanguage: (lang: Language) => void;
  setAppName: (name: string) => void;
  setDefaultAccountId: (id: string | null) => void;
  setDefaultTradingBoxId: (id: string | null) => void;
  setDefaultSymbol: (symbol: string) => void;
  setDefaultMarket: (market: string) => void;
  setTradingTimeMode: (mode: TradingTimeMode) => void;
  setBrokerUtcOffsetMinutes: (minutes: number) => void;
  // تحلیل
  setAnalysisAutosave: (v: boolean) => void;
  setAnalysisShowNextStep: (v: boolean) => void;
  setAnalysisPhaseSummary: (v: boolean) => void;
  setAnalysisConfirmPhase: (v: boolean) => void;
  setAnalysisProgressBar: (v: boolean) => void;
  // ژورنال
  setJournalAutosave: (v: boolean) => void;
  addJournalTag: (tag: string) => void;
  removeJournalTag: (tag: string) => void;
  addJournalEmotion: (emotion: string) => void;
  removeJournalEmotion: (emotion: string) => void;
  // داشبورد
  setDashShowTrades: (v: boolean) => void;
  setDashShowWinRate: (v: boolean) => void;
  setDashShowPnl: (v: boolean) => void;
  setDashShowAvgR: (v: boolean) => void;
  setDashShowRecentTrades: (v: boolean) => void;
  setDashShowLastJournal: (v: boolean) => void;
  setDashShowAdherence: (v: boolean) => void;
  setDashboardMessage: (message: string) => void;
  // ریست
  resetToDefaults: () => void;
}

// ─────────────────────────────────────────────
// مقادیر پیش‌فرض
// ─────────────────────────────────────────────
const defaults: AppSettings = {
  theme: 'dark',
  fontSize: 'md',
  colorTheme: 'blue',
  textColor: 'auto',
  language: 'fa',
  sidebarOpen: false,
  appName: 'TraderMind',
  defaultAccountId: null,
  defaultTradingBoxId: null,
  defaultSymbol: 'XAUUSD',
  defaultMarket: 'Commodities',
  tradingTimeMode: 'device',
  brokerUtcOffsetMinutes: 0,
  // تحلیل
  analysisAutosave: true,
  analysisShowNextStep: true,
  analysisPhaseSummary: true,
  analysisConfirmPhase: false,
  analysisProgressBar: true,
  // ژورنال
  journalAutosave: true,
  journalCustomTags: [],
  journalCustomEmotions: [],
  // داشبورد
  dashShowTrades: true,
  dashShowWinRate: true,
  dashShowPnl: true,
  dashShowAvgR: true,
  dashShowRecentTrades: true,
  dashShowLastJournal: true,
  dashShowAdherence: false,
  dashboardMessage: '',
};

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────
export const useAppStore = create<AppSettings & AppActions>()(
  persist(
    (set) => ({
      ...defaults,

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setColorTheme: (colorTheme) => set({ colorTheme }),
      setTextColor: (textColor) => set({ textColor }),
      setLanguage: (language) => set({ language }),
      setAppName: (appName) => set({ appName }),
      setDefaultAccountId: (defaultAccountId) => set({ defaultAccountId }),
      setDefaultTradingBoxId: (defaultTradingBoxId) => set({ defaultTradingBoxId }),
      setDefaultSymbol: (defaultSymbol) => set({ defaultSymbol }),
      setDefaultMarket: (defaultMarket) => set({ defaultMarket }),
      setTradingTimeMode: (tradingTimeMode) => set({ tradingTimeMode }),
      setBrokerUtcOffsetMinutes: (brokerUtcOffsetMinutes) => set({
        // 15-minute increments support device/broker zones such as UTC+5:45.
        brokerUtcOffsetMinutes: Math.max(-720, Math.min(840, Math.round(brokerUtcOffsetMinutes / 15) * 15)),
      }),

      setAnalysisAutosave: (v) => set({ analysisAutosave: v }),
      setAnalysisShowNextStep: (v) => set({ analysisShowNextStep: v }),
      setAnalysisPhaseSummary: (v) => set({ analysisPhaseSummary: v }),
      setAnalysisConfirmPhase: (v) => set({ analysisConfirmPhase: v }),
      setAnalysisProgressBar: (v) => set({ analysisProgressBar: v }),

      setJournalAutosave: (v) => set({ journalAutosave: v }),
      addJournalTag: (tag) =>
        set((s) => ({ journalCustomTags: [...new Set([...s.journalCustomTags, tag.trim()])] })),
      removeJournalTag: (tag) =>
        set((s) => ({ journalCustomTags: s.journalCustomTags.filter((t) => t !== tag) })),
      addJournalEmotion: (emotion) =>
        set((s) => ({ journalCustomEmotions: [...new Set([...s.journalCustomEmotions, emotion.trim()])] })),
      removeJournalEmotion: (emotion) =>
        set((s) => ({ journalCustomEmotions: s.journalCustomEmotions.filter((e) => e !== emotion) })),

      setDashShowTrades: (v) => set({ dashShowTrades: v }),
      setDashShowWinRate: (v) => set({ dashShowWinRate: v }),
      setDashShowPnl: (v) => set({ dashShowPnl: v }),
      setDashShowAvgR: (v) => set({ dashShowAvgR: v }),
      setDashShowRecentTrades: (v) => set({ dashShowRecentTrades: v }),
      setDashShowLastJournal: (v) => set({ dashShowLastJournal: v }),
      setDashShowAdherence: (v) => set({ dashShowAdherence: v }),
      setDashboardMessage: (dashboardMessage) => set({ dashboardMessage: dashboardMessage.slice(0, 240) }),

      // وضعیت باز بودن منوی موبایل موقتی است و نباید بین اجراهای برنامه
      // یا بعد از بازگشت Android از حالت پس‌زمینه باقی بماند.
      resetToDefaults: () => set({ ...defaults, sidebarOpen: false }),
    }),
    {
      name: 'tradermind-app-storage',
      // ادغام هوشمند — مقادیر جدید با مقادیر پیش‌فرض ترکیب می‌شوند.
      // sidebarOpen عمدی persist نمی‌شود؛ Drawer موبایل باید هر بار بسته
      // شروع شود تا روی محتوای صفحه، مخصوصاً داشبورد، باقی نماند.
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        sidebarOpen: false,
        // backward compat: اگر theme قدیمی بود، معتبر باشد
        theme: ['light', 'dark', 'system'].includes(persisted?.theme)
          ? persisted.theme
          : defaults.theme,
        fontSize: ['xs', 'sm', 'md', 'lg', 'xl'].includes(persisted?.fontSize)
          ? persisted.fontSize
          : defaults.fontSize,
        colorTheme: ['blue', 'violet', 'emerald', 'amber', 'rose'].includes(persisted?.colorTheme)
          ? persisted.colorTheme
          : defaults.colorTheme,
        textColor: persisted?.textColor === 'auto'
          || (typeof persisted?.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(persisted.textColor))
          ? persisted.textColor
          : defaults.textColor,
        defaultAccountId: typeof persisted?.defaultAccountId === 'string' ? persisted.defaultAccountId : defaults.defaultAccountId,
        defaultTradingBoxId: typeof persisted?.defaultTradingBoxId === 'string' ? persisted.defaultTradingBoxId : defaults.defaultTradingBoxId,
        defaultSymbol: typeof persisted?.defaultSymbol === 'string' ? persisted.defaultSymbol : defaults.defaultSymbol,
        defaultMarket: typeof persisted?.defaultMarket === 'string' ? persisted.defaultMarket : defaults.defaultMarket,
        tradingTimeMode: persisted?.tradingTimeMode === 'broker' ? 'broker' : defaults.tradingTimeMode,
        brokerUtcOffsetMinutes: Number.isFinite(Number(persisted?.brokerUtcOffsetMinutes))
          ? Math.max(-720, Math.min(840, Math.round(Number(persisted.brokerUtcOffsetMinutes) / 15) * 15))
          : defaults.brokerUtcOffsetMinutes,
      }),
      // این state فقط برای همان اجرای فعلی رابط کاربری است.
      partialize: (state) => {
        const { sidebarOpen: _sidebarOpen, ...persisted } = state;
        return persisted;
      },
    }
  )
);
