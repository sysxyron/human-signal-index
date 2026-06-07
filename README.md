# Human Signal Index (HSI)

> Mapping the narratives that shape humanity.

**Domain:** [humansignalindex.org](https://humansignalindex.org)

Human Signal Index (HSI) is a production-grade monorepo for a public-interest
**signal-intelligence and observability platform**. HSI exists to identify,
collect, preserve, classify, trace, and analyze the public narratives,
ideologies, movements, rhetoric, technologies, and social signals that influence
human behavior and the trajectory of civilization.

HSI is built for **observability, traceability, accountability, media literacy,
and public understanding**. It is explicitly **not** a censorship, attack,
harassment, doxxing, or political-weapon platform. See
[`docs/legal-ethics/`](docs/legal-ethics/) for the binding charter.

---

## 1. Mission

HSI studies *ideas, rhetoric, and movements* — not private people. Its purpose is
to make the influence landscape **legible and accountable** to the public: to
show where a narrative came from, what it claims, what it assumes, what it omits,
and who may be affected by it, with every step open to inspection.

## 2. Core principle: traceability before everything

Every claim must be traceable. Every AI insight shows its provenance. HSI always
distinguishes the four layers of knowledge and never collapses them:

```
RAW SOURCE MATERIAL  →  AI EXTRACTION  →  AI INTERPRETATION  →  HUMAN REVIEW  →  PUBLIC REPORT
   (what was said)      (what was pulled)   (what it may mean)   (verified by a person)  (published)
```

- **No black-box conclusions.** Every analytical statement links to evidence.
- **No unattributed analysis.** Every AI output records model, prompt, and inputs.
- **No unverifiable claims.** A human reviewer signs off before anything is public.

## 3. Principles (charter summary)

1. **Argue against ideas, never against private individuals.**
2. **No harassment, doxxing, or mob incitement** — ever.
3. **Cite sources.** Public material only; no private data, no login-walled content.
4. **Mental-health-safe framing** and care for vulnerable audiences.
5. **Human-in-the-loop.** AI assists; people decide.
6. **Separate the layers** of source, extraction, interpretation, and review.
7. **Least privilege.** Private evidence is never public unless explicitly published.

The full charter lives in [`docs/legal-ethics/ETHICS-POLICY.md`](docs/legal-ethics/ETHICS-POLICY.md).

---

## 4. Architecture map

```
human-signal-index/
├─ apps/
│  ├─ web/                  Next.js App Router — public site + authenticated dashboard
│  └─ worker/               Capture & processing worker (cron-driven jobs)
├─ packages/
│  ├─ ui/                   Shared component system + design tokens (shadcn/ui foundation)
│  ├─ config/               Environment schema + configuration helpers
│  ├─ database/             Supabase/Postgres client, Prisma + supabase-js helpers
│  ├─ shared-types/         Shared TypeScript domain models
│  ├─ ai-prompts/           Prompt templates for AI-assisted workflows
│  ├─ classifiers/          36-category rhetoric taxonomy + classifier helpers
│  ├─ traceability/         Provenance / source-to-claim tracing engine
│  ├─ source-connectors/    Ingestion connectors (RSS, official APIs, public capture)
│  └─ security/             Security headers, RBAC guards, audit helpers
├─ workspaces/              Interpretable Context Methodology (ICM) workflow stages
│  ├─ signal-intake/        rhetoric-classification/   counter-narrative/
│  ├─ source-capture/       risk-scoring/              public-briefing/
│  └─ transcript-review/    traceability-audit/
├─ supabase/
│  ├─ migrations/           0001 → 0004 SQL migrations
│  └─ seed/                 seed-data.sql (taxonomy + neutral sample signals)
├─ scripts/                 seed.ts, setup-local.ts
└─ docs/                    architecture, security, methodology, legal-ethics,
                            deployment, operating-procedures, design
```

See [`docs/architecture/README.md`](docs/architecture/README.md) for the full
data-flow and end-to-end signal lifecycle.

## 5. Tech stack

| Layer | Technology |
| --- | --- |
| Monorepo / build | Turborepo, pnpm workspaces |
| Web | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui foundation |
| Worker | TypeScript, Playwright (public page capture), RSS parser, official APIs |
| Data | Supabase (Postgres, Auth, Storage, RLS), Prisma + supabase-js |
| AI | Provider abstraction over OpenAI / Anthropic-compatible APIs |
| Observability | Sentry-ready, OpenTelemetry-ready |
| Hosting | Vercel (`apps/web`), external/Vercel cron (`apps/worker`) |
| Edge security | Cloudflare DNS + WAF-ready |

---

## 6. Prerequisites

- **Node.js** 20 LTS or newer
- **pnpm** 9+ (`corepack enable` recommended; a bundled `pnpm-win-x64.exe` is
  available on Windows hosts without a global install)
- **Supabase** account and project (Postgres + Auth + Storage)
- **Vercel** account (web hosting) and **Cloudflare** account (DNS/WAF)
- AI provider key(s): `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`

## 7. Install, run, build

```bash
# Install all workspace dependencies
pnpm install

# Create your local environment file
cp .env.example .env        # then fill in values (see section 8)

# Run web + worker locally via Turborepo
pnpm dev

# Build every package and app
pnpm build

# Lint and format
pnpm lint
pnpm format
```

## 8. Environment setup

Copy `.env.example` to `.env` and provide values. Reference variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public URL of the dashboard app (`https://app.humansignalindex.org`) |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the marketing site (`https://www.humansignalindex.org`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **server/worker only, never client** |
| `DATABASE_URL` | Pooled Postgres connection string (app runtime) |
| `DIRECT_URL` | Direct Postgres connection (migrations) |
| `AI_PROVIDER` | `openai` or `anthropic` — selects the AI abstraction backend |
| `OPENAI_API_KEY` | OpenAI-compatible key (if `AI_PROVIDER=openai`) |
| `ANTHROPIC_API_KEY` | Anthropic key (if `AI_PROVIDER=anthropic`) |
| `SENTRY_DSN` | Sentry error reporting endpoint |
| `CLOUDFLARE_TURNSTILE_SITE_KEY` | Turnstile CAPTCHA site key (public forms) |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY` | Turnstile secret (server verification) |
| `CRON_SECRET` | Shared secret authenticating worker cron invocations |
| `UPLOAD_MAX_MB` | Max upload size in MB (default `250`) |
| `TRACEABILITY_MIN_CONFIDENCE` | Publish-gate confidence floor (default `0.72`) |

## 9. Database migrations and seed

```bash
# Apply migrations in order (Supabase CLI)
supabase db push                       # applies supabase/migrations/0001 → 0004

# OR apply manually with psql in order
psql "$DIRECT_URL" -f supabase/migrations/0001_init.sql
psql "$DIRECT_URL" -f supabase/migrations/0002_rls_and_policies.sql
psql "$DIRECT_URL" -f supabase/migrations/0003_indexes_constraints.sql
psql "$DIRECT_URL" -f supabase/migrations/0004_storage_buckets.sql

# Seed taxonomy + neutral sample data
pnpm seed                              # runs scripts/seed.ts
# OR
psql "$DIRECT_URL" -f supabase/seed/seed-data.sql
```

Migration order **matters**: `0001` creates tables, `0002` enables RLS/policies,
`0003` adds indexes/constraints (+ `captures` table), `0004` provisions storage
buckets. Always apply 0001 → 0004 sequentially.

## 10. Local commands reference

| Command | Action |
| --- | --- |
| `pnpm dev` | Run web + worker via Turbo |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all workspaces |
| `pnpm format` | Format with Prettier |
| `pnpm db:push` | Sync database schema (database package) |
| `pnpm seed` | Seed taxonomy + sample signals |

---

## 11. Documentation index

| Area | Document |
| --- | --- |
| Architecture | [`docs/architecture/README.md`](docs/architecture/README.md), [`DATA-MODEL.md`](docs/architecture/DATA-MODEL.md), [`DASHBOARD-SECTIONS.md`](docs/architecture/DASHBOARD-SECTIONS.md) |
| Methodology | [`docs/methodology/README.md`](docs/methodology/README.md), [`RHETORIC-TAXONOMY.md`](docs/methodology/RHETORIC-TAXONOMY.md), [`RISK-SCORING.md`](docs/methodology/RISK-SCORING.md) |
| Security | [`docs/security/README.md`](docs/security/README.md), [`THREAT-MODEL.md`](docs/security/THREAT-MODEL.md), [`PLATFORM-SECURITY-MONITOR.md`](docs/security/PLATFORM-SECURITY-MONITOR.md) |
| Legal & ethics | [`docs/legal-ethics/README.md`](docs/legal-ethics/README.md), [`ETHICS-POLICY.md`](docs/legal-ethics/ETHICS-POLICY.md), [`DATA-HANDLING.md`](docs/legal-ethics/DATA-HANDLING.md), [`RESPONSIBLE-USE.md`](docs/legal-ethics/RESPONSIBLE-USE.md) |
| Deployment | [`docs/deployment/README.md`](docs/deployment/README.md) |
| Operating procedures | [`docs/operating-procedures/README.md`](docs/operating-procedures/README.md), [`REVIEW-QUEUE.md`](docs/operating-procedures/REVIEW-QUEUE.md), [`PUBLISHING-CHECKLIST.md`](docs/operating-procedures/PUBLISHING-CHECKLIST.md) |
| Design | [`docs/design/README.md`](docs/design/README.md), [`references/README.md`](docs/design/references/README.md) |
| ICM workflows | [`workspaces/*/CONTEXT.md`](workspaces/) |

## 12. Deployment summary

1. Push repo to GitHub; protect `main`.
2. Create the Supabase project; capture URL + keys.
3. Apply migrations `0001 → 0004` and seed.
4. Deploy `apps/web` to Vercel; set all env vars.
5. Configure Cloudflare DNS + WAF for `www`, `app`, `api`.
6. Schedule `apps/worker` cron jobs with `CRON_SECRET`.
7. Create the first admin and run the security hardening checklist.

Full procedure: [`docs/deployment/README.md`](docs/deployment/README.md).

## 13. What's complete vs. what needs credentials

**Complete in this repo (no external accounts required):**

- Full monorepo scaffold (apps, packages, workspaces).
- Database schema migrations `0001 → 0004` and seed data (36-category taxonomy +
  neutral sample signals).
- Design system tokens and component foundation.
- The complete documentation set under `docs/` and ICM `CONTEXT.md` files.

**Requires your credentials / external setup to go live:**

- Supabase project (URL, anon key, service-role key, `DATABASE_URL`, `DIRECT_URL`).
- AI provider key(s) (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`).
- Vercel project + environment variables.
- Cloudflare DNS, WAF, and Turnstile keys.
- Sentry DSN (optional but recommended).
- `CRON_SECRET` for worker scheduling.
- The two design reference images (see
  [`docs/design/references/README.md`](docs/design/references/README.md)).

---

## 14. WorldForge (Phase 2 — Causal Simulation Engine)

**WorldForge** is a causal world-simulation subsystem layered on top of HSI. It
applies the platform's provenance/traceability discipline to *simulated worlds*:
a user supplies inputs, the engine derives a canonical `WorldState` as a directed
causal graph, and any change **propagates** through the graph — every derived
value recording what produced it, why, what it depends on, and a Scientific
Confidence tier (`known-science → plausible-science → speculative → fictional →
violates-known-physics`).

```
INPUT → WORLD STATE → SIMULATION GRAPH → DYNAMIC RECALCULATION → REPORT
```

**New packages (4):**

- `@hsi/world-models` — canonical `WorldState`, universe-type model, dependency graph.
- `@hsi/simulation-engine` — builds the graph, runs the science, propagates changes, emits versions/diffs/provenance.
- `@hsi/timeline-engine` — generates evolution/civilization/planetary/stellar timelines.
- `@hsi/counterfactuals` — "what if" experiments with propagated impact chains.

**New dashboard pages** under `/dashboard/worldforge`: world gallery, world
overview, dependency `graph`, `simulate`, `timeline`, `counterfactuals`, and
`versions`.

**New database tables (migration `0005_worldforge.sql`, 7 tables):** `worlds`,
`simulations`, `simulation_versions`, `scenarios`, `counterfactuals`,
`world_timelines`, `simulation_provenance` — RLS via the existing
`admin/reviewer/viewer` model plus a `simulation_is_public()` helper (viewers/anon
read public worlds only). TypeScript mirrors are appended to
`packages/shared-types/src/index.ts`. Demo seed:
`supabase/seed/worldforge-seed.sql` (Earth Reference + Chronid Prime).

**Docs:**

- Architecture — [`docs/architecture/WORLDFORGE.md`](docs/architecture/WORLDFORGE.md)
- Scientific methodology — [`docs/methodology/WORLDFORGE-SCIENCE.md`](docs/methodology/WORLDFORGE-SCIENCE.md)
- Chronid Prime demonstration — [`docs/methodology/CHRONID-PRIME.md`](docs/methodology/CHRONID-PRIME.md)
- Deployment — [`docs/deployment/README.md`](docs/deployment/README.md) §5a

> WorldForge scores are illustrative / order-of-magnitude and **not**
> peer-reviewed; the value is the traceable chain of reasoning.

---

## 15. License & contact

Public-interest research project. Operate strictly within the
[ethics charter](docs/legal-ethics/ETHICS-POLICY.md) and
[responsible-use policy](docs/legal-ethics/RESPONSIBLE-USE.md). For takedown or
correction requests see [`docs/legal-ethics/DATA-HANDLING.md`](docs/legal-ethics/DATA-HANDLING.md).
