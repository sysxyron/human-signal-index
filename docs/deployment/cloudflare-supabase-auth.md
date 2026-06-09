# Cloudflare + Supabase Auth (HSI Phase 14)

How to stop Cloudflare from challenging self-hosted Supabase's API / Auth / REST /
Storage endpoints — the root cause of `"Failed to fetch"` logins in the browser.
Commands assume Windows (PowerShell) where noted; bash equivalents are given.

**Deployment context.** HSI runs against a **self-hosted Supabase** stack fronted by
**Kong**, behind **Cloudflare** (orange-cloud / proxied):

| Role | Host |
| --- | --- |
| Supabase API gateway (Kong) | `supabasekong-his-db.apps.amenxlabs.com` |
| Frontend (WorldForge) | `worldforge.apps.amenxlabs.com` |

Related: deployment overview [`README.md`](./README.md) §7 (Cloudflare DNS / WAF),
evidence providers [`provider-setup.md`](./provider-setup.md), security model
[`../security/README.md`](../security/README.md).

---

## 1. Problem

Cloudflare's bot/threat mitigations (Browser Integrity Check, Bot Fight Mode,
Super Bot Fight Mode, JS / Managed Challenge, some Managed WAF rules) defend a
site by **interrupting a request with an HTML interstitial** — the
"Just a moment…" / "Checking your browser" page that a human solves in a browser.
That is correct behavior for *page* traffic. It is **fatal** for *API* traffic.

When the frontend at `worldforge.apps.amenxlabs.com` calls Supabase, the browser
issues `fetch()` requests through `supabase-js` to programmatic endpoints such as:

- `POST /auth/v1/token?grant_type=password` (sign-in)
- `GET  /auth/v1/settings`
- `GET  /rest/v1/<table>` (PostgREST)
- `POST /storage/v1/object/...`

These expect a **JSON** response with the right CORS headers. If Cloudflare decides
to challenge one of them, it returns instead:

- HTTP `403` (or `503` / `429`) with a **`text/html`** body containing
  "Just a moment…",
- a **`cf-mitigated: challenge`** response header,
- **no** `Access-Control-Allow-Origin` matching the frontend origin.

The browser then either (a) refuses to expose the cross-origin HTML response to JS
because CORS headers are missing, or (b) hands `supabase-js` an HTML body where it
expected JSON. In both cases the `fetch` rejects and the SDK throws the generic,
unhelpful **`TypeError: Failed to fetch`**. The login screen shows a failure with no
useful detail, even though Supabase itself is healthy.

> **Key fact:** API endpoints are **machine-to-machine**. There is no human in the
> loop to solve an interstitial, and JS cannot read a challenged cross-origin
> response. **API routes must never be challenged.**

---

## 2. The fix — Cloudflare WAF skip rule

Create a single **WAF custom rule** with the **Skip** action that matches every
Supabase API prefix on the Kong host and skips the products that emit challenges.

### 2.1 Expression (use verbatim)

In **Cloudflare Dashboard → your zone → Security → WAF → Custom rules →
Create rule**, switch the expression editor to **Edit expression** and paste **exactly**:

```
(http.host eq "supabasekong-his-db.apps.amenxlabs.com" and (
starts_with(http.request.uri.path, "/rest/") or
starts_with(http.request.uri.path, "/auth/") or
starts_with(http.request.uri.path, "/storage/") or
starts_with(http.request.uri.path, "/realtime/") or
starts_with(http.request.uri.path, "/functions/")
))
```

This matches only the Supabase Kong host **and** only its API path prefixes
(PostgREST, GoTrue/Auth, Storage, Realtime, Edge Functions). It deliberately does
**not** match the frontend host or any page route, so the rest of your site keeps
full Cloudflare protection.

### 2.2 Action: Skip

Set the action to **Skip** and tick the components to skip. Recommended:

