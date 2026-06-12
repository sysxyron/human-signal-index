import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discoverResearchOpportunities, priorityForUrgency } from '../src/discovery';
import { DEMO_DISCOVERY_INPUTS, FIXTURE_NOW } from '../src/fixtures';
import type { DiscoveryInput } from '../src/types';

const NOW = FIXTURE_NOW;

test('priorityForUrgency buckets', () => {
  assert.equal(priorityForUrgency(0.9), 'CRITICAL');
  assert.equal(priorityForUrgency(0.65), 'HIGH');
  assert.equal(priorityForUrgency(0.4), 'NORMAL');
  assert.equal(priorityForUrgency(0.1), 'LOW');
});

test('discovers one opportunity per input', () => {
  const opps = discoverResearchOpportunities(DEMO_DISCOVERY_INPUTS, { now: NOW });
  assert.equal(opps.length, DEMO_DISCOVERY_INPUTS.length);
});

test('every opportunity is proposed (never auto-published)', () => {
  const opps = discoverResearchOpportunities(DEMO_DISCOVERY_INPUTS, { now: NOW });
  assert.ok(opps.every((o) => o.status === 'proposed'));
});

test('opportunities carry id/title/reason/confidence/priority/source', () => {
  const opps = discoverResearchOpportunities(DEMO_DISCOVERY_INPUTS, { now: NOW });
  for (const o of opps) {
    assert.ok(o.id.length > 0);
    assert.ok(o.title.length > 0);
    assert.ok(o.reason.length > 0);
    assert.ok(o.confidence >= 0 && o.confidence <= 1);
    assert.ok(['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(o.priority));
  }
});

test('trust_drift outranks evidence', () => {
  const inputs: DiscoveryInput[] = [
    { source: 'evidence', entityId: 'e1', weight: 0.5 },
    { source: 'trust_drift', entityId: 't1', weight: 0.5 },
  ];
  const opps = discoverResearchOpportunities(inputs, { now: NOW });
  assert.equal(opps[0].source, 'trust_drift');
});

test('higher weight raises confidence', () => {
  const low = discoverResearchOpportunities([{ source: 'signal', entityId: 'a', weight: 0.1 }], { now: NOW })[0];
  const high = discoverResearchOpportunities([{ source: 'signal', entityId: 'a', weight: 0.9 }], { now: NOW })[0];
  assert.ok(high.confidence > low.confidence);
});

test('sorted highest priority first', () => {
  const opps = discoverResearchOpportunities(DEMO_DISCOVERY_INPUTS, { now: NOW });
  const rank = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
  for (let i = 1; i < opps.length; i++) {
    assert.ok(rank[opps[i - 1].priority] <= rank[opps[i].priority]);
  }
});

test('empty inputs -> empty opportunities', () => {
  assert.deepEqual(discoverResearchOpportunities([], { now: NOW }), []);
});

test('entityId carried through', () => {
  const opps = discoverResearchOpportunities([{ source: 'alert', entityId: 'alert-9' }], { now: NOW });
  assert.equal(opps[0].entityId, 'alert-9');
});

test('createdAt uses injected now', () => {
  const opps = discoverResearchOpportunities([{ source: 'signal', entityId: 'a' }], { now: '2030-01-01T00:00:00.000Z' });
  assert.equal(opps[0].createdAt, '2030-01-01T00:00:00.000Z');
});

test('deterministic discovery', () => {
  assert.deepEqual(
    discoverResearchOpportunities(DEMO_DISCOVERY_INPUTS, { now: NOW }),
    discoverResearchOpportunities(DEMO_DISCOVERY_INPUTS, { now: NOW }),
  );
});
