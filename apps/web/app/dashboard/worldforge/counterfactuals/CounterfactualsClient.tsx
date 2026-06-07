'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav, Card, Button } from '@hsi/ui';
import { GitCompareArrows, Play, Wrench, Save } from 'lucide-react';
import type { CounterfactualRecord } from '@hsi/shared-types';
import {
  applyCounterfactual,
  EXAMPLE_COUNTERFACTUALS,
  type Counterfactual,
  type CounterfactualOp,
  type CounterfactualResult,
} from '@hsi/counterfactuals';
import { TUNABLE_PARAMETERS } from '@hsi/counterfactuals';
import { WORLD_LIST, getBaseState, type WorldId } from '@/lib/worldforge/worlds';
import { ImpactChainCascade } from '@/components/worldforge/ImpactChainCascade';
import {
  ErrorCard,
  SuccessNotice,
  SimulationPicker,
  SignInPrompt,
} from '@/components/worldforge/PersistenceUI';
import { useSimulationTargets } from '@/components/worldforge/useSimulationTargets';
import {
  saveCounterfactualAction,
  listCounterfactualsAction,
} from '@/app/dashboard/worldforge/actions';
import { impactChainToJson } from '@/lib/worldforge/mappers';

const OPS: CounterfactualOp[] = ['set', 'multiply', 'add'];

