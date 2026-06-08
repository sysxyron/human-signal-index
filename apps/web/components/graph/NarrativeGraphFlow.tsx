'use client';

// =============================================================================
// HSI Phase 8 — NarrativeGraphFlow. Interactive React Flow view of the narrative
// + entity knowledge graph. Narrative nodes + entity nodes; edges colored by
// edgeType (related_to=slate, contradicts=red, amplifies=orange, evolves_into=
// blue, derived_from=purple, co_occurs_with=green). Click a node → side panel.
//
// Reuses the existing graph pattern: onlyRenderVisibleElements + a memoized
// layout. React Flow CSS is imported here (the page loads this via a dynamic
// ssr:false import, like the WorldForge dependency graph).
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Position,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { NarrativeGraphData } from '@hsi/shared-types';
import { edgeTypeColor, entityTypeDecor } from '@/lib/operations/view';
import { GraphNodePanel, type SelectedNode } from './GraphNodePanel';

export interface NarrativeGraphFlowProps {
  data: NarrativeGraphData;
  className?: string;
}

const NARRATIVE_PREFIX = 'narrative:';
const ENTITY_PREFIX = 'entity:';

const COL_NARRATIVE_X = 80;
const COL_ENTITY_X = 520;
const ROW_HEIGHT = 96;

const RISK_COLORS = ['#94A3B8', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#B91C1C'];

function riskColor(risk?: number): string {
  if (risk == null) return '#3B82F6';
  return RISK_COLORS[Math.max(0, Math.min(5, Math.round(risk)))] ?? '#3B82F6';
}

export function NarrativeGraphFlow({ data, className = '' }: NarrativeGraphFlowProps) {
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  const { rfNodes, rfEdges } = useMemo(() => {
    const nodes: Node[] = [];

    data.narratives.forEach((n, i) => {
      const accent = riskColor(n.risk_level);
      nodes.push({
        id: `${NARRATIVE_PREFIX}${n.id}`,
        position: { x: COL_NARRATIVE_X, y: i * ROW_HEIGHT },
        data: { label: n.name },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 280,
          borderRadius: 12,
          border: `1px solid ${accent}66`,
          borderLeft: `4px solid ${accent}`,
          background: 'rgba(17,26,46,0.92)',
          color: '#F8FAFC',
          fontSize: 12,
          fontWeight: 600,
          padding: 10,
        },
      });
    });

    data.entities.forEach((e, i) => {
      const accent = entityTypeDecor(e.entity_type).color;
      nodes.push({
        id: `${ENTITY_PREFIX}${e.id}`,
        position: { x: COL_ENTITY_X, y: i * ROW_HEIGHT },
        data: { label: e.name },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 220,
          borderRadius: 999,
          border: `1px solid ${accent}66`,
          background: `${accent}14`,
          color: '#F8FAFC',
          fontSize: 11,
          padding: 8,
          textAlign: 'center',
        },
      });
    });

    const edges: Edge[] = data.edges.map((e) => {
      const color = edgeTypeColor(e.edge_type);
      return {
        id: e.id,
        source: `${NARRATIVE_PREFIX}${e.source_narrative_id}`,
        target: `${NARRATIVE_PREFIX}${e.target_narrative_id}`,
        label: e.edge_type.replace(/_/g, ' '),
        labelStyle: { fill: color, fontSize: 9 },
        labelBgStyle: { fill: '#0A0F1F', fillOpacity: 0.8 },
        style: { stroke: color, strokeWidth: 1.5 + (e.weight ?? 0) },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        animated: e.edge_type === 'amplifies' || e.edge_type === 'evolves_into',
      };
    });

    return { rfNodes: nodes, rfEdges: edges };
  }, [data]);

  const narrativeById = useMemo(
    () => new Map(data.narratives.map((n) => [n.id, n])),
    [data.narratives],
  );
  const entityById = useMemo(
    () => new Map(data.entities.map((e) => [e.id, e])),
    [data.entities],
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_evt, node) => {
      if (node.id.startsWith(NARRATIVE_PREFIX)) {
        const narrative = narrativeById.get(node.id.slice(NARRATIVE_PREFIX.length));
        if (narrative) setSelected({ kind: 'narrative', narrative });
      } else if (node.id.startsWith(ENTITY_PREFIX)) {
        const entity = entityById.get(node.id.slice(ENTITY_PREFIX.length));
        if (entity) setSelected({ kind: 'entity', entity });
      }
    },
    [narrativeById, entityById],
  );

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
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) =>
              n.id.startsWith(ENTITY_PREFIX) ? '#8B5CF6' : '#3B82F6'
            }
            maskColor="rgba(2,4,10,0.7)"
            style={{ background: '#0A0F1F', border: '1px solid #1F2A44' }}
          />
        </ReactFlow>
      </div>

      {selected ? (
        <GraphNodePanel
          selected={selected}
          signalNarratives={data.signalNarratives}
          signalEntities={data.signalEntities}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
