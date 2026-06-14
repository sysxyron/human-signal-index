// =============================================================================
// Production readiness scoring (Phase 23) — PURE.
//
// Turns a normalized set of operational facts (env, connectivity, migrations,
// RBAC, testers, blockers) into per-area RED/YELLOW/GREEN statuses, a 0-100
// readiness score, an overall status, and a beta-launch recommendation.
//
// PURE + DETERMINISTIC: no I/O, no clocks. The DAL collects the facts; this
// module decides. Fully tested.
// =============================================================================

export type Status = 'RED' | 'YELLOW' | 'GREEN';

export interface ReadinessInput {
  appUrlConfigured: boolean;
  supabaseConfigured: boolean; // url + anon present and valid
  supabaseReachable: boolean | null; // health probe ok; null = unknown
  authReachable: boolean | null;
  storageReachable: boolean | null;
  serviceRoleConfigured: boolean; // workers + cron need it
  requiredEnvMissing: string[];
  migration: { ok: boolean; missing: number; outOfOrder: number; failed: number; verifiable: boolean };
  rbac: { resolverOk: boolean; resolvedRole: string | null };
  testerCount: number | null; // null = unknown
  openBlockers: number;
  debugEndpointHardened: boolean;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  area: AreaKey;
  status: Status;
  detail: string;
  blocker: boolean;
}

export type AreaKey =
  | 'production'
  | 'migration'
  | 'role'
  | 'tester'
  | 'deployment'
  | 'security';

export interface ReadinessReport {
  checks: ReadinessCheck[];
  areas: Record<AreaKey, Status>;
  score: number; // 0..100
  overall: Status;
  blockers: ReadinessCheck[];
  recommendation: 'READY' | 'NOT READY';
}

const AREA_KEYS: AreaKey[] = ['production', 'migration', 'role', 'tester', 'deployment', 'security'];

