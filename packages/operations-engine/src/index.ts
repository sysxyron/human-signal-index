// =============================================================================
// @hsi/operations-engine — public entry point (WorldForge/HSI Phase 24).
//
// The HUMAN OPERATIONS layer: assignment, ownership, escalation, the
// investigation lifecycle, workload + capacity, and operational alerts. PURE +
// DETERMINISTIC (now injected; no Date.now()/Math.random()), OFFLINE, and
// ADVISORY — it assigns work and surfaces load but NEVER publishes, approves,
// rejects, or changes governance outcomes. No autonomous actions.
// =============================================================================

export * from './types';
export * from './lifecycle';
export * from './assignment';
export * from './escalation';
export * from './workload';
export * from './fixtures';
