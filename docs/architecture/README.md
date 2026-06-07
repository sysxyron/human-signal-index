# HSI Architecture Overview

Human Signal Index (HSI) is a modular Turborepo monorepo built for
public-interest signal intelligence. This document describes the system
architecture, data flow, dashboard surface, data model, worker pipeline, AI
abstraction, and the end-to-end lifecycle of a single signal.

Related: [`DATA-MODEL.md`](DATA-MODEL.md) · [`DASHBOARD-SECTIONS.md`](DASHBOARD-SECTIONS.md)

---

## 1. Monorepo map

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js (App Router) public marketing site **and** authenticated dashboard. Serves public reports, transparency pages, and the reviewer/admin UI. Hosts serverless API routes (intake, cron entry points, signed-upload issuance). |
| `apps/worker` | Background capture and processing. Runs cron-driven jobs: source polling (RSS/APIs), public-page capture (Playwright), AI extraction, classification, risk scoring, and traceability audits. |
| `packages/ui` | Shared component system + design tokens (shadcn/ui foundation, Tailwind). |
| `packages/config` | Environment schema validation and configuration helpers. |
| `packages/database` | Supabase/Postgres access; Prisma + supabase-js helpers and typed queries. |
| `packages/shared-types` | Cross-package TypeScript domain models. |
| `packages/ai-prompts` | Versioned prompt templates for extraction, interpretation, classification, scoring. |
| `packages/classifiers` | The 36-category rhetoric taxonomy + classifier orchestration. |
| `packages/traceability` | The provenance engine: maps every AI claim to source passages. |
| `packages/source-connectors` | RSS, official-API, and public URL/page connectors. |
| `packages/security` | Security headers, RBAC guards, audit + security-event helpers. |
| `workspaces/*` | Interpretable Context Methodology (ICM) workflow stages, each with `CONTEXT.md` + `output/`. |
| `supabase/` | Migrations `0001 → 0004` + seed. |
| `scripts/` | `seed.ts`, `setup-local.ts`. |

## 2. Deployment topology

```
              ┌──────────────────────── Cloudflare (DNS + WAF + Turnstile) ────────────────────────┐
              │                                                                                     │
   Public  ───┼──>  www.humansignalindex.org   (marketing + public reports)   ┐                     │
   Reviewer ──┼──>  app.humansignalindex.org   (authenticated dashboard)      ├─> Vercel (apps/web) │
   Programs ──┼──>  api.humansignalindex.org   (API routes / cron entry)      ┘                     │
              └─────────────────────────────────────────────────────────────────────────────────────┘
                                    │                                   │
                                    ▼                                   ▼
                         Supabase (Postgres + Auth         apps/worker (cron-scheduled)
                          + Storage + RLS)                  capture / extract / classify /
                                    ▲                        score / trace
                                    └──────────── AI Provider abstraction (OpenAI / Anthropic) ──────────┘
```

- **Vercel** hosts `apps/web` (SSR/ISR + serverless API routes).
- **Supabase** hosts Postgres data, Auth, and Storage with Row Level Security.
- **`apps/worker`** runs scheduled jobs, authenticated by `CRON_SECRET`.
- **Cloudflare** terminates DNS, applies WAF rules, and serves Turnstile.
- **Sentry / OpenTelemetry** capture errors and traces across web + worker.

## 3. Data flow

The platform is a directional pipeline. Data only moves forward when each
provenance layer is recorded, and only becomes public when a human approves it.

```
SOURCE                  →  CAPTURE              →  EVIDENCE VAULT       →  AI EXTRACTION
(public URL/RSS/API)       (Playwright snapshot,   (raw text + screenshots  (quotes, entities,
                            hash, timestamp)        + hashes, private)       claims pulled out)
        │                                                                          │
        ▼                                                                          ▼
PUBLIC REPORT          ←  HUMAN REVIEW          ←  TRACEABILITY         ←  CLASSIFICATION + RISK
(published, cited)        (approve / reject /      (every claim mapped     (36-category taxonomy,
                          edit / escalate)         to source passages)      5-level risk model)
```

