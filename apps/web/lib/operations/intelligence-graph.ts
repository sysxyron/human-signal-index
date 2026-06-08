// =============================================================================
// HSIN Phase 9 — graph intelligence DAL: communities / amplification /
// source-reliability persistence + recompute. SERVER-ONLY.
//
// The data-access layer for the Phase-9 shared-intelligence tables (migration
// 0013):
//   * COMMUNITIES   — hsin_graph_communities: detected clusters over the narrative
//     graph (label-propagation via '@hsi/source-intelligence' detectCommunities).
//   * AMPLIFICATION  — hsin_amplification_scores: per-narrative 0..100 amplification
//     (computeAmplificationScores over narratives + their signals/edges).
//   * RELIABILITY    — hsin_source_reliability: per-source 0..100 reliability + tier
//     (computeSourceReliability over capture/provider-run/review stats).
//
// READS are visible to any authenticated user (RLS shape B). REBUILD writes are
// gated at researcher+ (RLS backstop) — they load the relevant graph/stats,
// run the PURE deterministic engine, then upsert. Rows are REPLACED per rebuild
// (communities are deleted-then-inserted; reliability/amplification are unique per
// source/narrative and upserted by find-or-update).
//
// SERVER-ONLY (uses next/headers via lib/supabase/server.ts). Every function
// returns DbResult<T> and NEVER throws; empty env degrades to NOT_CONFIGURED.
// =============================================================================

import {
  computeAmplificationScores,
  computeSourceReliability,
  detectCommunities,
  type AmplificationEdge,
  type AmplificationNarrative,
  type AmplificationSignal,
  type CommunityGraphInput,
  type ReliabilityInput,
} from '@hsi/source-intelligence';
import type {
  AmplificationView,
  CommunitiesView,
  HsinAmplificationScoreRecord,
  HsinGraphCommunityRecord,
  HsinNarrativeRecord,
  HsinSourceReliabilityRecord,
  SourceReliabilityTier,
} from '@hsi/shared-types';
import {
  fail,
  type DbResult,
  type JsonRecord,
  operationsDbClient as db,
  requireOperationsRole as requireRole,
} from './persistence';

// -----------------------------------------------------------------------------
// Local row-shape helpers (minimal projections; keep `any` out of signatures).
// -----------------------------------------------------------------------------
interface NarrativeRow {
  id: string;
  name: string;
}
interface EdgeRow {
  source_narrative_id: string;
  target_narrative_id: string;
  edge_type: string;
  weight?: number | null;
}
interface SignalNarrativeRow {
  signal_id: string;
  narrative_id: string;
}
interface SignalRow {
  id: string;
  source_id?: string | null;
  captured_at?: string | null;
}

// =============================================================================
// COMMUNITIES — hsin_graph_communities.
// =============================================================================

/**
 * Load detected communities + the narratives they cluster (CommunitiesView). RLS:
 * any authenticated user reads (empty/anon → empty lists). NEVER throws.
 */
