// =============================================================================
// HSI Phase 65 — Narrative engine orchestrator (SERVER-ONLY).
//
// createNarrative(): seed → deterministically cluster over the Phase 64 graph →
// persist members + metrics + snapshot → emit Phase 62 notifications.
// recomputeNarrative(): re-cluster, snapshot, detect growth/decline/fragmentation
// alerts vs the prior snapshot, update status, notify admins. Consumes Phase 63
// source-monitoring state (failing member sources lower health). NEVER throws.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSubgraphDal, getNodeDal, createNodeDal } from '@/lib/evidence-graph/persistence';
import { clusterFromSubgraph, composeMembers } from './clustering';
import { computeNarrativeHealth, statusFromMetrics, detectNarrativeAlerts } from './health';
import * as dal from './persistence';
import type { NarrativeSnapshot, NarrativeStatus, NarrativeAlertType } from './types';

const CLUSTER_DEPTH = 2;
const CLUSTER_MAX = 150;
const BAD_SOURCE_STATES = new Set(['FAILED', 'BLOCKED', 'STALE', 'UNREACHABLE']);

const ALERT_LABEL: Record<NarrativeAlertType, string> = {
  NARRATIVE_EMERGING: 'Narrative emerging', NARRATIVE_GROWING: 'Narrative growing',
  NARRATIVE_DOMINANT: 'Narrative dominant', NARRATIVE_DECLINING: 'Narrative declining', NARRATIVE_FRAGMENTING: 'Narrative fragmenting',
};

export interface NarrativeRunSummary { narrativeId: string; members: number; status: NarrativeStatus; alerts: number; notificationsSent: number }

/** Count member sources currently in a bad monitoring state (Phase 63). */
async function countFailingSources(writer: SupabaseClient, sourceEntityIds: string[]): Promise<number> {
  if (sourceEntityIds.length === 0) return 0;
  try {
    const { data } = await writer.from('source_monitoring_state').select('source_id, state').in('source_id', sourceEntityIds).limit(5000);
    return ((data ?? []) as Array<{ state: string }>).filter((r) => BAD_SOURCE_STATES.has(r.state)).length;
  } catch { return 0; }
}

async function clusterAndScore(writer: SupabaseClient, seedNodeId: string) {
  const sg = await getSubgraphDal(writer, seedNodeId, CLUSTER_DEPTH, CLUSTER_MAX);
  const members = clusterFromSubgraph({ seedId: seedNodeId, nodes: sg.nodes, edges: sg.edges, maxDepth: CLUSTER_DEPTH, maxMembers: CLUSTER_MAX });
  const composition = composeMembers(members);
  const entityById = new Map(sg.nodes.map((nNode) => [nNode.id, nNode.entityId]));
  const sourceEntityIds = members.filter((m) => m.memberType === 'SOURCE').map((m) => entityById.get(m.nodeId)).filter((x): x is string => !!x);
  const failingSources = await countFailingSources(writer, sourceEntityIds);
  const health = computeNarrativeHealth(composition, failingSources);
  const snapshot: NarrativeSnapshot = {
    memberCount: composition.total, signalCount: composition.signals, evidenceCount: composition.evidence,
    sourceCount: composition.sources, actorCount: composition.actors,
    contradictionRatio: health.contradictionRatio, stabilityScore: health.stabilityScore, snapshotAt: new Date().toISOString(),
  };
  return { members, composition, health, snapshot };
}

async function emitAlerts(writer: SupabaseClient, narrativeId: string, name: string, actorId: string | null, alerts: ReturnType<typeof detectNarrativeAlerts>): Promise<number> {
  if (alerts.length === 0) return 0;
  const recipients = await dal.listAdminUserIds(writer);
  const targets = recipients.length ? recipients : (actorId ? [actorId] : []);
  let sent = 0;
  for (const a of alerts) {
    const alertId = await dal.insertAlertDal(writer, narrativeId, a);
    let firstNotif: string | null = null;
    for (const recipient of targets) {
      const id = await dal.emitNotification(writer, recipient, actorId, {
        severity: a.severity, title: `${ALERT_LABEL[a.alertType]}: ${name}`, body: a.reason,
        metadata: { narrativeId, alertType: a.alertType, ...a.evidence },
      });
      if (id) { sent += 1; if (!firstNotif) firstNotif = id; }
    }
    if (alertId && firstNotif) await dal.linkAlertNotification(writer, alertId, firstNotif);
  }
  return sent;
}

