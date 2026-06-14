// =============================================================================
// HSI Phase 23 — Launch Operations Center (/dashboard/launch). Server Component,
// force-dynamic, ADMIN-ONLY. Single view of production readiness: overall score +
// READY/NOT READY, the six readiness areas (RED/YELLOW/GREEN), the readiness
// checklist with blockers, the migration audit, environment, connectivity,
// and tester/RBAC status.
//
// Read-only; changes no governance. Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Rocket, Info, Bug, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import type { LaunchStatus } from '@/lib/launch/types';
import { getLaunchStatusAction } from '@/lib/launch/actions';
import { getInviteStatsAction } from '@/lib/admin/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { demoLaunchStatus } from '@/lib/launch/view';
import { demoInviteStats } from '@/lib/admin/view';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';
import {
  ReadinessScoreCard,
  LaunchAreaGrid,
  ReadinessChecklist,
  EnvPanel,
  HealthPanel,
  TesterPanel,
} from '@/components/launch/panels';
import { MigrationStatusPanel } from '@/components/launch/MigrationStatusPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LaunchPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);

  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Launch Operations Center" subtitle="Production readiness — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'The Launch Operations Center is restricted to administrators.' : 'Sign in as an administrator to view launch readiness.'}
            redirectedFrom="/dashboard/launch"
          />
        </main>
      </>
    );
  }

  const [res, inviteRes] = await Promise.all([getLaunchStatusAction(), getInviteStatsAction()]);
  let data: LaunchStatus | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoLaunchStatus(); isDemo = true; }
  else errored = { message: res.error, code: res.code };
  const inviteStats = inviteRes.ok ? inviteRes.data : demoInviteStats();

  return (
    <>
      <TopNav title="Launch Operations Center" subtitle="Is the platform safe for external beta testers?" />
      <main className="space-y-6 p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Rocket className="h-5 w-5 text-electric" /> Production readiness</h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={'/dashboard/launch/issues' as never} className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-caption text-text-secondary transition hover:text-white"><Bug className="h-3.5 w-3.5" /> Beta issues</Link>
            <Link href={'/dashboard/tester-onboarding' as never} className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3 py-1.5 text-caption text-text-secondary transition hover:text-white"><GraduationCap className="h-3.5 w-3.5" /> Tester onboarding</Link>
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            This center reports readiness — it changes nothing and acts on nothing. Every governance guarantee from Phases
            1–22A is preserved: no automated publication, enforcement, or moderation. A <span className="font-semibold text-text-primary">READY</span> recommendation
            means no launch blockers and a readiness score ≥ 80.
          </p>
        </Card>

        {errored ? (
          <ErrorState title="Could not load launch status" message={errored.message} code={errored.code} redirectedFrom="/dashboard/launch" />
        ) : !data ? null : (
          <div className="space-y-6">
            <ReadinessScoreCard readiness={data.readiness} />
            <section className="space-y-2">
              <h3 className="text-h6 font-semibold text-text-primary">Tester invitations</h3>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Total testers', value: inviteStats.totalTesters, color: '#3B82F6' },
                  { label: 'Active', value: inviteStats.activeTesters, color: '#10B981' },
                  { label: 'Pending invitations', value: inviteStats.pendingInvitations, color: '#F59E0B' },
                  { label: 'Suspended', value: inviteStats.suspendedUsers, color: '#EF4444' },
                ].map((s) => (
                  <Card key={s.label} className="space-y-1 border-border" padded>
                    <div className="text-h5 font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-label uppercase tracking-wide text-text-muted">{s.label}</div>
                  </Card>
                ))}
              </div>
              <Link href={'/dashboard/admin/users' as never} className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white">Manage users →</Link>
            </section>
            <LaunchAreaGrid readiness={data.readiness} />
            <MigrationStatusPanel audit={data.migration} demo={isDemo} />
            <div className="grid gap-4 lg:grid-cols-3">
              <EnvPanel env={data.env} />
              <HealthPanel health={data.health} />
              <TesterPanel status={data} />
            </div>
            <ReadinessChecklist readiness={data.readiness} />
          </div>
        )}
      </main>
    </>
  );
}
