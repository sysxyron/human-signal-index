// =============================================================================
// WorldForge Phase 3 — shared run resolver for the [id] detail pages.
// Server-only helper (imports the server action). Resolves a run id (+ optional
// ?demo flag) into a unified ResearchRunView, special-casing the labeled Chronid
// demo so every detail page renders from ONE shape with consistent error/auth
// handling. Not a route file — underscore prefix keeps it out of the router.
// =============================================================================

import { chronidResearchDemo } from '@hsi/research-agents';
import { getResearchRunAction } from './actions';
import {
  DEMO_RUN_ID,
  bundleToView,
  demoToView,
  type DbResultCode,
  type ResearchRunView,
} from '@/lib/worldforge/research-view';

export type ResolveResult =
  | { kind: 'ok'; view: ResearchRunView }
  | { kind: 'error'; message: string; code?: DbResultCode };

/** True when the route params/query indicate the labeled demo run. */
export function isDemoRequest(
  id: string,
  searchParams?: { demo?: string },
): boolean {
  return id === DEMO_RUN_ID || searchParams?.demo === '1';
}

/**
 * Resolve a run to a view-model. The demo short-circuits to the in-memory
 * Chronid result; everything else goes through getResearchRunAction and is
 * normalised via bundleToView. Never throws — returns a tagged result.
 */
export async function resolveRunView(
  id: string,
  searchParams?: { demo?: string },
): Promise<ResolveResult> {
  if (isDemoRequest(id, searchParams)) {
    return { kind: 'ok', view: demoToView(chronidResearchDemo()) };
  }

  const res = await getResearchRunAction(id);
  if (res.ok) {
    return { kind: 'ok', view: bundleToView(res.data) };
  }
  return { kind: 'error', message: res.error, code: res.code };
}
