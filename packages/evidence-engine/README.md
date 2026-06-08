# @hsi/evidence-engine

**WorldForge Phase 4 + Phase 5 (hardened) — Evidence & Citation Engine.**

Replaces the placeholder research citations produced in Phase 3 with **real,
retrievable evidence sources** for the atomic `Claim`s an agent emits. It is
**deterministic without any API keys** via a curated fixture set, and only
touches the network when explicitly put into `live` mode with the right
key/email. **Zero required runtime dependencies** — real providers use the
global `fetch` and are never called at import time.

**Phase 5 hardening** adds: a hardened HTTP layer (timeout + retry/backoff +
graceful typed failure), provider **health tracking**, a pluggable retrieval
**cache** (interface + in-memory impl + key hashing), **embedding relevance**
ranking (OpenAI or an injected `embed` fn, with a lexical fallback), and a
support/contradiction **NLI** classifier (heuristic or LLM, uncertainty
preserved). All new live/OpenAI paths are gated by config + injected deps,
never at import time, and degrade gracefully (the run never throws). No
`Date.now()` / `Math.random()` in pure code — a `clock` / `now` / jitter seed is
injected for determinism.

---

## Quick start (fixture mode — default, deterministic, no keys)

```ts
import { createEvidenceEngine, gatherEvidence } from '@hsi/evidence-engine';
import type { Claim } from '@hsi/research-agents';

const engine = createEvidenceEngine(); // mode defaults to 'fixture'

const claims: Claim[] = [/* ...agent claims... */];
const { matches, sources, coverage } = await gatherEvidence(
  claims,
  engine,
  '2024-01-01T00:00:00.000Z', // pass a fixed `now` for determinism
);

console.log(coverage.coverageScore); // 0..100
```

`matches` is one `ClaimEvidence` per claim (ranked `results`, `bestSupport`,
`coverage`, `topRelevance`). `sources` is the de-duplicated union of all
evidence. `coverage` is the aggregate `EvidenceCoverage`.

---

## Modes

- **`fixture`** (default): uses ONLY the bundled `FixtureProvider`. Fully
  deterministic, offline, no keys. Every result has `isFixture: true`.
- **`live`**: fans out across real public APIs. Each provider self-gates via
  `enabled()` — it stays off until its key/email is supplied, and returns `[]`
  (never throws, never fabricates) when disabled or on any network error.

```ts
const engine = createEvidenceEngine({
  mode: 'live',
  minRelevance: 0.12,
  semanticScholarApiKey: '...',  // enables Semantic Scholar
  pubmedEmail: 'you@example.com', // enables PubMed (NCBI etiquette)
  crossrefMailto: 'you@example.com', // enables Crossref polite pool
});
```

> The pure package **never reads `process.env`** — the host app resolves keys
> and passes them in.

---

## Providers

| Provider          | Endpoint                                                    | Enabled when                       |
| ----------------- | ----------------------------------------------------------- | ---------------------------------- |
| arXiv             | `export.arxiv.org/api/query` (Atom)                         | live mode                          |
| Crossref          | `api.crossref.org/works` (REST)                             | live mode + `crossrefMailto`       |
| PubMed            | `eutils.ncbi.nlm.nih.gov/.../esearch` + `efetch`            | live mode + `pubmedEmail`          |
| Semantic Scholar  | `api.semanticscholar.org/graph/v1/paper`                    | live mode + `semanticScholarApiKey`|
| DOI               | `doi.org/<doi>` content negotiation (lookup only)           | live mode                          |
| Web fallback      | host-provided `WebFetcher` (low reliability `web`)          | live mode + injected fetcher       |
| Fixture           | bundled `CHRONID_FIXTURES`                                  | always (fixture mode)              |

All network calls go through the hardened HTTP layer (`providers/http.ts`):
timeout (AbortController, default 8000ms), retry with exponential backoff +
deterministic jitter (default 2 retries, 300ms base; jitter seeded, **not**
`Math.random`), and a typed `{ ok:false, error }` result — they **never throw**
and **never fabricate** (always `[]` / `null` on failure). Every call records
into the provider-health tracker.

---

## Hardened architecture (Phase 5)

