// =============================================================================
// HSI Phase 25 — contributor network OPTIONS + shared helpers. PURE (no
// 'use server'): purpose paths, the purpose→requested-role mapping, the offline
// configured() check, and demo builders that power NOT_CONFIGURED views. Imported
// by the contributor server-action modules and pages.
// =============================================================================

import type { PurposePath, RequestedRole } from '@hsi/contributor-network';

export interface PurposeOption {
  path: PurposePath;
  label: string;
  blurb: string;
  /** The role this path may eventually be approved for (null = stays viewer). */
  requestedRole: RequestedRole | null;
}

/** Onboarding purpose choices (Deliverable 1). No privileged role is granted. */
export const PURPOSE_OPTIONS: PurposeOption[] = [
  { path: 'observer', label: 'Observer', blurb: 'I want to explore reports and follow investigations.', requestedRole: null },
  { path: 'contributor', label: 'Contributor', blurb: 'I want to submit signals, sources, or tips.', requestedRole: 'contributor' },
  { path: 'researcher_applicant', label: 'Researcher Applicant', blurb: 'I want to help investigate and verify information.', requestedRole: 'researcher' },
  { path: 'reviewer_applicant', label: 'Reviewer Applicant', blurb: 'I want to review evidence and investigations.', requestedRole: 'reviewer' },
  { path: 'organization_applicant', label: 'Organization Applicant', blurb: 'I represent a team, institution, newsroom, nonprofit, or research group.', requestedRole: 'curator' },
];

export function purposeOption(path: string): PurposeOption | undefined {
  return PURPOSE_OPTIONS.find((p) => p.path === path);
}

/**
 * Build the role_applications insert row. `appUserId` MUST be the confirmed
 * public.users.id (== auth.uid()) from ensureCurrentAppUser — it is the FK target
 * for role_applications_user_id_fkey. Always pending (RLS-enforced); never admin.
 */
export function buildRoleApplicationInsert(
  appUserId: string,
  opt: PurposeOption,
  input: { experienceSummary?: string; reason?: string; organization?: string },
): Record<string, unknown> {
  return {
    user_id: appUserId,
    requested_path: opt.path,
    requested_role: opt.requestedRole, // null for observer; never admin
    experience_summary: input.experienceSummary ?? null,
    reason: input.reason ?? null,
    organization: input.organization ?? null,
    status: 'pending',
  };
}

/** Is Supabase configured for live data? Mirrors the admin guard's check. */
export function contributorConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.trim().length > 0 && key.trim().length > 0 && !/127\.0\.0\.1:54321|anon-placeholder/.test(`${url}${key}`);
}

export type ContribResult<T> =
  | { ok: true; data: T; demo?: boolean }
  | { ok: false; code: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR'; error?: string };
