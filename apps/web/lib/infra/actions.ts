'use server';

// =============================================================================
// HSI Phase 70.1 — Infrastructure server actions. Admin-only, audited. Record
// backups / restore-tests / deployments and run uptime checks. Each records an
// infra_event + a security audit. Return DbResult; never throw. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, getServiceClient, recordSecurityAudit } from '@/lib/admin/guard';
import * as dal from './persistence';
import type { DbResult } from './persistence';
import { runUptimeCheck, type UptimeRunSummary } from './uptime';

const ROUTE = '/dashboard/infrastructure';
function rev(): void { try { revalidatePath(ROUTE); } catch { /* best-effort */ } }

export async function recordBackupAction(input: { status?: string; kind?: string; sizeBytes?: number | null; note?: string }): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await dal.recordBackupDal(gate.ctx.db, input, gate.ctx.user.id);
  if (r.ok) {
    await dal.recordInfraEventDal(gate.ctx.db, { category: 'backup', eventType: 'backup_recorded', severity: input.status === 'failed' ? 'error' : 'info', detail: `Backup recorded (${input.kind ?? 'full'}, ${input.status ?? 'success'}).`, actorId: gate.ctx.user.id });
    await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'INFRA_BACKUP_RECORDED', message: `Backup recorded: ${input.status ?? 'success'}.`, metadata: { ...input } });
    rev();
  }
  return r;
}

export async function markRestoreTestedAction(id: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await dal.markRestoreTestedDal(gate.ctx.db, id);
  if (r.ok) {
    await dal.recordInfraEventDal(gate.ctx.db, { category: 'restore', eventType: 'restore_tested', severity: 'info', detail: `Restore test verified for backup ${id}.`, actorId: gate.ctx.user.id });
    await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'INFRA_RESTORE_TESTED', message: `Restore test verified: ${id}.`, metadata: { id } });
    rev();
  }
  return r;
}

export async function recordDeploymentAction(input: { version?: string; commitSha?: string; environment?: string; status?: string; note?: string }): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const filled = {
    version: input.version ?? process.env.npm_package_version ?? process.env.HSI_VERSION ?? '1.0.0',
    commitSha: input.commitSha ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local',
    environment: input.environment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'production',
    status: input.status ?? 'success', note: input.note,
  };
  const r = await dal.recordDeploymentDal(gate.ctx.db, filled, gate.ctx.user.id);
  if (r.ok) {
    await dal.recordInfraEventDal(gate.ctx.db, { category: 'deployment', eventType: 'deployment_recorded', severity: filled.status === 'failed' ? 'error' : 'info', detail: `Deployment ${filled.version} (${filled.commitSha.slice(0, 12)}) → ${filled.environment}.`, actorId: gate.ctx.user.id });
    await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'INFRA_DEPLOYMENT_RECORDED', message: `Deployment recorded: ${filled.version}.`, metadata: { ...filled } });
    rev();
  }
  return r;
}

export async function runUptimeCheckAction(): Promise<DbResult<UptimeRunSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const writer = (await getServiceClient()) ?? gate.ctx.db;
    const summary = await runUptimeCheck(writer);
    await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'INFRA_UPTIME_CHECK', message: `Uptime check: ${summary.checked} subsystems, ${summary.down} down.`, metadata: { ...summary } });
    rev();
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Uptime check failed.', code: 'DB_ERROR' };
  }
}
