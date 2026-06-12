// =============================================================================
// @hsi/consensus-engine — public entry point (WorldForge/HSI Phase 20).
//
// Weighted CONSENSUS + DISSENT for the collective-intelligence network. Consensus
// is NOT majority vote — it blends evidence quality, contributor trust, historical
// accuracy, governance standing, and challenge/review outcomes into a weighted
// CANDIDATE position, never truth. NO Date.now()/Math.random(); `now` injected.
//
// __examples__
//   import { consensusDemo } from '@hsi/consensus-engine';
//   const out = consensusDemo();
//   console.log(out.result.consensusPosition);
// =============================================================================

export * from './types';
export * from './consensus';
export * from './fixtures';