| Skip option | Why |
| --- | --- |
| **All managed rules** (Managed Ruleset / OWASP) | Stop managed signatures from returning a challenge/block on API bodies. |
| **Super Bot Fight Mode** | Stop the bot product from serving an interstitial to programmatic clients. |
| **Bot Fight Mode** (if SBFM is unavailable on your plan) | Same reason, free-plan equivalent. |
| **Browser Integrity Check** | The classic source of "Just a moment…" on non-browser requests. |
| **Rate limiting rules** (only if a rate-limit rule is *challenging* these paths) | Prefer to keep a **block-only** rate limit on auth — see §10. |

Also set, in the same rule's "Then skip…" panel where offered:
**"Skip remaining custom rules"** so a later custom challenge rule cannot re-challenge
these paths.

> If your plan exposes a **Managed Challenge** product rather than the legacy
> Browser Integrity Check, the Skip action's bot/managed-rules toggles cover it; the
> goal is simply that **no Cloudflare product issues a challenge for matched paths.**

### 2.3 Order / priority

WAF custom rules execute **top-to-bottom**, and Cloudflare's phase order runs custom
rules **before** the managed challenge / bot phases that this Skip targets. So:

1. **Place this Skip rule at the very top** of your Custom rules list (drag it to
   priority 1).
2. Any challenge / block custom rules go **below** it.
3. Because the rule also skips remaining custom rules for matched requests, a
   broad "challenge everything from suspicious ASNs" rule lower in the list will
   not undo it.

Save and deploy. Changes propagate within seconds.

---

## 3. Why API routes cannot be challenged

A Cloudflare challenge is a **human-in-the-browser** test. Supabase API calls have
none of the prerequisites to pass one:

- **No human.** `supabase-js` runs `fetch()` from JavaScript. There is no one to
  click "Verify you are human" on a `/auth/v1/token` POST.
- **CORS opacity.** A challenged cross-origin response lacks
  `Access-Control-Allow-Origin: https://worldforge.apps.amenxlabs.com`. The browser
  therefore blocks JS from reading the body — the request fails before your code
  ever sees a status. Even the **`OPTIONS` preflight** can be challenged, killing the
  real request before it is sent.
- **Wrong content type.** The SDK parses `application/json`. An HTML interstitial
  makes JSON parsing/`fetch` throw `Failed to fetch`.
- **Bearer tokens, not cookies.** Auth/REST calls carry an `apikey` header and a
  JWT `Authorization: Bearer` token. Cloudflare's challenge cookie (`cf_clearance`)
  is irrelevant to them and is not propagated by the SDK.
- **Machine-to-machine.** Server-side and worker calls (service-role key, cron)
  are non-interactive by definition; a challenge is an outright outage for them.

The correct security posture for these paths is **authn/authz at the application
layer** (anon vs service-role keys, RLS, GoTrue) plus **rate limiting** — not bot
challenges. See §10 and [`../security/README.md`](../security/README.md).

---

## 4. When to use DNS-only (grey cloud)

Switching the Supabase host's DNS record to **DNS-only (grey cloud)** in Cloudflare
removes the proxy entirely: traffic resolves straight to your origin and Cloudflare
never sees the request, so it can never challenge it.

**Use it as a fast diagnostic, not as your production fix.**

- **Diagnostic value.** If flipping `supabasekong-his-db` to grey-cloud makes logins
  work instantly, you have **proven** Cloudflare's edge was the cause (vs. CORS,
  TLS, or Supabase config). Flip it back and apply the §2 skip rule.
