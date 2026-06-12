// =============================================================================
// @hsi/forecast-engine — public entry point (WorldForge/HSI Phase 21).
//
// FORWARD-LOOKING intelligence: generate forecasts (hypotheses) from signals,
// score confidence + reliability, detect failures against invalidation criteria,
// and track accuracy / calibration / Brier. NO prediction is truth — every
// forecast exposes its assumptions, evidence, invalidation criteria, and
// limitations. NO Date.now()/Math.random(); `now` injected.
//
// __examples__
//   import { forecastDemo } from '@hsi/forecast-engine';
//   const out = forecastDemo();
//   console.log(out.forecast.confidence);
// =============================================================================

export * from './types';
export * from './forecast';
export * from './reliability';
export * from './fixtures';
