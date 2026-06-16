// =============================================================================
// HSI Phase 41B.1 — Role advancement & application (/dashboard/apply-role).
// Any signed-in user. Shows current role, the progression ladder, and the
// audited application path. Advancement is ALWAYS by admin approval — badges/XP
// never auto-grant a role; this page only requests one.
// =============================================================================

import { TopNav, Card, ROLE_LADDER, roleLabel, nextRole } from '@hsi/ui';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { PURPOSE_OPTIONS } from '@/lib/contributor/options';
import { listMyApplicationsAction } from '@/lib/contributor/applications';
import { RoleApplicationForm } from '@/components/contributor/RoleApplicationForm';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';
import type { RoleApplicationRow } from '@hsi/shared-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ApplyRolePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user) {
    return (
      <><TopNav title="Your Role" subtitle="Earn trust and apply for advanced roles" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code="AUTH_REQUIRED" title="Sign in to continue" message="Sign in to view your role and apply for advanced roles." redirectedFrom="/dashboard/apply-role" />
        </main></>
    );
  }

  const current = (role ?? 'viewer').toLowerCase();
  const next = nextRole(current);
  const appsRes = await listMyApplicationsAction();
  const isDemo = !appsRes.ok && appsRes.code === 'NOT_CONFIGURED';
  const myApplications: RoleApplicationRow[] = appsRes.ok ? appsRes.data : [];

  // Don't offer the "observer" (no-role) path here — this page is about advancement.
  const options = PURPOSE_OPTIONS.filter((o) => o.requestedRole !== null).map((o) => ({ path: o.path, label: o.label, blurb: o.blurb }));

  return (
    <>
      <TopNav title="Your Role" subtitle="Earn trust and apply for advanced roles" />
      <main className="space-y-6 p-5 lg:p-6">
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-electric" />
              <span className="text-body-sm text-text-secondary">Your current role</span>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-caption font-semibold text-electric">{roleLabel(current)}</span>
            </div>
            {next ? (
              <span className="text-caption text-text-muted">Next: apply for <span className="font-semibold text-text-primary">{roleLabel(next)}</span></span>
            ) : (
              <span className="text-caption text-text-muted">You hold the highest role.</span>
            )}
          </div>
          <p className="text-caption text-text-secondary">
            Earn trust and apply for advanced roles. Badges and reputation may unlock eligibility, but
            researcher, reviewer, and curator roles are always granted by admin approval — never automatically.
          </p>
          {/* Progression ladder */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {ROLE_LADDER.map((r, i) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-label font-semibold ${r === current ? 'bg-primary/20 text-electric' : 'bg-surface-2/60 text-text-muted'}`}>
                  {roleLabel(r)}
                </span>
                {i < ROLE_LADDER.length - 1 ? <ArrowRight className="h-3 w-3 text-text-muted" /> : null}
              </span>
            ))}
          </div>
        </Card>

        {current === 'admin' ? (
          <Card><p className="text-caption text-text-muted">As an admin you can review applications in Administration → Applications.</p></Card>
        ) : (
          <RoleApplicationForm options={options} myApplications={myApplications} />
        )}
      </main>
    </>
  );
}
