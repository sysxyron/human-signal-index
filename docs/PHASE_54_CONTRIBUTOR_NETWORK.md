# Phase 54 — Contributor Network & Reputation System

`/dashboard/contributors` is now a **contribution-intelligence** surface answering
"do we have enough contributors / reviewers? where are the coverage gaps? who
consistently produces high-quality work? where are dependency risks?" — **not**
social media, not popularity profiles. Read-only, role-aware, built from the cached
intelligence layers. The existing Phase 20 **per-contributor reliability board**
(explainable rankings + trust breakdown) is preserved as the contributor explorer.

**Untouched:** RBAC, IAM, auth, middleware, Stripe, billing, compliance, signal /
review / publication / source workflows. No identities are exposed by the new
sections (aggregate counts only).

---

## Architecture

```
public-intelligence.ts   → getPublicIntelligenceBundle() / getSignalLibraryData()  (metrics, cases, trends)
source-intelligence.ts   → getSourceIntelligence()        (coverage, analytics)
operations-intelligence  → getOperationsIntelligence()    (review ops)
collaboration-intelligence → getCollaborationData(role)   (source concentration, backlog pressure)
beta-operations.ts       → getBetaOperations()  (ADMIN ONLY — aggregate role counts)
        ▼ getContributorNetwork(role)  (Promise.all over cached sources — no duplicate reads, no N+1)
app/dashboard/contributors/page.tsx  (SERVER, force-dynamic, researcher+ via canResearch)
  • Executive summary        Part 9
  • Contributor overview     Part 2 (aggregate role counts — admin only)
  • Contribution health      Part 3
  • Contributor quality      Part 4   • Reputation model       Part 6 (explained tiers)
  • Category coverage        Part 5
  • Network health           Part 7
  + existing Phase 20 reliability board (per-contributor explorer + reputation)  Part 8
```

## Reputation model (Part 6) — transparent, no black box

A criteria-based model, every level explained on the page. **Inputs only:** approved
contributions, traceability, publication outcomes, consistency, activity continuity.
**Tiers:** Emerging → Established → Trusted → Expert, plus Inactive. There is **no
hidden score** — the model is published as criteria, and actual per-contributor
standing is shown in the preserved reliability board (which already exposes the
counts behind each contributor's reliability, "no hidden scoring").

## Quality model (Part 4) — explainable

- **Traceability average** = mean publication trust score.
- **Publication success rate** = published ÷ (published + archived).
- **Review outcome quality** = recent approval rate.
- **Consistency** (Low/Moderate/High) = number of periods with observed output (1 / 2 / 3+), with the reason shown on hover.
- **Confidence** (Low/Moderate/High) = observed sample size (<12 / <50 / ≥50), with the reason shown.

No black-box scoring — each badge states why.

## Coverage model (Part 5)

Per category (Influence … Other): contributing sources, signals, publications, and a
Gap/Covered status. Gaps = categories with zero contributing sources.

## Health model (Part 7)

Coverage strength (covered ÷ 6), reviewer capacity (reviewers + backlog), research
capacity, growth rate, retention (active ÷ total), and **single-point dependency
risks** (categories served by a single source + source concentration ≥40%). Capacity
/ growth / retention require aggregate role counts → admin-only; coverage strength
and dependency risks are available to all researcher+ viewers.

## Role-aware access (Part 10)

- **Gate:** researcher+ via the existing `canResearch` (the preserved board keeps its
  own `mayView` check). RBAC + middleware still enforce.
- **Admins** see the full picture incl. aggregate role-count overview + capacity /
  growth / retention. **Researchers / reviewers** see contribution health, quality,
  category coverage, network coverage strength + dependency risks, and the reputation
  model + reliability board — the overview panel shows an "admin-only" note instead of
  raw user counts.

---

## Performance

- Up to five cached reads via `Promise.all` (shared cache tags); the admin role-count
  read runs only for admins. No duplicate reads, no N+1. Fully server-rendered.

## Public safety

- Aggregate counts + explainable derived scores only; **no identities** in the new
  sections (the preserved reliability board uses the existing Phase 20 contributor
  presentation). No PII, no social/popularity framing, no messaging, no write actions.

---

## Files

**Added**
- `apps/web/lib/contributor-network.ts` — aggregate contribution intelligence + explainable reputation/quality model (composed, read-only).
- `apps/web/components/contributor-network/panels.tsx` — exec summary, overview, contribution health, quality, category coverage, reputation model, network health.
- `docs/PHASE_54_CONTRIBUTOR_NETWORK.md` — this report.

**Changed**
- `apps/web/app/dashboard/contributors/page.tsx` — added the network-intelligence sections above the preserved Phase 20 reliability board.

> Reuses public / source / operations / collaboration / beta-operations layers. No
> new queries, no workflow or permission changes.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build` (clean `.next`): **exit 0, "Compiled successfully"**; `ƒ /dashboard/contributors` → 976 B (114 kB first load).
