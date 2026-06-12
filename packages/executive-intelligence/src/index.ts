// =============================================================================
// @hsi/executive-intelligence — public entry point (WorldForge/HSI Phase 22).
//
// THE COMMAND LAYER. Creates no new intelligence — it OPERATES the Phase 1-21
// engines. From a UNIFIED SYSTEM STATE it ranks strategic priorities, scores
// operational risk + strategic opportunity, computes executive attention, and
// builds explainable briefs + a daily intelligence report. Every recommendation is
// advisory: autoPublish/autoApprove/autoAct/autoGovern = false. NO Date.now()/
// Math.random(); `now` injected.
//
// __examples__
//   import { executiveDemo } from '@hsi/executive-intelligence';
//   const out = executiveDemo();
//   console.log(out.snapshot.attention.level);
// =============================================================================

export * from './types';
export * from './unified';
export * from './priority';
export * from './analysis';
export * from './snapshot';
export * from './briefing';
export * from './governance';
export * from './fixtures';
