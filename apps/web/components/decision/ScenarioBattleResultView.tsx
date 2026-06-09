// =============================================================================
// HSI Phase 13 — ScenarioBattleResultView. War-gaming "Scenario A vs Scenario B"
// head-to-head: the two plans side by side (their interventions + per-scenario
// metrics), the WINNER shown PROMINENTLY (A / B / tie), the battle confidence,
// the comparison reasoning, and explicit limitations. Server-safe /
// presentational — renders only the comparison it is given. A tie is shown
// honestly, never forced into a false winner.
// =============================================================================

import { Card } from '@hsi/ui';
import { Swords, ArrowRight } from 'lucide-react';
import type { HsinScenarioComparisonRecord } from '@hsi/shared-types';
import { InterventionTypeBadge, ConfidenceBandBadge, ScenarioWinnerBadge } from './badges';
import { ReasoningList } from './ReasoningList';
import { LimitationsPanel } from './LimitationsPanel';
import {
  bandFromConfidence,
  readComparisonReasoning,
  readScenarioSide,
  type ScenarioSide,
  type ScenarioWinner as _W,
} from '@/lib/decision/view';

function SidePane({
  side,
  label,
  accent,
  isWinner,
}: {
  side: ScenarioSide;
  label: string;
  accent: string;
  isWinner: boolean;
}) {
  return (
    <div
      className="space-y-3 rounded-card border bg-surface-2/30 p-4"
      style={{ borderColor: isWinner ? `${accent}99` : undefined }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold"
          style={{
            backgroundColor: `${accent}1f`,
            color: accent,
            border: `1px solid ${accent}55`,
          }}
        >
          {label}: {side.name}
        </span>
        {isWinner ? (
          <span className="text-caption font-semibold" style={{ color: accent }}>
            favoured
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="text-label text-text-muted">Interventions</p>
        {side.interventions.length === 0 ? (
          <p className="text-caption italic text-text-muted">
            Do nothing (baseline — no levers applied).
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {side.interventions.map((t, i) => (
              <InterventionTypeBadge key={`${t}-${i}`} type={t} />
            ))}
          </div>
        )}
      </div>

      {side.metrics.length > 0 ? (
        <div className="space-y-1.5 border-t border-border pt-2">
          <p className="text-label text-text-muted">Projected metrics</p>
          <dl className="grid grid-cols-2 gap-1.5">
            {side.metrics.map((m) => (
              <div key={m.key} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-caption text-text-muted" title={m.label}>
                  {m.label}
                </dt>
                <dd className="text-caption font-semibold tabular-nums text-text-primary">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

export function ScenarioBattleResultView({
  comparison,
  narrativeName,
  limitations = [],
}: {
  comparison: HsinScenarioComparisonRecord;
  narrativeName?: string;
  /** Explicit war-game limitations (engine battles carry these; persisted rows
   * may not). Always rendered via the LimitationsPanel default caveat if empty. */
  limitations?: string[];
}) {
  const a = readScenarioSide(comparison.scenario_a, 'Scenario A');
  const b = readScenarioSide(comparison.scenario_b, 'Scenario B');
  const reasoning = readComparisonReasoning(comparison);
  const winner = comparison.winner as _W | undefined;

  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Swords className="h-4 w-4 text-electric" /> Scenario battle
        </h3>
        <ScenarioWinnerBadge winner={winner} prominent />
        <ConfidenceBandBadge
          band={bandFromConfidence(comparison.confidence)}
          confidence={comparison.confidence}
        />
        {narrativeName ? (
          <span className="ml-auto text-caption text-text-muted">
            Narrative:{' '}
            <span className="font-semibold text-text-primary">{narrativeName}</span>
          </span>
        ) : null}
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <SidePane side={a} label="A" accent="#06B6D4" isWinner={winner === 'A'} />
        <div className="flex items-center justify-center">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 text-caption font-bold text-text-muted">
            vs
          </span>
        </div>
        <SidePane side={b} label="B" accent="#8B5CF6" isWinner={winner === 'B'} />
      </div>

      {winner === 'tie' ? (
        <p className="flex items-center gap-2 rounded-card border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-secondary">
          <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
          The two plans are too close to separate on the objective — the model does
          not force a winner.
        </p>
      ) : null}

      <ReasoningList reasoning={reasoning} title="Why this verdict" />

      <LimitationsPanel limitations={limitations} title="War-game limitations" />
    </Card>
  );
}
