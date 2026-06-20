import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, toObjects, validateRow } from './csv';
import { classifySource } from './classify';
import { domainOf, detectExactDuplicate, detectDomainDuplicate, detectFeedDuplicate, detectRelatedSource, detectDuplicate } from './duplicates';
import { matchNarratives, matchWatchlists } from './matching';
import { blocksApproval, requiresConfirmation, type CandidateInput, type ExistingSource } from './types';

function cand(over: Partial<CandidateInput> = {}): CandidateInput {
  return { sourceName: 'Test', sourceType: null, category: null, primaryUrl: 'https://example.com', feedOrApiUrl: null, platform: null, captureIntervalMinutes: null, baselineRisk: null, contentSelector: null, priority: null, ingestionMode: null, tags: [], description: null, corroborationRule: null, notes: null, ...over };
}

// ---- CSV parsing -----------------------------------------------------------

test('parseCsv handles quotes, commas, newlines', () => {
  const m = parseCsv('a,b,c\n1,"two, with comma","line\nbreak"\n');
  assert.equal(m.length, 2);
  assert.deepEqual(m[0], ['a', 'b', 'c']);
  assert.deepEqual(m[1], ['1', 'two, with comma', 'line\nbreak']);
});

test('parseCsv handles escaped quotes', () => {
  const m = parseCsv('h\n"say ""hi"""');
  assert.equal(m[1][0], 'say "hi"');
});

test('toObjects keys by lowercased header', () => {
  const objs = toObjects(parseCsv('Source_Name,Primary_URL\nReuters,https://reuters.com'));
  assert.equal(objs[0].source_name, 'Reuters');
  assert.equal(objs[0].primary_url, 'https://reuters.com');
});

// ---- validation ------------------------------------------------------------

test('validateRow: valid row normalizes', () => {
  const v = validateRow({ source_name: 'Reuters', primary_url: 'https://reuters.com', source_type: 'newswire', tags: 'news;wire', baseline_risk_1_5: '2' });
  assert.ok(v.valid);
  assert.equal(v.normalized?.sourceName, 'Reuters');
  assert.deepEqual(v.normalized?.tags, ['news', 'wire']);
  assert.equal(v.normalized?.baselineRisk, 2);
});

test('validateRow: invalid rows carry errors', () => {
  assert.ok(!validateRow({ primary_url: 'https://x.com' }).valid);                 // no name
  assert.ok(!validateRow({ source_name: 'X' }).valid);                            // no url
  assert.ok(!validateRow({ source_name: 'X', primary_url: 'ftp://x' }).valid);    // bad scheme
  assert.ok(!validateRow({ source_name: 'X', primary_url: 'https://x', source_type: 'blog' }).valid); // bad type
  assert.ok(!validateRow({ source_name: 'X', primary_url: 'https://x', baseline_risk_1_5: '9' }).valid); // risk range
});

// ---- classification --------------------------------------------------------

test('classifySource: explicit category wins (high confidence)', () => {
  const c = classifySource(cand({ category: 'A', sourceType: 'forum' }));
  assert.equal(c.category, 'A');
  assert.equal(c.sourceType, 'forum');
  assert.ok(c.confidence >= 0.9);
});

test('classifySource: keyword inference + type inference', () => {
  assert.equal(classifySource(cand({ sourceName: 'OSINT Research Institute', description: 'intelligence analysis' })).category, 'C');
  assert.equal(classifySource(cand({ sourceName: 'Daily News Wire', description: 'press media' })).category, 'D');
  assert.equal(classifySource(cand({ primaryUrl: 'https://youtube.com/x' })).sourceType, 'youtube');
  assert.equal(classifySource(cand({ primaryUrl: 'https://senate.gov' })).sourceType, 'government');
  assert.equal(classifySource(cand({ feedOrApiUrl: 'https://x.com/feed.xml' })).sourceType, 'rss');
});

// ---- duplicates ------------------------------------------------------------

test('domainOf strips www + parses', () => {
  assert.equal(domainOf('https://www.Example.com/path'), 'example.com');
  assert.equal(domainOf('reuters.com'), 'reuters.com');
  assert.equal(domainOf(null), '');
});

const existing: ExistingSource[] = [
  { id: 's1', name: 'Example', homepageUrl: 'https://example.com', rssUrl: 'https://example.com/feed', sourceType: 'website' },
];

test('detectExactDuplicate on identical URL', () => {
  assert.equal(detectExactDuplicate(cand({ primaryUrl: 'https://example.com' }), existing)?.duplicateStatus, 'exact_duplicate');
  assert.equal(detectExactDuplicate(cand({ primaryUrl: 'https://other.com' }), existing), null);
});

test('detectDomainDuplicate / feed / related', () => {
  assert.equal(detectDomainDuplicate(cand({ primaryUrl: 'https://example.com/news' }), existing)?.duplicateStatus, 'domain_duplicate');
  assert.equal(detectFeedDuplicate(cand({ feedOrApiUrl: 'https://example.com/rss' }), existing)?.duplicateStatus, 'feed_duplicate');
  assert.equal(detectRelatedSource(cand({ primaryUrl: 'https://blog.example.com' }), existing)?.duplicateStatus, 'related_source');
});

test('detectDuplicate precedence + none', () => {
  assert.equal(detectDuplicate(cand({ primaryUrl: 'https://example.com' }), existing).duplicateStatus, 'exact_duplicate');
  assert.equal(detectDuplicate(cand({ primaryUrl: 'https://brand-new.com' }), existing).duplicateStatus, 'none');
});

test('approval gating by duplicate status', () => {
  assert.ok(blocksApproval('exact_duplicate'));
  assert.ok(!blocksApproval('domain_duplicate'));
  assert.ok(requiresConfirmation('domain_duplicate'));
  assert.ok(requiresConfirmation('related_source'));
  assert.ok(!requiresConfirmation('none'));
});

// ---- matching --------------------------------------------------------------

test('matchNarratives / matchWatchlists', () => {
  const nar = matchNarratives('election fraud disinformation', [{ id: 'n1', name: 'Election Fraud Narrative' }, { id: 'n2', name: 'Climate Doom' }]);
  assert.equal(nar[0]?.id, 'n1');
  const wl = matchWatchlists('the great replacement theory spreads', [{ id: 'w1', name: 'Extremism', terms: ['replacement', 'accelerationism'] }]);
  assert.equal(wl[0]?.id, 'w1');
});
