// =============================================================================
// @hsi/intelligence-queue — public entry point (WorldForge/HSI Phase 18).
//
// A PURE, deterministic priority research queue for the Intelligence Operations
// Center: enqueue / dequeue / retry / cancel / prioritize over a persisted
// snapshot (so the queue survives restarts), with CRITICAL→LOW priorities and
// exponential-backoff retries. NO Date.now()/Math.random(); `now` is injected.
//
// __examples__
//   import { queueDemo } from '@hsi/intelligence-queue';
//   const out = queueDemo();
//   console.log(out.firstDequeued?.priority); // 'CRITICAL'
// =============================================================================

export * from './types';
export * from './queue';
export * from './fixtures';