function worst(a: Status, b: Status): Status {
  const rank = { GREEN: 0, YELLOW: 1, RED: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/** Compute the full readiness report from collected facts. */
export function computeReadiness(input: ReadinessInput): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  // ---- production ----------------------------------------------------------
  add({
    key: 'app_url', label: 'Application URL configured', area: 'production',
    status: input.appUrlConfigured ? 'GREEN' : 'YELLOW',
    detail: input.appUrlConfigured ? 'NEXT_PUBLIC_APP_URL is set.' : 'NEXT_PUBLIC_APP_URL is not set — links/redirects may be wrong.',
    blocker: false,
  });
  add({
    key: 'supabase_configured', label: 'Supabase configured', area: 'production',
    status: input.supabaseConfigured ? 'GREEN' : 'RED',
    detail: input.supabaseConfigured ? 'Supabase URL + anon key present.' : 'Supabase is not configured — the platform cannot serve data.',
    blocker: !input.supabaseConfigured,
  });
  add({
    key: 'supabase_reachable', label: 'Supabase connectivity', area: 'production',
    status: input.supabaseReachable === true ? 'GREEN' : input.supabaseReachable === false ? 'RED' : 'YELLOW',
    detail: input.supabaseReachable === true ? 'Reached Supabase.' : input.supabaseReachable === false ? 'Could not reach Supabase.' : 'Connectivity not verified in this environment.',
    blocker: input.supabaseReachable === false,
  });
  add({
    key: 'auth_reachable', label: 'Auth status', area: 'production',
    status: input.authReachable === true ? 'GREEN' : input.authReachable === false ? 'RED' : 'YELLOW',
    detail: input.authReachable === true ? 'Auth endpoint healthy.' : input.authReachable === false ? 'Auth endpoint unreachable.' : 'Auth not verified.',
    blocker: input.authReachable === false,
  });
  add({
    key: 'storage_reachable', label: 'Storage status', area: 'production',
    status: input.storageReachable === true ? 'GREEN' : input.storageReachable === false ? 'YELLOW' : 'YELLOW',
    detail: input.storageReachable === true ? 'Storage healthy.' : input.storageReachable === false ? 'Storage unreachable (uploads degraded).' : 'Storage not verified.',
    blocker: false,
  });

  // ---- migration ----------------------------------------------------------
  if (!input.migration.verifiable) {
    add({
      key: 'migrations', label: 'Database migrations', area: 'migration',
      status: 'YELLOW',
      detail: 'Applied migrations could not be verified in this environment (offline / no permission).',
      blocker: false,
    });
  } else {
    const m = input.migration;
    const status: Status = m.failed > 0 || m.outOfOrder > 0 ? 'RED' : m.missing > 0 ? 'RED' : 'GREEN';
    add({
      key: 'migrations', label: 'Database migrations', area: 'migration',
      status,
      detail: m.ok
        ? 'All migrations applied, in order.'
        : `${m.missing} missing, ${m.outOfOrder} out-of-order, ${m.failed} failed.`,
      blocker: status === 'RED',
    });
  }

  // ---- role ---------------------------------------------------------------
  add({
    key: 'rbac_resolver', label: 'RBAC role resolution', area: 'role',
    status: input.rbac.resolverOk ? 'GREEN' : 'RED',
    detail: input.rbac.resolverOk
      ? `Role resolver reads public.user_roles → roles (you: ${input.rbac.resolvedRole ?? 'unknown'}).`
      : 'Role resolver is not returning a role — admins may be denied.',
    blocker: !input.rbac.resolverOk,
  });

  // ---- tester -------------------------------------------------------------
  add({
    key: 'testers', label: 'Active testers', area: 'tester',
    status: input.testerCount === null ? 'YELLOW' : input.testerCount > 0 ? 'GREEN' : 'YELLOW',
    detail: input.testerCount === null ? 'Tester count not available.' : `${input.testerCount} user(s) with an assigned role.`,
    blocker: false,
  });

  // ---- deployment ---------------------------------------------------------
  add({
    key: 'required_env', label: 'Required environment variables', area: 'deployment',
    status: input.requiredEnvMissing.length === 0 ? 'GREEN' : 'RED',
    detail: input.requiredEnvMissing.length === 0 ? 'All required env present.' : `Missing: ${input.requiredEnvMissing.join(', ')}.`,
    blocker: input.requiredEnvMissing.length > 0,
  });
  add({
    key: 'service_role', label: 'Worker / cron credentials', area: 'deployment',
    status: input.serviceRoleConfigured ? 'GREEN' : 'YELLOW',
    detail: input.serviceRoleConfigured ? 'Service-role key present (workers + cron can run).' : 'SUPABASE_SERVICE_ROLE_KEY not set — workers/cron will run offline (no writes).',
    blocker: false,
  });
  add({
    key: 'open_blockers', label: 'Open launch blockers', area: 'deployment',
    status: input.openBlockers === 0 ? 'GREEN' : 'RED',
    detail: input.openBlockers === 0 ? 'No open launch blockers.' : `${input.openBlockers} open launch blocker(s).`,
    blocker: input.openBlockers > 0,
  });

  // ---- security -----------------------------------------------------------
  add({
    key: 'debug_endpoint', label: 'Debug endpoint hardened', area: 'security',
    status: input.debugEndpointHardened ? 'GREEN' : 'RED',
    detail: input.debugEndpointHardened ? '/api/debug/rbac is admin-only and disabled in production.' : '/api/debug/rbac is exposed — harden it.',
    blocker: !input.debugEndpointHardened,
  });
  add({
    key: 'rbac_enforced', label: 'RBAC enforced', area: 'security',
    status: input.rbac.resolverOk ? 'GREEN' : 'RED',
    detail: input.rbac.resolverOk ? 'Middleware role gate active with canonical role source.' : 'RBAC enforcement degraded.',
    blocker: false,
  });

  // ---- aggregate areas ----------------------------------------------------
  const areas = Object.fromEntries(AREA_KEYS.map((k) => [k, 'GREEN' as Status])) as Record<AreaKey, Status>;
  for (const c of checks) areas[c.area] = worst(areas[c.area], c.status);

  // ---- score (GREEN=1, YELLOW=0.5, RED=0) ---------------------------------
  const pts = checks.reduce((sum, c) => sum + (c.status === 'GREEN' ? 1 : c.status === 'YELLOW' ? 0.5 : 0), 0);
  const score = Math.round((pts / checks.length) * 100);

  // ---- overall + recommendation -------------------------------------------
  const blockers = checks.filter((c) => c.blocker && c.status === 'RED');
  let overall: Status = 'GREEN';
  for (const k of AREA_KEYS) overall = worst(overall, areas[k]);
  const recommendation: 'READY' | 'NOT READY' =
    blockers.length === 0 && overall !== 'RED' && score >= 80 ? 'READY' : 'NOT READY';

  return { checks, areas, score, overall, blockers, recommendation };
}
