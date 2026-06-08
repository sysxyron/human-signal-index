// =============================================================================
// WorldForge Phase 5 — EVIDENCE REVIEW QUEUE (Server Component).
// Curators triage the shared citation library: each evidence source needing
// review shows its title, provider, publication type, reliability, linked-run
// count, and support/contradiction counts, with per-row reviewer controls
// (Approve→validated, Reject→rejected, Needs Review→pending, Needs More
// Sources→needs_more) + a notes field. Auth + role gated: reviewers/admins act;
// signed-out users are prompted to sign in; non-reviewers see read-only.
// force-dynamic + revalidate=0 so the DAL never runs at build time.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ClipboardCheck, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getUser, getSessionRole } from '@/lib/supabase/server';
import { listEvidenceReviewQueue } from '@/lib/worldforge/evidence-persistence';
import { EvidenceReviewQueueTable } from '@/components/worldforge/evidence/EvidenceReviewQueueTable';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Roles permitted to record review verdicts. */
const REVIEWER_ROLES = new Set(['reviewer', 'admin', 'curator']);

export default async function EvidenceReviewQueuePage() {
  const [user, role, queue] = await Promise.all([
    getUser(),
    getSessionRole(),
    listEvidenceReviewQueue(),
  ]);

  const isAuthenticated = Boolean(user);
  const canReview = isAuthenticated && role !== null && REVIEWER_ROLES.has(role);

  return (
    <>
      <TopNav
        title="Evidence Review Queue"
        subtitle="Curate the shared citation library"
      />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Reviewer status banner */}
        {!isAuthenticated ? (
          <Card className="space-y-1.5 border-electric/40 bg-electric/5" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-electric">
              <ShieldCheck className="h-4 w-4" /> Sign in to review evidence
            </h3>
            <p className="text-caption leading-relaxed text-text-secondary">
              Reviewers and admins validate, reject, or flag evidence sources.
              Sign in with a reviewer account to record verdicts.
            </p>
          </Card>
        ) : !canReview ? (
          <Card className="space-y-1.5 border-warning/40 bg-warning/5" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" /> Read-only access
            </h3>
            <p className="text-caption leading-relaxed text-text-secondary">
              You can browse the review queue, but recording verdicts requires a
              reviewer or admin role. Each source still shows its current status
              and aggregate evidence signals.
            </p>
          </Card>
        ) : null}

        {!queue.ok ? (
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <ClipboardCheck className="h-5 w-5" /> Could not load the review queue
            </h3>
            <p className="text-body-sm leading-relaxed text-text-secondary">
              {queue.error}
            </p>
            {queue.code === 'NOT_CONFIGURED' ? (
              <p className="text-caption text-text-muted">
                Supabase is not configured in this environment, so there is no
                evidence library to review yet.
              </p>
            ) : null}
          </Card>
        ) : (
          <>
            <section className="space-y-1">
              <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
                <ClipboardCheck className="h-5 w-5 text-electric" /> Sources needing
                review
                <span className="ml-1 rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-caption font-medium text-text-secondary">
                  {queue.data.length}
                </span>
              </h2>
              <p className="text-caption text-text-muted">
                Verdicts: Verified (green), Rejected (red), Needs More (amber),
                Pending (slate). Disagreement (contradictions) is always shown.
              </p>
            </section>

            <EvidenceReviewQueueTable
              items={queue.data}
              canReview={canReview}
              isAuthenticated={isAuthenticated}
            />
          </>
        )}
      </main>
    </>
  );
}
