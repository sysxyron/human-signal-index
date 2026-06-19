'use server';

// =============================================================================
// HSI Phase 63 — Source Monitoring server actions. Admin-gated (reusing the IAM
// requireAdmin guard) + audited. The run prefers the service-role client (full
// admin-recipient fan-out) and falls back to the admin RLS client. Returns
// DbResult; never throws. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, getServiceClient, recordSecurityAudit } from '@/lib/admin/guard';
import { runSourceMonitoring, type MonitoringRunSummary } from './engine';
import type { DbResult } from './persistence';

const ROUTE = '/dashboard/source-monitoring';
function rev(): void { try { revalidatePath(ROUTE); } catch { /* best-effort */ } }

/** Run the monitoring evaluation now (admin). Persists state/alerts + notifies. */
export async function runSourceMonitoringAction(): Promise<DbResult<MonitoringRunSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const service = await getServiceClient();
    const writer = service ?? gate.ctx.db;
    const summary = await runSourceMonitoring(writer, { notify: true, actorId: gate.ctx.user.id });
    await recordSecurityAudit(gate.ctx.db, {
      actorId: gate.ctx.user.id,
      eventType: 'SOURCE_MONITORING_RUN',
      message: `Source monitoring run: ${summary.alerts} alert(s), ${summary.notificationsSent} notification(s)${summary.coldStart ? ' (cold-start baseline)' : ''}.`,
      metadata: { ...summary },
    });
    rev();
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Monitoring run failed.', code: 'DB_ERROR' };
  }
}

/** Acknowledge an alert (admin). */
export async function acknowledgeAlertAction(id: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { error } = await gate.ctx.db.from('source_monitoring_alerts')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: gate.ctx.user.id }).eq('id', id);
    if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };
    rev();
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.', code: 'DB_ERROR' };
  }
}
