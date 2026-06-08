// =============================================================================
// apps/worker/jobs — triageWorkerJob (WorldForge/HSI Phase 8)
//
// Routes recent signals to human review via the PURE triage rule-engine:
// evaluateTriage(ctx, DEFAULT_TRIAGE_RULES) (@hsi/source-intelligence). Each
// matched rule emits explainable actions (create_alert / submit_review /
// assign_sla / request_research_review / draft_research / degrade_source_health),
// each with a rationale (every action explains WHY it fired).
//
// SLA: for assign_sla actions we compute review + escalation deadlines via
// computeSlaDeadlines using the matching DEFAULT_SLA_POLICIES (by severity), so
// downstream review can prioritize/escalate.
//
// AUTO-ROUTING (binding): honors SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS (default
// FALSE). When false, any `draft_research` action is DOWNGRADED to a
// `request_research_review` (a human is asked to decide) — the worker NEVER
// drafts research automatically and NEVER auto-publishes anything. All actions
// are DRAFTS/requests for the governance pipeline.
//
// Contexts are loaded via an INJECTED loader (default no-op → empty offline run);
// actions are persisted via an INJECTED persister (default: log only). The triage
// rule set is injectable (default DEFAULT_TRIAGE_RULES). NEVER throws.
//
// SCHEDULING: cron '*/15 * * * *' via an external scheduler; in live production
// triage is typically driven by the queue (triage jobs) instead.
// =============================================================================

import {
  DEFAULT_SLA_POLICIES,
  DEFAULT_TRIAGE_RULES,
  computeSlaDeadlines,
  evaluateTriage,
  type SlaPolicy,
  type SlaSeverity,
  type TriageContext,
  type TriageOutcome,
  type TriageRule,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import { readPhase8Config } from '../lib/config';
import type { Job, JobContext, JobResult } from './types';

/** One signal/source context to triage (carries ids for traceability). */
export type TriageItem = TriageContext;

/** A resolved triage action with optional computed SLA deadlines. */
export interface ResolvedTriageAction {
  type: TriageOutcome['actions'][number]['type'];
  params?: Record<string, unknown>;
  rationale: string;
  /** Set when type is 'assign_sla' and a matching policy exists. */
  sla?: {
    severity: SlaSeverity;
    reviewDeadline: string;
    escalationDeadline: string;
  };
}

/** The persisted triage outcome for one item. */
export interface TriageRecord {
  signalId?: string;
  sourceId?: string;
  matchedRuleIds: string[];
  actions: ResolvedTriageAction[];
}

/** Loads triage contexts (default: none — safe no-op). */
export type LoadTriageItems = (ctx: JobContext) => Promise<TriageItem[]>;

/** Persists one item's resolved triage actions (default no-op). */
export type PersistTriage = (record: TriageRecord) => Promise<void>;

const defaultLoad: LoadTriageItems = async () => [];
const defaultPersist: PersistTriage = async () => {};

/** Resolve the SLA policy for a severity (default MEDIUM if unknown). */
function policyForSeverity(severity: unknown): SlaPolicy | undefined {
  const sev = typeof severity === 'string' ? severity.toUpperCase() : 'MEDIUM';
  return (
    DEFAULT_SLA_POLICIES.find((p) => p.severity === sev) ??
    DEFAULT_SLA_POLICIES.find((p) => p.severity === 'MEDIUM')
  );
}

export function makeTriageWorkerJob(
  load: LoadTriageItems = defaultLoad,
  persist: PersistTriage = defaultPersist,
  rules: TriageRule[] = DEFAULT_TRIAGE_RULES,
): Job {
  return {
    name: 'triageWorker',
    description:
      'Routes recent signals to review via the triage rule-engine (explainable, drafts only).',
    schedule: '*/15 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const cfg = readPhase8Config();
      const autoDraftResearch = cfg.autoCreateResearchDrafts;

      let items: TriageItem[] = [];
      try {
        items = await load(ctx);
      } catch (e) {
        logger.warn('job.triageWorker.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        items = [];
      }

      const declaredInputs = {
        itemCount: items.length,
        ruleCount: rules.length,
        autoCreateResearchDrafts: autoDraftResearch,
        runAt: now,
      };
      logger.info('job.triageWorker.start', { declaredInputs });

      let triaged = 0;
      let actionsEmitted = 0;
      let researchDowngraded = 0;
      let slaAssigned = 0;
      let failed = 0;
      const byActionType: Record<string, number> = {};

      for (const item of items) {
        try {
          const outcome = evaluateTriage(item, rules);
          if (outcome.matchedRuleIds.length === 0) continue;

          const resolved: ResolvedTriageAction[] = [];
          for (const action of outcome.actions) {
            let type = action.type;
            let rationale = action.rationale;

            // AUTO-ROUTING GUARD: never draft research automatically unless the
            // operator opted in. Downgrade to a human review request otherwise.
            if (type === 'draft_research' && !autoDraftResearch) {
              type = 'request_research_review';
              rationale =
                `${action.rationale} ` +
                `[SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS=false → downgraded from draft_research ` +
                `to request_research_review; a human decides whether to draft. Never auto-published.]`;
              researchDowngraded += 1;
            }

            const ra: ResolvedTriageAction = { type, params: action.params, rationale };

            // Compute SLA deadlines for assign_sla actions.
            if (type === 'assign_sla') {
              const policy = policyForSeverity(action.params?.severity);
              if (policy) {
                const { reviewDeadline, escalationDeadline } = computeSlaDeadlines(
                  policy,
                  now,
                );
                ra.sla = { severity: policy.severity, reviewDeadline, escalationDeadline };
                slaAssigned += 1;
              }
            }

            resolved.push(ra);
            byActionType[type] = (byActionType[type] ?? 0) + 1;
            actionsEmitted += 1;

            // Every action is explainable — log its rationale for traceability.
            logger.info('job.triageWorker.action', {
              signalId: item.signalId,
              sourceId: item.sourceId,
              actionType: type,
              rationale,
              sla: ra.sla,
            });
          }

          const record: TriageRecord = {
            signalId: item.signalId,
            sourceId: item.sourceId,
            matchedRuleIds: outcome.matchedRuleIds,
            actions: resolved,
          };
          await persist(record).catch((e) =>
            logger.warn('job.triageWorker.persistFailed', {
              signalId: item.signalId,
              sourceId: item.sourceId,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          triaged += 1;
        } catch (e) {
          failed += 1;
          logger.warn('job.triageWorker.itemFailed', {
            signalId: item.signalId,
            sourceId: item.sourceId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.triageWorker.done', {
        triaged,
        actionsEmitted,
        researchDowngraded,
        slaAssigned,
        failed,
        byActionType,
      });

      return {
        job: 'triageWorker',
        ok: true,
        declaredInputs,
        summary: {
          triaged,
          actionsEmitted,
          researchDowngraded,
          slaAssigned,
          failed,
          byActionType,
        },
      };
    },
  };
}

export const triageWorkerJob = makeTriageWorkerJob();
