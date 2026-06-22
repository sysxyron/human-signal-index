# Phase 74.2 — Read Routing & Resilience Layer

**Status:** Complete (uncommitted) · **Type:** Additive foundation · **Migration:** none
No auth/RLS/publishing/review/ingestion changes. Coolify Supabase remains the
write-primary and the only live backend.

## Purpose
Create the routing abstraction so HSI can later serve reads from `primary`,
`replica`, `d1`, or `cache` without rewriting dashboards, public pages, or APIs —
while guaranteeing that, until a backend is actually implemented, everything
resolves safely to primary.

## Current backend
Only **primary** (Coolify Supabase) is live (`reads: true, writes: true`).
`replica`, `d1`, and `cache` are declared but `available: false` — never used.

## Future backend plan
- **replica** — read-only Postgres replica for dashboard/heavy reads (offload primary).
- **d1** — edge-materialized public read models (see `public-read-models.ts`) for low-latency public pages.
- **cache** — short-TTL cache for hot public catalogs/indexes.
Each lands by implementing the backend, flipping its entry in
`backend-availability.ts`, and (for public models) materializing the model.

## Edge Config flags
`publicReadsSource` and `dashboardReadsSource` (from Phase 74.1) are the requested
backends per scope; `primaryDbHealth` toggles primary availability (`down` →
unavailable). admin/system ignore the selectors.

## Routing rules (`lib/hsi/read-backends.ts`)
- **admin** → always primary (requested value recorded but ignored).
- **system** → always primary (read-only diagnostics).
- **public** → `publicReadsSource` if readable, else primary.
- **dashboard** → `dashboardReadsSource` if readable, else primary.
- invalid value → primary (reason recorded).
- unavailable backend → primary (reason recorded).
- Every decision returns `{ scope, requestedBackend, effectiveBackend, fallbackReason }`.

## Fallback behavior
`effectiveBackend` is **primary** for every scope today, because only primary is
available. A non-primary selection produces a WARNING-grade decision with a
`fallbackReason` ("…unavailable — falling back to primary"); it never errors and
never reads from a non-existent backend. If `primaryDbHealth === 'down'`, the
effective backend stays primary but the reason notes primary is unavailable (the
auditor surfaces this as FAIL — there is no safe alternate to fail over to).

## Why admin/system remain primary
Admin and system reads must reflect the authoritative system of record with RLS
intact. Routing them to an eventual replica/cache could serve stale or
differently-scoped data, so they are pinned to primary by rule.

## Read client facade (`lib/hsi/read-client.ts`)
`getPublicReadClient` / `getDashboardReadClient` / `getAdminReadClient` /
`getSystemReadClient` return `{ client, scope, backend, requestedBackend,
effectiveBackend, fallbackReason }`. The client is always a PRIMARY client —
non-cookie read client for `public`, cookie/RLS client for the rest. Callers can
adopt the facade now; future routing requires no caller changes.

## D1 / replica / cache future use
- D1: `public_transparency_summary`, `public_sources_summary`,
  `public_global_map_points` (low-latency public reads).
- cache: `public_marketplace_catalog`, `public_reports_index` (hot indexes).
- replica: dashboard heavy panels. All declared in `public-read-models.ts` /
  `backend-availability.ts` with TODO markers; none implemented.

## Auditor changes
New **Read routing** section: public/dashboard reads (PASS primary+available;
WARNING non-primary selected→fell back; FAIL primary unavailable), and per-backend
availability (primary PASS/FAIL; replica/d1/cache NOT_OBSERVED until implemented).

## API added
`GET /api/system/read-routing` → `{ ok, routing: { public, dashboard, admin },
backends, timestamp }`. No secrets.

## Files created
`lib/hsi/{read-backends,backend-availability,read-client,public-read-models}.ts`,
`app/api/system/read-routing/route.ts`, `lib/hsi/read-backends.test.ts`, this doc.

## Files modified
`lib/hsi/read-routing.ts` (delegates to the resolver), `lib/platform-audit/
{types,checks,data}.ts`, `components/platform-audit/panels.tsx`,
`lib/platform-audit/platform-audit.test.ts`.

## Testing checklist
- [x] primary default; invalid → primary; replica/d1/cache requested-but-unavailable → primary (unit).
- [x] admin/system forced primary; public/dashboard selectors respected when available (unit).
- [x] primary down → effective primary + reason; auditor FAIL (unit).
- [x] auditor PASS/WARNING/NOT_OBSERVED/FAIL statuses (unit).
- [ ] Manual: `GET /api/system/read-routing` returns routing + backends.
- [ ] Manual: set `dashboardReadsSource=replica` → dashboard decision shows fallback, app still reads.

## Verification
`tsc` clean · read-backends + edge-config + platform-audit tests pass · full suite + build: see report.
