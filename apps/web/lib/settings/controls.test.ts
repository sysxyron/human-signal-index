import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SETTINGS_CONTROLS, deadControls, reasonFor } from './controls';

test('no dead controls — every control is wired or has a reason', () => {
  assert.deepEqual(deadControls(), []);
  for (const c of SETTINGS_CONTROLS) {
    if (c.state === 'disabled') {
      assert.ok(c.reason && c.reason.trim().length > 0, `${c.id} disabled without a reason`);
    }
  }
});

test('detects a dead control if one were introduced', () => {
  const bad = [{ id: 'x', label: 'X', kind: 'button' as const, state: 'disabled' as const }];
  assert.equal(deadControls(bad).length, 1);
});

test('role control is admin-managed (not a non-admin self-serve control)', () => {
  const role = SETTINGS_CONTROLS.find((c) => c.id === 'role');
  assert.ok(role);
  assert.equal(role?.state, 'disabled');
  assert.match(role?.reason ?? '', /administrator/i);
});

test('save + api-keys controls are disabled with reasons', () => {
  for (const id of ['save_profile', 'api_keys']) {
    const c = SETTINGS_CONTROLS.find((x) => x.id === id);
    assert.equal(c?.state, 'disabled');
    assert.ok((c?.reason ?? '').length > 0);
  }
});

test('every control covers the documented surface', () => {
  for (const id of ['display_name', 'email', 'role', 'save_profile', 'notif_critical', 'sec_mfa', 'api_keys', 'pref_view', 'pref_threshold', 'pref_trace']) {
    assert.ok(reasonFor(id), `missing audit entry for ${id}`);
  }
});

test('reasonFor returns undefined for unknown id', () => {
  assert.equal(reasonFor('nope'), undefined);
});