- **Trade-offs of leaving it grey-cloud:**
  - **No CDN / caching** for that host.
  - **No WAF, Bot, or DDoS protection** — the origin is directly exposed and its
    real IP is published in public DNS.
  - **TLS / origin certificate.** Cloudflare's edge cert no longer terminates TLS
    for this host. The origin must present a **publicly trusted** certificate
    (e.g. Let's Encrypt on Kong/nginx), because **Cloudflare Origin CA certs are
    only trusted by Cloudflare's proxy** and will fail for direct clients.
  - **Loss of "Always Use HTTPS", HSTS injection, and edge rules** for the host.

**Recommendation:** Use the **§2 WAF skip rule** in production — it keeps the host
proxied (CDN, DDoS, TLS, observability) while exempting only the API paths from
challenges. Reserve **DNS-only** for a 60-second is-it-Cloudflare test.

---

## 5. Test `/auth/v1/settings`

This unauthenticated-but-keyed endpoint is the cleanest probe.

```bash
curl -i https://supabasekong-his-db.apps.amenxlabs.com/auth/v1/settings \
  -H "apikey: <ANON_KEY>"
```

PowerShell:

```powershell
curl.exe -i https://supabasekong-his-db.apps.amenxlabs.com/auth/v1/settings `
  -H "apikey: <ANON_KEY>"
```

**Healthy (fixed) — JSON:**

```http
HTTP/2 200
content-type: application/json
...
{"external":{"email":true,...},"disable_signup":false,"mailer_autoconfirm":...}
```

**Broken (challenged) — HTML interstitial:**

```http
HTTP/2 403
content-type: text/html; charset=UTF-8
cf-mitigated: challenge
server: cloudflare
...
<!DOCTYPE html><html><head><title>Just a moment...</title>
... <h1>Checking your browser before accessing ...</h1> ...
```

Tells: `content-type: text/html`, a **`cf-mitigated: challenge`** header,
`server: cloudflare`, and a body containing **"Just a moment…"** /
**"Checking your browser"** / **"Verify you are human"**. Any of these means the
skip rule is missing, scoped wrong, or ordered below a challenge rule.

---

## 6. Test `/rest/v1/`

PostgREST's root returns the OpenAPI description as JSON.

```bash
curl -i https://supabasekong-his-db.apps.amenxlabs.com/rest/v1/ \
  -H "apikey: <ANON_KEY>"
```

**Healthy — JSON/OpenAPI:**

```http
HTTP/2 200
content-type: application/openapi+json
...
{"swagger":"2.0","info":{"title":"standard public schema",...},"paths":{...}}
```

If you instead get `text/html` + `cf-mitigated` + "Just a moment…", `/rest/` is being
challenged — recheck the §2 rule covers `starts_with(..., "/rest/")` and is at the
top of the list. (A `401`/`404` **JSON** body is fine — it proves the request reached
Supabase, not Cloudflare.)

---

## 7. Inspect the browser Network tab

Reproduce the failing login in the browser, then open **DevTools → Network**:

1. **Find the request.** Look for `token` (`/auth/v1/token?grant_type=password`)
   on sign-in, or `settings` (`/auth/v1/settings`) on page load. Filter by `Fetch/XHR`.
2. **Check the Response tab.** Healthy = JSON. Broken = an **HTML document**
   ("Just a moment…"). HTML where JSON is expected is the smoking gun.
3. **Check Response Headers.** A challenged request shows **`cf-mitigated: challenge`**
   and `server: cloudflare`, and is **missing**
   `access-control-allow-origin: https://worldforge.apps.amenxlabs.com`.
4. **Check CORS / preflight.** Look for a preceding **`OPTIONS`** request to the same
   URL. If the `OPTIONS` is challenged or 4xx, the browser cancels the real call and
   the Console shows a CORS error plus `TypeError: Failed to fetch`. A blocked
   preflight means the path is challenged or CORS origins are misconfigured (§10).
5. **Status & timing.** `403`/`503`/`429` with HTML = Cloudflare. A status from
   Supabase itself (`200`/`400`/`401` with JSON) means the edge is fine; debug the
   app/keys instead.

---

## 8. HSI tooling (Phase 14)

HSI ships diagnostics that detect the challenge-HTML condition and surface a readable
message instead of a bare `Failed to fetch`:

- **Health routes** — `GET /api/health/supabase`, `/api/health/auth`,
  `/api/health/rest`, `/api/health/storage`. Each probes the corresponding Supabase
  endpoint server-side, inspects the response, and **flags challenge HTML / `cf-mitigated`**
  rather than reporting a generic failure. Green across all four = the §2 fix is live.
- **Security dashboard** — `/dashboard/security` (admin). Aggregates the health
  probes and renders a human-readable status, including an explicit
  "Cloudflare is challenging this endpoint" diagnosis with a pointer back to this doc.
- **Diagnostic helpers** —
  - `apps/web/lib/auth/auth-diagnostics.ts` — classifies a failed Supabase call
    (challenge HTML, CORS/preflight, network, bad key) and produces an actionable
    hint.
  - `apps/web/lib/auth/auth-errors.ts` — translates raw `Failed to fetch` /
    SDK errors into user-facing messages and the underlying cause.

Use these first when triaging a login outage: hit the health routes, open the
security dashboard, and read the translated error before touching Cloudflare.

---

## 9. Checklist

Ordered, end-to-end:

- [ ] **Env set** on the frontend host (and Vercel/worker as applicable):
      `NEXT_PUBLIC_SUPABASE_URL=https://supabasekong-his-db.apps.amenxlabs.com` and
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>` (service-role key server-only).
- [ ] **Add the WAF skip rule** (§2) with the verbatim expression and Skip action.
- [ ] **Order it priority 1** (top of Custom rules); enable "skip remaining custom rules".
- [ ] **Verify with curl** (§5, §6): `/auth/v1/settings` and `/rest/v1/` return
      **JSON**, no `cf-mitigated`, no "Just a moment…".
- [ ] **Verify in the Network tab** (§7): `/auth/v1/token` returns JSON; `OPTIONS`
      preflight succeeds; `access-control-allow-origin` matches the frontend origin.
- [ ] **Verify health routes green** (§8): `/api/health/{supabase,auth,rest,storage}`
      and `/dashboard/security` all healthy.
- [ ] **Confirm sign-in works** from `worldforge.apps.amenxlabs.com` end-to-end.

---

## 10. Other gotchas

- **Supabase CORS allowed origins.** Even with challenges gone, the browser needs
  CORS. In Supabase Auth config, set **Site URL** to
  `https://worldforge.apps.amenxlabs.com` and add it (plus any preview hosts) to
  **`additional_redirect_urls`**. For self-hosted GoTrue/Kong, ensure
  `GOTRUE_SITE_URL` / `GOTRUE_URI_ALLOW_LIST` and any Kong CORS plugin allow the
  frontend origin; otherwise preflight fails with the same `Failed to fetch`.
- **HSTS / TLS.** With the host proxied, keep **SSL/TLS = Full (strict)** and a valid
  origin cert on Kong. If you ever go DNS-only, the origin must serve a **publicly
  trusted** cert (not a Cloudflare Origin CA cert) — see §4. HSTS on the apex should
  not break API paths, but a TLS mismatch surfaces as a network/`Failed to fetch`
  error indistinguishable from a challenge — check curl's TLS output to disambiguate.
- **Kong route prefixes.** The skip expression assumes the standard Supabase Kong
  prefixes (`/auth/`, `/rest/`, `/storage/`, `/realtime/`, `/functions/`). If your
  Kong is mounted under a sub-path or uses custom routes, adjust the `starts_with(...)`
  paths to match your actual Kong routing, or the rule will silently miss traffic.
- **Rate-limit rules.** Keep rate limiting on `/auth/` (brute-force defense), but set
  its action to **Block**, not Challenge — a challenge on an API path reintroduces the
  exact HTML-interstitial failure this doc fixes. If a rate-limit rule currently
  *challenges* these paths, either change it to Block or include it in the §2 Skip.
- **Don't over-skip.** Scope the skip to the **Kong host only**. Never skip WAF for
  the frontend host or for `/api/*` app routes on Vercel — those keep full protection
  per [`README.md`](./README.md) §7.
