# Phase 70.3.1 — Source Import Hardening & Discovery Diagnostics

**Status:** Complete (uncommitted) · **Type:** Additive/fix-only hardening of Phase 70.3
**Route:** `/dashboard/source-discovery` (reviewer+; admins import + run agents)
**Migration:** `0058_source_import_hardening.sql` (additive)

Fixes the real issues found in the first CSV test: over-broad duplicate detection
for platform sources, unclear invalid-row diagnostics, and a Discovery Agent that
returned 0 with no explanation. Human review still required; nothing auto-activates
or auto-publishes; no crawling/bypass/dark-web.

---

## Duplicate model (platform-aware)

Uniqueness is now by **canonical identity**, not root domain. Statuses:
`none · exact_duplicate · domain_duplicate · feed_duplicate · related_source ·
platform_identity_duplicate · platform_domain_only_not_duplicate`.

| Status | Meaning | Approval |
|---|---|---|
| `exact_duplicate` | identical homepage URL | **blocked** |
| `platform_identity_duplicate` | same platform identity (channel/subreddit/repo) | **blocked** |
| `feed_duplicate` | same feed/endpoint URL | confirm |
| `domain_duplicate` | same non-platform domain | confirm |
| `related_source` | shares a non-platform root domain | confirm |
| `platform_domain_only_not_duplicate` | same platform (youtube.com) but different channel | **allowed into review** |
| `none` | unique | allowed |

`detectExactDuplicate` now compares the **homepage** URL only, so feed/platform
identities are no longer shadowed by it.

## Platform identity rules

`getPlatformIdentity(url)` extracts a scoped identity; `getSourceIdentityKey()`
chooses the strategy (`exact_url` / `platform_identity` / `feed_url` / `domain`):

| Platform | Identity key example |
|---|---|
| YouTube | `youtube:@reuters`, `youtube:channel:ucxxxx`, `youtube:c:name` |
| Reddit | `reddit:r/worldnews` |
| TikTok | `tiktok:@news` |
| GitHub | `github:org/repo` |
| Twitter/X | `twitter:@handle` |
| RSS / podcast / api / threat_feed / archive / newswire | `rss:<feed-url>` (feed is the identity) |
| Website / gov / court / research / media | `website:<domain>` |

Stored on each candidate: `canonical_url`, `identity_key`, `identity_strategy`.

## URL normalization

`normalizeSourceUrl()`: http→https, lowercase host, strip `www.`, strip trailing
slash (except root), strip `utm_*`/tracking params (keep meaningful query + path).
Preserves YouTube handles, subreddit paths, RSS feed paths, API paths.

Examples: `http://www.Example.com/` → `https://example.com/` ·
`https://x.com/p?utm_source=a&q=1` → `https://x.com/p?q=1`.

## Success-criteria outcomes

- ✅ Reuters YouTube vs BBC YouTube → `platform_domain_only_not_duplicate` (both
  allowed; not rejected for sharing youtube.com).
- ✅ Same channel re-imported → `platform_identity_duplicate` (blocked).
- ✅ Different subreddits → allowed; same subreddit → blocked.
- ✅ Podcast feeds compared by feed URL, not by spotify.com/apple.com.
- ✅ Plain websites still `domain_duplicate`.

---

## Import diagnostics

`validateRow` emits coded errors `CODE: reason — Suggested: fix`:
`MISSING_REQUIRED_FIELD`, `INVALID_URL`, `UNSUPPORTED_SOURCE_TYPE` (with a suggested
type, e.g. "News Channel" → youtube), `BAD_RISK_SCORE`, `BAD_INTERVAL`. The
dashboard's **Invalid rows** panel shows row number, source name, URL, and each
coded reason. Batches show valid / invalid / duplicate counts.

## CSV re-test workflow

`reprocessBatch()` (admin) re-validates, re-classifies, and re-dedupes a batch
against the current logic: it preserves the original raw rows and any
approved/rejected decisions, deletes only the un-reviewed candidates, recreates
them, recomputes batch counts, and records an audit event — so improved validation
can be re-applied without duplicating candidates. Surfaced as a per-batch
**Reprocess** button.

## Discovery diagnostics

Each `source_discovery_runs` row now records `reason`, `sources_considered`,
`sources_skipped`, and a `diagnostics` jsonb (mode, input, categories searched,
candidate URLs found, skipped-existing/non-url). When nothing is found, a clear
reason is shown: `NO_APPROVED_SOURCES` / `NO_PUBLIC_FEEDS_FOUND` / `ALL_DUPLICATES`
/ `INSUFFICIENT_INPUTS` (mode is always `SAFE_MODE_NO_WEB_ACCESS` — discovery reads
existing evidence references, never the open web). No fabricated findings.

## Discovery seeds

`source_discovery_seeds` (admin-config, seeded with the example terms per category
A/B/C/D/Foundation) scope discovery suggestions by category. Admins add/toggle
seeds in the dashboard. Seeds never crawl or activate anything.

## Registry statistics (Phase 71 readiness)

Real counts: total / active / paused sources, candidates pending, duplicates
found, invalid rows, sources by type / by category / by platform, sources with vs
missing feed/API URL, and **geo-ready vs missing-geo** candidates — the inputs the
Phase 71 Global Intelligence Map needs to gauge how much of the registry is
mappable. No fabricated counts.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| YouTube/Reddit/podcast identity + normalization + diagnostics + duplicate tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2789 / 2789** pass, 0 fail |
| `next build` (clean `.next`) | ✅ compiled |
| Migration registered (0001→0058) | ✅ 58/58 |
| No auto-activation / no auto-publishing / no dark-web crawling / no workflow change | ✅ |

---

## Completion report

- **Files changed:** `lib/source-discovery/` — `types` (statuses + error codes),
  `csv` (coded diagnostics + suggestType), `duplicates` (full platform-aware
  rewrite: normalize + identity + detect), `persistence` (identity columns,
  reprocess, seeds, invalid-rows, registry stats), `engine` (discovery diagnostics
  + reprocess), `service` + `actions` (reprocess/seeds), `data` (stats/seeds/invalid
  rows); `components/source-discovery/` (badges, reprocess, seed manager, invalid &
  stats panels); page; migration `0058`; 1 test file added + 1 updated.
- **Duplicate logic changes:** homepage-only exact match; platform identity keys;
  platform-domain-only allowance; feed-URL identity; two new statuses.
- **URL normalization examples:** see above.
- **Diagnostics examples:** coded invalid-row errors; discovery "0 findings" reasons.
- **Test results:** 2789/2789 pass.
- **Phase 71 readiness impact:** registry statistics expose mappable-source counts
  (geo-ready vs missing-geo, with/without feed, by platform) and the candidate
  pipeline now carries optional, never-fabricated geo fields — the inputs the
  Global Intelligence Map foundation consumes.

Left **uncommitted** per your standing preference.
