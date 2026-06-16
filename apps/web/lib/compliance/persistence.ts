// =============================================================================
// HSI Phase 41 — Compliance DAL (SERVER-ONLY). Admin-only + audited.
//
// Every read AND write is gated by requireAdmin() (the canonical role resolver)
// and every write is audited to security_audit_events. Uses the cookie-backed,
// RLS-enforced admin client (admin policies in 0045 authorize the rows). The
// service-role client is used ONLY, server-side, best-effort, to read
// auth.users.last_sign_in_at for the access review — never imported to the client.
//
// HARD SCOPE: reads user_roles / organization_members / users for the access
// review but NEVER writes them. No RBAC/auth/billing/Stripe/source changes.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminFail,
  getServiceClient,
  notConfigured,
  recordSecurityAudit,
  requireAdmin,
  supabaseConfigured,
  type DbResult,
} from '@/lib/admin/guard';
import { highestRole } from '@/lib/auth/get-session-role';
import { getCurrentOrganizationId } from '@/lib/org/operations';
import { buildAccessReview, summarizeAccessReview } from './access-review';
import {
  buildExport,
  isExportType,
  type ExportResult,
  type ExportType,
} from './export';
import { scoreFrameworks, overallReadiness, type FrameworkReadiness } from './readiness';
import { isValidIncidentTransition, isValidPolicyTransition, isValidRiskTransition } from './lifecycle';
import {
  CONTROL_SEEDS,
  FRAMEWORK_SEEDS,
  POLICY_SEEDS,
  RETENTION_SEEDS,
  VENDOR_SEEDS,
} from './seeds';
import type {
  AccessReviewRow,
  ComplianceControl,
  ComplianceEvidence,
  ComplianceFramework,
  ComplianceIncident,
  CompliancePolicy,
  ComplianceRetentionPolicy,
  ComplianceRisk,
  ComplianceVendor,
  EvidenceStatus,
  EvidenceType,
  IncidentStatus,
  PolicyStatus,
  ReadinessStatus,
  RiskSeverity,
  RiskStatus,
  VendorReviewStatus,
} from './types';

type Json = Record<string, unknown>;

/** Generic admin-gated list read. */
async function listTable<T>(
  table: string,
  order: { column: string; ascending: boolean } = { column: 'created_at', ascending: false },
): Promise<DbResult<T[]>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { data, error } = await gate.ctx.db
      .from(table)
      .select('*')
      .order(order.column, { ascending: order.ascending })
      .limit(2000);
    if (error) return adminFail(error);
    return { ok: true, data: (data ?? []) as T[] };
  } catch (e) {
    return adminFail(e);
  }
}

// -----------------------------------------------------------------------------
// Reads.
// -----------------------------------------------------------------------------

export const listFrameworks = () => listTable<ComplianceFramework>('compliance_frameworks', { column: 'key', ascending: true });
export const listControls = () => listTable<ComplianceControl>('compliance_controls', { column: 'category', ascending: true });
export const listEvidence = () => listTable<ComplianceEvidence>('compliance_evidence');
export const listRisks = () => listTable<ComplianceRisk>('compliance_risk_register');
export const listPolicies = () => listTable<CompliancePolicy>('compliance_policy_documents', { column: 'name', ascending: true });
export const listIncidents = () => listTable<ComplianceIncident>('compliance_incidents');
export const listVendors = () => listTable<ComplianceVendor>('compliance_vendors', { column: 'name', ascending: true });
export const listRetention = () => listTable<ComplianceRetentionPolicy>('compliance_retention_policies', { column: 'data_type', ascending: true });

export interface ComplianceOverview {
  frameworks: ComplianceFramework[];
  controls: ComplianceControl[];
  readiness: Record<string, FrameworkReadiness>;
  overall: ReturnType<typeof overallReadiness>;
  counts: {
    openRisks: number;
    openIncidents: number;
    activePolicies: number;
    draftPolicies: number;
    flaggedVendors: number;
    evidence: number;
    retentionPlanned: number;
  };
}

