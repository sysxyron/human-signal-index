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
  listJobsAction,
  listSchedulerRulesAction,
  listSlaPoliciesAction,
  listTriageRulesAction,
} from '@/lib/operations/actions';
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
