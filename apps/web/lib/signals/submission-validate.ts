// =============================================================================
// HSI Phase 41B — public signal submission validation (PURE, client+server).
//
// Beta feedback (E/F): viewer submissions silently refreshed and never persisted,
// attachments showed no state. This validates the submission payload + attachment
// so the form can show clear messages and the server action can reject bad input.
// =============================================================================

import { classifyReferenceUrl } from './reference-url';

export interface SubmissionInput {
  sourceUrl?: string;
  observation?: string;
  platform?: string;
  category?: string;
  notes?: string;
}

export interface NormalizedSubmission {
  source_url: string | null;
  observation: string;
  platform: string | null;
  category: string | null;
  notes: string | null;
}

export type SubmissionValidation =
  | { ok: true; value: NormalizedSubmission }
  | { ok: false; field: 'observation' | 'sourceUrl'; message: string };

const MIN_OBSERVATION = 10;

/** Validate + normalize a submission. URL is optional but, if present, must be a
 *  public reference (doi.org / Zenodo / arXiv / any public http(s)). PURE. */
export function validateSubmission(input: SubmissionInput): SubmissionValidation {
  const observation = (input.observation ?? '').trim();
  if (observation.length < MIN_OBSERVATION) {
    return { ok: false, field: 'observation', message: `Describe what you observed (at least ${MIN_OBSERVATION} characters).` };
  }
  const url = (input.sourceUrl ?? '').trim();
  if (url) {
    const cls = classifyReferenceUrl(url);
    if (!cls.ok) return { ok: false, field: 'sourceUrl', message: cls.reason ?? 'Enter a valid public URL.' };
  }
  return {
    ok: true,
    value: {
      source_url: url || null,
      observation,
      platform: (input.platform ?? '').trim() || null,
      category: (input.category ?? '').trim() || null,
      notes: (input.notes ?? '').trim() || null,
    },
  };
}

// -----------------------------------------------------------------------------
// Attachment validation (Deliverable E).
// -----------------------------------------------------------------------------

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB
export const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'pdf'];

export type AttachmentValidation = { ok: true } | { ok: false; message: string };

/** Validate an attachment's type + size before upload. PURE. */
export function validateAttachment(file: { name: string; type?: string; size: number }): AttachmentValidation {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = (file.type && ALLOWED_ATTACHMENT_TYPES.includes(file.type)) || ALLOWED_EXT.includes(ext);
  if (!typeOk) return { ok: false, message: 'Only PNG, JPG, or PDF files are allowed.' };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, message: 'File is larger than 25MB.' };
  if (file.size <= 0) return { ok: false, message: 'That file appears to be empty.' };
  return { ok: true };
}
