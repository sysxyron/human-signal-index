# WorldForge Phase 4 — Evidence & Citation Engine

The Evidence & Citation Engine replaces the Phase 3 **placeholder** citations
(`research_citations`) with **real, retrievable evidence**. It takes the
`Claim[]` a research run produced, searches for sources backing each claim,
classifies how each source relates to the claim, and computes an aggregate
coverage score that feeds the run's consensus/confidence surface.

It is **deterministic without API keys** (curated fixtures, the default) and only
touches the network when explicitly configured (`EVIDENCE_MODE=live` plus the
relevant key/email). The pure engine package (`@hsi/evidence-engine`) reads **no**
environment and has **zero** required runtime dependencies; the host app
(`apps/web`) resolves config from `process.env` and passes it in.

---

## 1. Provider abstraction

Every source backend implements the same `EvidenceProvider` contract:

```ts
interface EvidenceProvider {
  name: string;                 // appears in coverage.bySource
  enabled(): boolean;           // self-gates on its key/email
  search(q: EvidenceQuery): Promise<EvidenceResult[]>;   // never throws
  lookupById(id: string): Promise<EvidenceResult | null>;
}
```

A provider that is not configured returns `enabled() === false` and is skipped.
A provider that fails at runtime returns `[]` (it never throws), so one flaky
backend cannot break a run. The assembled `EvidenceEngine.search()` fans out
across all **enabled** providers, then merges and de-dupes the union (first
occurrence wins; providers are ordered best-first, so fixtures / peer-reviewed
sources take precedence).

### The 6 live providers (live mode)

| Provider          | Backend / endpoint                                   | Gate                       |
| ----------------- | ---------------------------------------------------- | -------------------------- |
| arXiv             | `export.arxiv.org/api/query` (Atom)                  | always on in live mode     |
| Crossref          | `api.crossref.org/works` (polite pool via mailto)    | `CROSSREF_MAILTO`          |
| PubMed            | NCBI E-utilities `esearch` + `efetch`                | `PUBMED_EMAIL`             |
| Semantic Scholar  | `api.semanticscholar.org/graph/v1`                   | `SEMANTIC_SCHOLAR_API_KEY` |
| DOI               | `doi.org` content negotiation (resolve a known DOI)  | always on in live mode     |
| Web fallback      | host-provided `webFetcher` (otherwise disabled)      | host `webFetcher` present  |

### The fixture provider (fixture mode)

In `fixture` mode the engine uses **only** the `FixtureProvider` — no network is
touched at all. It serves a curated, deterministic set of real bibliographic
sources (the Chronid demo set), so a run produces stable, reviewable evidence
with zero configuration. This is the default and what runs in CI / empty-env
`next build`.

---

## 2. The EvidenceResult / coverage model

```ts
EvidenceResult {
  id; title; authors[]; year?; abstract?;
  sourceName;                        // provider name
  url?; doi?; arxivId?; pubmedId?; semanticScholarId?;
  publicationType: 'peer-reviewed'|'preprint'|'review'|'encyclopedia'|'web'|'dataset'|'unknown';
  retrievedAt;                       // ISO; deterministic in fixtures
  reliabilityScore;                  // 0..1, publication-type driven
  relevanceScore;                    // 0..1, lexical match to the claim
  supportType: 'supports'|'contradicts'|'background'|'unclear';
  confidence;                        // 0..1, combined
  isFixture?; raw?;
}
```

Per claim, the matcher produces a `ClaimEvidence`:

```ts
ClaimEvidence {
  claimId; results[];                // ranked best-first
  bestSupport;                       // strongest relationship found
  coverage: 'supported'|'contradicted'|'background'|'unsupported';
  topRelevance;
}
```

And across all claims, an `EvidenceCoverage`:

```ts
EvidenceCoverage {
  totalClaims; supported; contradicted; background; unsupported;
  coverageScore;                     // 0..100 = (supported+contradicted)/total
  bySource: Record<string, number>;  // result count per provider
  mode: 'fixture'|'live'|'mixed';
}
```

---

## 3. Claim-to-citation matching

1. **Query derivation** — `claimToQuery(claim, cfg)` turns a `Claim.text` (plus
   any topic hints) into an `EvidenceQuery` with the configured `minRelevance`.
2. **Search** — the engine fans out across enabled providers and de-dupes.
3. **Relevance** — `relevanceScore` is a deterministic lexical overlap between
   the claim's tokens/topics and the source's title/abstract; candidates below
   `minRelevance` (default **0.65**) are dropped.
