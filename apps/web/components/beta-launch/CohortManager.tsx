'use client';

// =============================================================================
// HSI Phase 60 — Cohort management (client). Create / archive cohorts, assign
// users, and view per-cohort invite/accept/active/retention. Calls admin-gated
// server actions; refreshes server data on success. Admin-only surface.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Button } from '@hsi/ui';
import { Users, Archive, Plus } from 'lucide-react';
import { createCohortAction, archiveCohortAction, assignUserToCohortAction } from '@/lib/beta-launch/actions';
import type { CohortRow } from '@/lib/beta-launch/persistence';

export function CohortManager({ cohorts }: { cohorts: CohortRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [assignUser, setAssignUser] = useState('');
  const [assignCohort, setAssignCohort] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? ok : (r.error ?? 'Failed.'));
      if (r.ok) router.refresh();
    });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Users className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Cohort management</h3></div>

      {/* create */}
      <div className="flex flex-wrap items-end gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cohort name (e.g. Cohort A)" className="min-w-[180px] flex-1" aria-label="Cohort name" />
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (optional)" className="w-40" aria-label="Cohort code" />
        <Button variant="primary" disabled={pending || !name.trim()} onClick={() => run(() => createCohortAction({ name, code: code || undefined }), 'Cohort created.')}>
          <Plus className="h-4 w-4" /> Create
        </Button>
      </div>

      {/* table */}
      {cohorts.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-6 text-center text-caption text-text-muted">No cohorts yet. Create Cohort A, B, C to start grouping testers.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-caption">
            <thead className="text-[10px] uppercase tracking-wide text-text-muted"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">Cohort</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Invited</th><th className="py-2 pr-3 font-medium">Accepted</th><th className="py-2 pr-3 font-medium">Active</th><th className="py-2 pr-3 font-medium">Retention</th><th className="py-2 font-medium" /></tr></thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-medium text-text-primary">{c.name}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === 'active' ? 'bg-verified/10 text-verified' : 'bg-surface-2/60 text-text-muted'}`}>{c.status}</span></td>
                  <td className="py-2 pr-3 tabular-nums text-text-secondary">{c.invited}</td>
                  <td className="py-2 pr-3 tabular-nums text-text-secondary">{c.accepted}</td>
                  <td className="py-2 pr-3 tabular-nums text-text-secondary">{c.active}</td>
                  <td className="py-2 pr-3 tabular-nums text-text-secondary">{c.retentionPct}%</td>
                  <td className="py-2 text-right">{c.status === 'active' ? <button disabled={pending} onClick={() => run(() => archiveCohortAction(c.id), 'Cohort archived.')} className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-risk"><Archive className="h-3.5 w-3.5" /> Archive</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* assign */}
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <select value={assignCohort} onChange={(e) => setAssignCohort(e.target.value)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Cohort">
          <option value="">Assign to cohort…</option>
          {cohorts.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Input value={assignUser} onChange={(e) => setAssignUser(e.target.value)} placeholder="User ID (uuid)" className="min-w-[220px] flex-1" aria-label="User ID" />
        <Button variant="secondary" disabled={pending || !assignCohort || !assignUser.trim()} onClick={() => run(() => assignUserToCohortAction({ cohortId: assignCohort, userId: assignUser.trim() }), 'User assigned.')}>Assign</Button>
      </div>

      {msg ? <p className="text-caption text-text-muted">{msg}</p> : null}
    </Card>
  );
}
