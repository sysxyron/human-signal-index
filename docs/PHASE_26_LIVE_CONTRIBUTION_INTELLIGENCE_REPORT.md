# Phase 26 — Live Contribution Intelligence

**Status:** ✅ Complete · web + worker + engine typecheck 0 errors · build green
(162 routes, +1) · **2,390 tests passing (0 fail, +17)** · route audit green (152
pages) · smoke test green (migrations 0001→0030) ·
**no auth / middleware / RBAC / governance / publication-approval changes.**

A real user action anywhere on the platform now flows — through one audited,
idempotent recorder — into XP, reputation, credits, missions, badges, ranks, and
leaderboards. Phase 25 systems were **connected, not rebuilt.**

---

## 1. Architecture — one idempotent, audited path
```
platform action (signal/evidence/review/investigation/publication)
        │  best-effort, after success
        ▼
recordContribution()  ──► resolveAwards() (pure rules + anti-gaming)
        │                       │
        │   service-role        ▼
        ▼                 contribution_events  (APPEND-ONLY, UNIQUE idempotency_key)  ◄── the gate + audit
   user_xp_ledger / intel_credit_ledger  (append-only, linked via event_id)
        │
        ▼  hourly, deterministic (runAt injected)
contributorNetworkWorker ──► user_contribution_stats · user_reputation_scores ·
                              user_badges · user_ranks · user_missions ·
                              leaderboard_snapshots (×period) · team_contribution_metrics
        │
        ▼
   profile (live) · leaderboards · badges · admin contribution monitoring
```
**Awards are derived, never hand-set.** The worker recomputes recognition from the
append-only event log; it **never writes `public.user_roles`**, never promotes a
role, never auto-approves anything.

## 2. Live contributions (Deliverables 1–5)
Additive, best-effort `recordContribution(...)` calls fire after each action
*succeeds* — they never alter the action's own logic:
- **Signals** (`lib/signals/actions.ts`) → `SIGNAL_SUBMITTED` (+10 XP to author).
- **Evidence** (`worldforge/research/evidence-actions.ts`) → `EVIDENCE_SUBMITTED`
  (+50 XP) when a run produced evidence.
- **Reviews** (`lib/governance/persistence.ts`, where the author is already
  resolved) → `SIGNAL_ACCEPTED` (author +25 XP + reputation, reviewer +40) or
  `SIGNAL_REJECTED` (reviewer +40, author reputation penalty). Comment/decision
  logic untouched.
- **Investigations** (`lib/contributor/investigations.ts`) → state moves emit
  `INVESTIGATION_SUBMITTED/ACTIVE/UNDER_REVIEW/APPROVED/PUBLISHED/ARCHIVED`; owner
  + reviewer credited (approval requires distinct actor/subject).
- **Publications** (`lib/publishing/actions.ts`) → `REPORT_PUBLISHED` on
  `PUBLISHED` (publisher XP + credits). Publication approval/state logic untouched.

## 3. Mission / badge / rank / leaderboard engines (Deliverables 6–9)
All recomputed deterministically by the worker from the event log:
- **Missions** — `missionView()` recomputes each `user_missions` status from its
  progress (signal/review/publication missions advance as events accrue).
- **Badges** — `evaluateBadges()` + a unique `(user_id, badge_id)` constraint:
  badges unlock automatically and idempotently.
- **Ranks** — Phase-25 track ranks recomputed; **plus a new XP-rank ladder**
  (`awards.ts`): Observer → Analyst → Investigator → Specialist → Expert → Master
  → Legend, stored on `user_contribution_stats.xp_rank`. **Never an RBAC role.**
- **Leaderboards** — quality-weighted snapshots written for every view ×
  **daily / weekly / monthly / all_time** period. Deterministic given `runAt`
  (windows are `runAt − N days`); ranking uses accepted work, not raw volume.

## 4. Team metrics & profile (Deliverables 10–11)
- **Team scores** — `team_contribution_metrics` refreshed by folding members'
  accepted signals / evidence / reviews / publications + a `top_teams` snapshot.
