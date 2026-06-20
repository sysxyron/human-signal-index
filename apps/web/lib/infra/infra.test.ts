import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actualRpoMinutes, withinRpo, uptimePct, overallHealth, healthStateFromStatus, type SubsystemHealth } from './types';

test('actualRpoMinutes: minutes since last backup, null when none', () => {
  assert.equal(actualRpoMinutes(null, '2026-06-19T12:00:00Z'), null);
  assert.equal(actualRpoMinutes('2026-06-19T11:00:00Z', '2026-06-19T12:00:00Z'), 60);
  assert.equal(actualRpoMinutes('2026-06-18T12:00:00Z', '2026-06-19T12:00:00Z'), 1440);
});

test('withinRpo: compares actual to target; null when no backup', () => {
  assert.equal(withinRpo(null, '2026-06-19T12:00:00Z', 1440), null);
  assert.equal(withinRpo('2026-06-19T11:00:00Z', '2026-06-19T12:00:00Z', 1440), true);
  assert.equal(withinRpo('2026-06-17T11:00:00Z', '2026-06-19T12:00:00Z', 1440), false);
});

test('uptimePct: ok ratio, null when no checks (not fabricated)', () => {
  assert.equal(uptimePct(0, 0), null);
  assert.equal(uptimePct(9, 10), 90);
  assert.equal(uptimePct(10, 10), 100);
});

test('healthStateFromStatus maps probe results', () => {
  assert.equal(healthStateFromStatus('ok', true), 'ok');
  assert.equal(healthStateFromStatus('unconfigured', false), 'unconfigured');
  assert.equal(healthStateFromStatus('degraded', false), 'degraded');
  assert.equal(healthStateFromStatus('down', false), 'down');
  assert.equal(healthStateFromStatus(undefined, true), 'ok');
});

test('overallHealth: worst-wins', () => {
  const ok: SubsystemHealth[] = [{ name: 'a', state: 'ok', detail: '' }, { name: 'b', state: 'ok', detail: '' }];
  assert.equal(overallHealth(ok), 'ok');
  assert.equal(overallHealth([...ok, { name: 'c', state: 'degraded', detail: '' }]), 'degraded');
  assert.equal(overallHealth([...ok, { name: 'c', state: 'down', detail: '' }]), 'down');
  assert.equal(overallHealth([{ name: 'a', state: 'unknown', detail: '' }]), 'unknown');
});
