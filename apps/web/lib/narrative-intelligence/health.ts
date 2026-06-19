// =============================================================================
// HSI Phase 65 — Narrative health, status, alerts, timeline (PURE, no I/O).
//
// Explainable narrative scoring: coverage, source/actor diversity, evidence/claim
// density, contradiction ratio, and a composite stability score with STATED
// weights (no black box). Deterministic status + alert detection from snapshot
// deltas. All thresholds are documented policy values, not fabricated scores.
// =============================================================================

import type {
  MemberComposition, NarrativeHealth, NarrativeSnapshot, NarrativeStatus,
  NarrativeAlert, NarrativeAlertType, NarrativeTimeline, TimelinePoint,
} from './types';
import type { NotificationSeverity } from '@/lib/notifications/types';

const r2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
/** Saturating diversity: n/(n+k) — more distinct entities → closer to 1. */
function saturate(n: number, k: number): number { return n <= 0 ? 0 : r2(n / (n + k)); }

// ---- health (Deliverable 8) -------------------------------------------------

const COVERAGE_CATEGORIES = 8; // sources, signals, evidence, reports, investigations, actors, events, orgs

export function computeNarrativeHealth(c: MemberComposition, failingSources: number): NarrativeHealth {
  const present = [c.sources, c.signals, c.evidence, c.reports, c.investigations, c.actors, c.events, c.organizations].filter((x) => x > 0).length;
  const coverage = r2(present / COVERAGE_CATEGORIES);
  const sourceDiversity = saturate(c.distinctSources, 5);
  const evidenceDensity = c.total > 0 ? r2(c.evidence / c.total) : 0;
  const claimDensity = c.total > 0 ? r2((c.supporting + c.contradicting) / c.total) : 0;
  const actorDiversity = saturate(c.distinctActors, 3);
  const stanceTotal = c.supporting + c.contradicting;
  const contradictionRatio = stanceTotal > 0 ? r2(c.contradicting / stanceTotal) : 0;
  const sizeFactor = saturate(c.total, 10);

  let stability =
    coverage * 25 + sourceDiversity * 20 + evidenceDensity * 15 + actorDiversity * 10 +
    (1 - contradictionRatio) * 20 + sizeFactor * 10;
  stability -= Math.min(20, failingSources * 5);
  const stabilityScore = Math.max(0, Math.min(100, Math.round(stability)));

  const factors = [
    { label: 'Coverage', value: `${Math.round(coverage * 100)}% (${present}/${COVERAGE_CATEGORIES} types)` },
    { label: 'Source diversity', value: `${Math.round(sourceDiversity * 100)}% (${c.distinctSources} sources)` },
    { label: 'Evidence density', value: `${Math.round(evidenceDensity * 100)}%` },
    { label: 'Contradiction', value: `${Math.round(contradictionRatio * 100)}%` },
    { label: 'Failing sources', value: String(failingSources) },
  ];
  const explanation = `Stability = coverage ${Math.round(coverage * 100)}%×0.25 + source-diversity ${Math.round(sourceDiversity * 100)}%×0.20 + evidence ${Math.round(evidenceDensity * 100)}%×0.15 + actor-diversity ${Math.round(actorDiversity * 100)}%×0.10 + (1−contradiction ${Math.round(contradictionRatio * 100)}%)×0.20 + size×0.10 − ${Math.min(20, failingSources * 5)} (failing sources).`;

  return { coverage, sourceDiversity, evidenceDensity, claimDensity, actorDiversity, contradictionRatio, stabilityScore, failingSources, explanation, factors };
}

// ---- status (Deliverable 2) -------------------------------------------------

export function statusFromMetrics(prev: NarrativeSnapshot | null, cur: NarrativeSnapshot, stability: number): NarrativeStatus {
  if (cur.memberCount === 0) return 'declining';
  if (cur.contradictionRatio >= 0.6) return 'fragmenting';
  if (!prev) return 'emerging';
  const relGrowth = prev.memberCount > 0 ? (cur.memberCount - prev.memberCount) / prev.memberCount : 1;
  if (relGrowth <= -0.3) return 'declining';
  if (cur.memberCount >= 25 && stability >= 70) return 'dominant';
  return 'active';
}

