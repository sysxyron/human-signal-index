'use server';

// =============================================================================
// HSIN Phase 20 — Collective Intelligence & Consensus server actions. 'use server'.
// THIN wrappers over the Phase-20 DAL. Return DbResult; revalidate the dashboards;
// NEVER throw. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  createInvestigationDal,
  getCollectiveHighlights,
  getConsensusBoard,
  getConsensusDetail,
  getContributorsBoard,
  getDebatesBoard,
  getInvestigationDetail,
  getInvestigationsBoard,
  recomputeConsensusDal,
  reviewConsensusDal,
  submitChallengeDal,
  submitFindingDal,
  transitionInvestigationDal,
  type CreateInvestigationResult,
  type DbResult,
} from './persistence';
import { canUseFeatureAction } from '@/lib/billing/billing';
import type {
  CollectiveHighlights,
  ConsensusBoardData,
  ConsensusDecision,
  ConsensusDetailData,
  ContributorsBoardData,
  DebatesBoardData,
  InvestigationDetailData,
  InvestigationState,
  InvestigationsBoardData,
} from '@hsi/shared-types';

const INV = '/dashboard/investigations';
const CON = '/dashboard/consensus';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // best-effort.
    }
  }
}

// ---- reads ------------------------------------------------------------------
export async function getInvestigationsBoardAction(): Promise<DbResult<InvestigationsBoardData>> {
  return getInvestigationsBoard();
}
export async function getInvestigationDetailAction(id: string): Promise<DbResult<InvestigationDetailData>> {
  return getInvestigationDetail(id, { now: new Date().toISOString() });
}
export async function getConsensusBoardAction(): Promise<DbResult<ConsensusBoardData>> {
  return getConsensusBoard();
}
export async function getConsensusDetailAction(investigationId: string): Promise<DbResult<ConsensusDetailData>> {
  return getConsensusDetail(investigationId, { now: new Date().toISOString() });
}
export async function getContributorsBoardAction(): Promise<DbResult<ContributorsBoardData>> {
  return getContributorsBoard();
}
export async function getDebatesBoardAction(): Promise<DbResult<DebatesBoardData>> {
  return getDebatesBoard();
}
export async function getCollectiveHighlightsAction(): Promise<DbResult<CollectiveHighlights>> {
  return getCollectiveHighlights();
}

// ---- writes -----------------------------------------------------------------
export async function createInvestigationAction(input: { slug: string; title: string; question: string }): Promise<DbResult<CreateInvestigationResult>> {
  // Phase 38 — entitlement enforcement (non-blocking under high Community limits).
  const gate = await canUseFeatureAction('investigation');
  if (!gate.allowed) return { ok: false, error: gate.reason ?? 'Upgrade required to create more investigations.', code: 'FORBIDDEN' };
  const result = await createInvestigationDal(input, new Date().toISOString());
  if (result.ok) revalidate(INV);
  return result;
}

export async function transitionInvestigationAction(id: string, to: InvestigationState, reason?: string): Promise<DbResult<{ from: string; to: string }>> {
  const result = await transitionInvestigationDal(id, to, new Date().toISOString(), reason);
  if (result.ok) revalidate(INV, `${INV}/${id}`, CON);
  return result;
}

export async function submitFindingAction(input: { investigationId: string; position: string; summary: string; confidence?: number; evidenceRefs?: string[] }): Promise<DbResult<{ findingId: string }>> {
  const result = await submitFindingDal(input, new Date().toISOString());
  if (result.ok) revalidate(`${INV}/${input.investigationId}`);
  return result;
}

export async function submitChallengeAction(input: { investigationId: string; targetFindingId: string; reason: string }): Promise<DbResult<{ challengeId: string }>> {
  const result = await submitChallengeDal(input, new Date().toISOString());
  if (result.ok) revalidate(`${INV}/${input.investigationId}`, '/dashboard/debates');
  return result;
}

export async function recomputeConsensusAction(investigationId: string): Promise<DbResult<{ snapshotId: string; consensusPosition: string | null }>> {
  const result = await recomputeConsensusDal(investigationId, new Date().toISOString());
  if (result.ok) revalidate(`${CON}/${investigationId}`, `${INV}/${investigationId}`, CON);
  return result;
}

export async function reviewConsensusAction(investigationId: string, decision: ConsensusDecision, reason: string): Promise<DbResult<{ decision: string; resultingState: string }>> {
  const result = await reviewConsensusDal(investigationId, decision, reason, new Date().toISOString());
  if (result.ok) revalidate(`${CON}/${investigationId}`, CON, `${INV}/${investigationId}`, INV);
  return result;
}

// ---- re-exports -------------------------------------------------------------
export type { DbResult, DbResultCode } from './persistence';
export type { CreateInvestigationResult } from './persistence';
export type {
  HsinInvestigationRecord,
  HsinFindingRecord,
  HsinChallengeRecord,
  HsinAlternativeNarrativeRecord,
  HsinEvidenceClaimRecord,
  HsinConsensusSnapshotRecord,
  HsinConsensusReviewRecord,
  HsinContributorScoreRecord,
  InvestigationsBoardData,
  InvestigationDetailData,
  InvestigationBoardRow,
  ConsensusBoardData,
  ConsensusDetailData,
  ContributorsBoardData,
  DebatesBoardData,
  CollectiveHighlights,
  InvestigationState,
  ChallengeStatus,
  ConsensusDecision,
} from '@hsi/shared-types';
