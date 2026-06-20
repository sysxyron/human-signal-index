import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSignalHealth } from './health';
import { summarizeInfluence, influenceRank, attributionFlags, EMPTY_INFLUENCE } from './influence';
import { tallyRelationships } from './relationships';
import { SIGNAL_HEALTHS, type SignalHealthInput } from './types';

const NOW = '2026-06-20T00:00:00.000Z';
const daysAgo = (d: number) => new Date(new Date(NOW).getTime() - d * 86400000).toISOString();
function h(over: Partial<SignalHealthInput>): SignalHealthInput {
  return { hasNode: true, signalStatus: 'approved', incomingContradicts: 0, publishedAsCount: 0, correctedByCount: 0, totalEdges: 0, narrativeCount: 0, recentActivity: 0, priorActivity: 0, lastActivityAt: null, nowIso: NOW, ...over };
}

// ---- D1: signal health (deterministic) -------------------------------------

test('health: no node + no relationships → UNKNOWN', () => {
  assert.equal(computeSignalHealth(h({ hasNode: false })).value, 'UNKNOWN');
});
test('health: node but zero relationships → UNKNOWN (never fabricated ACTIVE)', () => {
  assert.equal(computeSignalHealth(h({ hasNode: true, totalEdges: 0, narrativeCount: 0 })).value, 'UNKNOWN');
});
test('health: incoming CONTRADICTS → CONTRADICTED', () => {
  assert.equal(computeSignalHealth(h({ incomingContradicts: 2, totalEdges: 3 })).value, 'CONTRADICTED');
});
test('health: PUBLISHED_AS → RESOLVED', () => {
  assert.equal(computeSignalHealth(h({ publishedAsCount: 1, totalEdges: 2 })).value, 'RESOLVED');
});
test('health: rejected / corrected → ARCHIVED', () => {
  assert.equal(computeSignalHealth(h({ signalStatus: 'rejected', totalEdges: 1 })).value, 'ARCHIVED');
  assert.equal(computeSignalHealth(h({ correctedByCount: 1, totalEdges: 1 })).value, 'ARCHIVED');
});
test('health: rising activity → ESCALATING; steady recent → ACTIVE', () => {
  assert.equal(computeSignalHealth(h({ totalEdges: 5, recentActivity: 4, priorActivity: 1, lastActivityAt: daysAgo(2) })).value, 'ESCALATING');
  assert.equal(computeSignalHealth(h({ totalEdges: 5, recentActivity: 2, priorActivity: 2, lastActivityAt: daysAgo(2) })).value, 'ACTIVE');
});
test('health: history but no recent activity → DORMANT', () => {
  assert.equal(computeSignalHealth(h({ totalEdges: 3, recentActivity: 0, priorActivity: 0, lastActivityAt: daysAgo(120) })).value, 'DORMANT');
});
test('health: always a valid status + reason', () => {
  const r = computeSignalHealth(h({ totalEdges: 1, narrativeCount: 1, recentActivity: 1, lastActivityAt: daysAgo(1) }));
  assert.ok((SIGNAL_HEALTHS as readonly string[]).includes(r.value));
  assert.ok(r.reason.length > 0);
});
test('health precedence: contradicted beats archived status', () => {
  assert.equal(computeSignalHealth(h({ signalStatus: 'rejected', incomingContradicts: 1, totalEdges: 2 })).value, 'CONTRADICTED');
});

// ---- D2: influence metrics (real counts only) ------------------------------

test('influence: empty → not observed, zero reach/usage', () => {
  const s = summarizeInfluence(EMPTY_INFLUENCE);
  assert.equal(s.observed, false); assert.equal(s.reach, 0); assert.equal(s.downstreamUsage, 0); assert.equal(s.supportingEvidence, 0);
});
test('influence: real counts → reach + downstream usage are plain sums', () => {
  const s = summarizeInfluence({ ...EMPTY_INFLUENCE, evidenceCount: 3, reportCount: 2, narrativeCount: 1, forecastCount: 1, relationshipCount: 6, supportsCount: 3, distinctConnectedNodes: 5, recentActivity: 2 });
  assert.equal(s.reach, 5);
  assert.equal(s.downstreamUsage, 2 + 1 + 1); // reports + forecasts + narratives
  assert.equal(s.supportingEvidence, 3);
  assert.equal(s.observed, true);
});
test('influence: rank is a deterministic sum (no hidden weights)', () => {
  const a = summarizeInfluence({ ...EMPTY_INFLUENCE, reportCount: 2, forecastCount: 1, narrativeCount: 1, distinctConnectedNodes: 4, evidenceCount: 2, relationshipCount: 5 });
  assert.equal(influenceRank(a), a.downstreamUsage + a.reach + a.evidenceCount);
});

// ---- D3: relationship tally (every edge → a real record) -------------------

test('relationships: only edges to real nodes are counted; missing dropped', () => {
  const real = new Set(['n2', 'n3']);
  const t = tallyRelationships([
    { relationshipType: 'SUPPORTS', otherNodeId: 'n2', direction: 'outgoing' },
    { relationshipType: 'CONTRADICTS', otherNodeId: 'n3', direction: 'incoming' },
    { relationshipType: 'REFERENCES', otherNodeId: 'ghost', direction: 'outgoing' }, // missing node → dropped
  ], real);
  assert.equal(t.total, 2);
  assert.equal(t.byType.SUPPORTS, 1);
  assert.equal(t.byType.CONTRADICTS, 1);
  assert.equal(t.byType.REFERENCES, 0);
  assert.equal(t.dropped, 1);
});
test('relationships: unknown relationship types are ignored (never invented)', () => {
  const t = tallyRelationships([{ relationshipType: 'MENTIONS', otherNodeId: 'n1', direction: 'outgoing' }], new Set(['n1']));
  assert.equal(t.total, 0);
});

// ---- D8: attribution flags -------------------------------------------------

test('attribution flags reflect real presence only', () => {
  const f = attributionFlags({ sourceId: 'src-1', narrativeCount: 2, forecastCount: 0, relationshipCount: 4, evidenceCount: 1, hasGeo: false });
  assert.deepEqual(f, { hasSourceLineage: true, hasNarrative: true, hasForecast: false, hasRelationship: true, hasEvidence: true, hasGeo: false });
  const empty = attributionFlags({ sourceId: null, narrativeCount: 0, forecastCount: 0, relationshipCount: 0, evidenceCount: 0, hasGeo: false });
  assert.deepEqual(empty, { hasSourceLineage: false, hasNarrative: false, hasForecast: false, hasRelationship: false, hasEvidence: false, hasGeo: false });
});
