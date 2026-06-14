'use client';

// =============================================================================
// HSI Phase 25 — admin applications review console (client). Approve / reject /
// request-more-info on role applications. Approving may assign a role (via IAM)
// and a team. The admin role is NEVER assignable here. All actions are audited
// server-side.
// =============================================================================

import { useState, useTransition } from 'react';
import { Card, Button } from '@hsi/ui';
import { Check, X, HelpCircle, Loader2 } from 'lucide-react';
import { reviewApplicationAction, type AdminApplicationRow, type ApplicationDecision } from '@/lib/contributor/applications';

const ASSIGNABLE = ['contributor', 'researcher', 'reviewer', 'curator'];
const STATUS_COLOR: Record<string, string> = { pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444', needs_more_info: '#38BDF8', withdrawn: '#94A3B8' };

function Row({ app, teams }: { app: AdminApplicationRow; teams: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(app.requestedRole && ASSIGNABLE.includes(app.requestedRole) ? app.requestedRole : 'researcher');
  const [team, setTeam] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState(app.status);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function review(decision: ApplicationDecision) {
    setMsg(null);
    startTransition(async () => {
      const res = await reviewApplicationAction({ id: app.id, decision, notes: notes || undefined, assignRole: decision === 'approved' ? role : undefined, assignTeamId: decision === 'approved' && team ? team : undefined });
      if (res.ok) { setStatus(decision); setMsg(`Marked ${decision}${res.data.assignedRole ? ` · assigned ${res.data.assignedRole}` : ''}.`); setOpen(false); }
      else setMsg(res.error ?? 'Action failed.');
    });
  }

  return (
    <Card className="space-y-2 border-border" padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary">{app.email ?? app.userId}</span>
            <span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${STATUS_COLOR[status]}1f`, color: STATUS_COLOR[status] }}>{status.replace(/_/g, ' ')}</span>
          </div>
          <p className="mt-0.5 text-caption text-text-secondary">Path: <span className="capitalize">{app.requestedPath.replace(/_/g, ' ')}</span>{app.requestedRole ? ` · wants ${app.requestedRole}` : ''}{app.organization ? ` · ${app.organization}` : ''}</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)} disabled={status !== 'pending' && status !== 'needs_more_info'}>{open ? 'Close' : 'Review'}</Button>
      </div>

      {app.reason ? <p className="text-caption text-text-secondary"><span className="text-text-muted">Reason:</span> {app.reason}</p> : null}
      {app.experienceSummary ? <p className="text-caption text-text-secondary"><span className="text-text-muted">Experience:</span> {app.experienceSummary}</p> : null}

      {open ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-label font-medium text-text-secondary">Assign role (on approve)</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary">
                {ASSIGNABLE.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-label font-medium text-text-secondary">Assign team (optional)</span>
              <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary">
                <option value="">— none —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-label font-medium text-text-secondary">Review notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
          </label>
          <p className="text-label text-text-muted">The admin role is never assignable here. Approving “contributor” keeps the Viewer role and records the Contributor rank.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => review('approved')} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve</Button>
            <Button onClick={() => review('needs_more_info')} disabled={pending}><HelpCircle className="h-4 w-4" /> Request info</Button>
            <Button onClick={() => review('rejected')} disabled={pending}><X className="h-4 w-4" /> Reject</Button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="text-caption text-text-secondary">{msg}</p> : null}
    </Card>
  );
}

export function ApplicationsConsole({ applications, teams }: { applications: AdminApplicationRow[]; teams: Array<{ id: string; name: string }> }) {
  if (applications.length === 0) {
    return <Card className="py-10 text-center text-caption text-text-secondary" padded>No applications to review.</Card>;
  }
  return <div className="space-y-3">{applications.map((a) => <Row key={a.id} app={a} teams={teams} />)}</div>;
}
