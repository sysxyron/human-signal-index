// =============================================================================
// @hsi/beta-engine — public entry point (HSI Phase 32).
//
// The OPERATIONAL BETA layer: cohorts, tester status lifecycle, automatic mission
// assignment + queues, progress, NPS, cohort analytics + report windows, and
// recognition badges. PURE + DETERMINISTIC (no DB, no UI, no Date.now()).
// GOVERNED: testers self-serve; privileged role advancement still requires
// admin-approved applications — this engine NEVER grants a role.
// =============================================================================

export * from './types';
export * from './cohorts';
export * from './missions';
export * from './analytics';
export * from './badges';
export * from './fixtures';
