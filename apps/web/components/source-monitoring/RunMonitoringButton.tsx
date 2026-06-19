'use client';

// =============================================================================
// HSI Phase 63 — Admin "run monitoring now" (client). Triggers the evaluation
// (admin-gated server action), surfaces the run summary, and refreshes. The same
// evaluation runs automatically via the /api/cron/source-monitoring schedule.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Radar } from 'lucide-react';
import { runSourceMonitoringAction } from '@/lib/source-monitoring/actions';

export function RunMonitoringButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await runSourceMonitoringAction();
      if (r.ok) {
        const s = r.data;
        setMsg(`Evaluated ${s.evaluated} sources · ${s.alerts} alert(s) · ${s.notificationsSent} notification(s)${s.coldStart ? ' (baseline established)' : ''}.`);
        router.refresh();
      } else {
        setMsg(r.error ?? 'Run failed.');
      }
    });

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" disabled={pending} onClick={run}><Radar className="h-4 w-4" /> {pending ? 'Running…' : 'Run monitoring now'}</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
