'use client';

// =============================================================================
// HSI Phase 35 — organization members console (client). Invite / change role /
// remove. Gated by ORG membership role (owner/administrator) — never global RBAC.
// Every action is audited to organization_audit_log server-side.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { UserPlus, Trash2, Loader2 } from 'lucide-react';
import { MEMBERSHIP_ROLES, MEMBERSHIP_LABEL, type MembershipRole } from '@/lib/org/membership';
import { inviteMemberAction, changeMemberRoleAction, removeMemberAction, type OrgMember } from '@/lib/org/organizations';

export function OrgMembersConsole({ orgId, members, canManage }: { orgId: string; members: OrgMember[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('contributor');
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setMsg(null);
    startTransition(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Action failed.')); if (r.ok) router.refresh(); });
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <Card className="space-y-2 border-border" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><UserPlus className="h-4 w-4 text-electric" /> Invite member</h3>
          <div className="flex flex-wrap items-end gap-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@org.com" className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
            <select value={role} onChange={(e) => setRole(e.target.value as MembershipRole)} className="rounded-card border border-border bg-surface px-2 py-2 text-caption text-text-primary">{MEMBERSHIP_ROLES.map((r) => <option key={r} value={r}>{MEMBERSHIP_LABEL[r]}</option>)}</select>
            <Button onClick={() => { if (email) run(() => inviteMemberAction(orgId, email, role), 'Member added.'); }} disabled={pending || !email}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Invite</Button>
          </div>
          <p className="text-label text-text-muted">The invitee must already have an HSI account. Org membership never changes their platform role.</p>
        </Card>
      ) : null}

      <Card className="overflow-x-auto border-border p-0" padded={false}>
        <table className="w-full text-caption">
          <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
            <tr><th className="px-4 py-2 text-left">Member</th><th className="px-4 py-2 text-left">Org role</th><th className="px-4 py-2 text-left">Joined</th>{canManage ? <th className="px-4 py-2" /> : null}</tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 text-text-primary">{m.email ?? m.userId}</td>
                <td className="px-4 py-2">
                  {canManage ? (
                    <select defaultValue={m.membershipRole} onChange={(e) => run(() => changeMemberRoleAction(orgId, m.userId, e.target.value as MembershipRole), 'Role updated.')} disabled={pending} className="rounded-card border border-border bg-surface px-2 py-1 text-label text-text-primary">{MEMBERSHIP_ROLES.map((r) => <option key={r} value={r}>{MEMBERSHIP_LABEL[r]}</option>)}</select>
                  ) : <span className="text-text-secondary">{MEMBERSHIP_LABEL[m.membershipRole]}</span>}
                </td>
                <td className="px-4 py-2 text-text-muted">{new Date(m.joinedAt).toLocaleDateString()}</td>
                {canManage ? <td className="px-4 py-2 text-right"><button type="button" onClick={() => run(() => removeMemberAction(orgId, m.userId), 'Member removed.')} className="text-text-muted hover:text-error"><Trash2 className="h-4 w-4" /></button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {msg ? <p className="text-caption text-text-secondary">{msg}</p> : null}
    </div>
  );
}
