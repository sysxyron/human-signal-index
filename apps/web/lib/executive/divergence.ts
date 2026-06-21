// =============================================================================
// HSI Phase 74 — Forecast divergence (PURE, deterministic). Classifies a recorded
// forecast against its observed outcome. Detection, not prediction — it reads the
// real forecast status + evaluation result; it never forecasts. No I/O.
// =============================================================================

import type { DivergenceStatus, ForecastDivergenceRow } from './types';

export interface DivergenceInput {
  id: string; title: string; owner: string; confidence: number | null; outcome: string | null;
  status: string;                 // forecasts.status
  scoreResult: string | null;     // forecast_scores.result (correct/incorrect/partial/...)
  forecastDateIso: string | null; // for age
  resolutionDateIso: string | null;
  nowIso: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
function ageDays(iso: string | null, nowIso: string): number | null {
  if (!iso) return null; const t = new Date(iso).getTime(); const now = new Date(nowIso).getTime();
  if (Number.isNaN(t) || Number.isNaN(now)) return null; return Math.max(0, Math.round((now - t) / DAY_MS));
}

/** Deterministic verdict from real status + evaluation result. */
export function classifyDivergence(input: DivergenceInput): DivergenceStatus {
  const status = (input.status ?? '').toLowerCase();
  const result = (input.scoreResult ?? '').toLowerCase();

  if (status === 'resolved') {
    if (result === 'correct') return 'on_track';
    if (result === 'partial') return 'diverging';
    if (result === 'incorrect') return 'missed';
    return 'unresolved'; // resolved but not yet scored
  }
  if (status === 'expired') return 'missed';
  if (status === 'active') {
    const res = ageDays(input.resolutionDateIso, input.nowIso);
    // overdue: resolution date passed but still active/unevaluated → diverging.
    if (input.resolutionDateIso && new Date(input.resolutionDateIso).getTime() < new Date(input.nowIso).getTime()) return 'diverging';
    void res;
    return 'on_track'; // in progress, not yet due
  }
  return 'unresolved'; // draft / cancelled / unknown
}

export function toDivergenceRow(input: DivergenceInput): ForecastDivergenceRow {
  return {
    id: input.id, title: input.title, status: classifyDivergence(input),
    ageDays: ageDays(input.forecastDateIso, input.nowIso), owner: input.owner,
    confidence: input.confidence, outcome: input.outcome,
  };
}

export interface DivergenceSummary { onTrack: number; diverging: number; missed: number; unresolved: number; total: number }
export function summarizeDivergence(rows: ForecastDivergenceRow[]): DivergenceSummary {
  return {
    total: rows.length,
    onTrack: rows.filter((r) => r.status === 'on_track').length,
    diverging: rows.filter((r) => r.status === 'diverging').length,
    missed: rows.filter((r) => r.status === 'missed').length,
    unresolved: rows.filter((r) => r.status === 'unresolved').length,
  };
}
