'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav, Card, Button } from '@hsi/ui';
import { ArrowLeft, Route, Save } from 'lucide-react';
import { explainNode, type GraphNode } from '@hsi/simulation-engine';
import type { SimulationProvenanceRecord } from '@hsi/shared-types';
import {
  getGraph,
  getGraphIndex,
  getBaseState,
  WORLD_LIST,
  type WorldId,
} from '@/lib/worldforge/worlds';
import { ProvenancePanel } from '@/components/worldforge/ProvenancePanel';
import { ScientificConfidenceChip } from '@/components/worldforge/ScientificConfidenceChip';
import { categoryColor, fmtNum, tierStyle } from '@/lib/worldforge/confidence';
import {
  ErrorCard,
  SuccessNotice,
  SimulationPicker,
  SignInPrompt,
} from '@/components/worldforge/PersistenceUI';
import { useSimulationTargets } from '@/components/worldforge/useSimulationTargets';
import {
  saveProvenanceAction,
  listProvenanceAction,
} from '@/app/dashboard/worldforge/actions';
import { worldStateToJson } from '@/lib/worldforge/mappers';

export function ProvenanceClient({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const [worldId, setWorldId] = useState<WorldId>('earth');
  const graph = useMemo(() => getGraph(worldId), [worldId]);
  const index = useMemo(() => getGraphIndex(worldId), [worldId]);

  // Default to a node with a rich upstream chain (atmosphere density).
  const defaultNode =
    graph.nodes.find((n) => n.id === 'planet.atmDensity')?.id ?? graph.nodes[0]?.id ?? '';
  const [nodeId, setNodeId] = useState(defaultNode);

  // Reset selection if the world changed and the node no longer exists.
  const activeNodeId = index.nodeById.has(nodeId) ? nodeId : defaultNode;

  const explanation = useMemo(
    () => explainNode(graph, activeNodeId, index),
    [graph, activeNodeId, index],
  );
  const node = index.nodeById.get(activeNodeId);
  const labelFor = (id: string): string => index.nodeById.get(id)?.label ?? id;

  // Group nodes by category for the selector.
  const grouped = useMemo(() => groupByCategory(graph.nodes), [graph]);

  // --- persistence ----------------------------------------------------------
  const targets = useSimulationTargets();
  const [persisted, setPersisted] = useState<SimulationProvenanceRecord[] | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [pending, startSave] = useTransition();
  const canWrite = isAuthenticated && !authExpired;

  const loadPersisted = useCallback((simId: string) => {
    if (!simId) return;
    listProvenanceAction(simId).then((res) => {
      if (res.ok) setPersisted(res.data);
      else setSaveError(res.error);
    });
  }, []);

  useEffect(() => {
    if (targets.selectedId) loadPersisted(targets.selectedId);
  }, [targets.selectedId, loadPersisted]);

  const onPersist = () => {
    if (!targets.selectedId) return;
    setSaveError(null);
    setNotice(null);
    const stateJson = worldStateToJson(getBaseState(worldId));
    startSave(async () => {
      const res = await saveProvenanceAction(targets.selectedId, stateJson);
      if (res.ok) {
        setNotice(`Persisted ${res.data.length} provenance rows.`);
        loadPersisted(targets.selectedId);
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else {
        setSaveError(res.error);
      }
    });
  };

  return (
    <>
      <TopNav title="Provenance" subtitle="Trace any value back to its causes" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="space-y-4" padded>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-text-secondary">World</span>
            {WORLD_LIST.map((w) => (
              <button
                key={w.id}
                onClick={() => setWorldId(w.id)}
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
          <div className="space-y-1.5">
            <span className="block text-label text-text-secondary">Graph node</span>
            <select
              value={activeNodeId}
              onChange={(e) => setNodeId(e.target.value)}
              className="w-full max-w-md appearance-none rounded-btn border border-border bg-surface/90 px-3 py-2 text-sm text-text-primary outline-none focus:border-electric"
            >
              {grouped.map((g) => (
                <optgroup key={g.category} label={g.category}>
                  {g.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </Card>

        {/* Persist provenance for this world */}
        <Card className="space-y-3" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Save className="h-4 w-4 text-electric" /> Persist provenance for this world
          </h3>
          <p className="text-caption text-text-muted">
            Rebuilds the dependency graph and writes each node&apos;s provenance to
            simulation_provenance for the selected simulation.
          </p>
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
                  loadPersisted(id);
                }}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={onPersist}
                disabled={pending || targets.loading || !targets.selectedId}
                title={
                  targets.selectedId
                    ? 'Persist provenance rows'
                    : 'Select a saved simulation first'
                }
              >
                <Save className="h-4 w-4" /> Persist provenance
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-caption text-text-secondary">
                {authExpired
                  ? 'Your session expired. Sign in again to persist provenance.'
                  : 'Persisting provenance requires an account. Tracing any value is free.'}
              </p>
              <SignInPrompt message="Sign in to save" redirectedFrom={pathname} />
            </div>
          )}

          {persisted && persisted.length ? (
            <div className="space-y-2">
              <p className="text-label text-text-muted">
                Persisted provenance ({persisted.length} rows)
              </p>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {persisted.slice(0, 50).map((r) => {
                  const style = r.scientific_tier
                    ? tierStyle(r.scientific_tier)
                    : null;
                  return (
                    <li
                      key={r.id}
                      className="rounded-lg border border-border bg-surface-2/40 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-caption text-text-primary">
                          {r.node_id ?? '—'}
                        </span>
                        {style ? (
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold"
                            style={{
                              color: style.color,
                              backgroundColor: style.soft,
                            }}
                          >
                            {style.label}
                          </span>
                        ) : null}
                      </div>
                      {r.reason ? (
                        <p className="mt-0.5 line-clamp-2 text-caption text-text-muted">
                          {r.reason}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : persisted ? (
            <p className="text-caption text-text-muted">
              No persisted provenance yet for this simulation.
            </p>
          ) : null}
        </Card>

        {node ? (
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            {/* WHY chain */}
            <Card className="space-y-4" padded>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <Route className="h-4 w-4 text-electric" /> Why is {node.label} ={' '}
                    {fmtNum(node.value, node.unit)}?
                  </h3>
                  <p className="mt-1 text-caption leading-relaxed text-text-secondary">
                    {explanation.summary}
                  </p>
                </div>
                <ScientificConfidenceChip
                  tier={explanation.scientificTier}
                  confidence={explanation.confidence}
                />
              </div>

              <div>
                <p className="mb-2 text-label text-text-muted">
                  Causal chain (root cause → this value)
                </p>
                {explanation.chain.length ? (
                  <ol className="space-y-0">
                    {explanation.chain.map((c, i) => {
                      const cn = index.nodeById.get(c.id);
                      const color = categoryColor(cn?.category ?? 'planet');
                      return (
                        <li key={c.id}>
                          {i > 0 ? (
                            <div className="flex items-center gap-2 py-1 pl-4 text-caption text-text-muted">
                              <ArrowLeft className="h-3.5 w-3.5 rotate-[-90deg]" />
                              <span className="italic">{c.relation}</span>
                            </div>
                          ) : null}
                          <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 text-body-sm font-medium text-text-primary">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                {c.label}
                              </span>
                              <span className="font-mono text-caption text-text-secondary">
                                {fmtNum(c.value)}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {/* terminal: the node itself */}
                    <li>
                      <div className="flex items-center gap-2 py-1 pl-4 text-caption text-text-muted">
                        <ArrowLeft className="h-3.5 w-3.5 rotate-[-90deg]" />
                        <span className="italic">resolves to</span>
                      </div>
                      <div
                        className="rounded-lg border px-3 py-2"
                        style={{
                          borderColor: 'rgba(37,99,235,0.5)',
                          backgroundColor: 'rgba(37,99,235,0.12)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-body-sm font-semibold text-text-primary">
                            {node.label}
                          </span>
                          <span className="font-mono text-caption text-text-primary">
                            {fmtNum(node.value, node.unit)}
                          </span>
                        </div>
                      </div>
                    </li>
                  </ol>
                ) : (
                  <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-3 text-caption text-text-muted">
                    This is a root input — taken directly from the world state.
                  </p>
                )}
              </div>
            </Card>

            {/* Provenance + assumptions */}
            <div className="space-y-4">
              <ProvenancePanel
                provenance={node.provenance}
                title="Provenance"
                resolveLabel={labelFor}
              />
              {node.assumptions.length ? (
                <Card className="space-y-2" padded>
                  <h4 className="text-h6 font-semibold text-text-primary">Assumptions</h4>
                  <ul className="space-y-1">
                    {node.assumptions.map((a, i) => (
                      <li key={i} className="text-caption text-text-secondary">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

function groupByCategory(
  nodes: GraphNode[],
): { category: string; nodes: GraphNode[] }[] {
  const map = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const list = map.get(n.category) ?? [];
    list.push(n);
    map.set(n.category, list);
  }
  return Array.from(map.entries()).map(([category, ns]) => ({ category, nodes: ns }));
}
