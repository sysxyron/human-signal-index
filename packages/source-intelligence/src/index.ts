// =============================================================================
// @hsi/source-intelligence — public API (Phase 7: Human Signal Intelligence).
//
// The signal-intake/monitoring engine for WorldForge/HSI. It continuously
// observes PUBLIC signals and prepares them — as DRAFTS — for the
// evidence/governance/review pipeline. It NEVER auto-publishes and NEVER acts
// automatically; a human decides.
//
// ETHICS (binding): PUBLIC information only; never behind logins; no private
// communities; no doxxing; no harassment. assertPublicCapturePolicy guards
// every capture. Determinism: callers inject `now`; network is gated/injected
// and never touched at import time; the engine runs fully offline via fixtures.
//
// __examples__
//   import { runIntakePipeline, FixtureCaptureProvider, DEMO_SOURCES } from '@hsi/source-intelligence';
//   const fx = new FixtureCaptureProvider('website');
//   const out = await runIntakePipeline(DEMO_SOURCES[1], { extraProviders: [fx] }, '2026-01-01T00:00:00.000Z');
//   out.alerts.forEach((a) => console.log(a.severity, a.title, '-', a.explanation));
// =============================================================================

import { type CaptureProviderOptions, captureSource } from './capture';
import { type CaptureDeps } from './capture/fetchDeps';
import { classifySignal } from './classify';
import { detectChange } from './monitor';
import { generateAlerts } from './alerts';
import { matchWatchlists } from './watchlists';
import { DEFAULT_WATCHLISTS } from './watchlists';
import { sha256Hex } from './internal/hash';
import type {
  CaptureResult,
  CapturedDoc,
  ChangeResult,
  Classification,
  SignalDraft,
  SourceInput,
  WatchlistDef,
  WatchlistMatch,
} from './types';
import type { RegisteredSource } from './registry';

// ---- Re-exports -------------------------------------------------------------
export * from './types';
export * from './policy';
export * from './registry';
export * from './capture';
export * from './monitor';
export * from './classify';
export { CATEGORY_LEXICONS, SIGNAL_TYPE_BY_SOURCE } from './classify/lexicons';
export type { CategoryLexicon } from './classify/lexicons';
export * from './drift';
export * from './alerts';
export * from './watchlists';
export * from './fixtures';
// ---- Phase 8 (additive): semantic / graph / triage / sla -------------------
// These ENRICH Phase-7 without modifying it. Semantic classification +
// narrative clustering, the narrative/entity graph, the triage rule-engine, and
// SLA deadline math. All deterministic + offline; embeddings only via an
// injected `embed` fn (graceful lexical fallback otherwise).
export * from './semantic';
export * from './graph';
export * from './triage';
export * from './sla';
export { sha256Hex, fnv1a } from './internal/hash';
export {
  htmlToText,
  textSimilarity,
  jaccard,
  tokenize,
  tokenSet,
  shingles,
} from './internal/text';

/** Options for the end-to-end intake pipeline. */
export interface IntakePipelineOptions extends CaptureProviderOptions {
  /** Capture deps (injected/gated fetch). Omit for offline + fixtures. */
  captureDeps?: CaptureDeps;
  /** Prior capture for change detection (null = first observation). */
  prior?: CapturedDoc | string | null;
  /** Watchlists to match (defaults to DEFAULT_WATCHLISTS). */
  watchlists?: WatchlistDef[];
  /** Extra custom classifier categories. */
  extraCategories?: string[];
}

/** Result of the end-to-end intake pipeline. */
export interface IntakePipelineResult {
  capture: CaptureResult;
  signalDraft?: SignalDraft;
  change: ChangeResult | null;
  classification?: Classification;
  matches: WatchlistMatch[];
  alerts: ReturnType<typeof generateAlerts>;
}

/**
 * Run the full intake pipeline for one source:
 *   capture → detectChange (vs prior) → classifySignal → matchWatchlists →
 *   generateAlerts.
 *
 * Deterministic with fixtures; NEVER throws (errors surface in `capture`).
 * Produces DRAFTS only — nothing is published or actioned.
 */
export async function runIntakePipeline(
  source: SourceInput | RegisteredSource,
  options: IntakePipelineOptions = {},
  now: string = '1970-01-01T00:00:00.000Z',
): Promise<IntakePipelineResult> {
  const watchlists = options.watchlists ?? DEFAULT_WATCHLISTS;

  // (1) Capture — routed by sourceType; offline when using fixtures.
  const capture = await captureSource(
    source,
    options.captureDeps,
    { extraProviders: options.extraProviders },
    now,
  );

  if (!capture.ok || !capture.doc) {
    return { capture, change: null, matches: [], alerts: [] };
  }
  const doc = capture.doc;

  // (2) Change detection vs the prior capture (null => 'new').
  const change = detectChange(options.prior ?? null, doc);

  // (3) Classify the captured content into a signal.
  const classification = classifySignal(
    {
      title: doc.title ?? source.name,
      bodyText: doc.bodyText,
      sourceType: String(source.sourceType),
      extraCategories: options.extraCategories,
    },
    now,
  );

  const signalDraft: SignalDraft = {
    sourceId: 'id' in source ? source.id : undefined,
    title: doc.title ?? source.name,
    summary: doc.metaDescription,
    rawContent: doc.bodyText,
    contentHash: doc.contentHash ?? (await sha256Hex(doc.bodyText)),
    signalType: classification.signalType,
    signalCategory: classification.signalCategory,
    confidence: classification.confidence,
    capturedAt: now,
  };

  // (4) Watchlist matching against the captured signal.
  const matches = matchWatchlists(
    {
      title: signalDraft.title,
      summary: signalDraft.summary,
      rawContent: signalDraft.rawContent,
      category: signalDraft.signalCategory,
    },
    watchlists,
  );

  // (5) Alerts — explainable drafts for review. Source change only alerts on
  //     'major'; a brand-new observation is conveyed via the new_signal alert.
  const alerts = generateAlerts({
    signal: signalDraft,
    change: change.changeType === 'major' ? change : undefined,
    watchlistMatches: matches,
    sourceId: signalDraft.sourceId,
    now,
  });

  return { capture, signalDraft, change, classification, matches, alerts };
}
