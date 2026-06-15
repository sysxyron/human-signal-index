// =============================================================================
// HSI Phase 26 — contribution RECORDER. SERVER-ONLY. The single, idempotent,
// audited entry point that platform write paths call (best-effort) after a real
// action succeeds.
//
// FLOW: resolve award rules (anti-gaming validated) → write ONE append-only
// contribution_events row gated by a UNIQUE idempotency_key → write the per-
// recipient XP / credit ledger rows linked to that event. Re-processing the same
// action is a no-op (the unique key already exists). Reputation / ranks / badges /
// leaderboards are derived later by the worker — never here.
//
// SECURITY: writes use the service-role client (server-only; never client-side),
// so users cannot self-issue awards; the recorder only runs after a genuine,
// already-authorised platform action. NEVER throws (best-effort) and NEVER
// touches public.user_roles. Offline / no service-role env → silent no-op.
// =============================================================================

import {
  resolveAwards, idempotencyKey, XP_VALUES, CREDIT_VALUES, DEFAULT_REJECTION_PENALTY,
  type ContributionEventType,
} from '@hsi/contributor-network';
import { getServiceClient } from '@/lib/admin/guard';

export interface RecordContributionInput {
  event: ContributionEventType;
  actorId: string;
  subjectId?: string | null;
  refKind: string;
  refId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RecordResult {
  recorded: boolean;
  /** Why nothing was written (duplicate, anti-gaming, offline, error) — for logging/tests. */
  skipped?: 'duplicate' | 'rejected' | 'not_configured' | 'error';
  reason?: string;
}

const REPUTATION_GAIN_ON_ACCEPT = 2;

function reputationDelta(affects: 'accepted' | 'rejected' | undefined): number {
  if (affects === 'accepted') return REPUTATION_GAIN_ON_ACCEPT;
  if (affects === 'rejected') {
    const env = Number(process.env.CONTRIB_REJECTION_PENALTY);
    return -(Number.isFinite(env) && env > 0 ? env : DEFAULT_REJECTION_PENALTY);
  }
  return 0;
}

/**
 * Idempotently record a platform contribution and its awards. Best-effort:
 * any failure (or missing service-role env) returns { recorded:false } and never
 * throws, so callers can fire-and-forget without affecting the user's action.
 */
export async function recordContribution(input: RecordContributionInput): Promise<RecordResult> {
  try {
    const decision = resolveAwards(input.event, { actorId: input.actorId, subjectId: input.subjectId });
    if (!decision.ok) return { recorded: false, skipped: 'rejected', reason: decision.reason };

    const db = await getServiceClient();
    if (!db) return { recorded: false, skipped: 'not_configured' };

    // Totals for the audit row.
    let xpTotal = 0;
    let creditTotal = 0;
    for (const l of decision.lines) {
      if (l.xp) xpTotal += XP_VALUES[l.xp];
      if (l.credit) creditTotal += CREDIT_VALUES[l.credit];
    }
    const repDelta = reputationDelta(decision.affects);

    // Action-level idempotency key — re-running the same action is a no-op.
    const key = idempotencyKey({ event: input.event, refKind: input.refKind, refId: input.refId, recipientId: input.actorId, slot: input.subjectId ?? 'action' });

    // 1. Gate: insert the audit row; duplicates are ignored.
    const { data: evRows, error: evErr } = await db
      .from('contribution_events')
      .upsert(
        {
          actor_id: input.actorId,
          subject_id: input.subjectId ?? null,
          event_type: input.event,
          ref_kind: input.refKind,
          ref_id: input.refId,
          reason: input.reason ?? null,
          metadata: input.metadata ?? {},
          xp_awarded: xpTotal,
          credits_awarded: creditTotal,
          reputation_delta: repDelta,
          idempotency_key: key,
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: true },
      )
      .select('id');
    if (evErr) return { recorded: false, skipped: 'error', reason: evErr.message };
    const eventId = Array.isArray(evRows) && evRows[0] ? (evRows[0] as { id: string }).id : null;
    if (!eventId) return { recorded: false, skipped: 'duplicate' }; // already processed

    // 2. Ledger rows per recipient, linked to the audit event.
    const xpRows = decision.lines.filter((l) => l.xp).map((l) => ({ user_id: l.recipientId, event: l.xp, amount: XP_VALUES[l.xp!], note: input.reason ?? null, ref_kind: input.refKind, ref_id: input.refId, event_id: eventId }));
    const creditRows = decision.lines.filter((l) => l.credit).map((l) => ({ user_id: l.recipientId, event: l.credit, amount: CREDIT_VALUES[l.credit!], note: input.reason ?? null, event_id: eventId }));
    if (xpRows.length) await db.from('user_xp_ledger').insert(xpRows);
    if (creditRows.length) await db.from('intel_credit_ledger').insert(creditRows);

    return { recorded: true };
  } catch (e) {
    return { recorded: false, skipped: 'error', reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Fire-and-forget helper — never awaited by the caller's critical path. */
export function recordContributionSafe(input: RecordContributionInput): void {
  void recordContribution(input);
}
