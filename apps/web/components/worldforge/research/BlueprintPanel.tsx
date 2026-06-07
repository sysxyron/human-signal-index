'use client';

import { Card } from '@hsi/ui';
import { Orbit, Lightbulb } from 'lucide-react';
import type { SimulationBlueprint } from '@hsi/research-agents';
import { fmtNum } from '@/lib/worldforge/research-view';
import { ConfidenceScore } from './ConfidenceScore';

export interface BlueprintPanelProps {
  blueprint: SimulationBlueprint;
}

/** The buildable simulation blueprint: name, universe type, rationale, params. */
export function BlueprintPanel({ blueprint }: BlueprintPanelProps) {
  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Orbit className="h-5 w-5 text-electric" /> Simulation blueprint
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-h6 font-semibold text-text-primary">
              {blueprint.worldName}
            </span>
            <span className="rounded-full bg-electric/15 px-2.5 py-1 text-[11px] font-semibold text-electric">
              {blueprint.universeType}
            </span>
          </div>
        </div>
        <ConfidenceScore
          score={Math.round(blueprint.confidence * 100)}
          label="Blueprint confidence"
          size={60}
        />
      </div>

      {blueprint.rationale.length ? (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-label text-text-muted">
            <Lightbulb className="h-4 w-4 text-warning" /> Rationale
          </h4>
          <ul className="space-y-1">
            {blueprint.rationale.map((r, i) => (
              <li key={i} className="text-caption leading-relaxed text-text-secondary">
                • {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {Object.keys(blueprint.stateOverrides).length ? (
        <div className="space-y-2">
          <h4 className="text-label text-text-muted">State overrides</h4>
          <ParamsTable
            params={blueprint.stateOverrides as Record<string, unknown>}
          />
        </div>
      ) : null}
    </Card>
  );
}

/** Compact key/value table for parameter maps (flattens one nesting level). */
export function ParamsTable({ params }: { params: Record<string, unknown> }) {
  const rows: { key: string; value: string }[] = [];
  const push = (key: string, value: unknown) => {
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        push(`${key}.${k}`, v);
      }
    } else if (typeof value === 'number') {
      rows.push({ key, value: fmtNum(value) });
    } else {
      rows.push({ key, value: String(value) });
    }
  };
  for (const [k, v] of Object.entries(params)) push(k, v);

  if (!rows.length) {
    return <p className="text-caption text-text-muted">No parameters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 font-mono text-caption text-text-secondary">
                {r.key}
              </td>
              <td className="px-3 py-2 text-right font-mono text-caption text-text-primary">
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
