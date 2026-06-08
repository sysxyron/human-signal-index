# Human Signal Intelligence Network (HSIN) — Architecture

> Phase 7 of WorldForge / HSI. Extends Phases 1–6. No regressions to prior phases.

The HSIN is a live, multi-source signal-intelligence **observatory** layered on top
of the existing platform. It continuously observes **PUBLIC** signals, captures and
versions them, raises explainable alerts, tracks source health and narrative drift,
and lets reviewers triage captured signals into the established research → evidence →
consensus → governance → publication pipeline.

## The end-to-end flow

```
                         ┌────────────────────────────────────────────────────────┐
                         │  @hsi/source-intelligence (PURE engine — offline-first)  │
                         │  capture → detectChange → classify → matchWatchlists →   │
                         │  generateAlerts → detectNarrativeDrift                   │
                         └────────────────────────────────────────────────────────┘
                                              │ drafts only (never auto-published)
   Source ──monitor──▶ Capture ──hash/diff──▶ Signal ──review──▶ (APPROVE / NEEDS_RESEARCH / ESCALATE)
   (hsin_sources)      (hsin_capture_jobs)    (hsin_signals       │
                       + health               + versions/events)  │  createResearchFromSignalAction
                                                                  ▼
   Evidence ◀─auto─ Research run ◀────────────────── research_runs (origin_signal_id = signal.id)
   (Phase 4-5)      (Phase 3)                          │
        │                                              ▼
        └──────────────▶ Consensus ──▶ Governance review (Phase 6) ──▶ Publication (Phase 6)
                         (Phase 3)      review_queues / decisions       publication_records/versions
```

* **Source → Signal**: the capture pipeline (`lib/signals/pipeline.ts`) runs the pure
  engine for one source and persists the capture job, signal (+ immutable version), an
  event log, watchlist/alert drafts, narrative drift, and source health.
* **Signal → Research**: `createResearchFromSignalAction(signalId)` derives a concept
  from the signal (title + summary + category), calls `createResearchRun()` (Phase 3 —
  which auto-runs evidence + consensus), links the run back via
  `research_runs.origin_signal_id`, and records a `research_created` event + alert.
* **Research → Consensus → Governance → Publication**: entirely reuses Phases 3–6.
  A signal-spawned run flows through `review_queues` / `review_decisions` and can be
  published via `publication_records` exactly like any other run (`entity_type` now
  also accepts `'signal'` and `'source'`).

## The 14 `hsin_` tables (migration 0011)

| Table | Purpose |
|-------|---------|
| `hsin_sources` | A monitored public source (website/rss/youtube/tiktok/podcast/forum/document/manual). |
| `hsin_source_groups` | A named grouping of sources for the UI. |
| `hsin_source_group_members` | Source ↔ group membership (unique per group+source). |
| `hsin_watchlists` | A watchlist of terms at a severity; drives `watchlist_match` alerts. |
| `hsin_watchlist_sources` | Scopes a watchlist to specific sources. |
| `hsin_signals` | A captured signal. `content_hash` de-dupes; `status` drives triage. |
| `hsin_signal_versions` | Immutable snapshot per `(signal, version)` — append-only. |
| `hsin_signal_events` | Append-only event log (`captured`/`classified`/`reviewed`/…). |
| `hsin_signal_tags` | Free-form tags on a signal. |
| `hsin_signal_reviews` | Reviewer verdicts (APPROVE/REJECT/NEEDS_RESEARCH/ESCALATE). |
| `hsin_signal_alerts` | Explainable alerts linked to a signal and/or source. |
| `hsin_source_health` | Point-in-time source health observation. |
| `hsin_capture_jobs` | A capture run against a source (pending/running/success/failed). |
| `hsin_narrative_drift` | A detected narrative-drift event. |

Plus one additive column: `research_runs.origin_signal_id` — the additive link from a
research run back to the HSIN signal that spawned it.

> **Naming**: the `hsin_` prefix preserves the Phase-1 `sources`/`signals` tables. The
> TS record types carry the `Hsin` prefix to mirror that and avoid collisions.

## Ethics principles (binding)

1. **Public-only.** We never capture behind logins, never enter private communities,
   never bypass auth or paywalls. The engine's `assertPublicCapturePolicy` guards every
   capture; the pipeline runs in fixture (offline) mode unless `SIGNAL_CAPTURE_MODE=live`.
2. **No login bypass / no doxxing / no harassment.** We monitor PUBLIC narratives and
   ideologies for research and governance — never private individuals. A watchlist match
   is a topic flag, **not** an accusation.
3. **No auto-publish.** Every captured signal enters at status `new`. The engine emits
   **drafts** only. A human always decides. Publication is the Phase-6 curator path.
4. **Provenance preserved.** Every signal carries its capture job, an immutable version
   chain, and an append-only event log. Alerts always carry an `explanation`.

## Code map (this phase)

| File | Role |
|------|------|
| `apps/web/lib/signals/config.ts` | Resolve engine config from env (fixture vs live). |
| `apps/web/lib/signals/persistence.ts` | The server-only DAL (RLS-aware, never throws). |
| `apps/web/lib/signals/pipeline.ts` | Wraps the engine with DB persistence (`runSourceIntake`). |
| `apps/web/lib/signals/actions.ts` | `'use server'` actions — incl. `createResearchFromSignalAction`. |
| `apps/worker/jobs/source-monitor.ts` | Monitor non-RSS sources. |
| `apps/worker/jobs/rss-monitor.ts` | Fetch + diff RSS feeds → new-item signals. |
| `apps/worker/jobs/signal-classifier.ts` | Classify unclassified signals. |
| `apps/worker/jobs/drift-detector.ts` | Detect narrative drift between snapshots. |
| `apps/worker/jobs/alert-generator.ts` | Scan signals against watchlists → alerts. |

## Governance / publication reuse

The HSIN deliberately does **not** re-implement review or publication. A signal-spawned
research run is a first-class Phase-3 run; it flows through the Phase-6 governance loop
(`review_queues` → `review_decisions` → `publication_records`). Escalated alerts and
signals additionally enqueue a `review_queues` row with `entity_type='signal'` so they
surface in the existing curation worklist.
