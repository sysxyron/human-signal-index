'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav, Card, Button } from '@hsi/ui';
import { RotateCcw, Zap, Save } from 'lucide-react';
import type { ScenarioRecord } from '@hsi/shared-types';
import {
  SimulationEngine,
  evaluateWorld,
  computeTemporalAdaptation,
  ENVIRONMENT_RATES,
  type WorldEvaluation,
  type ImpactChain,
} from '@hsi/simulation-engine';
import {
  TUNABLE_PARAMETERS,
  SCENARIO_PRESETS,
  getScenario,
  applyScenario,
} from '@hsi/counterfactuals';
import { createEarthState } from '@hsi/world-models';
import { ParameterSlider } from '@/components/worldforge/ParameterSlider';
import { MetricWithProvenance } from '@/components/worldforge/MetricWithProvenance';
import { ImpactChainCascade } from '@/components/worldforge/ImpactChainCascade';
import { fmtNum } from '@/lib/worldforge/confidence';
import {
  ErrorCard,
  SuccessNotice,
  SimulationPicker,
  SignInPrompt,
} from '@/components/worldforge/PersistenceUI';
import { useSimulationTargets } from '@/components/worldforge/useSimulationTargets';
import {
  saveScenarioAction,
  listScenariosAction,
} from '@/app/dashboard/worldforge/actions';

interface SandboxState {
  evaluation: WorldEvaluation;
  params: Record<string, number>;
  lastImpact: ImpactChain | null;
  lastTrigger: string;
}

function readParams(engine: SimulationEngine): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of TUNABLE_PARAMETERS) out[p.key] = engine.get(p.key);
  return out;
}

function snapshot(engine: SimulationEngine, impact: ImpactChain | null, trigger: string): SandboxState {
  return {
    evaluation: evaluateWorld(engine.getState()),
    params: readParams(engine),
    lastImpact: impact,
    lastTrigger: trigger,
  };
}

