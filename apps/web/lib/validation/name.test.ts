import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateName, validateOptionalName, isValidName,
  validateOrgName, validateOptionalOrgName,
  NAME_VALIDATION_MESSAGE, NAME_MAX_LENGTH,
} from './name';

// ---- valid human names (spec list) -----------------------------------------

const VALID = [
  'Nick Martin',
  'Mary-Jane',
  "O'Connor",
  'John D. Smith',
  'محمد علي',   // Arabic
  '李小龍',      // CJK
  'Jean-Luc',
  'Ada',        // min boundary-ish
  'Renée',      // combining accent
];

for (const name of VALID) {
  test(`validateName accepts: ${name}`, () => {
    const r = validateName(name);
    assert.equal(r.ok, true, `expected "${name}" to be valid`);
    if (r.ok) assert.equal(r.value, name.trim());
  });
}

// ---- invalid names (spec list) ---------------------------------------------

const INVALID: Array<[string, string]> = [
  ['<script>alert(1)</script>', 'script tag'],
  ['<img src=x onerror=alert(1)>', 'img onerror'],
  ['javascript:alert(1)', 'js scheme'],
  ['%3Cscript%3E', 'encoded script'],
  ['"><img src=x onerror=alert(1)>', 'breakout + img'],
  ['%22%3E%3Cimg%20src=x%20onerror=eval(atob(this.id))%3E', 'the reported payload'],
  ['a'.repeat(100), 'too long'],
  ['   ', 'only whitespace'],
  ['<', 'lone lt'],
  ['>', 'lone gt'],
  ['eval(', 'eval sink'],
  ['document.cookie', 'document sink'],
  ['window.location', 'window sink'],
  ['A', 'too short'],
  ['John;DROP TABLE', 'semicolon'],
  ['name=value', 'equals'],
  ['back`tick', 'backtick'],
  ['a/b', 'slash'],
  ['a\\b', 'backslash'],
  ['Bad\nName', 'newline (email header injection)'],
  ['onload=1 x', 'event handler'],
];

for (const [name, label] of INVALID) {
  test(`validateName rejects: ${label}`, () => {
    const r = validateName(name);
    assert.equal(r.ok, false, `expected "${name}" to be rejected`);
    if (!r.ok) {
      assert.equal(r.message, NAME_VALIDATION_MESSAGE);
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
    }
  });
}

test('validateName: non-string input is rejected', () => {
  assert.equal(validateName(123).ok, false);
  assert.equal(validateName(null).ok, false);
  assert.equal(validateName(undefined).ok, false);
  assert.equal(validateName({}).ok, false);
});

test('validateName: never returns a technical/raw message (always the friendly one)', () => {
  const r = validateName('<script>');
  assert.equal(r.ok, false);
  if (!r.ok) assert.doesNotMatch(r.message, /sql|postgres|stack|<script>|syntax/i);
});

test('validateName: max length boundary (60 ok, 61 rejected)', () => {
  assert.equal(validateName('a'.repeat(NAME_MAX_LENGTH)).ok, true);
  assert.equal(validateName('a'.repeat(NAME_MAX_LENGTH + 1)).ok, false);
});

test('isValidName convenience matches validateName', () => {
  assert.equal(isValidName('Nick Martin'), true);
  assert.equal(isValidName('<img>'), false);
});

// ---- optional variant ------------------------------------------------------

test('validateOptionalName: blank/undefined → ok with null', () => {
  assert.deepEqual(validateOptionalName(''), { ok: true, value: null });
  assert.deepEqual(validateOptionalName('   '), { ok: true, value: null });
  assert.deepEqual(validateOptionalName(undefined), { ok: true, value: null });
  assert.deepEqual(validateOptionalName(null), { ok: true, value: null });
});
test('validateOptionalName: non-blank must validate', () => {
  assert.equal(validateOptionalName('Ada').ok, true);
  assert.equal(validateOptionalName('<script>').ok, false);
});

// ---- organization names ----------------------------------------------------

test('validateOrgName: accepts legitimate org punctuation (& ,)', () => {
  for (const n of ['Smith & Co.', 'AT&T', 'University of California, Berkeley', "O'Reilly Media"]) {
    assert.equal(validateOrgName(n).ok, true, `expected "${n}" valid`);
  }
});
test('validateOrgName: still rejects XSS payloads', () => {
  for (const n of ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'evil=1', 'a/b']) {
    assert.equal(validateOrgName(n).ok, false, `expected "${n}" rejected`);
  }
});
test('validateOptionalOrgName: blank → ok null; bad → rejected', () => {
  assert.deepEqual(validateOptionalOrgName(''), { ok: true, value: null });
  assert.equal(validateOptionalOrgName('<svg>').ok, false);
  assert.equal((validateOptionalOrgName('Acme Inc.') as { value: string }).value, 'Acme Inc.');
});
