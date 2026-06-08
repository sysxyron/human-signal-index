# Evidence Hardening (WorldForge Phase 5)

Phase 5 hardens the Phase 4 Evidence & Citation Engine for **live retrieval**: it
adds timeouts/retries/backoff and graceful degradation to every provider,
per-provider **health tracking**, a two-tier **retrieval cache**, **embedding-based
relevance**, an **NLI support classifier**, and **evidence-weighted consensus**.

Phase 4 is not removed: fixture mode is still the default and still deterministic.
Everything here is additive and degrades to the Phase 4 behavior when keys are absent.

## Hardened retrieval

Each provider (arXiv / Crossref / PubMed / Semantic Scholar / DOI / web fallback)
runs over a hardened HTTP layer:

- **Timeout** — every request is bounded (`timeoutMs`, default per provider deps).
- **Retry + backoff** — failed attempts retry with exponential backoff plus
  deterministic jitter (`jitterSeed`, no `Math.random`).
- **Graceful** — a provider that is disabled or fails returns `[]`, never throws.
  `engine.search()` runs providers with `Promise.all(... .catch(() => []))` and
  merges + de-dupes the union, so one failing backend never sinks a query.

All time and randomness are **injected** (the pure engine never calls `Date.now()`
or `Math.random()`), so runs are reproducible.

## Provider health

`ProviderHealthTracker` records `recordSuccess(name, latencyMs, now)` /
`recordFailure(name, now, error)` per provider and derives a status:

| Status   | Meaning                                                        |
|----------|---------------------------------------------------------------|
| HEALTHY  | enabled, no recent failures.                                  |
| DEGRADED | enabled, some failures but also some successes.               |
| OFFLINE  | disabled, or failing with zero successes in the window.       |

A success *heals* the rolling window (decrements the error tally), so a recovered
provider returns to HEALTHY over time. `snapshot()` returns `ProviderHealth[]`.

The DAL persists the snapshot into **`provider_health`** (migration 0009) after each
run via `persistProviderHealth(...)`; `getProviderHealth()` reads it back. The
nightly worker refresh also updates it.

## Caching

Two layers, both honoring a TTL (`EVIDENCE_CACHE_TTL`, default 86400s / 24h):

1. **In-memory** (`InMemoryCacheStore`) — per-process, fast, optional.
2. **Supabase** (`createSupabaseCacheStore(client, now)`) — durable, cross-request,
   backed by the **`evidence_cache`** table.

Keys are deterministic: `cacheKey(provider, query)` → `${provider}:${hashQuery(...)}`
using FNV-1a (case/space-normalized). The engine checks the cache before calling
providers and stores the merged union after a miss. Any cache error degrades to a
direct provider search — the cache is a pure optimization and **never throws**.

The Supabase store splits the key into `evidence_cache.provider` (namespace, the
engine mode) and `evidence_cache.query_hash` (the full key, unique per provider).
Reads filter `expires_at > now`.

## Embedding relevance

Relevance ranking (`RelevanceMode`):

- **lexical** — deterministic Jaccard ranker (default; no keys).
- **embedding** — cosine over embeddings (OpenAI via `OPENAI_API_KEY`, or an
  injected `embed` fn), with a lexical fallback when neither is available.
- **auto** — embedding when a key/embed fn is present, else lexical.

Embedding ranking is gated on the key and falls back gracefully, so empty-env
builds and fixture runs stay deterministic.

## NLI support classifier

After relevance ranking, each candidate is classified `supports` / `contradicts` /
`background` / `unclear` against the claim:

- **heuristic** classifier (default; deterministic, no keys), or
- **LLM** classifier when `OPENAI_API_KEY` is configured (graceful fallback to the
  heuristic on any error).

The classification drives the per-claim `coverage` verdict and feeds the
coverage + weighted-consensus math.

## Full evidence flow

```
claim
  │
  ▼
cacheKey(mode, claim.text) ── hit ──▶ cached EvidenceResult[]
  │ miss
  ▼
providers (arXiv / Crossref / PubMed / S2 / DOI / web)   ── health: success/failure
  │   timeout · retry · backoff · graceful []
  ▼
merge + de-dupe  ─────────────▶ store in cache (TTL)
  │
  ▼
relevance ranking (lexical → embedding/OpenAI)
  │
  ▼
NLI support classifier (heuristic → LLM)  ⇒ supports/contradicts/background/unclear
  │
  ▼
per-claim coverage  ⇒  EvidenceCoverage (totals, coverageScore, bySource, mode)
  │
  ▼
evidenceWeightedConsensus(researchConfidence, coverage) + computeClaimReliabilities(...)
  │
  ▼
persistence:
   evidence_sources (upsert, de-duped by doi/arxiv)
   claim_evidence_links (per match; NO link for unsupported — honesty)
   research_runs.evidence_coverage (+ Phase 5 block) / evidence_weighted_confidence
                / support_ratio / contradiction_ratio / unsupported_ratio
   provider_health (upsert per provider)
  │
  ▼
UI (run evidence panel · provider health · review queue · claim↔evidence graph)
```

## 0009 tables

| Table             | Purpose                                                            |
|-------------------|--------------------------------------------------------------------|
| `provider_health` | one row per provider; HEALTHY/DEGRADED/OFFLINE + counts/latency.   |
| `evidence_cache`  | durable retrieval cache keyed by `(provider, query_hash)` + TTL.   |

Plus four ADD-ONLY columns on `research_runs`:
`evidence_weighted_confidence`, `support_ratio`, `contradiction_ratio`,
`unsupported_ratio`.

**RLS:** `provider_health` is world-readable, curator-write. `evidence_cache` is
authenticated read + insert/update (the app cache store writes under the user
session), curator delete. The worker uses the service role (bypasses RLS) for
batch upserts.

See `docs/architecture/evidence-weighted-consensus.md` for the scoring formulas
and `docs/operations/evidence-review-workflow.md` for the reviewer SOP.
