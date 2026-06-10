import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGovernanceReview,
  applyGovernanceDecision,
  isTerminal,
  canValidate,
  buildOutcomeAuditTrail,
} from '../src/governance';
import { evaluateOutcome } from '../src/outcome';
import { learnFromOutcomes, tagInterventionType } from '../src/learning';
import { outcomeDemo } from '../src/fixtures';
import type {
  GovernanceDecision,
  ObservedData,
  OutcomeEvaluation,
  RecommendationRef,
} from '../src/types';

const NOW = '2026-06-01T00:00:00.000Z';
const LATER = '2026-06-02T00:00:00.000Z';

function rec(over: Partial<RecommendationRef> = {}): RecommendationRef {
  return {
    recommendationId: 'r1',
    decisionRunId: 'run1',
    interventionType: 'reduce_amplification',
    recommendedAction: 'dampen growth',
    expectedEffect: -40,
    confidenceBefore: 0.6,
    expectedOutcome: { signalDeltaPct: -40 },
    ...over,
  };
}
function evalFor(observed: ObservedData): OutcomeEvaluation {
  return evaluateOutcome(rec(), observed, NOW);
}
const win: ObservedData = { signalDeltaPct: -42, capturedAt: NOW };

test('buildGovernanceReview seeds a pending review', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  assert.equal(r.decision, 'pending');
  assert.equal(r.outcomeId, 'r1');
  assert.equal(r.decisionRunId, 'run1');
  assert.equal(r.createdAt, NOW);
  assert.ok(r.notes && r.notes.length > 0);
});

test('review notes summarise the outcome', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  assert.match(r.notes!, /score/);
});

test('applyGovernanceDecision transitions pending -> approved', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  const out = applyGovernanceDecision(r, 'approved', { now: LATER });
  assert.equal(out.decision, 'approved');
  assert.equal(out.createdAt, LATER);
});

test('applyGovernanceDecision transitions to rejected', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  assert.equal(applyGovernanceDecision(r, 'rejected', { now: LATER }).decision, 'rejected');
});

test('applyGovernanceDecision transitions to escalated', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  assert.equal(applyGovernanceDecision(r, 'escalated', { now: LATER }).decision, 'escalated');
});

test('applyGovernanceDecision transitions to validated', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  const out = applyGovernanceDecision(r, 'validated', { reviewerId: 'curator-1', now: LATER });
  assert.equal(out.decision, 'validated');
  assert.equal(out.reviewerId, 'curator-1');
});

test('applyGovernanceDecision records the transition in notes', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  const out = applyGovernanceDecision(r, 'validated', { notes: 'confirmed', now: LATER });
  assert.match(out.notes!, /pending → validated/);
  assert.match(out.notes!, /confirmed/);
});

test('applyGovernanceDecision is immutable (returns new object)', () => {
  const r = buildGovernanceReview(evalFor(win), NOW);
  const out = applyGovernanceDecision(r, 'approved', { now: LATER });
  assert.notEqual(out, r);
  assert.equal(r.decision, 'pending');
});

test('multi-step transition pending -> escalated -> validated', () => {
  let r = buildGovernanceReview(evalFor(win), NOW);
  r = applyGovernanceDecision(r, 'escalated', { now: LATER });
  r = applyGovernanceDecision(r, 'validated', { reviewerId: 'admin', now: LATER });
  assert.equal(r.decision, 'validated');
  assert.match(r.notes!, /escalated → validated/);
});

test('isTerminal true for approved/rejected/validated', () => {
  assert.equal(isTerminal('approved'), true);
  assert.equal(isTerminal('rejected'), true);
  assert.equal(isTerminal('validated'), true);
});

test('isTerminal false for pending/escalated', () => {
  assert.equal(isTerminal('pending'), false);
  assert.equal(isTerminal('escalated'), false);
});

test('canValidate true for admin/curator/reviewer', () => {
  assert.equal(canValidate('admin'), true);
  assert.equal(canValidate('curator'), true);
  assert.equal(canValidate('reviewer'), true);
});

test('canValidate false for viewer/researcher', () => {
  assert.equal(canValidate('viewer'), false);
  assert.equal(canValidate('researcher'), false);
});

test('canValidate is case-insensitive', () => {
  assert.equal(canValidate('ADMIN'), true);
  assert.equal(canValidate('Curator'), true);
});

