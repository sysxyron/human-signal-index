# Narrative & Entity Graph (HSI Phase 8)

The **narrative graph** is a shared intelligence layer over PUBLIC signals. It
clusters captured signals into candidate **narratives**, extracts the
**entities** they mention, and connects narratives with explainable **edges**.
It is RESEARCH tooling over PUBLIC information — never a dossier on a private
person, and never an auto-published claim. Every edge and link carries a
`rationale` (explainability is binding).

- Engine: [`@hsi/source-intelligence`](../../packages/source-intelligence)
  Phase-8 modules: `semantic/` (classifier + clusterer), `graph/`
  (`buildNarrativeGraph`, `signalToNarrativeLinks`, `extractEntities`,
  `buildNarrativeEdges`).
- Schema: migration `0012` — `hsin_entities`, `hsin_signal_entities`,
  `hsin_narratives`, `hsin_signal_narratives`, `hsin_narrative_edges`.

---

## Graph model

```
        ┌───────────────┐  hsin_signal_entities   ┌───────────────┐
        │   hsin_signals │◄───────(confidence)────►│  hsin_entities │
        │  (Phase 7)     │                          │ person/org/    │
        └──────┬─────────┘                          │ movement/...   │
               │ hsin_signal_narratives             └───────────────┘
               │  (confidence + rationale)
               ▼
        ┌────────────────────────────┐
        │       hsin_narratives        │  candidate narrative nodes
        │   name / category / risk     │  (one per cluster)
        └───────────┬─────────────────┘
                    │  hsin_narrative_edges (directed, weighted, explainable)
                    ▼
   related_to ──► amplifies ──► evolves_into ──► derived_from ──► contradicts ──► co_occurs_with
```

### Entities

`extractEntities(text)` returns `ExtractedEntity { name, entityType, confidence,
evidenceText }`. Types: `person | organization | movement | ideology | topic |
place | platform | publication | unknown`. `unknown` preserves doubt — the
engine surfaces proper-noun candidates **for human review** and never asserts a
type it cannot justify. Entities are de-duped by `(name, entity_type)` in
`hsin_entities`; the signal↔entity link (`hsin_signal_entities`) carries the
extraction confidence and the evidencing snippet.

### Narratives

A **narrative node** (`NarrativeNode { id, name, description, category,
riskLevel, signalIds }`) is one cluster of related signals. `riskLevel` is a
**heuristic triage aid** (category weight + max source risk + signal volume),
**not a verdict**. Persisted to `hsin_narratives`; the signal↔narrative link
(`hsin_signal_narratives`) carries `confidence` + `rationale`.

### Edges (6 types)

`buildNarrativeEdges` produces directed, weighted, explainable
`NarrativeEdge { sourceNarrativeId, targetNarrativeId, edgeType, weight,
rationale }`:

| edgeType | Meaning |
| --- | --- |
| `related_to` | Lexically/semantically similar narratives. |
| `contradicts` | Opposed framings of the same topic. |
| `amplifies` | One narrative reinforces another. |
| `evolves_into` | A narrative shifts over time into another. |
| `derived_from` | One narrative descends from another. |
| `co_occurs_with` | Narratives that repeatedly appear together. |

Persisted to `hsin_narrative_edges`, unique per `(source, target, edge_type)`.

---

## Semantic clustering + embedding fallback

`buildNarrativeGraph(signals, deps)` pipeline:

```
signals ──► clusterNarratives ──► NarrativeNodes ──► extractEntities (aggregated)
                  │                                          │
                  ▼                                          ▼
            buildNarrativeEdges  ◄──────────────────────────┘
                  │
                  ▼
            NarrativeGraph { nodes, edges, entities }
```

Clustering and edge-building are **embedding-optional**:

- **`deps.embed` provided** → cosine similarity over embeddings ranks
  cluster membership and edge strength (`CLUSTER_COSINE_THRESHOLD`,
  `RELATED_COSINE_THRESHOLD`).
- **No `deps.embed` (or it throws)** → graceful **lexical fallback** using
  token-set Jaccard / shingles (`CLUSTER_SIMILARITY_THRESHOLD`,
  `RELATED_LEXICAL_THRESHOLD`). The graph still builds, fully offline and
  deterministic. `buildNarrativeGraph` **never throws**.

The same injected `embed` fn is shared with the evidence engine and the semantic
classifier (`classifySignalSemantic`), so a host wires one embedder for all.

---

## How the graph is built & persisted

1. A worker (or the app) loads recent `GraphSignal[]` (id, title, bodyText,
   category, capturedAt, optional source riskLevel).
2. `buildNarrativeGraph` returns `{ nodes, edges, entities }`;
   `signalToNarrativeLinks` maps each signal to its node with a confidence +
   rationale.
3. The persister (service-role) upserts:
   - `hsin_entities` (by `name,entity_type`), then `hsin_signal_entities`.
   - `hsin_narratives` (one per node), then `hsin_signal_narratives`.
   - `hsin_narrative_edges` (by `source,target,edge_type`).
4. The UI reads the graph through the per-request RLS client — any authenticated
   user can READ the shared graph; researcher+ can INSERT/UPDATE; admin all.

The pure engine is deterministic and offline-safe; the worker injects `now`,
the signal batch, and (optionally) the embedder. Nothing here auto-publishes —
the graph is a **draft research view** for human analysts.
