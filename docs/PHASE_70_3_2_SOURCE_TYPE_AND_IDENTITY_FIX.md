# Phase 70.3.2 — Source Type Registry Completion + Platform Identity Enforcement

**Status:** Complete (uncommitted) · **Type:** Fix-only (no migration, no workflow change)
**Route:** `/dashboard/source-discovery` (reviewer+; admins import + run agents)
**Migration:** none — identity columns already exist (`0058`); `source_type` is free text.

Fixes the two defects found in the second CSV import test:

1. **Valid rows were rejected** because the `source_type` registry only knew a
   handful of internal tags — human labels from the HSI seed CSV
   (`RSS / Atom feed`, `API (foundation)`, `Public policy organizations`,
   `Watchlist (no RSS)`, …) were flagged `UNSUPPORTED_SOURCE_TYPE`.
2. **Duplicate decisions used hostname, not identity** in places, so platform
   sources were mislabelled and the UI explanation said "Domain youtube.com
   already covered" instead of comparing the two identities.

Human review still required; nothing auto-activates or auto-publishes; no new
crawling, no dark-web, no ingestion/review workflow changes, no fabricated metadata.

---

## 1. Source type registry (23 canonical types)

`lib/source-discovery/types.ts` → `SOURCE_TYPES`:

```
website · rss_feed · news_rss · youtube · tiktok · podcast_rss · forum · document ·
manual · government · court_opinions · research_rss · reddit · social_page ·
api_foundation · webhook · archive · intelligence_feed · watchlist · email ·
news_source · public_policy_org · threat_feed
```

### Alias mappings (`SOURCE_TYPE_ALIASES`)

Human labels + legacy tags are normalized (trim → lowercase → collapse spaces),
then matched canonical-direct or via the alias table:

| Raw input | Canonical |
|---|---|
| `RSS / Atom feed`, `rss`, `atom`, `feed` | `rss_feed` |
| `News (RSS)` | `news_rss` |
| `Podcast (RSS)`, `podcast` | `podcast_rss` |
| `Research (RSS)`, `research` | `research_rss` |
| `API (foundation)`, `api` | `api_foundation` |
| `Webhook (inbound)` | `webhook` |
| `Public policy organizations` | `public_policy_org` |
| `Watchlist (no RSS)` | `watchlist` |
| `Court opinions`, `court` | `court_opinions` |
| `News sources`, `newswire` | `news_source` |
| `Social page`, `social` | `social_page` |
| `Document`, `doc`, `pdf` | `document` |
| `Government`, `gov` | `government` |
| `Intelligence feed`, `intel feed` | `intelligence_feed` |

`normalizeSourceType(raw): SourceTypeTag | null` — canonical or `null` if truly
unmappable. `isSourceType()` is now alias-aware (`= normalizeSourceType(v) !== null`).
CSV validation, classification, and identity computation all route through it, so a
recognized label normalizes everywhere consistently. Genuinely unknown values
(`News Channel`, `blog`) still fail with `UNSUPPORTED_SOURCE_TYPE` + a suggested type.

---

## 2. Identity keys (`getSourceIdentityKey`)

Duplicate decisions use **`identity_key`, not hostname**. Strategy precedence:

| Source type | Strategy | identity_key example |
|---|---|---|
| `rss_feed` / `news_rss` / `research_rss` | `feed_url` | `rss:https://cisa.gov/advisories.xml` |
| `podcast_rss` | `feed_url` | `podcast:https://feeds.megaphone.fm/show` |
| `api_foundation` / `webhook` | `feed_url` | `api:https://api.example.com/v1/events` |
| `threat_feed` / `intelligence_feed` | `feed_url` | `threat:…` / `intel:…` |
| YouTube channel | `platform_identity` | `youtube:@reuters`, `youtube:channel:ucxxxx` |
| Reddit subreddit | `platform_identity` | `reddit:r/antinatalism` |
| TikTok / GitHub / Twitter / social | `platform_identity` | `tiktok:@news`, `github:org/repo`, `twitter:@handle` |
| `watchlist` / `document` / `archive` | `domain` (full path) | `watchlist:https://example.com/list/a` |
| `website` / `government` / `court` / `news_source` | `domain` (domain + path) | `website:reuters.com`, `website:senate.gov/committees/intel` |

