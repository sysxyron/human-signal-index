// =============================================================================
// @hsi/source-intelligence — source registry domain types + helpers.
//
// The registry is the catalogue of PUBLIC sources we observe. It is pure data:
// registration validates a SourceInput, assigns a deterministic id (derived from
// content via hash, or a caller-supplied id), and never performs network I/O.
//
// ETHICS: registering a source does NOT authorize private capture. URLs are
// policy-checked here so private/auth-gated sources are rejected at intake.
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { normalizeWhitespace } from '../internal/text';
import { CapturePolicyError, assertPublicCapturePolicy } from '../policy';
import type { SourceInput, SourceType } from '../types';

/** A registered source: a SourceInput plus an assigned id + registration time. */
export interface RegisteredSource extends SourceInput {
  id: string;
  /** ISO timestamp the source was registered (injected by caller). */
  registeredAt: string;
  /** Normalized risk weighting in [0,1]. */
  riskLevel: number;
}

/** Outcome of validating a SourceInput prior to registration. */
export interface SourceValidation {
  ok: boolean;
  errors: string[];
}

/** Curated known source types (inputs may still use custom strings). */
export const KNOWN_SOURCE_TYPES: readonly SourceType[] = [
  'website', 'rss', 'youtube', 'tiktok', 'podcast', 'forum', 'document', 'manual',
] as const;

/**
 * Validate a SourceInput. Pure & non-throwing — returns collected errors.
 * Enforces the public-only policy on any provided URLs.
 */
export function validateSource(input: SourceInput): SourceValidation {
  const errors: string[] = [];
  if (!input.name || !normalizeWhitespace(input.name)) {
    errors.push('name is required');
  }
  if (!input.sourceType || !normalizeWhitespace(String(input.sourceType))) {
    errors.push('sourceType is required');
  }
  for (const [field, url] of [
    ['homepageUrl', input.homepageUrl],
    ['rssUrl', input.rssUrl],
  ] as const) {
    if (url) {
      try {
        assertPublicCapturePolicy(url);
      } catch (e) {
        const msg = e instanceof CapturePolicyError ? e.message : String(e);
        errors.push(`${field}: ${msg}`);
      }
    }
  }
  if (
    input.riskLevel !== undefined &&
    (typeof input.riskLevel !== 'number' ||
      Number.isNaN(input.riskLevel) ||
      input.riskLevel < 0 ||
      input.riskLevel > 1)
  ) {
    errors.push('riskLevel must be a number in [0,1]');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Register a source: validate, then assign a deterministic id (sha-256 of a
 * canonical key) and the injected registration timestamp. Throws on invalid
 * input so callers fail fast at intake (this is config-time, not capture-time).
 */
export async function registerSource(
  input: SourceInput,
  now: string,
  explicitId?: string,
): Promise<RegisteredSource> {
  const validation = validateSource(input);
  if (!validation.ok) {
    throw new Error(`Invalid source: ${validation.errors.join('; ')}`);
  }
  const key = [
    normalizeWhitespace(input.name).toLowerCase(),
    String(input.sourceType).toLowerCase(),
    input.homepageUrl ?? '',
    input.rssUrl ?? '',
  ].join('|');
  const id = explicitId ?? `src_${(await sha256Hex(key)).slice(0, 16)}`;
  return {
    ...input,
    id,
    registeredAt: now,
    riskLevel: clampRisk(input.riskLevel),
  };
}

/** Is the type one of the curated known types? */
export function isKnownSourceType(t: string): t is SourceType {
  return (KNOWN_SOURCE_TYPES as readonly string[]).includes(t);
}

function clampRisk(r: number | undefined): number {
  if (typeof r !== 'number' || Number.isNaN(r)) return 0;
  return Math.min(1, Math.max(0, r));
}
