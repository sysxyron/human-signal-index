// =============================================================================
// HSI Phase 20 — small badges for investigation state / challenge status /
// consensus decision / agreement band. Pure, server-safe.
// =============================================================================

import type { ChallengeStatus, ConsensusDecision, InvestigationState } from '@hsi/shared-types';
import { agreementBand, challengeDecor, decisionDecor, stateDecor, type Decorated } from '@/lib/collective/view';

function Pill({ decor }: { decor: Decorated }) {
  return (
    <span title={decor.description} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
      style={{ color: decor.color, backgroundColor: `${decor.color}1f`, border: `1px solid ${decor.color}55` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: decor.color }} />
      {decor.label}
    </span>
  );
}

export function InvestigationStateBadge({ state }: { state?: InvestigationState | string | null }) {
  return <Pill decor={stateDecor(state)} />;
}
export function ChallengeStatusBadge({ status }: { status?: ChallengeStatus | string | null }) {
  return <Pill decor={challengeDecor(status)} />;
}
export function DecisionBadge({ decision }: { decision?: ConsensusDecision | string | null }) {
  return <Pill decor={decisionDecor(decision)} />;
}
export function AgreementBadge({ score }: { score?: number | null }) {
  return <Pill decor={agreementBand(score)} />;
}
