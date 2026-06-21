// =============================================================================
// HSI Phase 74.1 — Read-routing helper (selection only). Exposes the configured
// read source for public and dashboard reads. This is a SELECTOR, not a router:
//
//   TODO(read-routing): all reads currently still use PRIMARY. Replica / D1 /
//   cache backends are NOT implemented yet. These helpers exist so application
//   code can begin reading the intended source, and so the platform auditor can
//   surface the configured value — but no alternate backend is wired. Do not
//   treat a non-"primary" value as live routing until those backends land.
// =============================================================================

import { getHsiRuntimeConfig, READ_SOURCES, HSI_EDGE_DEFAULTS, type ReadSource } from './edge-config';

/** Coerce an arbitrary value to a valid ReadSource (else 'primary'). PURE. */
export function coerceReadSource(v: unknown): ReadSource {
  return typeof v === 'string' && (READ_SOURCES as readonly string[]).includes(v) ? (v as ReadSource) : HSI_EDGE_DEFAULTS.publicReadsSource;
}

/** The configured source for PUBLIC reads. (Effective backend is still primary.) */
export async function getPublicReadsSource(): Promise<ReadSource> {
  return coerceReadSource((await getHsiRuntimeConfig()).publicReadsSource);
}

/** The configured source for DASHBOARD reads. (Effective backend is still primary.) */
export async function getDashboardReadsSource(): Promise<ReadSource> {
  return coerceReadSource((await getHsiRuntimeConfig()).dashboardReadsSource);
}

/** Until replica/D1/cache exist, every selection resolves to the primary DB. */
export function effectiveBackend(_selected: ReadSource): 'primary' {
  return 'primary';
}
