// =============================================================================
// @hsi/classifiers — types
// Transparent, explainable rhetoric classification + risk scoring for DEFENSIVE
// analysis and media-literacy work. NOT for targeting individuals.
// =============================================================================

/** Severity hint for a rhetoric category (orientation, not a verdict). */
export type SeverityHint = 'context' | 'low' | 'medium' | 'high' | 'severe';

/** A structured rhetoric category in the HSI taxonomy. */
export interface RhetoricCategory {
  slug: string;
  label: string;
  description: string;
  /** Lexicon cues — phrases/words that, in context, indicate this category. */
  exampleCues: string[];
  severityHint: SeverityHint;
}

/** A matched cue with where it was found. */
export interface MatchedCue {
  cue: string;
  /** Character index of the first match in the analyzed text. */
  index: number;
  /** The surrounding snippet (for auditability). */
  snippet: string;
}

/** One ranked classification result for a category. */
export interface RhetoricClassification {
  slug: string;
  label: string;
  severityHint: SeverityHint;
  /** 0..1 confidence derived from cue density + distinct cue coverage. */
  confidence: number;
  matchedCues: MatchedCue[];
}

/** Output of classifyRhetoric. */
export interface RhetoricResult {
  classifications: RhetoricClassification[];
  /** True if no category cleared the noise floor. */
  inconclusive: boolean;
}

/** 1-5 risk level (mirrors shared-types RiskLevelValue). */
export type RiskLevelValue = 1 | 2 | 3 | 4 | 5;

/** Recommended downstream action for a risk level. */
export type RecommendedAction =
  | 'monitor_context'
  | 'log_for_media_literacy'
  | 'review_recruitment_activity'
  | 'escalate_safeguarding'
  | 'urgent_human_review';

/** Output of scoreRisk. */
export interface RiskAssessment {
  level: RiskLevelValue;
  /** Verbatim quote from the analyzed text that drove the level (audit trail). */
  matchedQuote: string;
  explanation: string;
  /** 0..1 confidence in the assessed level. */
  confidence: number;
  recommendedAction: RecommendedAction;
  /** Mandatory safety framing surfaced with every assessment. */
  safetyNotes: string[];
}
