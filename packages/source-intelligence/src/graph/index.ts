// =============================================================================
// @hsi/source-intelligence — narrative/entity graph barrel (Phase 8).
// =============================================================================

export type {
  ExtractedEntity,
  NarrativeNode,
  NarrativeEdge,
  NarrativeGraph,
  SignalNarrativeLink,
} from './types';
export { extractEntities } from './entityExtractor';
export {
  buildNarrativeEdges,
  RELATED_LEXICAL_THRESHOLD,
  RELATED_COSINE_THRESHOLD,
  type EdgeSignal,
} from './edgeBuilder';
export {
  buildNarrativeGraph,
  signalToNarrativeLinks,
  type GraphSignal,
} from './narrativeGraph';
// ---- Phase 9 (additive): community / amplification / cross-source ----------
export {
  detectCommunities,
  MAX_COMMUNITY_ITERATIONS,
  type CommunityGraphInput,
  type Community,
  type CommunityResult,
} from './community';
export {
  computeAmplificationScores,
  VELOCITY_HALF_LIFE_DAYS,
  type AmplificationNarrative,
  type AmplificationSignal,
  type AmplificationEdge,
  type AmplificationInput,
  type AmplificationScore,
  type AmplificationResult,
} from './amplification';
export {
  clusterNarrativesCrossSource,
  sourceNarrativeOverlap,
  type CrossSourceSignal,
  type CrossSourceDeps,
  type CrossSourceCluster,
  type CrossSourceResult,
  type SourceOverlap,
} from './crossSource';
