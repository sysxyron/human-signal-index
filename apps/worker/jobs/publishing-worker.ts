// =============================================================================
// apps/worker/jobs — publishingWorkerJob (WorldForge/HSI Phase 19)
//
// The DISTRIBUTION loop for the public intelligence platform. It generates
// subscriber digests, plans distribution, and builds feeds — in fault-isolated,
// retry-safe, deterministic, offline-safe steps (each wrapped — a failure logs +
// continues; NEVER throws):
//
//   1. LOAD       — read PUBLISHED publications + active subscribers.
//   2. DIGEST     — generate the daily digest from recently-published reports
//                   (+ recent trust/governance changes). Every entry references a
//                   source; unsourced entries are dropped + counted.
//   3. DISTRIBUTE — plan distribution to matching active subscribers and record
//                   the distribution events (the worker NEVER sends to inactive
//                   subscribers or distributes unpublished intelligence).
//   4. FEEDS      — build the RSS + JSON feeds (published items only).
//
// PURITY: the engines (@hsi/publishing-engine, @hsi/distribution-engine) are pure
// & deterministic; `now` is INJECTED (ctx.runAt). OFFLINE-SAFE: no service-role
// env → runs the distribution fixtures + logs, no writes. GOVERNANCE: the worker
// NEVER publishes/approves/retracts — publishing stays a human action.
//
// SCHEDULING: cron '0 8 * * *' (daily 08:00 UTC).
// =============================================================================

import {
  buildJsonFeed,
  buildRssFeed,
  distributionDemo,
  generateDailyDigest,
  planDistribution,
  type DigestInput,
  type PublishedItem,
  type Subscriber,
  type SubscriptionPreferences,
} from '@hsi/distribution-engine';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface PublishingResult {
  mode: 'db' | 'offline';
  publishedItems: number;
  digestItems: number;
  droppedNoSource: number;
  distributions: number;
  rssItems: number;
  jsonItems: number;
}

