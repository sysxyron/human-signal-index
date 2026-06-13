import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXPECTED_MIGRATIONS, auditMigrations } from './migration-audit';

const ALL = EXPECTED_MIGRATIONS.map((m) => m.id);

test('expected set is 0001..0026 contiguous', () => {
  assert.equal(EXPECTED_MIGRATIONS.length, 26);
  assert.equal(ALL[0], '0001');
  assert.equal(ALL[25], '0026');
  for (let i = 0; i < ALL.length; i++) {
    assert.equal(ALL[i], String(i + 1).padStart(4, '0'));
  }
});

test('all applied → ok, green, latest 0026', () => {
  const r = auditMigrations(ALL);
  assert.equal(r.ok, true);
  assert.equal(r.verifiable, true);
  assert.equal(r.applied, 26);
  assert.equal(r.missing, 0);
  assert.equal(r.latestApplied, '0026');
  assert.ok(r.rows.every((row) => row.state === 'applied'));
});

test('null applied → unverifiable, all unknown', () => {
  const r = auditMigrations(null);
  assert.equal(r.verifiable, false);
  assert.equal(r.ok, false);
  assert.equal(r.unknown, 26);
  assert.ok(r.rows.every((row) => row.state === 'unknown'));
});

test('missing tail migrations flagged missing', () => {
  const r = auditMigrations(ALL.slice(0, 24)); // 0001..0024 applied
  assert.equal(r.applied, 24);
  assert.equal(r.missing, 2);
  assert.equal(r.ok, false);
  assert.equal(r.latestApplied, '0024');
  assert.equal(r.rows.find((x) => x.id === '0025')?.state, 'missing');
});

test('a gap marks later applied as out_of_order', () => {
  // 0001..0024 + 0026 applied, 0025 missing → 0026 is out_of_order
  const r = auditMigrations([...ALL.slice(0, 24), '0026']);
  assert.equal(r.missing, 1);
  assert.equal(r.outOfOrder, 1);
  assert.equal(r.rows.find((x) => x.id === '0025')?.state, 'missing');
  assert.equal(r.rows.find((x) => x.id === '0026')?.state, 'out_of_order');
  assert.equal(r.ok, false);
});

test('failed migrations classified failed', () => {
  const r = auditMigrations(ALL, ['0010']);
  assert.equal(r.failed, 1);
  assert.equal(r.rows.find((x) => x.id === '0010')?.state, 'failed');
  assert.equal(r.ok, false);
});

test('extra applied versions reported as drift', () => {
  const r = auditMigrations([...ALL, '0099']);
  assert.deepEqual(r.extra, ['0099']);
  assert.equal(r.ok, true); // all expected still applied in order
});

test('accepts timestamped version strings (extracts 4-digit id)', () => {
  const r = auditMigrations(['0001_init', '0002_rls', '0003abc']);
  assert.equal(r.rows.find((x) => x.id === '0001')?.state, 'applied');
  assert.equal(r.rows.find((x) => x.id === '0003')?.state, 'applied');
});

test('empty applied → all missing', () => {
  const r = auditMigrations([]);
  assert.equal(r.missing, 26);
  assert.equal(r.applied, 0);
  assert.equal(r.latestApplied, null);
});

test('deterministic', () => {
  assert.deepEqual(auditMigrations(ALL.slice(0, 20)), auditMigrations(ALL.slice(0, 20)));
});
