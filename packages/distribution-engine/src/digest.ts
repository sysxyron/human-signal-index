// =============================================================================
// @hsi/distribution-engine — the DIGEST engine.
//
// generateDailyDigest / generateWeeklyDigest / generateTopicDigest turn the
// platform's recent changes into a subscriber digest. Each digest surfaces New
// Reports, Updated Reports, Trust Changes, Governance Actions, Research
// Opportunities, Escalations, and Outcome Changes. It NEVER includes an entry
// WITHOUT a source reference — unsourced inputs are dropped and counted
// (transparency). Deterministic; inputs not mutated.
// =============================================================================

import type {
  Digest,
  DigestInput,
  DigestItem,
  PublishedItem,
} from './types';

function pushIf(items: DigestItem[], item: DigestItem | null): number {
  if (item) {
    items.push(item);
    return 0;
  }
  return 1;
}

function fromReport(r: PublishedItem, kind: 'new_report' | 'updated_report', now: string): DigestItem | null {
  // Gate: never distribute unpublished + require a source reference.
  if (!r.published || !r.sourceRef) return null;
  return {
    kind,
    title: r.title,
    detail: r.summary,
    sourceRef: r.sourceRef,
    slug: r.slug,
    at: r.publishedAt || now,
  };
}

function fromChange(
  c: { slug?: string; title: string; detail: string; sourceRef?: string; at?: string },
  kind: DigestItem['kind'],
  now: string,
): DigestItem | null {
  if (!c.sourceRef) return null;
  return {
    kind,
    title: c.title,
    detail: c.detail,
    sourceRef: c.sourceRef,
    ...(c.slug ? { slug: c.slug } : {}),
    at: c.at || now,
  };
}

/** Assemble a digest from the change inputs. Drops + counts unsourced entries. */
function assemble(
  kind: Digest['kind'],
  title: string,
  periodStart: string,
  periodEnd: string,
  input: DigestInput,
  now: string,
  topic?: string,
): Digest {
  const items: DigestItem[] = [];
  let dropped = 0;

  for (const r of input.newReports ?? []) dropped += pushIf(items, fromReport(r, 'new_report', now));
  for (const r of input.updatedReports ?? []) dropped += pushIf(items, fromReport(r, 'updated_report', now));
  for (const c of input.trustChanges ?? []) dropped += pushIf(items, fromChange(c, 'trust_change', now));
  for (const c of input.governanceActions ?? []) dropped += pushIf(items, fromChange(c, 'governance_action', now));
  for (const c of input.researchOpportunities ?? []) dropped += pushIf(items, fromChange(c, 'research_opportunity', now));
  for (const c of input.escalations ?? []) dropped += pushIf(items, fromChange(c, 'escalation', now));
  for (const c of input.outcomeChanges ?? []) dropped += pushIf(items, fromChange(c, 'outcome_change', now));

  return {
    kind,
    ...(topic ? { topic } : {}),
    title,
    periodStart,
    periodEnd,
    items,
    droppedNoSource: dropped,
    generatedAt: now,
  };
}

/** Generate a DAILY digest covering the 24h window ending at `now`. */
export function generateDailyDigest(
  input: DigestInput,
  opts: { now: string; periodStart?: string },
): Digest {
  const start = opts.periodStart ?? new Date(Date.parse(opts.now) - 86_400_000).toISOString();
  return assemble('daily', 'Daily intelligence digest', start, opts.now, input, opts.now);
}

/** Generate a WEEKLY digest covering the 7-day window ending at `now`. */
export function generateWeeklyDigest(
  input: DigestInput,
  opts: { now: string; periodStart?: string },
): Digest {
  const start = opts.periodStart ?? new Date(Date.parse(opts.now) - 7 * 86_400_000).toISOString();
  return assemble('weekly', 'Weekly intelligence digest', start, opts.now, input, opts.now);
}

/** Generate a TOPIC digest, filtering every input to the topic. */
export function generateTopicDigest(
  topic: string,
  input: DigestInput,
  opts: { now: string; periodStart?: string },
): Digest {
  const start = opts.periodStart ?? new Date(Date.parse(opts.now) - 7 * 86_400_000).toISOString();
  // Filter reports to the topic; non-report changes pass through (they carry their own refs).
  const filtered: DigestInput = {
    ...input,
    newReports: (input.newReports ?? []).filter((r) => r.topics.includes(topic)),
    updatedReports: (input.updatedReports ?? []).filter((r) => r.topics.includes(topic)),
  };
  return assemble('topic', `Topic digest: ${topic}`, start, opts.now, filtered, opts.now, topic);
}

/** True when a digest has at least one (sourced) item. */
export function digestHasContent(digest: Digest): boolean {
  return digest.items.length > 0;
}
