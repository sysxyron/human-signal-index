// =============================================================================
// HSI Phase 68 — Transparency Portal: public payload shapes (PURE types, no I/O).
//
// Everything here is PUBLIC-SAFE by construction: aggregate counts, published/
// resolved intelligence outputs, and reliability metrics — never PII, reviewer
// identities, internal notes, unpublished content, private evidence, or alerts.
// =============================================================================

export interface TransparencyOverview {
  totalSignals: number;
  totalEvidence: number;
  totalNarratives: number;
  totalForecasts: number;
  totalForecastOutcomes: number;
  sourceCoverage: number;     // distinct categories with active sources
  sourceHealthPct: number;    // % of sources healthy
  totalSources: number;
  activeSources: number;
  publicationVolume: number;  // PUBLISHED reports
  correctionVolume: number;   // retractions on record
}

export interface PublicForecast {
  id: string;
  title: string;
  predictionType: string;
  status: string;
  confidence: number | null;
  outcome: string | null;
  result: string | null;
  resolutionDate: string | null;
  hasNarrative: boolean;
  hasGraphNode: boolean;
  source: string | null;
}

export interface ForecastTrendPoint { at: string; accuracy: number; calibration: number; volume: number }
export interface CalibrationBand { bucket: string; predictedConfidence: number; actualAccuracy: number; count: number }

export interface ForecastTransparency {
  active: number;
  resolved: number;
  correct: number;
  incorrect: number;
  expired: number;
  accuracy: number;
  calibrationScore: number;
  resolutionRate: number;
  calibration: CalibrationBand[];
  accuracyTrend: ForecastTrendPoint[];
  resolutionTimeline: PublicForecast[]; // recently resolved
  activeForecasts: PublicForecast[];
}

export interface PublicNarrative {
  id: string;
  name: string;
  status: string;
  sourceDiversity: number | null;
  evidenceDensity: number | null;
  contradictionRatio: number | null;
  stabilityScore: number | null;
}

export interface NarrativeTransparency {
  byStatus: Record<string, number>;
  emerging: PublicNarrative[];
  growing: PublicNarrative[];   // active
  dominant: PublicNarrative[];
  fragmenting: PublicNarrative[];
  declining: PublicNarrative[];
}

export interface PublicSource {
  name: string;
  type: string;
  status: string;
  score: number;
  successPct: number;
  consecutiveFailures: number;
  lastSuccessLabel: string;
}

export interface SourceTransparency {
  total: number;
  active: number;
  healthy: number;
  warning: number;
  failed: number;
  blocked: number;
  stale: number;
  collectionSuccessPct: number;
  failureCount: number;
  mostReliable: { name: string; score: number }[];
  mostFragile: { name: string; score: number }[];
  reliabilityDistribution: { tier: string; count: number }[];
  sources: PublicSource[];
}

export interface PublicCorrection {
  id: string;
  publicationTitle: string;
  fromState: string | null;
  toState: string;
  reason: string | null;
  at: string;
  kind: 'retraction' | 'revision';
}

export interface CorrectionTransparency {
  retractions: number;
  revisions: number;
  entries: PublicCorrection[];
}