/** The control-center aggregate (Deliverable A). Admin-only. */
export async function getComplianceOverview(): Promise<DbResult<ComplianceOverview>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const db = gate.ctx.db;

    const [fw, ctrl, risks, incidents, policies, vendors, evidence, retention] = await Promise.all([
      db.from('compliance_frameworks').select('*').order('key', { ascending: true }),
      db.from('compliance_controls').select('*').order('category', { ascending: true }),
      db.from('compliance_risk_register').select('status'),
      db.from('compliance_incidents').select('status'),
      db.from('compliance_policy_documents').select('status'),
      db.from('compliance_vendors').select('review_status'),
      db.from('compliance_evidence').select('id'),
      db.from('compliance_retention_policies').select('status'),
    ]);

    const frameworks = (fw.data ?? []) as ComplianceFramework[];
    const controls = (ctrl.data ?? []) as ComplianceControl[];
    const readiness = scoreFrameworks(frameworks.map((f) => f.key), controls);

    const riskRows = (risks.data ?? []) as Array<{ status: string }>;
    const incidentRows = (incidents.data ?? []) as Array<{ status: string }>;
    const policyRows = (policies.data ?? []) as Array<{ status: string }>;
    const vendorRows = (vendors.data ?? []) as Array<{ review_status: string }>;
    const retentionRows = (retention.data ?? []) as Array<{ status: string }>;

    return {
      ok: true,
      data: {
        frameworks,
        controls,
        readiness,
        overall: overallReadiness(controls),
        counts: {
          openRisks: riskRows.filter((r) => r.status === 'open' || r.status === 'mitigating').length,
          openIncidents: incidentRows.filter((r) => r.status === 'investigating' || r.status === 'contained').length,
          activePolicies: policyRows.filter((r) => r.status === 'active').length,
          draftPolicies: policyRows.filter((r) => r.status === 'draft').length,
          flaggedVendors: vendorRows.filter((r) => r.review_status === 'flagged' || r.review_status === 'pending').length,
          evidence: (evidence.data ?? []).length,
          retentionPlanned: retentionRows.filter((r) => r.status === 'planned').length,
        },
      },
    };
  } catch (e) {
    return adminFail(e);
  }
}

// -----------------------------------------------------------------------------
// Access review (Deliverable I). Reads users/roles/orgs; never writes them.
// -----------------------------------------------------------------------------

export interface AccessReviewReport {
  rows: AccessReviewRow[];
  summary: ReturnType<typeof summarizeAccessReview>;
  hasLoginData: boolean;
}

export async function getAccessReview(): Promise<DbResult<AccessReviewReport>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const db = gate.ctx.db;

    const safe = async (table: string, sel: string): Promise<Json[]> => {
      try {
        const { data } = await db.from(table).select(sel).limit(10000);
        return (data ?? []) as unknown as Json[];
      } catch {
        return [];
      }
    };

    const [users, userRoles, members, orgs] = await Promise.all([
      safe('users', 'id, email, created_at'),
      safe('user_roles', 'user_id, roles(name)'),
      safe('organization_members', 'user_id, organization_id'),
      safe('organizations', 'id, name'),
    ]);

    const rolesByUser = new Map<string, string[]>();
    for (const ur of userRoles) {
      const uid = String(ur.user_id ?? '');
      const rel = ur.roles as { name?: unknown } | Array<{ name?: unknown }> | null;
      const name = Array.isArray(rel) ? (rel[0] as { name?: unknown })?.name : rel?.name;
      if (uid && typeof name === 'string') rolesByUser.set(uid, [...(rolesByUser.get(uid) ?? []), name.toLowerCase()]);
    }
    const orgNameById = new Map<string, string>();
    for (const o of orgs) orgNameById.set(String(o.id ?? ''), String(o.name ?? ''));
    const orgsByUser = new Map<string, string[]>();
    for (const m of members) {
      const uid = String(m.user_id ?? '');
      const name = orgNameById.get(String(m.organization_id ?? ''));
      if (uid && name) orgsByUser.set(uid, [...(orgsByUser.get(uid) ?? []), name]);
    }

    // Best-effort last-login via the service client (server-only).
    const loginMap = new Map<string, string | null>();
    const svc = await getServiceClient();
    if (svc) {
      try {
        const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
        for (const u of data?.users ?? []) loginMap.set(u.id, (u.last_sign_in_at as string | undefined) ?? null);
      } catch { /* best-effort */ }
    }

    const now = new Date().toISOString();
    const rows = buildAccessReview(
      users.map((u) => {
        const id = String(u.id ?? '');
        return {
          user_id: id,
          email: u.email ? String(u.email) : undefined,
          role: highestRole(rolesByUser.get(id) ?? []) ?? undefined,
          organizations: orgsByUser.get(id) ?? [],
          lastLoginAt: loginMap.get(id) ?? undefined,
        };
      }),
      now,
    );

    return { ok: true, data: { rows, summary: summarizeAccessReview(rows), hasLoginData: loginMap.size > 0 } };
  } catch (e) {
    return adminFail(e);
  }
}

