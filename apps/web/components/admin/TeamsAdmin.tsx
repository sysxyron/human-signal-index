'use client';

// =============================================================================
// HSI Phase 24B — TeamsAdmin. Admin team membership management on the existing
// team_members table: add/remove members and assign a team lead. All via
// admin-only audited server actions. Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@hsi/ui';
import { Users, UserPlus, X, Crown, Loader2 } from 'lucide-react';
import type { AdminTeamsData } from '@hsi/shared-types';
import { addTeamMemberAction, removeTeamMemberAction, assignTeamLeadAction } from '@/lib/admin/actions';
import { SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

const field = 'rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary focus:border-electric focus:outline-none';

export function TeamsAdmin({ data, canAct, demo }: { data: AdminTeamsData; canAct: boolean; demo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) => {
    if (demo) { setError('Demo is read-only.'); return; }
    setError(null); setNotice(null);
    start(async () => {
      const res = await fn();
      if (res.ok) { setNotice(ok); router.refresh(); } else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <div className="space-y-4">
      {notice ? <SuccessNotice message={notice} /> : null}
      {error ? <ErrorState title="Action failed" message={error} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.teams.map((t) => (
          <Card key={t.id} className="space-y-3 border-border" padded>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Users className="h-4 w-4 text-electric" /> {t.name}</h3>
              <span className="text-label text-text-muted">{t.memberCount} member(s)</span>
            </div>
            {t.description ? <p className="text-caption text-text-secondary">{t.description}</p> : null}
            <ul className="space-y-1.5">
              {t.members.length === 0 ? <li className="text-caption text-text-muted">No members yet.</li> : null}
              {t.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface/50 px-3 py-1.5">
                  <span className="flex items-center gap-2 text-caption text-text-primary">
                    {m.teamRole === 'lead' ? <Crown className="h-3.5 w-3.5 text-warning" /> : null}
                    {m.name ?? m.email} <span className="text-text-muted">{m.email}</span>
                  </span>
                  {canAct && !demo ? (
                    <span className="flex items-center gap-1.5">
                      {m.teamRole !== 'lead' ? <button className="text-label text-text-muted hover:text-warning" disabled={pending} onClick={() => run(() => assignTeamLeadAction(t.id, m.userId), 'Team lead assigned.')}>Make lead</button> : null}
                      <button className="text-label text-text-muted hover:text-risk" aria-label="Remove member" disabled={pending} onClick={() => run(() => removeTeamMemberAction(t.id, m.userId), 'Member removed.')}><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {canAct && !demo ? (
              <div className="flex items-center gap-2">
                <select className={field} value={add[t.id] ?? ''} onChange={(e) => setAdd((s) => ({ ...s, [t.id]: e.target.value }))}>
                  <option value="">Add a member…</option>
                  {data.assignableUsers.filter((u) => !t.members.some((m) => m.userId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
                </select>
                <Button variant="secondary" size="sm" disabled={pending || !add[t.id]} onClick={() => { const uid = add[t.id]; if (uid) { run(() => addTeamMemberAction(t.id, uid), 'Member added.'); setAdd((s) => ({ ...s, [t.id]: '' })); } }}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