export function CounterfactualsClient({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const [worldId, setWorldId] = useState<WorldId>('earth');
  const [result, setResult] = useState<{ label: string; res: CounterfactualResult } | null>(null);

  // Free-form builder state.
  const [target, setTarget] = useState(TUNABLE_PARAMETERS[0].key);
  const [op, setOp] = useState<CounterfactualOp>('multiply');
  const [value, setValue] = useState('2');

  const state = getBaseState(worldId);

  const run = (cf: Counterfactual) => {
    const res = applyCounterfactual(state, cf);
    setResult({ label: cf.label, res });
  };

  const runBuilder = () => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const param = TUNABLE_PARAMETERS.find((p) => p.key === target);
    const cf: Counterfactual = {
      target,
      op,
      value: num,
      label: `${param?.label ?? target} ${op} ${num}`,
    };
    run(cf);
  };

  const targetLabel = useMemo(
    () => TUNABLE_PARAMETERS.find((p) => p.key === target)?.label ?? target,
    [target],
  );

  // --- persistence ----------------------------------------------------------
  const targets = useSimulationTargets();
  const [saved, setSaved] = useState<CounterfactualRecord[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [pending, startSave] = useTransition();
  const canWrite = isAuthenticated && !authExpired;

  const loadSaved = useCallback((simId: string) => {
    if (!simId) return;
    listCounterfactualsAction(simId).then((res) => {
      if (res.ok) setSaved(res.data);
      else setSaveError(res.error);
    });
  }, []);

  useEffect(() => {
    if (targets.selectedId) loadSaved(targets.selectedId);
  }, [targets.selectedId, loadSaved]);

  const onSave = () => {
    if (!targets.selectedId || !result) return;
    setSaveError(null);
    setNotice(null);
    const { res } = result;
    startSave(async () => {
      const out = await saveCounterfactualAction(
        targets.selectedId,
        result.label,
        { explanation: res.explanation, affectedNodes: res.affectedNodes },
        impactChainToJson(res.impactChain),
        res.explanation,
        res.confidence,
        res.affectedNodes.length,
      );
      if (out.ok) {
        setNotice(`Saved counterfactual "${out.data.name}".`);
        loadSaved(targets.selectedId);
      } else if (out.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else {
        setSaveError(out.error);
      }
    });
  };

  return (
    <>
      <TopNav title="Counterfactuals" subtitle="What-if cascades & impact analysis" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* world selector */}
        <Card className="flex flex-wrap items-center justify-between gap-3" padded>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-text-secondary">Base world</span>
            {WORLD_LIST.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setWorldId(w.id);
                  setResult(null);
                }}
                className={`rounded-btn border px-3 py-1.5 text-caption font-semibold transition ${
                  w.id === worldId
                    ? 'border-electric/60 bg-primary/15 text-white'
                    : 'border-border bg-surface-2/60 text-text-secondary hover:border-electric hover:text-white'
                }`}
              >
                {w.name}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          {/* Example list + builder */}
          <div className="space-y-4">
            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <GitCompareArrows className="h-4 w-4 text-electric" /> Example counterfactuals
              </h3>
              <div className="space-y-2">
                {EXAMPLE_COUNTERFACTUALS.map((cf) => (
                  <div
                    key={cf.label}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium text-text-primary">
                        {cf.label}
                      </p>
                      <p className="font-mono text-caption text-text-muted">
                        {cf.special ? `special: ${cf.special}` : `${cf.target} · ${cf.op} ${cf.value}`}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => run(cf)}>
                      <Play className="h-3.5 w-3.5" /> Run
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Wrench className="h-4 w-4 text-electric" /> Free-form builder
              </h3>
              <div className="space-y-3">
                <Field label="Target parameter">
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full appearance-none rounded-btn border border-border bg-surface/90 px-3 py-2 text-sm text-text-primary outline-none focus:border-electric"
                  >
                    {TUNABLE_PARAMETERS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label} ({p.key})
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Operation">
                    <select
                      value={op}
                      onChange={(e) => setOp(e.target.value as CounterfactualOp)}
                      className="w-full appearance-none rounded-btn border border-border bg-surface/90 px-3 py-2 text-sm text-text-primary outline-none focus:border-electric"
                    >
                      {OPS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Value">
                    <input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-btn border border-border bg-surface/90 px-3 py-2 text-sm text-text-primary outline-none focus:border-electric"
                    />
                  </Field>
                </div>
                <Button variant="primary" size="sm" onClick={runBuilder} className="w-full">
                  <Play className="h-4 w-4" /> Run “{targetLabel} {op} {value}”
                </Button>
              </div>
            </Card>
          </div>

          {/* Result */}
          <Card className="space-y-4" padded>
            <h3 className="text-h6 font-semibold text-text-primary">Impact cascade</h3>
            {result ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ResultStat label="Affected nodes" value={String(result.res.affectedNodes.length)} />
                  <ResultStat
                    label="Total steps"
                    value={String(result.res.impactChain.affectedCount)}
                  />
                  <ResultStat
                    label="Confidence"
                    value={`${Math.round(result.res.confidence * 100)}%`}
                  />
                </div>
                <div className="rounded-card border border-border bg-surface-2/40 p-3">
                  <p className="text-caption leading-relaxed text-text-secondary">
                    {result.res.explanation}
                  </p>
                </div>
                <ImpactChainCascade
                  trigger={result.label}
                  steps={result.res.impactChain.steps}
                />

                {/* Save counterfactual */}
                <div className="space-y-3 rounded-card border border-border bg-surface-2/30 p-3">
                  <h4 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <Save className="h-4 w-4 text-electric" /> Save counterfactual
                  </h4>
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
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={onSave}
                        disabled={pending || targets.loading || !targets.selectedId}
                        title={
                          targets.selectedId
                            ? 'Persist this counterfactual'
                            : 'Select a saved simulation first'
                        }
                      >
                        <Save className="h-4 w-4" /> Save “{result.label}”
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-caption text-text-secondary">
                        {authExpired
                          ? 'Your session expired. Sign in again to save this counterfactual.'
                          : 'Saving a counterfactual requires an account. Running what-if cascades is free.'}
                      </p>
                      <SignInPrompt message="Sign in to save" redirectedFrom={pathname} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-card border border-border bg-surface-2/40 px-4 py-10 text-center text-caption text-text-muted">
                Run an example or build your own to see the cascade ripple through the world.
              </div>
            )}

            {saved && saved.length ? (
              <div className="space-y-2">
                <p className="text-label text-text-muted">Saved counterfactuals</p>
                <ul className="space-y-2">
                  {saved.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-lg border border-border bg-surface-2/40 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-body-sm font-medium text-text-primary">
                          {c.name}
                        </span>
                        <span className="text-caption font-semibold text-text-secondary">
                          {c.affected_nodes ?? 0} nodes ·{' '}
                          {Math.round((c.confidence ?? 0) * 100)}%
                        </span>
                      </div>
                      {c.explanation ? (
                        <p className="mt-0.5 line-clamp-2 text-caption text-text-muted">
                          {c.explanation}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-label text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <p className="text-label text-text-muted">{label}</p>
      <p className="mt-1 text-h6 font-bold text-text-primary">{value}</p>
    </div>
  );
}
