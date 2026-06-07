'use client';

// =============================================================================
// Simulations — client child.
// Receives world/simulation records as props, computes reports in-browser via the
// engine, and exposes persistence actions (save version, clone, publish, create
// simulation). Falls back to engine demo worlds (read-only) when no live worlds
// exist or Supabase is unconfigured.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import {
  Orbit,
  GitCompareArrows,
  History,
  Save,
  Copy,
  Globe,
  Lock,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import {
  evaluateWorld,
  diffWorlds,
  createEarthState,
  type WorldEvaluation,
  type WorldState,
} from '@hsi/simulation-engine';
import { createChronidPrime } from '@hsi/counterfactuals';
import type {
  WorldRecord,
  SimulationRecord,
  SimulationVersionRecord,
} from '@hsi/shared-types';
import { MetricWithProvenance } from '@/components/worldforge/MetricWithProvenance';
import { DiffViewer } from '@/components/worldforge/DiffViewer';
import { ScientificConfidenceChip } from '@/components/worldforge/ScientificConfidenceChip';
import {
  ErrorCard,
  OfflineNotice,
  SuccessNotice,
  SignInPrompt,
} from '@/components/worldforge/PersistenceUI';
import { jsonToWorldState, worldStateToJson } from '@/lib/worldforge/mappers';
import {
  saveVersionAction,
  cloneWorldAction,
  setPublishedAction,
  createSimulationAction,
  listVersionsAction,
} from '@/app/dashboard/worldforge/actions';

// A unified, in-memory view of a selectable world (live record or demo).
interface WorldEntry {
  id: string;
  name: string;
  description: string;
  state: WorldState;
  evaluation: WorldEvaluation;
  /** The backing live record (null for engine demo entries). */
  record: WorldRecord | null;
  isPublic: boolean;
}

function demoEntries(): WorldEntry[] {
  const earth = createEarthState();
  const chronid = createChronidPrime();
  return [
    {
      id: 'demo-earth',
      name: 'Earth (demo)',
      description: 'The reference world — carbon/water biochemistry, G-type star.',
      state: earth,
      evaluation: evaluateWorld(earth),
      record: null,
      isPublic: false,
    },
    {
      id: 'demo-chronid',
      name: 'Chronid Prime (demo)',
      description: 'Frozen high-gravity super-earth, crystal genetics, glacial cognition.',
      state: chronid,
      evaluation: evaluateWorld(chronid),
      record: null,
      isPublic: false,
    },
  ];
}

