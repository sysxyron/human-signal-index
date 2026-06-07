// =============================================================================
// apps/worker/jobs — pollSourcesJob
// Checks registered PUBLIC sources for availability/changes (e.g. last-checked
// staleness). Skeleton: source loading is injected so it runs without the DB
// layer (owned by another agent). Logs declared inputs.
// =============================================================================

import { normalizeSourceUrl } from '@hsi/source-connectors';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** Minimal shape of a source row this job needs (mirrors @hsi/shared-types Source). */
export interface PollableSource {
  id: string;
  public_url?: string;
  status: string;
  last_checked_at?: string;
}

/** Inject how sources are loaded (DB query in prod, fixture in dev/tests). */
export type LoadSources = (ctx: JobContext) => Promise<PollableSource[]>;

const defaultLoadSources: LoadSources = async () => [];

export function makePollSourcesJob(loadSources: LoadSources = defaultLoadSources): Job {
  return {
    name: 'pollSources',
    description: 'Checks registered public sources for staleness/availability.',
    schedule: '*/30 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const sources = (await loadSources(ctx)).filter((s) => s.status === 'active');
      const declaredInputs = { sourceCount: sources.length, runAt: ctx.runAt };
      logger.info('job.pollSources.start', { declaredInputs });

      const due = sources.filter((s) => {
        if (!s.last_checked_at) return true;
        const ageMs = Date.parse(ctx.runAt) - Date.parse(s.last_checked_at);
        return ageMs > 30 * 60 * 1000; // older than 30 min
      });

      const normalized = due
        .filter((s) => s.public_url)
        .map((s) => ({ id: s.id, url: normalizeSourceUrl(s.public_url!) }));

      logger.info('job.pollSources.done', { due: due.length, queued: normalized.length });
      return {
        job: 'pollSources',
        ok: true,
        declaredInputs,
        summary: { due: due.length, queuedForCapture: normalized },
      };
    },
  };
}

export const pollSourcesJob = makePollSourcesJob();
