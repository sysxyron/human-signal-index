import { test } from 'node:test';
import assert from 'node:assert/strict';

import { impactScore, governanceEffectiveness, computeTrust, AUTHORITY_WEIGHTS } from '../src/scores';
import { contributorInsights, teamEffectiveness } from '../src/insights';
import { NEUTRAL_INPUTS, demoHighTrust, demoLowTrust } from '../src/fixtures';

// ---- impact ---------------------------------------------------------------
test('impact is neutral with no investigations', () => {
  assert.equal(impactScore({ investigationsCompleted: 0, acceptedFindings: 0, governanceActions: 0, publicationsDelivered: 0 }), 50);
});

test('impact rewards investigations that produced outcomes', () => {
  const none = impactScore({ investigationsCompleted: 10, acceptedFindings: 0, governanceActions: 0, publicationsDelivered: 0 });
  const lots = impactScore({ investigationsCompleted: 10, acceptedFindings: 10, governanceActions: 8, publicationsDelivered: 10 });
  assert.ok(lots > none);
  assert.equal(none, 0);
});

test('impact stays within 0..100', () => {
  const v = impactScore({ investigationsCompleted: 1, acceptedFindings: 50, governanceActions: 50, publicationsDelivered: 50 });
  assert.ok(v >= 0 && v <= 100);
});

// ---- governance effectiveness ---------------------------------------------
test('governance effectiveness = confirmed / decisions; neutral with none', () => {
  assert.equal(governanceEffectiveness({ governanceConfirmed: 0, governanceDecisions: 0 }), 50);
  assert.equal(governanceEffectiveness({ governanceConfirmed: 8, governanceDecisions: 10 }), 80);
});

// ---- authority recompute (no placeholder) ---------------------------------
test('authority weights include impact and sum to 1', () => {
  assert.ok('impact' in AUTHORITY_WEIGHTS);
  const sum = Object.values(AUTHORITY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('computeTrust now exposes impact + governanceEffectiveness', () => {
  const s = computeTrust(demoHighTrust);
  assert.ok(s.impact > 50);
  assert.ok(s.governanceEffectiveness > 50);
  assert.ok(s.authority > 70);
  assert.equal(computeTrust(NEUTRAL_INPUTS).authority, 50);
});

// ---- insights -------------------------------------------------------------
test('insights surface strengths for a high performer', () => {
  const ins = contributorInsights(computeTrust(demoHighTrust));
  assert.ok(ins.strengths.length > 0);
  assert.equal(ins.weaknesses.length, 0);
});

test('insights surface weaknesses for a low performer', () => {
  const ins = contributorInsights(computeTrust(demoLowTrust));
  assert.ok(ins.weaknesses.length > 0);
});

// ---- team effectiveness ---------------------------------------------------
test('team effectiveness blends acceptance/completion/impact', () => {
  assert.equal(teamEffectiveness({ acceptance: 100, completion: 100, impact: 100 }), 100);
  assert.equal(teamEffectiveness({ acceptance: 0, completion: 0, impact: 0 }), 0);
  const mid = teamEffectiveness({ acceptance: 80, completion: 60, impact: 40 });
  assert.ok(mid > 0 && mid < 100);
});
