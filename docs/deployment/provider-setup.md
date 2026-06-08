# Evidence Provider Setup (WorldForge Phase 5)

How to configure the evidence engine for **fixture** (default, deterministic) or
**live** retrieval, the keys each provider needs, and how the nightly refresh runs.

## Fixture vs live

| Mode      | `EVIDENCE_MODE` | Behavior                                                      |
|-----------|-----------------|---------------------------------------------------------------|
| Fixture   | `fixture` (default) | Curated in-package sources only. No network, deterministic. |
| Live      | `live`          | Fans out across real public APIs; each provider self-gates on its own key/email. Missing keys simply disable that provider. |

With **empty env** the app builds and runs in fixture mode — no keys required.

## Environment variables

```
# Mode + tuning
EVIDENCE_MODE=fixture            # 'fixture' | 'live'
EVIDENCE_MIN_RELEVANCE=0.65      # 0..1 minimum relevance to keep a match
EVIDENCE_CACHE_TTL=86400         # retrieval-cache TTL in seconds (24h)

# Provider credentials (only used when EVIDENCE_MODE=live)
SEMANTIC_SCHOLAR_API_KEY=        # enables Semantic Scholar
PUBMED_EMAIL=                    # NCBI eutils etiquette — enables PubMed
CROSSREF_MAILTO=                 # Crossref "polite pool" — enables Crossref

# OpenAI (optional) — enables embedding relevance + LLM support classifier
OPENAI_API_KEY=
```

Keys are resolved **by the host app** (`evidence-persistence.ts` / the worker) and
passed into the pure engine — the `@hsi/evidence-engine` package never reads
`process.env`.

## Providers, endpoints, rate limits

| Provider          | Gate                      | Endpoint (base)                                  | Rate-limit etiquette |
|-------------------|---------------------------|--------------------------------------------------|----------------------|
| arXiv             | live mode (no key)        | `export.arxiv.org/api/query`                     | ~1 req / 3s; be gentle. |
| Crossref          | `CROSSREF_MAILTO`         | `api.crossref.org/works`                         | Polite pool via mailto; ~50 req/s shared. |
| PubMed (eutils)   | `PUBMED_EMAIL`            | `eutils.ncbi.nlm.nih.gov/entrez/eutils`          | 3 req/s without an API key. |
| Semantic Scholar  | `SEMANTIC_SCHOLAR_API_KEY`| `api.semanticscholar.org/graph/v1`               | ~1 req/s unauthenticated; higher with a key. |
| DOI               | live mode (no key)        | `doi.org` / content negotiation                  | Light; single-id lookups. |
| Web fallback      | injected `webFetcher`     | host-provided                                    | Off unless wired up. |
| OpenAI embeddings | `OPENAI_API_KEY`          | `api.openai.com/v1/embeddings`                   | Per your OpenAI tier. |

Every provider is wrapped with timeout + retry + backoff and **degrades to `[]`**
on failure (it never throws), so a rate-limited or down provider doesn't sink a run.
Provider health (HEALTHY/DEGRADED/OFFLINE) is recorded per call and persisted to
`provider_health`.

## Caching

Repeated queries are served from the retrieval cache (memory + the Supabase
`evidence_cache` table) for `EVIDENCE_CACHE_TTL` seconds, cutting provider load and
smoothing over transient outages. Cache failures degrade to a direct provider query.

## Nightly refresh worker

`evidenceRefreshJob` (`apps/worker/jobs/evidence-refresh.ts`) re-checks a batch of
research runs daily, refreshing citations/metadata/contradiction status and updating
`provider_health`. It declares cron `0 4 * * *` but the worker has **no internal
scheduler** — an external scheduler invokes it:

- **Vercel Cron** — `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/evidence-refresh", "schedule": "0 4 * * *" }] }
  ```
  The route must verify `Authorization: Bearer $CRON_SECRET` before calling
  `evidenceRefreshJob.run(ctx)`.
- **System cron / any scheduler** — call the same `CRON_SECRET`-guarded endpoint.

The job is injected with loaders/persisters (default no-ops), supports a batch size
(`EVIDENCE_REFRESH_BATCH_SIZE`, default 25), and **never throws** — if every provider
is down it logs, counts failures, and still returns `ok: true`.
