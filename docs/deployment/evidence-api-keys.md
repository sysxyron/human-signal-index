# Deployment — Evidence Engine API Keys & Modes

The Phase 4 Evidence & Citation Engine runs in one of two modes, selected by
`EVIDENCE_MODE`. The pure engine package reads **no** environment; `apps/web`
resolves these vars (server-side, in `lib/worldforge/evidence-persistence.ts`)
and passes the config to `createEvidenceEngine`.

---

## 1. Fixture mode (default)

```env
EVIDENCE_MODE=fixture
EVIDENCE_MIN_RELEVANCE=0.65
# keys left blank
```

- **Deterministic, network-free.** Uses only the curated `FixtureProvider`.
- No API keys required. This is what runs in CI and in an empty-env `next build`.
- A run still produces real, reviewable, stable evidence (the Chronid demo set)
  with `evidence_status = 'fixture'`.

Use fixture mode for local development, demos, tests, and any environment where
you do not want outbound network calls.

---

## 2. Live mode

```env
EVIDENCE_MODE=live
EVIDENCE_MIN_RELEVANCE=0.65
SEMANTIC_SCHOLAR_API_KEY=...      # optional; enables Semantic Scholar
PUBMED_EMAIL=you@example.org      # optional; enables PubMed (NCBI etiquette)
CROSSREF_MAILTO=you@example.org   # optional; enables Crossref polite pool
```

- Fans out across the real public providers. **Each provider self-gates** on its
  own key/email: if a var is blank, that provider stays disabled and is skipped —
  it never errors. So live mode works with *some* or *all* of the keys set.
- arXiv and DOI resolution need no key and are always active in live mode.
- A run's `evidence_status` becomes `live` (or `mixed` if fixtures also matched).

---

## 3. Environment variables

| Variable                   | Default   | Purpose                                                        |
| -------------------------- | --------- | -------------------------------------------------------------- |
| `EVIDENCE_MODE`            | `fixture` | `fixture` (no network) or `live` (real APIs).                  |
| `EVIDENCE_MIN_RELEVANCE`   | `0.65`    | Minimum lexical relevance [0..1] a source must clear to match. |
| `SEMANTIC_SCHOLAR_API_KEY` | _(blank)_ | Enables the Semantic Scholar provider in live mode.            |
| `PUBMED_EMAIL`             | _(blank)_ | Contact email required by NCBI E-utilities; enables PubMed.    |
| `CROSSREF_MAILTO`          | _(blank)_ | Contact mailto for the Crossref "polite pool"; enables Crossref.|

All five are listed in `.env.example`. They are **server-only** (no
`NEXT_PUBLIC_` prefix) and must never be exposed to the client.

Tuning `EVIDENCE_MIN_RELEVANCE`: raise it (e.g. `0.75`) for stricter, fewer,
higher-precision matches; lower it (e.g. `0.5`) for higher recall at the cost of
more loosely-related sources. Changing it and re-running evidence rebuilds a
run's links idempotently.

---

## 4. Real endpoints used (live mode)

| Provider          | Endpoint                                             | Auth / etiquette                          |
| ----------------- | ---------------------------------------------------- | ----------------------------------------- |
| arXiv             | `http://export.arxiv.org/api/query`                  | none (be courteous with request rate)     |
| Crossref          | `https://api.crossref.org/works`                     | `mailto=` for the polite pool             |
| PubMed (NCBI)     | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`     | `email=` (E-utilities etiquette)          |
| Semantic Scholar  | `https://api.semanticscholar.org/graph/v1/`          | `x-api-key:` header                       |
| DOI               | `https://doi.org/` (content negotiation)             | none                                      |
| Web fallback      | host-provided `webFetcher` only                      | disabled unless the host injects a fetcher |

---

## 5. Rate-limit notes

- **arXiv** — no key, but expects a low, polite request rate. Burst use can be
  throttled; the provider returns `[]` (never throws) on a throttle/error, so a
  run degrades gracefully rather than failing.
- **Crossref** — providing `CROSSREF_MAILTO` puts you in the faster, more
  reliable "polite pool". Without it, anonymous traffic is rate-limited harder.
- **PubMed / NCBI E-utilities** — without an API key, ~3 requests/sec; the
  `PUBMED_EMAIL` is required etiquette so NCBI can contact you about heavy use.
- **Semantic Scholar** — the unauthenticated tier is heavily rate-limited; set
  `SEMANTIC_SCHOLAR_API_KEY` for a usable quota.
- **General** — every provider is failure-isolated: a disabled or rate-limited
  provider yields `[]`, so one backend's limit never breaks a run. If live
  evidence is sparse, check which keys are set and the provider's quota.

---

## 6. Verifying configuration

1. Set the vars (start with fixture mode to confirm the pipeline works end-to-end
   with no network).
2. Create a research run; confirm `research_runs.evidence_status` is set and
   `evidence_coverage` is populated.
3. Flip `EVIDENCE_MODE=live`, set at least `CROSSREF_MAILTO` + `PUBMED_EMAIL`,
   re-run evidence on a run, and confirm `evidence_status` becomes `live`/`mixed`
   and `coverage.bySource` lists the live providers.
