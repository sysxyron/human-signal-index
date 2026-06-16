'use server';

// =============================================================================
// HSI Phase 41 — Compliance server actions. THIN wrappers over the admin-gated,
// audited DAL; they revalidate the relevant admin routes. They never throw (the
// DAL returns DbResult). SERVER-ONLY (imports next/headers transitively).
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  attachEvidenceToControl,
  createEvidence,
  createIncident,
  createRisk,
  seedComplianceDefaults,
  setControlStatus,
  setEvidenceStatus,
  setFrameworkStatus,
  setIncidentStatus,
  setPolicyStatus,
  setRiskStatus,
  setVendorReview,
  updatePolicy,
  updateRetention,
  type CreateEvidenceInput,
  type CreateIncidentInput,
  type CreateRiskInput,
} from './persistence';
import type {
  EvidenceStatus,
  IncidentStatus,
  PolicyStatus,
  ReadinessStatus,
  RiskStatus,
  VendorReviewStatus,
} from './types';

const BASE = '/dashboard/admin/compliance';
function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try { revalidatePath(p as never); } catch { /* best-effort */ }
  }
}

export async function createRiskAction(input: CreateRiskInput) {
  const r = await createRisk(input);
  if (r.ok) revalidate(`${BASE}/risks`, BASE);
  return r;
}
export async function setRiskStatusAction(id: string, status: RiskStatus) {
  const r = await setRiskStatus(id, status);
  if (r.ok) revalidate(`${BASE}/risks`, BASE);
  return r;
}

export async function createIncidentAction(input: CreateIncidentInput) {
  const r = await createIncident(input);
  if (r.ok) revalidate(`${BASE}/incidents`, BASE);
  return r;
}
export async function setIncidentStatusAction(id: string, status: IncidentStatus) {
  const r = await setIncidentStatus(id, status);
  if (r.ok) revalidate(`${BASE}/incidents`, BASE);
  return r;
}

export async function createEvidenceAction(input: CreateEvidenceInput) {
  const r = await createEvidence(input);
  if (r.ok) revalidate(`${BASE}/evidence`, BASE);
  return r;
}
export async function setEvidenceStatusAction(id: string, status: EvidenceStatus) {
  const r = await setEvidenceStatus(id, status);
  if (r.ok) revalidate(`${BASE}/evidence`);
  return r;
}
export async function attachEvidenceAction(id: string, controlId: string | null) {
  const r = await attachEvidenceToControl(id, controlId);
  if (r.ok) revalidate(`${BASE}/evidence`);
  return r;
}

export async function setPolicyStatusAction(id: string, status: PolicyStatus) {
  const r = await setPolicyStatus(id, status);
  if (r.ok) revalidate(`${BASE}/policies`, BASE);
  return r;
}
export async function updatePolicyAction(id: string, patch: { owner?: string; summary?: string; contentUrl?: string }) {
  const r = await updatePolicy(id, patch);
  if (r.ok) revalidate(`${BASE}/policies`);
  return r;
}

export async function setVendorReviewAction(id: string, reviewStatus: VendorReviewStatus, notes?: string) {
  const r = await setVendorReview(id, reviewStatus, notes);
  if (r.ok) revalidate(`${BASE}/vendors`, BASE);
  return r;
}

export async function setControlStatusAction(id: string, status: ReadinessStatus) {
  const r = await setControlStatus(id, status);
  if (r.ok) revalidate(BASE);
  return r;
}
export async function setFrameworkStatusAction(id: string, status: ReadinessStatus) {
  const r = await setFrameworkStatus(id, status);
  if (r.ok) revalidate(BASE);
  return r;
}

export async function updateRetentionAction(id: string, patch: { retentionPeriod?: string; status?: string; notes?: string }) {
  const r = await updateRetention(id, patch);
  if (r.ok) revalidate(`${BASE}/retention`);
  return r;
}

export async function seedComplianceDefaultsAction() {
  const r = await seedComplianceDefaults();
  if (r.ok) revalidate(BASE);
  return r;
}
