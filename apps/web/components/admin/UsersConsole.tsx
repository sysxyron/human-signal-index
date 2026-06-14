'use client';

// =============================================================================
// HSI Phase 24B — UsersConsole. The admin user-management table + Invite modal +
// per-user status (approve/suspend/activate/disable) and role assignment. All
// actions call admin-only, audited server actions. Demo is read-only. The
// service-role key is NEVER touched here — only server actions run privileged ops.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@hsi/ui';
import { UserPlus, Loader2, X, ShieldCheck, Ban, CheckCircle2, PauseCircle } from 'lucide-react';
import type { AdminUsersData, UserStatus } from '@hsi/shared-types';
import { inviteUserAction, setUserStatusAction, assignRoleAction } from '@/lib/admin/actions';
import { statusColor, statusLabel, formatDateTime } from '@/lib/admin/view';
import { SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

const field = 'w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none';

export function UsersConsole({ data, canAct, demo }: { data: AdminUsersData; canAct: boolean; demo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) => {
    if (demo) { setError('Demo is read-only.'); return; }
    setError(null); setNotice(null);
    start(async () => {
      const res = await fn();
      if (res.ok) { setNotice(ok); router.refresh(); } else setError(formatErrorMessage(res.error));
    });
  };

  const roleOptions = data.roleOptions.length > 0 ? data.roleOptions : ['viewer', 'researcher', 'reviewer', 'curator', 'admin'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-caption text-text-secondary">
          {(['active', 'pending', 'suspended', 'disabled'] as UserStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(s) }} /> {statusLabel(s)}: <span className="font-semibold text-text-primary">{data.counts[s]}</span>
            </span>
          ))}
        </div>
        {canAct && !demo ? (
          <Button variant="primary" size="sm" onClick={() => { setInviteOpen(true); setError(null); setNotice(null); }}><UserPlus className="h-4 w-4" /> Invite user</Button>
        ) : null}
      </div>

      {notice ? <SuccessNotice message={notice} /> : null}
      {error ? <ErrorState title="Action failed" message={error} /> : null}

      <Card className="overflow-x-auto border-border p-0" padded={false}>
        <table className="w-full text-caption">
          <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-2 text-left">User</th><th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Role</th><th className="px-4 py-2 text-left">Team</th>
              <th className="px-4 py-2 text-left">Last login</th><th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="border-b border-border/50 align-top last:border-0">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-text-primary">{u.name ?? u.email.split('@')[0]}</div>
                  <div className="text-label text-text-muted">{u.email}</div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-label font-semibold" style={{ backgroundColor: `${statusColor(u.status)}1f`, color: statusColor(u.status) }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor(u.status) }} /> {statusLabel(u.status)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {canAct && !demo ? (
                    <select className={`${field} w-auto py-1`} defaultValue={u.role ?? 'viewer'} disabled={pending} onChange={(e) => run(() => assignRoleAction(u.id, e.target.value), `Role updated for ${u.email}.`)}>
                      {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="text-text-secondary">{u.role ?? '—'}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{u.team ?? '—'}</td>
                <td className="px-4 py-2.5 text-text-muted">{formatDateTime(u.lastLoginAt)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {canAct && !demo ? <StatusActions status={u.status} pending={pending} onAct={(to, label) => run(() => setUserStatusAction(u.id, to), label)} /> : <span className="text-label text-text-muted">view</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {inviteOpen ? <InviteModal roleOptions={roleOptions} teamOptions={data.teamOptions} pending={pending} onClose={() => setInviteOpen(false)} onInvite={(input) => { run(() => inviteUserAction(input), `Invitation sent to ${input.email}.`); setInviteOpen(false); }} /> : null}
    </div>
  );
}

function StatusActions({ status, pending, onAct }: { status: UserStatus; pending: boolean; onAct: (to: UserStatus, label: string) => void }) {
  const btn = 'inline-flex items-center gap-1 rounded-btn border border-border px-2 py-1 text-label transition hover:text-white disabled:opacity-50';
  return (
    <>
      {status === 'pending' ? <button className={btn} disabled={pending} onClick={() => onAct('active', 'User approved.')}><CheckCircle2 className="h-3.5 w-3.5 text-verified" /> Approve</button> : null}
      {status === 'suspended' || status === 'disabled' ? <button className={btn} disabled={pending} onClick={() => onAct('active', 'User reactivated.')}><ShieldCheck className="h-3.5 w-3.5 text-verified" /> Activate</button> : null}
      {status === 'active' ? <button className={btn} disabled={pending} onClick={() => onAct('suspended', 'User suspended.')}><PauseCircle className="h-3.5 w-3.5 text-warning" /> Suspend</button> : null}
      {status !== 'disabled' ? <button className={btn} disabled={pending} onClick={() => onAct('disabled', 'User disabled.')}><Ban className="h-3.5 w-3.5 text-risk" /> Disable</button> : null}
    </>
  );
}

function InviteModal({ roleOptions, teamOptions, pending, onClose, onInvite }: {
  roleOptions: string[];
  teamOptions: { key: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onInvite: (input: { email: string; role: string; team?: string; message?: string }) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(roleOptions.includes('viewer') ? 'viewer' : roleOptions[0]);
  const [team, setTeam] = useState('');
  const [message, setMessage] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md space-y-3 border-border" padded onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><UserPlus className="h-4 w-4 text-electric" /> Invite user</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1.5"><label className="text-label uppercase tracking-wide text-text-muted">Email</label><input className={field} type="email" placeholder="tester@example.org" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5"><label className="text-label uppercase tracking-wide text-text-muted">Role</label>
            <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
          <div className="space-y-1.5"><label className="text-label uppercase tracking-wide text-text-muted">Team</label>
            <select className={field} value={team} onChange={(e) => setTeam(e.target.value)}><option value="">— none —</option>{teamOptions.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></div>
        </div>
        <div className="space-y-1.5"><label className="text-label uppercase tracking-wide text-text-muted">Message (optional)</label><textarea className={field} rows={2} placeholder="A short note included in the invite metadata." value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={pending} onClick={() => onInvite({ email: email.trim(), role, team: team || undefined, message: message.trim() || undefined })}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Send invite
          </Button>
        </div>
        <p className="text-label text-text-muted">The invitee receives an email to set a password. They start as <span className="font-semibold text-warning">pending</span> until you approve them.</p>
      </Card>
    </div>
  );
}
