# Narrative Communities & Shared Intelligence (HSI Phase 9)

Phase 9 derives **shared intelligence** over the narrative graph: cross-source
clustering, community detection, narrative amplification, source-to-source
overlap, and per-source reliability. These are computed from PUBLIC captured
signals and persisted into `hsin_`-prefixed tables for the dashboard and review
pipeline. Nothing here auto-acts — it informs human judgment.

- Engine: [`@hsi/source-intelligence`](../../packages/source-intelligence/src)
  — `graph/community.ts`, `graph/amplification.ts`, `graph/crossSource.ts`,
  `reliability.ts`, on top of the Phase-8 narrative/entity graph.
- Schema: migration `0013` — `hsin_graph_communities`,
  `hsin_amplification_scores`, `hsin_source_reliability`.

---

## The intelligence layers

```
   captured signals (hsin_signals)  +  narrative/entity graph (Phase 8)
                 │
     ┌───────────┼───────────────┬───────────────────┬─────────────────┐
     ▼           ▼               ▼                   ▼                 ▼
 cross-source  community     amplification       source overlap    source
 clustering    detection      scoring            (src↔src edges)   reliability
     │           │               │                   │                 │
     ▼           ▼               ▼                   ▼                 ▼
 (clusters)  hsin_graph_   hsin_amplification_   (overlap edges)  hsin_source_
             communities     scores                                reliability
```

## Cross-source clustering

Signals that express the same narrative across **different sources** are grouped
into clusters using the semantic similarity from the Phase-8 narrative clusterer
(local embeddings by default, lexical fallback). A cluster spanning many
independent sources is a stronger signal than one echoing within a single source.

## Community detection

Over the narrative graph (narratives as nodes, shared entities/co-occurrence as
edges), a **label-propagation** style algorithm partitions narratives into
**communities** — tightly-linked thematic clusters. Each detected community is
persisted to `hsin_graph_communities`: `{ label, algorithm, member_narrative_ids,
size, metrics_json, computed_at }`. Rows are **replaced on each run** (the latest
partition is authoritative).

## Amplification scoring

For each narrative we compute a `0..100` **amplification** profile measuring how
broadly/rapidly it is being amplified: distinct source count, signal count, and
**velocity** (rate of new signals over time). Persisted to
`hsin_amplification_scores` (`unique(narrative_id)` — one live profile per
narrative) with a `rationale` explaining the score. High amplification + high
cross-source spread is a prioritization cue for reviewers.

## Source-to-source overlap

By comparing which narratives/entities sources share, we derive **source↔source
overlap**: sources that consistently carry the same narratives. Overlap helps
distinguish *independent corroboration* (different, unrelated sources) from *echo*
(a cluster of mutually-overlapping sources amplifying each other), which feeds
both amplification interpretation and reliability.

## Source reliability

Each source gets a derived `0..100` **reliability** profile +
coarse **tier** (`high`/`medium`/`low`/`unproven`), blending capture success
rate, **block rate**, downstream approval rate, contradiction rate, and signal
volume. Persisted to `hsin_source_reliability` (`unique(source_id)`) with a
`rationale`. Reliability weights how much attention a source's signals warrant —
it never silences a source automatically.

## How they're surfaced

These tables are **shared-intelligence** (access shape B in migration `0013`):
any authenticated user reads; researcher+ writes; the worker writes via the
service-role key (bypassing RLS). The dashboard renders communities, amplified
narratives, and source tiers; the triage/SLA pipeline can prioritize by them. All
remain **inputs to human review** — DRAFT intelligence, never auto-published.

## Offline-safety & determinism

All computation is pure and deterministic given its inputs; embeddings default to
the **network-free local embedder** (`HSIN_LOCAL_EMBEDDINGS=true`). With no
service-role env the recompute jobs operate on injected data / no-op and never
write — so the layer is fully offline-safe and never throws.
