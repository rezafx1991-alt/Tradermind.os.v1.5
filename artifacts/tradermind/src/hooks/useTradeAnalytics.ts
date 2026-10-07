/**
 * useTradeAnalytics.ts — Hook مرکزی تحلیل معاملاتی
 *
 * Single source of truth برای تمام صفحاتی که به analytics نیاز دارند.
 * یک بار از DB می‌خواند، نتیجه را cache می‌کند، و بین تمام subscribers share می‌کند.
 *
 * استفاده در صفحات:
 *   const { trades, journals, core, analytics, psychology, isLoading } = useTradeAnalytics();
 *
 * استفاده فقط از trades (بدون analytics سنگین):
 *   const { trades, isLoading } = useTradesOnly();
 *
 * بعد از write به DB:
 *   const invalidate = useInvalidateAnalytics();
 *   await db.trades.add(newTrade);
 *   invalidate();
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trade, DailyJournal, Strategy } from '../db/database';
import { loadEngineInput, computeCoreMetrics, CoreMetrics } from '../services/analyticsEngine';
import { computeAnalytics, AnalyticsData } from '../services/analyticsService';
import {
  analyzeMentalPerformance, analyzeRecurringMistakeTrends,
  computeDisciplineScore, generateSmartReport,
  MentalPerfData, MistakeTrend, DisciplineScoreResult, SmartReport,
} from '../services/psychologyService';

// ── Cache keys ────────────────────────────────────────────────────────────────

export const ANALYTICS_KEYS = {
  raw:        ['analytics', 'raw']        as const,
  core:       ['analytics', 'core']       as const,
  analytics:  ['analytics', 'analytics']  as const,
  psychology: ['analytics', 'psychology'] as const,
  all:        ['analytics']               as const,
} as const;

// ── Raw data (trades + journals + strategies) ─────────────────────────────────

interface RawData {
  trades:     Trade[];
  journals:   DailyJournal[];
  strategies: Strategy[];
}

function useRawData() {
  return useQuery<RawData>({
    queryKey: ANALYTICS_KEYS.raw,
    queryFn:  loadEngineInput,
    staleTime: 30_000,
  });
}

// ── Core metrics (performanceService orchestration) ───────────────────────────

interface CoreResult {
  core: CoreMetrics;
  analytics: AnalyticsData;
  trades: Trade[];
  journals: DailyJournal[];
  strategies: Strategy[];
  meta: {
    totalTrades: number;
    closedCount: number;
    openCount: number;
    tradingDays: number;
    firstTradeAt: number | null;
    lastTradeAt: number | null;
    journaledDays: number;
    reviewedCount: number;
  };
}

/** Hook اصلی — تمام metrics عملکردی */
export function useTradeAnalytics(): CoreResult & {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const rawQuery = useRawData();

  const coreQuery = useQuery<CoreResult>({
    queryKey: ANALYTICS_KEYS.core,
    queryFn: async ({ signal }) => {
      // PART 7 / Prompt 3 — AbortController guard
      const raw = rawQuery.data!;
      if (signal?.aborted) throw new Error('Aborted');

      const core      = computeCoreMetrics(raw.trades);
      if (signal?.aborted) throw new Error('Aborted');

      const analytics = computeAnalytics(raw.trades, raw.journals, raw.strategies);
      if (signal?.aborted) throw new Error('Aborted');

      const closed = raw.trades.filter(t => t.status === 'closed');
      const sorted = [...closed].sort((a, b) => a.openedAt - b.openedAt);
      const tradingDays = new Set(closed.map(t => new Date(t.openedAt).toISOString().slice(0, 10))).size;
      const journaledDates = new Set(raw.journals.map(j => j.date));
      const journaledDays = [...new Set(closed.map(t => new Date(t.openedAt).toISOString().slice(0, 10)))].filter(d => journaledDates.has(d)).length;
      const reviewedCount = closed.filter(t => {
        try { const r = JSON.parse(t.postTradeReview); return r?.completedAt > 0; } catch { return false; }
      }).length;
      return {
        core, analytics,
        trades: raw.trades, journals: raw.journals, strategies: raw.strategies,
        meta: {
          totalTrades:  raw.trades.length,
          closedCount:  closed.length,
          openCount:    raw.trades.filter(t => t.status === 'open').length,
          tradingDays, firstTradeAt: sorted[0]?.openedAt ?? null,
          lastTradeAt: sorted[sorted.length - 1]?.openedAt ?? null,
          journaledDays, reviewedCount,
        },
      };
    },
    staleTime: 30_000,
    enabled: rawQuery.isSuccess,
  });

  return {
    ...(coreQuery.data ?? {
      core: computeCoreMetrics([]),
      analytics: computeAnalytics([], [], []),
      trades: [], journals: [], strategies: [],
      meta: { totalTrades: 0, closedCount: 0, openCount: 0, tradingDays: 0, firstTradeAt: null, lastTradeAt: null, journaledDays: 0, reviewedCount: 0 },
    }),
    isLoading: coreQuery.isLoading,
    isError:   coreQuery.isError,
    refetch:   coreQuery.refetch,
  };
}

