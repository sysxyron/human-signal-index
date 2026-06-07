# @hsi/evidence-engine

**WorldForge Phase 4 — Evidence & Citation Engine.**

Replaces the placeholder research citations produced in Phase 3 with **real,
retrievable evidence sources** for the atomic `Claim`s an agent emits. It is
**deterministic without any API keys** via a curated fixture set, and only
touches the network when explicitly put into `live` mode with the right
key/email. **Zero required runtime dependencies** — real providers use the
global `fetch` and are never called at import time.

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

All network calls are wrapped in `try/catch` returning `[]` / `null`.

---

## Honesty rules (non-negotiable)

The engine is built to **not over-claim**:

1. A claim with **no result above `minRelevance`** is `unsupported` — we never
   fabricate evidence to fill a gap.
2. **Speculative / fictional / violates-known-physics** claims are **never
   upgraded to `supports`** on weak (lexical-only) evidence. The strongest such
   a match can reach without an *explicit* curated fixture stance is
   `background`.
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
- **`providers/`** — `createProviders`, plus per-provider factories.
- **`fixtures/chronid-sources.ts`** — `CHRONID_FIXTURES`, `FixtureProvider`,
  `createFixtureProvider`.

---

## Tests

`tests/evidence-engine.test.ts` uses `node:test` + `node:assert` (no test
framework dependency). It covers fixture retrieval, the speculative-claim
honesty rule, the unsupported (no-evidence) case, reliability tiers, malformed
citation detection, coverage math, and determinism.

---

*The fixture data is **demo evidence**. In production, run the engine in `live`
mode with real provider credentials.*
