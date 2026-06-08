import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNarrativeDrift, trackNarrative } from '../src/drift';
import { DEMO_DRIFT_PAIR } from '../src/fixtures';

const NOW = '2026-01-01T00:00:00.000Z';

test('detectNarrativeDrift: identical text => null', () => {
  const same = 'the movement believes in sustainable living and smaller families';
  assert.equal(detectNarrativeDrift(same, same, NOW), null);
});

test('detectNarrativeDrift: meaningful related shift => event', () => {
  const ev = detectNarrativeDrift(DEMO_DRIFT_PAIR.before.text, DEMO_DRIFT_PAIR.after.text, NOW);
  assert.ok(ev, 'expected a drift event');
  assert.ok(ev!.explanation.length > 0);
  assert.ok(ev!.confidence > 0 && ev!.confidence <= 0.95);
  assert.ok(ev!.driftScore > 0 && ev!.driftScore <= 1);
  assert.equal(ev!.detectedAt, NOW);
});

test('detectNarrativeDrift: unrelated topics => null (replacement, not drift)', () => {
  const a = 'a guide to composting kitchen scraps and growing tomatoes in summer';
  const b = 'quarterly semiconductor supply forecasts and lithography equipment orders';
  assert.equal(detectNarrativeDrift(a, b, NOW), null);
});

test('trackNarrative: pairwise drift across a timeline', () => {
  const events = trackNarrative([
    { text: DEMO_DRIFT_PAIR.before.text, at: DEMO_DRIFT_PAIR.before.at },
    { text: DEMO_DRIFT_PAIR.after.text, at: DEMO_DRIFT_PAIR.after.at },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].detectedAt, DEMO_DRIFT_PAIR.after.at);
});
