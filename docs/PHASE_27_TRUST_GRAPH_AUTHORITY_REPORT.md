# Phase 27 — Trust Graph & Contributor Authority

**Status:** ✅ Complete · web + worker + engine typecheck 0 errors · build green
(164 routes, +2) · **2,409 tests passing (0 fail, +19)** · route audit green (154
pages) · smoke test green (migrations 0001→0031) ·
**no auth / middleware / RBAC / governance / publication-approval / forecasting /
simulation changes.**

HSI now measures **quality**, not just activity: trust, accuracy, reliability, and
**authority** — so contributor influence reflects the quality of work, not volume.

---

## 1. The trust graph — pure quality engine (Deliverables 1–6)
New package **`packages/trust-graph`** (PURE: no DB, no UI, no `Date.now()`). It
turns a contributor's accepted/rejected contributions, review outcomes, and
publication outcomes into five component scores + two headline scores, all 0..100,
with a NEUTRAL (50) baseline so a new contributor is neither trusted nor distrusted:
- **Signal accuracy** (D2) = accepted / submitted; tracks submitted/accepted/rejected.
- **Review accuracy** (D3) = agreement with the final governance outcome; tracks
  agreement % / disagreement %.
- **Publication quality** (D4) = accepted ratio + traceability + governance approvals.
- **Reliability** (D5) = completion vs abandonment + consistency over time, penalised
  by overdue assignments (penalty saturates).
- **Trust** = 0.6·accuracy + 0.4·reliability.
- **Authority** (D6) = 0.35·trust + 0.25·accuracy + 0.2·reliability + 0.2·publication
  (weights sum to 1; deterministic). **Authority is NOT XP** and proven by test to be
  volume-independent (same ratio at 10× volume → same authority).

## 2. Trust ladder (Deliverable 7)
Ten recognition levels keyed off authority: Observer → Analyst → Researcher →
Senior Researcher → Investigator → Senior Investigator → Authority → Expert →
Master → Legend. **These are recognition tiers, NOT RBAC roles** — they never
change `user_roles` or access.

## 3. Trust history & events (Deliverables 8–9)
- `trust_history` (append-only): previous/new trust + authority, reason, timestamp —
  the worker appends a row whenever a score changes.
- `trust_events` (append-only) with the eight types (SIGNAL_ACCEPTED/REJECTED,
  REVIEW_AGREEMENT/DISAGREEMENT, PUBLICATION_APPROVED/REJECTED,
  INVESTIGATION_COMPLETED/ABANDONED) and signed weights for explanation; a
  `self_excluded` flag marks anti-gaming exclusions.

## 4. Anti-gaming (Deliverable 14)
The engine's `isSelfValidation` / `filterSelfValidation` drop any **self-generated
validation** (a contributor accepting/reviewing/approving their own work) before it
reaches a score — this is what blocks **circular authority boosting**. It composes
with Phase 26's recorder, which already rejects self-accept at write time. Unit-tested.

## 5. Pages, profile & teams (Deliverables 10–13)
- **`/dashboard/authority`** — the contributor's trust, authority, reliability,
  accuracy, signal/publication scores, recognition level + next level, review
  agreement breakdown, trust history, and team trust.
- **Profile** (`/dashboard/profile`) — a Trust & authority block (level, authority,
  trust, reliability) linking to the full breakdown (Deliverable 11).
- **Team trust** (Deliverable 12) — average trust / reliability / authority per team,
  from `team_members` × `trust_profiles`.
- **`/dashboard/admin/trust-monitoring`** (admin-only, read-only, Deliverable 13) —
  rapid trust increases/decreases (gaming signal), authority rankings, suspicious
  behaviour. No manual trust editing.

## 6. Worker (Deliverable 15)
`contributorNetworkWorker` extended: for each user it builds trust inputs from the
Phase-26 contribution aggregate, computes scores with `@hsi/trust-graph`, upserts
`trust_profiles`, and appends `trust_history` on change. **Never writes
`user_roles`.** Offline-safe (demo computation). Deterministic (`runAt` injected).

