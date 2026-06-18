'use client';

// =============================================================================
// HSI Phase 60 — Invitation management (client). Tracks invites (sent / pending /
// accepted / expired / revoked), send / resend / revoke, and an audit log. Calls
// admin-gated server actions. Operational tracking only — wiring to the email
// provider integrates with the existing IAM invite system as a follow-up.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Button } from '@hsi/ui';
import { Mail, Send, RotateCcw, Ban, History } from 'lucide-react';
import { sendInviteAction, resendInviteAction, revokeInviteAction } from '@/lib/beta-launch/actions';
import type { InviteSummary, InviteRow, InviteEventRow, CohortRow } from '@/lib/beta-launch/persistence';

const STATUS_COLOR: Record<string, string> = { pending: '#F59E0B', accepted: '#10B981', expired: '#94A3B8', revoked: '#EF4444' };

export function InviteManager({ summary, recent, events, cohorts }: { summary: InviteSummary; recent: InviteRow[]; events: InviteEventRow[]; cohorts: CohortRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [cohort, setCohort] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); });

  const cells = [
    { label: 'Sent', value: summary.sent }, { label: 'Pending', value: summary.pending },
    { label: 'Accepted', value: summary.accepted }, { label: 'Expired', value: summary.expired }, { label: 'Revoked', value: summary.revoked },
  ];

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Invitation management</h3></div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cells.map((c) => <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{c.value}</div><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{c.label}</div></div>)}
      </div>

      {/* send */}
      <div className="flex flex-wrap items-end gap-2">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="invitee@email.com" className="min-w-[200px] flex-1" aria-label="Invite email" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Role">
          <option value="viewer">Viewer</option><option value="researcher">Researcher</option><option value="reviewer">Reviewer</option><option value="curator">Curator</option>
        </select>
        <select value={cohort} onChange={(e) => setCohort(e.target.value)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Cohort">
          <option value="">No cohort</option>
          {cohorts.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button variant="primary" disabled={pending || !email.includes('@')} onClick={() => run(() => sendInviteAction({ email, role, cohortId: cohort || undefined }), 'Invite tracked.')}><Send className="h-4 w-4" /> Send invite</Button>
      </div>

      {/* recent invites */}
      {recent.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-caption">
            <thead className="text-[10px] uppercase tracking-wide text-text-muted"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">Email</th><th className="py-2 pr-3 font-medium">Role</th><th className="py-2 pr-3 font-medium">Cohort</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Sent</th><th className="py-2 font-medium" /></tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-text-primary">{r.email}</td>
                  <td className="py-2 pr-3 text-text-secondary">{r.role}</td>
                  <td className="py-2 pr-3 text-text-muted">{r.cohortName ?? '—'}</td>
                  <td className="py-2 pr-3"><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${STATUS_COLOR[r.status] ?? '#94A3B8'}1f`, color: STATUS_COLOR[r.status] ?? '#94A3B8' }}>{r.status}</span></td>
                  <td className="py-2 pr-3 text-text-muted">{r.sentLabel}</td>
                  <td className="py-2 text-right">
                    {r.status === 'pending' ? (
                      <span className="inline-flex gap-2">
                        <button disabled={pending} onClick={() => run(() => resendInviteAction(r.id), 'Invite re-sent.')} className="inline-flex items-center gap-1 text-text-muted hover:text-electric"><RotateCcw className="h-3.5 w-3.5" /> Resend</button>
                        <button disabled={pending} onClick={() => run(() => revokeInviteAction(r.id), 'Invite revoked.')} className="inline-flex items-center gap-1 text-text-muted hover:text-risk"><Ban className="h-3.5 w-3.5" /> Revoke</button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* audit log */}
      <div>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted"><History className="h-3.5 w-3.5" /> Invite audit log</h4>
        {events.length === 0 ? <p className="text-caption text-text-muted">No invite events yet.</p> : (
          <ul className="space-y-1">{events.map((e) => <li key={e.id} className="flex items-center justify-between text-caption"><span className="text-text-secondary">{e.event}{e.note ? ` — ${e.note}` : ''}</span><span className="text-text-muted">{e.dateLabel}</span></li>)}</ul>
        )}
      </div>

      {msg ? <p className="text-caption text-text-muted">{msg}</p> : null}
    </Card>
  );
}
