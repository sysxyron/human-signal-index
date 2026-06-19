'use client';

// =============================================================================
// HSI Phase 66 — Agent controls (client, admin). Run / retry an agent, change its
// cadence (schedule), or cancel scheduling. Calls admin-gated server actions.
// Agents never publish/review/moderate — these controls only trigger analysis.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Play, RefreshCw, Ban } from 'lucide-react';
import { runAgentAction, retryAgentAction, scheduleAgentAction, cancelAgentAction } from '@/lib/agents/actions';

const CADENCES = ['manual', 'hourly', 'daily', 'weekly', 'disabled'];

export function AgentControls({ agentKey, cadence }: { agentKey: string; cadence: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, label: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? label : (r.error ?? 'Failed.'));
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => runAgentAction(agentKey), 'Run complete.')}><Play className="h-4 w-4" /> Run now</Button>
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => retryAgentAction(agentKey), 'Retried.')}><RefreshCw className="h-4 w-4" /> Retry</Button>
      <select
        defaultValue={cadence}
        disabled={pending}
        onChange={(e) => run(() => scheduleAgentAction(agentKey, e.target.value), `Cadence → ${e.target.value}.`)}
        className="rounded-btn border border-border bg-surface/80 px-2 py-1.5 text-[12px] font-semibold text-text-primary"
        aria-label="Schedule cadence"
      >
        {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => cancelAgentAction(agentKey), 'Scheduling cancelled.')}><Ban className="h-4 w-4" /> Cancel</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
