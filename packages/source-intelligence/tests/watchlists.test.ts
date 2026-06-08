import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchWatchlists, DEFAULT_WATCHLISTS } from '../src/watchlists';

test('matchWatchlists: hits Extinctionism terms', () => {
  const matches = matchWatchlists(
    { title: 'On human extinction', summary: 'A defense of extinctionism', category: 'extinction' },
    DEFAULT_WATCHLISTS,
  );
  const names = matches.map((m) => m.watchlistName);
  assert.ok(names.includes('Extinctionism'), `got ${names.join(', ')}`);
  const ext = matches.find((m) => m.watchlistName === 'Extinctionism')!;
  assert.ok(ext.matchedTerms.length >= 1);
  assert.equal(ext.severity, 'HIGH');
  assert.ok(ext.score > 0 && ext.score <= 1);
});

test('matchWatchlists: miss => []', () => {
  const matches = matchWatchlists(
    { title: 'Local farmers market opens Saturday', summary: 'fresh produce and crafts' },
    DEFAULT_WATCHLISTS,
  );
  assert.deepEqual(matches, []);
});

test('matchWatchlists: phrase + word-boundary matching', () => {
  const matches = matchWatchlists(
    { title: 'A call for population reduction', summary: 'depopulation now' },
    DEFAULT_WATCHLISTS,
  );
  assert.ok(matches.some((m) => m.watchlistName === 'Population Reduction'));
});

test('matchWatchlists: sorted by severity then score', () => {
  const matches = matchWatchlists(
    { title: 'extinctionism doomer', summary: 'efilism and doomscroll', category: 'extinction' },
    DEFAULT_WATCHLISTS,
  );
  // First match must be a HIGH-severity list, not the LOW Doom list.
  assert.ok(matches.length >= 2);
  assert.equal(matches[0].severity, 'HIGH');
});
