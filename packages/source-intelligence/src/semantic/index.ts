// =============================================================================
// @hsi/source-intelligence — semantic layer barrel (Phase 8).
// =============================================================================

export type { SemanticClassification, SemanticDeps } from './types';
export {
  classifySignalSemantic,
  type SemanticClassifyInput,
} from './semanticClassifier';
export {
  clusterNarratives,
  CLUSTER_SIMILARITY_THRESHOLD,
  CLUSTER_COSINE_THRESHOLD,
  type ClusterSignal,
  type NarrativeCluster,
  type ClusterResult,
} from './narrativeClusterer';