## 7. Database (Deliverable 16)
`supabase/migrations/0031_trust_graph_authority.sql` — `trust_profiles`,
`trust_history`, `trust_events`; RLS (owner-read + researcher+ read on profiles for
team views; admin all; worker writes via service role), indexes, audit fields,
`set_updated_at` on the mutable profile table. Add-only.

## 8. Files

**Created**
- `packages/trust-graph/` (package.json, tsconfig; `src/`: types, scores, ladder,
  events, fixtures, index; `tests/`: scores, ladder, events — 18 tests)
- `apps/web/lib/contributor/trust.ts`
- `apps/web/app/dashboard/authority/page.tsx`
- `apps/web/app/dashboard/admin/trust-monitoring/page.tsx`
- `supabase/migrations/0031_trust_graph_authority.sql`
- `docs/PHASE_27_TRUST_GRAPH_AUTHORITY_REPORT.md`

**Modified**
- `apps/worker/jobs/contributor-network-worker.ts` (+ `.test.ts`) — trust recompute
- `apps/web/app/dashboard/profile/page.tsx` — trust integration
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — Authority + Trust Monitoring nav
- `apps/web/lib/launch/migration-audit.ts` (+0031) + `migration-audit.test.ts`
- `tsconfig.base.json`, `apps/web/package.json`, `apps/worker/package.json` — new package

## 9. Verification

| Item | Result |
| --- | --- |
| Migration | `0031_trust_graph_authority.sql` |
| Tests added | 19 (18 trust-graph engine, 1 worker) |
| Full test suite | ✅ **2,409 / 2,409**, 0 fail |
| Web / worker / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled, 164 routes (+`/dashboard/authority`, +`/dashboard/admin/trust-monitoring`) |
| Route audit | ✅ 154 pages resolve |
| Smoke test | ✅ migrations 0001→0031, 93 routes, 69 sidebar links, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 10. Security review
- **auth / middleware / RBAC / governance / publication-approval / forecasting /
  simulation — not touched** (verified: no diff to `middleware.ts`, `lib/auth/*`,
  `rbac-audit.ts`). All changes additive.
- **No role escalation** — recognition levels are cosmetic; the worker never writes
  `user_roles`.
- **No self-validation / circular boosting** — excluded by the engine (unit-tested)
  and at the recorder.
- **No service-role exposure** — `trust.ts` is `'use server'`, imported only by
  server pages; web reads use the RLS user client / `requireAdmin`; only the worker
  writes via service role.

## 11. Remaining risks
- **Review accuracy & reliability inputs are partial.** Review agreement vs
  governance outcome, publication traceability, governance approval rate, and
  reliability windows currently use neutral placeholders in the worker; signal
  accuracy and publication volume are real. The engine + schema already accept the
  full inputs — wiring the feeds is a follow-up.
- **Trust history granularity** — history is appended on each worker run when a
  score changes (not per individual event); the per-event audit lives in
  `contribution_events`/`trust_events`.
- **Backfill** — trust profiles populate going forward; a one-time recompute over
  historical `contribution_events` would seed pre-Phase-27 contributors.

## 12. Phase 28 recommendations
1. Feed real review-accuracy by joining `investigation_reviews` to
   `investigation_governance_decisions` (agreement when the reviewer matched the
   governance outcome) and write `trust_events` rows.
2. Feed real publication traceability + governance approval rate from the
   publishing/traceability subsystems into the trust inputs.
3. Track reliability windows (active periods, abandoned investigations, overdue
   assignments) from the operations/assignment tables.
4. Surface authority on leaderboards and gate *recommendations* (not access) by
   authority — e.g. weight consensus by reviewer trust.
5. One-time historical backfill of `trust_profiles` / `trust_history`.
