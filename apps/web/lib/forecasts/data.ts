// =============================================================================
// HSI Phase 67 — Forecast dashboard data (SERVER-ONLY, read). Status counts,
// performance metrics, calibration curve, trends, executive lists, alerts, and
// forecast-readiness (from the Phase 66 FORECAST_PREP_AGENT). Reviewer+ via RLS.
// Every number is computed — nothing fabricated. Never throws.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import {
  listForecastsDal, countByStatusDal, readEvalRecords, getCalibrationDal, getSnapshotsDal,
  getAlertsDal, scoredForecastsDal, type AlertRow, type ScoredForecast, type SnapshotRow,
} from './persistence';
import { performanceMetrics } from './calibration';
import { getResultsDal as getAgentResults } from '@/lib/agents/persistence';
import type { Forecast, PerformanceMetrics, CalibrationBucket } from './types';

export interface ReadinessItem { label: string; detail: string; severity: string }

export interface ForecastsDashboard {
  total: number;
  byStatus: Record<string, number>;
  performance: PerformanceMetrics;
  calibration: CalibrationBucket[];
  snapshots: SnapshotRow[];
  recent: Forecast[];
  active: Forecast[];
  alerts: AlertRow[];
  bestPerforming: ScoredForecast[];
  worstPerforming: ScoredForecast[];
  readiness: ReadinessItem[];
  readinessScore: number;
}

export async function getForecastsDashboard(): Promise<ForecastsDashboard> {
  const db = createClient();
  const [byStatus, records, calibration, snapshots, recent, alerts, scored, readinessRows] = await Promise.all([
    countByStatusDal(db),
    readEvalRecords(db),
    getCalibrationDal(db),
    getSnapshotsDal(db, 60),
    listForecastsDal(db, { limit: 100 }),
    getAlertsDal(db, null, 30),
    scoredForecastsDal(db, 200),
    getAgentResults(db, 'FORECAST_PREP_AGENT', 12),
  ]);

  const performance = performanceMetrics(records);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const bestPerforming = scored.filter((s) => s.result === 'correct').sort((a, b) => (a.brier ?? 0) - (b.brier ?? 0)).slice(0, 5);
  const worstPerforming = scored.filter((s) => s.result === 'incorrect').sort((a, b) => (b.brier ?? 1) - (a.brier ?? 1)).slice(0, 5);

  // Forecast readiness comes from the Phase 66 prep agent's latest findings.
  const readiness: ReadinessItem[] = readinessRows.map((r) => ({ label: r.category ?? 'readiness', detail: r.finding, severity: r.severity }));
  // readiness score = share of readiness findings at INFO (i.e. "ready") severity.
  const readinessScore = readiness.length ? Math.round((readiness.filter((r) => r.severity === 'INFO').length / readiness.length) * 100) : 0;

  return {
    total,
    byStatus,
    performance,
    calibration,
    snapshots,
    recent,
    active: recent.filter((f) => f.status === 'active').slice(0, 10),
    alerts,
    bestPerforming,
    worstPerforming,
    readiness,
    readinessScore,
  };
}
