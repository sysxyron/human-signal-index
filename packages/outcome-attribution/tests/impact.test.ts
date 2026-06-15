import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  impactScore, IMPACT_WEIGHTS, signalEffectiveness, investigationImpact,
  contributorImpact, teamImpact, publicationReach,
} from '../src/impact';
import { demoImpactHigh, demoImpactLow } from '../src/fixtures';

test('impact weights sum to 1 (documented formula)', () => {
  const sum = Object.values(IMPACT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('impact: quality+verified work scores far above empty activity', () => {
  const hi = impactScore(demoImpactHigh);
  const lo = impactScore(demoImpactLow);
  assert.ok(hi > lo);
  assert.ok(hi > 80);
  assert.ok(lo < 30);
});

test('impact stays 0..100', () => {
  for (const s of [impactScore(demoImpactHigh), impactScore(demoImpactLow)]) assert.ok(s >= 0 && s <= 100);
  assert.equal(impactScore({ acceptedFindings: 999, governanceActions: 999, publicationQuality: 100, traceability: 100, evidenceQuality: 100, verificationLevel: 1 }), 100);
});

test('signal effectiveness is a conversion funnel; verified weighs most', () => {
  const e = signalEffectiveness({ signalsSubmitted: 100, ledToInvestigation: 50, ledToAcceptedFinding: 30, ledToPublication: 20, ledToGovernanceAction: 10, ledToVerifiedOutcome: 8 });
  assert.equal(e.investigationRate, 50);
  assert.equal(e.verifiedRate, 8);
  assert.ok(e.score > 0 && e.score < 50);
  // zero submissions → all zero (no divide-by-zero)
  const z = signalEffectiveness({ signalsSubmitted: 0, ledToInvestigation: 0, ledToAcceptedFinding: 0, ledToPublication: 0, ledToGovernanceAction: 0, ledToVerifiedOutcome: 0 });
  assert.equal(z.score, 0);
});

test('investigation impact rewards findings/governance/publications/outcomes', () => {
  const hi = investigationImpact({ acceptedFindings: 3, governanceActions: 2, publications: 2, realOutcomes: 3 });
  const lo = investigationImpact({ acceptedFindings: 0, governanceActions: 0, publications: 0, realOutcomes: 0 });
  assert.ok(hi > lo);
  assert.equal(lo, 0);
});

test('contributor impact is outcomes, not volume', () => {
  const outcomes = contributorImpact({ verifiedFindings: 5, governanceActions: 4, publicationsDriven: 4, outcomesCreated: 6, attributedWeight: 10 });
  const noise = contributorImpact({ verifiedFindings: 0, governanceActions: 0, publicationsDriven: 0, outcomesCreated: 0, attributedWeight: 0 });
  assert.ok(outcomes > noise);
  assert.equal(noise, 0);
});

test('team impact normalises per member (small team can match big one)', () => {
  const small = teamImpact({ verifiedFindings: 4, governanceActions: 3, publications: 3, outcomesCreated: 5, members: 2 });
  const bigButThin = teamImpact({ verifiedFindings: 4, governanceActions: 3, publications: 3, outcomesCreated: 5, members: 50 });
  assert.ok(small > bigButThin);
});

test('publication reach: drafts capped below published', () => {
  const pub = publicationReach({ published: true, publicationQuality: 90, traceability: 90, evidenceVolume: 8, outcomesProduced: 3 });
  const draft = publicationReach({ published: false, publicationQuality: 90, traceability: 90, evidenceVolume: 8, outcomesProduced: 3 });
  assert.ok(pub > draft);
  assert.ok(draft <= pub * 0.5);
});
