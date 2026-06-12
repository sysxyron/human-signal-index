// =============================================================================
// @hsi/research-orchestrator — public entry point (WorldForge/HSI Phase 18).
//
// The Intelligence Operations Center engine: a research-run STATE MACHINE, AGENT
// COORDINATION, automated opportunity DISCOVERY, an ESCALATION engine, WORKFLOW
// TEMPLATES, and platform HEALTH monitoring. It COORDINATES the Phase 1-17 engines
// — it is NOT AGI, it never auto-publishes, never auto-acts, and routes every
// opportunity / escalation / override through a human.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every transition/assignment/escalation carries its
//     reason. NO silent failures; nothing is auto-published.
//
// __examples__
//   import { orchestratorDemo } from '@hsi/research-orchestrator';
//   const out = orchestratorDemo();
//   console.log(out.run.state); // 'COMPLETE'
// =============================================================================

export * from './types';
export * from './states';
export * from './agents';
export * from './discovery';
export * from './escalation';
export * from './templates';
export * from './health';
export * from './fixtures';
