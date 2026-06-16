// =============================================================================
// HSI Phase 41 — compliance readiness tests (node:test via tsx). Pure modules.
// Covers: framework readiness scoring, control seeding, risk/policy/incident
// transitions, access review generation, vendor register, export generation,
// and certification-language guardrails (Deliverable N).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  containsCertificationClaim,
  assertNoCertificationClaim,
  readinessLabel,
  COMPLIANCE_DISCLAIMER,
  APPROVED_FRAMEWORK_PHRASES,
} from './guardrails';
import {
  CONTROL_SEEDS,
  FRAMEWORK_SEEDS,
  VENDOR_SEEDS,
  POLICY_SEEDS,
  RETENTION_SEEDS,
} from './seeds';
import { scoreFramework, scoreFrameworks, overallReadiness } from './readiness';
import {
  isValidRiskTransition,
  isValidPolicyTransition,
  isValidIncidentTransition,
} from './lifecycle';
import { buildAccessReview, summarizeAccessReview } from './access-review';
import { buildExport, toCsv, isExportType, EXPORT_TYPES } from './export';
import type { ComplianceControl } from './types';

const NOW = '2026-06-15T00:00:00.000Z';

// ---- Guardrails (Deliverable M/N) ------------------------------------------

test('guardrails flag certification claims and accept readiness language', () => {
  assert.equal(containsCertificationClaim('We are SOC 2 Certified'), true);
  assert.equal(containsCertificationClaim('HIPAA certified platform'), true);
  assert.equal(containsCertificationClaim('PCI DSS compliant'), true);
  assert.equal(containsCertificationClaim('Certified ISO 27001'), true);
  assert.equal(containsCertificationClaim('SOC 2 readiness'), false);
  assert.equal(containsCertificationClaim('PCI boundary readiness'), false);
  assert.throws(() => assertNoCertificationClaim('SOC 2 Certified'));
  assert.equal(assertNoCertificationClaim('SOC 2 readiness'), 'SOC 2 readiness');
  // The disclaimer + approved phrases must themselves be clean.
  assert.equal(containsCertificationClaim(COMPLIANCE_DISCLAIMER), false);
  for (const phrase of Object.values(APPROVED_FRAMEWORK_PHRASES)) {
    assert.equal(containsCertificationClaim(phrase), false);
  }
  assert.equal(readinessLabel('evidence_available'), 'Evidence available');
});

test('no seed text claims certification', () => {
  const texts = [
    ...FRAMEWORK_SEEDS.flatMap((f) => [f.name, f.summary]),
    ...CONTROL_SEEDS.map((c) => c.name),
    ...VENDOR_SEEDS.flatMap((v) => [v.name, v.service_purpose, v.notes]),
    ...POLICY_SEEDS.flatMap((p) => [p.name, p.summary]),
  ];
  for (const t of texts) assert.equal(containsCertificationClaim(t), false, t);
});

// ---- Control / framework / vendor seeding ----------------------------------

test('control library seeds cover all required categories', () => {
  assert.ok(CONTROL_SEEDS.length >= 25);
  const categories = new Set(CONTROL_SEEDS.map((c) => c.category));
  for (const cat of ['security', 'privacy', 'operations', 'payments', 'healthcare', 'education', 'audit']) {
    assert.ok(categories.has(cat), `missing category ${cat}`);
  }
  // Keys are unique.
  assert.equal(new Set(CONTROL_SEEDS.map((c) => c.key)).size, CONTROL_SEEDS.length);
  // Required security controls present.
  for (const k of ['mfa_support', 'rbac', 'tenant_isolation', 'audit_logging', 'billing_event_logging']) {
    assert.ok(CONTROL_SEEDS.some((c) => c.key === k), `missing control ${k}`);
  }
});

test('framework + vendor + retention seeds are present and keyed', () => {
  assert.equal(FRAMEWORK_SEEDS.length, 8);
  for (const k of ['soc2', 'gdpr', 'ccpa', 'hipaa', 'pci', 'iso27001', 'ferpa', 'ngo_donor']) {
    assert.ok(FRAMEWORK_SEEDS.some((f) => f.key === k), `missing framework ${k}`);
  }
  for (const k of ['supabase', 'vercel', 'stripe', 'resend', 'cloudflare', 'protonmail']) {
    assert.ok(VENDOR_SEEDS.some((v) => v.key === k), `missing vendor ${k}`);
  }
  assert.equal(POLICY_SEEDS.length, 10);
  assert.ok(RETENTION_SEEDS.some((r) => r.data_type === 'audit_logs'));
});

// ---- Readiness scoring (Deliverable B) -------------------------------------

