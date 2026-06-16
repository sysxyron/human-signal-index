# Domain Routing Audit — www (marketing) vs app

Both `www.humansignalindex.org` and `app.humansignalindex.org` are attached to the
**same Vercel project**, so every route renders on both origins. The goal:

- **Marketing pages** stay on `https://www.humansignalindex.org`.
- **Dashboard, Login, Signup, and app-only routes** use `https://app.humansignalindex.org`.

## Findings

| Area | Before | After |
| --- | --- | --- |
| `metadataBase` (canonical/OG) | apex `https://humansignalindex.org` | `https://www.humansignalindex.org` |
| App CTAs ("Explore Dashboard") | `appHref()` → `NEXT_PUBLIC_APP_URL` ✅ | unchanged ✅ |
| Login / Signup from marketing | not surfaced in nav | `appHref('/sign-in')` (Sign-in link added to PublicNav) |
| Marketing nav links (header/footer/logo) | **relative** → stayed on whatever origin (so a visitor on `app.*` kept browsing marketing on `app.*`) | resolve through `siteHref()` / `siteBase` → absolute `www` in production |
| Absolute URL helpers | only `appHref()` (app-url.ts) | added `siteHref()` (site-url.ts) for the marketing origin |

## How it works now

- `lib/env/app-url.ts` → `appHref(path)` uses `NEXT_PUBLIC_APP_URL` for **app** links (Dashboard, Login, Signup).
- `lib/env/site-url.ts` → `getPublicSiteUrl()` / `siteHref(path)` uses `NEXT_PUBLIC_SITE_URL` for **marketing** links.
- The marketing layout passes `siteBase = getPublicSiteUrl()` and `signInHref = appHref('/sign-in')` to `PublicNav` and `Footer`. The shared nav prefixes every marketing link (and the logo) with `siteBase`, so on `app.*` they point back to `www.*`. App CTAs and Sign-in go to `app.*`.
- In **dev / preview** `NEXT_PUBLIC_SITE_URL` is unset, so `siteBase` is `''` and marketing links stay **relative** — localhost and preview URLs keep working.
- `metadataBase` + per-page `alternates.canonical` resolve canonical + Open Graph URLs to `www`, so search engines treat the `www` marketing pages as canonical (not the `app.*` copies).

## Required production environment

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.humansignalindex.org` |
| `NEXT_PUBLIC_APP_URL` | `https://app.humansignalindex.org` |

## Recommended Vercel domain config (outside code)

- Serve marketing from `www.humansignalindex.org` and the app from `app.humansignalindex.org`.
- Redirect the **apex** `humansignalindex.org` → `www` (not `app`).
- Optional hardening (not done here to respect the no-middleware constraint): a redirect that bounces marketing paths requested on `app.*` to `www.*`, and app paths requested on `www.*` to `app.*`. The link-level fix above already keeps in-product navigation on the correct origin.

## Scope note

This audit changed link helpers, navigation, and metadata only. No middleware, auth,
RBAC, billing, or app routing was modified.
