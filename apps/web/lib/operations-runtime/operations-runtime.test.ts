import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeSummary, validateRuntimeFlags } from './summary';

function summaryInput(over = {}) {
  return { hsiMode: 'normal', primaryDbHealth: 'unknown', publicEffective: 'primary', dashboardEffective: 'primary', globalMapEnabled: true, sourceIngestEnabled: true, protectedReadMode: false, maintenanceBanner: false, betaSignupOpen: true, ...over };
}

// ---- runtime summary generation --------------------------------------------

test('summary: nominal runtime reads naturally', () => {
  const lines = buildRuntimeSummary(summaryInput());
  assert.equal(lines[0], 'HSI is operating normally.');
  assert.ok(lines.includes('Primary database available.'));
  assert.ok(lines.includes('Public reads routed to primary.'));
  assert.ok(lines.includes('Dashboard reads routed to primary.'));
  assert.ok(lines.includes('Global Map enabled.'));
  assert.ok(lines.includes('Source ingestion enabled.'));
  assert.ok(lines.includes('Protected read mode disabled.'));
});
test('summary: reflects maintenance / protected / down / paused states', () => {
  assert.equal(buildRuntimeSummary(summaryInput({ hsiMode: 'maintenance' }))[0], 'HSI is in maintenance mode.');
  assert.equal(buildRuntimeSummary(summaryInput({ hsiMode: 'protected_read' }))[0], 'HSI is operating in protected read mode.');
  assert.ok(buildRuntimeSummary(summaryInput({ primaryDbHealth: 'down' })).includes('Primary database reported unavailable.'));
  assert.ok(buildRuntimeSummary(summaryInput({ maintenanceBanner: true })).includes('Maintenance banner is active.'));
  assert.ok(buildRuntimeSummary(summaryInput({ betaSignupOpen: false })).includes('Beta applications are paused.'));
});
test('summary: reflects routing fallback effective backend', () => {
  assert.ok(buildRuntimeSummary(summaryInput({ publicEffective: 'primary', dashboardEffective: 'primary' })).includes('Public reads routed to primary.'));
});

// ---- runtime flags validation ----------------------------------------------

function flags(over = {}) {
  return { hsiMode: 'normal', publicReadsSource: 'primary', dashboardReadsSource: 'primary', primaryDbHealth: 'unknown', maintenanceBanner: false, betaSignupOpen: true, globalMapEnabled: true, sourceIngestEnabled: true, protectedReadMode: false, ...over };
}
test('validate: well-formed flags are valid', () => {
  const v = validateRuntimeFlags(flags());
  assert.equal(v.valid, true); assert.deepEqual(v.problems, []);
});
test('validate: out-of-vocabulary enum → invalid with problem', () => {
  const v = validateRuntimeFlags(flags({ hsiMode: 'banana', publicReadsSource: 'mysql' }));
  assert.equal(v.valid, false); assert.equal(v.problems.length, 2);
});
test('validate: non-boolean flag → invalid', () => {
  assert.equal(validateRuntimeFlags(flags({ globalMapEnabled: 'yes' as unknown as boolean })).valid, false);
});
