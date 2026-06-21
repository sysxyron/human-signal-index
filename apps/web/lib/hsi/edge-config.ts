// =============================================================================
// HSI Phase 74.1 — Vercel Edge Config runtime flags. Read-only inside the app:
// production behavior can be toggled without a redeploy. Reads from Vercel Edge
// Config, merges with safe defaults, validates + normalizes every value, and
// NEVER throws — on any failure it falls back to defaults. Per-request memoized
// (React cache) so a single render makes at most one Edge Config read while still
// reflecting runtime changes on the next request.
// =============================================================================

import { cache as reactCache } from 'react';
import { getAll } from '@vercel/edge-config';

// React `cache` is an RSC-only API; fall back to identity outside that runtime
// (e.g. unit tests) so importing this module never throws.
const memo: <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R =
  typeof reactCache === 'function' ? reactCache : ((fn) => fn);

export const HSI_MODES = ['normal', 'protected_read', 'maintenance'] as const;
export type HsiMode = (typeof HSI_MODES)[number];

export const READ_SOURCES = ['primary', 'replica', 'd1', 'cache'] as const;
export type ReadSource = (typeof READ_SOURCES)[number];

export const DB_HEALTHS = ['healthy', 'degraded', 'down', 'unknown'] as const;
export type DbHealth = (typeof DB_HEALTHS)[number];

export interface HsiRuntimeConfig {
  hsiMode: HsiMode;
  maintenanceBanner: boolean;
  maintenanceMessage: string;
  betaSignupOpen: boolean;
  publicReadsSource: ReadSource;
  dashboardReadsSource: ReadSource;
  globalMapEnabled: boolean;
  sourceIngestEnabled: boolean;
  protectedReadMode: boolean;
  primaryDbHealth: DbHealth;
}

export const HSI_EDGE_DEFAULTS: HsiRuntimeConfig = {
  hsiMode: 'normal',
  maintenanceBanner: false,
  maintenanceMessage: '',
  betaSignupOpen: true,
  publicReadsSource: 'primary',
  dashboardReadsSource: 'primary',
  globalMapEnabled: true,
  sourceIngestEnabled: true,
  protectedReadMode: false,
  primaryDbHealth: 'unknown',
};

export type ConfigSource = 'edge-config' | 'defaults' | 'error-fallback';
export interface HsiRuntimeResult extends HsiRuntimeConfig { source: ConfigSource }

// ---- pure validation/normalization (testable, no I/O) ----------------------

function asBool(v: unknown, d: boolean): boolean { return typeof v === 'boolean' ? v : d; }
function asStr(v: unknown, d: string): string { return typeof v === 'string' ? v : d; }
function asEnum<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}

/** Merge raw Edge Config values (camelCase, snake_case fallback) over defaults
 *  with strict type validation. Unknown/invalid values normalize to the default. */
export function normalizeRuntimeConfig(raw: Record<string, unknown> | null | undefined): HsiRuntimeConfig {
  const r = raw ?? {};
  const pick = (camel: string, snake: string): unknown => (r[camel] !== undefined ? r[camel] : r[snake]);
  return {
    hsiMode: asEnum(pick('hsiMode', 'hsi_mode'), HSI_MODES, HSI_EDGE_DEFAULTS.hsiMode),
    maintenanceBanner: asBool(pick('maintenanceBanner', 'maintenance_banner'), HSI_EDGE_DEFAULTS.maintenanceBanner),
    maintenanceMessage: asStr(pick('maintenanceMessage', 'maintenance_message'), HSI_EDGE_DEFAULTS.maintenanceMessage),
    betaSignupOpen: asBool(pick('betaSignupOpen', 'beta_signup_open'), HSI_EDGE_DEFAULTS.betaSignupOpen),
    publicReadsSource: asEnum(pick('publicReadsSource', 'public_reads_source'), READ_SOURCES, HSI_EDGE_DEFAULTS.publicReadsSource),
    dashboardReadsSource: asEnum(pick('dashboardReadsSource', 'dashboard_reads_source'), READ_SOURCES, HSI_EDGE_DEFAULTS.dashboardReadsSource),
    globalMapEnabled: asBool(pick('globalMapEnabled', 'global_map_enabled'), HSI_EDGE_DEFAULTS.globalMapEnabled),
    sourceIngestEnabled: asBool(pick('sourceIngestEnabled', 'source_ingest_enabled'), HSI_EDGE_DEFAULTS.sourceIngestEnabled),
    protectedReadMode: asBool(pick('protectedReadMode', 'protected_read_mode'), HSI_EDGE_DEFAULTS.protectedReadMode),
    primaryDbHealth: asEnum(pick('primaryDbHealth', 'primary_db_health'), DB_HEALTHS, HSI_EDGE_DEFAULTS.primaryDbHealth),
  };
}

/** Read the runtime config. Never throws. `source` reports where it came from. */
export const getHsiRuntimeConfig = memo(async (): Promise<HsiRuntimeResult> => {
  let raw: Record<string, unknown> | undefined;
  let source: ConfigSource;
  try {
    raw = (await getAll()) as Record<string, unknown> | undefined;
    source = raw && Object.keys(raw).length > 0 ? 'edge-config' : 'defaults';
  } catch {
    raw = undefined;
    source = 'error-fallback';
  }
  return { ...normalizeRuntimeConfig(raw), source };
});

/** Read a single validated flag (convenience). */
export async function getRuntimeFlag<K extends keyof HsiRuntimeConfig>(key: K): Promise<HsiRuntimeConfig[K]> {
  return (await getHsiRuntimeConfig())[key];
}

/** True when reads should be treated as protected/degraded (explicit flag, or
 *  protected_read / maintenance mode). Auth is never affected. */
export async function isProtectedReadMode(): Promise<boolean> {
  const c = await getHsiRuntimeConfig();
  return c.protectedReadMode || c.hsiMode === 'protected_read' || c.hsiMode === 'maintenance';
}