4. **Stance** — `supportType` is derived from the source's stance relative to the
   claim (affirming / opposing / contextual / indeterminate).
5. **Verdict** — the claim's `coverage` is the best relationship across its
   results (`supported` > `contradicted` > `background`, else `unsupported`).

---

## 4. Scoring & reliability tiers

`reliabilityScore` (0..1) is driven by `publicationType`:

| Tier          | Publication types                          |
| ------------- | ------------------------------------------ |
| `high`        | peer-reviewed, review                      |
| `medium`      | preprint, encyclopedia, dataset            |
| `low`         | web                                        |
| `unsupported` | no citation present                        |
| `invalid`     | malformed citation (no title / bad DOI)    |

`confidence` combines reliability and relevance into a single 0..1 figure for the
classified support relationship.

---

## 5. Honesty rules

The engine and the persistence layer are deliberately **honest**:

- The **real** `supportType` is always persisted — including `contradicts`. A
  source that argues *against* a claim is recorded as `contradicts`, never hidden.
- **Unsupported claims get NO link.** If gathering produced no qualifying results
  for a claim, the engine creates zero links for it. We never invent a citation or
  fabricate support to inflate coverage.
- `coverageScore` counts only `supported + contradicted` claims (claims with
  *real* evidence), so an unsupported claim genuinely lowers the score.
- Fixture-sourced rows are flagged `is_fixture = true` and `mode` reflects
  `fixture` / `live` / `mixed`, so a reader always knows the provenance.

---

## 6. How coverage feeds consensus confidence

A run's aggregate coverage is written back onto the run:

- `research_runs.evidence_coverage` (jsonb) — the full `EvidenceCoverageSummary`.
- `research_runs.evidence_status` — `none | fixture | live | mixed`.

The consensus/run UI reads these to qualify the Phase 3 consensus confidence: a
high agreement score backed by a **low** evidence `coverageScore` (or many
`contradicts`) is surfaced as weakly-supported, while a high coverageScore with
peer-reviewed sources reinforces it. Coverage does not silently overwrite the
consensus number; it sits alongside it as a second, evidence-grounded axis.

---

## 7. Data flow

```
research run created
        │
        ▼
research_agent_outputs.output.claims   (flatten all domain-agent claims;
        │                               skip the synthetic 'consensus' row)
        ▼
gatherEvidence(claims, engine, now)    (fixture or live providers)
        │
        ├──► EvidenceResult[]  ──upsert──►  evidence_sources   (shared library,
        │                                                       deduped by doi/arxiv)
        │
        ├──► ClaimEvidence[]   ──insert──►  claim_evidence_links
        │                                   (claim_id → evidence_source_id,
        │                                    support_type, relevance, confidence)
        │
        └──► EvidenceCoverage  ──update──►  research_runs.evidence_coverage
                                            research_runs.evidence_status
        │
        ▼
   UI: run /evidence + /provenance surfaces, consensus confidence qualifier
```

---

## 8. The 3 tables (migration `0008_evidence_engine.sql`)

- **`evidence_sources`** — a SHARED, de-duplicated citation library. One row per
  real source. Deduped by a normalized DOI or arXiv id (UNIQUE partial indexes).
  World-readable (citations are public references); any authenticated user may
  insert (the engine persists sources during a run); only curators may
  update/delete.

- **`claim_evidence_links`** — per-run links between a claim and an evidence
  source, carrying `support_type`, `relevance_score`, `confidence`, `rationale`.
  Owned via the parent run (`research_runs.created_by`); curators read+write;
  viewer/anon read when the parent run is public (`research_run_is_public`).

- **`evidence_reviews`** — human review verdicts on a source
  (`pending → validated / rejected / needs_more`). Curators have full CRUD; a
  reviewer always reads their own rows; authenticated users may read verdicts.

Plus two ADD-ONLY columns on `research_runs`: `evidence_coverage` (jsonb) and
`evidence_status` (text, default `'none'`). Existing `research_runs` RLS is
untouched.

---

## 9. Code map

| Concern                | File                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| Pure engine            | `packages/evidence-engine/src/*`                                  |
| Schema                 | `supabase/migrations/0008_evidence_engine.sql`                    |
| Record types           | `packages/shared-types/src/index.ts` (Evidence Phase 4 section)   |
| Server DAL             | `apps/web/lib/worldforge/evidence-persistence.ts`                 |
| Server actions         | `apps/web/app/dashboard/worldforge/research/evidence-actions.ts`  |
| Run auto-integration   | `apps/web/app/dashboard/worldforge/research/actions.ts`           |