type PubQuery = {
  eq: (col: string, val: unknown) => PubQuery;
  in: (col: string, vals: unknown[]) => PubQuery;
  order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => PubQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
};
interface PubClient {
  from(table: string): {
    select: (cols?: string) => PubQuery;
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }> & {
      select: (cols?: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
}

function serviceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
function tryClient(): PubClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as PubClient;
  } catch (e) {
    logger.warn('publishing.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

function listFromJson(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x));
  if (value && typeof value === 'object') {
    const items = (value as Record<string, unknown>).items;
    if (Array.isArray(items)) return items.map((x) => String(x));
  }
  return [];
}

/**
 * Run the publishing/distribution loop. Deterministic (`now` injected). Offline-safe
 * (no service-role env → fixtures + log). NEVER throws. Returns the counts.
 */
export async function runPublishingStage(
  now: string,
  opts?: { client?: PubClient | null },
): Promise<PublishingResult> {
  const client = opts?.client !== undefined ? opts.client : tryClient();
  if (!client) return offlineResult(now);

  const result: PublishingResult = {
    mode: 'db', publishedItems: 0, digestItems: 0, droppedNoSource: 0, distributions: 0, rssItems: 0, jsonItems: 0,
  };

  // --- Step 1: load published items ------------------------------------------
  let published: PublishedItem[] = [];
  try {
    const { data } = await client
      .from('hsin_publications').select('*')
      .eq('state', 'PUBLISHED')
      .order('published_at', { ascending: false, nullsFirst: false }).limit(500);
    published = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id ?? ''),
      slug: String(r.slug ?? r.id ?? ''),
      title: String(r.title ?? 'Untitled'),
      summary: String(r.summary ?? ''),
      trustScore: typeof r.trust_score === 'number' ? r.trust_score : undefined,
      topics: listFromJson(r.topics),
      publishedAt: String(r.published_at ?? r.created_at ?? now),
      published: true,
      sourceRef: `publication:${String(r.id ?? '')}`,
    }));
    result.publishedItems = published.length;
  } catch (e) {
    logger.warn('publishing.load.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // --- Step 2: generate the daily digest -------------------------------------
  const digestInput: DigestInput = { newReports: published.slice(0, 25) };
  const digest = generateDailyDigest(digestInput, { now });
  result.digestItems = digest.items.length;
  result.droppedNoSource = digest.droppedNoSource;

  let digestRunId: string | undefined;
  try {
    const { data } = await client.from('hsin_digest_runs').insert({
      kind: digest.kind, title: digest.title, period_start: digest.periodStart, period_end: digest.periodEnd,
      item_count: digest.items.length, dropped_no_source: digest.droppedNoSource, items: { items: digest.items },
    }).select('id');
    digestRunId = ((data ?? []) as Array<{ id?: string }>)[0]?.id;
  } catch (e) {
    logger.warn('publishing.digest.persist.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // --- Step 3: plan + record distribution ------------------------------------
  if (digest.items.length > 0) {
    try {
      const subscribers = await loadSubscribers(client);
      const events = planDistribution(digest, subscribers, { now });
      for (const ev of events) {
        const { error } = await client.from('hsin_distribution_events').insert({
          digest_run_id: digestRunId ?? null, subscriber_id: ev.subscriberId, channel: ev.channel,
          kind: ev.kind, ref: ev.ref, item_count: ev.itemCount, status: 'planned',
        });
        if (!error) result.distributions += 1;
      }
    } catch (e) {
      logger.warn('publishing.distribute.failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // --- Step 4: build feeds (published only) ----------------------------------
  try {
    result.rssItems = buildRssFeed(published, { now }).itemCount;
    result.jsonItems = buildJsonFeed(published, { now }).itemCount;
  } catch (e) {
    logger.warn('publishing.feeds.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  logger.info('publishing.done', { ...result, autoPublished: false, autoActed: false });
  return result;
}

/** Load active subscribers + their preferences. NEVER throws. */
async function loadSubscribers(
  client: PubClient,
): Promise<Array<{ subscriber: Subscriber; prefs: SubscriptionPreferences }>> {
  try {
    const { data: subRows } = await client.from('hsin_subscribers').select('*').eq('active', true).limit(20000);
    const subs = (subRows ?? []) as Array<Record<string, unknown>>;
    const { data: prefRows } = await client.from('hsin_subscription_preferences').select('*').limit(20000);
    const prefsById = new Map<string, Record<string, unknown>>();
    for (const p of (prefRows ?? []) as Array<Record<string, unknown>>) prefsById.set(String(p.subscriber_id ?? ''), p);

    return subs.map((s) => {
      const id = String(s.id ?? '');
      const p = prefsById.get(id) ?? {};
      const subscriber: Subscriber = {
        id, email: String(s.email ?? ''),
        type: (String(s.type ?? 'FREE') as Subscriber['type']),
        active: s.active === true, createdAt: String(s.created_at ?? ''),
      };
      const prefs: SubscriptionPreferences = {
        subscriberId: id,
        digestFrequency: (String(p.digest_frequency ?? 'weekly') as SubscriptionPreferences['digestFrequency']),
        topics: listFromJson(p.topics),
        notifyTrustChanges: p.notify_trust_changes !== false,
        notifyRetractions: p.notify_retractions !== false,
        channels: (listFromJson(p.channels) as SubscriptionPreferences['channels']).length > 0
          ? (listFromJson(p.channels) as SubscriptionPreferences['channels'])
          : ['email'],
      };
      return { subscriber, prefs };
    });
  } catch {
    return [];
  }
}

/** Offline-safe result: run the fixtures, log, persist nothing. */
function offlineResult(now: string): PublishingResult {
  const demo = distributionDemo();
  const result: PublishingResult = {
    mode: 'offline',
    publishedItems: demo.rss.itemCount,
    digestItems: demo.daily.items.length,
    droppedNoSource: demo.daily.droppedNoSource,
    distributions: demo.distribution.length,
    rssItems: demo.rss.itemCount,
    jsonItems: demo.json.itemCount,
  };
  logger.info('publishing.offline', { ...result, autoPublished: false, autoActed: false });
  return result;
}

/** The Job wrapper (daily 08:00 UTC). */
export function makePublishingWorkerJob(): Job {
  return {
    name: 'publishingWorker',
    description:
      'Daily distribution loop: generate the subscriber digest from published reports, plan distribution to active subscribers, and build RSS/JSON feeds. NEVER publishes/approves/retracts (publishing is a human action); never distributes unpublished intelligence.',
    schedule: '0 8 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const offline = !serviceRoleConfigured();
      const declaredInputs = { mode: offline ? 'offline-fixtures' : 'db', runAt: now, autoPublish: false, autoAct: false };
      logger.info('job.publishingWorker.start', { declaredInputs });

      let summary: PublishingResult;
      try {
        summary = await runPublishingStage(now);
      } catch (e) {
        logger.warn('job.publishingWorker.failed', { error: e instanceof Error ? e.message : String(e) });
        summary = { mode: offline ? 'offline' : 'db', publishedItems: 0, digestItems: 0, droppedNoSource: 0, distributions: 0, rssItems: 0, jsonItems: 0 };
      }

      logger.info('job.publishingWorker.done', { summary, autoPublished: false, autoActed: false });
      return { job: 'publishingWorker', ok: true, declaredInputs, summary: { ...summary, autoPublished: false, autoActed: false } };
    },
  };
}

/** The registered Phase-19 publishing job instance. */
export const publishingWorkerJob: Job = makePublishingWorkerJob();
