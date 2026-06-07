'use client';

import { useMemo, useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X } from 'lucide-react';
import {
  explainNode,
  getUpstream,
  getDownstream,
  indexGraph,
  type SimulationGraph,
  type GraphNode,
} from '@hsi/simulation-engine';
import { tierStyle, categoryColor, fmtNum, type TierStyle } from '@/lib/worldforge/confidence';
import { ProvenancePanel } from './ProvenancePanel';
import { ScientificConfidenceChip } from './ScientificConfidenceChip';

export interface DependencyGraphFlowProps {
  graph: SimulationGraph;
  className?: string;
}

const CATEGORY_ORDER = [
  'star',
  'planet',
  'chemistry',
  'biology',
  'intelligence',
  'civilization',
  'risk',
] as const;

const COLUMN_WIDTH = 240;
const ROW_HEIGHT = 84;

/** Interactive React Flow view of a simulation graph with a provenance side panel. */
export function DependencyGraphFlow({ graph, className = '' }: DependencyGraphFlowProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Build the index once per graph.
  const index = useMemo(() => indexGraph(graph), [graph]);

  // Layered layout: x by category column, y by index within the column.
  const { rfNodes, rfEdges } = useMemo(() => {
    const perColumnCount: Record<string, number> = {};
    const nodes: Node[] = graph.nodes.map((n) => {
      const col = CATEGORY_ORDER.indexOf(n.category as (typeof CATEGORY_ORDER)[number]);
      const colKey = n.category;
      const row = perColumnCount[colKey] ?? 0;
      perColumnCount[colKey] = row + 1;
      const s: TierStyle = tierStyle(n.provenance.scientificConfidence.tier);
      const cat = categoryColor(n.category);
      return {
        id: n.id,
        position: { x: (col < 0 ? CATEGORY_ORDER.length : col) * COLUMN_WIDTH, y: row * ROW_HEIGHT },
        data: { label: nodeLabel(n) },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: COLUMN_WIDTH - 48,
          borderRadius: 12,
          border: `1px solid ${s.border}`,
          borderLeft: `4px solid ${cat}`,
          background: 'rgba(17,26,46,0.92)',
          color: '#F8FAFC',
          fontSize: 11,
          padding: 8,
          boxShadow: `0 0 0 1px ${s.soft}`,
        },
      } satisfies Node;
    });

    const edges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: undefined,
      style: { stroke: 'rgba(148,163,184,0.28)', strokeWidth: 1 },
      animated: false,
    }));

    return { rfNodes: nodes, rfEdges: edges };
  }, [graph]);

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    setSelectedId(node.id);
  }, []);

  const selected = selectedId ? index.nodeById.get(selectedId) : undefined;

  return (
    <div className={`relative ${className}`}>
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
              const gn = index.nodeById.get(n.id);
              return gn ? categoryColor(gn.category) : '#334155';
            }}
            maskColor="rgba(2,4,10,0.7)"
            style={{ background: '#0A0F1F', border: '1px solid #1F2A44' }}
          />
        </ReactFlow>
      </div>

      {selected ? (
        <NodeSidePanel
          graph={graph}
          node={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function nodeLabel(n: GraphNode): string {
  return `${n.label}${n.unit ? `  ·  ${fmtNum(n.value, n.unit)}` : `  ·  ${fmtNum(n.value)}`}`;
}

function NodeSidePanel({
  graph,
  node,
  onClose,
}: {
  graph: SimulationGraph;
  node: GraphNode;
  onClose: () => void;
}) {
  const index = useMemo(() => indexGraph(graph), [graph]);
  const explanation = useMemo(() => explainNode(graph, node.id, index), [graph, node.id, index]);
  const upstream = useMemo(() => getUpstream(graph, node.id, index), [graph, node.id, index]);
  const downstream = useMemo(() => getDownstream(graph, node.id, index), [graph, node.id, index]);
  const labelFor = useCallback(
    (id: string) => index.nodeById.get(id)?.label ?? id,
    [index],
  );

  return (
    <aside className="absolute right-3 top-3 z-10 flex max-h-[616px] w-[360px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-glow">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-h6 font-semibold text-text-primary">{node.label}</p>
          <p className="font-mono text-caption text-text-muted">{node.id}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-white"
          aria-label="Close node panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-h6 font-bold text-text-primary">
            {fmtNum(node.value, node.unit)}
          </span>
          <ScientificConfidenceChip
            tier={node.provenance.scientificConfidence.tier}
            confidence={node.provenance.scientificConfidence.confidence}
          />
        </div>

        <p className="text-caption leading-relaxed text-text-secondary">{explanation.summary}</p>

        <Group title={`Inputs (upstream · ${upstream.length})`}>
          {upstream.length ? (
            <Chips ids={(index.parents.get(node.id) ?? [])} labelFor={labelFor} tone="#3B82F6" />
          ) : (
            <Empty text="Root input — no upstream dependencies." />
          )}
        </Group>

        <Group title={`Outputs (downstream · ${downstream.length})`}>
          {(index.children.get(node.id) ?? []).length ? (
            <Chips ids={index.children.get(node.id) ?? []} labelFor={labelFor} tone="#8B5CF6" />
          ) : (
            <Empty text="Terminal node — nothing depends on it." />
          )}
        </Group>

        {node.assumptions.length ? (
          <Group title="Assumptions">
            <ul className="space-y-1">
              {node.assumptions.map((a, i) => (
                <li key={i} className="text-caption text-text-secondary">
                  • {a}
                </li>
              ))}
            </ul>
          </Group>
        ) : null}

        <ProvenancePanel
          provenance={node.provenance}
          title="Provenance"
          resolveLabel={labelFor}
        />
      </div>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-label text-text-muted">{title}</p>
      {children}
    </div>
  );
}

function Chips({
  ids,
  labelFor,
  tone,
}: {
  ids: string[];
  labelFor: (id: string) => string;
  tone: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <span
          key={id}
          className="rounded-full px-2 py-0.5 text-[11px]"
          style={{ backgroundColor: `${tone}1a`, color: tone, border: `1px solid ${tone}33` }}
        >
          {labelFor(id)}
        </span>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-caption text-text-muted">{text}</p>;
}
