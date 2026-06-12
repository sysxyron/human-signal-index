// =============================================================================
// HSI Phase 22 — executive side panels (server-safe presentational):
//   ForecastPanel    — active/failing forecast counts + avg confidence.
//   ConsensusPanel   — forming/disputed consensus counts.
//   OperationsPanel  — platform health + active runs + escalations.
// Each is a compact, advisory rollup derived from the snapshot.
// =============================================================================

import { Card } from '@hsi/ui';
import { TrendingUp, Users, Activity } from 'lucide-react';
import type { ExecutiveCommandData } from '@hsi/shared-types';
import { formatPct } from '@/lib/executive/view';

function PanelShell({ icon: Icon, title, children }: { icon: typeof TrendingUp; title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Icon className="h-4 w-4 text-electric" /> {title}</h3>
      {children}
    </Card>
  );
}

function Stat({ label, value, color = '#94A3B8' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-text-muted">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export function ForecastPanel({ active, failing, avgConfidence }: { active: number; failing: number; avgConfidence: number }) {
  return (
    <PanelShell icon={TrendingUp} title="Forecasts">
      <Stat label="Active" value={active} color="#3B82F6" />
      <Stat label="Failing" value={failing} color="#EF4444" />
      <Stat label="Avg confidence" value={formatPct(avgConfidence)} color="#10B981" />
    </PanelShell>
  );
}

export function ConsensusPanel({ forming, disputed }: { forming: number; disputed: number }) {
  return (
    <PanelShell icon={Users} title="Consensus">
      <Stat label="Forming" value={forming} color="#8B5CF6" />
      <Stat label="Disputed" value={disputed} color="#EF4444" />
    </PanelShell>
  );
}

export function OperationsPanel({ health, activeRuns, escalations }: { health: string; activeRuns: number; escalations: number }) {
  const color = health === 'HEALTHY' ? '#10B981' : health === 'DEGRADED' ? '#F59E0B' : '#EF4444';
  return (
    <PanelShell icon={Activity} title="Operations">
      <Stat label="Health" value={health} color={color} />
      <Stat label="Active runs" value={activeRuns} color="#3B82F6" />
      <Stat label="Open escalations" value={escalations} color="#EF4444" />
    </PanelShell>
  );
}

/** A small wrapper that derives all three panels from the command data. */
export function ExecutivePanels({ data }: { data: ExecutiveCommandData }) {
  const { forecasts, consensus, operations } = data.panels;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ForecastPanel active={forecasts.active} failing={forecasts.failing} avgConfidence={forecasts.avgConfidence} />
      <ConsensusPanel forming={consensus.forming} disputed={consensus.disputed} />
      <OperationsPanel health={operations.health} activeRuns={operations.activeRuns} escalations={operations.escalations} />
    </div>
  );
}
