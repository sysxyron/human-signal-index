'use client';

// =============================================================================
// HSI Phase 10 — GenealogyTreeFlow. React Flow ancestry tree over narratives:
// nodes are narratives, directed edges run parent → child colored + labeled by
// relationship (derived_from / split_from / merged_from / contradicts /
// amplifies). Roots (no parents) sit at the top; descendants layer below.
// Clicking a node selects it → the GenealogyNodePanel shows its lineage.
//
// Reuses the Phase 9 graph pattern: onlyRenderVisibleElements + a memoized
// layout. React Flow CSS is imported here (loaded via a dynamic ssr:false
// wrapper, like the WorldForge / community graphs).
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
import type { GenealogyView } from '@hsi/shared-types';
import { relationshipDecor } from '@/lib/temporal/view';
import { GenealogyNodePanel } from './GenealogyNodePanel';

const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 110;

/** Assign each narrative a depth (longest path from any root). */
function computeDepths(view: GenealogyView): Map<string, number> {
  const childToParents = new Map<string, string[]>();
  for (const e of view.edges) {
    if (!e.parent_narrative_id || !e.child_narrative_id) continue;
    // contradicts is non-hierarchical; skip for depth purposes.
    if (e.relationship === 'contradicts') continue;
    const list = childToParents.get(e.child_narrative_id) ?? [];
    list.push(e.parent_narrative_id);
    childToParents.set(e.child_narrative_id, list);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const resolve = (id: string): number => {
    const cached = depth.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const parents = childToParents.get(id) ?? [];
    const d = parents.length === 0 ? 0 : Math.max(...parents.map(resolve)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of view.narratives) resolve(n.id);
  return depth;
}

export function GenealogyTreeFlow({ view, className = '' }: { view: GenealogyView; className?: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  const { rfNodes, rfEdges } = useMemo(() => {
    const depths = computeDepths(view);
    // Rows per depth so nodes at the same depth fan out horizontally.
    const rowCounters = new Map<number, number>();
    const nodes: Node[] = view.narratives.map((n) => {
      const d = depths.get(n.id) ?? 0;
      const col = rowCounters.get(d) ?? 0;
      rowCounters.set(d, col + 1);
      return {
        id: `n:${n.id}`,
        position: { x: col * COLUMN_WIDTH, y: d * ROW_HEIGHT + 30 },
        data: { label: n.name },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          width: COLUMN_WIDTH - 56,
          borderRadius: 12,
          border:
            selected === n.id ? '2px solid #3B82F6' : '1px solid rgba(71,85,105,0.6)',
          background: 'rgba(17,26,46,0.92)',
          color: '#F8FAFC',
          fontSize: 11,
          fontWeight: 600,
          padding: 9,
          boxShadow: selected === n.id ? '0 0 0 3px rgba(59,130,246,0.25)' : undefined,
        },
      };
    });

    const edges: Edge[] = view.edges
      .filter((e) => e.parent_narrative_id && e.child_narrative_id)
      .map((e, i) => {
        const decor = relationshipDecor(e.relationship);
        return {
          id: e.id ?? `e:${i}`,
          source: `n:${e.parent_narrative_id}`,
          target: `n:${e.child_narrative_id}`,
          label: decor.label,
          labelStyle: { fill: decor.color, fontSize: 9, fontWeight: 600 },
          labelBgStyle: { fill: '#0A0F1F', fillOpacity: 0.85 },
          style: { stroke: decor.color, strokeWidth: 1.75 },
          markerEnd: { type: MarkerType.ArrowClosed, color: decor.color },
          animated: e.relationship === 'amplifies',
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
              nodeColor={() => '#3B82F6'}
              maskColor="rgba(2,4,10,0.7)"
              style={{ background: '#0A0F1F', border: '1px solid #1F2A44' }}
            />
          </ReactFlow>
        </div>
      </div>
      <GenealogyNodePanel narrativeId={selected} narratives={view.narratives} edges={view.edges} />
    </div>
  );
}
