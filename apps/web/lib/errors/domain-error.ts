// =============================================================================
// HSI Phase 76 — central USER-FACING domain error mapper.
//
// `formatErrorMessage` (./format-error) is OPERATOR-facing: it deliberately spells
// out table names, RLS policy hints, SQLSTATE codes, and migration guidance. That
// is correct for admin dashboards and server logs, but it must NEVER reach a
// contributor — it leaks SQL/constraint/RLS internals.
//
// This module is the single place that turns any infrastructure error (Supabase /
// PostgREST / Postgres) into a SAFE, generic, domain message + a stable code. It
// classifies on SQLSTATE/known markers but returns only fixed strings — the raw
// message is never echoed back. Callers may override the per-class copy with
// domain-specific wording (e.g. "You have already applied for this path.").
//
// It reuses the ONE identity path (`isMissingIdentityError` / ACCOUNT_NOT_READY)
// from lib/auth/ensure-app-user so there is no second identity-error definition.
// Pair with `logError(...)` to keep the full detail server-side.
// =============================================================================

import { ACCOUNT_NOT_READY_MESSAGE } from '@/lib/auth/ensure-app-user';
import { formatErrorDetails } from './format-error';

// Precise identity-FK markers: a FK to public.users failing on a user-identity
// column. Unlike the write-site `isMissingIdentityError` (which treats any 23503
// as identity, fine at the role_applications / signal_submissions inserts), the
// central mapper must DISTINGUISH an identity FK from any other FK (e.g.
// cohort_id), so it keys off the constraint name / "not present in table users".
const IDENTITY_FK = /(_user_id_fkey|_submitter_id_fkey|_reporter_id_fkey|_user_fkey)\b|not present in table "(public\.)?users"/i;

export type DomainErrorCode =
  | 'ACCOUNT_NOT_READY'
  | 'DUPLICATE'
  | 'PERMISSION_DENIED'
  | 'INVALID_STATE'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export interface DomainError {
  code: DomainErrorCode;
  message: string;
}

/** Optional domain-specific copy overriding the generic per-class default. */
export interface DomainErrorOverrides {
  duplicate?: string;
  permission?: string;
  invalidState?: string;
  validation?: string;
  notFound?: string;
  unavailable?: string;
  fallback?: string;
}

/** Safe, generic, NON-leaking defaults. No SQL / constraint / RLS / table text. */
const SAFE_MESSAGE: Record<DomainErrorCode, string> = {
  ACCOUNT_NOT_READY: ACCOUNT_NOT_READY_MESSAGE,
  DUPLICATE: 'This has already been submitted.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
  INVALID_STATE: 'This action is not available in the current state.',
  VALIDATION: 'Some of the information provided is invalid. Please review and try again.',
  NOT_FOUND: 'The requested item could not be found.',
  UNAVAILABLE: 'The service is temporarily unavailable. Please try again in a moment.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

/**
 * Classify an infrastructure error into a domain code WITHOUT exposing its text.
 * Uses SQLSTATE codes first, then conservative marker matching on the (internal)
 * message — the matched text is used only to choose a class, never returned.
 */
export function classifyDomainError(error: unknown): DomainErrorCode {
  const d = formatErrorDetails(error);
  const code = (d.code ?? '').toUpperCase();
  const rawText = `${d.message} ${d.details ?? ''} ${d.hint ?? ''}`;
  const text = rawText.toLowerCase();

  // Identity FK to public.users (missing identity row) — the one identity path.
  if (IDENTITY_FK.test(rawText)) return 'ACCOUNT_NOT_READY';

  // Unique violation → duplicate.
  if (code === '23505' || /duplicate key|already exists|unique constraint|violates unique/.test(text)) {
    return 'DUPLICATE';
  }
  // RLS / privilege → permission denied. (PGRST301 = RLS rejected the request.)
  if (code === '42501' || code === 'PGRST301' || /row-level security|permission denied|insufficient.privilege|not authorized|violates row-level/.test(text)) {
    return 'PERMISSION_DENIED';
  }
  // No rows where exactly one was required → not found. (PGRST116 = 0 rows for .single())
  if (code === 'PGRST116' || /no rows|0 rows|results contain 0 rows|not found/.test(text)) {
    return 'NOT_FOUND';
  }
  // Check / not-null / invalid-input / enum → validation.
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22007' || /check constraint|not-null|invalid input|invalid text representation/.test(text)) {
    return 'VALIDATION';
  }
  // Non-identity foreign key → a referenced record is missing/invalid.
  if (code === '23503' || /foreign key/.test(text)) {
    return 'INVALID_STATE';
  }
  // Transport problems reaching the database.
  if (/fetch failed|econnrefused|enotfound|network|timeout|temporarily unavailable|service unavailable|503/.test(text)) {
    return 'UNAVAILABLE';
  }
  return 'UNKNOWN';
}

/** Map any infrastructure error to a safe { code, message } for the user. */
export function mapDomainError(error: unknown, overrides: DomainErrorOverrides = {}): DomainError {
  const codeClass = classifyDomainError(error);
  const override: Partial<Record<DomainErrorCode, string | undefined>> = {
    DUPLICATE: overrides.duplicate,
    PERMISSION_DENIED: overrides.permission,
    INVALID_STATE: overrides.invalidState,
    VALIDATION: overrides.validation,
    NOT_FOUND: overrides.notFound,
    UNAVAILABLE: overrides.unavailable,
    UNKNOWN: overrides.fallback,
  };
  return { code: codeClass, message: override[codeClass] ?? SAFE_MESSAGE[codeClass] };
}

/** Convenience: just the safe user-facing string. */
export function toUserMessage(error: unknown, overrides: DomainErrorOverrides = {}): string {
  return mapDomainError(error, overrides).message;
}
