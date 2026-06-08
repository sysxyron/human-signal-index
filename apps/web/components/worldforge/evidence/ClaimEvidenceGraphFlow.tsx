'use client';

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Position,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, FileText, BookOpen } from 'lucide-react';
import { supportTypeStyle } from '@/lib/worldforge/evidence-view';
import type {
  ClaimEvidenceGraph,
  ClaimEvidenceGraphNode,
} from '@/lib/worldforge/evidence-intel-view';
import { tierStyle } from '@/lib/worldforge/confidence';

export interface ClaimEvidenceGraphFlowProps {
  graph: ClaimEvidenceGraph;
  className?: string;
}

const CLAIM_X = 0;
const SOURCE_X = 420;
const ROW_HEIGHT = 76;

/** Edge stroke color by support type — supports green, contradicts red, etc. */
function edgeColor(supportType: string): string {
  return supportTypeStyle(supportType).color;
}

/**
 * Interactive React Flow view of a run's claim->evidence graph. Layered layout
 * (claims left, sources right), edges colored by support type, a click-to-open
 * side panel, and a legend. Mirrors DependencyGraphFlow's perf/layout patterns
 * (memoized nodes/edges, onlyRenderVisibleElements). ssr:false is handled by the
 * dynamic import at the route level.
 */
export function ClaimEvidenceGraphFlow({
  graph,
  className = '',
}: ClaimEvidenceGraphFlowProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, ClaimEvidenceGraphNode>();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
  }, [graph]);

  const { rfNodes, rfEdges } = useMemo(() => {
    let claimRow = 0;
    let sourceRow = 0;
    const nodes: Node[] = graph.nodes.map((n) => {
      const isClaim = n.kind === 'claim';
      const x = isClaim ? CLAIM_X : SOURCE_X;
      const y = (isClaim ? claimRow++ : sourceRow++) * ROW_HEIGHT;

      const accent = isClaim
        ? tierStyle(n.tier ?? 'speculative').color
        : '#06B6D4';

      return {
        id: n.id,
        position: { x, y },
        data: { label: shortLabel(n.label, isClaim ? 64 : 56) },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 300,
          borderRadius: 12,
          border: `1px solid ${accent}55`,
          borderLeft: `4px solid ${accent}`,
          background: 'rgba(17,26,46,0.92)',
          color: '#F8FAFC',
          fontSize: 11,
          padding: 8,
        },
      } satisfies Node;
    });

    const edges: Edge[] = graph.edges.map((e) => {
      const color = edgeColor(e.supportType);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: e.supportType === 'contradicts',
        style: { stroke: color, strokeWidth: 1.5 },
        label: undefined,
      } satisfies Edge;
    });

    return { rfNodes: nodes, rfEdges: edges };
  }, [graph]);

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    setSelectedId(node.id);
  }, []);

  const selected = selectedId ? nodeById.get(selectedId) : undefined;

  return (
    <div className={`relative ${className}`}>
      <Legend />
      <div className="h-[640px] w-full overflow-hidden rounded-card border border-border bg-background-deep/60">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodeClick={onNodeClick}
          onlyRenderVisibleElements
          fitView
          minZoom={0.05}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background color="#1F2A44" gap={24} />
          <Controls className="wf-flow-controls" showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const gn = nodeById.get(n.id);
              if (!gn) return '#334155';
              return gn.kind === 'claim'
                ? tierStyle(gn.tier ?? 'speculative').color
                : '#06B6D4';
            }}
            maskColor="rgba(2,4,10,0.7)"
            style={{ background: '#0A0F1F', border: '1px solid #1F2A44' }}
          />
        </ReactFlow>
      </div>

      {selected ? (
        <NodeSidePanel node={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

function shortLabel(label: string, max: number): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const LEGEND_ITEMS: { type: string }[] = [
  { type: 'supports' },
  { type: 'contradicts' },
  { type: 'background' },
  { type: 'unclear' },
];

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        Edge color
      </span>
      {LEGEND_ITEMS.map(({ type }) => {
        const s = supportTypeStyle(type);
        return (
          <span
            key={type}
            className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary"
          >
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        );
      })}
      <span className="ml-auto flex items-center gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" /> Claim
        </span>
        <span className="inline-flex items-center gap-1">
          <BookOpen className="h-3 w-3 text-[#06B6D4]" /> Source
        </span>
      </span>
    </div>
  );
}

function NodeSidePanel({
  node,
  onClose,
}: {
  node: ClaimEvidenceGraphNode;
  onClose: () => void;
}) {
  const isClaim = node.kind === 'claim';
  const tier = isClaim ? tierStyle(node.tier ?? 'speculative') : null;
  const support = node.supportType
    ? supportTypeStyle(node.supportType)
    : null;
  const confidence =
    typeof node.meta?.confidence === 'number'
      ? (node.meta.confidence as number)
      : null;

  return (
    <aside className="absolute right-3 top-12 z-10 flex max-h-[600px] w-[360px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-glow">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-label text-text-muted">
            {isClaim ? 'Claim' : 'Evidence source'}
          </p>
          <p className="font-mono text-[11px] text-text-muted">{node.id}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-white"
          aria-label="Close node panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <p className="text-body-sm leading-relaxed text-text-primary">
          {node.label}
        </p>

        <div className="flex flex-wrap gap-2">
          {tier ? (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: tier.soft, color: tier.color, border: `1px solid ${tier.border}` }}
            >
              {tier.label}
            </span>
          ) : null}
          {support ? (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: support.soft, color: support.color, border: `1px solid ${support.border}` }}
              title={support.description}
            >
              {support.label}
            </span>
          ) : null}
          {confidence !== null ? (
            <span className="rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
              Confidence {Math.round(confidence * 100)}%
            </span>
          ) : null}
        </div>

        {renderMeta(node.meta)}
      </div>
    </aside>
  );
}

function renderMeta(meta: Record<string, unknown> | undefined) {
  if (!meta) return null;
  const entries = Object.entries(meta).filter(
    ([k]) => k !== 'confidence' && k !== 'raw',
  );
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1 border-t border-border pt-3">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 text-[11px]">
          <span className="text-text-muted">{k}</span>
          <span className="truncate text-right text-text-secondary">
            {formatMetaValue(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatMetaValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  if (Array.isArray(v)) return v.map(formatMetaValue).join(', ');
  return JSON.stringify(v);
}
