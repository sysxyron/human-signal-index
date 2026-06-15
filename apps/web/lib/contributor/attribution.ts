'use server';

// =============================================================================
// HSI Phase 29 — outcome attribution DAL. READ-ONLY. Reads the worker-computed
// outcome_events / attribution_ledger / entity_impact / impact_history for the
// Outcome Explorer, contributor outcome profile, investigation attribution, and
// admin outcome monitoring. Impact is recognition/measurement only — it never
// changes RBAC. Offline → deterministic demo from @hsi/outcome-attribution.
// =============================================================================

import { demoOutcomes, type DemoOutcomeRow } from '@hsi/outcome-attribution';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { requireAdmin, supabaseConfigured, adminFail, type DbResult } from '@/lib/admin/guard';
import { contributorConfigured, type ContribResult } from './options';

export interface OutcomeRow { id: string; outcomeType: string; entityKind: string; entityId: string; impactWeight: number; reason: string | null; at: string }
export interface TeamImpactRow { teamKey: string; impact: number }
export interface OutcomeExplorer { outcomes: OutcomeRow[]; topContributors: Array<{ id: string; impact: number; outcomes: number }>; teamImpact: TeamImpactRow[] }

function demoExplorer(): OutcomeExplorer {
  return {
    outcomes: demoOutcomes.map((o: DemoOutcomeRow) => ({ id: o.id, outcomeType: o.type, entityKind: 'investigation', entityId: o.id, impactWeight: o.impact / 100, reason: o.title, at: o.at })),
    topContributors: [{ id: 'u1', impact: 86, outcomes: 12 }, { id: 'u2', impact: 78, outcomes: 9 }],
    teamImpact: [{ teamKey: 'research', impact: 82 }, { teamKey: 'governance', impact: 74 }, { teamKey: 'curation', impact: 68 }],
  };
}

