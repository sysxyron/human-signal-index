// =============================================================================
// HSI Phase 8 — Operations Console (/dashboard/operations). Server Component,
// force-dynamic. The durable-queue + scheduler + provider + SLA control surface.
//
// Widgets: job-status stat cards, the job queue (filterable, retry/cancel +
// detail drawer), the scheduler (rules + create form), source-health summary,
// provider rate limits, recent job attempts, capture/alert throughput charts,
// SLA policies, an overdue/needs-attention panel, and the triage rules panel.
//
// Reads via getOperationsOverviewAction / listJobsAction / listSchedulerRulesAction
// / listTriageRulesAction / listSlaPoliciesAction. Mutations are role-gated
// server-side (getSessionRole). Offline (NOT_CONFIGURED) → labeled demo data.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { Cog, TrendingUp, Bell } from 'lucide-react';
import type {
  HsinJobQueueRecord,
  HsinSchedulerRuleRecord,
  HsinSlaPolicyRecord,
  HsinTriageRuleRecord,
  OperationsOverview,
} from '@hsi/shared-types';
import {
  getOperationsOverviewAction,
  getProvidersOverviewAction,
  listJobsAction,
  listSchedulerRulesAction,
  listSlaPoliciesAction,
  listTriageRulesAction,
} from '@/lib/operations/actions';
import type { HsinProviderRunRecord, TemporalHighlights } from '@hsi/shared-types';
import { demoProviderRuns } from '@/lib/operations/phase9-view';
import { OperationsPhase9Strip } from '@/components/providers/OperationsPhase9Strip';
import { getTemporalHighlightsAction } from '@/lib/temporal/actions';
import { demoTemporalHighlights } from '@/lib/temporal/view';
import { TemporalHighlightCards } from '@/components/temporal/TemporalHighlightCards';
import type { CausalHighlights } from '@hsi/shared-types';
import { getCausalHighlightsAction } from '@/lib/causal/actions';
import { demoCausalHighlights } from '@/lib/causal/view';
import { CausalHighlightCards } from '@/components/causal/CausalHighlightCards';
import type { SimulationHighlights } from '@hsi/shared-types';
import { getSimulationHighlightsAction } from '@/lib/simulation/actions';
import { demoSimulationHighlights } from '@/lib/simulation/view';
import { SimulationHighlightCards } from '@/components/simulation/SimulationHighlightCards';
import type { DecisionHighlights } from '@hsi/shared-types';
import { getDecisionHighlightsAction } from '@/lib/decision/actions';
import { demoDecisionHighlights } from '@/lib/decision/view';
import { DecisionHighlightCards } from '@/components/decision/DecisionHighlightCards';
import type { OutcomeDashboardHighlights } from '@hsi/shared-types';
import { getOutcomeHighlightsAction } from '@/lib/outcome/actions';
import { demoOutcomeHighlights } from '@/lib/outcome/view';
import { OutcomeHighlightCards } from '@/components/outcome/OutcomeHighlightCards';
import type { CalibrationHighlights } from '@hsi/shared-types';
import { getCalibrationHighlightsAction } from '@/lib/calibration/actions';
import { demoCalibrationHighlights } from '@/lib/calibration/view';
import { CalibrationHighlightCards } from '@/components/calibration/CalibrationHighlightCards';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canOperate,
  demoOperationsOverview,
  demoJobs,
  applyDemoJobFilters,
  demoSchedulerRules,
  demoSlaPolicies,
  demoTriageRules,
} from '@/lib/operations/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { JobStatusCards } from '@/components/operations/JobStatusCards';
import { JobsTable } from '@/components/operations/JobsTable';
import { SchedulerRulesTable } from '@/components/operations/SchedulerRulesTable';
import { CreateScheduleForm } from '@/components/operations/CreateScheduleForm';
import { ProviderRateLimitGrid } from '@/components/operations/ProviderRateLimitGrid';
import { SourceHealthSummary } from '@/components/operations/SourceHealthSummary';
import { ThroughputChart } from '@/components/operations/ThroughputChart';
import { JobAttemptsList } from '@/components/operations/JobAttemptsList';
import { TriageRulesPanel } from '@/components/operations/TriageRulesPanel';
import { OverduePanel, SlaPolicyList } from '@/components/operations/OverduePanel';
// ADDITIVE (Phase 14): a discoverability link to the admin Security dashboard.
import { SecurityHealthLink } from '@/components/security/SecurityHealthLink';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface OperationsSearch {
  status?: string;
  jobType?: string;
  sourceId?: string;
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: OperationsSearch;
}) {
  const jobFilters = {
    status: searchParams.status as never,
    jobType: searchParams.jobType,
    sourceId: searchParams.sourceId,
  };

  const [overviewRes, jobsRes, rulesRes, triageRes, slaRes, role, user] =
    await Promise.all([
      getOperationsOverviewAction(),
      listJobsAction(jobFilters),
      listSchedulerRulesAction(),
      listTriageRulesAction(),
      listSlaPoliciesAction(),
      getSessionRole(),
      getUser(),
    ]);

  const operate = canOperate(role) && Boolean(user);

  // ADDITIVE (Phase 9): a defensive recent-provider-runs preview. A failure here
  // (e.g. action not yet present) must never break the operations page.
  let providerRuns: HsinProviderRunRecord[] | null = null;
  let providerRunsDemo = false;
  try {
    const provRes = await getProvidersOverviewAction();
    if (provRes.ok) {
      providerRuns = provRes.data.runs;
    } else if (provRes.code === 'NOT_CONFIGURED') {
      providerRuns = demoProviderRuns();
      providerRunsDemo = true;
    }
  } catch {
    providerRuns = null;
  }

  // ADDITIVE (Phase 10): a defensive temporal-highlights strip. A failure here
  // (e.g. action not yet present) must never break the operations page — on any
  // error we simply hide the strip.
  let temporalHighlights: TemporalHighlights | null = null;
  let temporalDemoLabeled = false;
  try {
    const thRes = await getTemporalHighlightsAction();
    if (thRes.ok) {
      temporalHighlights = thRes.data;
    } else if (thRes.code === 'NOT_CONFIGURED') {
      temporalHighlights = await demoTemporalHighlights();
      temporalDemoLabeled = true;
    }
  } catch {
    temporalHighlights = null;
  }

  // ADDITIVE (Phase 11): a defensive causal-highlights strip. A failure here
  // (e.g. action not yet present) must never break the operations page — on any
  // error we simply hide the strip.
  let causalHighlights: CausalHighlights | null = null;
  let causalDemoLabeled = false;
  try {
    const chRes = await getCausalHighlightsAction();
    if (chRes.ok) {
      causalHighlights = chRes.data;
    } else if (chRes.code === 'NOT_CONFIGURED') {
      causalHighlights = demoCausalHighlights();
      causalDemoLabeled = true;
    }
  } catch {
    causalHighlights = null;
  }

  // ADDITIVE (Phase 12): a defensive simulation-highlights strip. A failure here
  // (e.g. action not yet present) must never break the operations page — on any
  // error we simply hide the strip.
  let simulationHighlights: SimulationHighlights | null = null;
  let simulationDemoLabeled = false;
  try {
    const shRes = await getSimulationHighlightsAction();
    if (shRes.ok) {
      simulationHighlights = shRes.data;
    } else if (shRes.code === 'NOT_CONFIGURED') {
      simulationHighlights = demoSimulationHighlights();
      simulationDemoLabeled = true;
    }
  } catch {
    simulationHighlights = null;
  }

  // ADDITIVE (Phase 13): a defensive decision-intelligence highlights strip. A
  // failure here (e.g. action not yet present) must never break the operations
  // page — on any error we simply hide the strip.
  let decisionHighlights: DecisionHighlights | null = null;
  let decisionDemoLabeled = false;
  try {
    const dhRes = await getDecisionHighlightsAction();
    if (dhRes.ok) {
      decisionHighlights = dhRes.data;
    } else if (dhRes.code === 'NOT_CONFIGURED') {
      decisionHighlights = demoDecisionHighlights();
      decisionDemoLabeled = true;
    }
  } catch {
    decisionHighlights = null;
  }

  // ADDITIVE (Phase 15): a defensive outcome-&-governance highlights strip. A
  // failure here (e.g. action not yet present) must never break the operations
  // page — on any error we simply hide the strip.
  let outcomeHighlights: OutcomeDashboardHighlights | null = null;
  let outcomeDemoLabeled = false;
  try {
    const ohRes = await getOutcomeHighlightsAction();
    if (ohRes.ok) {
      outcomeHighlights = ohRes.data;
    } else if (ohRes.code === 'NOT_CONFIGURED') {
      outcomeHighlights = demoOutcomeHighlights();
      outcomeDemoLabeled = true;
    }
  } catch {
    outcomeHighlights = null;
  }

  // ADDITIVE (Phase 16): a defensive calibration-&-trust highlights strip. A
  // failure here (e.g. action not yet present) must never break the operations
  // page — on any error we simply hide the strip.
  let calibrationHighlights: CalibrationHighlights | null = null;
  let calibrationDemoLabeled = false;
  try {
    const cbRes = await getCalibrationHighlightsAction();
    if (cbRes.ok) {
      calibrationHighlights = cbRes.data;
    } else if (cbRes.code === 'NOT_CONFIGURED') {
      calibrationHighlights = demoCalibrationHighlights();
      calibrationDemoLabeled = true;
    }
  } catch {
    calibrationHighlights = null;
  }

  // Resolve the overview: live, demo (NOT_CONFIGURED), or a real error.
  let overview: OperationsOverview | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (overviewRes.ok) {
    overview = overviewRes.data;
  } else if (overviewRes.code === 'NOT_CONFIGURED') {
    overview = demoOperationsOverview();
    isDemo = true;
  } else {
    errored = { message: overviewRes.error, code: overviewRes.code };
  }

  // Jobs (filtered). Demo path applies the same filters client/server-side.
  const jobs: HsinJobQueueRecord[] = isDemo
    ? applyDemoJobFilters(demoJobs(), searchParams)
    : jobsRes.ok
      ? jobsRes.data
      : [];

  // Scheduler rules — prefer the dedicated action, else the overview's list.
  const schedulerRules: HsinSchedulerRuleRecord[] = isDemo
    ? demoSchedulerRules()
    : rulesRes.ok
      ? rulesRes.data
      : overview?.schedulerRules ?? [];

  const triageRules: HsinTriageRuleRecord[] = isDemo
    ? demoTriageRules()
    : triageRes.ok
      ? triageRes.data
      : [];

  const slaPolicies: HsinSlaPolicyRecord[] = isDemo
    ? demoSlaPolicies()
    : slaRes.ok
      ? slaRes.data
      : [];

  if (!overview) {
    return (
      <>
        <TopNav title="Operations" subtitle="Queue, scheduler & SLA control surface" />
        <main className="space-y-6 p-5 lg:p-6">
          <IntelNav />
          <ErrorState
            title="Could not load operations overview"
            message={errored?.message ?? 'Unknown error.'}
            code={errored?.code}
            redirectedFrom="/dashboard/operations"
          />
        </main>
      </>
    );
  }

  const o = overview;
  const jobTypes = Array.from(
    new Set([...jobs.map((j) => j.job_type), 'capture', 'apply_triage', 'build_narrative_graph']),
  );
  const attentionJobs = jobs.filter(
    (j) => j.status === 'failed' || j.status === 'retrying',
  );

  return (
    <>
      <TopNav title="Operations Console" subtitle="Queue, scheduler & SLA control surface" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Cog className="h-5 w-5 text-electric" /> Operations
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {/* ADDITIVE (Phase 14): Security-health link to the admin dashboard. */}
        <SecurityHealthLink />

        {/* ADDITIVE (Phase 9): dead-letter link + recent provider-runs strip. */}
        <OperationsPhase9Strip runs={providerRuns} demo={providerRunsDemo} />

        {/* ADDITIVE (Phase 10): temporal-intelligence highlights strip. */}
        {temporalHighlights ? (
          <TemporalHighlightCards
            highlights={temporalHighlights}
            demo={temporalDemoLabeled}
          />
        ) : null}

        {/* ADDITIVE (Phase 11): causal-intelligence highlights strip. */}
        {causalHighlights ? (
          <CausalHighlightCards
            highlights={causalHighlights}
            demo={causalDemoLabeled}
          />
        ) : null}

        {/* ADDITIVE (Phase 12): counterfactual-simulation highlights strip. */}
        {simulationHighlights ? (
          <SimulationHighlightCards
            highlights={simulationHighlights}
            demo={simulationDemoLabeled}
          />
        ) : null}

        {/* ADDITIVE (Phase 13): decision-intelligence highlights strip. */}
        {decisionHighlights ? (
          <DecisionHighlightCards
            highlights={decisionHighlights}
            demo={decisionDemoLabeled}
          />
        ) : null}

        {/* ADDITIVE (Phase 15): outcome-&-governance highlights strip. */}
        {outcomeHighlights ? (
          <OutcomeHighlightCards
            highlights={outcomeHighlights}
            demo={outcomeDemoLabeled}
          />
        ) : null}

        {/* ADDITIVE (Phase 16): calibration-&-trust highlights strip. */}
        {calibrationHighlights ? (
          <CalibrationHighlightCards
            highlights={calibrationHighlights}
            demo={calibrationDemoLabeled}
          />
        ) : null}

        {/* Job-status stat cards */}
        <JobStatusCards overview={o} />

        {/* Throughput charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <ThroughputChart
            title="Capture throughput"
            points={o.captureThroughput}
            color="#3B82F6"
            seriesName="Signals / day"
            icon={TrendingUp}
          />
          <ThroughputChart
            title="Alert throughput"
            points={o.alertThroughput}
            color="#EF4444"
            seriesName="Alerts / day"
            icon={Bell}
          />
        </div>

        {/* Source health + provider rate limits */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SourceHealthSummary summary={o.sourceHealthSummary} />
          <ProviderRateLimitGrid limits={o.providerRateLimits} />
        </div>

        {/* SLA + needs-attention */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SlaPolicyList policies={slaPolicies} />
          <OverduePanel attentionJobs={attentionJobs} />
        </div>

        {/* Scheduler */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <CreateScheduleForm canManage={operate} demo={isDemo} />
        </div>
        <SchedulerRulesTable rules={schedulerRules} canManage={operate} demo={isDemo} />

        {/* Triage rules */}
        <TriageRulesPanel rules={triageRules} />

        {/* Job queue */}
        <JobsTable
          jobs={jobs}
          jobTypes={jobTypes}
          canManage={operate}
          demo={isDemo}
          initialStatus={searchParams.status ?? ''}
          initialJobType={searchParams.jobType ?? ''}
        />

        {/* Recent attempts */}
        <JobAttemptsList attempts={o.recentAttempts} showJobId />
      </main>
    </>
  );
}
