# Watchlists

> Neutral, research-oriented keyword sets that route **public** signals for review.

A watchlist is a named set of terms at a severity. When a captured signal matches a
watchlist's terms, the network raises a `watchlist_match` alert. **A match is a topic
flag, not an accusation** — watchlists describe PUBLIC narratives and ideologies, never
private people.

## Concept

| Field (`hsin_watchlists`) | Meaning |
|---------------------------|---------|
| `name` | Display name (e.g. "Extinctionism"). |
| `description` | What the watchlist flags and why it is neutral/descriptive. |
| `severity` | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` — carried onto matches + alerts. |
| `terms` | `text[]` of keywords/phrases (case-insensitive, word-boundary; multi-word terms match as phrases). |

`hsin_watchlist_sources` optionally scopes a watchlist to specific sources.

## `DEFAULT_WATCHLISTS`

The engine ships eight neutral default watchlists (`@hsi/source-intelligence`):

| Watchlist | Severity | Example terms |
|-----------|----------|---------------|
| Extinctionism | HIGH | extinctionism, human extinction, vhemt, omnicide |
| Antinatalism | MEDIUM | antinatalism, cease procreation, birth is harm |
| Efilism | HIGH | efilism, sentience abolition, red button |
| Promortalism | HIGH | promortalism, better off dead, death is preferable |
| Population Reduction | HIGH | population reduction, depopulation, overpopulation crisis |
| Technocratic Governance | MEDIUM | technocracy, rule by experts, social credit |
| AI Governance | MEDIUM | ai governance, ai safety, ai alignment, superintelligence |
| Collapse Narratives | MEDIUM | societal collapse, collapsology, systemic collapse |
| Doom Narratives | LOW | doomer, we are doomed, end times, no future |

The `alertGenerator` worker job scans recent signals against `DEFAULT_WATCHLISTS` plus
any injected custom watchlists.

## Creating watchlists

`createWatchlistAction({ name, description?, severity?, terms? })` (role `researcher`+,
`created_by = auth.uid()`). Scope a source to a watchlist with
`addWatchlistSourceAction(watchlistId, sourceId)` (or, equivalently,
`addSourceToWatchlistAction(sourceId, watchlistId)`).

## Matching

`matchWatchlists(signal, watchlists)` collects, per watchlist, the matched terms and a
`score = matched / total terms`, carrying the watchlist's severity. Matches are returned
strongest-first (severity, then score). The signal-list filter (`listSignals`'s
`watchlistId`) reuses a watchlist's terms to filter signals.

## Alert severities

`generateAlerts` maps conditions to severities:

| Condition | Severity |
|-----------|----------|
| `new_signal` | MEDIUM if confidence ≥ 0.7, else LOW |
| `source_changed` (major only) | MEDIUM |
| `narrative_shift` | HIGH |
| `watchlist_match` | the watchlist's own severity |
| `high_risk_signal` | CRITICAL when a HIGH/CRITICAL watchlist matches a high-confidence signal; else HIGH |

Every alert carries an `explanation` and is a **draft** for human review.

Alerts are triaged with `acknowledgeAlertAction` (→ `acknowledged`) and
`escalateAlertAction` (→ `escalated`, + a `review_queues` entry).
