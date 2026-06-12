// =============================================================================
// HSI Phase 20 — client-safe view helpers for the collective-intelligence
// dashboards (investigations / consensus / contributors / debates).
//
// PURE + CLIENT-SAFE: NO server-only imports. Maps the Phase-20 unions →
// color/label, formats scores, reads jsonb, and builds clearly-LABELED demo
// view-models from the @hsi/collective-intelligence + @hsi/consensus-engine
// fixtures so every page renders fully offline when an action returns
// NOT_CONFIGURED.
//
// EXPLAINABLE — consensus is a CANDIDATE not truth; every score carries its
// explanation + limitations; dissent is always shown.
// =============================================================================

import type {
  ChallengeStatus,
  CollectiveHighlights,
  ConsensusBoardData,
  ConsensusDecision,
  ConsensusDetailData,
  ContributorsBoardData,
  DebatesBoardData,
  HsinConsensusSnapshotRecord,
  InvestigationBoardRow,
  InvestigationDetailData,
  InvestigationState,
  InvestigationsBoardData,
} from '@hsi/shared-types';
import {
  buildConsensusSnapshot,
  type ConsensusSnapshot,
} from '@hsi/consensus-engine';
import {
  collectiveDemo,
  investigationProgress,
} from '@hsi/collective-intelligence';