export async function getCommunities(): Promise<DbResult<CommunitiesView>> {
  try {
    const client = db();

    let communities: HsinGraphCommunityRecord[] = [];
    {
      const { data, error } = await client
        .from('hsin_graph_communities')
        .select('*')
        .order('size', { ascending: false });
      if (error) return fail(error);
      communities = (data ?? []) as HsinGraphCommunityRecord[];
    }

    let narratives: HsinNarrativeRecord[] = [];
    {
      const { data } = await client
        .from('hsin_narratives')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      narratives = (data ?? []) as HsinNarrativeRecord[];
    }

    return { ok: true, data: { communities, narratives } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Rebuild graph communities (researcher+). Loads hsin_narratives +
 * hsin_narrative_edges, runs detectCommunities (deterministic label propagation),
 * REPLACES the hsin_graph_communities rows (delete-then-insert), and returns a
 * count. Singleton communities (size 1) are skipped — a lone narrative is not a
 * cluster. NEVER throws.
 */
export async function rebuildCommunities(): Promise<
  DbResult<{ communities: number }>
> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();

    const { data: narrativeRows, error: nerr } = await client
      .from('hsin_narratives')
      .select('id, name')
      .limit(2000);
    if (nerr) return fail(nerr);
    const narratives = (narrativeRows ?? []) as NarrativeRow[];
    if (narratives.length === 0) {
      return { ok: true, data: { communities: 0 } };
    }

    const narrativeIds = narratives.map((n) => n.id);
    const { data: edgeRows } = await client
      .from('hsin_narrative_edges')
      .select('source_narrative_id, target_narrative_id, edge_type, weight')
      .in('source_narrative_id', narrativeIds)
      .limit(5000);
    const edges = (edgeRows ?? []) as EdgeRow[];

    const input: CommunityGraphInput = {
      nodes: narratives.map((n) => ({ id: n.id, label: n.name })),
      edges: edges.map((e) => ({
        source: e.source_narrative_id,
        target: e.target_narrative_id,
        weight: typeof e.weight === 'number' ? e.weight : undefined,
      })),
    };
    const { communities } = detectCommunities(input);

    // Replace the previous run's communities (idempotent recompute).
    await client
      .from('hsin_graph_communities')
      .delete()
      .not('id', 'is', null)
      .then(() => undefined, () => undefined);

    let written = 0;
    for (const c of communities) {
      if (c.size < 2) continue; // skip singletons
      const metrics: JsonRecord = { representative: c.memberIds[0] };
      const { error } = await client.from('hsin_graph_communities').insert({
        label: c.label,
        algorithm: 'label-propagation',
        member_narrative_ids: c.memberIds,
        size: c.size,
        metrics_json: metrics,
        computed_at: now,
      });
      if (!error) written += 1;
    }

    return { ok: true, data: { communities: written } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// AMPLIFICATION — hsin_amplification_scores.
// =============================================================================

/**
 * Load per-narrative amplification scores + the narratives they score
 * (AmplificationView). RLS: any authenticated user reads. NEVER throws.
 */
export async function getAmplification(): Promise<DbResult<AmplificationView>> {
  try {
    const client = db();

    let scores: HsinAmplificationScoreRecord[] = [];
    {
      const { data, error } = await client
        .from('hsin_amplification_scores')
        .select('*')
        .order('amplification', { ascending: false });
      if (error) return fail(error);
      scores = (data ?? []) as HsinAmplificationScoreRecord[];
    }

    let narratives: HsinNarrativeRecord[] = [];
    {
      const { data } = await client
        .from('hsin_narratives')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      narratives = (data ?? []) as HsinNarrativeRecord[];
    }

    return { ok: true, data: { scores, narratives } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Rebuild narrative amplification (researcher+). Loads narratives, their
 * signal<->narrative links (→ each narrative's signalIds), the linked signals
 * (sourceId + capturedAt drive breadth/velocity), and amplifies-edges, then runs
 * computeAmplificationScores and UPSERTS hsin_amplification_scores (unique per
 * narrative_id). NEVER throws.
 */
export async function rebuildAmplification(): Promise<
  DbResult<{ scored: number }>
> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();

    const { data: narrativeRows, error: nerr } = await client
      .from('hsin_narratives')
      .select('id, name')
      .limit(2000);
    if (nerr) return fail(nerr);
    const narratives = (narrativeRows ?? []) as NarrativeRow[];
    if (narratives.length === 0) return { ok: true, data: { scored: 0 } };

    const narrativeIds = narratives.map((n) => n.id);

    const { data: linkRows } = await client
      .from('hsin_signal_narratives')
      .select('signal_id, narrative_id')
      .in('narrative_id', narrativeIds)
      .limit(20000);
    const links = (linkRows ?? []) as SignalNarrativeRow[];

    const signalIdsByNarrative = new Map<string, string[]>();
    const allSignalIds = new Set<string>();
    for (const l of links) {
      const arr = signalIdsByNarrative.get(l.narrative_id) ?? [];
      arr.push(l.signal_id);
      signalIdsByNarrative.set(l.narrative_id, arr);
      allSignalIds.add(l.signal_id);
    }

    // Load the linked signals (source breadth + recency for velocity).
    const signals: AmplificationSignal[] = [];
    const signalIdList = Array.from(allSignalIds);
    if (signalIdList.length > 0) {
      const { data: signalRows } = await client
        .from('hsin_signals')
        .select('id, source_id, captured_at')
        .in('id', signalIdList)
        .limit(20000);
      for (const s of (signalRows ?? []) as SignalRow[]) {
        signals.push({
          id: s.id,
          sourceId: s.source_id ?? undefined,
          capturedAt: s.captured_at ?? undefined,
        });
      }
    }

    // amplifies-edges between the visible narratives.
    const { data: edgeRows } = await client
      .from('hsin_narrative_edges')
      .select('source_narrative_id, target_narrative_id, edge_type, weight')
      .in('source_narrative_id', narrativeIds)
      .limit(5000);
    const edges: AmplificationEdge[] = ((edgeRows ?? []) as EdgeRow[]).map((e) => ({
      source: e.source_narrative_id,
      target: e.target_narrative_id,
      edgeType: e.edge_type,
      weight: typeof e.weight === 'number' ? e.weight : undefined,
    }));

    const ampNarratives: AmplificationNarrative[] = narratives.map((n) => ({
      id: n.id,
      label: n.name,
      signalIds: signalIdsByNarrative.get(n.id) ?? [],
    }));

    const { scores } = computeAmplificationScores(
      { narratives: ampNarratives, signals, edges },
      now,
    );

    let scored = 0;
    for (const s of scores) {
      const patch: JsonRecord = {
        amplification: s.amplification,
        source_count: s.sourceCount,
        signal_count: s.signalCount,
        velocity: s.velocity,
        rationale: s.rationale,
        computed_at: now,
      };
      const { data: existing } = await client
        .from('hsin_amplification_scores')
        .select('id')
        .eq('narrative_id', s.narrativeId)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await client
          .from('hsin_amplification_scores')
          .update(patch)
          .eq('id', existing.id as string);
        if (!error) scored += 1;
      } else {
        const { error } = await client
          .from('hsin_amplification_scores')
          .insert({ narrative_id: s.narrativeId, ...patch });
        if (!error) scored += 1;
      }
    }

    return { ok: true, data: { scored } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// SOURCE RELIABILITY — hsin_source_reliability.
// =============================================================================

/**
 * Read per-source reliability profiles (optionally one source). RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getSourceReliability(
  sourceId?: string,
): Promise<DbResult<HsinSourceReliabilityRecord[]>> {
  try {
    let query = db().from('hsin_source_reliability').select('*');
    if (sourceId) query = query.eq('source_id', sourceId);
    const { data, error } = await query.order('reliability_score', {
      ascending: false,
    });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinSourceReliabilityRecord[] };
  } catch (e) {
    return fail(e);
  }
}

interface SourceRow {
  id: string;
  created_at?: string | null;
}

/** Map the engine ReliabilityTier to the DB tier union (identical sets). */
function asTier(tier: string): SourceReliabilityTier {
  return tier === 'high' || tier === 'medium' || tier === 'low'
    ? tier
    : 'unproven';
}

/**
 * Rebuild per-source reliability (researcher+). For each source, derives:
 *   * captureSuccessRate — successful provider-runs / total provider-runs (falls
 *     back to hsin_capture_jobs success/total when no provider runs exist);
 *   * blockedRate         — provider-runs with reason='blocked' / total;
 *   * signalCount         — captured signals from the source;
 *   * reviewedApprovedRate — approved signals / reviewed (approved+rejected);
 *   * ageDays             — source longevity from created_at;
 * runs computeSourceReliability, and UPSERTS hsin_source_reliability (unique per
 * source_id). NEVER throws.
 */
export async function rebuildReliability(): Promise<DbResult<{ scored: number }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();
    const nowMs = Date.parse(now);

    const { data: sourceRows, error: serr } = await client
      .from('hsin_sources')
      .select('id, created_at')
      .limit(2000);
    if (serr) return fail(serr);
    const sources = (sourceRows ?? []) as SourceRow[];
    if (sources.length === 0) return { ok: true, data: { scored: 0 } };

    let scored = 0;
    for (const src of sources) {
      // Provider-run stats (preferred): total / ok / blocked.
      let total = 0;
      let okCount = 0;
      let blockedCount = 0;
      {
        const { data: runs } = await client
          .from('hsin_provider_runs')
          .select('ok, reason')
          .eq('source_id', src.id)
          .limit(5000);
        for (const r of (runs ?? []) as Array<{
          ok?: boolean | null;
          reason?: string | null;
        }>) {
          total += 1;
          if (r.ok) okCount += 1;
          if (r.reason === 'blocked') blockedCount += 1;
        }
      }

      // Fallback to hsin_capture_jobs when no provider runs were recorded.
      if (total === 0) {
        const { data: jobs } = await client
          .from('hsin_capture_jobs')
          .select('status')
          .eq('source_id', src.id)
          .limit(5000);
        for (const j of (jobs ?? []) as Array<{ status?: string }>) {
          total += 1;
          if (j.status === 'success') okCount += 1;
          if (j.status === 'failed') blockedCount += 0; // failures aren't 'blocked'
        }
      }

      const captureSuccessRate = total > 0 ? okCount / total : 0;
      const blockedRate = total > 0 ? blockedCount / total : 0;

      // Signal volume + downstream review approval rate.
      let signalCount = 0;
      let approved = 0;
      let rejected = 0;
      {
        const { data: signalRows } = await client
          .from('hsin_signals')
          .select('status')
          .eq('source_id', src.id)
          .limit(20000);
        for (const s of (signalRows ?? []) as Array<{ status?: string }>) {
          signalCount += 1;
          if (s.status === 'approved' || s.status === 'published') approved += 1;
          else if (s.status === 'rejected') rejected += 1;
        }
      }
      const reviewed = approved + rejected;

      const ageDays = src.created_at
        ? Math.max(0, (nowMs - Date.parse(src.created_at)) / 86_400_000)
        : 0;

      const input: ReliabilityInput = {
        sourceId: src.id,
        captureSuccessRate,
        blockedRate,
        signalCount,
        ageDays,
      };
      if (reviewed > 0) input.reviewedApprovedRate = approved / reviewed;

      const result = computeSourceReliability(input);

      const patch: JsonRecord = {
        reliability_score: result.reliabilityScore,
        tier: asTier(result.tier),
        capture_success_rate: captureSuccessRate,
        blocked_rate: blockedRate,
        approved_rate: reviewed > 0 ? approved / reviewed : null,
        contradiction_rate: 0,
        signal_count: signalCount,
        rationale: result.rationale,
        computed_at: now,
      };

      const { data: existing } = await client
        .from('hsin_source_reliability')
        .select('id')
        .eq('source_id', src.id)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await client
          .from('hsin_source_reliability')
          .update(patch)
          .eq('id', existing.id as string);
        if (!error) scored += 1;
      } else {
        const { error } = await client
          .from('hsin_source_reliability')
          .insert({ source_id: src.id, ...patch });
        if (!error) scored += 1;
      }
    }

    return { ok: true, data: { scored } };
  } catch (e) {
    return fail(e);
  }
}
