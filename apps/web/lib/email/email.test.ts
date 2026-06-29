import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emailConfig, isEmailConfigured, buildResendPayload, sendEmail,
  type FetchLike, type EmailConfig,
} from './resend';
import {
  betaApplicationAck, betaApplicationAdminNotice, demoRequestAck,
  demoRequestAdminNotice, betaAcceptanceEmail, betaRejectionEmail,
} from './templates';

const CFG: EmailConfig = { apiKey: 'rk_test_123', from: 'HSI <noreply@humansignalindex.org>' };

// ---- config detection ------------------------------------------------------

test('emailConfig: reads from an injected env map', () => {
  const c = emailConfig({ RESEND_API_KEY: 'k', RESEND_FROM: 'f@x.com' });
  assert.equal(c.apiKey, 'k');
  assert.equal(c.from, 'f@x.com');
});

test('isEmailConfigured: true only when both key and from are present', () => {
  assert.equal(isEmailConfigured(CFG), true);
  assert.equal(isEmailConfigured({ apiKey: 'k' }), false);
  assert.equal(isEmailConfigured({ from: 'f@x.com' }), false);
  assert.equal(isEmailConfigured({ apiKey: '  ', from: 'f@x.com' }), false);
  assert.equal(isEmailConfigured({}), false);
});

// ---- payload (pure) --------------------------------------------------------

test('buildResendPayload: normalizes to/array + maps replyTo → reply_to', () => {
  const p = buildResendPayload('from@x.com', { to: 'a@b.com', subject: 'S', text: 'T', replyTo: 'r@x.com' });
  assert.deepEqual(p.to, ['a@b.com']);
  assert.equal(p.from, 'from@x.com');
  assert.equal(p.subject, 'S');
  assert.equal(p.text, 'T');
  assert.equal((p as Record<string, unknown>).reply_to, 'r@x.com');
  assert.equal('html' in p, false);
});

test('buildResendPayload: passes through array recipients + html', () => {
  const p = buildResendPayload('from@x.com', { to: ['a@b.com', 'c@d.com'], subject: 'S', text: 'T', html: '<p>T</p>' });
  assert.deepEqual(p.to, ['a@b.com', 'c@d.com']);
  assert.equal((p as Record<string, unknown>).html, '<p>T</p>');
});

// ---- sendEmail (injected fetch) -------------------------------------------

test('sendEmail: unconfigured → skipped (no fetch call, not an error)', async () => {
  let called = false;
  const fetchImpl: FetchLike = async () => { called = true; return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; };
  const res = await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' }, { config: {}, fetchImpl });
  assert.deepEqual(res, { ok: false, skipped: true });
  assert.equal(called, false);
});

test('sendEmail: success → ok with id; posts Bearer auth to Resend', async () => {
  let seenUrl = ''; let seenAuth = '';
  const fetchImpl: FetchLike = async (url, init) => {
    seenUrl = url; seenAuth = init.headers.Authorization;
    return { ok: true, status: 200, json: async () => ({ id: 'email_abc' }), text: async () => '' };
  };
  const res = await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' }, { config: CFG, fetchImpl });
  assert.deepEqual(res, { ok: true, id: 'email_abc' });
  assert.equal(seenUrl, 'https://api.resend.com/emails');
  assert.equal(seenAuth, 'Bearer rk_test_123');
});

test('sendEmail: success without id → ok with null id', async () => {
  const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
  const res = await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' }, { config: CFG, fetchImpl });
  assert.deepEqual(res, { ok: true, id: null });
});

test('sendEmail: non-ok HTTP status → error (not skipped)', async () => {
  const fetchImpl: FetchLike = async () => ({ ok: false, status: 422, json: async () => ({}), text: async () => 'bad' });
  const res = await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' }, { config: CFG, fetchImpl });
  assert.equal(res.ok, false);
  assert.equal((res as { skipped: boolean }).skipped, false);
  assert.match((res as { error: string }).error, /422/);
});

test('sendEmail: transport throw → error, never throws out', async () => {
  const fetchImpl: FetchLike = async () => { throw new Error('network down'); };
  const res = await sendEmail({ to: 'a@b.com', subject: 'S', text: 'T' }, { config: CFG, fetchImpl });
  assert.equal(res.ok, false);
  assert.equal((res as { skipped: boolean }).skipped, false);
  // error message must NOT leak the raw cause verbatim — it's a generic message
  assert.equal((res as { error: string }).error, 'Email delivery failed.');
});

// ---- templates -------------------------------------------------------------

test('betaApplicationAck: addressed to applicant; no admin recipient leakage', () => {
  const m = betaApplicationAck({ name: 'Ada', email: 'ada@x.com', role: 'Researcher', reason: 'testing' });
  assert.equal(m.to, 'ada@x.com');
  assert.match(m.subject, /beta application/i);
  assert.match(m.text, /Ada/);
});

test('betaApplicationAdminNotice: goes to admin, reply-to is applicant, includes fields', () => {
  const m = betaApplicationAdminNotice({ name: 'Ada', email: 'ada@x.com', role: 'Researcher', reason: 'testing', organization: 'Acme' }, 'beta@hsi.org');
  assert.equal(m.to, 'beta@hsi.org');
  assert.equal(m.replyTo, 'ada@x.com');
  assert.match(m.text, /Ada/);
  assert.match(m.text, /Researcher/);
  assert.match(m.text, /Acme/);
});

test('demoRequestAck + admin notice carry the right recipients/fields', () => {
  const ack = demoRequestAck({ name: 'Bob', email: 'bob@co.com', organization: 'Co', useCase: 'monitoring' });
  assert.equal(ack.to, 'bob@co.com');
  const notice = demoRequestAdminNotice({ name: 'Bob', email: 'bob@co.com', organization: 'Co', useCase: 'monitoring' }, 'sales@hsi.org');
  assert.equal(notice.to, 'sales@hsi.org');
  assert.equal(notice.replyTo, 'bob@co.com');
  assert.match(notice.text, /monitoring/);
  assert.match(notice.subject, /Co/);
});

test('acceptance + rejection emails are addressed to the recipient and named', () => {
  const acc = betaAcceptanceEmail('Ada', 'ada@x.com');
  assert.equal(acc.to, 'ada@x.com');
  assert.match(acc.text, /Ada/);
  assert.match(acc.subject, /beta/i);
  const rej = betaRejectionEmail('Ada', 'ada@x.com');
  assert.equal(rej.to, 'ada@x.com');
  assert.match(rej.text, /Ada/);
});
