'use client';

// =============================================================================
// HSI Phase 10 — InfluenceGraphFlow. React Flow directed network where edges are
// WEIGHTED by influence_score (→ stroke width + a numeric label) and arrows point
// from the influencing narrative to the influenced one. Nodes are sized by total
// out-influence (the bigger the node, the bigger the influencer). Clicking a node
// selects it → the InfluenceNodePanel shows its in/out influence.
//
// Reuses the Phase 9 graph pattern: onlyRenderVisibleElements + memoized layout.
// React Flow CSS imported here (loaded via a dynamic ssr:false wrapper).
// =============================================================================

import { useMemo, useState } from 'react';
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
import type { InfluenceView } from '@hsi/shared-types';
import { influenceStrokeWidth, rankInfluencers } from '@/lib/temporal/view';
import { InfluenceNodePanel } from './InfluenceNodePanel';

const RADIUS = 230;

export function InfluenceGraphFlow({ view, className = '' }: { view: InfluenceView; className?: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  const { rfNodes, rfEdges } = useMemo(() => {
    const ranks = rankInfluencers(view);
    const outById = new Map(ranks.map((r) => [r.narrativeId, r.outInfluence]));
    const maxOut = Math.max(1, ...ranks.map((r) => r.outInfluence));

    // Radial layout — deterministic by narrative order.
    const count = Math.max(1, view.narratives.length);
    const nodes: Node[] = view.narratives.map((n, i) => {
      const angle = (i / count) * Math.PI * 2;
      const out = outById.get(n.id) ?? 0;
      // Higher influencers pulled toward the center; size scales with out-influence.
      const r = RADIUS * (1 - 0.35 * (out / maxOut));
      const size = 120 + Math.round((out / maxOut) * 90);
      return {
        id: `n:${n.id}`,
        position: { x: RADIUS + Math.cos(angle) * r, y: RADIUS + Math.sin(angle) * r },
        data: { label: n.name },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: size,
          borderRadius: 12,
          border: selected === n.id ? '2px solid #06B6D4' : '1px solid rgba(6,182,212,0.45)',
          borderTop: '4px solid #06B6D4',
          background: 'rgba(17,26,46,0.92)',
          color: '#F8FAFC',
          fontSize: 11,
          fontWeight: 600,
          padding: 9,
          boxShadow: selected === n.id ? '0 0 0 3px rgba(6,182,212,0.25)' : undefined,
        },
      };
    });

    const edges: Edge[] = view.edges
      .filter((e) => e.source_narrative_id && e.target_narrative_id)
      .map((e, i) => {
        const score = Math.round(e.influence_score ?? 0);
        const w = influenceStrokeWidth(e.influence_score);
        return {
          id: e.id ?? `e:${i}`,
          source: `n:${e.source_narrative_id}`,
          target: `n:${e.target_narrative_id}`,
          label: String(score),
          labelStyle: { fill: '#06B6D4', fontSize: 9, fontWeight: 700 },
          labelBgStyle: { fill: '#0A0F1F', fillOpacity: 0.85 },
          style: { stroke: '#06B6D4', strokeWidth: w, opacity: 0.55 + (w / 6) * 0.45 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#06B6D4' },
          animated: score >= 60,
        };
      });

    return { rfNodes: nodes, rfEdges: edges };
  }, [view, selected]);

  const onNodeClick: NodeMouseHandler = (_evt, node) => {
    setSelected(node.id.replace(/^n:/, ''));
  };

  return (
    <div className={`grid gap-4 lg:grid-cols-3 ${className}`}>
      <div className="lg:col-span-2">
        <div className="h-[560px] w-full overflow-hidden rounded-card border border-border bg-background-deep/60">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onlyRenderVisibleElements
            onNodeClick={onNodeClick}
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
              nodeColor={() => '#06B6D4'}
              maskColor="rgba(2,4,10,0.7)"
              style={{ background: '#0A0F1F', border: '1px solid #1F2A44' }}
            />
          </ReactFlow>
        </div>
      </div>
      <InfluenceNodePanel narrativeId={selected} narratives={view.narratives} edges={view.edges} />
    </div>
  );
}
