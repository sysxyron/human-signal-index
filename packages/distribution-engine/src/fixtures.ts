// =============================================================================
// @hsi/distribution-engine — deterministic offline fixtures + end-to-end demo.
//
// `distributionDemo()` builds digests, feeds, and a distribution plan offline +
// deterministically. No Date.now / no Math.random.
// =============================================================================

import { generateDailyDigest, generateTopicDigest, generateWeeklyDigest } from './digest';
import { buildJsonFeed, buildRssFeed, buildWebhookPayload } from './feeds';
import { planDistribution } from './distribution';
import type {
  DigestInput,
  PublishedItem,
  Subscriber,
  SubscriptionPreferences,
} from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** Deterministic published items. */
export const DEMO_PUBLISHED: PublishedItem[] = [
  {
    id: 'pub-1',
    slug: 'early-civilization-timeline',
    title: 'Reassessing an early civilization timeline',
    summary: 'A trust-aware synthesis revising an established chronology.',
    trustScore: 78,
    topics: ['civilizations', 'history'],
    publishedAt: FIXTURE_NOW,
    published: true,
    sourceRef: 'publication:pub-1',
  },
  {
    id: 'pub-2',
    slug: 'genetics-migration',
    title: 'Genetic evidence for an earlier migration',
    summary: 'New aDNA results push a migration date earlier.',
    trustScore: 71,
    topics: ['genetics'],
    publishedAt: FIXTURE_NOW,
    published: true,
    sourceRef: 'publication:pub-2',
  },
  {
    id: 'pub-draft',
    slug: 'unpublished-draft',
    title: 'A draft that must never be distributed',
    summary: 'Should be filtered out everywhere.',
    topics: ['history'],
    publishedAt: FIXTURE_NOW,
    published: false, // gate — must be excluded.
    sourceRef: 'publication:pub-draft',
  },
];

/** Deterministic digest inputs (one unsourced entry to exercise the drop path). */
export const DEMO_DIGEST_INPUT: DigestInput = {
  newReports: DEMO_PUBLISHED,
  trustChanges: [
    { slug: 'early-civilization-timeline', title: 'Trust rose 72 → 78', detail: 'After corroboration.', sourceRef: 'trust:pub-1', at: FIXTURE_NOW },
    { slug: 'x', title: 'Unsourced trust note', detail: 'No reference.', at: FIXTURE_NOW }, // dropped.
  ],
  governanceActions: [
    { title: 'Publication approved', detail: 'Cleared by governance.', sourceRef: 'gov:pub-1', at: FIXTURE_NOW },
  ],
  researchOpportunities: [
    { title: 'Investigate ceramic typology gap', detail: 'Proposed follow-up.', sourceRef: 'opp:1', at: FIXTURE_NOW },
  ],
};

/** Deterministic subscribers + prefs. */
export const DEMO_SUBSCRIBERS: Array<{ subscriber: Subscriber; prefs: SubscriptionPreferences }> = [
  {
    subscriber: { id: 'sub-1', email: 'a@example.com', type: 'RESEARCHER', active: true, createdAt: FIXTURE_NOW },
    prefs: { subscriberId: 'sub-1', digestFrequency: 'daily', topics: [], notifyTrustChanges: true, notifyRetractions: true, channels: ['email'] },
  },
  {
    subscriber: { id: 'sub-2', email: 'b@example.com', type: 'ANALYST', active: true, createdAt: FIXTURE_NOW },
    prefs: { subscriberId: 'sub-2', digestFrequency: 'weekly', topics: ['genetics'], notifyTrustChanges: false, notifyRetractions: true, channels: ['email', 'webhook'] },
  },
  {
    subscriber: { id: 'sub-3', email: 'c@example.com', type: 'FREE', active: false, createdAt: FIXTURE_NOW },
    prefs: { subscriberId: 'sub-3', digestFrequency: 'daily', topics: [], notifyTrustChanges: true, notifyRetractions: true, channels: ['email'] },
  },
];

/** Run the full distribution chain offline for a UI/demo. Deterministic. */
export function distributionDemo(): {
  now: string;
  daily: ReturnType<typeof generateDailyDigest>;
  weekly: ReturnType<typeof generateWeeklyDigest>;
  topic: ReturnType<typeof generateTopicDigest>;
  rss: ReturnType<typeof buildRssFeed>;
  json: ReturnType<typeof buildJsonFeed>;
  webhook: ReturnType<typeof buildWebhookPayload>;
  distribution: ReturnType<typeof planDistribution>;
} {
  const now = FIXTURE_NOW;
  const daily = generateDailyDigest(DEMO_DIGEST_INPUT, { now });
  const weekly = generateWeeklyDigest(DEMO_DIGEST_INPUT, { now });
  const topic = generateTopicDigest('genetics', DEMO_DIGEST_INPUT, { now });
  const rss = buildRssFeed(DEMO_PUBLISHED, { now });
  const json = buildJsonFeed(DEMO_PUBLISHED, { now });
  const webhook = buildWebhookPayload('digest.generated', { kind: 'daily', items: daily.items.length }, { now });
  const distribution = planDistribution(daily, DEMO_SUBSCRIBERS, { now });
  return { now, daily, weekly, topic, rss, json, webhook, distribution };
}
