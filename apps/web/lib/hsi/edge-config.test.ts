import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRuntimeConfig, HSI_EDGE_DEFAULTS } from './edge-config';
import { coerceReadSource } from './read-routing';

// ---- normalization (never throws, validates, falls back) --------------------

test('normalize: null/empty → defaults', () => {
  assert.deepEqual(normalizeRuntimeConfig(null), HSI_EDGE_DEFAULTS);
  assert.deepEqual(normalizeRuntimeConfig({}), HSI_EDGE_DEFAULTS);
  assert.deepEqual(normalizeRuntimeConfig(undefined), HSI_EDGE_DEFAULTS);
});

test('normalize: valid camelCase values pass through', () => {
  const c = normalizeRuntimeConfig({
    hsiMode: 'maintenance', maintenanceBanner: true, maintenanceMessage: 'Back at 5pm',
    betaSignupOpen: false, publicReadsSource: 'replica', dashboardReadsSource: 'cache',
    globalMapEnabled: false, sourceIngestEnabled: false, protectedReadMode: true, primaryDbHealth: 'degraded',
  });
  assert.equal(c.hsiMode, 'maintenance'); assert.equal(c.maintenanceBanner, true); assert.equal(c.maintenanceMessage, 'Back at 5pm');
  assert.equal(c.betaSignupOpen, false); assert.equal(c.publicReadsSource, 'replica'); assert.equal(c.dashboardReadsSource, 'cache');
  assert.equal(c.globalMapEnabled, false); assert.equal(c.sourceIngestEnabled, false); assert.equal(c.protectedReadMode, true); assert.equal(c.primaryDbHealth, 'degraded');
});

test('normalize: snake_case keys are accepted as a fallback', () => {
  const c = normalizeRuntimeConfig({ maintenance_banner: true, beta_signup_open: false, global_map_enabled: false, source_ingest_enabled: false });
  assert.equal(c.maintenanceBanner, true); assert.equal(c.betaSignupOpen, false); assert.equal(c.globalMapEnabled, false); assert.equal(c.sourceIngestEnabled, false);
});

test('normalize: wrong types normalize to defaults (no crash, no garbage)', () => {
  const c = normalizeRuntimeConfig({ maintenanceBanner: 'yes', betaSignupOpen: 1, maintenanceMessage: 42, globalMapEnabled: null });
  assert.equal(c.maintenanceBanner, false); // string → default
  assert.equal(c.betaSignupOpen, true);     // number → default
  assert.equal(c.maintenanceMessage, '');   // number → default
  assert.equal(c.globalMapEnabled, true);   // null → default
});

test('normalize: invalid enum values fall back to default', () => {
  const c = normalizeRuntimeConfig({ hsiMode: 'banana', publicReadsSource: 'mysql', primaryDbHealth: 'meh' });
  assert.equal(c.hsiMode, 'normal');
  assert.equal(c.publicReadsSource, 'primary');
  assert.equal(c.primaryDbHealth, 'unknown');
});

test('normalize: camelCase wins over snake_case when both present', () => {
  assert.equal(normalizeRuntimeConfig({ betaSignupOpen: false, beta_signup_open: true }).betaSignupOpen, false);
});

// ---- read routing selector -------------------------------------------------

test('coerceReadSource: valid sources pass; invalid → primary', () => {
  for (const s of ['primary', 'replica', 'd1', 'cache']) assert.equal(coerceReadSource(s), s);
  assert.equal(coerceReadSource('postgres'), 'primary');
  assert.equal(coerceReadSource(null), 'primary');
  assert.equal(coerceReadSource(123), 'primary');
});
