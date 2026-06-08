# @hsi/source-intelligence

The signal-intake / monitoring engine for **WorldForge / HSI Phase 7 — the Human
Signal Intelligence Network**. It continuously observes **PUBLIC** signals
(websites, RSS feeds, public pages, uploaded documents, human submissions),
detects change and narrative drift, classifies signals, matches research
watchlists, and raises **explainable alert DRAFTS** for the
evidence / governance / review pipeline.

Pure TypeScript, **zero required runtime dependencies**, deterministic, and
**fully offline** via fixtures.

---

## Ethics (enforced in code, not just docs)

- **PUBLIC information ONLY.** We never bypass authentication, never capture
  login/paywall-gated content, never enter private communities.
- **No doxxing, no harassment.** We monitor PUBLIC narratives, ideologies and
  movements for research/governance — **never private individuals**.
- **Nothing auto-publishes.** Every output is a *draft* (signals, alerts) for a
  human to review. The engine never acts automatically.
- The guard `assertPublicCapturePolicy(url)` runs **before any network request**
  and rejects auth/credentialed/login URLs (mirrors
  `@hsi/source-connectors`'s policy). `isPublicCaptureAllowed(url)` is the
  non-throwing variant.

## Determinism & offline mode

- No `Date.now()` / `Math.random()` in pure code — callers **inject `now`**.
- Network is **gated and injected**: providers only fetch when you pass
  `captureDeps.fetchImpl` **or** explicitly set `captureDeps.allowNetwork: true`.
  Global `fetch` is never touched at import time.
- The whole pipeline runs with **no network** using the fixtures and
  `FixtureCaptureProvider`.

## Enabling live capture

Live capture is **opt-in**:

```ts
import { runIntakePipeline } from '@hsi/source-intelligence';

const out = await runIntakePipeline(
  source,
  { captureDeps: { allowNetwork: true } },   // or { fetchImpl: myFetch }
  new Date().toISOString(),                   // caller-injected `now`
);
```

Without `fetchImpl`/`allowNetwork`, website/rss capture returns
`{ ok: false }` (graceful, never throws). `assertPublicCapturePolicy` still
guards every URL.

## The pipeline — `runIntakePipeline(source, options?, now?)`

```
capture  →  detectChange (vs prior)  →  classifySignal  →  matchWatchlists  →  generateAlerts
```

Returns (never throws — errors surface in `capture`):

```ts
{
  capture: CaptureResult,
  signalDraft?: SignalDraft,
  change: ChangeResult | null,
  classification?: Classification,
  matches: WatchlistMatch[],
  alerts: AlertDraft[],     // every alert has an `explanation`
}
```

### Offline example

```ts
import {
  runIntakePipeline, FixtureCaptureProvider, DEMO_SOURCES,
} from '@hsi/source-intelligence';

const fx = new FixtureCaptureProvider('website');
const source = DEMO_SOURCES.find((s) => s.id === 'src_demo_site')!;
const out = await runIntakePipeline(source, { extraProviders: [fx] }, '2026-01-01T00:00:00.000Z');

out.alerts.forEach((a) => console.log(a.severity, a.alertType, '-', a.explanation));
```

## Modules

| Module        | Purpose |
|---------------|---------|
| `registry/`   | Source registry domain types + `validateSource` / `registerSource` (policy-checked). |
| `capture/`    | `websiteProvider`, `rssProvider` (+ `parseRssFeed`), `documentProvider`, `submitManual`; `createCaptureProviders` / `captureSource` routing. |
| `monitor/`    | `detectChange` (hash + lexical similarity → none/new/modified/major), `diffRssFeeds`. |
| `classify/`   | `classifySignal` — deterministic lexicon/rule classifier; preserves uncertainty (`other` + low confidence); unlimited custom categories. |
| `drift/`      | `detectNarrativeDrift`, `trackNarrative` — pure drift detection across snapshots. |
| `alerts/`     | `generateAlerts` — explainable alert drafts with documented severity rules. |
| `watchlists/` | `matchWatchlists`, `DEFAULT_WATCHLISTS` (neutral, research-oriented public terms). |
| `fixtures/`   | `DEMO_SOURCES`, `DEMO_SIGNALS`, `DEMO_DRIFT_PAIR`, `FixtureCaptureProvider`. |

### Alert severity rules

- `new_signal` → MEDIUM if confidence ≥ 0.7, else LOW.
- `source_changed` → MEDIUM for a `major` change (no alert otherwise).
- `narrative_shift` → HIGH.
- `watchlist_match` → the watchlist's own severity.
- `high_risk_signal` → CRITICAL when a HIGH/CRITICAL watchlist matches a
  high-confidence (≥ 0.7) signal; otherwise HIGH.

## Tests

```
node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test packages/source-intelligence/tests/*.test.ts
```

All suites are deterministic with a fixed `now` and require no network.
