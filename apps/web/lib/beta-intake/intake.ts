// =============================================================================
// HSI Milestone 86 — beta-application & demo-request intake (PURE).
//
// Validation, email normalization, and DB row building for the public intake
// forms. Kept pure (no I/O, no process.env, no Date.now) so it is fully
// unit-testable; the persistence layer and the API routes both reuse it so the
// rules live in exactly one place. snake_case rows match migration 0059.
//
// SECURITY HOTFIX: applicant/contact NAME and ORGANIZATION now go through the
// centralized validators (lib/validation/name) which reject HTML/script/XSS
// payloads with a friendly message. Disposable-email rejection (env-configurable)
// lives in the route handlers, which have process.env; this module stays pure.
// =============================================================================

import { validateName, validateOrgName, validateOptionalOrgName } from '../validation/name';
import { isValidEmailFormat } from '../validation/email';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nullable = (v: unknown): string | null => {
  const s = str(v);
  return s.length > 0 ? s : null;
};

export interface BetaApplicationInput {
  name: string;
  email: string;
  organization: string | null;
  role: string;
  areaOfInterest: string | null;
  reason: string;
  experience: string | null;
  preferredRole: string | null;
}

export interface DemoRequestInput {
  name: string;
  email: string;
  organization: string;
  useCase: string;
  role: string | null;
  teamSize: string | null;
  timeline: string | null;
  notes: string | null;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Canonical email key used for dedup (case/space-insensitive). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateBetaApplication(body: Record<string, unknown>): Validated<BetaApplicationInput> {
  const email = str(body.email);
  const role = str(body.role);
  const reason = str(body.reason);
  const errors: string[] = [];

  const nameCheck = validateName(body.name);
  if (!nameCheck.ok) errors.push(nameCheck.message);
  const orgCheck = validateOptionalOrgName(body.organization);
  if (!orgCheck.ok) errors.push(orgCheck.message);

  if (!email || !isValidEmailFormat(email)) errors.push('A valid email is required.');
  if (!role) errors.push('Tell us your role or background.');
  if (!reason) errors.push('Tell us why you want to test HSI.');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: (nameCheck as { value: string }).value, email, role, reason,
      organization: (orgCheck as { value: string | null }).value,
      areaOfInterest: nullable(body.areaOfInterest),
      experience: nullable(body.experience),
      preferredRole: nullable(body.preferredRole),
    },
  };
}

export function validateDemoRequest(body: Record<string, unknown>): Validated<DemoRequestInput> {
  const email = str(body.email);
  const useCase = str(body.useCase);
  const errors: string[] = [];

  const nameCheck = validateName(body.name);
  if (!nameCheck.ok) errors.push(nameCheck.message);
  const orgCheck = validateOrgName(body.organization);
  if (!orgCheck.ok) errors.push(str(body.organization) ? orgCheck.message : 'Organization is required.');

  if (!email || !isValidEmailFormat(email)) errors.push('A valid work email is required.');
  if (!useCase) errors.push('Tell us your use case.');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: (nameCheck as { value: string }).value, email,
      organization: (orgCheck as { value: string }).value, useCase,
      role: nullable(body.role),
      teamSize: nullable(body.teamSize),
      timeline: nullable(body.timeline),
      notes: nullable(body.notes),
    },
  };
}

/** beta_applications insert row (status pending; email pre-normalized for dedup). */
export function betaApplicationRow(input: BetaApplicationInput, normalizedEmail: string): Record<string, unknown> {
  return {
    name: input.name,
    email: normalizedEmail,
    organization: input.organization,
    role: input.role,
    area_of_interest: input.areaOfInterest,
    reason: input.reason,
    experience: input.experience,
    preferred_role: input.preferredRole,
    status: 'pending',
    source: 'web',
  };
}

/** demo_requests insert row (status new; email pre-normalized for dedup). */
export function demoRequestRow(input: DemoRequestInput, normalizedEmail: string): Record<string, unknown> {
  return {
    name: input.name,
    email: normalizedEmail,
    organization: input.organization,
    use_case: input.useCase,
    role: input.role,
    team_size: input.teamSize,
    timeline: input.timeline,
    notes: input.notes,
    status: 'new',
    source: 'web',
  };
}

/** Dedup decision: is there an existing submission within the window from now? */
export function isWithinDedupeWindow(existingCreatedAtMs: number, nowMs: number, windowMs: number): boolean {
  return nowMs - existingCreatedAtMs < windowMs;
}