// ── Psychology data ───────────────────────────────────────────────────────────

export interface PsychologyData {
  mental:     MentalPerfData;
  mistakes:   MistakeTrend[];
  discipline: DisciplineScoreResult;
}

/** Hook روانشناسی — از داده‌های cache‌شده توسط useTradeAnalytics استفاده می‌کند */
export function usePsychologyData(): PsychologyData & {
  isLoading: boolean;
  isError: boolean;
} {
  const rawQuery = useRawData();
  const psychQuery = useQuery<PsychologyData>({
    queryKey: ANALYTICS_KEYS.psychology,
    queryFn: async ({ signal }) => {
      // PART 7 / Prompt 3 — AbortController guard
      const raw = rawQuery.data!;
      if (signal?.aborted) throw new Error('Aborted');

      const { trades, journals } = raw;
      const [mental, mistakes, discipline] = await Promise.all([
        Promise.resolve(analyzeMentalPerformance(trades, journals)),
        Promise.resolve(analyzeRecurringMistakeTrends(trades)),
        Promise.resolve(computeDisciplineScore(trades)),
      ]);
      return { mental, mistakes, discipline };
    },
    staleTime: 60_000,   // روانشناسی نیازی به update مکرر ندارد
    enabled: rawQuery.isSuccess,
  });

  const empty: PsychologyData = {
    mental: { byMood: [], byEnergy: [], byFocus: [], byStress: [], dailyRecords: [], tradeCountCorrelation: [], optimalMood: null, optimalEnergy: null, optimalFocus: null, warningStress: null, journaledDays: 0, totalTradingDays: 0, coverageRate: 0 },
    mistakes:   [],
    discipline: { total: 0, grade: 'N/A', label: '—', components: [], sampleWarning: true, closedCount: 0, suggestions: [] },
  };

  return {
    ...(psychQuery.data ?? empty),
    isLoading: psychQuery.isLoading,
    isError:   psychQuery.isError,
  };
}

/** گزارش هوشمند — on-demand (کاربر دکمه را می‌زند) */
export function useGenerateSmartReport() {
  const qc = useQueryClient();
  return async (): Promise<SmartReport> => {
    const raw = await loadEngineInput();
    const report = generateSmartReport(raw.trades, raw.journals);
    return report;
  };
}

// ── فقط trades — برای صفحاتی که به analytics سنگین نیاز ندارند ───────────────

/** سریع‌ترین hook — فقط trades را cache می‌کند */
export function useTradesOnly(): {
  trades: Trade[];
  closedTrades: Trade[];
  isLoading: boolean;
} {
  const rawQuery = useRawData();
  const trades = rawQuery.data?.trades ?? [];
  return {
    trades,
    closedTrades: trades.filter(t => t.status === 'closed'),
    isLoading: rawQuery.isLoading,
  };
}

// ── باطل کردن cache ───────────────────────────────────────────────────────────

/** بعد از هر write به DB این را فراخوانی کنید */
export function useInvalidateAnalytics() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ANALYTICS_KEYS.all });
}
