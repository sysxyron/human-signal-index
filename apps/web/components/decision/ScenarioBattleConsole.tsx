'use client';

// =============================================================================
// HSI Phase 13 — ScenarioBattleConsole. Client wrapper that owns the war-game
// result state: it renders the ScenarioBattleForm and, on a successful
// compareScenariosAction, shows the resulting ScenarioBattleResultView right
// below the form. The action returns the engine battle (+ ids); this wrapper
// projects it into a display record and carries its explicit limitations through.
// Keeps the page (a server component) thin while the interactive A-vs-B flow
// lives client-side. In demo mode a labeled demo battle is shown.
// =============================================================================

import { useState } from 'react';
import { Card } from '@hsi/ui';
import { Swords } from 'lucide-react';
import type { HsinNarrativeRecord } from '@hsi/shared-types';
import type {
  InterventionType,
  ScenarioBattleResult,
} from '@hsi/decision-intelligence';
import { DemoBadge } from '@/components/signals/badges';
import { ScenarioBattleForm, type CompareScenariosData } from './ScenarioBattleForm';
import { ScenarioBattleResultView } from './ScenarioBattleResultView';
import { battleToRecord } from '@/lib/decision/view';

interface ScenarioSpec {
  name: string;
  interventions: InterventionType[];
}

type CompareResult =
  | { ok: true; data: CompareScenariosData }
  | {
      ok: false;
      error: string;
      code?: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
    };

export function ScenarioBattleConsole({
  narratives,
  action,
  canRun,
  demo = false,
  demoBattle,
}: {
  narratives: HsinNarrativeRecord[];
  action: (
    narrativeId: string,
    scenarioA: ScenarioSpec,
    scenarioB: ScenarioSpec,
  ) => Promise<CompareResult>;
  canRun: boolean;
  demo?: boolean;
  /** A labeled demo engine battle shown when running offline. */
  demoBattle?: ScenarioBattleResult;
}) {
  const [data, setData] = useState<CompareScenariosData | null>(null);
  const nameOf = new Map(narratives.map((n) => [n.id, n.name]));

  const battle: ScenarioBattleResult | null =
    data?.battle ?? (demo ? demoBattle ?? null : null);
  const fromLive = Boolean(data);

  return (
    <div className="space-y-6">
      <Card className="space-y-3" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Swords className="h-4 w-4 text-electric" /> Define a scenario battle
        </h3>
        <ScenarioBattleForm
          narratives={narratives}
          action={action}
          canRun={canRun}
          demo={demo}
          onResult={(d) => setData(d)}
        />
      </Card>

      {battle ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-h6 font-semibold text-text-primary">Result</h3>
            {!fromLive && demo ? <DemoBadge /> : null}
          </div>
          <ScenarioBattleResultView
            comparison={battleToRecord(battle, {
              id: data?.comparisonId,
              decisionRunId: data?.decisionRunId,
            })}
            limitations={battle.limitations}
            narrativeName={
              narratives.length === 1 ? nameOf.get(narratives[0].id) : undefined
            }
          />
        </section>
      ) : null}
    </div>
  );
}
