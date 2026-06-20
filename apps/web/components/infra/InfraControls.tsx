'use client';

// =============================================================================
// HSI Phase 70.1 — Infrastructure admin controls (client). Record a backup,
// record a deployment (commit/version auto-filled from env), and run an uptime
// check now. Audited server actions. No business-workflow changes.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { HardDrive, Rocket, Activity } from 'lucide-react';
import { recordBackupAction, recordDeploymentAction, runUptimeCheckAction } from '@/lib/infra/actions';

export function InfraControls() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => recordBackupAction({ status: 'success', kind: 'full' }), 'Backup recorded.')}><HardDrive className="h-4 w-4" /> Record backup</Button>
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => recordDeploymentAction({}), 'Deployment recorded.')}><Rocket className="h-4 w-4" /> Record deployment</Button>
      <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => runUptimeCheckAction(), 'Uptime check complete.')}><Activity className="h-4 w-4" /> Run uptime check</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
