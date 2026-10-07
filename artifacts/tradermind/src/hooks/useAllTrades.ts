/**
 * useAllTrades.ts — Hook مشترک برای بارگذاری معاملات با React Query cache
 *
 * مشکل حل‌شده:
 *   قبلاً هر صفحه به صورت مستقل `db.trades.toArray()` را فراخوانی می‌کرد.
 *   این hook یک cache مشترک ایجاد می‌کند که تمام صفحات از آن استفاده کنند.
 *
 * استفاده:
 *   const { trades, journals, strategies, isLoading } = useAllTrades();
 *
 * نکته:
 *   staleTime = 30s — همان مقدار QueryClient اصلی.
 *   اگر معامله جدیدی ثبت شد، با `invalidateTradesCache()` کش را باطل کنید.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db, Trade, DailyJournal, Strategy } from '../db/database';

// ── کلیدهای cache ─────────────────────────────────────────────────────────────

export const QUERY_KEYS = {
  trades:     ['trades', 'all']     as const,
  journals:   ['journals', 'all']   as const,
  strategies: ['strategies', 'all'] as const,
  allData:    ['engine', 'allData'] as const,
} as const;

// ── توابع fetch ───────────────────────────────────────────────────────────────
// PART 1 / Prompt 3: از Repository استفاده می‌کند — بدون full-table scan مستقیم.

async function fetchTrades(): Promise<Trade[]> {
  const { getAllTradesForAnalytics } = await import('../core/repositories/tradeRepository');
  return getAllTradesForAnalytics();
}
async function fetchJournals(): Promise<DailyJournal[]> {
  return db.dailyJournals.orderBy('date').toArray();
}
async function fetchStrategies(): Promise<Strategy[]> {
  return db.strategies.toArray();
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** همه معاملات — با cache */
export function useTrades() {
  return useQuery({
    queryKey: QUERY_KEYS.trades,
    queryFn: fetchTrades,
    staleTime: 30_000,
  });
}

/** معاملات بسته — محاسبه شده از cache اصلی */
export function useClosedTrades() {
  const { data: trades = [], ...rest } = useTrades();
  return { ...rest, data: trades.filter(t => t.status === 'closed') };
}

/** ژورنال‌های روزانه — با cache */
export function useJournals() {
  return useQuery({
    queryKey: QUERY_KEYS.journals,
    queryFn: fetchJournals,
    staleTime: 30_000,
  });
}

/** استراتژی‌ها — با cache */
export function useStrategies() {
  return useQuery({
    queryKey: QUERY_KEYS.strategies,
    queryFn: fetchStrategies,
    staleTime: 60_000,   // استراتژی‌ها کمتر تغییر می‌کنند
  });
}

/** همه داده‌ها با هم — برای صفحاتی که به همه نیاز دارند */
export function useAllData(): {
  trades: Trade[];
  journals: DailyJournal[];
  strategies: Strategy[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const tradesQuery     = useTrades();
  const journalsQuery   = useJournals();
  const strategiesQuery = useStrategies();

  return {
    trades:     tradesQuery.data     ?? [],
    journals:   journalsQuery.data   ?? [],
    strategies: strategiesQuery.data ?? [],
    isLoading:  tradesQuery.isLoading || journalsQuery.isLoading || strategiesQuery.isLoading,
    isError:    tradesQuery.isError  || journalsQuery.isError   || strategiesQuery.isError,
    refetch: () => {
      tradesQuery.refetch();
      journalsQuery.refetch();
    },
  };
}

// ── باطل کردن cache بعد از تغییر ─────────────────────────────────────────────

/**
 * بعد از ثبت معامله جدید، ریویو، یا حذف معامله این را فراخوانی کنید.
 *
 * مثال:
 *   const invalidate = useInvalidateTradesCache();
 *   await db.trades.add(newTrade);
 *   invalidate();
 */
export function useInvalidateTradesCache() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.trades });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.allData });
  };
}

/** باطل کردن همه cache های داده */
export function useInvalidateAllCache() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.trades });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.journals });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.strategies });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.allData });
  };
}
