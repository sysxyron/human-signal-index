import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTriage,
  DEFAULT_TRIAGE_RULES,
  type TriageRule,
  type TriageContext,
} from '../src/triage';

test('evaluateTriage: high-risk ctx → create_alert + submit_review with rationale', () => {
  const ctx: TriageContext = { riskLevel: 0.9, signalId: 'sig_1', confidence: 0.8 };
  const out = evaluateTriage(ctx, DEFAULT_TRIAGE_RULES);
  assert.ok(out.matchedRuleIds.includes('tr_high_risk_signal'));
  const types = out.actions.map((a) => a.type);
  assert.ok(types.includes('create_alert'));
  assert.ok(types.includes('submit_review'));
  assert.ok(out.actions.every((a) => a.rationale.length > 0));
  assert.ok(out.actions[0].rationale.includes('sig_1'));
  assert.match(out.actions[0].rationale, /risk_level/);
});

test('evaluateTriage: watchlist match → create_alert', () => {
  const ctx: TriageContext = { watchlistMatches: ['Extinctionism'], signalId: 'sig_2' };
  const out = evaluateTriage(ctx, DEFAULT_TRIAGE_RULES);
  assert.ok(out.matchedRuleIds.includes('tr_watchlist_match'));
  assert.ok(out.actions.some((a) => a.type === 'create_alert'));
});

test('evaluateTriage: repeated source failures → degrade_source_health', () => {
  const ctx: TriageContext = { sourceFailureCount: 5, sourceId: 'src_x' };
  const out = evaluateTriage(ctx, DEFAULT_TRIAGE_RULES);
  assert.ok(out.matchedRuleIds.includes('tr_source_failures'));
  assert.ok(out.actions.some((a) => a.type === 'degrade_source_health'));
  assert.ok(out.actions[0].rationale.includes('src_x'));
});

test('evaluateTriage: high drift → create_alert + assign_sla', () => {
  const ctx: TriageContext = { driftSeverity: 0.8, signalId: 'sig_3' };
  const out = evaluateTriage(ctx, DEFAULT_TRIAGE_RULES);
  assert.ok(out.matchedRuleIds.includes('tr_high_drift'));
  const types = out.actions.map((a) => a.type);
  assert.ok(types.includes('create_alert'));
  assert.ok(types.includes('assign_sla'));
});

test('evaluateTriage: contradiction → request_research_review', () => {
  const ctx: TriageContext = { contradiction: true, signalId: 'sig_4' };
  const out = evaluateTriage(ctx, DEFAULT_TRIAGE_RULES);
  assert.ok(out.matchedRuleIds.includes('tr_contradiction'));
  assert.ok(out.actions.some((a) => a.type === 'request_research_review'));
});

test('evaluateTriage: disabled rule is skipped', () => {
  const rules: TriageRule[] = [
    {
      id: 'tr_disabled',
      name: 'Disabled high-risk',
      enabled: false,
      conditions: [{ field: 'risk_level', op: 'gte', value: 0.1 }],
      actions: [{ type: 'create_alert' }],
    },
  ];
  const out = evaluateTriage({ riskLevel: 0.99 }, rules);
  assert.deepEqual(out.matchedRuleIds, []);
  assert.deepEqual(out.actions, []);
});

test('evaluateTriage: low-risk ctx fires nothing', () => {
  const out = evaluateTriage({ riskLevel: 0.1, confidence: 0.2 }, DEFAULT_TRIAGE_RULES);
  assert.deepEqual(out.matchedRuleIds, []);
  assert.deepEqual(out.actions, []);
});

test('evaluateTriage: category `in` condition works', () => {
  const rules: TriageRule[] = [
    {
      id: 'tr_cat',
      name: 'Sensitive categories',
      enabled: true,
      conditions: [{ field: 'category', op: 'in', value: ['extinction', 'population'] }],
      actions: [{ type: 'submit_review' }],
    },
  ];
  assert.ok(evaluateTriage({ category: 'extinction' }, rules).matchedRuleIds.includes('tr_cat'));
  assert.deepEqual(evaluateTriage({ category: 'technology' }, rules).matchedRuleIds, []);
});
