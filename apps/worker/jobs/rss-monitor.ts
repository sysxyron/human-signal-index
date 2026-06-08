// =============================================================================
// apps/worker/jobs — rssMonitorJob (HSIN Phase 7)
//
// For monitored RSS/podcast hsin_sources, fetches + parses the feed
// (parseRssFeed), diffs against the prior capture (diffRssFeeds), and creates a
// signal draft for each NEW item. Loaders/persisters are INJECTED (default
// no-ops) so the job runs DB-free offline. Fixture mode by default: when no live
// fetcher is injected it parses the bundled DEMO_RSS_XML so the whole flow runs
// offline & deterministically. NEVER throws.
//
// HONESTY: each new item becomes a DRAFT signal ('new') — never auto-published.
// SCHEDULING: hourly cron ('0 * * * *') via an external scheduler (CRON_SECRET).
// =============================================================================

import {
  DEMO_RSS_XML,
  classifySignal,
  diffRssFeeds,
  parseRssFeed,
  type RssItem,
} from '@hsi/source-intelligence';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** Minimal RSS source shape this job needs (mirrors hsin_sources). */
export interface RssSource {
  id: string;
  name: string;
  rssUrl?: string;
  /** Prior feed items (last capture) for diffing; empty = first observation. */
  priorItems?: RssItem[];
}

/** A new-item signal draft persisted for an RSS source. */
export interface RssSignalRecord {
  sourceId: string;
  itemId: string;
  title: string;
  summary?: string;
  link?: string;
  contentHash: string;
  signalCategory: string;
  confidence: number;
  capturedAt: string;
}

/** Loads RSS sources to poll (default: none). */
export type LoadRssSources = (ctx: JobContext) => Promise<RssSource[]>;

/**
 * Fetch the raw feed XML for a source (default: serve the bundled demo XML so the
 * pipeline runs offline). In live mode the worker injects a network fetcher.
 */
export type FetchFeedXml = (source: RssSource) => Promise<string | null>;

/** Persists the new-item signal drafts for a source (default no-op). */
export type PersistRssSignals = (
  source: RssSource,
  drafts: RssSignalRecord[],
) => Promise<void>;

const defaultLoad: LoadRssSources = async () => [];
const defaultFetch: FetchFeedXml = async () => DEMO_RSS_XML;
const defaultPersist: PersistRssSignals = async () => {};

export function makeRssMonitorJob(
  load: LoadRssSources = defaultLoad,
  fetchXml: FetchFeedXml = defaultFetch,
  persist: PersistRssSignals = defaultPersist,
): Job {
  return {
    name: 'rssMonitor',
    description:
      'Fetches + diffs monitored RSS feeds; creates draft signals for new items.',
    schedule: '0 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;

      let sources: RssSource[] = [];
      try {
        sources = await load(ctx);
      } catch (e) {
        logger.warn('job.rssMonitor.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        sources = [];
      }

      const declaredInputs = { sourceCount: sources.length, runAt: now };
      logger.info('job.rssMonitor.start', { declaredInputs });

      let newItems = 0;
      let failed = 0;

      for (const source of sources) {
        try {
          const xml = await fetchXml(source);
          if (!xml) {
            failed += 1;
            logger.warn('job.rssMonitor.noFeed', { sourceId: source.id });
            continue;
          }
          const afterItems = parseRssFeed(xml);
          const diff = diffRssFeeds(source.priorItems ?? [], afterItems);

          // New items (added) become draft signals. Changed items are left to
          // the source-change pipeline; here we focus on net-new content.
          const drafts: RssSignalRecord[] = diff.added.map((item) => {
            const classification = classifySignal({
              title: item.title,
              bodyText: item.summary,
              sourceType: 'rss',
            });
            return {
              sourceId: source.id,
              itemId: item.id,
              title: item.title,
              summary: item.summary,
              link: item.link,
              contentHash: item.contentHash,
              signalCategory: classification.signalCategory,
              confidence: classification.confidence,
              capturedAt: item.publishedAt ?? now,
            };
          });

          await persist(source, drafts).catch((e) =>
            logger.warn('job.rssMonitor.persistFailed', {
              sourceId: source.id,
              error: e instanceof Error ? e.message : String(e),
            }),
          );

          newItems += drafts.length;
          logger.info('job.rssMonitor.source', {
            sourceId: source.id,
            added: diff.added.length,
            changed: diff.changed.length,
            removed: diff.removed.length,
          });
        } catch (e) {
          failed += 1;
          logger.warn('job.rssMonitor.sourceFailed', {
            sourceId: source.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.rssMonitor.done', { newItems, failed });

      return {
        job: 'rssMonitor',
        ok: true,
        declaredInputs,
        summary: { newItems, failed },
      };
    },
  };
}

export const rssMonitorJob = makeRssMonitorJob();
