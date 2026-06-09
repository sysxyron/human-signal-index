'use client';

// =============================================================================
// HSI Phase 13 — CrossImpactGraphFlow. Interactive React Flow view of the
// directed cross-narrative impact graph: narrative nodes laid out on a ring,
// edges colored by impact type (amplifies=red, dampens=blue, triggers=orange,
// competes=purple, reinforces=green, neutral=slate), edge thickness scaled to
// impact strength. Edge labels show the impact type. React Flow CSS is imported
// here; the list page loads this via a dynamic ssr:false import (React Flow
// touches the DOM). Presentational — draws only the impacts it is given.
// =============================================================================

import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type {
  HsinCrossNarrativeImpactRecord,
  HsinNarrativeRecord,
} from '@hsi/shared-types';
import { impactTypeDecor } from '@/lib/decision/view';

export interface CrossImpactGraphFlowProps {
  impacts: HsinCrossNarrativeImpactRecord[];
  narratives: HsinNarrativeRecord[];
  className?: string;
}

const RADIUS = 220;
const CENTER = 280;

export function CrossImpactGraphFlow({
  impacts,
  narratives,
  className = '',
}: CrossImpactGraphFlowProps) {
  const { rfNodes, rfEdges } = useMemo(() => {
    // Only narratives that participate in an impact (source or target).
    const involved = new Set<string>();
    impacts.forEach((i) => {
      involved.add(i.source_narrative_id);
      involved.add(i.target_narrative_id);
    });
    const ids = narratives
      .map((n) => n.id)
      .filter((id) => involved.has(id));
    // Include any impact endpoint missing from the narratives list.
    impacts.forEach((i) => {
      if (!ids.includes(i.source_narrative_id)) ids.push(i.source_narrative_id);
      if (!ids.includes(i.target_narrative_id)) ids.push(i.target_narrative_id);
    });
    const nameOf = new Map(narratives.map((n) => [n.id, n.name]));

    const nodes: Node[] = ids.map((id, i) => {
      const angle = (i / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2;
      return {
        id,
        position: {
          x: CENTER + RADIUS * Math.cos(angle),
          y: CENTER + RADIUS * Math.sin(angle),
        },
        data: { label: nameOf.get(id) ?? id },
        style: {
          background: '#0F1A2E',
          border: '1px solid #2563EB99',
          borderRadius: 10,
          color: '#E2E8F0',
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 12px',
          width: 150,
          textAlign: 'center',
        },
      };
    });

    const edges: Edge[] = impacts.map((imp, i) => {
      const decor = impactTypeDecor(imp.impact_type);
      const strength = Math.min(100, Math.max(0, imp.impact_strength ?? 0));
      return {
        id: `${imp.id}-${i}`,
        source: imp.source_narrative_id,
        target: imp.target_narrative_id,
        label: decor.label,
        animated: strength >= 60,
        style: { stroke: decor.color, strokeWidth: 1 + (strength / 100) * 3 },
        labelStyle: { fill: decor.color, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#0A1120', fillOpacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, color: decor.color },
      };
    });

    return { rfNodes: nodes, rfEdges: edges };
  }, [impacts, narratives]);

  return (
    <div
      className={`h-[560px] overflow-hidden rounded-card border border-border bg-background-deep/60 ${className}`}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#1E293B" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