// -----------------------------------------------------------------------------
// Write helpers (admin-gated + audited).
// -----------------------------------------------------------------------------

async function auditedInsert<T>(
  table: string,
  row: Json,
  eventType: string,
  message: string,
): Promise<DbResult<T>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const db = gate.ctx.db;
    const orgId = await getCurrentOrganizationId().catch(() => null);
    const payload: Json = { ...row };
    if (!('created_by' in payload)) payload.created_by = gate.ctx.user.id;
    if (!('organization_id' in payload) && orgId) payload.organization_id = orgId;
    const { data, error } = await db.from(table).insert(payload).select('*').single();
    if (error) return adminFail(error);
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType, message, metadata: { table, id: (data as Json)?.id } });
    return { ok: true, data: data as T };
  } catch (e) {
    return adminFail(e);
  }
}

async function auditedUpdate<T>(
  table: string,
  id: string,
  patch: Json,
  eventType: string,
  message: string,
): Promise<DbResult<T>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const db = gate.ctx.db;
    const { data, error } = await db.from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) return adminFail(error);
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType, message, metadata: { table, id, patch } });
    return { ok: true, data: data as T };
  } catch (e) {
    return adminFail(e);
  }
}

/** Read one row's current status (for transition validation). */
async function currentStatus(db: SupabaseClient, table: string, id: string): Promise<string | null> {
  try {
    const { data } = await db.from(table).select('status').eq('id', id).maybeSingle();
    return (data?.status as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Risks.
// -----------------------------------------------------------------------------

export interface CreateRiskInput {
  title: string;
  description?: string;
  severity: RiskSeverity;
  owner?: string;
  mitigation?: string;
  reviewDate?: string;
}

export function createRisk(input: CreateRiskInput): Promise<DbResult<ComplianceRisk>> {
  if (!input.title?.trim()) return Promise.resolve({ ok: false, error: 'A risk title is required.', code: 'DB_ERROR' });
  return auditedInsert<ComplianceRisk>(
    'compliance_risk_register',
    {
      title: input.title.trim(),
      description: input.description ?? null,
      severity: input.severity,
      status: 'open',
      owner: input.owner ?? null,
      mitigation: input.mitigation ?? null,
      review_date: input.reviewDate || null,
    },
    'compliance.risk.created',
    `Risk created: ${input.title}`,
  );
}

export async function setRiskStatus(id: string, status: RiskStatus): Promise<DbResult<ComplianceRisk>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const from = (await currentStatus(gate.ctx.db, 'compliance_risk_register', id)) as RiskStatus | null;
  if (from && !isValidRiskTransition(from, status)) {
    return { ok: false, error: `Invalid risk transition ${from} → ${status}.`, code: 'DB_ERROR' };
  }
  return auditedUpdate<ComplianceRisk>('compliance_risk_register', id, { status }, 'compliance.risk.status', `Risk ${id} → ${status}`);
}

// -----------------------------------------------------------------------------
// Incidents.
// -----------------------------------------------------------------------------

export interface CreateIncidentInput {
  title: string;
  severity: RiskSeverity;
  affectedSystem?: string;
  detectedAt?: string;
  owner?: string;
  notes?: string;
}

export function createIncident(input: CreateIncidentInput): Promise<DbResult<ComplianceIncident>> {
  if (!input.title?.trim()) return Promise.resolve({ ok: false, error: 'An incident title is required.', code: 'DB_ERROR' });
  return auditedInsert<ComplianceIncident>(
    'compliance_incidents',
    {
      title: input.title.trim(),
      severity: input.severity,
      status: 'investigating',
      affected_system: input.affectedSystem ?? null,
      detected_at: input.detectedAt || new Date().toISOString(),
      owner: input.owner ?? null,
      notes: input.notes ?? null,
    },
    'compliance.incident.created',
    `Incident opened: ${input.title}`,
  );
}

export async function setIncidentStatus(id: string, status: IncidentStatus): Promise<DbResult<ComplianceIncident>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const from = (await currentStatus(gate.ctx.db, 'compliance_incidents', id)) as IncidentStatus | null;
  if (from && !isValidIncidentTransition(from, status)) {
    return { ok: false, error: `Invalid incident transition ${from} → ${status}.`, code: 'DB_ERROR' };
  }
  const patch: Json = { status };
  if (status === 'resolved') patch.resolved_at = new Date().toISOString();
  return auditedUpdate<ComplianceIncident>('compliance_incidents', id, patch, 'compliance.incident.status', `Incident ${id} → ${status}`);
}

// -----------------------------------------------------------------------------
// Evidence (Deliverable E).
// -----------------------------------------------------------------------------

export interface CreateEvidenceInput {
  title: string;
  evidenceType: EvidenceType;
  controlId?: string;
  referenceUrl?: string;
  notes?: string;
}

export function createEvidence(input: CreateEvidenceInput): Promise<DbResult<ComplianceEvidence>> {
  if (!input.title?.trim()) return Promise.resolve({ ok: false, error: 'An evidence title is required.', code: 'DB_ERROR' });
  return auditedInsert<ComplianceEvidence>(
    'compliance_evidence',
    {
      title: input.title.trim(),
      evidence_type: input.evidenceType,
      control_id: input.controlId || null,
      reference_url: input.referenceUrl ?? null,
      notes: input.notes ?? null,
      status: 'collected',
    },
    'compliance.evidence.created',
    `Evidence added: ${input.title}`,
  );
}

export function setEvidenceStatus(id: string, status: EvidenceStatus): Promise<DbResult<ComplianceEvidence>> {
  return auditedUpdate<ComplianceEvidence>('compliance_evidence', id, { status }, 'compliance.evidence.status', `Evidence ${id} → ${status}`);
}

export function attachEvidenceToControl(id: string, controlId: string | null): Promise<DbResult<ComplianceEvidence>> {
  return auditedUpdate<ComplianceEvidence>('compliance_evidence', id, { control_id: controlId }, 'compliance.evidence.attach', `Evidence ${id} linked to control ${controlId ?? 'none'}`);
}

// -----------------------------------------------------------------------------
// Policies (Deliverable G).
// -----------------------------------------------------------------------------

export async function setPolicyStatus(id: string, status: PolicyStatus): Promise<DbResult<CompliancePolicy>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const from = (await currentStatus(gate.ctx.db, 'compliance_policy_documents', id)) as PolicyStatus | null;
  if (from && !isValidPolicyTransition(from, status)) {
    return { ok: false, error: `Invalid policy transition ${from} → ${status}.`, code: 'DB_ERROR' };
  }
  const patch: Json = { status };
  if (status === 'active') patch.reviewed_at = new Date().toISOString();
  return auditedUpdate<CompliancePolicy>('compliance_policy_documents', id, patch, 'compliance.policy.status', `Policy ${id} → ${status}`);
}

