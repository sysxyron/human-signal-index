# Phase 74.1 — Vercel Edge Config Runtime Flags

**Status:** Complete (uncommitted) · **Type:** Additive / guarded · **Migration:** none
No auth changes, no ingestion-logic rewrite, no crawler/publishing/review changes.

## Purpose
Control production behavior without redeploying, via the existing Vercel Edge
Config store. Flags are read-only inside the app, validated, and degrade to safe
defaults — the app never crashes if Edge Config is unavailable.

## Flags & default values
| Flag | Default | Effect |
|---|---|---|
| `hsiMode` | `normal` | `normal` / `protected_read` / `maintenance` |
| `maintenanceBanner` | `false` | global maintenance banner |
| `maintenanceMessage` | `""` | banner text (fallback message if empty) |
| `betaSignupOpen` | `true` | enable/disable beta applications |
| `globalMapEnabled` | `true` | enable/disable the interactive map |
| `sourceIngestEnabled` | `true` | enable/disable import / discovery / scout |
| `protectedReadMode` | `false` | degraded-read notice on dashboards |
| `publicReadsSource` | `primary` | read-routing selection (primary/replica/d1/cache) |
| `dashboardReadsSource` | `primary` | read-routing selection |
| `primaryDbHealth` | `unknown` | reported DB health (surfaced in auditor) |

Keys are read as camelCase with snake_case fallback. Invalid types/enums
normalize to the default.

## Helper API (`lib/hsi/edge-config.ts`)
- `getHsiRuntimeConfig(): Promise<HsiRuntimeResult>` — merged + validated config plus
  `source: "edge-config" | "defaults" | "error-fallback"`. React-`cache` memoized
  per request (no-ops outside RSC); never throws.
- `getRuntimeFlag(key)` — one validated flag.
- `HSI_EDGE_DEFAULTS`, `type HsiRuntimeConfig`, `normalizeRuntimeConfig(raw)` (pure).
- `isProtectedReadMode()` — true for explicit flag, `protected_read`, or `maintenance`.

## Affected routes / surfaces
- Marketing layout + dashboard layout → `MaintenanceBanner` (and `ProtectedReadNotice` on dashboard).
- `/beta` + `POST /api/beta/apply` → `betaSignupOpen` (page shows paused notice; API returns `{ ok:false, code:"BETA_CLOSED" }` 423).
- `/dashboard/global-map` → `globalMapEnabled` (disabled state, MapLibre not loaded).
- `/dashboard/source-discovery` + `lib/source-discovery/actions.ts` → `sourceIngestEnabled` (ingest controls hidden; import/discovery/scout/reprocess actions return a controlled `SOURCE_INGEST_DISABLED` failure). Viewing existing sources/candidates is never blocked.
- `/dashboard/platform-audit` → Runtime configuration check section.
- `GET /api/system/edge-config` → `{ ok, source, config, updatedAt }` (no secrets).

## Safety behavior
- Edge Config unreachable → `getAll()` throws → caught → defaults, `source:"error-fallback"`.
- No Edge Config items → defaults, `source:"defaults"`.
- Disabled features render clean states; they are never treated as errors.
- The auditor marks intentional disables as WARNING (never FAIL); unreachable Edge Config is NOT_OBSERVED/WARNING.

## Future read-routing plan (`lib/hsi/read-routing.ts`)
`getPublicReadsSource()` / `getDashboardReadsSource()` return the configured
selection, but **all reads still use the primary DB** — replica / D1 / cache
backends are not implemented. `effectiveBackend()` always returns `'primary'`,
and the auditor flags any non-primary selection as "recorded, not yet live".
TODO-safe comments mark where real routing will be wired.

## Platform audit checks added
Runtime area: Edge Config reachable, maintenance mode, beta signup, global map,
source ingest, protected read mode, public/dashboard read source, primary DB
health — using PASS / WARNING / NOT_OBSERVED / FAIL(down DB only).

## Test checklist
- [x] `normalizeRuntimeConfig` validates types/enums + snake_case fallback (unit).
- [x] `coerceReadSource` falls back to primary (unit).
- [x] `checkRuntimeConfig` maps source + intentional disables → WARNING (unit).
- [ ] Manual: `GET /api/system/edge-config` returns `{ ok, source, config, updatedAt }`.
- [ ] Manual: toggle `maintenanceBanner` → banner appears on `/` and dashboard.
- [ ] Manual: `betaSignupOpen=false` → `/beta` paused + API 423.
- [ ] Manual: `globalMapEnabled=false` → map disabled, no MapLibre load.
- [ ] Manual: `sourceIngestEnabled=false` → ingest controls hidden; actions blocked; viewing intact.
- [ ] Manual: `protectedReadMode=true` → dashboard notice shows.

## Verification
- `tsc --noEmit`: clean · edge-config + platform-audit tests pass · full suite + build: see report.
