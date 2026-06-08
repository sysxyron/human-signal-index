// =============================================================================
// HSIN Phase 7 — signal-intelligence engine configuration (SERVER-ONLY).
//
// The pure '@hsi/source-intelligence' engine NEVER reads process.env: it is fully
// deterministic and offline-by-default (fixtures). This module is the single place
// the WEB app resolves the engine's runtime configuration from the host env, so the
// pipeline/actions can decide whether LIVE network capture is permitted.
//
// Determinism + ethics: the DEFAULT mode is 'fixture' (offline). LIVE capture is
// only enabled when SIGNAL_CAPTURE_MODE === 'live' AND it remains bound by the
// engine's public-only capture policy (assertPublicCapturePolicy guards every
// capture). With empty env (the sandbox / `next build`) we degrade to fixture mode
// so nothing requires the network.
// =============================================================================

/** How the signal-capture pipeline runs: deterministic fixtures vs live network. */
export type SignalCaptureMode = 'fixture' | 'live';

/** Resolved engine configuration for the web app. */
export interface IntelligenceConfig {
  /** 'fixture' (offline, deterministic) or 'live' (network capture allowed). */
  captureMode: SignalCaptureMode;
  /** True only when live capture (network egress) is permitted. */
  liveCaptureAllowed: boolean;
  /**
   * Reuse of the existing evidence/AI keys (Phases 4-5) where relevant — surfaced
   * here so signal→research handoffs and any optional enrichment can see them
   * without re-reading env. Never required for the pipeline to run.
   */
  evidenceMode: 'fixture' | 'live';
  openaiKeyPresent: boolean;
}

/** Read a trimmed, non-empty env var, or undefined. */
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Resolve the intelligence config from the host env. Pure read — never throws,
 * never performs I/O, safe to call during `next build` with empty env.
 */
export function getIntelligenceConfig(): IntelligenceConfig {
  const captureMode: SignalCaptureMode =
    env('SIGNAL_CAPTURE_MODE') === 'live' ? 'live' : 'fixture';
  const evidenceMode: 'fixture' | 'live' =
    env('EVIDENCE_MODE') === 'live' ? 'live' : 'fixture';

  return {
    captureMode,
    // Live capture additionally requires the explicit live mode; the engine's
    // own capture policy still gates each capture to PUBLIC surfaces only.
    liveCaptureAllowed: captureMode === 'live',
    evidenceMode,
    openaiKeyPresent: Boolean(env('OPENAI_API_KEY')),
  };
}
