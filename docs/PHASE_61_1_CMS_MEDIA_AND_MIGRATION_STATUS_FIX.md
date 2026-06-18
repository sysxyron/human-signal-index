# Phase 61.1 — CMS Media Storage + Migration Status Consistency Fix

**Status:** Complete (uncommitted)
**Type:** Focused consistency fix (no RBAC / auth / ingestion / review / publishing changes; no new migration).

Resolves two post-Phase-61 operational inconsistencies:

1. The CMS Media page claimed the `cms_media` bucket was missing even when
   `/api/health/storage` reported storage **operational**.
2. The Security/System migration display stopped at an old range and did not list
   the migrations through `0048_beta_launch.sql`.

Plus two related hardening items: a single storage source-of-truth, and making
`0048` idempotent after a partial manual run.

---

## Fix 1 + 2 — CMS Media storage detection (single source of truth)

### Root cause
`app/dashboard/admin/cms/media/page.tsx` rendered a **static** warning card
("Media upload requires a Supabase Storage bucket `cms_media`…") unconditionally.
It never consulted any storage check, so it contradicted `/api/health/storage`
(which calls `probeStorage()` and was reporting the bucket reachable).

### Fix
The page now calls **`probeStorage()` from `@/lib/health/probes`** — the *exact*
same function `/api/health/storage` uses — and renders from its result:

| `probeStorage()` result | What the page shows |
|---|---|
| `ok` (bucket reachable) | **Storage status: Operational** — names the bucket, notes public/MIME-types when present, and states the real reason uploads are off: *"Upload controls are not enabled yet in this build."* |
| down + `code === 'storage.bucket_missing'` (404) | The bucket-provisioning warning (the only case where "bucket missing" is true). |
| down for any other reason (unconfigured / unauthorized / fetch failed) | **Storage status: {status}** + the probe's real `message` — never a false "bucket missing". |

`listMedia()` and `probeStorage()` are awaited together via `Promise.all`. The
existing empty state ("No media yet") and offline-demo banner are unchanged.

### Storage source of truth
`lib/health/probes.ts → probeStorage()` is now the single source consumed by
**both** surfaces:

```
/api/health/storage  ──► probeStorage()  ◄── /dashboard/admin/cms/media
```

No bucket check is duplicated. The Security health page and the CMS Media page
read the same probe, so they cannot disagree.

---

## Fix 3 — Migration display accuracy

### Root cause
`lib/launch/migration-audit.ts → EXPECTED_MIGRATIONS` ended at **`0044`**, while
the repo contains `0001`–`0048` (added `0045_compliance_readiness`,
`0046_beta_feedback_fixes`, `0047_cms_footer_groups`, `0048_beta_launch`). The
panel title was also hardcoded to `(0001→0026)`.

### Fix
- Appended `0045`–`0048` to `EXPECTED_MIGRATIONS` (slugs match the filenames on
  disk). `demoMigrationAudit()` / `demoLaunchStatus()` derive from this list, so
  they update automatically.
- `components/launch/MigrationStatusPanel.tsx`: the title range is now **derived
  from the audit rows** (`{firstId}→{lastId}`, currently `0001→0048`) instead of
  a hardcoded string.
- The panel footer now states it plainly and never implies applied status:
  - *"Known migration files in repo: `0001–0048` (48 total)."*
  - When the ledger can't be read: *"Applied status: not verifiable from this
    environment … Verify with the Supabase CLI (`supabase migration list`) or the
    `schema_migrations` table. Files present in the repo are **not** implied to be
    applied."*
- Verifiable applied status still comes from `supabase_migrations.schema_migrations`
  via the DAL — unchanged. The audit's `verifiable=false` path (all rows `unknown`)
  is unchanged and now surfaced with the clearer wording above.

Used by both `/dashboard/security` and `/dashboard/launch`.

---

## Fix 4 — `0048_beta_launch.sql` idempotency review

### Observed (manual partial run)
`beta_cohorts` already existed, its `status` column was missing, and re-running
hit duplicate-policy errors — i.e. a half-applied state that could neither
complete nor cleanly re-run.

### Fix (additive, non-destructive)
The migration is now safe to re-run against an empty, partial, or fully-applied
schema:

- After each `create table if not exists`, every column is re-asserted with
  `alter table … add column if not exists` **before** any index/policy that
  references it — so `idx_beta_cohorts_status (status)` can no longer fire before
  `status` exists.
- Each policy is `drop policy if exists … ` immediately before its `create policy`
  (Postgres has no `create policy if not exists`), removing the duplicate-policy
  failures.
- `enable row level security` is naturally idempotent.

No existing beta table, column, or row is dropped or rewritten; defaults on the
re-asserted columns preserve existing data. **No new migration file was created**
(the fix edits `0048` in place, which had not applied cleanly).

> Note: `0048` still needs to be applied to Supabase for the Beta Launch console
> to read/write live data; it is now re-runnable without manual cleanup.

---

## Files changed

| File | Change |
|------|--------|
| `apps/web/app/dashboard/admin/cms/media/page.tsx` | Calls `probeStorage()`; replaces static warning with operational / bucket-missing / other-error states. |
| `apps/web/lib/launch/migration-audit.ts` | `EXPECTED_MIGRATIONS` extended to `0048`; header comment updated. |
| `apps/web/lib/launch/migration-audit.test.ts` | Count `44→48`, last id `0044→0048`. |
| `apps/web/components/launch/MigrationStatusPanel.tsx` | Dynamic title range; explicit "known files in repo" + not-verifiable wording. |
| `apps/web/app/dashboard/security/page.tsx` | Stale `(0001→0026)` comment corrected (cosmetic). |
| `supabase/migrations/0048_beta_launch.sql` | Made idempotent (`add column if not exists` before indexes; `drop policy if exists` before create). |

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Migration-audit tests | ✅ 10/10 pass |
| Full chunked suite | ✅ **2680 / 2680** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success |
| `/api/health/storage` | Unchanged — still calls `probeStorage()` (200 operational / 503 down). |
| `/dashboard/admin/cms/media` | No longer shows a false bucket-missing warning; mirrors `probeStorage()`. |
| `/dashboard/security` migrations | Lists `0001→0048`; not-verifiable clearly labeled. |
| RBAC / auth / workflows | Untouched — no regressions. |

Commands (tsc from `apps/web`; tests chunked from repo root):

```
( cd apps/web && npx tsc --noEmit -p tsconfig.json )
git ls-files '*.test.ts' | xargs -n 60 npx tsx --test
rm -rf apps/web/.next && ( cd apps/web && npx next build )
```

> Note: this repo runs tests via `npx tsx --test` (no `pnpm test`/`build`
> scripts are defined); the commands above are the equivalents.
