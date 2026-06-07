// =============================================================================
// @hsi/classifiers — public API
// Transparent, auditable rhetoric classification + a conservative 5-level risk
// model for DEFENSIVE analysis and media literacy. Never for targeting people.
//
// __examples__
//   import { classifyRhetoric, scoreRisk, analyzeText } from '@hsi/classifiers';
//   const { rhetoric, risk } = analyzeText('Join the movement, humans are a plague.');
//   rhetoric.classifications[0].slug;      // e.g. 'humanity-as-plague'
//   rhetoric.classifications[0].matchedCues; // audit trail of why
//   risk.level;                            // 3 (recruitment) — every result has safetyNotes
// =============================================================================

export * from './types';
export * from './taxonomy';
export * from './classify';
