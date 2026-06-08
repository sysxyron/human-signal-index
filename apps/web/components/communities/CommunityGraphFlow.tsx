'use client';

// =============================================================================
// HSI Phase 9 — CommunityGraphFlow. React Flow view of narratives colored by the
// detected community they belong to. Narratives in the same community share a
// color and are grouped into a column; intra-community membership is drawn as
// light edges to the community's first member (a "hub").
//
// Reuses the existing graph pattern: onlyRenderVisibleElements + a memoized
// layout. React Flow CSS is imported here (the page loads this via a dynamic
// ssr:false wrapper, like the WorldForge dependency graph).
// =============================================================================

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Position,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { CommunitiesView } from '@hsi/shared-types';
import { communityColor } from '@/lib/operations/phase9-view';

export interface CommunityGraphFlowProps {
  view: CommunitiesView;
  className?: string;
}

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 92;

export function CommunityGraphFlow({ view, className = '' }: CommunityGraphFlowProps) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const narrativeById = new Map(view.narratives.map((n) => [n.id, n]));
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Narratives that belong to no community still get a column so they are visible.
    const assigned = new Set<string>();

    view.communities.forEach((comm, ci) => {
      const color = communityColor(ci);
      const members = comm.member_narrative_ids;
      const hubId = members[0];
      members.forEach((nid, ri) => {
        assigned.add(nid);
        const narr = narrativeById.get(nid);
        nodes.push({
          id: `narrative:${nid}`,
          position: { x: ci * COLUMN_WIDTH, y: ri * ROW_HEIGHT + 40 },
          data: { label: narr?.name ?? nid },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: {
            width: COLUMN_WIDTH - 56,
            borderRadius: 12,
            border: `1px solid ${color}66`,
            borderTop: `4px solid ${color}`,
            background: 'rgba(17,26,46,0.92)',
            color: '#F8FAFC',
            fontSize: 11,
            fontWeight: 600,
            padding: 9,
          },
        });
        // Light membership edge to the community hub.
        if (hubId && nid !== hubId) {
          edges.push({
            id: `edge:${comm.id}:${nid}`,
            source: `narrative:${hubId}`,
            target: `narrative:${nid}`,
            style: { stroke: `${color}99`, strokeWidth: 1.5 },
            animated: false,
          });
        }
      });
    });

    // Orphan narratives (not in any community) → a trailing column.
    const orphanCol = view.communities.length;
    let orphanRow = 0;
    view.narratives.forEach((n) => {
      if (assigned.has(n.id)) return;
      nodes.push({
        id: `narrative:${n.id}`,
        position: { x: orphanCol * COLUMN_WIDTH, y: orphanRow * ROW_HEIGHT + 40 },
        data: { label: n.name },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          width: COLUMN_WIDTH - 56,
          borderRadius: 12,
          border: '1px dashed #475569',
          background: 'rgba(17,26,46,0.7)',
          color: '#CBD5E1',
          fontSize: 11,
          padding: 9,
        },
      });
      orphanRow += 1;
    });

    return { rfNodes: nodes, rfEdges: edges };
  }, [view]);

  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    view.communities.forEach((comm, ci) => {
      const color = communityColor(ci);
      comm.member_narrative_ids.forEach((nid) => m.set(`narrative:${nid}`, color));
    });
    return m;
  }, [view.communities]);

  return (
    <div className={`relative ${className}`}>
      <div className="h-[560px] w-full overflow-hidden rounded-card border border-border bg-background-deep/60">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
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
            nodeColor={(n) => colorFor.get(n.id) ?? '#475569'}
            maskColor="rgba(2,4,10,0.7)"
            style={{ background: '#0A0F1F', border: '1px solid #1F2A44' }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
