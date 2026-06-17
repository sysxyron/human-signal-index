# Phase 50 — Beta Operations Center

A new **admin-only** operational command center at `/dashboard/beta-operations`
that answers "how is the platform itself performing?" (vs Mission Control's "what
is happening in intelligence?"). An administrator can immediately see whether beta
is growing, whether it's healthy, where the bottlenecks are, and what needs
attention next.

**Untouched:** RBAC, IAM, auth, middleware, Stripe, billing, compliance, existing
intelligence workflows, and existing permissions. Read-only operational layer only.
No schema/RLS changes. The existing Launch Operations Center (`/dashboard/launch`)
is left intact — this is a separate, additive page.

---

## Architecture & data flow

```
public-intelligence.ts   → getPublicIntelligenceBundle()  (metrics, activityBar)
                         → getSignalLibraryData()          (risk facets, trends)
source-intelligence.ts   → getSourceIntelligence()         (health, coverage)
operations-intelligence  → getOperationsIntelligence()     (pipeline, review ops)
beta-operations.ts       → loadUserStats()                 (aggregate user/role counts) [NEW cached read]
        ▼ getBetaOperations()  (Promise.all over 5 cached sources — no duplicate queries)
app/dashboard/beta-operations/page.tsx  (SERVER, force-dynamic, admin self-gated via isAdmin)
  • Executive summary       Part 9   — health / growth / participation / trust / risk / readiness
  • Beta overview           Part 1   — totals, active, new/7d, role counts + role distribution
  • Platform health         Part 2   — submitted / published / reports / reviews / sources / traceability + trend
  • User activity & engage  Part 3,4 — recent submissions/publications/reviews, participation/contribution
  • Workload health         Part 5   — backlog, open investigations, pending publication, queue pressure
  • Adoption                Part 6   — most active roles + categories (page analytics: honest placeholder)
  • Platform risks          Part 7   — bottlenecks / low traceability / coverage gaps / delays / critical backlog
  • Feedback center         Part 8   — read-only placeholder (architecture reserved, no write actions)
```

### New cached read — `lib/beta-operations.ts`
`getBetaOperations()` composes the **already-cached** Phase 43–47 getters and adds a
small admin-only aggregate read (`loadUserStats`, cached, tag `beta-operations`):
`users` count + active (`status='active'`) + new-this-week (`created_at ≥ 7d`) +
role distribution from `user_roles → roles(name)` (one read, tallied in memory).
**Aggregate counts only — never emails, names, or any PII.**

---

## Metrics

| Section | Source |
|---|---|
| Total / active / new users, role distribution | `users` + `user_roles→roles` counts (admin read) |
| Signals submitted / published, reports, reviews, sources, traceability | public metrics + pipeline + source health |
| Recent submissions / publications / reviews | pipeline `Signal` stage, `publishedToday`, today's review decisions |
| Participation / contribution rate | engaged roles ÷ total users / contributors+engaged ÷ total |
| Review backlog / open investigations / pending publication / queue pressure | operations pipeline + review ops |
| Adoption (roles, categories) | role distribution + source coverage |
| Platform risks | derived flags (backlog>20, traceability<80, coverage gaps, pending pub>10, critical>0) |
| Executive summary / readiness | composite of health, growth, participation, trust, risk |

**Honest gaps (never faked):** recent logins, DAU, WAU, retention, and most/least-
used page analytics require session/client telemetry that isn't collected yet — they
render as **"—"** with an on-panel note. The feedback center is a read-only
placeholder (0 metrics + reserved architecture, no write actions).

---

## Safety controls

- **Admin-only**, self-gated via `isAdmin(role)` (same pattern as the Launch
  Operations Center) — non-admins get the standard `ErrorState`; RBAC + middleware
  still gate the route. No permission or workflow changes.
- **No PII:** only aggregate counts and role distribution are read; no emails, user
  names, or identities are selected or shown. User-activity metrics are aggregate.
- Graceful empty/zero states everywhere (sandbox/CI without env, or anon RLS):
  zeroed counts, "All clear" risks, empty feedback — no fabricated data.

---

## Performance

- Five cached reads via `Promise.all` (shared cache tags `public-intelligence` /
  `beta-operations`) → ≤1 DB pass per cache window. The user/role read is bounded
  (counts + one capped `user_roles` select) — no N+1.
- Fully server-rendered (no client islands on this page). No client-bundle growth
  from server libs (type-only imports).

---

## Files

**Added**
- `apps/web/lib/beta-operations.ts` — composed beta-ops data + aggregate user/role counts (cached, read-only).
- `apps/web/components/beta-operations/panels.tsx` — executive summary, overview, platform health, user activity, workload, adoption, risks, feedback center.
- `apps/web/app/dashboard/beta-operations/page.tsx` — admin-gated Beta Operations Center.
- `docs/PHASE_50_BETA_OPERATIONS_CENTER.md` — this report.

> Reuses `public-/source-/operations-intelligence` and the category mapping. No
> changes to existing routes, nav config, or the Launch Operations Center.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `ƒ /dashboard/beta-operations` → 280 B (110 kB first load, fully server-rendered).