export function updatePolicy(id: string, patch: { owner?: string; summary?: string; contentUrl?: string }): Promise<DbResult<CompliancePolicy>> {
  const p: Json = {};
  if (patch.owner !== undefined) p.owner = patch.owner;
  if (patch.summary !== undefined) p.summary = patch.summary;
  if (patch.contentUrl !== undefined) p.content_url = patch.contentUrl;
  return auditedUpdate<CompliancePolicy>('compliance_policy_documents', id, p, 'compliance.policy.update', `Policy ${id} updated`);
}

// -----------------------------------------------------------------------------
// Vendors (Deliverable K).
// -----------------------------------------------------------------------------

export function setVendorReview(id: string, reviewStatus: VendorReviewStatus, notes?: string): Promise<DbResult<ComplianceVendor>> {
  const patch: Json = { review_status: reviewStatus, reviewed_at: new Date().toISOString() };
  if (notes !== undefined) patch.notes = notes;
  return auditedUpdate<ComplianceVendor>('compliance_vendors', id, patch, 'compliance.vendor.review', `Vendor ${id} review → ${reviewStatus}`);
}

// -----------------------------------------------------------------------------
// Controls / frameworks / retention status tweaks.
// -----------------------------------------------------------------------------

export function setControlStatus(id: string, status: ReadinessStatus): Promise<DbResult<ComplianceControl>> {
  return auditedUpdate<ComplianceControl>('compliance_controls', id, { status, last_reviewed_at: new Date().toISOString() }, 'compliance.control.status', `Control ${id} → ${status}`);
}

export function setFrameworkStatus(id: string, status: ReadinessStatus): Promise<DbResult<ComplianceFramework>> {
  return auditedUpdate<ComplianceFramework>('compliance_frameworks', id, { status, last_reviewed_at: new Date().toISOString() }, 'compliance.framework.status', `Framework ${id} → ${status}`);
}

