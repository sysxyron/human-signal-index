// =============================================================================
// HSI Phase 24D — My Profile (/dashboard/profile). Server Component. Any signed-in
// user. Shows the user's role, account status, team, a plain-English summary of
// what their role can/can't do, and recommended next actions. Admins also get a
// read-only role visibility preview (no impersonation, no permission bypass).
// =============================================================================

import { TopNav, Card, ALL_NAV_HREFS, canSeeRoute, isRestrictedRoute } from '@hsi/ui';
import Link from 'next/link';
import { UserRound, ShieldCheck, Users, Info, ArrowRight, Table2 } from 'lucide-react';
import { getMyProfileAction } from '@/lib/profile/actions';
import {
  ROLE_LABEL, ROLES, summaryForRole, tasksForRole, type Role,
} from '@/lib/navigation/role-tasks';
import { ErrorState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = { pending: '#F59E0B', active: '#10B981', suspended: '#EF4444', disabled: '#94A3B8' };

function isAdmin(role: string | null): boolean { return role === 'admin'; }

export default async function ProfilePage() {
  const res = await getMyProfileAction();
  if (!res.ok) {
    return (
      <>
        <TopNav title="My Profile" subtitle="Your account and role" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load your profile" message={res.code === 'AUTH_REQUIRED' ? 'Sign in to view your profile.' : 'Your profile is unavailable right now.'} redirectedFrom="/dashboard/profile" />
        </main>
      </>
    );
  }

  const { email, role, status, team } = res.data;
  const roleLabel = role ? (ROLE_LABEL[role as Role] ?? role) : 'Viewer';
  const tasks = tasksForRole(role);

  return (
    <>
      <TopNav title="My Profile" subtitle="Your account, role, and what you can do" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Account summary */}
        <Card className="space-y-4 border-border" padded>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white"><UserRound className="h-6 w-6" /></span>
            <div>
              <div className="text-h6 font-semibold text-text-primary">{email ?? 'Your account'}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-electric/15 px-2.5 py-0.5 text-label font-semibold text-electric">{roleLabel}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label font-semibold" style={{ backgroundColor: `${STATUS_COLOR[status] ?? '#94A3B8'}1f`, color: STATUS_COLOR[status] ?? '#94A3B8' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] ?? '#94A3B8' }} /> {status}
                </span>
                <span className="inline-flex items-center gap-1.5 text-label text-text-muted"><Users className="h-3.5 w-3.5" /> {team ?? 'No team'}</span>
              </div>
            </div>
          </div>
          {status === 'pending' ? (
            <p className="flex items-start gap-1.5 text-caption text-warning"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Your account is awaiting administrator approval. You can read and explore in the meantime.</p>
          ) : null}
        </Card>

        {/* What your role can do (access explanation — Deliverable 7) */}
        <Card className="space-y-2 border-border" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ShieldCheck className="h-4 w-4 text-electric" /> What your role can do</h3>
          <p className="text-caption leading-relaxed text-text-secondary">{summaryForRole(role)}</p>
          <p className="text-label text-text-muted">Your role is assigned by an administrator. Menus you don&apos;t see are hidden because your role doesn&apos;t use them — those areas are still access-protected, not broken.</p>
        </Card>

        {/* Recommended next actions */}
        <section className="space-y-3">
          <h3 className="text-h6 font-semibold text-text-primary">Recommended next actions</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {tasks.map((t) => (
              <Link key={t.href + t.label} href={t.href as never} className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface/50 px-3 py-2.5 text-caption text-text-secondary transition hover:border-electric/50 hover:text-text-primary">
                <span>{t.label}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              </Link>
            ))}
          </div>
        </section>

        {/* Admin role-visibility preview (Deliverable 8) — preview only, no bypass */}
        {isAdmin(role) ? (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Table2 className="h-4 w-4 text-electric" /> Role visibility (admin preview)</h3>
            <Card className="overflow-x-auto border-border p-0" padded={false}>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2 text-left">Role</th><th className="px-4 py-2 text-right">Visible menus</th><th className="px-4 py-2 text-right">Restricted menus</th><th className="px-4 py-2 text-left">Primary tasks</th></tr>
                </thead>
                <tbody>
                  {ROLES.map((r) => {
                    const visible = ALL_NAV_HREFS.filter((h) => canSeeRoute(h, r)).length;
                    const restricted = ALL_NAV_HREFS.filter((h) => isRestrictedRoute(h) && !canSeeRoute(h, r)).length;
                    return (
                      <tr key={r} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2 font-medium text-text-primary">{ROLE_LABEL[r]}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{visible}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-muted">{restricted}</td>
                        <td className="px-4 py-2 text-text-secondary">{tasksForRole(r).slice(0, 2).map((t) => t.label).join(' · ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            <p className="text-label text-text-muted">Preview only — this does not impersonate any user or change permissions. RBAC + middleware enforce access for every account.</p>
          </section>
        ) : null}
      </main>
    </>
  );
}