export function SimulationsClient({
  worlds,
  simulations,
  loadError,
  isAuthenticated,
}: {
  worlds: WorldRecord[];
  simulations: SimulationRecord[];
  loadError: string | null;
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const isDemo = worlds.length === 0;

  const entries = useMemo<WorldEntry[]>(() => {
    if (isDemo) return demoEntries();
    return worlds.map((w) => {
      const state = jsonToWorldState(w.base_state);
      return {
        id: w.id,
        name: w.name,
        description: w.description ?? 'Persisted WorldForge world.',
        state,
        evaluation: evaluateWorld(state),
        record: w,
        isPublic: w.is_public,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worlds, isDemo]);

  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? '');
  const selected = entries.find((e) => e.id === selectedId) ?? entries[0];

  // Diff state.
  const [diffA, setDiffA] = useState(entries[0]?.id ?? '');
  const [diffB, setDiffB] = useState(entries[1]?.id ?? entries[0]?.id ?? '');
  const stateById = (id: string): WorldState =>
    entries.find((e) => e.id === id)?.state ?? entries[0]?.state ?? createEarthState();
  const diff = useMemo(
    () => diffWorlds(stateById(diffA), stateById(diffB)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diffA, diffB, entries],
  );

  // Simulations bound to the selected world.
  const worldSims = useMemo(
    () =>
      selected?.record
        ? simulations.filter((s) => s.world_id === selected.record!.id)
        : [],
    [simulations, selected],
  );
  const [simId, setSimId] = useState('');
  const activeSimId =
    simId && worldSims.some((s) => s.id === simId)
      ? simId
      : worldSims[0]?.id ?? '';

  // Action plumbing.
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [versions, setVersions] = useState<SimulationVersionRecord[] | null>(null);
  // Set when a write returns code:'AUTH_REQUIRED' (e.g. session expired) so we
  // surface the same sign-in prompt as the up-front disabled state.
  const [authExpired, setAuthExpired] = useState(false);

  // Writes are available only to an authenticated user whose session hasn't
  // expired mid-session.
  const canWrite = isAuthenticated && !authExpired;

  const reset = () => {
    setActionError(null);
    setNotice(null);
    setAuthExpired(false);
  };

  // Centralized failure handling: route AUTH_REQUIRED to the sign-in prompt,
  // everything else to the error card.
  const handleFailure = (res: { error: string; code?: string }) => {
    if (res.code === 'AUTH_REQUIRED') setAuthExpired(true);
    else setActionError(res.error);
  };

  const loadVersions = (id: string) => {
    reset();
    startTransition(async () => {
      const res = await listVersionsAction(id);
      if (res.ok) setVersions(res.data);
      else setActionError(res.error);
    });
  };

  const onSaveVersion = () => {
    if (!activeSimId || !selected) return;
    reset();
    startTransition(async () => {
      const res = await saveVersionAction(
        activeSimId,
        worldStateToJson(selected.state),
        `${selected.name} snapshot`,
      );
      if (res.ok) {
        setNotice(`Saved version v${res.data.version}.`);
        const list = await listVersionsAction(activeSimId);
        if (list.ok) setVersions(list.data);
      } else {
        handleFailure(res);
      }
    });
  };

  const onClone = () => {
    if (!selected?.record) return;
    reset();
    startTransition(async () => {
      const res = await cloneWorldAction(selected.record!.id);
      if (res.ok) setNotice(`Cloned to "${res.data.name}". Refresh to see it.`);
      else handleFailure(res);
    });
  };

  const onTogglePublish = () => {
    if (!selected?.record) return;
    reset();
    const next = !selected.isPublic;
    startTransition(async () => {
      const res = await setPublishedAction(selected.record!.id, next);
      if (res.ok)
        setNotice(next ? 'World published.' : 'World unpublished.');
      else handleFailure(res);
    });
  };

  const onCreateSimulation = () => {
    if (!selected?.record) return;
    reset();
    startTransition(async () => {
      const res = await createSimulationAction(
        selected.record!.id,
        `${selected.name} simulation`,
        selected.record!.universe_type,
        worldStateToJson(selected.state),
      );
      if (res.ok) setNotice(`Created simulation "${res.data.name}". Refresh to see it.`);
      else handleFailure(res);
    });
  };

  if (!selected) {
    return (
      <main className="space-y-6 p-5 lg:p-6">
        <ErrorCard message="No worlds available to display." title="Nothing to show" />
      </main>
    );
  }

  const e = selected.evaluation;

  return (
    <main className="space-y-6 p-5 lg:p-6">
      {loadError ? <ErrorCard message={loadError} /> : null}
      {isDemo ? (
        <OfflineNotice message="No saved worlds yet — showing engine demo worlds (read-only). Persistence actions need a saved world/simulation." />
      ) : null}
      {actionError ? <ErrorCard message={actionError} /> : null}
      {notice ? <SuccessNotice message={notice} /> : null}

      {/* World selector */}
      <div className="grid gap-4 sm:grid-cols-3">
        {entries.map((s) => {
          const active = s.id === selected.id;
          return (
            <button key={s.id} onClick={() => setSelectedId(s.id)} className="text-left">
              <Card
                className={`h-full space-y-2 transition ${
                  active ? 'border-electric/60 shadow-glow' : ''
                }`}
                interactive
                padded
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <Orbit className="h-4 w-4 text-electric" />
                    {s.name}
                  </span>
                  <span className="text-caption font-bold text-text-primary">
                    {s.evaluation.overallScore}/100
                  </span>
                </div>
                <p className="text-caption leading-snug text-text-secondary">
                  {s.description}
                </p>
                {s.record ? (
                  <span
                    className={`inline-flex items-center gap-1 text-caption font-semibold ${
                      s.isPublic ? 'text-verified' : 'text-text-muted'
                    }`}
                  >
                    {s.isPublic ? (
                      <Globe className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                    {s.isPublic ? 'Public' : 'Private'}
                  </span>
                ) : null}
              </Card>
            </button>
          );
        })}
      </div>

      {/* Persistence actions */}
      <Card className="space-y-3" padded>
        <h3 className="text-h6 font-semibold text-text-primary">Actions</h3>
        {selected.record ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <span className="block text-label text-text-secondary">
                  Target simulation
                </span>
                {worldSims.length ? (
                  <select
                    value={activeSimId}
                    onChange={(ev) => {
                      setSimId(ev.target.value);
                      loadVersions(ev.target.value);
                    }}
                    className="appearance-none rounded-btn border border-border bg-surface/90 px-3 py-2 pr-8 text-sm text-text-primary outline-none focus:border-electric"
                  >
                    {worldSims.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (v{s.latest_version})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-btn border border-border bg-surface-2/40 px-3 py-2 text-caption text-text-muted">
                    No simulations for this world yet.
                  </p>
                )}
              </div>
            </div>
            {/* WRITE actions are gated on auth. Anonymous (or an expired
                session) sees sign-in prompts with the exact gating messages;
                RLS enforces ownership server-side regardless. */}
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSaveVersion}
                  disabled={pending || !activeSimId}
                  title={
                    activeSimId
                      ? 'Recompute & append a new version'
                      : 'Create a simulation first'
                  }
                >
                  <Save className="h-4 w-4" /> Save as new version
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onCreateSimulation}
                  disabled={pending}
                >
                  <PlusCircle className="h-4 w-4" /> Create simulation from this world
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onClone}
                  disabled={pending}
                >
                  <Copy className="h-4 w-4" /> Clone world
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onTogglePublish}
                  disabled={pending}
                >
                  {selected.isPublic ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                  {selected.isPublic ? 'Unpublish' : 'Publish'}
                </Button>
                {activeSimId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadVersions(activeSimId)}
                    disabled={pending}
                  >
                    <RefreshCw className="h-4 w-4" /> Reload versions
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-caption text-text-secondary">
                  {authExpired
                    ? 'Your session expired. Sign in again to continue.'
                    : 'Sign in to save versions, create simulations, clone, or publish. Anyone can view public worlds.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <SignInPrompt message="Sign in to save" redirectedFrom={pathname} />
                  <SignInPrompt
                    message="Sign in to create private worlds"
                    redirectedFrom={pathname}
                  />
                  <SignInPrompt message="Sign in to clone" redirectedFrom={pathname} />
                </div>
                {activeSimId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadVersions(activeSimId)}
                    disabled={pending}
                  >
                    <RefreshCw className="h-4 w-4" /> Reload versions
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <p className="text-caption text-text-muted">
            Demo worlds are read-only. Persistence actions are available once a
            world is saved to Supabase.
          </p>
        )}
      </Card>

      {/* Selected world report */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-h5 font-semibold text-text-primary">
            {selected.name} · report
          </h3>
          <ScientificConfidenceChip
            tier={e.provenance.scientificConfidence.tier}
            confidence={e.provenance.scientificConfidence.confidence}
          />
        </div>
        <Card padded>
          <p className="text-body-sm leading-relaxed text-text-secondary">{e.summary}</p>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricWithProvenance label="Habitability" metric={e.habitability} />
          <MetricWithProvenance label="Life Plausibility" metric={e.lifePlausibility} />
          <MetricWithProvenance label="Intelligence" metric={e.intelligencePlausibility} />
          <MetricWithProvenance label="Civilization" metric={e.civilizationPlausibility} />
        </div>
      </section>

      {/* Versioning + Diff */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Card className="space-y-4" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <History className="h-4 w-4 text-electric" /> Version history
          </h3>
          <p className="text-caption text-text-muted">
            Persisted snapshots from simulation_versions (newest first).
          </p>
          {versions === null ? (
            <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-3 text-caption text-text-muted">
              {activeSimId
                ? 'Select / reload a simulation to load its version history.'
                : 'No simulation selected.'}
            </p>
          ) : versions.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-3 text-caption text-text-muted">
              No versions saved yet for this simulation.
            </p>
          ) : (
            <ol className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-text-primary">
                      {v.label ?? `v${v.version}`}
                    </p>
                    <p className="font-mono text-caption text-text-muted">
                      {v.created_at}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-caption font-semibold text-text-secondary">
                    v{v.version}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="space-y-4" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <GitCompareArrows className="h-4 w-4 text-electric" /> Diff viewer
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <WorldSelect label="Compare" value={diffA} onChange={setDiffA} entries={entries} />
            <WorldSelect label="Against" value={diffB} onChange={setDiffB} entries={entries} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDiffA(diffB);
                setDiffB(diffA);
              }}
            >
              Swap
            </Button>
          </div>
          <DiffViewer
            diff={diff}
            beforeLabel={entries.find((s) => s.id === diffA)?.name ?? diffA}
            afterLabel={entries.find((s) => s.id === diffB)?.name ?? diffB}
          />
        </Card>
      </div>
    </main>
  );
}

function WorldSelect({
  label,
  value,
  onChange,
  entries,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  entries: WorldEntry[];
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-label text-text-secondary">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          className="appearance-none rounded-btn border border-border bg-surface/90 px-3 py-2 pr-8 text-sm text-text-primary outline-none transition focus:border-electric"
        >
          {entries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