export function updateRetention(id: string, patch: { retentionPeriod?: string; status?: string; notes?: string }): Promise<DbResult<ComplianceRetentionPolicy>> {
  const p: Json = { reviewed_at: new Date().toISOString() };
  if (patch.retentionPeriod !== undefined) p.retention_period = patch.retentionPeriod;
  if (patch.status !== undefined) p.status = patch.status;
  if (patch.notes !== undefined) p.notes = patch.notes;
  // auto_delete is intentionally NOT settable here — readiness only this phase.
  return auditedUpdate<ComplianceRetentionPolicy>('compliance_retention_policies', id, p, 'compliance.retention.update', `Retention ${id} updated`);
}

// -----------------------------------------------------------------------------
// Idempotent re-seed (admin) — mirrors the migration; skips existing keys.
// -----------------------------------------------------------------------------

export async function seedComplianceDefaults(): Promise<DbResult<{ inserted: number }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const db = gate.ctx.db;
    let inserted = 0;
    const upsert = async (table: string, conflictCol: string, rows: Json[]) => {
      const { data } = await db.from(table).upsert(rows, { onConflict: conflictCol, ignoreDuplicates: true }).select('id');
      inserted += (data ?? []).length;
    };
    await upsert('compliance_frameworks', 'key', FRAMEWORK_SEEDS as unknown as Json[]);
    await upsert('compliance_controls', 'key', CONTROL_SEEDS as unknown as Json[]);
    await upsert('compliance_vendors', 'key', VENDOR_SEEDS as unknown as Json[]);
    await upsert('compliance_policy_documents', 'key', POLICY_SEEDS as unknown as Json[]);
    await upsert('compliance_retention_policies', 'data_type', RETENTION_SEEDS as unknown as Json[]);
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'compliance.seed', message: 'Re-seeded compliance defaults', metadata: { inserted } });
    return { ok: true, data: { inserted } };
  } catch (e) {
    return adminFail(e);
  }
}

// -----------------------------------------------------------------------------
// Export (Deliverable L) — assembles data, records the export, returns payload.
// -----------------------------------------------------------------------------

export async function generateExport(exportTypeRaw: string, format: 'csv' | 'json'): Promise<DbResult<ExportResult>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    if (!isExportType(exportTypeRaw)) return { ok: false, error: `Unknown export type "${exportTypeRaw}".`, code: 'DB_ERROR' };
    const exportType: ExportType = exportTypeRaw;
    const db = gate.ctx.db;

    const data: Parameters<typeof buildExport>[2] = {};
    switch (exportType) {
      case 'readiness_matrix': {
        const [fw, ctrl] = await Promise.all([
          db.from('compliance_frameworks').select('*').order('key', { ascending: true }),
          db.from('compliance_controls').select('*'),
        ]);
        data.frameworks = (fw.data ?? []) as ComplianceFramework[];
        data.readiness = scoreFrameworks(data.frameworks.map((f) => f.key), (ctrl.data ?? []) as ComplianceControl[]);
        break;
      }
      case 'controls': {
        const { data: rows } = await db.from('compliance_controls').select('*').order('category', { ascending: true });
        data.controls = (rows ?? []) as ComplianceControl[];
        break;
      }
      case 'risk_register': {
        const { data: rows } = await db.from('compliance_risk_register').select('*');
        data.risks = (rows ?? []) as ComplianceRisk[];
        break;
      }
      case 'incidents': {
        const { data: rows } = await db.from('compliance_incidents').select('*');
        data.incidents = (rows ?? []) as ComplianceIncident[];
        break;
      }
      case 'vendors': {
        const { data: rows } = await db.from('compliance_vendors').select('*');
        data.vendors = (rows ?? []) as ComplianceVendor[];
        break;
      }
      case 'access_review': {
        const review = await getAccessReview();
        data.accessReview = review.ok ? review.data.rows : [];
        break;
      }
    }

    const result = buildExport(exportType, format, data);

    // Audit-trail the export (provenance).
    const orgId = await getCurrentOrganizationId().catch(() => null);
    await db.from('compliance_audit_exports').insert({
      organization_id: orgId,
      export_type: exportType,
      format,
      row_count: result.rowCount,
      exported_by: gate.ctx.user.id,
    });
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'compliance.export', message: `Exported ${exportType} (${format})`, metadata: { rowCount: result.rowCount } });

    return { ok: true, data: result };
  } catch (e) {
    return adminFail(e);
  }
}
