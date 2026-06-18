# Phase 62 — Notifications & Alerting Framework

**Status:** Complete (uncommitted)
**Route:** `/dashboard/notifications` (viewer+ / every signed-in role)
**Migration:** `0049_notifications_framework.sql` (additive)
**Scope:** The first platform-wide notification + alerting infrastructure. This is
operational intelligence notification infrastructure — **not** email marketing.
Notifications are stored internally only; email delivery is a later phase.

---

## Architecture

```
UI (server page)  /dashboard/notifications
  ├─ panels.tsx (server)         NotificationSummary · SeverityBreakdown · ExecutiveAlertsPanel
  ├─ NotificationList (client)   mark read / mark all / archive
  ├─ PreferencesForm (client)    channels · critical-only · digest · category toggles
  └─ SendTestAlertButton (client, admin)  exercises the pipeline

Engine  lib/notifications/service.ts   (SERVER-ONLY, resolves user + RLS client)
  createNotification · getNotifications · getUnreadCount · getNotificationStats
  markRead · markAllRead · archiveNotification · getPreferences · updatePreferences
  getExecutiveAlerts (admin)
        │
        ├─ DAL  lib/notifications/persistence.ts   (RLS client only — no service-role)
        └─ Pure lib/notifications/types.ts         (vocabulary, gating, lifecycle, stats,
                                                    access model, executive mapper)

Actions lib/notifications/actions.ts   ('use server' thin wrappers, revalidatePath)
DB      0049 notifications · notification_preferences · notification_events (RLS)
```

**Single source of truth for access:** every read/write uses the caller's
cookie-backed RLS client (`createClient()`), never the service-role client — so the
database policies are the real boundary and there is no cross-user leakage. The
pure `canViewNotification` / `canMutateNotification` / `canViewAllNotifications`
helpers mirror those policies in code so the RBAC model is unit-tested.

**No fabricated metrics:** all counts (unread/read/archived, severity & type
breakdowns, executive categories) are computed by `summarizeNotifications` /
`buildExecutiveAlerts` over real rows. Empty states report `0`, never a fake value.

---

## Notification lifecycle

```
create ──► (delivery gate: shouldDeliver) ──► stored (unread, active)
                    │ suppressed → not stored ({ suppressed: true })
                    ▼
            markRead → read_at set        markAllRead (bulk)
                    ▼
            archive → archived_at set (soft delete; excluded from active views)
```

- **Delivery gating** (`shouldDeliver`) honors the recipient's preferences:
  in-app off → suppress; critical-only → only `CRITICAL`; per-category toggle off →
  suppress. **`SECURITY_EVENT` is never suppressed** (operators must always see it).
- **Soft delete only:** archiving sets `archived_at`; rows are never hard-deleted by
  users (admin-only `DELETE` policy). Every transition is logged to
  `notification_events` (append-only audit).

**Severities:** `INFO` < `NOTICE` < `WARNING` < `CRITICAL`.

**Types (14):** `SOURCE_FAILURE`, `SOURCE_RECOVERED`, `SIGNAL_SUBMITTED`,
`SIGNAL_ESCALATED`, `REVIEW_REQUIRED`, `REVIEW_APPROVED`, `REVIEW_REJECTED`,
`PUBLICATION_PUBLISHED`, `CORRECTION_RECEIVED`, `WATCHLIST_MATCH`,
`FORECAST_TRIGGER`, `SYSTEM_ALERT`, `SECURITY_EVENT`, `BETA_FEEDBACK`.

Each type maps to a category preference (`prefKeyForType`): source / review /
publication / forecast / system.

---

## RBAC model

| Surface | Who |
|---|---|
| View / mark-read / archive own notifications | the owner (`user_id = auth.uid()`) |
| Manage all notifications, platform stats, **Executive Alerts** | admin (`is_admin()`) |
| Manage own preferences | the owner; admins may **read** for support |
| Read notification events | parent-notification owner + admin |
| Menu visibility (`/dashboard/notifications`) | viewer, researcher, reviewer, curator, admin (not anonymous) |

The route is **viewer+** (no `PROTECTED_ROUTES` role gate) — middleware still
requires authentication for any `/dashboard/*` route, and RLS owner-scopes the
data. `nav-roles.ts` lists it explicitly for all signed-in roles; the nav invariant
+ visibility tests assert this.

---

## Table definitions (migration 0049)

**`notifications`** — `id`, `user_id`→users (owner), `organization_id`→organizations
(nullable), `type` (check, 14), `severity` (check, 4, default `INFO`), `title`,
`body`, `link`, `entity_type`, `entity_id`, `metadata` jsonb, `read_at`,
`archived_at`, `created_by`, `created_at`, `updated_at`. Indexed on
`(user_id, created_at)`, `(user_id, read_at)`, `(user_id, archived_at)`, `type`,
`severity`, `organization_id`.

**`notification_preferences`** — one row per user (`user_id` unique):
`email_enabled`, `in_app_enabled`, `critical_only`, `digest_frequency`
(check: realtime/hourly/daily/weekly/off), `source_alerts`, `review_alerts`,
`publication_alerts`, `forecast_alerts`, `system_alerts`, `created_at`, `updated_at`.

