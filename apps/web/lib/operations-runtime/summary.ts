// =============================================================================
// HSI Phase 74.3 — Operations runtime summary + validation (PURE). Generates a
// human-readable runtime summary and validates the resolved runtime flags. Every
// line is derived from real runtime values — no fabrication. No I/O.
// =============================================================================

import { HSI_MODES, READ_SOURCES, DB_HEALTHS } from '../hsi/edge-config';

export interface RuntimeSummaryInput {
  hsiMode: string;
  primaryDbHealth: string;
  publicEffective: string;
  dashboardEffective: string;
  globalMapEnabled: boolean;
  sourceIngestEnabled: boolean;
  protectedReadMode: boolean;
  maintenanceBanner: boolean;
  betaSignupOpen: boolean;
}

/** Human-readable summary built only from runtime values. */
export function buildRuntimeSummary(i: RuntimeSummaryInput): string[] {
  const lines: string[] = [];
  lines.push(
    i.hsiMode === 'maintenance' ? 'HSI is in maintenance mode.'
      : i.hsiMode === 'protected_read' ? 'HSI is operating in protected read mode.'
      : 'HSI is operating normally.',
  );
  lines.push(i.primaryDbHealth === 'down' ? 'Primary database reported unavailable.' : 'Primary database available.');
  lines.push(`Public reads routed to ${i.publicEffective}.`);
  lines.push(`Dashboard reads routed to ${i.dashboardEffective}.`);
  lines.push(`Global Map ${i.globalMapEnabled ? 'enabled' : 'disabled'}.`);
  lines.push(`Source ingestion ${i.sourceIngestEnabled ? 'enabled' : 'disabled'}.`);
  lines.push(`Protected read mode ${i.protectedReadMode ? 'enabled' : 'disabled'}.`);
  if (i.maintenanceBanner) lines.push('Maintenance banner is active.');
  if (!i.betaSignupOpen) lines.push('Beta applications are paused.');
  return lines;
}

export interface RuntimeFlagsValidation { valid: boolean; problems: string[] }

/** Validate the resolved runtime flags against the allowed vocabularies. The
 *  config is already normalized upstream, so this is a defensive guard that
 *  returns problems only if an out-of-vocabulary value slips through. */
export function validateRuntimeFlags(c: {
  hsiMode: string; publicReadsSource: string; dashboardReadsSource: string; primaryDbHealth: string;
  maintenanceBanner: unknown; betaSignupOpen: unknown; globalMapEnabled: unknown; sourceIngestEnabled: unknown; protectedReadMode: unknown;
}): RuntimeFlagsValidation {
  const problems: string[] = [];
  const inSet = (label: string, v: string, allowed: readonly string[]) => { if (!allowed.includes(v)) problems.push(`${label} has invalid value "${v}".`); };
  const isBool = (label: string, v: unknown) => { if (typeof v !== 'boolean') problems.push(`${label} is not a boolean.`); };
  inSet('hsiMode', c.hsiMode, HSI_MODES);
  inSet('publicReadsSource', c.publicReadsSource, READ_SOURCES);
  inSet('dashboardReadsSource', c.dashboardReadsSource, READ_SOURCES);
  inSet('primaryDbHealth', c.primaryDbHealth, DB_HEALTHS);
  isBool('maintenanceBanner', c.maintenanceBanner);
  isBool('betaSignupOpen', c.betaSignupOpen);
  isBool('globalMapEnabled', c.globalMapEnabled);
  isBool('sourceIngestEnabled', c.sourceIngestEnabled);
  isBool('protectedReadMode', c.protectedReadMode);
  return { valid: problems.length === 0, problems };
}
