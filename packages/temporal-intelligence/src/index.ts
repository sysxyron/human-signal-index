// =============================================================================
// @hsi/temporal-intelligence — public entry point (WorldForge/HSI Phase 10).
//
// "Git history for ideas." The narrative memory/evolution engine: it snapshots
// PUBLIC narratives over time, diffs them into an explainable evolution log,
// builds a genealogy ("family tree") and a directed influence network, and
// produces PROBABILISTIC, EXPLAINABLE trajectory forecasts.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`/seed; NO Date.now()/Math.random()
//     in any logic path. Same inputs → same outputs.
//   * OFFLINE — fixtures + local heuristics; no OpenAI/Supabase. Embeddings are
//     injected, with a deterministic localLexicalEmbed fallback.
//   * ZERO runtime deps (beyond the @hsi workspace).
//   * HONEST — forecasts are distributions, never certainties; thin data widens
//     the distribution and says so. No truth is asserted; these are aids for a
//     HUMAN reviewer.
//
// __examples__
//   import { temporalDemo } from '@hsi/temporal-intelligence';
//   const out = await temporalDemo();
//   out.forecasts.forEach((f) => console.log(f.narrativeId, f.forecastType, f.probability));
// =============================================================================

export * from './types';
export * from './snapshots';
export * from './evolution';
export * from './genealogy';
export * from './influence';
export * from './forecast';
export * from './fixtures';