- **Profile** (`/dashboard/profile`) — reads `user_contribution_stats` and shows
  **live** XP, rank, reputation, credits, missions completed, badges earned,
  signals submitted, reviews completed, publications contributed (with a "live"
  badge; falls back to ledger sums / labeled demo when stats aren't computed yet).

## 5. Admin oversight (Deliverable 12)
`/dashboard/admin/contribution-monitoring` (admin-only, read-only): top
contributors, reputation anomalies (high XP + low reputation), suspicious growth
(>50 events/24h per actor), recent badge unlocks, and rank changes.
**No manual XP editing** — the UI only reads; awards come solely from the recorder.

## 6. Anti-gaming & auditability (Deliverables 13 & 15)
- **Idempotent** — `contribution_events.idempotency_key` is UNIQUE; the recorder
  upserts with `ignoreDuplicates` and only writes ledgers when a *new* event row
  was created. Re-processing the same action is a no-op (no double counting).
- **No self-awards** — `resolveAwards()` rejects awards where actor === subject
  for review-quality events (you can't accept/reject your own work for credit);
  unit-tested.
- **No duplicate awards** — one audit row per (event, ref, actor); ledger rows are
  gated by it.
- **Auditable** — every reward stores actor, subject, event, reason, timestamp,
  and the awarded amounts in `contribution_events`; ledgers link back via
  `event_id`. No silent rewards.
- **Server-only & safe** — the recorder writes via the service-role client
  (server-only; never client-imported), only after an already-authorised action,
  so users cannot self-issue awards. Best-effort: it never throws and never blocks
  the user's action.

## 7. Worker integration (Deliverable 14)
`contributorNetworkWorker` (hourly) extended to: aggregate events → upsert stats →
recompute reputation → award badges → recompute ranks → recompute missions →
write leaderboards (view × period) → refresh team metrics. Offline-safe (demo
computation, no writes). **Never modifies RBAC roles** (asserted by a test).

## 8. Files

**Created**
- `packages/contributor-network/src/awards.ts` (+ `tests/awards.test.ts`)
- `apps/web/lib/contributor/recorder.ts`
- `apps/web/lib/contributor/oversight.ts`
- `apps/web/app/dashboard/admin/contribution-monitoring/page.tsx`
- `apps/worker/jobs/contributor-network-worker.test.ts`
- `supabase/migrations/0030_live_contribution_intelligence.sql`
- `docs/PHASE_26_LIVE_CONTRIBUTION_INTELLIGENCE_REPORT.md`

**Modified**
- `packages/contributor-network/src/index.ts` (export awards)
- `apps/worker/jobs/contributor-network-worker.ts` (full recompute pipeline)
- `apps/web/lib/signals/actions.ts`, `lib/governance/persistence.ts`,
  `lib/publishing/actions.ts`, `app/dashboard/worldforge/research/evidence-actions.ts`,
  `lib/contributor/investigations.ts` (additive award hooks)
- `apps/web/lib/contributor/profile.ts` (live stats)
- `apps/web/app/dashboard/profile/page.tsx` (live stats UI)
- `packages/shared-types/src/index.ts` (ContributionIdentity live fields)
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` (Contribution Monitoring nav)
- `apps/web/lib/launch/migration-audit.ts` (+0030) + `migration-audit.test.ts`

## 9. Verification

| Item | Result |
| --- | --- |
| Migration | `0030_live_contribution_intelligence.sql` |
| Tests added | 17 (14 awards engine, 3 contributor worker) |
| Full test suite | ✅ **2,390 / 2,390**, 0 fail |
| Web / worker / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled, 162 routes (+`/dashboard/admin/contribution-monitoring`) |
| Route audit | ✅ 152 pages resolve |
| Smoke test | ✅ migrations 0001→0030, 91 routes, 67 sidebar links, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 10. Security review
- **auth / middleware / RBAC / governance / publication-approval / forecasting /
  simulation** — **not touched** (verified: no diff to `middleware.ts`,
  `lib/auth/*`, `rbac-audit.ts`). All changes additive.
- **No role escalation** — the worker never writes `user_roles`; awards are
  recognition only; the XP-rank ladder is cosmetic.
- **No service-role exposure** — the recorder is server-only; every import site is
  a `'use server'` action or server DAL; no client component imports it; no
  service key appears in client code.
- **No self-award / double-count** — anti-gaming validation + UNIQUE idempotency
  key (unit-tested).

## 11. Remaining risks
- **Quality inputs are partial.** Reputation currently derives from accepted/
  rejected counts with neutral (0.5) placeholders for reviewAccuracy, evidence
  quality, traceability, consensus, etc. Those feeds (from the trust/consensus/
  traceability subsystems) are a follow-up; acceptance ratio already moves
  reputation meaningfully.
- **Publication contributor attribution.** `REPORT_PUBLISHED` currently credits
  the publisher (curator). Crediting the researcher + reviewer needs a
  publication→contributors link (none exists yet); the award rule already has a
  `subject` credit line ready for it.
- **Evidence granularity.** `EVIDENCE_SUBMITTED` is awarded once per evidence run
  (idempotent per run), not per individual evidence item.
- **Mission progress counters.** The worker recomputes mission *status* from
  `user_missions.progress`, but incrementing that `progress` from live events
  (e.g. "+1 signal toward submit-5") is not yet wired — a small follow-up that
  maps event aggregates onto each user's active missions.
- **Backfill.** Stats/leaderboards populate going forward; a one-time backfill of
  `contribution_events` from historical signals/reviews would seed pre-Phase-26
  activity.

## 12. Follow-up recommendations (Phase 27)
1. Wire mission `progress` increments from the per-user event aggregates the
   worker already computes (close the missions loop end-to-end).
2. Feed real quality signals (review accuracy, evidence quality, traceability,
   consensus agreement) into `computeReputation` instead of placeholders.
3. Add a publication→contributors link so researcher/reviewer credits flow on
   `REPORT_PUBLISHED`.
4. One-time historical backfill into `contribution_events`.
5. Surface leaderboard period tabs (daily/weekly/monthly/all-time) on
   `/dashboard/leaderboard` (snapshots already exist per period).