test('buildOutcomeAuditTrail has all 6 steps in order', () => {
  const e = tagInterventionType(evalFor(win), 'reduce_amplification');
  const learning = learnFromOutcomes([e], undefined, NOW).find(
    (l) => l.interventionType === 'reduce_amplification',
  );
  const review = buildGovernanceReview(e, NOW);
  const trail = buildOutcomeAuditTrail(rec(), e, learning, review);
  const steps = trail.map((t) => t.step);
  assert.deepEqual(steps, [
    'Recommendation',
    'Expected',
    'Observed',
    'Success Score',
    'Confidence Update',
    'Governance Review',
  ]);
});

test('audit trail works without learning/review', () => {
  const e = evalFor(win);
  const trail = buildOutcomeAuditTrail(rec(), e, undefined, undefined);
  assert.equal(trail.length, 6);
  assert.match(trail[5].detail, /pending human action/);
});

test('audit Expected step shows expected outcome', () => {
  const e = evalFor(win);
  const trail = buildOutcomeAuditTrail(rec(), e, undefined, undefined);
  assert.match(trail[1].detail, /signalDeltaPct/);
});

test('audit Success Score step shows score and status', () => {
  const e = evalFor(win);
  const trail = buildOutcomeAuditTrail(rec(), e, undefined, undefined);
  assert.match(trail[3].detail, /100/);
  assert.match(trail[3].detail, /successful/);
});

test('audit Confidence Update shows before -> after', () => {
  const e = evalFor(win);
  const trail = buildOutcomeAuditTrail(rec(), e, undefined, undefined);
  assert.match(trail[4].detail, /→/);
});

test('audit derives expected from effect when no expectedOutcome', () => {
  const r = rec({ expectedOutcome: undefined });
  const e = evaluateOutcome(r, win, NOW);
  const trail = buildOutcomeAuditTrail(r, e, undefined, undefined);
  assert.match(trail[1].detail, /signalDeltaPct=-40/);
});

test('applyGovernanceDecision keeps prior reviewerId when not overridden', () => {
  let r = buildGovernanceReview(evalFor(win), NOW);
  r = applyGovernanceDecision(r, 'escalated', { reviewerId: 'rev-1', now: LATER });
  const out = applyGovernanceDecision(r, 'validated', { now: LATER });
  assert.equal(out.reviewerId, 'rev-1');
});

test('outcomeDemo runs end-to-end', () => {
  const demo = outcomeDemo();
  assert.equal(demo.evaluations.length, 5);
  assert.ok(demo.alerts.length > 0);
  assert.equal(demo.review.decision, 'pending');
  assert.equal(demo.validatedReview.decision, 'validated');
  assert.equal(demo.auditTrail.length, 6);
});

test('outcomeDemo covers every OutcomeStatus', () => {
  const demo = outcomeDemo();
  const statuses = new Set(demo.evaluations.map((e) => e.outcomeStatus));
  assert.ok(statuses.has('successful'));
  assert.ok(statuses.has('partially_successful'));
  assert.ok(statuses.has('neutral'));
  assert.ok(statuses.has('unsuccessful'));
  assert.ok(statuses.has('inconclusive'));
});

test('outcomeDemo winner confidence rises, loser falls', () => {
  const demo = outcomeDemo();
  assert.ok(demo.winnerConfidence! > 0.5);
  assert.ok(demo.loserConfidence! < 0.5);
});

test('outcomeDemo fires every alert type', () => {
  const demo = outcomeDemo();
  const types = new Set(demo.alerts.map((a) => a.alertType));
  assert.ok(types.has('recommendation_failed'));
  assert.ok(types.has('confidence_drift'));
  assert.ok(types.has('narrative_spike'));
  assert.ok(types.has('forecast_miss'));
  assert.ok(types.has('resurgence'));
  assert.ok(types.has('security_anomaly'));
});

test('outcomeDemo is deterministic', () => {
  assert.deepEqual(outcomeDemo(), outcomeDemo());
});

test('all GovernanceDecision values handled by isTerminal', () => {
  const all: GovernanceDecision[] = ['pending', 'approved', 'rejected', 'escalated', 'validated'];
  for (const d of all) assert.equal(typeof isTerminal(d), 'boolean');
});

test('mergedLearning in demo accumulates samples', () => {
  const demo = outcomeDemo();
  const ra = demo.mergedLearning.find((l) => l.interventionType === 'reduce_amplification');
  assert.ok(ra && ra.sampleCount >= 4);
});