The `gatherEvidence` pipeline, per claim, is now:

1. **Retrieve** — `engine.search(query)`:
   cache lookup → on miss fan out across enabled providers (each self-gated,
   hardened HTTP, health-recorded) → de-dupe → store in cache. Cache
   misses/failures degrade to a direct provider search.
2. **Rank** — the **relevance engine** ranks candidates (`relevanceScore` set,
   sorted desc). Lexical (Jaccard, deterministic, default) or embedding (cosine
   over OpenAI / injected embeddings, lexical fallback).
3. **Classify** — the **support classifier** classifies each ranked result above
   `minRelevance` (`supports`/`contradicts`/`background`/`unclear` + confidence +
   `rationale`). Heuristic (deterministic) or LLM (OpenAI, heuristic fallback).
4. **Assemble** — a `ClaimEvidence` (same shape as Phase 4; results now also
   carry an optional `rationale`). Sub-`minRelevance` matches are dropped (no
   fabrication).

Every step is wrapped so a failure yields a graceful unsupported result — the
run **never throws and never fails**, and stays **deterministic in fixture mode**
(pass a fixed `now`).

### Components

| Module                         | What it provides                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `providers/http.ts`            | `fetchJson` / `fetchText` — timeout, retry/backoff, typed graceful failure       |
| `providerHealth.ts`            | `ProviderHealthTracker`, `getProviderHealth()` — HEALTHY / DEGRADED / OFFLINE    |
| `cache/`                       | `CacheStore` interface, `InMemoryCacheStore`, `cacheKey` / `hashQuery` (FNV-1a)  |
| `relevance/`                   | `createRelevanceEngine`, lexical + embedding rankers                             |
| `nli/`                         | `createSupportClassifier`, heuristic + LLM classifiers                           |

> The **Supabase-backed cache** lives in the *app* (it needs supabase). The
> engine only defines the `CacheStore` interface + the in-memory impl + the key
> hashing, and accepts any `CacheStore` via `createEvidenceEngine` options.

### Provider health

`engine.health()` (or the module-level `getProviderHealth()`) returns a
`ProviderHealth[]` snapshot: `enabled`, `available`, `lastSuccess`/`lastFailure`,
`latencyMs`, `errorCount`, `successCount`, and a derived `status`:

- **OFFLINE** — disabled, or failing with no successes.
- **DEGRADED** — some failures but also some successes.
- **HEALTHY** — enabled with no outstanding failures.

### Embeddings & LLM (gated, optional)

Set `openaiApiKey` to enable the embedding ranker
(`text-embedding-3-small`) and the LLM classifier (`gpt-4o-mini`). Or inject an
`embed(texts) => number[][]` function (e.g. a local embedder). With neither,
both transparently fall back to the deterministic lexical / heuristic paths.

```ts
const engine = createEvidenceEngine(
  { mode: 'live', openaiApiKey: '...', relevanceMode: 'auto', cacheTtlSeconds: 86400, crossrefMailto: 'you@x.co' },
  { cacheStore: new InMemoryCacheStore(), healthTracker, embed, fetchImpl, clock, jitterSeed: 1 },
);
```

---

## Honesty rules (non-negotiable)

The engine is built to **not over-claim**:

1. A claim with **no result above `minRelevance`** is `unsupported` — we never
   fabricate evidence to fill a gap.
2. **Speculative / fictional / violates-known-physics** claims are **never
   upgraded to `supports`** on weak (lexical-only) evidence. The strongest such
   a match can reach without an *explicit* curated fixture stance is
   `background`. This guardrail holds for **both** the heuristic **and** the LLM
   classifier (a live model cannot override the cap on an ungrounded claim).
5. The classifier **preserves uncertainty**: when a source neither clearly
   affirms nor contradicts a claim it returns `unclear` (low confidence) or
   `background` — it does **not** force a class.
3. Reliability is driven by **publication type**; a citation with no durable
   identifier (DOI/arXiv/PMID/S2/URL) is `unsupported`, and a malformed one
   (no title, bad DOI) is `invalid`.
4. Coverage counts only claims with an **affirming or contradicting** source.

---

## Fixture topics covered

The curated `CHRONID_FIXTURES` (all `isFixture: true`, real references) cover:

- planetary orbital periods
- subjective time perception
- chronobiology
- extremophiles
- metabolism and lifespan
- stellar habitability
- evolutionary adaptation
- intelligence and civilization
- environmental pressure and adaptation

Each fixture carries `raw.topics` (drives matching) and `raw.stance`
(`supports` | `contradicts` | `background`, drives deterministic support
typing). Where a genuine DOI is known it is used; otherwise a textbook /
encyclopedia entry with **no DOI** is used rather than inventing one.

---

## Public API by module

- **`index.ts`** — `createEvidenceEngine(cfg?, options?)`, `EvidenceEngine`,
  `gatherEvidence(claims, engine, now)`; re-exports everything below.
- **`types.ts`** — `SupportType`, `PublicationType`, `ReliabilityTier`,
  `EvidenceQuery`, `EvidenceResult`, `EvidenceProvider`, `ClaimEvidence`,
  `EvidenceCoverage`, `EvidenceMode`, `EvidenceEngineConfig`.
- **`normalize.ts`** — `normalizeResult`, `validateCitation`, `dedupeResults`,
  `normalizeDoi`, `normalizeArxivId`, `DOI_REGEX`, `DEFAULT_NOW`.
- **`score.ts`** — `reliabilityFromPublicationType`, `reliabilityTier`,
  `relevanceScore`, `supportTypeFor`, `confidenceFor`.
- **`claimMatcher.ts`** — `matchClaim`, `matchClaims`, `computeCoverage`,
  `claimToQuery`, `resolveConfig`.
- **`providers/`** — `createProviders(cfg, now?, webFetcher?, deps?)`, per-provider
  factories, plus the hardened HTTP layer: `fetchJson`, `fetchText`,
  `httpOptionsFor`, types `FetchImpl`, `MillisClock`, `HttpResult`, `HttpOptions`,
  `ProviderDeps`.
- **`providerHealth.ts`** — `ProviderHealthTracker`, `getProviderHealth()`,
  `defaultProviderHealthTracker`, `HEALTH_WINDOW`, types `ProviderHealth`,
  `ProviderStatus`.
- **`cache/`** — `InMemoryCacheStore`, `cacheKey(provider, query)`,
  `hashQuery(s)`, types `CacheStore`, `CachedEntry`.
- **`relevance/`** — `createRelevanceEngine(cfg, deps?)`, `createLexicalRanker()`,
  `createEmbeddingRanker(cfg, deps?)`, `rankLexical(text, results)`, types
  `RelevanceEngine`, `RelevanceDeps`, `EmbeddingRankerDeps`, `EmbedFn`.
- **`nli/`** — `createSupportClassifier(cfg, deps?)`, `createHeuristicClassifier()`,
  `createLlmClassifier(cfg, deps?)`, `classifyHeuristic(claim, result, relevance)`,
  types `SupportClassifier`, `SupportClassification`, `SupportClassifierDeps`,
  `LlmClassifierDeps`.
- **`fixtures/chronid-sources.ts`** — `CHRONID_FIXTURES`, `FixtureProvider`,
  `createFixtureProvider`.

---

## Tests

`tests/evidence-engine.test.ts` (Phase 4) and `tests/hardening.test.ts`
(Phase 5) use `node:test` + `node:assert` (no test framework dependency). They
cover fixture retrieval + ranking, the speculative-claim honesty rule, the
unsupported (no-evidence) case, reliability tiers, malformed citation detection,
coverage math, determinism, **provider failure** (rejecting fetch → `[]`, run
completes, health not HEALTHY, retries/backoff via injected sleep), the
**cache** (hit/miss + TTL expiry via injected clock, engine cache reuse),
**embedding ranking** (injected `embed` ranks most-similar first; lexical
fallback without a key), and **NLI classification**
(supports/contradicts/background/unclear, uncertainty preserved,
speculative-not-forced-to-supports).

Run (tsx):

```
node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test \
  packages/evidence-engine/tests/evidence-engine.test.ts \
  packages/evidence-engine/tests/hardening.test.ts
```

---

*The fixture data is **demo evidence**. In production, run the engine in `live`
mode with real provider credentials.*
