// Run: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test apps/web/lib/security/security-events.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SEVERITY,
  normalizeSecurityEvent,
} from './security-events';

const NOW = '2026-06-09T00:00:00.000Z';

test('DEFAULT_SEVERITY: per-type defaults', () => {
  assert.equal(DEFAULT_SEVERITY.failed_login, 'warning');
  assert.equal(DEFAULT_SEVERITY.access_denied, 'warning');
  assert.equal(DEFAULT_SEVERITY.session_refresh_failure, 'error');
  assert.equal(DEFAULT_SEVERITY.health_check_failure, 'error');
  assert.equal(DEFAULT_SEVERITY.cloudflare_challenge, 'error');
  assert.equal(DEFAULT_SEVERITY.successful_login, 'info');
  assert.equal(DEFAULT_SEVERITY.logout, 'info');
  assert.equal(DEFAULT_SEVERITY.admin_page_access, 'info');
  assert.equal(DEFAULT_SEVERITY.publication_action, 'info');
  assert.equal(DEFAULT_SEVERITY.review_action, 'info');
});

test('normalizeSecurityEvent: derives default severity from event type', () => {
  const out = normalizeSecurityEvent({ eventType: 'failed_login', now: NOW });
  assert.equal(out.severity, 'warning');
  assert.equal(out.event_type, 'failed_login');
});

test('normalizeSecurityEvent: maps to DB column shape with created_at = now', () => {
  const out = normalizeSecurityEvent({
    eventType: 'successful_login',
    userId: 'user-1',
    ipAddress: '1.2.3.4',
    userAgent: 'Mozilla/5.0',
    route: '/sign-in',
    message: 'signed in',
    metadata: { foo: 'bar' },
    now: NOW,
  });
  assert.deepEqual(out, {
    event_type: 'successful_login',
    severity: 'info',
    user_id: 'user-1',
    ip_address: '1.2.3.4',
    user_agent: 'Mozilla/5.0',
    route: '/sign-in',
    message: 'signed in',
    metadata: { foo: 'bar' },
    created_at: NOW,
  });
});

test('normalizeSecurityEvent: fills defaults (null ids, default message)', () => {
  const out = normalizeSecurityEvent({ eventType: 'logout', now: NOW });
  assert.equal(out.user_id, null);
  assert.equal(out.ip_address, null);
  assert.equal(out.user_agent, null);
  assert.equal(out.route, null);
  assert.ok(out.message.length > 0);
  assert.deepEqual(out.metadata, {});
});

test('normalizeSecurityEvent: long message truncated', () => {
  const long = 'x'.repeat(2000);
  const out = normalizeSecurityEvent({ eventType: 'access_denied', message: long, now: NOW });
  assert.ok(out.message.length <= 500);
  assert.match(out.message, /…$/);
});

test('normalizeSecurityEvent: metadata coerced to object when non-object', () => {
  const out = normalizeSecurityEvent({
    eventType: 'review_action',
    // @ts-expect-error intentionally wrong type at runtime
    metadata: 'not-an-object',
    now: NOW,
  });
  assert.deepEqual(out.metadata, {});
});

test('normalizeSecurityEvent: array metadata coerced to {}', () => {
  const out = normalizeSecurityEvent({
    eventType: 'review_action',
    // @ts-expect-error intentionally wrong type at runtime
    metadata: [1, 2, 3],
    now: NOW,
  });
  assert.deepEqual(out.metadata, {});
});

test('normalizeSecurityEvent: blank strings normalized to null', () => {
  const out = normalizeSecurityEvent({
    eventType: 'failed_login',
    userId: '   ',
    ipAddress: '',
    now: NOW,
  });
  assert.equal(out.user_id, null);
  assert.equal(out.ip_address, null);
});

test('normalizeSecurityEvent: cloudflare_challenge → error severity', () => {
  const out = normalizeSecurityEvent({ eventType: 'cloudflare_challenge', now: NOW });
  assert.equal(out.severity, 'error');
});
