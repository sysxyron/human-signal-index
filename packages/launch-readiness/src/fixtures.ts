// =============================================================================
// Deterministic demo data for OFFLINE launch-readiness views + tests.
// =============================================================================

import type { IntegrityCounts, KpiInput, ReadinessCheck, WorkerHealthInput } from './types';

export const DEMO_NOW_MS = Date.parse('2026-06-14T12:00:00.000Z');

export const demoWorkers: WorkerHealthInput[] = [
  { name: 'contributorNetworkWorker', lastRunAt: '2026-06-14T11:45:00.000Z', expectedIntervalMs: 3_600_000, recentFailures: 0 },
  { name: 'trustWorker', lastRunAt: '2026-06-14T11:45:00.000Z', expectedIntervalMs: 3_600_000, recentFailures: 0 },
  { name: 'lineageWorker', lastRunAt: '2026-06-14T05:00:00.000Z', expectedIntervalMs: 3_600_000, recentFailures: 1 },
];

export const demoIntegrity: IntegrityCounts = { orphans: 2, brokenLineage: 0, invalidAttribution: 0, invalidTrustLinks: 0 };

export const demoKpis: KpiInput = {
  signalsSubmitted: 420, signalsAccepted: 310, reviewsAgreed: 180, reviewsTotal: 210,
  governanceConfirmed: 44, governanceTotal: 52, publicationsPublished: 24, publicationWindowDays: 30,
};

export const demoReadinessChecks: ReadinessCheck[] = [
  { key: 'rbac', label: 'RBAC ladder + middleware intact', category: 'rbac', passed: true },
  { key: 'cms', label: 'CMS publish workflow operational', category: 'cms', passed: true },
  { key: 'investigations', label: 'Investigation lifecycle valid', category: 'investigations', passed: true },
  { key: 'publishing', label: 'Publication approval governed', category: 'publishing', passed: true },
  { key: 'trust', label: 'Trust graph computing', category: 'trust', passed: true },
  { key: 'lineage', label: 'Lineage graph healthy', category: 'lineage', passed: true },
  { key: 'beta', label: 'Beta workflows self-service', category: 'beta', passed: true },
];
