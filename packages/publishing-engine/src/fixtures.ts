// =============================================================================
// @hsi/publishing-engine — deterministic offline fixtures + end-to-end demo.
//
// `publishingDemo()` drives a publication through the full lifecycle (DRAFT →
// UNDER_REVIEW → APPROVED → PUBLISHED), evaluates the publish gate, records a
// review, builds the report, and retracts a second publication — all offline +
// deterministic. No Date.now / no Math.random.
// =============================================================================

import {
  createPublication,
  publishPublication,
  transitionPublication,
} from './states';
import { canPublish, publishReview } from './governance';
import { retractPublication } from './retraction';
import { buildIntelligenceReport } from './report';
import type { Publication } from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** A ready-to-publish publication (high trust, enough evidence/sources). */
export function seedPublication(id = 'pub-1'): Publication {
  return createPublication(
    {
      id,
      slug: `lost-civilizations-${id}`,
      title: 'Reassessing the timeline of an early civilization',
      summary: 'A trust-aware synthesis of recent evidence revising an established chronology.',
      runId: 'run-demo',
      trustScore: 78,
      confidence: 0.74,
      evidenceCount: 6,
      sourceCount: 4,
      categories: ['History', 'Archaeology'],
      topics: ['civilizations', 'history'],
    },
    { now: FIXTURE_NOW },
  );
}

/** Drive a publication all the way to PUBLISHED. Returns the final publication. */
export function publishedFixture(): Publication {
  let pub = seedPublication('pub-1');
  for (const to of ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED'] as const) {
    const res = transitionPublication(pub, to, { now: FIXTURE_NOW, actor: 'curator-alice' });
    if (res.ok) pub = res.publication;
  }
  return pub;
}

/** Run the full publishing chain offline for a UI/demo. Deterministic. */
export function publishingDemo(): {
  now: string;
  draft: Publication;
  published: Publication;
  gate: ReturnType<typeof canPublish>;
  review: ReturnType<typeof publishReview>;
  report: ReturnType<typeof buildIntelligenceReport>;
  retracted: Publication;
  retraction: ReturnType<typeof retractPublication>['retraction'];
} {
  const now = FIXTURE_NOW;
  const draft = seedPublication('pub-1');

  // Lifecycle to APPROVED.
  let pub = draft;
  for (const to of ['UNDER_REVIEW', 'APPROVED'] as const) {
    const res = transitionPublication(pub, to, { now, actor: 'curator-alice' });
    if (res.ok) pub = res.publication;
  }
  const gate = canPublish(pub);
  const review = publishReview(
    pub,
    { decision: 'approved', reviewer: 'curator-alice', reason: 'Evidence verified; trust above threshold.' },
    { now },
  );
  const pubRes = publishPublication(pub, { now, actor: 'curator-alice' });
  const published = pubRes.ok ? pubRes.publication : pub;

  const report = buildIntelligenceReport(
    {
      publicationId: published.id,
      title: published.title,
      summary: published.summary,
      evidence: ['Stratigraphic survey 2025', 'Radiocarbon recalibration', 'Comparative ceramic typology'],
      temporal: 'The chronology shifts ~120 years earlier across three independent dating methods.',
      causal: 'Trade-route expansion plausibly drove the earlier settlement.',
      counterfactual: 'Absent the recalibration, the prior chronology would still stand.',
      decision: 'Recommend updating the public timeline with a flagged confidence band.',
      outcome: 'Two prior forecasts using the old chronology under-predicted settlement scale.',
      calibration: 'Calibration error 6% — within tolerance.',
      trust: 'Trust 78/100 (high) — driven by evidence quality and corroboration.',
      governance: 'Cleared by governance review on the fixture date.',
      sourceRefs: ['evidence:strat-2025', 'evidence:c14-recal', 'source:journal-x'],
    },
    { now },
  );

  // A second publication that gets retracted (trust collapse).
  let toRetract = seedPublication('pub-2');
  for (const to of ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED'] as const) {
    const res = transitionPublication(toRetract, to, { now, actor: 'curator-bob' });
    if (res.ok) toRetract = res.publication;
  }
  const ret = retractPublication(
    toRetract,
    { reason: 'trust_collapse', detail: 'A key source was found to be unreliable; trust fell below threshold.', retractedBy: 'curator-bob' },
    { now },
  );

  return {
    now,
    draft,
    published,
    gate,
    review,
    report,
    retracted: ret.publication,
    retraction: ret.retraction,
  };
}
