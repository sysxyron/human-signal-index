// =============================================================================
// Migration verification (Phase 23) — PURE.
//
// Compares the EXPECTED migration set (0001 → 0048, the files committed under
// supabase/migrations) against the APPLIED set (read from
// supabase_migrations.schema_migrations by the DAL) and classifies each:
//   applied | missing | out_of_order | failed | unknown
//
// PURE: no imports, no I/O, no clocks. The DAL passes the applied versions in;
// the smoke-test script verifies EXPECTED_MIGRATIONS matches the files on disk.
// =============================================================================

export interface ExpectedMigration {
  id: string; // 4-digit prefix, e.g. '0001'
  name: string; // slug, e.g. 'init'
}

/** The committed migration set. Keep in sync with supabase/migrations/*.sql
 *  (the production-smoke-test verifies this list against disk). */
export const EXPECTED_MIGRATIONS: ExpectedMigration[] = [
  { id: '0001', name: 'init' },
  { id: '0002', name: 'rls_and_policies' },
  { id: '0003', name: 'indexes_constraints' },
  { id: '0004', name: 'storage_buckets' },
  { id: '0005', name: 'worldforge' },
  { id: '0006', name: 'auth_users_trigger' },
  { id: '0007', name: 'research_agents' },
  { id: '0008', name: 'evidence_engine' },
  { id: '0009', name: 'evidence_hardening' },
  { id: '0010', name: 'review_and_curation' },
  { id: '0011', name: 'signal_intelligence_network' },
  { id: '0012', name: 'scheduler_queue_narrative_graph' },
  { id: '0013', name: 'provider_adapters_scaled_queue' },
  { id: '0014', name: 'temporal_intelligence' },
  { id: '0015', name: 'causal_intelligence' },
  { id: '0016', name: 'counterfactual_engine' },
  { id: '0017', name: 'decision_intelligence' },
  { id: '0018', name: 'auth_security_hardening' },
  { id: '0019', name: 'outcome_tracking' },
  { id: '0020', name: 'calibration_and_trust' },
  { id: '0021', name: 'trust_history_and_governance' },
  { id: '0022', name: 'research_orchestration' },
  { id: '0023', name: 'publishing_and_subscribers' },
  { id: '0024', name: 'collective_intelligence' },
  { id: '0025', name: 'forecasting_and_scenarios' },
  { id: '0026', name: 'executive_command_center' },
  { id: '0027', name: 'human_operations_os' },
  { id: '0028', name: 'user_status_iam' },
  { id: '0029', name: 'contributor_intelligence_network' },
  { id: '0030', name: 'live_contribution_intelligence' },
  { id: '0031', name: 'trust_graph_authority' },
  { id: '0032', name: 'operational_trust_wiring' },
  { id: '0033', name: 'outcome_attribution_engine' },
  { id: '0034', name: 'intelligence_lineage_graph' },
  { id: '0035', name: 'cms_content_operations' },
  { id: '0036', name: 'operational_beta_workflows' },
  { id: '0037', name: 'hsi_launch_readiness' },
  { id: '0038', name: 'cms_platform_conversion' },
  { id: '0039', name: 'multi_tenant_organizations' },
  { id: '0040', name: 'tenant_operations_provisioning' },
  { id: '0041', name: 'commercial_saas_foundation' },
  { id: '0042', name: 'stripe_billing' },
  { id: '0043', name: 'saas_operations' },
  { id: '0044', name: 'advanced_source_collection' },
  { id: '0045', name: 'compliance_readiness' },
  { id: '0046', name: 'beta_feedback_fixes' },
  { id: '0047', name: 'cms_footer_groups' },
  { id: '0048', name: 'beta_launch' },
];

export type MigrationState = 'applied' | 'missing' | 'out_of_order' | 'failed' | 'unknown';

export interface MigrationAuditRow {
  id: string;
  name: string;
  state: MigrationState;
}

export interface MigrationAuditResult {
  rows: MigrationAuditRow[];
  total: number;
  applied: number;
  missing: number;
  outOfOrder: number;
  failed: number;
  unknown: number;
  /** Highest expected id that is applied, or null. */
  latestApplied: string | null;
  /** Applied versions that are NOT in the expected set (drift / manual). */
  extra: string[];
  /** True only when every expected migration is applied, in order, none failed. */
  ok: boolean;
  /** False when the applied set could not be determined (offline / no perms). */
  verifiable: boolean;
}

/** Extract the leading 4-digit migration id from a version/filename string. */
function idOf(version: string): string | null {
  const m = /(\d{4})/.exec(version.trim());
  return m ? m[1] : null;
}

/**
 * Classify every expected migration against the applied set.
 * @param appliedRaw applied version strings (e.g. ['0001','0002', …]) or null
 *                   when the applied set cannot be determined.
 * @param failedRaw  optional set of versions known to have failed.
 */
export function auditMigrations(
  appliedRaw: string[] | null,
  failedRaw: string[] = [],
): MigrationAuditResult {
  const total = EXPECTED_MIGRATIONS.length;

  if (appliedRaw === null) {
    return {
      rows: EXPECTED_MIGRATIONS.map((m) => ({ id: m.id, name: m.name, state: 'unknown' as const })),
      total, applied: 0, missing: 0, outOfOrder: 0, failed: 0, unknown: total,
      latestApplied: null, extra: [], ok: false, verifiable: false,
    };
  }

  const appliedIds = new Set<string>();
  for (const v of appliedRaw) {
    const id = idOf(v);
    if (id) appliedIds.add(id);
  }
  const failedIds = new Set<string>();
  for (const v of failedRaw) {
    const id = idOf(v);
    if (id) failedIds.add(id);
  }

  const expectedIds = new Set(EXPECTED_MIGRATIONS.map((m) => m.id));
  const extra = [...appliedIds].filter((id) => !expectedIds.has(id)).sort();

  // Out-of-order: an applied migration that sits AFTER a missing earlier one.
  let seenMissing = false;
  const rows: MigrationAuditRow[] = [];
  let applied = 0, missing = 0, outOfOrder = 0, failed = 0;

  for (const m of EXPECTED_MIGRATIONS) {
    let state: MigrationState;
    if (failedIds.has(m.id)) {
      state = 'failed';
      failed++;
    } else if (appliedIds.has(m.id)) {
      if (seenMissing) {
        state = 'out_of_order';
        outOfOrder++;
      } else {
        state = 'applied';
        applied++;
      }
    } else {
      state = 'missing';
      missing++;
      seenMissing = true;
    }
    rows.push({ id: m.id, name: m.name, state });
  }

  // latestApplied = highest expected id present in appliedIds.
  let latestApplied: string | null = null;
  for (const m of EXPECTED_MIGRATIONS) {
    if (appliedIds.has(m.id)) latestApplied = m.id;
  }

  const ok = missing === 0 && outOfOrder === 0 && failed === 0 && applied === total;

  return {
    rows, total, applied, missing, outOfOrder, failed,
    unknown: 0, latestApplied, extra, ok, verifiable: true,
  };
}
