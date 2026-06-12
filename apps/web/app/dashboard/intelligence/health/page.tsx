// =============================================================================
// HSI Phase 18 — Platform Health (/dashboard/intelligence/health). Server
// Component, force-dynamic. getPlatformHealthAction() returns the ten monitored
// engines (Research / Evidence / Temporal / Causal / Counterfactual / Decision /
// Outcome / Calibration / Trust / Governance) each HEALTHY / DEGRADED / DOWN with
// last run, success/failure rate, and queue depth, plus per-agent performance.
// Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { HeartPulse } from 'lucide-react';
import type { PlatformHealthData } from '@hsi/shared-types';
import { getPlatformHealthAction } from '@/lib/orchestration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  agentLabel,
  canResearch,
  demoPlatformHealth,
  engineLabel,
  formatPct,
  formatRuntime,
  healthDecor,
} from '@/lib/orchestration/view';
import { IntelligenceOpsNav } from '@/components/intelligence/IntelligenceOpsNav';
import { HealthBadge } from '@/components/intelligence/badges';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HealthPage() {
  const [res, role, user] = await Promise.all([
    getPlatformHealthAction(),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);

  let data: PlatformHealthData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoPlatformHealth();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Platform health" subtitle="Is the intelligence system healthy? — ten engines, continuously monitored" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelligenceOpsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <HeartPulse className="h-5 w-5 text-electric" /> Engine health
          </h2>
          {isDemo ? <DemoBadge /> : null}
          {data ? <HealthBadge status={data.overallStatus} /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing health requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load health" message={errored.message} code={errored.code} redirectedFrom="/dashboard/intelligence/health" />
        ) : !data ? null : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.health.map((h) => (
                <Card key={h.engine} className="space-y-2 border-border" padded>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary">{engineLabel(h.engine)}</span>
                    <HealthBadge status={h.status} />
                  </div>
                  <p className="text-[12px] leading-snug text-text-muted">{h.detail}</p>
                  <div className="grid grid-cols-3 gap-2 text-caption">
                    <Stat label="Success" value={formatPct(h.successRate)} color={healthDecor('HEALTHY').color} />
                    <Stat label="Failure" value={formatPct(h.failureRate)} color={healthDecor('DOWN').color} />
                    <Stat label="Queue" value={String(h.queueDepth)} color={healthDecor('DEGRADED').color} />
                  </div>
                </Card>
              ))}
            </div>

            <Card className="space-y-3 border-border" padded>
              <h3 className="text-h6 font-semibold text-text-primary">Agent performance</h3>
              <table className="w-full text-caption">
                <thead>
                  <tr className="border-b border-border text-left text-label uppercase tracking-wide text-text-muted">
                    <th className="py-2 font-medium">Agent</th>
                    <th className="py-2 font-medium">Active</th>
                    <th className="py-2 font-medium">Completed</th>
                    <th className="py-2 font-medium">Failed</th>
                    <th className="py-2 font-medium">Avg runtime</th>
                    <th className="py-2 font-medium">Success</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agentPerformance.map((a) => (
                    <tr key={a.agentType} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 text-text-secondary">{agentLabel(a.agentType)}</td>
                      <td className="py-1.5 tabular-nums text-text-muted">{a.active}</td>
                      <td className="py-1.5 tabular-nums text-text-muted">{a.completed}</td>
                      <td className="py-1.5 tabular-nums text-text-muted">{a.failed}</td>
                      <td className="py-1.5 tabular-nums text-text-muted">{formatRuntime(a.avgRuntimeMs)}</td>
                      <td className="py-1.5 tabular-nums text-text-secondary">{formatPct(a.successRate)}</td>
                      <td className="py-1.5"><HealthBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/50 px-2 py-1.5 text-center">
      <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}