test('scoreFramework computes present/missing/score from the control library', () => {
  const controls: ComplianceControl[] = [
    { id: '1', key: 'a', name: 'A', category: 'security', status: 'ready', frameworks: ['soc2'] },
    { id: '2', key: 'b', name: 'B', category: 'security', status: 'evidence_available', frameworks: ['soc2'] },
    { id: '3', key: 'c', name: 'C', category: 'ops', status: 'in_progress', frameworks: ['soc2'] },
    { id: '4', key: 'd', name: 'D', category: 'hc', status: 'not_applicable', frameworks: ['soc2'] },
    { id: '5', key: 'e', name: 'E', category: 'x', status: 'ready', frameworks: ['gdpr'] },
  ];
  const r = scoreFramework('soc2', controls);
  assert.equal(r.present.length, 2);
  assert.equal(r.missing.length, 1);
  assert.equal(r.notApplicable.length, 1);
  assert.equal(r.applicable, 3);
  assert.equal(r.percent, 67);
  assert.equal(r.evidenceCount, 1);
  assert.equal(r.derivedStatus, 'evidence_available');

  // A framework with all controls ready → 'ready'.
  const full = scoreFramework('gdpr', controls);
  assert.equal(full.derivedStatus, 'ready');
  assert.equal(full.percent, 100);

  // Unknown framework → not_applicable-ish (no relevant controls).
  const none = scoreFramework('zzz', controls);
  assert.equal(none.applicable, 0);
});

test('scoreFrameworks + overallReadiness over the real seed library', () => {
  const controls = CONTROL_SEEDS.map((c, i) => ({ id: String(i), ...c })) as ComplianceControl[];
  const keys = FRAMEWORK_SEEDS.map((f) => f.key);
  const scored = scoreFrameworks(keys, controls);
  assert.ok(scored.soc2.present.length > 0);
  assert.ok(scored.pci.present.length > 0);
  const overall = overallReadiness(controls);
  assert.equal(overall.total, CONTROL_SEEDS.length);
  assert.ok(overall.percent >= 0 && overall.percent <= 100);
});

// ---- Lifecycle transitions -------------------------------------------------

test('risk status transitions enforce the lifecycle', () => {
  assert.equal(isValidRiskTransition('open', 'mitigating'), true);
  assert.equal(isValidRiskTransition('mitigating', 'resolved'), true);
  assert.equal(isValidRiskTransition('resolved', 'open'), true); // reopen
  assert.equal(isValidRiskTransition('accepted', 'mitigating'), false);
  assert.equal(isValidRiskTransition('open', 'open'), true); // idempotent
});

test('policy + incident transitions enforce their lifecycles', () => {
  assert.equal(isValidPolicyTransition('draft', 'active'), true);
  assert.equal(isValidPolicyTransition('active', 'archived'), true);
  assert.equal(isValidPolicyTransition('archived', 'active'), false);
  assert.equal(isValidIncidentTransition('investigating', 'contained'), true);
  assert.equal(isValidIncidentTransition('resolved', 'postmortem'), true);
  assert.equal(isValidIncidentTransition('postmortem', 'contained'), false);
});

// ---- Access review (Deliverable I) -----------------------------------------

test('access review flags admins, elevated, and inactive accounts', () => {
  const rows = buildAccessReview(
    [
      { user_id: 'u1', email: 'a@x.com', role: 'admin', organizations: ['Org A'], lastLoginAt: '2026-06-14T00:00:00Z' },
      { user_id: 'u2', email: 'b@x.com', role: 'reviewer', lastLoginAt: '2026-01-01T00:00:00Z' },
      { user_id: 'u3', email: 'c@x.com', role: 'viewer' }, // never logged in
    ],
    NOW,
  );
  assert.equal(rows[0].isAdmin, true);
  assert.equal(rows[0].inactive, false);
  assert.equal(rows[1].elevated, true);
  assert.equal(rows[1].inactive, true); // >90 days
  assert.equal(rows[2].inactive, true); // no login
  const s = summarizeAccessReview(rows);
  assert.deepEqual(s, { total: 3, admins: 1, elevated: 2, inactive: 2 });
});

// ---- Exports (Deliverable L) -----------------------------------------------

test('toCsv escapes commas, quotes, and newlines', () => {
  const csv = toCsv([{ a: 'x,y', b: 'he said "hi"', c: 'line1\nline2' }], ['a', 'b', 'c']);
  assert.equal(csv, 'a,b,c\n"x,y","he said ""hi""","line1\nline2"');
});

test('buildExport produces CSV + JSON for every export type and counts rows', () => {
  for (const t of EXPORT_TYPES) assert.ok(isExportType(t));
  const csv = buildExport('vendors', 'csv', {
    vendors: VENDOR_SEEDS.map((v, i) => ({ id: String(i), reviewed_at: undefined, ...v })) as never,
  });
  assert.equal(csv.rowCount, VENDOR_SEEDS.length);
  assert.match(csv.contentType, /text\/csv/);
  assert.ok(csv.body.startsWith('name,service_purpose'));

  const json = buildExport('controls', 'json', {
    controls: CONTROL_SEEDS.map((c, i) => ({ id: String(i), ...c })) as never,
  });
  assert.equal(json.rowCount, CONTROL_SEEDS.length);
  const parsed = JSON.parse(json.body);
  assert.equal(parsed.length, CONTROL_SEEDS.length);
  assert.equal(parsed[0].status, readinessLabel(CONTROL_SEEDS[0].status));
});

test('buildExport refuses a certification claim in any cell', () => {
  assert.throws(() =>
    buildExport('risk_register', 'csv', {
      risks: [{ id: '1', title: 'We are SOC 2 Certified', severity: 'low', status: 'open' }] as never,
    }),
  );
});
