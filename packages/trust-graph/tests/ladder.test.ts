import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRUST_LEVELS, levelForAuthority, nextLevel } from '../src/ladder';

test('ten ordered recognition levels Observer → Legend', () => {
  assert.equal(TRUST_LEVELS.length, 10);
  assert.deepEqual(TRUST_LEVELS.map((l) => l.name), [
    'Observer', 'Analyst', 'Researcher', 'Senior Researcher', 'Investigator',
    'Senior Investigator', 'Authority', 'Expert', 'Master', 'Legend',
  ]);
  for (let i = 1; i < TRUST_LEVELS.length; i++) {
    assert.equal(TRUST_LEVELS[i].order, TRUST_LEVELS[i - 1].order + 1);
    assert.ok(TRUST_LEVELS[i].minAuthority > TRUST_LEVELS[i - 1].minAuthority);
  }
});

test('levelForAuthority maps scores to levels', () => {
  assert.equal(levelForAuthority(0).name, 'Observer');
  assert.equal(levelForAuthority(34).name, 'Observer');
  assert.equal(levelForAuthority(35).name, 'Analyst');
  assert.equal(levelForAuthority(100).name, 'Legend');
});

test('nextLevel reports authority needed; null at the top', () => {
  const n = nextLevel(0);
  assert.equal(n?.level.name, 'Analyst');
  assert.equal(n?.authorityToNext, 35);
  assert.equal(nextLevel(100), null);
});
