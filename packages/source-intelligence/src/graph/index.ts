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
