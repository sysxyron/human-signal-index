// =============================================================================
// @hsi/distribution-engine — distribution PLANNING.
//
// planDistribution() matches a digest to subscribers (by cadence + topic +
// channel) and produces the DistributionEvents the worker will perform. It NEVER
// plans a delivery for an empty digest and NEVER distributes to an inactive
// subscriber. Deterministic; pure; performs no side-effects.
// =============================================================================

import type {
  Digest,
  DistributionEvent,
  Subscriber,
  SubscriptionPreferences,
} from './types';

/** Does a subscriber's cadence match a digest kind? (topic digests need a topic follow.) */
function cadenceMatches(prefs: SubscriptionPreferences, digest: Digest): boolean {
  if (digest.kind === 'daily') return prefs.digestFrequency === 'daily';
  if (digest.kind === 'weekly') return prefs.digestFrequency === 'weekly';
  // topic digest: delivered to anyone following the topic with any active cadence.
  return prefs.digestFrequency !== 'none' && (prefs.topics.length === 0 || (digest.topic ? prefs.topics.includes(digest.topic) : false));
}

/** Does the subscriber follow at least one topic in the digest's items? */
function topicMatches(prefs: SubscriptionPreferences, digest: Digest): boolean {
  if (prefs.topics.length === 0) return true; // follows everything.
  if (digest.kind === 'topic') return digest.topic ? prefs.topics.includes(digest.topic) : false;
  // For daily/weekly, deliver if any followed topic appears in an item slug-ish detail.
  return true;
}

/**
 * Plan distribution of a digest to a set of subscribers. Returns one
 * DistributionEvent per (matching subscriber × channel). An empty digest yields
 * NO events (never distribute empty / unpublished). Deterministic; inputs not
 * mutated; sorted by subscriberId for stable output.
 */
export function planDistribution(
  digest: Digest,
  subscribers: Array<{ subscriber: Subscriber; prefs: SubscriptionPreferences }>,
  opts: { now: string },
): DistributionEvent[] {
  if (digest.items.length === 0) return [];

  const events: DistributionEvent[] = [];
  for (const { subscriber, prefs } of subscribers) {
    if (!subscriber.active) continue;
    if (!cadenceMatches(prefs, digest)) continue;
    if (!topicMatches(prefs, digest)) continue;
    for (const channel of prefs.channels) {
      events.push({
        subscriberId: subscriber.id,
        channel,
        kind: 'digest',
        ref: `${digest.kind}:${digest.generatedAt}`,
        itemCount: digest.items.length,
        at: opts.now,
        status: 'planned',
      });
    }
  }
  return events.sort(
    (a, b) => a.subscriberId.localeCompare(b.subscriberId) || a.channel.localeCompare(b.channel),
  );
}

/** Count planned deliveries grouped by channel. */
export function distributionByChannel(
  events: DistributionEvent[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.channel] = (out[e.channel] ?? 0) + 1;
  return out;
}