Feed-identity types key off the **feed/endpoint URL** (so the same feed re-imported
under a different homepage is still caught). Platform types key off the
**handle/subreddit/repo**, never the platform domain. Government and other agency
paths are preserved in the website key, so distinct agency pages are distinct
identities. Stored per candidate: `canonical_url`, `identity_key`, `identity_strategy`.

---

## 3. Duplicate statuses & behavior

```
none · exact_duplicate · platform_identity_duplicate · domain_duplicate ·
feed_duplicate · related_source · platform_domain_only_not_duplicate
```

| Status | Meaning | Approval |
|---|---|---|
| `exact_duplicate` | identical homepage URL | **blocked** |
| `platform_identity_duplicate` | same platform handle/subreddit/repo | **blocked** |
| `feed_duplicate` | same feed/endpoint URL | confirm |
| `domain_duplicate` | same non-platform **website** domain, different URL | confirm |
| `related_source` | shares a non-platform root domain (subdomain) | confirm |
| `platform_domain_only_not_duplicate` | same platform domain, **different** channel/path | **allowed** |
| `none` | unique | allowed |

`detectDomainDuplicate` now only fires for `website:`-identity sources — feed and
path sources sharing a domain are **not** duplicates (different feeds on `cisa.gov`
are different sources). `detectExactDuplicate` compares the homepage URL only, so it
no longer shadows feed/platform identities. Precedence: exact → platform_identity →
feed → domain → related → platform_domain_only → none.

---

## 4. UI duplicate explanation

The Source Discovery candidate row shows the candidate's own identity
(`identity: <key> (<strategy>)`) and an identity **comparison** instead of a bare
"domain already covered":

```
Existing identity youtube:@reuters · candidate identity youtube:@bbcnews → platform_domain_only_not_duplicate
Existing identity website:reuters.com · candidate identity website:reuters.com/markets → domain_duplicate
Existing identity reddit:r/antinatalism · candidate identity reddit:r/antinatalism → platform_identity_duplicate
```

Blocked statuses (`exact_duplicate`, `platform_identity_duplicate`) disable the
approve button; `domain_duplicate` / `feed_duplicate` / `related_source` require an
explicit "Confirm & approve".

---

## 5. CSV re-test expectations

The HSI seed CSV types that previously failed now validate (re-runnable on existing
batches via the per-batch **Reprocess** button):

| CSV `source_type` | Result |
|---|---|
| `RSS / Atom feed` | ✅ valid → `rss_feed` |
| `API (foundation)` | ✅ valid → `api_foundation` |
| `Public policy organizations` | ✅ valid → `public_policy_org` |
| `Watchlist (no RSS)` | ✅ valid → `watchlist` |
| `Document` | ✅ valid → `document` |
| `Research (RSS)` | ✅ valid → `research_rss` |
| `News Channel` (free text) | ❌ still invalid (suggested type shown) |

Dedupe outcomes on the same CSV:

- Reuters YouTube vs BBC YouTube → `platform_domain_only_not_duplicate` (both kept).
- NPR vs NPR YouTube (same channel) → `platform_identity_duplicate` (blocked).
- `r/antinatalism` vs `r/collapse` → not a duplicate; vs `r/antinatalism` → blocked.
- Same RSS feed → `feed_duplicate`; different feeds same domain → `none` (allowed).
- Same website URL → `exact_duplicate`.

---

## 6. Tests (Task 6)

`lib/source-discovery/hardening.test.ts` — added: canonical pass-through; human-label
+ legacy alias normalization; unmappable → `null`; seed-CSV types validate;
Reuters/BBC not-duplicate; NPR same-channel duplicate; subreddit not-/is-duplicate;
same-/different-feed; exact website; identity-comparison reason text.
`source-discovery.test.ts` — updated type-inference expectation to `rss_feed`.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Source-discovery tests (`hardening` + `source-discovery`) | ✅ 34/34 |
| Full suite (tracked + untracked) | ✅ (see completion report) |
| `next build` (clean `.next`) | ✅ |
| Migration count unchanged (0001→0058) | ✅ 58/58 |
| No auto-activation / publish / crawl / workflow change | ✅ |

## Phase 71 (Global Intelligence Map) readiness impact

A complete, normalized `source_type` registry + identity keys mean the registry can
be grouped reliably **by platform and by type** for the map, and platform sources
are no longer collapsed onto one node per domain (every YouTube channel / subreddit
/ feed is its own mappable identity). The duplicate model guarantees one node per
real source, not per URL variant — the clean input the map foundation consumes.

Left **uncommitted** per your standing preference.
