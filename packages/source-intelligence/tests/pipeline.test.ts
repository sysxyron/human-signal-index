import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runIntakePipeline,
  FixtureCaptureProvider,
  DEMO_SOURCES,
  assertPublicCapturePolicy,
  CapturePolicyError,
  isPublicCaptureAllowed,
} from '../src/index';

const NOW = '2026-01-01T00:00:00.000Z';

test('runIntakePipeline: end-to-end on a website fixture', async () => {
  const fx = new FixtureCaptureProvider('website');
  const source = DEMO_SOURCES.find((s) => s.id === 'src_demo_site')!;
  const out = await runIntakePipeline(source, { extraProviders: [fx] }, NOW);

  assert.equal(out.capture.ok, true);
  assert.equal(out.capture.isFixture, true);
  assert.ok(out.signalDraft);
  assert.equal(out.signalDraft!.signalCategory, 'extinction');
  assert.equal(out.change?.changeType, 'new');
  assert.ok(out.classification);
  assert.ok(out.matches.some((m) => m.watchlistName === 'Extinctionism'));
  // Alerts: at least new_signal + watchlist_match + high_risk_signal; all explained.
  assert.ok(out.alerts.length >= 3);
  for (const a of out.alerts) assert.ok(a.explanation.length > 0);
  assert.ok(out.alerts.some((a) => a.alertType === 'high_risk_signal'));
});

test('runIntakePipeline: deterministic across runs', async () => {
  const source = DEMO_SOURCES.find((s) => s.id === 'src_demo_site')!;
  const a = await runIntakePipeline(source, { extraProviders: [new FixtureCaptureProvider('website')] }, NOW);
  const b = await runIntakePipeline(source, { extraProviders: [new FixtureCaptureProvider('website')] }, NOW);
  assert.deepEqual(a.alerts, b.alerts);
  assert.deepEqual(a.signalDraft, b.signalDraft);
});

test('runIntakePipeline: never throws + no network => graceful failure', async () => {
  const source = DEMO_SOURCES.find((s) => s.id === 'src_demo_site')!;
  // No fixture provider, network not allowed => capture fails but no throw.
  const out = await runIntakePipeline(source, {}, NOW);
  assert.equal(out.capture.ok, false);
  assert.equal(out.change, null);
  assert.deepEqual(out.alerts, []);
});

test('runIntakePipeline: detects modified vs prior', async () => {
  const fx = new FixtureCaptureProvider('website');
  const source = DEMO_SOURCES.find((s) => s.id === 'src_demo_site')!;
  const prior = 'Extinctionism is an ideology holding that human extinction would be ethically preferable. Related strands include antinatalism, efilism, and promortalism. This page describes the movement.';
  const out = await runIntakePipeline(source, { extraProviders: [fx], prior }, NOW);
  assert.ok(out.change);
  assert.ok(['modified', 'major', 'none'].includes(out.change!.changeType));
});

test('ethics: assertPublicCapturePolicy rejects auth/login URLs', () => {
  assert.throws(() => assertPublicCapturePolicy('https://example.org/login'), CapturePolicyError);
  assert.throws(() => assertPublicCapturePolicy('https://user:pass@example.org/x'), CapturePolicyError);
  assert.throws(() => assertPublicCapturePolicy('https://example.org/?token=abc'), CapturePolicyError);
  assert.equal(isPublicCaptureAllowed('https://example.org/public/article'), true);
  assert.equal(isPublicCaptureAllowed('https://example.org/login'), false);
});