/** Outcome Explorer (Deliverable 15) — recent outcomes + top contributors + team impact. */
export async function getOutcomeExplorerAction(outcomeType?: string): Promise<ContribResult<OutcomeExplorer>> {
  if (!contributorConfigured()) return { ok: true, demo: true, data: demoExplorer() };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'researcher')) return { ok: false, code: 'FORBIDDEN' };

    let q = db.from('outcome_events').select('id, outcome_type, entity_kind, entity_id, impact_weight, reason, created_at').order('created_at', { ascending: false }).limit(100);
    if (outcomeType && outcomeType !== 'all') q = q.eq('outcome_type', outcomeType);
    const [{ data: outs }, { data: contribs }, { data: teams }] = await Promise.all([
      q,
      db.from('entity_impact').select('entity_id, impact_score, outcomes_count').eq('entity_kind', 'contributor').order('impact_score', { ascending: false }).limit(20),
      db.from('entity_impact').select('team_key, impact_score').not('team_key', 'is', null).order('impact_score', { ascending: false }).limit(50),
    ]);
    const outcomes: OutcomeRow[] = (outs ?? []).map((r) => { const rec = r as Record<string, unknown>; return { id: String(rec.id), outcomeType: String(rec.outcome_type), entityKind: String(rec.entity_kind), entityId: String(rec.entity_id), impactWeight: Number(rec.impact_weight ?? 0), reason: (rec.reason as string) ?? null, at: String(rec.created_at) }; });
    const topContributors = (contribs ?? []).map((r) => { const rec = r as Record<string, unknown>; return { id: String(rec.entity_id), impact: Number(rec.impact_score ?? 0), outcomes: Number(rec.outcomes_count ?? 0) }; });
    // Aggregate team impact (avg per team_key).
    const teamAgg = new Map<string, { sum: number; n: number }>();
    for (const r of (teams ?? []) as Array<{ team_key: string; impact_score: number }>) { const e = teamAgg.get(r.team_key) ?? { sum: 0, n: 0 }; e.sum += Number(r.impact_score ?? 0); e.n++; teamAgg.set(r.team_key, e); }
    const teamImpact = [...teamAgg.entries()].map(([teamKey, e]) => ({ teamKey, impact: Math.round(e.sum / e.n) })).sort((a, b) => b.impact - a.impact);
    return { ok: true, data: { outcomes, topContributors, teamImpact } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

export interface MyOutcomeProfile { totalOutcomes: number; verifiedFindings: number; governanceActions: number; impactScore: number; topInvestigation: { id: string; impact: number } | null; topPublication: { id: string; impact: number } | null }

/** Contributor outcome profile (Deliverable 13). */
export async function getMyOutcomeProfileAction(): Promise<ContribResult<MyOutcomeProfile>> {
  if (!contributorConfigured()) {
    return { ok: true, demo: true, data: { totalOutcomes: 12, verifiedFindings: 6, governanceActions: 4, impactScore: 86, topInvestigation: { id: 'demo-1', impact: 82 }, topPublication: { id: 'demo-pub', impact: 74 } } };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data: mine } = await db.from('entity_impact').select('impact_score, verified_findings, governance_actions, outcomes_count').eq('entity_kind', 'contributor').eq('entity_id', user.id).maybeSingle();
    const m = (mine ?? {}) as Record<string, number>;
    // Highest-impact investigation/publication the user acted on (best-effort via outcome_events).
    const { data: acted } = await db.from('outcome_events').select('entity_kind, entity_id, impact_weight').eq('actor_id', user.id).order('impact_weight', { ascending: false }).limit(50);
    const rows = (acted ?? []) as Array<{ entity_kind: string; entity_id: string; impact_weight: number }>;
    const topInv = rows.find((r) => r.entity_kind === 'investigation');
    const topPub = rows.find((r) => r.entity_kind === 'publication');
    return { ok: true, data: {
      totalOutcomes: Number(m.outcomes_count ?? 0), verifiedFindings: Number(m.verified_findings ?? 0),
      governanceActions: Number(m.governance_actions ?? 0), impactScore: Number(m.impact_score ?? 0),
      topInvestigation: topInv ? { id: topInv.entity_id, impact: Math.round(topInv.impact_weight * 100) } : null,
      topPublication: topPub ? { id: topPub.entity_id, impact: Math.round(topPub.impact_weight * 100) } : null,
    } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

export interface InvestigationAttribution { impactScore: number; linkedSignals: string[]; linkedPublications: string[]; linkedOutcomes: Array<{ type: string; at: string }> }

/** Investigation attribution (Deliverable 16). */
export async function getInvestigationAttributionAction(id: string): Promise<ContribResult<InvestigationAttribution>> {
  if (!contributorConfigured()) {
    return { ok: true, demo: true, data: { impactScore: 78, linkedSignals: ['s1', 's2'], linkedPublications: ['p1'], linkedOutcomes: [{ type: 'VERIFIED_FINDING', at: '2026-06-12T10:00:00Z' }] } };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'researcher')) return { ok: false, code: 'FORBIDDEN' };
    const [{ data: imp }, { data: inSig }, { data: outPub }, { data: outc }] = await Promise.all([
      db.from('entity_impact').select('impact_score').eq('entity_kind', 'investigation').eq('entity_id', id).maybeSingle(),
      db.from('attribution_ledger').select('origin_id').eq('destination_kind', 'investigation').eq('destination_id', id).eq('relationship', 'signal_to_investigation'),
      db.from('attribution_ledger').select('destination_id').eq('origin_kind', 'investigation').eq('origin_id', id).eq('relationship', 'investigation_to_publication'),
      db.from('outcome_events').select('outcome_type, created_at').eq('entity_kind', 'investigation').eq('entity_id', id).order('created_at', { ascending: false }),
    ]);
    return { ok: true, data: {
      impactScore: Number((imp as { impact_score?: number } | null)?.impact_score ?? 0),
      linkedSignals: ((inSig ?? []) as Array<{ origin_id: string }>).map((r) => r.origin_id),
      linkedPublications: ((outPub ?? []) as Array<{ destination_id: string }>).map((r) => r.destination_id),
      linkedOutcomes: ((outc ?? []) as Array<{ outcome_type: string; created_at: string }>).map((r) => ({ type: r.outcome_type, at: r.created_at })),
    } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

export interface OutcomeMonitoring {
  topOutcomes: OutcomeRow[];
  largestChanges: Array<{ entityKind: string; entityId: string; previous: number | null; next: number | null; at: string }>;
  teamRankings: TeamImpactRow[];
}

const DEMO_MONITORING: OutcomeMonitoring = {
  topOutcomes: demoOutcomes.map((o) => ({ id: o.id, outcomeType: o.type, entityKind: 'investigation', entityId: o.id, impactWeight: o.impact / 100, reason: o.title, at: o.at })),
  largestChanges: [{ entityKind: 'contributor', entityId: 'u7', previous: 40, next: 72, at: '2026-06-13T10:00:00Z' }],
  teamRankings: [{ teamKey: 'research', impact: 82 }, { teamKey: 'governance', impact: 74 }],
};

/** ADMIN: outcome monitoring (Deliverable 18). Read-only. */
export async function getOutcomeMonitoringAction(): Promise<DbResult<OutcomeMonitoring> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, data: DEMO_MONITORING, demo: true };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const [{ data: tops }, { data: hist }, { data: teams }] = await Promise.all([
      db.from('outcome_events').select('id, outcome_type, entity_kind, entity_id, impact_weight, reason, created_at').order('impact_weight', { ascending: false }).limit(20),
      db.from('impact_history').select('entity_kind, entity_id, previous_score, new_score, created_at').order('created_at', { ascending: false }).limit(200),
      db.from('entity_impact').select('team_key, impact_score').not('team_key', 'is', null).order('impact_score', { ascending: false }).limit(50),
    ]);
    const topOutcomes: OutcomeRow[] = (tops ?? []).map((r) => { const rec = r as Record<string, unknown>; return { id: String(rec.id), outcomeType: String(rec.outcome_type), entityKind: String(rec.entity_kind), entityId: String(rec.entity_id), impactWeight: Number(rec.impact_weight ?? 0), reason: (rec.reason as string) ?? null, at: String(rec.created_at) }; });
    const largestChanges = ((hist ?? []) as Array<Record<string, unknown>>)
      .map((r) => ({ entityKind: String(r.entity_kind), entityId: String(r.entity_id), previous: (r.previous_score as number) ?? null, next: (r.new_score as number) ?? null, at: String(r.created_at), delta: Math.abs(Number(r.new_score ?? 0) - Number(r.previous_score ?? r.new_score ?? 0)) }))
      .sort((a, b) => b.delta - a.delta).slice(0, 20)
      .map(({ delta, ...rest }) => rest);
    const teamAgg = new Map<string, { sum: number; n: number }>();
    for (const r of (teams ?? []) as Array<{ team_key: string; impact_score: number }>) { const e = teamAgg.get(r.team_key) ?? { sum: 0, n: 0 }; e.sum += Number(r.impact_score ?? 0); e.n++; teamAgg.set(r.team_key, e); }
    const teamRankings = [...teamAgg.entries()].map(([teamKey, e]) => ({ teamKey, impact: Math.round(e.sum / e.n) })).sort((a, b) => b.impact - a.impact);
    return { ok: true, data: { topOutcomes, largestChanges, teamRankings } };
  } catch (e) {
    return adminFail(e);
  }
}
