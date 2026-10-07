/**
 * useAnalyticsWorker.ts — PART 6 / Prompt 3
 *
 * React hook برای استفاده از Web Worker در analytics سنگین.
 * محاسبات روی thread جداگانه — UI هیچگاه freeze نمی‌شود.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Trade } from '../db/database';
import type {
  WorkerResponse,
  EdgeAnalyticsResult,
  PerformanceResult,
  RiskResult,
  StatisticsResult,
} from '../workers/analytics.worker';
import type { TradingTimeConfig } from '../lib/tradingTime';

interface AllAnalyticsResult {
  edge: EdgeAnalyticsResult;
  performance: PerformanceResult;
  risk: RiskResult;
  statistics: StatisticsResult;
}

interface UseAnalyticsWorkerReturn {
  result: AllAnalyticsResult | null;
  isComputing: boolean;
  error: string | null;
  compute: (trades: Trade[], timeConfig?: TradingTimeConfig) => void;
}

export function useAnalyticsWorker(): UseAnalyticsWorkerReturn {
  const [result, setResult] = useState<AllAnalyticsResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    // ایجاد Worker
    workerRef.current = new Worker(
      new URL('../workers/analytics.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (!isMountedRef.current) return;
      const msg = event.data;
      if (msg.type === 'ALL_RESULT') {
        setResult(msg.data);
        setIsComputing(false);
        setError(null);
      } else if (msg.type === 'ERROR') {
        setError(msg.message);
        setIsComputing(false);
      }
    };

    workerRef.current.onerror = (err) => {
      if (!isMountedRef.current) return;
      setError(err.message);
      setIsComputing(false);
    };

    return () => {
      isMountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const compute = useCallback((trades: Trade[], timeConfig?: TradingTimeConfig) => {
    if (!workerRef.current) return;
    setIsComputing(true);
    setError(null);
    workerRef.current.postMessage({ type: 'COMPUTE_ALL', trades, timeConfig });
  }, []);

  return { result, isComputing, error, compute };
}
