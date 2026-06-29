// =============================================================================
// HSI RC1 — Phase 8 regression guard for the organization DALs.
//
// The org actions (create/invite/change-role/remove + reads) must surface
// CENTRALISED, non-leaking domain messages and never return a raw Supabase /
// Postgres error string to the user. This is a deterministic source guard so the
// fix cannot silently regress.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(here, file), 'utf8');

for (const file of ['organizations.ts', 'operations.ts']) {
  test(`org DAL ${file}: user-facing errors are mapped, never raw SQL (Phase 8)`, () => {
    const code = read(file);
    assert.ok(code.includes("from '@/lib/errors/domain-error'"), `${file} must use the central domain error mapper`);
    // No raw Supabase/Postgres message returned to the user.
    assert.ok(!/error:\s*error\.message/.test(code), `${file} returns a raw error.message to the user`);
    assert.ok(!/error:\s*error\?\.message/.test(code), `${file} returns a raw error?.message to the user`);
  });
}
