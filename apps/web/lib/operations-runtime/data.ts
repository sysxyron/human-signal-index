// =============================================================================
// HSI Phase 74.3 — Operations runtime status (SERVER-ONLY, READ-ONLY). Composes
// the resolved runtime flags (74.1), the read-routing decisions (74.2), and the
// backend availability registry into one read-only snapshot + a human summary.
// No secrets, no mutations, no writes. Never throws (helpers degrade to defaults).
// =============================================================================

import { getHsiRuntimeConfig } from '@/lib/hsi/edge-config';
import { resolveReadBackend, availabilityFromHealth, type ReadBackend } from '@/lib/hsi/read-backends';
import { getDatabaseHealth, type DatabaseHealth } from '@/lib/hsi/health';
import { buildRuntimeSummary } from './summary';

export type AvailabilityStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_OBSERVED';

export interface RuntimeStatus {
  timestamp: string;
  runtime: {
    source: string;
    hsiMode: string; maintenanceBanner: boolean; maintenanceMessage: string; betaSignupOpen: boolean;
    globalMapEnabled: boolean; sourceIngestEnabled: boolean; protectedReadMode: boolean; primaryDbHealth: string;
    publicReadsSource: string; dashboardReadsSource: string;
  };
  routing: {
    public: { requestedBackend: string; effectiveBackend: string; fallbackReason: string | null };
    dashboard: { requestedBackend: string; effectiveBackend: string; fallbackReason: string | null };
  };
  availability: Record<ReadBackend, AvailabilityStatus>;
  /** Phase 74.4 — live read-only probe of the primary database. */
  databaseHealth: DatabaseHealth;
  summary: { lines: string[] };
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const timestamp = new Date().toISOString();
  const cfg = await getHsiRuntimeConfig();
  const [pub, dash, databaseHealth] = await Promise.all([resolveReadBackend('public'), resolveReadBackend('dashboard'), getDatabaseHealth()]);
  const avail = availabilityFromHealth(cfg.primaryDbHealth);

  // primary → PASS/FAIL by readability; the others are declared-but-unimplemented
  // backends → NOT_OBSERVED (never fabricated as available).
  const statusOf = (b: ReadBackend): AvailabilityStatus => {
    const cap = avail[b];
    const readable = cap.available && cap.reads;
    if (b === 'primary') return readable ? 'PASS' : 'FAIL';
    return readable ? 'PASS' : 'NOT_OBSERVED';
  };

  const summary = buildRuntimeSummary({
    hsiMode: cfg.hsiMode, primaryDbHealth: cfg.primaryDbHealth,
    publicEffective: pub.effectiveBackend, dashboardEffective: dash.effectiveBackend,
    globalMapEnabled: cfg.globalMapEnabled, sourceIngestEnabled: cfg.sourceIngestEnabled,
    protectedReadMode: cfg.protectedReadMode, maintenanceBanner: cfg.maintenanceBanner, betaSignupOpen: cfg.betaSignupOpen,
  });

  return {
    timestamp,
    runtime: {
      source: cfg.source,
      hsiMode: cfg.hsiMode, maintenanceBanner: cfg.maintenanceBanner, maintenanceMessage: cfg.maintenanceMessage, betaSignupOpen: cfg.betaSignupOpen,
      globalMapEnabled: cfg.globalMapEnabled, sourceIngestEnabled: cfg.sourceIngestEnabled, protectedReadMode: cfg.protectedReadMode, primaryDbHealth: cfg.primaryDbHealth,
      publicReadsSource: cfg.publicReadsSource, dashboardReadsSource: cfg.dashboardReadsSource,
    },
    routing: {
      public: { requestedBackend: pub.requestedBackend, effectiveBackend: pub.effectiveBackend, fallbackReason: pub.fallbackReason },
      dashboard: { requestedBackend: dash.requestedBackend, effectiveBackend: dash.effectiveBackend, fallbackReason: dash.fallbackReason },
    },
    availability: { primary: statusOf('primary'), replica: statusOf('replica'), d1: statusOf('d1'), cache: statusOf('cache') },
    databaseHealth,
    summary: { lines: summary },
  };
}
