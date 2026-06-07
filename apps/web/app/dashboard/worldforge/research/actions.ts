'use server';

// =============================================================================
// WorldForge Phase 3 — Research server actions.
// Thin, serializable wrappers around the SERVER-ONLY research data-access layer
// (lib/worldforge/research-persistence.ts) so client components can trigger
// Supabase persistence. Every action accepts/returns only plain JSON — no class
// instances or engine objects cross the boundary. Actions NEVER throw: they pass
// the DAL's DbResult straight through. Mutations revalidate the affected route(s).
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  createResearchRun,
  listResearchRuns,
  getResearchRun,
  generateWorldFromBlueprint,
  type DbResult,
} from '@/lib/worldforge/research-persistence';
import type {
  ResearchRunRecord,
  ResearchRunBundle,
} from '@hsi/shared-types';

const WF_BASE = '/dashboard/worldforge';
const RESEARCH_BASE = `${WF_BASE}/research`;

// Re-export the result + record types so the UI can import them from here.
export type { DbResult } from '@/lib/worldforge/research-persistence';
export type {
  ResearchRunRecord,
  ResearchAgentOutputRecord,
  ResearchConsensusReportRecord,
  ResearchCitationRecord,
  ResearchDisputeRecord,
  ResearchRunBundle,
  ResearchAgentDomain,
  ResearchRunStatus,
  ProvenanceSource,
} from '@hsi/shared-types';

/**
 * Run the multi-agent research engine on a concept and persist the full run
 * (run + agent outputs + consensus + disputes + citations). Revalidates the
 * research list so the new run appears immediately.
 */
export async function createResearchRunAction(
  conceptText: string,
  title?: string,
): Promise<DbResult<{ runId: string }>> {
  const res = await createResearchRun(conceptText, title);
  if (res.ok) {
    revalidatePath(RESEARCH_BASE);
  }
  return res;
}

/** List research runs visible to the caller (own + public), newest first. */
export async function listResearchRunsAction(): Promise<
  DbResult<ResearchRunRecord[]>
> {
  return listResearchRuns();
}

/** Load one research run plus all of its persisted child rows. */
export async function getResearchRunAction(
  id: string,
): Promise<DbResult<ResearchRunBundle>> {
  return getResearchRun(id);
}

/**
 * Generate a persisted WorldForge world from a run's blueprint, then link the
 * run to it. Revalidates the worlds/simulations lists and this run's detail page.
 */
export async function generateWorldFromBlueprintAction(
  runId: string,
): Promise<DbResult<{ worldId: string }>> {
  const res = await generateWorldFromBlueprint(runId);
  if (res.ok) {
    revalidatePath(WF_BASE);
    revalidatePath(`${WF_BASE}/simulations`);
    revalidatePath(`${RESEARCH_BASE}/${runId}`);
    revalidatePath(RESEARCH_BASE);
  }
  return res;
}
