'use server';

// =============================================================================
// HSI Phase 41B — public/viewer signal submission actions ('use server').
// Thin wrappers over the submission DAL; parse FormData (incl. an optional file)
// and revalidate the review queue. SERVER-ONLY + audited via the DAL.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  listSignalSubmissions,
  setSubmissionStatus,
  submitPublicSignal,
  type SignalSubmissionRecord,
  type SubmissionFilters,
} from './submission-persistence';

const SUBMISSION_ROUTE = '/dashboard/signal-submission';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try { revalidatePath(p as never); } catch { /* best-effort */ }
  }
}

export interface SubmitActionResult {
  ok: boolean;
  error?: string;
  code?: string;
  submissionId?: string;
  attachmentSkipped?: boolean;
  attachmentMessage?: string;
}

/** Submit a signal for review from the public form (signed-in users). */
export async function submitPublicSignalAction(formData: FormData): Promise<SubmitActionResult> {
  const input = {
    sourceUrl: (formData.get('sourceUrl') as string) ?? undefined,
    observation: (formData.get('observation') as string) ?? undefined,
    platform: (formData.get('platform') as string) ?? undefined,
    category: (formData.get('category') as string) ?? undefined,
    notes: (formData.get('notes') as string) ?? undefined,
  };

  let attachment;
  const file = formData.get('attachment');
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    attachment = { bytes, name: file.name, contentType: file.type || 'application/octet-stream' };
  }

  const res = await submitPublicSignal(input, attachment);
  if (!res.ok) return { ok: false, error: res.error, code: res.code };
  revalidate(SUBMISSION_ROUTE, '/dashboard/signals');
  return {
    ok: true,
    submissionId: res.data.id,
    attachmentSkipped: res.data.attachmentSkipped,
    attachmentMessage: res.data.attachmentMessage,
  };
}

export async function listSignalSubmissionsAction(filters?: SubmissionFilters) {
  return listSignalSubmissions(filters);
}

export async function setSubmissionStatusAction(id: string, status: SignalSubmissionRecord['status']) {
  const res = await setSubmissionStatus(id, status);
  if (res.ok) revalidate(SUBMISSION_ROUTE);
  return res;
}
