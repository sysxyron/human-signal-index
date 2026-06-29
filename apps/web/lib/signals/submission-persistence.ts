// =============================================================================
// HSI Phase 41B — public/viewer signal submission DAL (SERVER-ONLY).
//
// Beta bug F: a signed-in VIEWER could not create a visible submission. This is
// the submission intake → review-queue path, separate from the researcher+
// manual-signal path (no RBAC change). Any SIGNED-IN user may submit their own
// (RLS: submitter_id = auth.uid()); reviewer+/admin read + triage. Attachment
// upload is best-effort — a failed/absent bucket NEVER fails the submission.
//
// All writes go through the cookie-backed RLS client (no service-role).
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { getCurrentOrganizationId } from '@/lib/org/operations';
import { ensureCurrentAppUser, ACCOUNT_NOT_READY_MESSAGE } from '@/lib/auth/ensure-app-user';
import { toUserMessage } from '@/lib/errors/domain-error';
import { logError } from '@/lib/errors/format-error';
import { validateSubmission, type SubmissionInput, type NormalizedSubmission } from './submission-validate';
import type { DbResult } from './persistence';

/** Storage bucket for submission attachments (provisioned separately). */
const ATTACHMENT_BUCKET = 'signal-evidence';
const ATTACHMENT_MISSING_MSG =
  'File upload is not configured yet. Your signal was submitted without the attachment.';

export interface SignalSubmissionRecord {
  id: string;
  source_url?: string | null;
  observation: string;
  platform?: string | null;
  category?: string | null;
  notes?: string | null;
  evidence_url?: string | null;
  evidence_path?: string | null;
  status: 'pending' | 'reviewing' | 'accepted' | 'rejected';
  submitter_id?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  signal_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SubmitResult {
  id: string;
  attachmentSkipped: boolean;
  attachmentMessage?: string;
}

export interface SubmissionAttachment {
  bytes: Uint8Array;
  name: string;
  contentType: string;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'attachment';
}

/**
 * Build the signal_submissions insert row. `submitterId` MUST be the confirmed
 * public.users.id (== auth.uid()) from ensureCurrentAppUser — it is the FK target
 * for signal_submissions_submitter_id_fkey.
 */
export function buildSubmissionInsert(
  submitterId: string,
  v: NormalizedSubmission,
  organizationId: string | null,
): Record<string, unknown> {
  return {
    source_url: v.source_url,
    observation: v.observation,
    platform: v.platform,
    category: v.category,
    notes: v.notes,
    evidence_url: v.source_url,
    status: 'pending',
    submitter_id: submitterId,
    organization_id: organizationId,
  };
}

/**
 * Create a signal submission as the signed-in user. Requires authentication (RLS
 * enforces submitter_id = auth.uid()). NEVER throws. Attachment is best-effort.
 */
export async function submitPublicSignal(
  input: SubmissionInput,
  attachment?: SubmissionAttachment,
): Promise<DbResult<SubmitResult>> {
  try {
    const client = createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return { ok: false, error: 'Sign in to submit a signal for review.', code: 'AUTH_REQUIRED' };
    }

    const validation = validateSubmission(input);
    if (!validation.ok) {
      return { ok: false, error: validation.message, code: 'DB_ERROR' };
    }
    const v = validation.value;

    // Identity sync: guarantee a public.users row (FK target) before insert.
    const appUser = await ensureCurrentAppUser();
    if (!appUser.ok || !appUser.id) {
      return { ok: false, error: ACCOUNT_NOT_READY_MESSAGE, code: 'DB_ERROR' };
    }

    const orgId = await getCurrentOrganizationId().catch(() => null);

    const { data: row, error } = await client
      .from('signal_submissions')
      .insert(buildSubmissionInsert(appUser.id, v, orgId))
      .select('id')
      .single();
    if (error || !row) {
      if (error) logError('signals/submitPublicSignal', error); // full detail server-side only
      // Centralised, non-leaking domain message (identity FK → account-not-ready).
      return { ok: false, error: error ? toUserMessage(error, { duplicate: 'You have already submitted this signal.' }) : 'Could not save your submission.', code: 'DB_ERROR' };
    }
    const id = row.id as string;

    // Best-effort attachment upload — a missing bucket / denied upload is NOT a
    // submission failure (beta bug E).
    let attachmentSkipped = false;
    let attachmentMessage: string | undefined;
    if (attachment && attachment.bytes.byteLength > 0) {
      const path = `submissions/${id}/${sanitizeName(attachment.name)}`;
      try {
        const { error: upErr } = await client.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, attachment.bytes, { contentType: attachment.contentType, upsert: false });
        if (upErr) {
          attachmentSkipped = true;
          attachmentMessage = ATTACHMENT_MISSING_MSG;
        } else {
          await client.from('signal_submissions').update({ evidence_path: path }).eq('id', id);
        }
      } catch {
        attachmentSkipped = true;
        attachmentMessage = ATTACHMENT_MISSING_MSG;
      }
    }

    return { ok: true, data: { id, attachmentSkipped, attachmentMessage } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), code: 'DB_ERROR' };
  }
}

export interface SubmissionFilters {
  status?: SignalSubmissionRecord['status'];
}

/** List submissions for the review queue (reviewer+/admin). RLS-scoped. */
export async function listSignalSubmissions(
  filters?: SubmissionFilters,
): Promise<DbResult<SignalSubmissionRecord[]>> {
  try {
    const client = createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { ok: false, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' };
    const role = await loadHighestRole(client, user.id);
    if (!isReviewerOrAbove(role)) {
      return { ok: false, error: 'The submission queue is restricted to reviewers and admins.', code: 'FORBIDDEN' };
    }

    let query = client.from('signal_submissions').select('*');
    if (filters?.status) query = query.eq('status', filters.status);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
    if (error) { logError('signals/listSubmissions', error); return { ok: false, error: toUserMessage(error), code: 'DB_ERROR' }; }
    return { ok: true, data: (data ?? []) as SignalSubmissionRecord[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), code: 'DB_ERROR' };
  }
}

/** Triage a submission (reviewer+/admin): set status + reviewer + timestamp. */
export async function setSubmissionStatus(
  id: string,
  status: SignalSubmissionRecord['status'],
): Promise<DbResult<{ status: string }>> {
  try {
    const client = createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { ok: false, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' };
    const role = await loadHighestRole(client, user.id);
    if (!isReviewerOrAbove(role)) {
      return { ok: false, error: 'Triage is restricted to reviewers and admins.', code: 'FORBIDDEN' };
    }
    const { error } = await client
      .from('signal_submissions')
      .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { logError('signals/setSubmissionStatus', error); return { ok: false, error: toUserMessage(error), code: 'DB_ERROR' }; }
    return { ok: true, data: { status } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), code: 'DB_ERROR' };
  }
}

const REVIEWER_PLUS = new Set(['reviewer', 'curator', 'admin']);
function isReviewerOrAbove(role: string | null): boolean {
  return role != null && REVIEWER_PLUS.has(role.toLowerCase());
}

/** A SupabaseClient alias for callers that already hold one (unused internally). */
export type { SupabaseClient };