The four-layer provenance separation is enforced at the data level:

| Layer | Stored in | Public by default? |
| --- | --- | --- |
| Raw source material | `evidence_items`, `transcripts`, `captures`, `uploaded_files`, Storage `evidence`/`uploads` buckets | **No** |
| AI extraction | `ai_runs`, `ai_trace_passages` | No |
| AI interpretation | `generated_content`, `classifications`, `risk_scores` | No |
| Human review | `reviews` | No |
| Public report | `public_reports`, `public-report-assets` bucket | **Only when published** |

## 4. The 12 dashboard sections

The authenticated dashboard (`app.`) is organized into 12 functional sections,
detailed field-by-field in [`DASHBOARD-SECTIONS.md`](DASHBOARD-SECTIONS.md):

1. **Overview / Observatory** — system health, signal volume, risk distribution.
2. **Signal Intake** — submit and triage new signals.
3. **Source Registry** — managed sources, confidence baselines, change history.
4. **Evidence Vault** — raw captures, transcripts, uploads, chain-of-custody.
5. **Transcript Review** — verify transcripts, extract quotes.
6. **Rhetoric Classification** — apply/confirm the 36-category taxonomy.
7. **Risk Scoring** — assign the 5-level risk score with justification.
8. **Traceability Audit** — verify claim-to-source mapping, flag unsupported claims.
9. **Review Queue** — the human-in-the-loop approval workflow.
10. **Counter-Narrative Studio** — draft safe, source-backed educational explainers.
11. **Public Reports** — compose, gate, and publish public briefings.
12. **Security & Alerts** — monitored events, audit logs, alert runbook.

(A 13th administrative surface — **Settings / Admin** — covers users, roles,
taxonomy, and platform configuration; documented in `DASHBOARD-SECTIONS.md`.)

## 5. Database model list

The schema spans ~23 tables across migrations `0001 → 0004`. Summary
(full detail in [`DATA-MODEL.md`](DATA-MODEL.md)):

`users`, `roles`, `user_roles`, `sources`, `signals`, `evidence_items`,
`transcripts`, `classifications`, `category_taxonomy`, `risk_scores`,
`reviews`, `alerts`, `ai_runs`, `ai_trace_passages`, `generated_content`,
`public_reports`, `audit_logs`, `security_events`, `source_changes`,
`uploaded_files`, `comments`, `tags`, `captures`.

Storage buckets (migration `0004`): `evidence` (private), `uploads` (private),
`public-report-assets` (public-read).

## 6. Worker / cron pipeline

`apps/worker` exposes discrete jobs invoked on a schedule. Every job is
authenticated with `CRON_SECRET` and writes provenance metadata.

| Job | Cadence (suggested) | Action |
| --- | --- | --- |
| `poll-sources` | every 30–60 min | Pull RSS / official-API items from registered `sources`. |
| `capture-pages` | on new signal / hourly | Playwright snapshot of public URLs → `captures` + Storage. |
| `extract` | after capture | AI extraction of quotes/claims → `ai_runs`, `ai_trace_passages`. |
| `classify` | after extract | Apply 36-category taxonomy → `classifications`. |
| `score-risk` | after classify | Apply 5-level risk model → `risk_scores`. |
| `trace-audit` | after score | Map claims to source passages, flag unsupported → traceability report. |
| `detect-source-change` | daily | Re-capture and diff sources → `source_changes`. |
| `security-monitor` | every 5–15 min | Evaluate `security_events` → raise `alerts`. |

The pipeline is strictly forward-only: a stage never runs until the prior stage's
output exists, and nothing reaches `public_reports` without a `reviews` approval.

## 7. AI provider abstraction

