# HSI Data Model

This document summarizes the HSI Postgres schema as defined in
`supabase/migrations/0001_init.sql` through `0004_storage_buckets.sql`. The model
encodes the four provenance layers (source → extraction → interpretation →
review → public report) directly as tables, and enforces access with Row Level
Security (see [`docs/security/README.md`](../security/README.md)).

All tables live in the `public` schema. RLS is enabled on every table in
migration `0002`.

---

## 1. Table inventory (~23 tables)

### Identity & access

| Table | Purpose | Key columns / relations |
| --- | --- | --- |
| `users` | Platform users (linked to Supabase Auth). | `id`, `email`, `name` |
| `roles` | Role definitions (`admin`, `reviewer`, `viewer`). | `id`, `name`, `description` |
| `user_roles` | Many-to-many user↔role assignment. | `user_id → users`, `role_id → roles` |

### Sources & signals

| Table | Purpose | Key columns / relations |
| --- | --- | --- |
| `sources` | Registered public sources (sites, feeds, channels). | `id`, `source_name`, `source_type`, `public_url`, `platform`, `status`, `tags`, `risk_baseline`, `added_by → users`, `notes` |
| `source_changes` | Detected changes/diffs of a source over time. | `id`, `source_id → sources`, change diff, timestamp |
| `signals` | A tracked narrative/rhetoric instance. | `id`, `source_id → sources`, `title`, `summary`, `signal_type`, `status`, `category[]`, `risk_score` |
| `tags` | Reusable labels for sources/signals. | `id`, `label`, `description` |
| `category_taxonomy` | The 36 rhetoric categories. | `id`, `slug`, `title`, `description` |

### Evidence (raw source layer — private)

| Table | Purpose | Key columns / relations |
| --- | --- | --- |
| `evidence_items` | Raw evidence attached to a signal. | `id`, `signal_id → signals`, content/refs, hashes |
| `captures` | Playwright/page snapshots (added in `0003`). | `id`, `signal_id`/`source_id`, URL, timestamp, content hash |
| `transcripts` | Audio/video transcripts (human-verified). | `id`, `signal_id → signals`, text, corrections |
| `uploaded_files` | User-uploaded files (private; never public). | `id`, `signal_id`, storage path, type, size |

### AI extraction & interpretation layers

| Table | Purpose | Key columns / relations |
| --- | --- | --- |
| `ai_runs` | One record per AI invocation. | `id`, `signal_id`, provider, model, prompt version, inputs, output, tokens, timestamp |
| `ai_trace_passages` | Source passages an AI output draws from. | `id`, `ai_run_id → ai_runs`, evidence ref, passage span, confidence |
| `classifications` | Category labels for a signal. | `id`, `signal_id → signals`, `category`, `score` |
| `risk_scores` | Risk evaluation for a signal. | `id`, `signal_id → signals`, `risk_level` (1–5), `quote`, `explanation`, `confidence`, `reviewer_status`, `recommended_action` |
| `generated_content` | AI-drafted explainers/counter-narratives. | `id`, `signal_id`, body, status |

### Human review & publication

| Table | Purpose | Key columns / relations |
| --- | --- | --- |
| `reviews` | Human review decisions. | `id`, `signal_id → signals`, reviewer, decision, notes |
| `public_reports` | Published, cited public briefings. | `id`, `signal_id → signals`, body, citations, status, published_at |
| `comments` | Internal reviewer comments. | `id`, target ref, `author → users`, body |

### Safety, audit & monitoring

| Table | Purpose | Key columns / relations |
| --- | --- | --- |
| `alerts` | Operational/security alerts raised for action. | `id`, type, severity, status |
| `audit_logs` | Append-only record of policy/review actions. | `id`, actor, action, target, timestamp |
| `security_events` | Raw security telemetry (logins, bots, rate limits). | `id`, event_type, metadata, timestamp |

## 2. Storage buckets (migration `0004`)

| Bucket | Public? | Access policy |
| --- | --- | --- |
| `evidence` | **No** | Read/write: reviewer or admin. Delete: admin only. |
| `uploads` | **No** | Read/write: reviewer or admin. Delete: admin only. |
| `public-report-assets` | **Yes (read)** | Public read; write/update: reviewer or admin; delete: admin. |

**Rule:** raw evidence and uploads are never publicly readable. Only assets
explicitly promoted into `public-report-assets` (as part of an approved public
report) are world-readable.

## 3. Relationship map (textual ERD)

```
auth.users ──1:1── users ──*── user_roles ──*── roles

sources ──1:*── signals ──1:*── evidence_items
   │                │   ├─1:*── captures
   │                │   ├─1:*── transcripts
   │                │   ├─1:*── uploaded_files
   │                │   ├─1:*── ai_runs ──1:*── ai_trace_passages ──*──> evidence_items (passage refs)
   │                │   ├─1:*── classifications ──*──> category_taxonomy (by slug/category)
   │                │   ├─1:*── risk_scores
   │                │   ├─1:*── generated_content
   │                │   ├─1:*── reviews
   │                │   └─0:1── public_reports
   └─1:*── source_changes

tags ──*── (sources.tags / signals.category arrays)

audit_logs · security_events · alerts · comments  (cross-cutting, reference actors/targets)
```

## 4. Provenance enforcement

- A `public_reports` row should only exist after a corresponding `reviews`
  approval and a traceability check meeting `TRACEABILITY_MIN_CONFIDENCE` (0.72).
- Every analytical row (`classifications`, `risk_scores`, `generated_content`)
  traces back to an `ai_runs` record, which records the exact model + prompt
  version + inputs — so any conclusion is reproducible.
- `ai_trace_passages` is the bridge that ties an AI claim to the specific
  evidence passage it relies on; unsupported claims are surfaced when no passage
  meets the confidence floor.

## 5. RLS summary (see security docs for full policy text)

| Visibility class | Tables |
| --- | --- |
| Admin full control | all tables |
| Reviewer read/write (working set) | `sources`, `signals`, `evidence_items`, `transcripts`, `classifications`, `risk_scores`, `reviews`, `alerts`, `ai_runs`, `ai_trace_passages`, `generated_content`, `public_reports`, `source_changes`, `uploaded_files`, `comments`, `captures` |
| Public/anon read | `category_taxonomy`, `tags`, and **published** rows of `sources`, `signals`, `classifications`, `risk_scores`, `generated_content`, `public_reports` |
| Append-only insert (auth) | `audit_logs`, `security_events` |
| Admin-only read | `audit_logs`, `security_events` |
| Never public | `evidence_items`, `transcripts`, `uploaded_files`, `captures`, `ai_runs`, `ai_trace_passages`, evidence/uploads storage buckets |
