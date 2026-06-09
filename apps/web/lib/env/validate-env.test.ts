// Run: node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test apps/web/lib/env/validate-env.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv, requireServerEnv, maskValue, validateStartupEnv } from './validate-env';

const FULL_REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGci.realanonkey',
  NEXT_PUBLIC_APP_URL: 'https://worldforge.apps.amenxlabs.com',
};

test('validateEnv: missing required keys → ok false + listed', () => {
  const out = validateEnv({});
  assert.equal(out.ok, false);
  assert.ok(out.missing.includes('NEXT_PUBLIC_SUPABASE_URL'));
  assert.ok(out.missing.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  // Service role key is optional → not in missing.
  assert.ok(!out.missing.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('validateEnv: valid config → ok true, no missing', () => {
  const out = validateEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJI...realkey',
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.missing, []);
});

test('validateEnv: bad URL format → warning', () => {
  const out = validateEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'ftp-bad-url',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'realkey',
  });
  assert.ok(out.warnings.some((w) => w.key === 'NEXT_PUBLIC_SUPABASE_URL' && /valid http/.test(w.message)));
});

test('validateEnv: placeholder url + anon detected', () => {
  const out = validateEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-placeholder-key',
  });
  assert.ok(out.warnings.some((w) => w.key === 'NEXT_PUBLIC_SUPABASE_URL' && /placeholder/.test(w.message)));
  assert.ok(out.warnings.some((w) => w.key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && /placeholder/.test(w.message)));
});

test('validateEnv: service role key masked, not shown in full', () => {
  const secret = 'super-secret-service-role-key-1234567890';
  const out = validateEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'realkey',
    SUPABASE_SERVICE_ROLE_KEY: secret,
  });
  const masked = out.masked.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(masked);
  assert.notEqual(masked, secret);
  assert.doesNotMatch(masked, /secret-service-role/);
  assert.match(masked, /^supe.*7890$/);
});

test('validateEnv: NEXT_PUBLIC service-role exposure → warning', () => {
  const out = validateEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'realkey',
    NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'leaked-secret-key',
  });
  assert.ok(
    out.warnings.some(
      (w) => w.key === 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY' && /server-only secret/.test(w.message),
    ),
  );
});

test('maskValue: secret keeps first/last 4 only', () => {
  assert.equal(maskValue('abcdefghijkl', true), 'abcd…ijkl');
  assert.equal(maskValue('short', true), '****');
});

test('maskValue: non-secret short value passes through', () => {
  assert.equal(maskValue('https://abc.supabase.co', false), 'https://abc.supabase.co');
});

test('requireServerEnv: all present → ok with values', () => {
  const out = requireServerEnv(
    { SUPABASE_SERVICE_ROLE_KEY: 'x', OTHER: 'y' },
    ['SUPABASE_SERVICE_ROLE_KEY'],
  );
  assert.equal(out.ok, true);
  assert.equal(out.values.SUPABASE_SERVICE_ROLE_KEY, 'x');
  assert.deepEqual(out.missing, []);
});

test('requireServerEnv: missing → ok false, never throws', () => {
  const out = requireServerEnv({}, ['SUPABASE_SERVICE_ROLE_KEY', 'FOO']);
  assert.equal(out.ok, false);
  assert.deepEqual(out.missing, ['SUPABASE_SERVICE_ROLE_KEY', 'FOO']);
});

test('validateEnv: blank (whitespace) treated as missing', () => {
  const out = validateEnv({
    NEXT_PUBLIC_SUPABASE_URL: '   ',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  });
  assert.ok(out.missing.includes('NEXT_PUBLIC_SUPABASE_URL'));
  assert.ok(out.missing.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
});

// -- Phase 14B: validateStartupEnv (required vs optional) ---------------------

test('validateStartupEnv: all required present + valid → ok true, none missing', () => {
  const out = validateStartupEnv(FULL_REQUIRED);
  assert.equal(out.ok, true);
  assert.deepEqual(out.requiredMissing, []);
  assert.ok(out.required.every((r) => r.present && r.valid));
});

test('validateStartupEnv: required missing → ok false + listed (incl APP_URL)', () => {
  const out = validateStartupEnv({});
  assert.equal(out.ok, false);
  assert.ok(out.requiredMissing.includes('NEXT_PUBLIC_SUPABASE_URL'));
  assert.ok(out.requiredMissing.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  assert.ok(out.requiredMissing.includes('NEXT_PUBLIC_APP_URL'));
});

test('validateStartupEnv: APP_URL specifically required', () => {
  const out = validateStartupEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'realkey',
  });
  assert.equal(out.ok, false);
  assert.ok(out.requiredMissing.includes('NEXT_PUBLIC_APP_URL'));
});

test('validateStartupEnv: optional missing → degraded, never fails startup', () => {
  const out = validateStartupEnv(FULL_REQUIRED); // no optional keys set
  assert.equal(out.ok, true); // optional misses do NOT flip ok
  assert.ok(out.optionalMissing.includes('OPENAI_API_KEY'));
  assert.ok(out.optionalMissing.includes('YOUTUBE_API_KEY'));
  assert.ok(out.optionalMissing.includes('PODCAST_INDEX_API_KEY'));
  assert.ok(out.optionalMissing.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('validateStartupEnv: optional present → tracked, not missing', () => {
  const out = validateStartupEnv({ ...FULL_REQUIRED, OPENAI_API_KEY: 'sk-realopenaikey-1234567890' });
  assert.ok(!out.optionalMissing.includes('OPENAI_API_KEY'));
  assert.ok(out.optional.find((o) => o.key === 'OPENAI_API_KEY')?.present);
});

test('validateStartupEnv: NO secret leakage — raw secret never appears in result', () => {
  const secret = 'sk-super-secret-openai-value-DO-NOT-LEAK-1234567890';
  const out = validateStartupEnv({ ...FULL_REQUIRED, OPENAI_API_KEY: secret });
  const serialized = JSON.stringify(out);
  // The full secret must never appear in the structured result.
  assert.doesNotMatch(serialized, /DO-NOT-LEAK/);
  // masked form (if present) must not equal the raw secret.
  if (out.masked.OPENAI_API_KEY) assert.notEqual(out.masked.OPENAI_API_KEY, secret);
});

test('validateStartupEnv: placeholder required value → present but invalid → ok false', () => {
  const out = validateStartupEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-placeholder-key',
    NEXT_PUBLIC_APP_URL: 'https://worldforge.apps.amenxlabs.com',
  });
  assert.equal(out.ok, false);
  const url = out.required.find((r) => r.key === 'NEXT_PUBLIC_SUPABASE_URL');
  assert.equal(url?.present, true);
  assert.equal(url?.valid, false);
});

test('validateStartupEnv: dashboard warning state driven by requiredMissing', () => {
  const bad = validateStartupEnv({ NEXT_PUBLIC_APP_URL: 'https://x.example' });
  // This is exactly the condition the dashboard banner keys on.
  const showBanner = !bad.ok || bad.requiredMissing.length > 0;
  assert.equal(showBanner, true);
  const good = validateStartupEnv(FULL_REQUIRED);
  assert.equal(!good.ok || good.requiredMissing.length > 0, false);
});

test('validateStartupEnv: NEXT_PUBLIC-exposed secret flagged as warning', () => {
  const out = validateStartupEnv({ ...FULL_REQUIRED, NEXT_PUBLIC_OPENAI_API_KEY: 'leaky' });
  assert.ok(out.warnings.some((w) => /server-only secret/.test(w.message)));
});
