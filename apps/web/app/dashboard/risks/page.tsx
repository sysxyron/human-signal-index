// =============================================================================
// HSI Phase 22 — Operational Risks (/dashboard/risks). Server Component,
// force-dynamic. Risks derived from warnings, failing forecasts, disputed
// consensus, low/degrading trust, and open escalations — grouped by severity,
// each with an advisory recommendation. Researcher+ view. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ShieldAlert, Info } from 'lucide-react';
import type { ExecutiveRisksData } from '@hsi/shared-types';
import { getExecutiveRisksAction } from '@/lib/executive/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoExecutiveRisks } from '@/lib/executive/view';
import { ExecutiveNav } from '@/components/executive/ExecutiveNav';
import { RiskMatrix } from '@/components/executive/RiskMatrix';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RisksPage() {
  const [res, role, user] = await Promise.all([getExecutiveRisksAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ExecutiveRisksData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoExecutiveRisks(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Operational Risks" subtitle="What could go wrong — risks across warnings, forecasts, consensus, trust, and operations" />
      <main className="space-y-6 p-5 lg:p-6">
        <ExecutiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><ShieldAlert className="h-5 w-5 text-risk" /> Risk matrix</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Risks are <span className="font-semibold text-text-primary">advisory</span> — each names its source and a recommended
            (never automatic) action. Acknowledge, resolve, or route to governance from the originating subsystem.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing risks requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load risks" message={errored.message} code={errored.code} redirectedFrom="/dashboard/risks" />
        ) : !data ? null : (
          <RiskMatrix data={data} />
        )}
      </main>
    </>
  );
}
