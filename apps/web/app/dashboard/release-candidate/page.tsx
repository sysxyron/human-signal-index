// =============================================================================
// HSI Phase 55 — Beta Release Candidate Command Center (/dashboard/release-
// candidate). Server Component, force-dynamic, researcher+ (gate reuses
// canResearch). The capstone: composes every intelligence layer (phases 43–54)
// into one launch-readiness screen — "can we launch beta today?". Read-only; no
// new workflows, data models, queries, or permission changes.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch } from '@/lib/operations-os/view';
import { ErrorState } from '@/components/signals/states';
import { getReleaseReadiness } from '@/lib/release-readiness';
import {
  ReleaseStatusBanner, MetricGrid, SystemHealthPanel, AlertsRisksPanel, NetworkReadinessPanel,
  LaunchBriefPanel, ReleaseChecklist, ICONS,
} from '@/components/release-candidate/panels';
import { ReadOnlyNotice } from '@/components/navigation/ReadOnlyNotice';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReleaseCandidatePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);

  if (!user || !canResearch(role)) {
    return (
      <>
        <TopNav title="Release Candidate" subtitle="Beta launch readiness" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'The Release Candidate Command Center is available to the researcher role or above.' : 'Sign in to view launch readiness.'}
            redirectedFrom="/dashboard/release-candidate"
          />
        </main>
      </>
    );
  }

  const r = await getReleaseReadiness(role);

  if (!r.available) {
    return (
      <>
        <TopNav title="Beta Release Candidate" subtitle="Beta launch readiness" />
        <main className="space-y-6 p-5 lg:p-6">
          <div className="rounded-card border border-border bg-surface-1 p-8 text-center">
            <h2 className="text-h5 font-semibold text-text-primary">Release Candidate Center</h2>
            <p className="mx-auto mt-2 max-w-md text-body-sm text-text-secondary">
              No release-readiness data is available yet. Launch readiness is composed from live platform
              intelligence — once data is flowing, this screen will summarise whether beta can launch.
            </p>
            <p className="mt-3 text-caption text-text-muted">
              Platform checks remain accessible from{' '}
              <a className="text-electric underline" href="/dashboard/platform-audit">Platform Audit</a>.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav title="Beta Release Candidate" subtitle="One screen: are we ready to launch beta?" />
      <main className="space-y-6 p-5 lg:p-6">
        <ReadOnlyNotice
          title="About this view"
          points={[
            'Read-only launch-readiness summary, composed from live platform data across every intelligence layer.',
            'Operational actions live elsewhere: Mission Control (overview), the Review Queue (reviewers), and Publishing (curators).',
            'Aggregate contributor / reviewer figures are shown to administrators only.',
          ]}
          actions={[{ label: 'Mission Control', href: '/dashboard' }]}
        />

        {/* Part 1 + Part 3 — release command + overall status */}
        <ReleaseStatusBanner status={r.status} score={r.score} reasons={r.statusReasons} />

        {/* Part 2 — platform readiness */}
        <MetricGrid title="Platform readiness" icon={ICONS.ShieldCheck} rows={r.platformReadiness} />

        {/* Part 3 — system health */}
        <SystemHealthPanel rows={r.systemHealth} />

        {/* Part 10 — release checklist */}
        <ReleaseChecklist items={r.checklist} />

        {/* Part 9 — executive launch brief */}
        <LaunchBriefPanel brief={r.launchBrief} />

        {/* Part 6 — alerts & risks, Part 7 — network readiness */}
        <div className="grid gap-4 xl:grid-cols-2">
          <AlertsRisksPanel risks={r.alertsRisks} />
          <NetworkReadinessPanel rows={r.networkReadiness.rows} score={r.networkReadiness.score} scoreReason={r.networkReadiness.scoreReason} />
        </div>

        {/* Part 4 — beta operations, Part 5 — intelligence health */}
        <div className="grid gap-4 xl:grid-cols-2">
          <MetricGrid title="Beta operations" icon={ICONS.Activity} rows={r.betaOps} />
          <MetricGrid title="Intelligence health" icon={ICONS.Layers} rows={r.intelligenceHealth} />
        </div>

        {/* Part 8 — trust & governance */}
        <MetricGrid title="Trust & governance" icon={ICONS.ShieldCheck} rows={r.trustGovernance} />
      </main>
    </>
  );
}
