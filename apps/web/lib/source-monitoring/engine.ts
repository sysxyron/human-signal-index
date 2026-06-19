// =============================================================================
// HSI Phase 63 — Monitoring engine orchestrator (SERVER-ONLY).
//
// runSourceMonitoring(): the one I/O entry point. It (1) consumes the Phase 61
// reliability snapshot, (2) classifies every source, (3) persists current state +
// transition events + the alert feed, and (4) emits notifications to admins via
// the Phase 62 framework. It performs NO fetching and never touches ingestion.
//
// `writer` is a privileged client: the admin RLS client (server action) or the
// service-role client (cron). Cold start (no prior state) persists a baseline and
// suppresses the notification flood — subsequent runs notify on transitions only.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSourceReliability } from '@/lib/source-reliability';
import { notificationTypeForKind, type AlertKind } from './types';
import { toSignal, classifyAll, generateMonitoringAlerts } from './classify';
import * as dal from './persistence';

const KIND_LABEL: Record<AlertKind, string> = {
  SOURCE_FAILED: 'Source failed',
  SOURCE_RECOVERED: 'Source recovered',
  SOURCE_BLOCKED: 'Source blocked',
  SOURCE_STALE: 'Source stale',
  SOURCE_DEGRADED: 'Source degraded',
  COLLECTION_GAP: 'Collection gap',
  RELIABILITY_DROP: 'Reliability drop',
};

export interface MonitoringRunSummary {
  evaluated: number;
  transitions: number;
  alerts: number;
  notificationsSent: number;
  suppressed: number;
  coldStart: boolean;
  runAt: string;
}

export interface RunOptions { notify?: boolean; actorId?: string | null }

/** Evaluate all sources, persist monitoring state/events/alerts, notify admins. */
export async function runSourceMonitoring(writer: SupabaseClient, opts: RunOptions = {}): Promise<MonitoringRunSummary> {
  const nowIso = new Date().toISOString();
  const notify = opts.notify ?? true;
  const actorId = opts.actorId ?? null;

  const rel = await getSourceReliability();
  const signals = rel.sources.map(toSignal);
  const priors = await dal.readPriorStates(writer);
  const coldStart = priors.size === 0;

  const classifications = classifyAll(signals, priors, nowIso);
  const alerts = generateMonitoringAlerts(signals, priors, nowIso);
  const alertBySource = new Map(alerts.map((a) => [a.sourceId, a]));

  // --- persist state + transition events ---
  let transitions = 0;
  for (const s of signals) {
    const cls = classifications.get(s.id);
    if (!cls) continue;
    const prior = priors.get(s.id) ?? null;
    await dal.upsertState(writer, {
      sourceId: s.id, sourceName: s.name, sourceType: s.type, cls,
      prevScore: prior?.score ?? null, daysStale: s.lastSuccessAgeDays, nowIso,
    });
    const fired = alertBySource.get(s.id);
    const stateChanged = (prior?.state ?? null) !== cls.state;
    if (stateChanged || fired) {
      transitions += 1;
      await dal.insertEvent(writer, {
        sourceId: s.id, sourceName: s.name, fromState: prior?.state ?? null, toState: cls.state,
        kind: fired?.kind ?? 'classified', reason: cls.reason, score: cls.score, evidence: cls.evidence,
      });
    }
  }

  // --- persist alerts + notify ---
  const recipients = notify && !coldStart ? await resolveRecipients(writer, actorId) : [];
  let notificationsSent = 0;
  let suppressed = 0;

  for (const a of alerts) {
    const alertId = await dal.insertAlert(writer, a);
    if (coldStart || !notify || recipients.length === 0) continue;

    const type = notificationTypeForKind(a.kind);
    const title = `${KIND_LABEL[a.kind]}: ${a.sourceName}`;
    let firstNotificationId: string | null = null;
    for (const recipient of recipients) {
      const res = await dal.emitNotification(writer, recipient, actorId, {
        type, severity: a.severity, title, body: a.reason,
        link: '/dashboard/source-monitoring', entityId: a.sourceId,
        metadata: { alertKind: a.kind, state: a.state, sourceType: a.sourceType, scoreBefore: a.scoreBefore, scoreAfter: a.scoreAfter },
      });
      if (res.suppressed) suppressed += 1;
      else if (res.id) { notificationsSent += 1; if (!firstNotificationId) firstNotificationId = res.id; }
    }
    if (alertId && firstNotificationId) await dal.linkAlertNotification(writer, alertId, firstNotificationId);
  }

  return { evaluated: signals.length, transitions, alerts: alerts.length, notificationsSent, suppressed, coldStart, runAt: nowIso };
}

async function resolveRecipients(writer: SupabaseClient, actorId: string | null): Promise<string[]> {
  const admins = await dal.listAdminUserIds(writer);
  if (admins.length > 0) return admins;
  return actorId ? [actorId] : [];
}
