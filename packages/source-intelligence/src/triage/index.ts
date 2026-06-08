// =============================================================================
// @hsi/source-intelligence — triage barrel (Phase 8).
// =============================================================================

export type {
  TriageCondition,
  TriageAction,
  TriageRule,
  TriageContext,
  TriageOutcome,
} from './types';
export { evaluateTriage, DEFAULT_TRIAGE_RULES } from './engine';