// ---- alerts (Deliverable 9) -------------------------------------------------

function sev(level: NotificationSeverity): NotificationSeverity { return level; }

export function detectNarrativeAlerts(input: {
  prev: NarrativeSnapshot | null;
  cur: NarrativeSnapshot;
  prevStatus: NarrativeStatus | null;
  status: NarrativeStatus;
}): NarrativeAlert[] {
  const { prev, cur, prevStatus, status } = input;
  const alerts: NarrativeAlert[] = [];
  const mk = (alertType: NarrativeAlertType, severity: NotificationSeverity, reason: string, evidence: Record<string, unknown>) =>
    alerts.push({ alertType, severity, reason, evidence });

  if (!prev) {
    mk('NARRATIVE_EMERGING', sev('NOTICE'), `New narrative detected with ${cur.memberCount} members.`, { members: cur.memberCount });
    return alerts;
  }
  const relGrowth = prev.memberCount > 0 ? (cur.memberCount - prev.memberCount) / prev.memberCount : 1;

  if (relGrowth >= 0.5) mk('NARRATIVE_GROWING', sev(relGrowth >= 1 ? 'WARNING' : 'NOTICE'), `Rapid growth: members ${prev.memberCount}→${cur.memberCount} (+${Math.round(relGrowth * 100)}%).`, { from: prev.memberCount, to: cur.memberCount });
  if (relGrowth <= -0.3) mk('NARRATIVE_DECLINING', sev('NOTICE'), `Sudden decline: members ${prev.memberCount}→${cur.memberCount} (${Math.round(relGrowth * 100)}%).`, { from: prev.memberCount, to: cur.memberCount });
  if (status === 'dominant' && prevStatus !== 'dominant') mk('NARRATIVE_DOMINANT', sev('WARNING'), `Narrative became dominant (${cur.memberCount} members, stability ${cur.stabilityScore}).`, { members: cur.memberCount, stability: cur.stabilityScore });
  const sourceCollapse = prev.sourceCount > 0 && cur.sourceCount < prev.sourceCount * 0.5;
  if (cur.contradictionRatio >= 0.6 || sourceCollapse) {
    mk('NARRATIVE_FRAGMENTING', sev('WARNING'), sourceCollapse ? `Coverage collapse: sources ${prev.sourceCount}→${cur.sourceCount}.` : `High contradiction surge (${Math.round(cur.contradictionRatio * 100)}%).`, { contradiction: cur.contradictionRatio, sourcesFrom: prev.sourceCount, sourcesTo: cur.sourceCount });
  }
  return alerts;
}

// ---- timeline (Deliverable 7) ----------------------------------------------

export function buildTimeline(snapshots: NarrativeSnapshot[]): NarrativeTimeline {
  const points: TimelinePoint[] = [...snapshots]
    .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt))
    .map((s) => ({ at: s.snapshotAt, members: s.memberCount, signals: s.signalCount, evidence: s.evidenceCount, sources: s.sourceCount }));

  if (points.length === 0) {
    return { points, firstAppearance: null, peakAt: null, peakMembers: 0, latestActivity: null, phase: 'insufficient' };
  }
  let peakAt = points[0].at;
  let peakMembers = points[0].members;
  for (const p of points) if (p.members >= peakMembers) { peakMembers = p.members; peakAt = p.at; }

  let phase: NarrativeTimeline['phase'] = 'insufficient';
  if (points.length === 1) phase = 'emerging';
  else {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const delta = last.members - prev.members;
    if (last.members >= peakMembers && delta >= 0) phase = 'peak';
    else if (delta > 0) phase = 'growing';
    else if (delta < 0) phase = 'declining';
    else phase = 'stable';
  }
  return { points, firstAppearance: points[0].at, peakAt, peakMembers, latestActivity: points[points.length - 1].at, phase };
}
