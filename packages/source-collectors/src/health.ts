// =============================================================================
// Source health — PURE. Derives a health STATE + a clear human reason from the
// last capture outcome, so the UI never silently shows "zero signals". Replaces
// guesswork with explicit, actionable status (Deliverable L).
// =============================================================================

import { supportsAutomatedCapture } from './routing';
import type { CollectorSourceType, SourceHealthState } from './types';

export interface HealthInput {
  sourceType: CollectorSourceType;
  disabled?: boolean; // monitoring turned off
  configured?: boolean; // has a valid capture URL / required config
  fetchOk?: boolean; // last fetch succeeded
  blocked?: boolean; // fetch blocked (403 / robots / login wall)
  contentChanged?: boolean; // capture produced new content
  consecutiveFailures?: number;
}

export interface SourceHealth {
  state: SourceHealthState;
  reason: string;
}

/** Derive a source's health state + reason. PURE, deterministic. */
export function deriveHealth(input: HealthInput): SourceHealth {
  if (input.disabled) return { state: 'disabled', reason: 'Monitoring is disabled for this source.' };
  if (!supportsAutomatedCapture(input.sourceType)) {
    return { state: 'unsupported', reason: `The "${input.sourceType}" source type has no automated capture yet — add items manually or via its endpoint.` };
  }
  if (input.configured === false) {
    return { state: 'needs_configuration', reason: 'Missing required configuration (e.g. a valid feed or page URL).' };
  }
  if (input.blocked) return { state: 'failing', reason: 'Fetch was blocked (the site refused automated access or requires a login).' };
  if (input.fetchOk === false) {
    const n = input.consecutiveFailures ?? 1;
    return { state: n >= 3 ? 'failing' : 'warning', reason: `Last fetch failed${n > 1 ? ` (${n} in a row)` : ''} — the URL may be invalid or temporarily unreachable.` };
  }
  if (input.contentChanged === false) {
    return { state: 'healthy', reason: 'Capture succeeded — no content change since the last check.' };
  }
  return { state: 'healthy', reason: 'Capture succeeded.' };
}

/** A short, user-facing message for a health state. PURE. */
export function healthMessage(state: SourceHealthState): string {
  switch (state) {
    case 'healthy': return 'Capturing normally.';
    case 'warning': return 'Recent capture issue — monitoring continues.';
    case 'failing': return 'Repeated capture failures — needs attention.';
    case 'disabled': return 'Monitoring is turned off.';
    case 'unsupported': return 'This source type is not auto-captured yet.';
    case 'needs_configuration': return 'Configuration required before capture can run.';
    default: return 'Unknown status.';
  }
}