/** Create a narrative from a seed graph node + cluster it deterministically. */
export async function createNarrative(writer: SupabaseClient, actorId: string, input: { name: string; summary?: string; seedNodeId: string }): Promise<dal.DbResult<NarrativeRunSummary>> {
  const seed = await getNodeDal(writer, input.seedNodeId);
  if (!seed) return { ok: false, error: 'Seed graph node not found — pick a node from the Evidence Graph.', code: 'DB_ERROR' };

  const slug = dal.slugify(input.name);
  const created = await dal.insertNarrative(writer, { name: input.name, slug, summary: input.summary ?? null, seedNodeId: input.seedNodeId }, actorId);
  if (!created.ok) return created;
  const narrativeId = created.data.id;

  // Register the narrative in the evidence graph (Phase 64) + back-link.
  const graphNode = await createNodeDal(writer, { nodeType: 'NARRATIVE', entityId: narrativeId, label: input.name }, actorId);
  if (graphNode.ok) { try { await writer.from('narratives').update({ graph_node_id: graphNode.data.id }).eq('id', narrativeId); } catch { /* best-effort */ } }

  const { members, health, snapshot } = await clusterAndScore(writer, input.seedNodeId);
  await dal.replaceMembers(writer, narrativeId, members);

  const status = statusFromMetrics(null, snapshot, health.stabilityScore);
  await dal.setStatus(writer, narrativeId, status);
  await dal.insertSnapshot(writer, narrativeId, snapshot);
  await dal.insertMetrics(writer, narrativeId, snapshot.memberCount, health);
  await dal.insertEvent(writer, narrativeId, 'created', `Seeded from ${seed.nodeType} "${seed.label}" — ${members.length} members.`, members.length);

  const alerts = detectNarrativeAlerts({ prev: null, cur: snapshot, prevStatus: null, status });
  const notificationsSent = await emitAlerts(writer, narrativeId, input.name, actorId, alerts);

  return { ok: true, data: { narrativeId, members: members.length, status, alerts: alerts.length, notificationsSent } };
}

/** Recompute a narrative's cluster + health, snapshot, and detect alerts. */
export async function recomputeNarrative(writer: SupabaseClient, actorId: string | null, narrativeId: string): Promise<dal.DbResult<NarrativeRunSummary>> {
  const narrative = await dal.getNarrativeDal(writer, narrativeId);
  if (!narrative) return { ok: false, error: 'Narrative not found.', code: 'DB_ERROR' };
  if (!narrative.seedNodeId) return { ok: false, error: 'Narrative has no seed node to recompute from.', code: 'DB_ERROR' };

  const prev = (await dal.getSnapshotsDal(writer, narrativeId, 1))[0] ?? null;
  const { members, health, snapshot } = await clusterAndScore(writer, narrative.seedNodeId);
  await dal.replaceMembers(writer, narrativeId, members);

  const status = statusFromMetrics(prev, snapshot, health.stabilityScore);
  await dal.setStatus(writer, narrativeId, status);
  await dal.insertSnapshot(writer, narrativeId, snapshot);
  await dal.insertMetrics(writer, narrativeId, snapshot.memberCount, health);
  if (status !== narrative.status) await dal.insertEvent(writer, narrativeId, 'status_changed', `Status ${narrative.status} → ${status}.`);
  await dal.insertEvent(writer, narrativeId, 'recomputed', `${members.length} members; stability ${health.stabilityScore}.`, members.length);

  const alerts = detectNarrativeAlerts({ prev, cur: snapshot, prevStatus: narrative.status, status });
  const notificationsSent = await emitAlerts(writer, narrativeId, narrative.name, actorId, alerts);

  return { ok: true, data: { narrativeId, members: members.length, status, alerts: alerts.length, notificationsSent } };
}
