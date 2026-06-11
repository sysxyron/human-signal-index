// =============================================================================
// HSI Phase 17 — Trust Drift (/dashboard/trust/drift). Server Component,
// force-dynamic. getTrustDriftDashboardAction() returns the detected drift events
// (TrustDriftTimeline) + severity/kind breakdowns. Drift only RECOMMENDS
// recalibration — it never auto-corrects. Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/trust-history fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Waves, Info } from 'lucide-react';
import type { TrustDriftDashboardData, TrustDriftKind, TrustSeverity } from '@hsi/shared-types';
import { getTrustDriftDashboardAction } from '@/lib/trust/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoTrustDriftDashboard, driftDecor, severityDecor } from '@/lib/trust/view';
import { TrustGovernanceNav } from '@/components/trust/TrustGovernanceNav';
import { TrustDriftTimeline } from '@/components/trust/TrustDriftTimeline';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TrustDriftPage() {
  const [res, role, user] = await Promise.all([
    getTrustDriftDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);

  let data: TrustDriftDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoTrustDriftDashboard();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const hasData = (data?.events.length ?? 0) > 0;

  const SEVERITIES: TrustSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const KINDS: TrustDriftKind[] = [
    'collapse',
    'degradation',
    'instability',
    'overconfidence',
    'underconfidence',
    'stable',
  ];

  return (
    <>
      <TopNav
        title="Trust drift"
        subtitle="What caused trust to fall? — advisory drift detection, never auto-corrected"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <TrustGovernanceNav />

        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Waves className="h-5 w-5 text-electric" /> Drift timeline
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Drift compares each entity&apos;s latest trust against its established baseline. Every
            event is <span className="font-semibold text-text-primary">advisory</span> — it
            recommends a review or recalibration for a human, and never changes a score on its own.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing trust drift requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load trust drift" message={errored.message} code={errored.code} redirectedFrom="/dashboard/trust/drift" />
        ) : !data ? null : !hasData ? (
          <EmptyState
            icon={<Waves className="h-5 w-5" />}
            title="No drift detected"
            message="Once entities accumulate trust history, drift events (degradation, collapse, instability, over-/under-confidence) will appear here."
          />
        ) : (
          <div className="space-y-6">
            {/* Breakdowns */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="space-y-2 border-border" padded>
                <span className="text-label uppercase tracking-wide text-text-muted">By severity</span>
                <div className="flex flex-wrap gap-3">
                  {SEVERITIES.map((s) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-caption font-semibold"
                        style={{
                          color: severityDecor(s).color,
                          backgroundColor: `${severityDecor(s).color}1f`,
                          border: `1px solid ${severityDecor(s).color}55`,
                        }}
                      >
                        {severityDecor(s).label}
                      </span>
                      <span className="tabular-nums text-caption font-semibold text-text-primary">
                        {data.bySeverity[s]}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="space-y-2 border-border" padded>
                <span className="text-label uppercase tracking-wide text-text-muted">By kind</span>
                <div className="flex flex-wrap gap-3">
                  {KINDS.filter((k) => data!.byKind[k] > 0).map((k) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <span className="text-caption font-medium" style={{ color: driftDecor(k).color }}>
                        {driftDecor(k).label}
                      </span>
                      <span className="tabular-nums text-caption font-semibold text-text-primary">
                        {data!.byKind[k]}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <TrustDriftTimeline events={data.events} />
          </div>
        )}
      </main>
    </>
  );
}
