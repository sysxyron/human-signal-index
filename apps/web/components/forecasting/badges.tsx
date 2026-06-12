// =============================================================================
// HSI Phase 21 — badges for forecast status / scenario state / warning level /
// confidence band. Pure, server-safe.
// =============================================================================

import type { ForecastStatus, ScenarioState, WarningLevel } from '@hsi/shared-types';
import { confidenceBand, forecastStatusDecor, scenarioStateDecor, warningLevelDecor, type Decorated } from '@/lib/forecasting/view';

function Pill({ decor }: { decor: Decorated }) {
  return (
    <span title={decor.description} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
      style={{ color: decor.color, backgroundColor: `${decor.color}1f`, border: `1px solid ${decor.color}55` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: decor.color }} />
      {decor.label}
    </span>
  );
}

export function ForecastStatusBadge({ status }: { status?: ForecastStatus | string | null }) {
  return <Pill decor={forecastStatusDecor(status)} />;
}
export function ScenarioStateBadge({ state }: { state?: ScenarioState | string | null }) {
  return <Pill decor={scenarioStateDecor(state)} />;
}
export function WarningLevelBadge({ level }: { level?: WarningLevel | string | null }) {
  return <Pill decor={warningLevelDecor(level)} />;
}
export function ConfidenceBadge({ confidence }: { confidence?: number | null }) {
  return <Pill decor={confidenceBand(confidence)} />;
}
