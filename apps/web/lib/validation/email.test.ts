import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isValidEmailFormat, emailDomain, disposableDenylist, isDisposableEmail,
  DEFAULT_DISPOSABLE_DOMAINS,
} from './email';

test('isValidEmailFormat: basic shape', () => {
  assert.equal(isValidEmailFormat('a@b.com'), true);
  assert.equal(isValidEmailFormat('  ada@example.co.uk '), true);
  assert.equal(isValidEmailFormat('nope'), false);
  assert.equal(isValidEmailFormat('a@b'), false);
  assert.equal(isValidEmailFormat('a b@c.com'), false);
  assert.equal(isValidEmailFormat(123), false);
});

test('emailDomain: lower-cased domain part', () => {
  assert.equal(emailDomain('Ada@Example.COM'), 'example.com');
  assert.equal(emailDomain('weird'), '');
});

test('isDisposableEmail: default seed list catches known throwaways', () => {
  assert.equal(isDisposableEmail('spammer@mailinator.com'), true);
  assert.equal(isDisposableEmail('x@guerrillamail.com'), true);
  assert.equal(isDisposableEmail('real@gmail.com'), false);
  assert.equal(isDisposableEmail('person@company.io'), false);
});

test('isDisposableEmail: subdomain of a denied domain is caught', () => {
  assert.equal(isDisposableEmail('x@inbox.mailinator.com'), true);
});

test('disposableDenylist: env adds domains (comma/space separated, @/. stripped)', () => {
  const dl = disposableDenylist({ DISPOSABLE_EMAIL_DOMAINS: 'evil.test, @throwaway.example  .spam.test' });
  assert.equal(dl.has('evil.test'), true);
  assert.equal(dl.has('throwaway.example'), true);
  assert.equal(dl.has('spam.test'), true);
  // defaults still present
  for (const d of DEFAULT_DISPOSABLE_DOMAINS) assert.equal(dl.has(d), true);
});

test('isDisposableEmail: honors a custom denylist argument', () => {
  const dl = disposableDenylist({ DISPOSABLE_EMAIL_DOMAINS: 'custom.test' });
  assert.equal(isDisposableEmail('a@custom.test', dl), true);
  assert.equal(isDisposableEmail('a@gmail.com', dl), false);
});

test('disposableDenylist: empty env yields just the defaults', () => {
  const dl = disposableDenylist({});
  assert.equal(dl.size, DEFAULT_DISPOSABLE_DOMAINS.length);
});
