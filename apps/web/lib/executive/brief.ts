// =============================================================================
// HSI Phase 74 — Executive Brief generator (PURE, deterministic). Composes a
// concise, human-readable operational summary from REAL platform deltas only.
// No AI text, no hallucination — every line is a fact derived from the inputs.
// No I/O.
// =============================================================================

import type { ExecutiveBrief, ExecutiveBriefSection, ExecutiveAlert } from './types';

export interface BriefInputs {
  nowIso: string;
  newLast7: { sources: number; signals: number; narratives: number; evidence: number; forecasts: number };
  newPrior: { sources: number; signals: number; narratives: number; evidence: number; forecasts: number };
  reviewBacklog: number;
  forecastDiverging: number; forecastMissed: number; forecastUnresolved: number;
  trustLow: number; trustObserved: number;
  blindSpotRegions: string[]; narrativesMissingEvidence: number;
  alerts: ExecutiveAlert[];
}

const ENTITIES: Array<keyof BriefInputs['newLast7']> = ['sources', 'signals', 'narratives', 'evidence', 'forecasts'];

export function buildExecutiveBrief(i: BriefInputs): ExecutiveBrief {
  const sections: ExecutiveBriefSection[] = [];
  const push = (heading: string, lines: string[]) => sections.push({ heading, lines: lines.length ? lines : ['No notable change.'] });

  // What changed?
  push('What changed?', i.alerts.length
    ? i.alerts.slice(0, 5).map((a) => `${a.severity}: ${a.title} — ${a.summary}`)
    : []);

  // What is accelerating / slowing? (last 7d vs prior window)
  const accel: string[] = []; const slow: string[] = [];
  for (const e of ENTITIES) {
    const now = i.newLast7[e]; const prev = i.newPrior[e];
    if (now > prev) accel.push(`${e}: ${now} this week vs ${prev} prior.`);
    else if (now < prev) slow.push(`${e}: ${now} this week vs ${prev} prior.`);
  }
  push('What is accelerating?', accel);
  push('What is slowing?', slow);

  // What needs review?
  push('What needs review?', i.reviewBacklog > 0 ? [`${i.reviewBacklog} item(s) awaiting review.`] : []);

  // What forecasts require attention?
  const fc: string[] = [];
  if (i.forecastDiverging > 0) fc.push(`${i.forecastDiverging} forecast(s) diverging from recorded outcomes.`);
  if (i.forecastMissed > 0) fc.push(`${i.forecastMissed} forecast(s) missed.`);
  if (i.forecastUnresolved > 0) fc.push(`${i.forecastUnresolved} forecast(s) unresolved.`);
  push('What forecasts require attention?', fc);

  // What trust issues emerged?
  push('What trust issues emerged?', i.trustObserved > 0 && i.trustLow > 0
    ? [`${i.trustLow} of ${i.trustObserved} scored sources are low-trust.`] : []);

  // What blind spots remain?
  const bs: string[] = [];
  if (i.narrativesMissingEvidence > 0) bs.push(`${i.narrativesMissingEvidence} narrative(s) lack corroborating evidence.`);
  if (i.blindSpotRegions.length > 0) bs.push(`Blind-spot regions: ${i.blindSpotRegions.slice(0, 8).join(', ')}.`);
  push('What blind spots remain?', bs);

  return { generatedAt: i.nowIso, sections };
}