`packages/ai-prompts` + the runtime provider layer expose a single interface over
OpenAI / Anthropic-compatible APIs, selected by `AI_PROVIDER`.

- Prompts are **versioned templates** (extraction, interpretation, classification,
  scoring), so any output can be reproduced from its recorded prompt version.
- Every invocation writes an `ai_runs` row: provider, model, prompt version,
  input references, output, token usage, and timestamp.
- Extraction and interpretation are **separate prompt classes** — the system never
  asks one prompt to both pull a quote and conclude what it means.
- The provider abstraction means swapping `AI_PROVIDER` does not change the
  provenance contract.

## 8. End-to-end signal lifecycle (sequence)

```
1.  Intake        A contributor/connector creates a `signals` row (status=intake)
                  with source attribution. Public-only material.
2.  Source        The source is resolved/registered in `sources` (confidence baseline).
3.  Capture       Worker snapshots the public page → `captures` + Storage (evidence bucket),
                  records URL, timestamp, content hash (chain-of-custody begins).
4.  Evidence      Capture + any transcript/upload become `evidence_items` (private).
5.  Transcript    If audio/video, transcript is produced and human-verified → `transcripts`.
6.  Extraction    AI pulls candidate quotes/claims → `ai_runs` + `ai_trace_passages`.
7.  Classification AI proposes categories from the 36-taxonomy → `classifications`.
8.  Risk scoring  AI proposes a 1–5 risk level with a neutral explanation → `risk_scores`.
9.  Traceability  Engine maps each claim to source passages; computes confidence;
                  flags unsupported/unattributed claims (must meet TRACEABILITY_MIN_CONFIDENCE).
10. Human review  A reviewer approves / edits / requests-more / escalates → `reviews`.
11. Counter-narr. (Optional) Safe educational explainer drafted → `generated_content`.
12. Publish gate  Traceability + review + safe-framing checks must all pass.
13. Public report Approved content published → `public_reports` (+ public-report-assets).
                  Raw private evidence stays private; only cited, approved material is shown.
```

Audit logging (`audit_logs`) and security monitoring (`security_events` → `alerts`)
run alongside every stage.

## 9. ASCII architecture diagram

```
                         ┌─────────────────────────────────────────────┐
                         │                Cloudflare                    │
                         │        DNS · WAF · Turnstile · TLS           │
                         └───────────────┬─────────────────────────────┘
                                         │
        ┌────────────────────────────────┼─────────────────────────────────┐
        │                                ▼                                  │
        │   apps/web (Vercel)                                               │
        │   ┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
        │   │ Marketing /  │   │ Dashboard (RBAC) │   │ API routes      │  │
        │   │ public site  │   │ 12 sections      │   │ intake · cron   │  │
        │   └──────────────┘   └──────────────────┘   └────────┬────────┘  │
        └─────────────────────────────────────────────────────┼───────────┘
                                                               │ CRON_SECRET
                          ┌────────────────────────────────────┘
                          ▼
        ┌──────────────────────────────┐        ┌────────────────────────────┐
        │ apps/worker                  │        │ AI Provider Abstraction     │
        │ poll · capture · extract ·   │<──────>│ OpenAI / Anthropic          │
        │ classify · score · trace ·   │        │ (AI_PROVIDER)               │
        │ source-change · sec-monitor  │        └────────────────────────────┘
        └───────────────┬──────────────┘
                        │
                        ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ Supabase                                                       │
        │  Postgres (23 tables, RLS)  ·  Auth (admin/reviewer/viewer)    │
        │  Storage: evidence(priv) · uploads(priv) · public-assets(pub)  │
        └──────────────────────────────────────────────────────────────┘

        Observability: Sentry (errors) · OpenTelemetry (traces) across web + worker
```

---

See [`docs/methodology/README.md`](../methodology/README.md) for how the pipeline
maps to the HSI provenance methodology, and
[`docs/security/README.md`](../security/README.md) for the access-control model.
