// =============================================================================
// HSI Phase 64 — Evidence Graph panels (server). Graph overview, node/relationship
// distribution, top-connected entities, executive metrics, and the node inspector
// (neighbors, supporting/contradicting evidence, provenance). All values computed.
// The explorer is server-paged: neighbor links navigate via ?node=… (degrades
// gracefully; large graphs never load at once).
// =============================================================================

import type { ReactNode } from 'react';
import { Card, MetricCard } from '@hsi/ui';
import { Network, GitFork, Boxes, ShieldCheck, XOctagon, Layers, ClipboardCheck, ArrowRight } from 'lucide-react';
import type { EvidenceGraphDashboard, ConnectedEntity } from '@/lib/evidence-graph/data';
import type { GraphNode, Neighbor, NodeSummary } from '@/lib/evidence-graph/types';
import { RELATIONSHIP_LABEL, NODE_LABEL } from '@/lib/evidence-graph/catalog';
import type { RelationshipType, NodeType } from '@/lib/evidence-graph/types';

const n = (v: number) => v.toLocaleString('en-US');
const nodeHref = (id: string) => `/dashboard/evidence-graph?node=${encodeURIComponent(id)}`;

export function GraphOverview({ d }: { d: EvidenceGraphDashboard }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="Total nodes" value={n(d.totalNodes)} accent="#3B82F6" icon={Boxes} />
      <MetricCard label="Total edges" value={n(d.totalEdges)} accent="#8B5CF6" icon={GitFork} />
      <MetricCard label="Avg connectivity" value={d.avgConnectivity.toFixed(2)} accent="#10B981" icon={Network} />
    </div>
  );
}

function DistBars({ title, rows, color }: { title: string; rows: { type: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{title}</h3></div>
      {rows.length === 0 ? <p className="text-caption text-text-muted">No data yet — rebuild the graph.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.type} className="space-y-1">
              <div className="flex items-center justify-between text-caption"><span className="text-text-secondary">{r.type}</span><span className="font-semibold tabular-nums text-text-primary">{n(r.count)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round((r.count / max) * 100)}%`, backgroundColor: color, opacity: 0.85 }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function GraphDistributions({ d }: { d: EvidenceGraphDashboard }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <DistBars title="Nodes by type" rows={d.nodeDistribution} color="#3B82F6" />
      <DistBars title="Relationship distribution" rows={d.relationshipDistribution.map((r) => ({ type: RELATIONSHIP_LABEL[r.type as RelationshipType] ?? r.type, count: r.count }))} color="#8B5CF6" />
    </div>
  );
}

function EntityList({ title, rows }: { title: string; rows: ConnectedEntity[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-body-sm font-semibold text-text-primary">{title}</h4>
      {rows.length === 0 ? <p className="text-caption text-text-muted">None yet.</p> : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.node.id} className="flex items-center gap-2 text-body-sm">
              <span className="w-4 shrink-0 text-caption font-semibold tabular-nums text-text-muted">{i + 1}</span>
              <a href={nodeHref(r.node.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{r.node.label}</a>
              <span className="shrink-0 text-caption text-text-muted">{r.degree} links</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ExecutiveGraphMetrics({ d }: { d: EvidenceGraphDashboard }) {
  return (
    <Card className="space-y-5 border-electric/30">
      <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Executive graph metrics</h3></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <EntityList title="Top connected entities" rows={d.topConnected} />
        <EntityList title="Top sources" rows={d.topSources} />
        <EntityList title="Most referenced claims" rows={d.mostReferencedClaims} />
        <EntityList title="Most corrected reports" rows={d.mostCorrectedReports} />
        <EntityList title="Top actors" rows={d.topActors} />
        <EntityList title="Most connected narratives" rows={d.mostConnectedNarratives} />
      </div>
    </Card>
  );
}

export function SearchResults({ results }: { results: GraphNode[] }) {
  if (results.length === 0) return null;
  return (
    <Card className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">Search results</h3>
      <ul className="space-y-1.5">
        {results.map((nNode) => (
          <li key={nNode.id} className="flex items-center gap-2 text-body-sm">
            <span className="shrink-0 rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-semibold text-text-secondary">{NODE_LABEL[nNode.nodeType as NodeType] ?? nNode.nodeType}</span>
            <a href={nodeHref(nNode.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{nNode.label}</a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function nbHref(nb: Neighbor): string { return nodeHref(nb.node.id); }

export function NodeInspector({ node, summary, neighbors }: { node: GraphNode; summary: NodeSummary; neighbors: Neighbor[] }) {
  const supporting = neighbors.filter((x) => x.edge.relationshipType === 'SUPPORTS');
  const contradicting = neighbors.filter((x) => x.edge.relationshipType === 'CONTRADICTS');
  const others = neighbors.filter((x) => x.edge.relationshipType !== 'SUPPORTS' && x.edge.relationshipType !== 'CONTRADICTS');
  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">{node.label}</h3>
        <span className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-semibold text-text-secondary">{NODE_LABEL[node.nodeType] ?? node.nodeType}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Sources" value={summary.connectedSources} />
        <Stat label="Signals" value={summary.connectedSignals} />
        <Stat label="Evidence" value={summary.connectedEvidence} />
        <Stat label="Reports" value={summary.connectedReports} />
        <Stat label="Corrections" value={summary.connectedCorrections} />
        <Stat label="Supporting" value={summary.supportingEvidence} tone="text-verified" />
        <Stat label="Contradicting" value={summary.contradictingEvidence} tone="text-risk" />
        <Stat label="Relationships" value={summary.relationshipCount} />
        <Stat label="Graph depth" value={summary.graphDepth} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NeighborGroup title="Supporting evidence" icon={<ShieldCheck className="h-4 w-4 text-verified" />} rows={supporting} />
        <NeighborGroup title="Contradicting evidence" icon={<XOctagon className="h-4 w-4 text-risk" />} rows={contradicting} />
      </div>

      <NeighborGroup title="All relationships" icon={<GitFork className="h-4 w-4 text-electric" />} rows={others} showRelationship />
    </Card>
  );
}

function NeighborGroup({ title, icon, rows, showRelationship = false }: { title: string; icon: ReactNode; rows: Neighbor[]; showRelationship?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">{icon}<h4 className="text-body-sm font-semibold text-text-primary">{title}</h4><span className="text-caption text-text-muted">{rows.length}</span></div>
      {rows.length === 0 ? <p className="text-caption text-text-muted">None.</p> : (
        <ul className="space-y-1.5">
          {rows.slice(0, 40).map((nb) => (
            <li key={nb.edge.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-1.5 text-body-sm">
              {showRelationship ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{RELATIONSHIP_LABEL[nb.edge.relationshipType]}</span> : null}
              <span className="shrink-0 text-text-muted">{nb.direction === 'outgoing' ? '→' : '←'}</span>
              <a href={nbHref(nb)} className="min-w-0 flex-1 truncate text-electric hover:underline">{nb.node.label}</a>
              <span className="shrink-0 text-caption text-text-muted" title={nb.edge.provenance ?? ''}>{Math.round(nb.edge.confidence * 100)}%</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-text-muted" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'text-text-primary' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className={`text-h6 font-bold tabular-nums ${tone}`}>{value.toLocaleString('en-US')}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