export function ScenarioSandboxClient({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  // One engine instance held across renders; sliders mutate it then we re-eval.
  const engineRef = useRef<SimulationEngine | null>(null);
  if (!engineRef.current) engineRef.current = new SimulationEngine(createEarthState());

  const [sandbox, setSandbox] = useState<SandboxState>(() =>
    snapshot(engineRef.current as SimulationEngine, null, 'Earth baseline'),
  );

  const onParam = useCallback((key: string, label: string, value: number) => {
    const engine = engineRef.current as SimulationEngine;
    const impact = engine.set(key, value);
    setSandbox(snapshot(engine, impact, `${label} → ${fmtNum(value)}`));
  }, []);

  const applyPreset = useCallback((id: string) => {
    const scenario = getScenario(id);
    if (!scenario) return;
    // applyScenario builds a fresh engine from Earth, applies the universe (if any)
    // and all changes, and returns the recomputed engine. Track the last change's
    // impact for the cascade view.
    const result = applyScenario(createEarthState(), id);
    const engine = result.engine;
    let lastImpact: ImpactChain | null = null;
    if (!scenario.universe && scenario.changes.length > 0) {
      const last = scenario.changes[scenario.changes.length - 1];
      // Re-apply the final change against the already-set value to surface the
      // cascade (idempotent set returns the propagation chain).
      lastImpact = engine.set(last.path, last.value);
    }
    engineRef.current = engine;
    setSandbox(snapshot(engine, lastImpact, `Preset: ${scenario.name}`));
  }, []);

  const reset = useCallback(() => {
    const engine = new SimulationEngine(createEarthState());
    engineRef.current = engine;
    setSandbox(snapshot(engine, null, 'Earth baseline'));
  }, []);

  // --- persistence: save the current sandbox as a scenario ------------------
  const targets = useSimulationTargets();
  const [scenarioName, setScenarioName] = useState('');
  const [saved, setSaved] = useState<ScenarioRecord[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [pending, startSave] = useTransition();
  const canWrite = isAuthenticated && !authExpired;

  const loadSaved = useCallback((simId: string) => {
    if (!simId) return;
    listScenariosAction(simId).then((res) => {
      if (res.ok) setSaved(res.data);
      else setSaveError(res.error);
    });
  }, []);

  useEffect(() => {
    if (targets.selectedId) loadSaved(targets.selectedId);
  }, [targets.selectedId, loadSaved]);

  const onSaveScenario = () => {
    if (!targets.selectedId) return;
    setSaveError(null);
    setNotice(null);
    const name = scenarioName.trim() || sandbox.lastTrigger || 'Scenario';
    const summary = {
      overallScore: sandbox.evaluation.overallScore,
      habitability: sandbox.evaluation.habitability.value,
      lifePlausibility: sandbox.evaluation.lifePlausibility.value,
      intelligencePlausibility: sandbox.evaluation.intelligencePlausibility.value,
      civilizationPlausibility: sandbox.evaluation.civilizationPlausibility.value,
      summary: sandbox.evaluation.summary,
    };
    startSave(async () => {
      const res = await saveScenarioAction(
        targets.selectedId,
        name,
        sandbox.params,
        summary,
      );
      if (res.ok) {
        setNotice(`Saved scenario "${res.data.name}".`);
        setScenarioName('');
        loadSaved(targets.selectedId);
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else {
        setSaveError(res.error);
      }
    });
  };

  const e = sandbox.evaluation;
  const cognition = sandbox.params['intelligence.cognitiveRateHz'] ?? 0;
  const temporal = useMemo(
    () =>
      computeTemporalAdaptation({
        cognitiveRateHz: cognition,
        environmentalChangeRate: ENVIRONMENT_RATES.climatic,
      }),
    [cognition],
  );

  return (
    <>
      <TopNav title="Scenario Sandbox" subtitle="Live parameter tuning · instant recompute" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Presets */}
        <Card className="space-y-3" padded>
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <Zap className="h-4 w-4 text-electric" /> Scenario presets
            </h3>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset to Earth
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SCENARIO_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                title={p.description}
                className="rounded-btn border border-border bg-surface-2/60 px-3 py-2 text-caption font-semibold text-text-secondary transition hover:border-electric hover:text-white"
              >
                {p.name}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          {/* Sliders */}
          <Card className="space-y-5" padded>
            <h3 className="text-h6 font-semibold text-text-primary">Parameters</h3>
            <div className="space-y-5">
              {TUNABLE_PARAMETERS.map((p) => (
                <ParameterSlider
                  key={p.key}
                  param={p}
                  value={sandbox.params[p.key] ?? p.min}
                  onChange={(v) => onParam(p.key, p.label, v)}
                />
              ))}
            </div>
          </Card>

          {/* Live evaluation */}
          <div className="space-y-4">
            <Card className="space-y-3" padded>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-h6 font-semibold text-text-primary">Live evaluation</h3>
                <span className="text-h5 font-bold text-text-primary">
                  {e.overallScore}/100
                </span>
              </div>
              <p className="text-caption leading-relaxed text-text-secondary">{e.summary}</p>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricWithProvenance label="Habitability" metric={e.habitability} />
              <MetricWithProvenance label="Life" metric={e.lifePlausibility} />
              <MetricWithProvenance label="Intelligence" metric={e.intelligencePlausibility} />
              <MetricWithProvenance label="Civilization" metric={e.civilizationPlausibility} />
            </div>

            <Card className="space-y-2" padded>
              <h4 className="text-h6 font-semibold text-text-primary">
                Temporal adaptation (climatic regime)
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-h5 font-bold text-text-primary">{temporal.score}/100</span>
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-caption font-semibold text-accent">
                  {temporal.label}
                </span>
              </div>
              <p className="text-caption leading-relaxed text-text-muted">{temporal.explanation}</p>
            </Card>
          </div>
        </div>

        {/* Impact cascade from last change */}
        <Card className="space-y-3" padded>
          <h3 className="text-h6 font-semibold text-text-primary">Last recalculation cascade</h3>
          <p className="text-caption text-text-muted">
            {sandbox.lastImpact
              ? `${sandbox.lastImpact.affectedCount} downstream nodes recomputed.`
              : 'Adjust a slider or apply a preset to see the cascade.'}
          </p>
          {sandbox.lastImpact ? (
            <ImpactChainCascade trigger={sandbox.lastTrigger} steps={sandbox.lastImpact.steps} />
          ) : null}
        </Card>

        {/* Save scenario */}
        <Card className="space-y-3" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Save className="h-4 w-4 text-electric" /> Save scenario
          </h3>
          {targets.error ? <ErrorCard message={targets.error} /> : null}
          {saveError ? <ErrorCard message={saveError} /> : null}
          {notice ? <SuccessNotice message={notice} /> : null}
          {canWrite ? (
            <div className="flex flex-wrap items-end gap-3">
              <SimulationPicker
                simulations={targets.simulations}
                value={targets.selectedId}
                onChange={(id) => {
                  targets.setSelectedId(id);
                  loadSaved(id);
                }}
              />
              <div className="space-y-1.5">
                <span className="block text-label text-text-secondary">Name</span>
                <input
                  value={scenarioName}
                  onChange={(ev) => setScenarioName(ev.target.value)}
                  placeholder={sandbox.lastTrigger}
                  className="rounded-btn border border-border bg-surface/90 px-3 py-2 text-sm text-text-primary outline-none focus:border-electric"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={onSaveScenario}
                disabled={pending || targets.loading || !targets.selectedId}
                title={
                  targets.selectedId
                    ? 'Persist the current sandbox parameters'
                    : 'Select a saved simulation first'
                }
              >
                <Save className="h-4 w-4" /> Save current parameters
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-caption text-text-secondary">
                {authExpired
                  ? 'Your session expired. Sign in again to save this scenario.'
                  : 'Saving a scenario requires an account. You can still explore the sandbox freely.'}
              </p>
              <SignInPrompt message="Sign in to save" redirectedFrom={pathname} />
            </div>
          )}

          {saved && saved.length ? (
            <div className="space-y-2">
              <p className="text-label text-text-muted">Saved scenarios</p>
              <ul className="space-y-2">
                {saved.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2"
                  >
                    <span className="truncate text-body-sm font-medium text-text-primary">
                      {s.name}
                    </span>
                    <span className="font-mono text-caption text-text-muted">
                      {s.created_at}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : saved ? (
            <p className="text-caption text-text-muted">No saved scenarios yet.</p>
          ) : null}
        </Card>
      </main>
    </>
  );
}
