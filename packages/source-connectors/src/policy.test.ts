import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicCapturePolicy, isBlockedCaptureHost, CapturePolicyError } from './policy';

test('isBlockedCaptureHost: private/loopback/link-local → true', () => {
  for (const h of [
    'localhost', 'foo.localhost', 'svc.internal', 'printer.local',
    '127.0.0.1', '127.1.2.3', '10.0.0.1', '192.168.0.1', '172.16.0.1', '172.31.255.255',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', '[::1]', '::ffff:127.0.0.1',
    'fc00::1', 'fd12::3', 'fe80::1',
  ]) {
    assert.equal(isBlockedCaptureHost(h), true, `expected blocked: ${h}`);
  }
});

test('isBlockedCaptureHost: public hosts/IPs → false', () => {
  for (const h of ['example.org', 'news.ycombinator.com', '8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '11.0.0.1']) {
    assert.equal(isBlockedCaptureHost(h), false, `expected allowed: ${h}`);
  }
});

test('assertPublicCapturePolicy: SSRF hosts throw, public passes', () => {
  assert.throws(() => assertPublicCapturePolicy('http://169.254.169.254/latest/meta-data/'), CapturePolicyError);
  assert.throws(() => assertPublicCapturePolicy('http://127.0.0.1/'), CapturePolicyError);
  assert.throws(() => assertPublicCapturePolicy('http://10.1.2.3/feed'), CapturePolicyError);
  assert.doesNotThrow(() => assertPublicCapturePolicy('https://example.org/public/feed.xml'));
});

test('assertPublicCapturePolicy: still enforces scheme + credentials + private-path', () => {
  assert.throws(() => assertPublicCapturePolicy('file:///etc/passwd'), CapturePolicyError);
  assert.throws(() => assertPublicCapturePolicy('https://user:pass@example.org/'), CapturePolicyError);
  assert.throws(() => assertPublicCapturePolicy('https://example.org/admin'), CapturePolicyError);
});
