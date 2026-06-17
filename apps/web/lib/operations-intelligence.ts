// =============================================================================
// HSI Phase 47 — Mission Control operations intelligence (SERVER-ONLY, read-only).
//
// Supplies the operational rollups NOT already provided by the public-intelligence
// or source-intelligence bundles: the signal-flow PIPELINE stage counts and REVIEW
// operations. Reuses the same read client (service-role → anon → null) + caching.
// Read-only — no workflow changes. Public-safe (aggregate counts only; no reviewer
// identities, no notes).
// =============================================================================

import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPublicClient } from './public-intelligence';

export interface PipelineStage {
  stage: string;
  count: number;
  color: string;
}

export interface ReviewOps {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  backlog: number;
  /** Average review latency in hours — null when not derivable publicly. */
  avgReviewHours: number | null;
}

export interface OperationsIntel {
  pipeline: PipelineStage[];
  review: ReviewOps;
}

function emptyOps(): OperationsIntel {
  return {
    pipeline: [
      { stage: 'Signal', count: 0, color: '#3B82F6' },
      { stage: 'Evidence', count: 0, color: '#10B981' },
      { stage: 'Analysis', count: 0, color: '#8B5CF6' },
      { stage: 'Review', count: 0, color: '#F59E0B' },
      { stage: 'Publication', count: 0, color: '#06B6D4' },
    ],
    review: { pending: 0, approvedToday: 0, rejectedToday: 0, backlog: 0, avgReviewHours: null },
  };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function statusCount(c: SupabaseClient, status: string): Promise<number> {
  try {
    const { count } = await c.from('hsin_signals').select('id', { count: 'exact', head: true }).eq('status', status);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function loadOps(): Promise<OperationsIntel> {
  const c = readPublicClient();
  if (!c) return emptyOps();

  const [newC, reviewingC, needsC, approvedC, publishedC] = await Promise.all([
    statusCount(c, 'new'),
    statusCount(c, 'reviewing'),
    statusCount(c, 'needs_research'),
    statusCount(c, 'approved'),
    statusCount(c, 'published'),
  ]);

  // Review decisions today (public-safe: decision + timestamp only).
  let approvedToday = 0;
  let rejectedToday = 0;
  try {
    const { data } = await c
      .from('hsin_signal_reviews')
      .select('decision, created_at')
      .gte('created_at', startOfTodayIso())
      .limit(1000);
    for (const r of (data ?? []) as Array<{ decision: string | null }>) {
      const d = (r.decision ?? '').toUpperCase();
      if (d === 'APPROVE') approvedToday += 1;
      else if (d === 'REJECT') rejectedToday += 1;
    }
  } catch { /* ignore */ }

  const pending = newC + reviewingC + needsC;

  return {
    pipeline: [
      { stage: 'Signal', count: newC, color: '#3B82F6' },
      { stage: 'Evidence', count: needsC, color: '#10B981' },
      { stage: 'Analysis', count: reviewingC, color: '#8B5CF6' },
      { stage: 'Review', count: approvedC, color: '#F59E0B' },
      { stage: 'Publication', count: publishedC, color: '#06B6D4' },
    ],
    review: { pending, approvedToday, rejectedToday, backlog: pending, avgReviewHours: null },
  };
}

const loadOpsCached = unstable_cache(
  async (): Promise<OperationsIntel> => loadOps(),
  ['operations-intelligence:v1'],
  { revalidate: 60, tags: ['public-intelligence'] },
);

/** Cached, read-only operations rollups for Mission Control. Never throws. */
export async function getOperationsIntelligence(): Promise<OperationsIntel> {
  try {
    return await loadOpsCached();
  } catch {
    return emptyOps();
  }
}
