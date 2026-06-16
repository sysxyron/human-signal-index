// =============================================================================
// HSI Phase 41 — Compliance export (Deliverable L). PURE.
//
// CSV + JSON serialization for: readiness matrix, control list, risk register,
// access review, incident log, vendor register. Output routes through the
// language guardrails so a certification claim can never appear in an export.
// =============================================================================

import { assertNoCertificationClaim, readinessLabel } from './guardrails';
import type { FrameworkReadiness } from './readiness';
import type {
  AccessReviewRow,
  ComplianceControl,
  ComplianceFramework,
  ComplianceIncident,
  ComplianceRisk,
  ComplianceVendor,
} from './types';

export const EXPORT_TYPES = [
  'readiness_matrix',
  'controls',
  'risk_register',
  'access_review',
  'incidents',
  'vendors',
] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export function isExportType(v: string): v is ExportType {
  return (EXPORT_TYPES as readonly string[]).includes(v);
}

export type Row = Record<string, string | number | boolean | null | undefined>;

/** RFC-4180-ish CSV. Escapes quotes/commas/newlines. `columns` fixes order. PURE. */
export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(esc).join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return body ? `${header}\n${body}` : header;
}

/** Deterministic JSON (2-space). PURE. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// -----------------------------------------------------------------------------
// Dataset → flat rows.
// -----------------------------------------------------------------------------

export function matrixRows(
  frameworks: ComplianceFramework[],
  readiness: Record<string, FrameworkReadiness>,
): Row[] {
  return frameworks.map((f) => {
    const r = readiness[f.key];
    return {
      framework: f.name,
      key: f.key,
      status: readinessLabel(f.status),
      controls_present: r?.present.length ?? 0,
      controls_missing: r?.missing.length ?? 0,
      not_applicable: r?.notApplicable.length ?? 0,
      evidence_available: r?.evidenceCount ?? 0,
      readiness_percent: r?.percent ?? 0,
      last_reviewed_at: f.last_reviewed_at ?? '',
      summary: f.summary ?? '',
    };
  });
}
export const MATRIX_COLUMNS = ['framework', 'key', 'status', 'controls_present', 'controls_missing', 'not_applicable', 'evidence_available', 'readiness_percent', 'last_reviewed_at', 'summary'];

export function controlRows(controls: ComplianceControl[]): Row[] {
  return controls.map((c) => ({
    key: c.key,
    name: c.name,
    category: c.category,
    status: readinessLabel(c.status),
    frameworks: (c.frameworks ?? []).join('|'),
    owner: c.owner ?? '',
    last_reviewed_at: c.last_reviewed_at ?? '',
  }));
}
export const CONTROL_COLUMNS = ['key', 'name', 'category', 'status', 'frameworks', 'owner', 'last_reviewed_at'];

export function riskRows(risks: ComplianceRisk[]): Row[] {
  return risks.map((r) => ({
    title: r.title,
    severity: r.severity,
    status: r.status,
    owner: r.owner ?? '',
    mitigation: r.mitigation ?? '',
    review_date: r.review_date ?? '',
    created_at: r.created_at ?? '',
  }));
}
export const RISK_COLUMNS = ['title', 'severity', 'status', 'owner', 'mitigation', 'review_date', 'created_at'];

export function accessReviewRows(rows: AccessReviewRow[]): Row[] {
  return rows.map((r) => ({
    user_id: r.user_id,
    email: r.email ?? '',
    role: r.role,
    is_admin: r.isAdmin,
    elevated: r.elevated,
    organizations: r.organizations.join('|'),
    last_login_at: r.lastLoginAt ?? '',
    inactive: r.inactive,
  }));
}
export const ACCESS_REVIEW_COLUMNS = ['user_id', 'email', 'role', 'is_admin', 'elevated', 'organizations', 'last_login_at', 'inactive'];

export function incidentRows(incidents: ComplianceIncident[]): Row[] {
  return incidents.map((i) => ({
    title: i.title,
    severity: i.severity,
    status: i.status,
    affected_system: i.affected_system ?? '',
    detected_at: i.detected_at ?? '',
    resolved_at: i.resolved_at ?? '',
    owner: i.owner ?? '',
  }));
}
export const INCIDENT_COLUMNS = ['title', 'severity', 'status', 'affected_system', 'detected_at', 'resolved_at', 'owner'];

export function vendorRows(vendors: ComplianceVendor[]): Row[] {
  return vendors.map((v) => ({
    name: v.name,
    service_purpose: v.service_purpose ?? '',
    data_access_level: v.data_access_level,
    risk_level: v.risk_level,
    review_status: v.review_status,
    notes: v.notes ?? '',
  }));
}
export const VENDOR_COLUMNS = ['name', 'service_purpose', 'data_access_level', 'risk_level', 'review_status', 'notes'];

export interface ExportResult {
  filename: string;
  contentType: string;
  body: string;
  rowCount: number;
}

/** Build an export payload (CSV or JSON) for a dataset. Guardrail-checked. PURE. */
export function buildExport(
  exportType: ExportType,
  format: 'csv' | 'json',
  data: {
    frameworks?: ComplianceFramework[];
    readiness?: Record<string, FrameworkReadiness>;
    controls?: ComplianceControl[];
    risks?: ComplianceRisk[];
    accessReview?: AccessReviewRow[];
    incidents?: ComplianceIncident[];
    vendors?: ComplianceVendor[];
  },
): ExportResult {
  let rows: Row[] = [];
  let columns: string[] = [];
  switch (exportType) {
    case 'readiness_matrix':
      rows = matrixRows(data.frameworks ?? [], data.readiness ?? {});
      columns = MATRIX_COLUMNS;
      break;
    case 'controls':
      rows = controlRows(data.controls ?? []);
      columns = CONTROL_COLUMNS;
      break;
    case 'risk_register':
      rows = riskRows(data.risks ?? []);
      columns = RISK_COLUMNS;
      break;
    case 'access_review':
      rows = accessReviewRows(data.accessReview ?? []);
      columns = ACCESS_REVIEW_COLUMNS;
      break;
    case 'incidents':
      rows = incidentRows(data.incidents ?? []);
      columns = INCIDENT_COLUMNS;
      break;
    case 'vendors':
      rows = vendorRows(data.vendors ?? []);
      columns = VENDOR_COLUMNS;
      break;
  }

  // Guardrail: no certification claim may ship in any exported cell.
  for (const r of rows) {
    for (const c of columns) {
      const v = r[c];
      if (typeof v === 'string') assertNoCertificationClaim(v);
    }
  }

  const body = format === 'csv' ? toCsv(rows, columns) : toJson(rows);
  return {
    filename: `compliance_${exportType}.${format}`,
    contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    body,
    rowCount: rows.length,
  };
}
