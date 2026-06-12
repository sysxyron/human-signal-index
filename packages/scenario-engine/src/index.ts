// =============================================================================
// @hsi/scenario-engine — public entry point (WorldForge/HSI Phase 21).
//
// SCENARIO PLANNING + EARLY WARNING. Scenarios are competing future hypotheses —
// scored, ranked, compared, and assembled into a branching tree. The early-warning
// layer raises INFO / WATCH / WARNING / CRITICAL alerts for emerging patterns,
// signal acceleration, trust collapse, narrative shift, consensus instability, and
// forecast risk. Alerts ONLY — never auto-acts. NO Date.now()/Math.random().
//
// __examples__
//   import { scenarioDemo } from '@hsi/scenario-engine';
//   const out = scenarioDemo();
//   console.log(out.comparison.leading);
// =============================================================================

export * from './types';
export * from './scenario';
export * from './warning';
export * from './fixtures';
