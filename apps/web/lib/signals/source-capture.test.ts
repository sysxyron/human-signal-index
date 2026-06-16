// =============================================================================
// HSI Phase 40B — source-capture pipeline tests (node:test, run via tsx).
//
// These exercise the orchestration LOGIC through the injected CapturePersistence
// port with an in-memory fake (no DB, no network), plus the cron auth guard and
// the Supabase loader's filter. Covers: DB loader reads active sources, disabled/
// not-due skipped, RSS creates signals + dedupes, watchlist baseline-then-change,
// failed source records an event, unsupported/misconfigured events, health.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureOneSource,
  runSourceCaptureBatch,
  isSourceDue,
  createSupabaseCapturePersistence,
  type CapturePersistence,
  type DueSource,
} from './source-capture';
import { isCronAuthorized } from '../cron/auth';
import type {
  CreateCaptureEventInput,
  CreateDiffInput,
  CreateSignalInput,
  CreateSnapshotInput,
} from './source-capture-persistence';

const NOW = '2026-06-15T12:00:00.000Z';

const RSS_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>First post</title><link>https://ex.org/1</link><description>Body one about the topic.</description></item>
<item><title>Second post</title><link>https://ex.org/2</link><description>Body two about the topic.</description></item>
</channel></rss>`;

const PAGE_V1 = '<html><body><main><p>Original manifesto text.</p></main></body></html>';
const PAGE_V2 = '<html><body><main><p>Substantially revised manifesto text with new claims.</p></main></body></html>';

// -----------------------------------------------------------------------------
// In-memory persistence fake.
// -----------------------------------------------------------------------------

interface SnapRow extends CreateSnapshotInput { id: string }
interface SigRow extends CreateSignalInput { id: string }

class FakePersistence implements CapturePersistence {
  sources: DueSource[] = [];
  snapshots: SnapRow[] = [];
  diffs: Array<CreateDiffInput & { id: string }> = [];
  events: Array<CreateCaptureEventInput & { id: string }> = [];
  signals: SigRow[] = [];
  health: Array<{ sourceId: string; status?: string; lastSuccess?: string; lastFailure?: string }> = [];
  touched: Array<{ sourceId: string; changed: boolean }> = [];

  async loadDueSources(): Promise<DueSource[]> {
    return this.sources;
  }
  async latestSnapshot(sourceId: string) {
    const s = [...this.snapshots].reverse().find((x) => x.sourceId === sourceId);
    return s ? { contentHash: s.contentHash, length: s.contentText.length } : null;
  }
  async createSnapshot(input: CreateSnapshotInput) {
    const row = { id: `snap${this.snapshots.length + 1}`, ...input };
    this.snapshots.push(row);
    return { id: row.id };
  }
  async createDiff(input: CreateDiffInput) {
    const row = { id: `diff${this.diffs.length + 1}`, ...input };
    this.diffs.push(row);
    return { id: row.id };
  }
  async existingSignalHashes(sourceId: string, hashes: string[]) {
    const set = new Set<string>();
    for (const s of this.signals) {
      if (s.sourceId === sourceId && hashes.includes(s.contentHash)) set.add(s.contentHash);
    }
    return set;
  }
  async createSignal(input: CreateSignalInput) {
    const row = { id: `sig${this.signals.length + 1}`, ...input };
    this.signals.push(row);
    return { id: row.id };
  }
  async createCaptureEvent(input: CreateCaptureEventInput) {
    const row = { id: `evt${this.events.length + 1}`, ...input };
    this.events.push(row);
    return { id: row.id };
  }
  async updateHealth(sourceId: string, h: { status?: string; lastSuccess?: string; lastFailure?: string }) {
    this.health.push({ sourceId, ...h });
  }
  async touchChecked(sourceId: string, changed: boolean) {
    this.touched.push({ sourceId, changed });
  }
}

const fixedFetch = (body: string) => async () => body;
const sequenceFetch = (bodies: string[]) => {
  let i = 0;
  return async () => bodies[Math.min(i++, bodies.length - 1)];
};

function rssSource(over: Partial<DueSource> = {}): DueSource {
  return {
    id: 's-rss',
    name: 'Example feed',
    source_type: 'rss',
    status: 'active',
    monitoring_enabled: true,
    config: { captureUrl: 'https://example.org/feed.xml' },
    last_checked_at: null,
    ...over,
  };
}
function watchlistSource(over: Partial<DueSource> = {}): DueSource {
  return {
    id: 's-wl',
    name: 'Manifesto page',
    source_type: 'watchlist',
    status: 'active',
    monitoring_enabled: true,
    config: { captureUrl: 'https://example.org/manifesto' },
    last_checked_at: null,
    ...over,
  };
}

// -----------------------------------------------------------------------------
// RSS / feed behavior.
// -----------------------------------------------------------------------------

test('RSS source: first capture creates a signal per entry + a snapshot + event', async () => {
  const p = new FakePersistence();
  const out = await captureOneSource(p, rssSource(), { fetchText: fixedFetch(RSS_XML), now: NOW });

  assert.equal(out.ok, true);
  assert.equal(out.status, 'healthy');
  assert.equal(out.signalsCreated, 2, 'two feed entries → two signals');
  assert.equal(p.signals.length, 2);
  assert.equal(p.snapshots.length, 1, 'snapshot stored');
  assert.equal(p.events.length, 1, 'one capture event');
  assert.equal(p.events[0].status, 'healthy');
  assert.equal(p.events[0].itemsCaptured, 2);
  // health + touch recorded
  assert.equal(p.health.at(-1)?.status, 'healthy');
  assert.equal(p.touched.length, 1);
});

test('RSS source: second identical capture dedupes (no new signals) and records a no-change diff', async () => {
  const p = new FakePersistence();
  const src = rssSource();
  await captureOneSource(p, src, { fetchText: fixedFetch(RSS_XML), now: NOW });
  const out2 = await captureOneSource(p, src, { fetchText: fixedFetch(RSS_XML), now: '2026-06-15T13:00:00.000Z' });

  assert.equal(out2.signalsCreated, 0, 'identical entries are deduped by content hash');
  assert.equal(p.signals.length, 2, 'still only the original two signals');
  assert.equal(p.snapshots.length, 2, 'a snapshot per capture');
  assert.equal(p.diffs.length, 1, 'a diff is recorded once there is a prior snapshot');
  assert.equal(p.diffs[0].changed, false, 'identical content → unchanged diff');
});

// -----------------------------------------------------------------------------
// Watchlist behavior (baseline → change).
// -----------------------------------------------------------------------------

test('watchlist: first capture stores a baseline snapshot only (no diff, no signal)', async () => {
  const p = new FakePersistence();
  const out = await captureOneSource(p, watchlistSource(), { fetchText: fixedFetch(PAGE_V1), now: NOW });

  assert.equal(out.snapshotsCreated, 1);
  assert.equal(out.diffsCreated, 0, 'no diff on the baseline');
  assert.equal(out.signalsCreated, 0, 'no signal on the baseline');
  assert.match(out.reason, /baseline/i);
  assert.equal(p.events[0].status, 'healthy');
  assert.equal(p.events[0].contentChanged, false);
});

test('watchlist: a changed second capture creates a diff + exactly one signal', async () => {
  const p = new FakePersistence();
  const src = watchlistSource();
  const fetchText = sequenceFetch([PAGE_V1, PAGE_V2, PAGE_V2]);

  await captureOneSource(p, src, { fetchText, now: NOW }); // baseline
  const changed = await captureOneSource(p, src, { fetchText, now: '2026-06-15T13:00:00.000Z' });

  assert.equal(changed.signalsCreated, 1, 'page changed → one signal');
  assert.equal(changed.diffsCreated, 1);
  assert.equal(p.diffs.at(-1)?.changed, true);
  assert.equal(p.diffs.at(-1)?.signalId, p.signals.at(-1)?.id, 'diff links the produced signal');

  // Third identical-to-v2 capture: no change → no new signal, unchanged diff.
  const unchanged = await captureOneSource(p, src, { fetchText, now: '2026-06-15T14:00:00.000Z' });
  assert.equal(unchanged.signalsCreated, 0);
  assert.match(unchanged.reason, /no content change/i);
});

// -----------------------------------------------------------------------------
// Failure / unsupported / misconfigured — never silent.
// -----------------------------------------------------------------------------

test('failed fetch records a failing/warning capture event and no snapshot', async () => {
  const p = new FakePersistence();
  const fetchText = async () => {
    throw new Error('fetch failed 500 for https://example.org/feed.xml');
  };
  const out = await captureOneSource(p, rssSource(), { fetchText, now: NOW });

  assert.equal(out.ok, false);
  assert.equal(p.snapshots.length, 0);
  assert.equal(p.events.length, 1);
  assert.ok(['warning', 'failing'].includes(p.events[0].status));
  assert.ok(p.events[0].error?.includes('fetch failed'));
});

test('unsupported (foundation) source records an unsupported event', async () => {
  const p = new FakePersistence();
  const out = await captureOneSource(
    p,
    { id: 's-man', name: 'A doc', source_type: 'manual', status: 'active', monitoring_enabled: true, config: {} },
    { fetchText: fixedFetch(''), now: NOW },
  );
  assert.equal(out.status, 'unsupported');
  assert.equal(p.events[0].status, 'unsupported');
  assert.equal(p.snapshots.length, 0);
});

test('unknown source type records an unsupported event with a clear reason', async () => {
  const p = new FakePersistence();
  const out = await captureOneSource(
    p,
    { id: 's-x', name: 'Mystery', source_type: 'telepathy', status: 'active', monitoring_enabled: true },
    { fetchText: fixedFetch(''), now: NOW },
  );
  assert.equal(out.status, 'unsupported');
  assert.match(out.reason, /unknown source type/i);
});

test('supported source missing a URL records needs_configuration', async () => {
  const p = new FakePersistence();
  const out = await captureOneSource(
    p,
    { id: 's-rss2', name: 'No URL feed', source_type: 'rss', status: 'active', monitoring_enabled: true, config: {} },
    { fetchText: fixedFetch(RSS_XML), now: NOW },
  );
  assert.equal(out.status, 'needs_configuration');
  assert.equal(p.events[0].status, 'needs_configuration');
});

// -----------------------------------------------------------------------------
// Due filtering + batch.
// -----------------------------------------------------------------------------

test('isSourceDue: never-checked is due; recently-checked is not; old is due', () => {
  assert.equal(isSourceDue(rssSource({ last_checked_at: null }), NOW), true);
  assert.equal(isSourceDue(rssSource({ last_checked_at: '2026-06-15T11:59:00.000Z' }), NOW), false);
  assert.equal(isSourceDue(rssSource({ last_checked_at: '2026-06-15T10:00:00.000Z' }), NOW), true);
  // watchlist with a long interval is not due after a recent check
  assert.equal(
    isSourceDue(watchlistSource({ config: { captureUrl: 'https://example.org/x', captureIntervalMinutes: 720 }, last_checked_at: '2026-06-15T09:00:00.000Z' }), NOW),
    false,
  );
});

test('runSourceCaptureBatch processes only DUE sources and aggregates a summary', async () => {
  const p = new FakePersistence();
  p.sources = [
    rssSource({ id: 'due', last_checked_at: null }),
    rssSource({ id: 'not-due', last_checked_at: '2026-06-15T11:59:00.000Z' }),
  ];
  const summary = await runSourceCaptureBatch(p, { fetchText: fixedFetch(RSS_XML), now: NOW });

  assert.equal(summary.sourcesChecked, 1);
  assert.equal(summary.sourcesSkipped, 1);
  assert.equal(summary.capturesSucceeded, 1);
  assert.equal(summary.signalsCreated, 2);
  assert.equal(summary.snapshotsCreated, 1);
});

test('runSourceCaptureBatch with dueOnly=false captures every active source', async () => {
  const p = new FakePersistence();
  p.sources = [
    rssSource({ id: 'a', last_checked_at: '2026-06-15T11:59:00.000Z' }),
    rssSource({ id: 'b', last_checked_at: '2026-06-15T11:59:30.000Z' }),
  ];
  const summary = await runSourceCaptureBatch(p, { fetchText: fixedFetch(RSS_XML), now: NOW, dueOnly: false });
  assert.equal(summary.sourcesChecked, 2);
  assert.equal(summary.sourcesSkipped, 0);
});

// -----------------------------------------------------------------------------
// Supabase loader: filters to monitoring_enabled = true AND status = active.
// -----------------------------------------------------------------------------

test('createSupabaseCapturePersistence.loadDueSources filters active + monitored', async () => {
  const calls: Array<[string, unknown]> = [];
  const rows = [{ id: 's1', name: 'n', source_type: 'rss', status: 'active', monitoring_enabled: true }];
  const builder: any = {
    select() { return builder; },
    eq(col: string, val: unknown) { calls.push([col, val]); return builder; },
    then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }); },
  };
  const fakeClient: any = { from(table: string) { calls.push(['__table', table]); return builder; } };

  const persistence = createSupabaseCapturePersistence(fakeClient);
  const out = await persistence.loadDueSources(NOW);

  assert.equal(out.length, 1);
  assert.deepEqual(calls.find((c) => c[0] === '__table'), ['__table', 'hsin_sources']);
  assert.ok(calls.some((c) => c[0] === 'monitoring_enabled' && c[1] === true));
  assert.ok(calls.some((c) => c[0] === 'status' && c[1] === 'active'));
});

// -----------------------------------------------------------------------------
// Cron authorization.
// -----------------------------------------------------------------------------

test('isCronAuthorized accepts the secret via Bearer / header / query and rejects otherwise', () => {
  const secret = 'super-secret-value';
  assert.equal(isCronAuthorized({ authorization: `Bearer ${secret}` }, secret), true);
  assert.equal(isCronAuthorized({ cronSecretHeader: secret }, secret), true);
  assert.equal(isCronAuthorized({ querySecret: secret }, secret), true);
  assert.equal(isCronAuthorized({ authorization: 'Bearer wrong' }, secret), false);
  assert.equal(isCronAuthorized({ querySecret: 'nope' }, secret), false);
  assert.equal(isCronAuthorized({}, secret), false);
  // Fail-closed when no secret is configured.
  assert.equal(isCronAuthorized({ authorization: 'Bearer anything' }, undefined), false);
  assert.equal(isCronAuthorized({ querySecret: '' }, ''), false);
});
