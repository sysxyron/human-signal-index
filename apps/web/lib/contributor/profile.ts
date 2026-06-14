'use server';

// =============================================================================
// HSI Phase 25 — contribution identity (Deliverable 11). Reads the signed-in
// user's XP, intel credits, reputation, rank, and badges and assembles the
// "Who am I in HSI?" view for /dashboard/profile. Read-only; never grants a role.
// Offline (no Supabase) → deterministic demo identity.
// =============================================================================

import type { ContributionIdentity } from '@hsi/shared-types';
import {
  totalXp, totalCredits, computeReputation, overallReputation, trackForRole, rankProgress,
  badgeById, demoXpLedger, demoCreditLedger, demoQuality, demoMetrics, evaluateBadges,
  type ContributionMetrics, type QualitySignals, type XpEntry, type CreditEntry,
} from '@hsi/contributor-network';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { contributorConfigured, type ContribResult } from './options';

function buildIdentity(
  role: string | null,
  xp: number,
  credits: number,
  quality: QualitySignals,
  metrics: ContributionMetrics,
  heldBadges: string[],
  grantedLevel: number,
): ContributionIdentity {
  const reputation = computeReputation(quality);
  const track = trackForRole(role);
  const trackRepKey = ({
    viewer: 'trust_reputation', research: 'research_reputation', review: 'review_reputation',
    curation: 'publication_reputation', governance: 'governance_reputation',
  } as const)[track];
  const trackRep = reputation[trackRepKey];
  const progress = rankProgress(track, xp, trackRep, metrics, grantedLevel);
  const badges = heldBadges.map((id) => ({ id, name: badgeById(id)?.name ?? id }));
  return {
    role,
    rankName: progress.current.name,
    rankTrack: track,
    xp,
    intelCredits: credits,
    reputation,
    overallReputation: overallReputation(reputation),
    badges,
    acceptedSignals: metrics.accepted_signals,
    evidencePackages: metrics.evidence_packages,
    reviewsCompleted: metrics.completed_reviews,
    reportsPrepared: metrics.approved_reports,
    nextRank: progress.next
      ? { name: progress.next.name, xpToNext: progress.xpToNext, reputationToNext: progress.reputationToNext, needsAdminApproval: progress.needsAdminApproval }
      : null,
  };
}

export async function getContributionIdentityAction(): Promise<ContribResult<ContributionIdentity>> {
  // Offline → demo identity (clearly labelled by the page).
  if (!contributorConfigured()) {
    const held = evaluateBadges(demoMetrics).map((b) => b.badgeId);
    return {
      ok: true, demo: true,
      data: buildIdentity('researcher', totalXp(demoXpLedger), totalCredits(demoCreditLedger), demoQuality, demoMetrics, held, 1),
    };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);

    // XP + credits (own rows via RLS self_read).
    const [{ data: xpRows }, { data: creditRows }, { data: badgeRows }, { data: repRow }, { data: rankRows }] = await Promise.all([
      db.from('user_xp_ledger').select('event, amount, created_at').eq('user_id', user.id),
      db.from('intel_credit_ledger').select('event, amount, created_at').eq('user_id', user.id),
      db.from('user_badges').select('badge_id').eq('user_id', user.id),
      db.from('user_reputation_scores').select('*').eq('user_id', user.id).maybeSingle(),
      db.from('user_ranks').select('track, granted_level').eq('user_id', user.id),
    ]);

    const ledger: XpEntry[] = (xpRows ?? []).map((r) => ({ event: (r as { event: XpEntry['event'] }).event, amount: (r as { amount: number }).amount, at: (r as { created_at: string }).created_at }));
    const creditLedger: CreditEntry[] = (creditRows ?? []).map((r) => ({ event: (r as { event: CreditEntry['event'] }).event, amount: (r as { amount: number }).amount, at: (r as { created_at: string }).created_at }));
    const held = (badgeRows ?? []).map((r) => (r as { badge_id: string }).badge_id);

    // Reputation snapshot → quality signals (fall back to neutral if absent).
    const quality: QualitySignals = repRow
      ? {
          acceptedSignals: 0, rejectedSignals: 0, // not stored; reputation already computed below
          reviewAccuracy: 0, evidenceQuality: 0, traceabilityScore: 0, consensusAgreement: 0, governanceOutcomes: 0, publicationQuality: 0,
        }
      : { acceptedSignals: 0, rejectedSignals: 0, reviewAccuracy: 0.5, evidenceQuality: 0.5, traceabilityScore: 0.5, consensusAgreement: 0.5, governanceOutcomes: 0.5, publicationQuality: 0.5 };

    const metrics: ContributionMetrics = {
      accepted_signals: 0, approved_sources: 0, evidence_packages: 0, linked_signals: 0,
      completed_reviews: 0, traceability_days: 0, confirmed_early_detections: 0, approved_reports: 0, governance_actions: 0,
    };
    const track = trackForRole(role);
    const grantedLevel = ((rankRows ?? []).find((r) => (r as { track: string }).track === track) as { granted_level?: number } | undefined)?.granted_level ?? 1;

    const identity = buildIdentity(role, totalXp(ledger), totalCredits(creditLedger), quality, metrics, held, grantedLevel);
    // Prefer the stored reputation snapshot when present (already computed by worker).
    if (repRow) {
      const r = repRow as Record<string, number>;
      identity.reputation = {
        research_reputation: r.research_reputation ?? 0,
        review_reputation: r.review_reputation ?? 0,
        publication_reputation: r.publication_reputation ?? 0,
        governance_reputation: r.governance_reputation ?? 0,
        trust_reputation: r.trust_reputation ?? 0,
      };
      identity.overallReputation = overallReputation(identity.reputation as unknown as ReturnType<typeof computeReputation>);
    }
    return { ok: true, data: identity };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}