/* decoration */
export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'cyan' | 'pink';
export interface Decorated { label: string; color: string; tone: Tone; description?: string }
const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8', blue: '#3B82F6', purple: '#8B5CF6', green: '#10B981',
  orange: '#F59E0B', red: '#EF4444', cyan: '#06B6D4', pink: '#EC4899',
};
export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}
function titleize(v: string): string {
  return v.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/* role gating */
const ROLE_RANK: Record<string, number> = { viewer: 0, contributor: 1, researcher: 2, reviewer: 3, editor: 3, curator: 4, admin: 5, owner: 6 };
function rank(role?: string | null): number {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) : -1;
}
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}
export function canReview(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.reviewer;
}
export function canCurate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* investigation state */
const STATE_DECOR: Record<InvestigationState, Decorated> = {
  DRAFT: { label: 'Draft', color: TONE_COLORS.neutral, tone: 'neutral' },
  ACTIVE: { label: 'Active', color: TONE_COLORS.blue, tone: 'blue' },
  UNDER_REVIEW: { label: 'Under review', color: TONE_COLORS.orange, tone: 'orange' },
  CONSENSUS_FORMING: { label: 'Consensus forming', color: TONE_COLORS.purple, tone: 'purple' },
  PUBLISHED: { label: 'Published', color: TONE_COLORS.green, tone: 'green' },
  ARCHIVED: { label: 'Archived', color: TONE_COLORS.neutral, tone: 'neutral' },
};
export function stateDecor(state?: InvestigationState | string | null): Decorated {
  if (!state) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return STATE_DECOR[state as InvestigationState] ?? { label: titleize(String(state)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

const CHALLENGE_DECOR: Record<ChallengeStatus, Decorated> = {
  open: { label: 'Open', color: TONE_COLORS.orange, tone: 'orange' },
  upheld: { label: 'Upheld', color: TONE_COLORS.red, tone: 'red' },
  rejected: { label: 'Rejected', color: TONE_COLORS.green, tone: 'green' },
};
export function challengeDecor(status?: ChallengeStatus | string | null): Decorated {
  if (!status) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return CHALLENGE_DECOR[status as ChallengeStatus] ?? { label: titleize(String(status)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

const DECISION_DECOR: Record<ConsensusDecision, Decorated> = {
  approved: { label: 'Approved', color: TONE_COLORS.green, tone: 'green' },
  rejected: { label: 'Rejected', color: TONE_COLORS.red, tone: 'red' },
  escalated: { label: 'Escalated', color: TONE_COLORS.orange, tone: 'orange' },
  archived: { label: 'Archived', color: TONE_COLORS.neutral, tone: 'neutral' },
};
export function decisionDecor(decision?: ConsensusDecision | string | null): Decorated {
  if (!decision) return { label: 'Pending', color: TONE_COLORS.neutral, tone: 'neutral' };
  return DECISION_DECOR[decision as ConsensusDecision] ?? { label: titleize(String(decision)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

/** Agreement-strength band. */
export function agreementBand(score?: number | null): Decorated {
  if (score == null || Number.isNaN(score)) return { label: 'No data', color: TONE_COLORS.neutral, tone: 'neutral' };
  if (score >= 0.7) return { label: 'Strong', color: TONE_COLORS.green, tone: 'green' };
  if (score >= 0.5) return { label: 'Moderate', color: TONE_COLORS.orange, tone: 'orange' };
  return { label: 'Weak / contested', color: TONE_COLORS.red, tone: 'red' };
}

/* formatters */
export function formatPct(v?: number | null, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(Math.max(0, Math.min(1, v)) * 100).toFixed(digits)}%`;
}
export function formatScore(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, v)))}`;
}
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function readStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (isRecord(value)) {
    for (const k of ['items', 'list', 'values']) {
      const inner = value[k];
      if (Array.isArray(inner)) return inner.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

/** Read the dissent positions out of a snapshot's jsonb. */
export interface DissentRow { position: string; share: number; weight: number; contributorCount: number; evidenceStrength: number; reason: string }
export function readDissent(snapshot?: HsinConsensusSnapshotRecord): DissentRow[] {
  const raw = isRecord(snapshot?.dissent_positions) ? (snapshot!.dissent_positions as Record<string, unknown>).items : snapshot?.dissent_positions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((r) => ({
      position: String(r.position ?? ''),
      share: typeof r.share === 'number' ? r.share : 0,
      weight: typeof r.weight === 'number' ? r.weight : 0,
      contributorCount: typeof r.contributorCount === 'number' ? r.contributorCount : 0,
      evidenceStrength: typeof r.evidenceStrength === 'number' ? r.evidenceStrength : 0,
      reason: String(r.reason ?? ''),
    }));
}

/** Read the per-position weights out of a snapshot's jsonb. */
export interface PositionRow { position: string; share: number; weight: number; findingCount: number; evidenceStrength: number }
export function readPositions(snapshot?: HsinConsensusSnapshotRecord): PositionRow[] {
  const raw = isRecord(snapshot?.positions) ? (snapshot!.positions as Record<string, unknown>).items : snapshot?.positions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((r) => ({
      position: String(r.position ?? ''),
      share: typeof r.share === 'number' ? r.share : 0,
      weight: typeof r.weight === 'number' ? r.weight : 0,
      findingCount: typeof r.findingCount === 'number' ? r.findingCount : 0,
      evidenceStrength: typeof r.evidenceStrength === 'number' ? r.evidenceStrength : 0,
    }));
}

/* -------------------------------------------------------------------------- */
/* DEMO builders                                                               */
/* -------------------------------------------------------------------------- */
const DEMO_NOW = '2026-06-09T12:00:00.000Z';

let _demo: ReturnType<typeof collectiveDemo> | null = null;
function bundle(): ReturnType<typeof collectiveDemo> {
  if (!_demo) _demo = collectiveDemo();
  return _demo;
}

function snapRecord(s: ConsensusSnapshot): HsinConsensusSnapshotRecord {
  return {
    id: `demo-snap`, investigation_id: s.investigationId, consensus_position: s.consensusPosition ?? undefined,
    agreement_score: s.agreementScore, evidence_strength: s.evidenceStrength, confidence: s.confidence,
    positions: { items: s.positions }, dissent_positions: { items: s.dissentPositions },
    confidence_distribution: { items: s.confidenceDistribution }, sample_count: s.sampleCount,
    contributor_count: s.contributorCount, explanation: { items: s.explanation }, limitations: { items: s.limitations },
    generated_at: s.generatedAt, created_at: s.generatedAt,
  };
}

export function demoInvestigationsBoard(): InvestigationsBoardData {
  const d = bundle();
  const rows: InvestigationBoardRow[] = [
    {
      id: d.investigation.id, slug: d.investigation.slug, title: d.investigation.title, question: d.investigation.question,
      state: d.investigation.state as InvestigationState, findingCount: d.findings.length, challengeCount: d.challenges.length,
      contributorCount: d.metrics.contributorCount, contentiousness: d.metrics.contentiousness,
      consensusPosition: d.snapshot.consensusPosition ?? undefined, agreementScore: d.snapshot.agreementScore, updatedAt: DEMO_NOW,
    },
  ];
  return { rows, byState: { ACTIVE: 1 } };
}

export function demoInvestigationDetail(): InvestigationDetailData {
  const d = bundle();
  return {
    investigation: { id: d.investigation.id, slug: d.investigation.slug, title: d.investigation.title, question: d.investigation.question, state: d.investigation.state as InvestigationState, created_at: DEMO_NOW, updated_at: DEMO_NOW },
    findings: d.findings.map((f) => ({ id: f.id, investigation_id: f.investigationId, contributor_id: f.contributorId, position: f.position, summary: f.summary, confidence: f.confidence, evidence_refs: { items: f.evidenceRefs }, endorsements: f.endorsements, created_at: DEMO_NOW })),
    challenges: d.challenges.map((c) => ({ id: c.id, investigation_id: c.investigationId, target_finding_id: c.targetFindingId, contributor_id: c.contributorId, reason: c.reason, status: c.status, created_at: DEMO_NOW })),
    alternatives: d.alternatives.map((a) => ({ id: a.id, investigation_id: a.investigationId, contributor_id: a.contributorId, title: a.title, summary: a.summary, position: a.position, created_at: DEMO_NOW })),
    evidenceClaims: [{ id: d.claim.id, investigation_id: d.claim.investigationId, contributor_id: d.claim.contributorId, claim: d.claim.claim, source_ref: d.claim.sourceRef, source_quality: d.claim.sourceQuality, support_count: d.claim.supportCount, challenge_count: d.claim.challengeCount, reviews_approved: d.claim.reviewsApproved, reviews_rejected: d.claim.reviewsRejected, strength: d.evidenceStrength.strength, created_at: DEMO_NOW }],
    snapshot: snapRecord(d.snapshot),
    metrics: d.metrics,
    progress: investigationProgress(d.investigation.state),
  };
}

export function demoConsensusBoard(): ConsensusBoardData {
  const d = bundle();
  return {
    snapshots: [snapRecord(d.snapshot)],
    reviews: [{ id: 'demo-rev', investigation_id: d.investigation.id, reviewer_id: d.review.reviewer, decision: d.review.decision, reason: d.review.reason, consensus_position: d.review.consensusPosition ?? undefined, agreement_score: d.review.agreementScore, resulting_state: d.review.resultingState, created_at: DEMO_NOW }],
  };
}

export function demoConsensusDetail(): ConsensusDetailData {
  const d = bundle();
  return {
    investigation: { id: d.investigation.id, slug: d.investigation.slug, title: d.investigation.title, question: d.investigation.question, state: d.investigation.state as InvestigationState, created_at: DEMO_NOW },
    snapshot: snapRecord(d.snapshot),
    reviews: [{ id: 'demo-rev', investigation_id: d.investigation.id, reviewer_id: d.review.reviewer, decision: d.review.decision, reason: d.review.reason, consensus_position: d.review.consensusPosition ?? undefined, agreement_score: d.review.agreementScore, resulting_state: d.review.resultingState, created_at: DEMO_NOW }],
  };
}

export function demoContributorsBoard(): ContributorsBoardData {
  const d = bundle();
  return {
    scores: d.contributors.map((c) => ({ id: `demo-${c.contributorId}`, contributor_id: c.contributorId, accuracy: c.accuracy, trust: c.trust, review_quality: c.reviewQuality, consensus_alignment: c.consensusAlignment, evidence_quality: c.evidenceQuality, overall: c.overall, explanation: { items: c.explanation }, limitations: { items: c.limitations }, computed_at: DEMO_NOW, created_at: DEMO_NOW })),
  };
}

export function demoDebatesBoard(): DebatesBoardData {
  const d = bundle();
  return {
    claims: [{ id: d.claim.id, investigation_id: d.claim.investigationId, contributor_id: d.claim.contributorId, claim: d.claim.claim, source_ref: d.claim.sourceRef, source_quality: d.claim.sourceQuality, support_count: d.claim.supportCount, challenge_count: d.claim.challengeCount, reviews_approved: d.claim.reviewsApproved, reviews_rejected: d.claim.reviewsRejected, strength: d.evidenceStrength.strength, created_at: DEMO_NOW }],
    challenges: d.challenges.map((c) => ({ id: c.id, investigation_id: c.investigationId, target_finding_id: c.targetFindingId, contributor_id: c.contributorId, reason: c.reason, status: c.status, created_at: DEMO_NOW })),
  };
}

export function demoCollectiveHighlights(): CollectiveHighlights {
  return { activeInvestigations: 1, consensusForming: 0, majorDisputes: 1, pendingGovernance: 0, highTrustContributors: 1, highImpactInvestigations: 0 };
}
