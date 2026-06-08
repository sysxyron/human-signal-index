# Publication System — WorldForge Phase 6

Curators turn an approved entity into a **versioned, visibility-gated public
report**. Each publication freezes an immutable snapshot (a `PublicReportDraft`)
so the public-facing artifact never drifts as the underlying run keeps evolving.

> Persistence: `publication_records` + `publication_versions` (migration 0010).
> Builder: `apps/web/lib/governance/report-builder.ts`. DAL +
> actions: `apps/web/lib/governance/persistence.ts` /
> `apps/web/app/dashboard/review/actions.ts`.

---

## 1. Publishable entities

`ReviewEntityType`:
`research_run · consensus_report · evidence_summary · worldforge_report ·
evidence_source · publication`.

The rich report builder fully assembles **`research_run`** today (consensus +
evidence + claims + reviewer notes). Other kinds receive a minimal, *honest*
draft (no invented content) so publication still works; the builder is the single
extension point for richer per-type assembly.

---

## 2. Data model

```
publication_records (one per published entity)
  id, entity_type, entity_id, published_by, published_at,
  visibility (PRIVATE|TEAM|PUBLIC), status, latest_version, …
        │ 1
        │
        │ N
publication_versions (immutable snapshots)
  id, publication_record_id, version_number, snapshot_json (jsonb), created_by, created_at
  UNIQUE (publication_record_id, version_number)
```

- **First publish** of an entity → inserts a `publication_records` row + version `1`.
- **Re-publish** of the same `(entity_type, entity_id)` (or via `republishEntity(publicationId)`)
  → appends version `N+1` and bumps `latest_version`. Old snapshots are retained.
- `latest_version` on the record always points at the newest snapshot.

### Versioning / diff

Because every version stores the full frozen `snapshot_json`, "diff" is a
client-side comparison of any two `publication_versions.snapshot_json` payloads
(e.g. version *N* vs *N-1*): compare `consensus.governedConfidence`,
`evidenceSummary` counts, `keyClaims`, and `contradictions` to show what changed
between publications. `getPublication(id)` returns the record + all versions in
ascending order for the history view.

---

## 3. Visibility + RLS

`publication_records.visibility ∈ { PRIVATE, TEAM, PUBLIC }`:

| Tier      | Who can READ (enforced by RLS in 0010)                         |
|-----------|----------------------------------------------------------------|
| `PUBLIC`  | Everyone, including anonymous (`anon`) callers.                |
| `TEAM`    | Any authenticated user (`auth.uid() is not null`).             |
| `PRIVATE` | The publisher (`published_by = auth.uid()`) + curators/admins. |

WRITES (insert/update) to both tables are restricted to **curator+**
(`is_curator_or_admin`); snapshots are immutable (no UPDATE policy). A version is
readable iff its parent record is readable (the policy reproduces the parent's
visibility rule via `EXISTS`). The DAL never uses the service role for
user-facing publishes — all writes flow through the cookie-backed, RLS-enforced
client and are additionally role-gated in-process.

---

## 4. Report builder output (`PublicReportDraft`)

`buildPublicReport(entityType, entityId)` assembles (pure read-only):

| Field              | Source                                                                   |
|--------------------|--------------------------------------------------------------------------|
| `executiveSummary` | consensus `summary` + headline governed/consensus confidence             |
| `keyClaims`        | top claims (by reliability, else confidence) with tier + reliability     |
| `evidenceSummary`  | coverage counts (`supported/contradicted/background/unsupported/score`)  |
| `supportRatio`     | `coverage.supportRatio`                                                  |
| `contradictions`   | claims whose evidence verdict is `contradicted`                          |
| `consensus`        | overall + agreement + governed + evidence confidence + review status     |
| `reviewerNotes`    | notes from `review_decisions` on the entity's review queue(s)            |
| `metadata`         | `entityType`, `entityId`, `title`, `generatedAt`, `version`              |

Pure assembly from existing tables; it invents nothing and never throws
(`DbResult`). The frozen draft is what lands in `snapshot_json`.

---

## 5. Publication workflow

```
 (entity APPROVED in the review queue)
            │
            ▼
 publishEntity(entityType, entityId, visibility)        [curator+]
   1. buildPublicReport(...)            → frozen PublicReportDraft
   2. publication_records: insert (v1) OR bump latest_version (vN+1)
   3. publication_versions: insert snapshot_json @ versionNumber
   4. review_queues.status → 'published' (if a queue exists)
   5. notify publisher (publication_approved) + audit (entity_published)
            │
            ▼
 PUBLISHED  ──────────────────────────────────────────┐
   │                                                   │
   │ updatePublicationVisibility(id, visibility)       │ republishEntity(id)
   │   [curator+]                                       │   [curator+]
   ▼                                                   ▼
 visibility changed                          new immutable version (vN+1)
                                              latest_version bumped
                                              audit (entity_republished)
```

`listPublications()` returns the RLS-visible records (PUBLIC for anon, TEAM for
authed, PRIVATE for owner/curator) newest first; `getPublication(id)` returns the
record + full version history for the detail / diff view.

---

## 6. Module map

- `publishEntity` / `republishEntity` / `listPublications` / `getPublication` / `updatePublicationVisibility` — `apps/web/lib/governance/persistence.ts`.
- `buildPublicReport` — `apps/web/lib/governance/report-builder.ts`.
- `*Action` wrappers — `apps/web/app/dashboard/review/actions.ts`.
- `PublicationRecord`, `PublicationVersionRecord`, `PublicReportDraft`, `PublicationVisibility` — `@hsi/shared-types`.
