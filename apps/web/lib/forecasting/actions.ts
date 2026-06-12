'use server';

// =============================================================================
// HSIN Phase 21 — Forecasting & Scenarios server actions. 'use server'. THIN
// wrappers over the Phase-21 DAL. Return DbResult; revalidate the dashboards;
// NEVER throw. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  createScenarioDal,
  getForecastDetail,
  getForecastingHighlights,
  getForecastsBoard,
  getScenarioDetail,
  getScenariosBoard,
  getWarningsBoard,
  recomputeForecastAccuracyDal,
  resolveWarningDal,
  transitionScenarioDal,
  type CreateScenarioResult,
  type DbResult,
} from './persistence';
import type {
  ForecastDetailData,
  ForecastingHighlights,
  ForecastsBoardData,
  ScenarioDetailData,
  ScenarioState,
  ScenariosBoardData,
  WarningsBoardData,
} from '@hsi/shared-types';

const FORECASTS = '/dashboard/forecasts';
const SCENARIOS = '/dashboard/scenarios';
const WARNINGS = '/dashboard/warnings';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // best-effort.
    }
  }
}

// ---- reads ------------------------------------------------------------------
export async function getForecastsBoardAction(): Promise<DbResult<ForecastsBoardData>> {
  return getForecastsBoard();
}
export async function getForecastDetailAction(id: string): Promise<DbResult<ForecastDetailData>> {
  return getForecastDetail(id, { now: new Date().toISOString() });
}
export async function getScenariosBoardAction(): Promise<DbResult<ScenariosBoardData>> {
  return getScenariosBoard({ now: new Date().toISOString() });
}
export async function getScenarioDetailAction(id: string): Promise<DbResult<ScenarioDetailData>> {
  return getScenarioDetail(id);
}
export async function getWarningsBoardAction(): Promise<DbResult<WarningsBoardData>> {
  return getWarningsBoard();
}
export async function getForecastingHighlightsAction(): Promise<DbResult<ForecastingHighlights>> {
  return getForecastingHighlights();
}

// ---- writes -----------------------------------------------------------------
export async function createScenarioAction(input: { slug: string; title: string; description: string; drivers?: { label: string; weight: number; presence: number }[] }): Promise<DbResult<CreateScenarioResult>> {
  const result = await createScenarioDal(input, new Date().toISOString());
  if (result.ok) revalidate(SCENARIOS);
  return result;
}

export async function transitionScenarioAction(id: string, to: ScenarioState, reason?: string): Promise<DbResult<{ from: string; to: string }>> {
  const result = await transitionScenarioDal(id, to, new Date().toISOString(), reason);
  if (result.ok) revalidate(SCENARIOS, `${SCENARIOS}/${id}`);
  return result;
}

export async function recomputeForecastAccuracyAction(): Promise<DbResult<{ sampleCount: number; ece: number; brier: number }>> {
  const result = await recomputeForecastAccuracyDal(new Date().toISOString());
  if (result.ok) revalidate(FORECASTS);
  return result;
}

export async function resolveWarningAction(id: string, status: 'acknowledged' | 'resolved'): Promise<DbResult<{ id: string; status: string }>> {
  const result = await resolveWarningDal(id, status, new Date().toISOString());
  if (result.ok) revalidate(WARNINGS);
  return result;
}

// ---- re-exports -------------------------------------------------------------
export type { DbResult, DbResultCode } from './persistence';
export type { CreateScenarioResult } from './persistence';
export type {
  HsinForecastRecord,
  HsinForecastOutcomeRecord,
  HsinForecastVersionRecord,
  HsinForecastAlertRecord,
  HsinForecastReliabilityRecord,
  HsinScenarioRecord,
  HsinScenarioVersionRecord,
  HsinScenarioComparisonSnapshotRecord,
  HsinScenarioTreeRecord,
  HsinEarlyWarningAlertRecord,
  ForecastsBoardData,
  ForecastDetailData,
  ForecastBoardRow,
  ScenariosBoardData,
  ScenarioDetailData,
  WarningsBoardData,
  ForecastingHighlights,
  ForecastStatus,
  ScenarioState,
  WarningLevel,
  WarningKind,
} from '@hsi/shared-types';