**`notification_events`** — append-only audit: `notification_id`→notifications,
`event` (check: created/read/unread/archived/delivered/suppressed), `channel`,
`actor_id`, `note`, `created_at`.

**RLS:** all three tables have RLS enabled with owner-scoped + admin policies as in
the RBAC table above. The migration is **idempotent** (create-if-not-exists +
add-column-if-not-exists before dependent indexes + drop-policy-if-exists before
create) per the Phase 61.1 lesson — safe to re-run against empty/partial/applied
schemas. It is additive: no existing table/column/policy is modified.

---

## Executive Alerts (admin)

Computed platform-wide from the notification stream plus **live cross-checks**:

| Category | Computed from |
|---|---|
| Critical alerts | active notifications at `CRITICAL` |
| Review bottlenecks | `REVIEW_REQUIRED` + `SIGNAL_ESCALATED` + live pending `signal_submissions` |
| Source failures | `SOURCE_FAILURE` + live failing/blocked sources (Phase 61 `getSourceReliability`) |
| Publication alerts | `PUBLICATION_PUBLISHED` + `CORRECTION_RECEIVED` |
| Forecast triggers | `FORECAST_TRIGGER` + `WATCHLIST_MATCH` |
| Trust & security anomalies | `SECURITY_EVENT` + `SYSTEM_ALERT` |

Every number is a real computed count; live cross-checks degrade to `0` on error.

---

## Files

**Added**
- `apps/web/lib/notifications/types.ts` — pure vocabulary, gating, lifecycle, stats, access model, executive mapper
- `apps/web/lib/notifications/types.test.ts` — pure-logic + RBAC + lifecycle tests
- `apps/web/lib/notifications/persistence.ts` — RLS-client DAL (CRUD + preferences + events)
- `apps/web/lib/notifications/service.ts` — engine (the public API)
- `apps/web/lib/notifications/actions.ts` — `'use server'` wrappers
- `apps/web/components/notifications/panels.tsx` — summary / severity / executive (server)
- `apps/web/components/notifications/NotificationList.tsx` — list + actions (client)
- `apps/web/components/notifications/PreferencesForm.tsx` — preferences (client)
- `apps/web/components/notifications/SendTestAlertButton.tsx` — admin pipeline test (client)
- `apps/web/app/dashboard/notifications/page.tsx` — the route
- `supabase/migrations/0049_notifications_framework.sql` — additive schema + RLS
- `docs/PHASE_62_NOTIFICATIONS_AND_ALERTING_FRAMEWORK.md`

**Changed (wiring only)**
- `packages/ui/src/navigation.tsx` — "Notifications" in the Account group (Bell)
- `packages/ui/src/nav-roles.ts` — `NAV_VISIBILITY` (viewer+) + `ALL_NAV_HREFS`
- `packages/ui/tests/nav-roles.test.ts` — Phase 62 visibility test
- `apps/web/lib/launch/migration-audit.ts` + `.test.ts` — register `0049` (0001→0049)

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Notification + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2694 / 2694** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; `/dashboard/notifications` → `ƒ` (3.19 kB) |
| Migration idempotency | ✅ re-runnable (if-not-exists + drop-policy-if-exists) |
| No regressions / no fabricated data | ✅ all counts computed; existing routes unchanged |

> The migration must be applied to Supabase (`0049`) before the page reads/writes
> live data. Until then the engine degrades gracefully to empty (never throws).

---

## Future integration points

The engine is the reusable substrate for upcoming phases — each calls
`createNotification(...)` from its own server flow (additive; no workflow changes
were made in this infra phase):

- **Phase 63 Source Monitoring** → `SOURCE_FAILURE` / `SOURCE_RECOVERED` (Phase 61 reliability already surfaces the live counts the executive summary cross-checks).
- **Phase 64 Evidence Graph** → `SIGNAL_ESCALATED` / `CORRECTION_RECEIVED`.
- **Phase 65 Narrative Intelligence** → `WATCHLIST_MATCH` / `FORECAST_TRIGGER`.
- **Phase 66 Agent Automation** → `SYSTEM_ALERT` for automated-run outcomes.
- **Phase 67 Forecast Validation** → `FORECAST_TRIGGER` on threshold breach.
- **Email delivery / digesting** → consume `notification_preferences`
  (`email_enabled`, `digest_frequency`) and write `notification_events`
  (`delivered`) when an email provider is wired.

---

## Known limitations

- **No email delivery yet** — `email_enabled` + `digest_frequency` are captured but
  not acted on; in-app only this phase (by design).
- **No real-time push** — the center is server-rendered; clients refresh on action.
  A realtime/WebSocket layer is future work.
- **Producers not yet wired** — to keep this phase strictly additive (preserve
  existing review/publishing/signal/source workflows), no existing flow was modified
  to emit notifications; the admin "Send test alert" proves the pipeline. Producers
  arrive with Phases 63–67.
- **Executive cross-checks** are best-effort and degrade to `0` if a dependency is
  unavailable (never fabricated).
