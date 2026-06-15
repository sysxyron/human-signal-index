// =============================================================================
// Data integrity audit + KPIs (Deliverables 8, 19). PURE + DETERMINISTIC.
// =============================================================================

import type { IntegrityCounts, IntegrityIssue, IntegrityReport, KpiInput, KpiSet } from './types';

const rate = (num: number, den: number): number => (den <= 0 ? 0 : Math.round((num / den) * 100));

/** Aggregate integrity findings into an issue list. Broken lineage + invalid
 *  attribution/trust are CRITICAL; orphans are a warning. */
export function integrityReport(c: IntegrityCounts): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  if (c.orphans > 0) issues.push({ kind: 'Orphan records', count: c.orphans, severity: 'warning' });
  if (c.brokenLineage > 0) issues.push({ kind: 'Broken lineage chains', count: c.brokenLineage, severity: 'critical' });
  if (c.invalidAttribution > 0) issues.push({ kind: 'Invalid attribution edges', count: c.invalidAttribution, severity: 'critical' });
  if (c.invalidTrustLinks > 0) issues.push({ kind: 'Invalid trust links', count: c.invalidTrustLinks, severity: 'critical' });
  const totalIssues = issues.reduce((n, i) => n + i.count, 0);
  return { issues, totalIssues, clean: issues.every((i) => i.severity !== 'critical') };
}

/** Operational KPIs (Deliverable 8). */
export function computeKpis(i: KpiInput): KpiSet {
  const weeks = i.publicationWindowDays > 0 ? i.publicationWindowDays / 7 : 1;
  return {
    acceptanceRate: rate(i.signalsAccepted, i.signalsSubmitted),
    reviewAccuracy: rate(i.reviewsAgreed, i.reviewsTotal),
    governanceEffectiveness: rate(i.governanceConfirmed, i.governanceTotal),
    publicationThroughputPerWeek: Math.round((i.publicationsPublished / weeks) * 10) / 10,
  };
}
