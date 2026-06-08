// =============================================================================
// @hsi/source-intelligence — alert engine.
//
// Maps engine conditions (a new signal, a source change, a narrative drift,
// watchlist matches) to AlertDraft[]. EVERY alert carries an `explanation` —
// alerts MUST be explainable (spec). Alerts are DRAFTS for the review/governance
// pipeline and are NEVER auto-published or acted upon automatically.
//
// SEVERITY RULES (documented):
//   new_signal      → MEDIUM if confidence ≥ 0.7, else LOW.
//   source_changed  → MEDIUM for a 'major' change; otherwise no alert.
//   narrative_shift → HIGH (a shifting narrative is materially important).
//   watchlist_match → the watchlist's own severity (per-list).
//   high_risk_signal→ CRITICAL when a HIGH/CRITICAL watchlist also matches a
//                     high-confidence signal; else HIGH for any HIGH+ match.
// =============================================================================

import { round, snippet } from '../internal/text';
import type {
  AlertDraft,
  AlertSeverity,
  ChangeResult,
  NarrativeDriftEvent,
  SignalDraft,
  WatchlistMatch,
} from '../types';

export interface GenerateAlertsInput {
  signal?: SignalDraft;
  change?: ChangeResult;
  drift?: NarrativeDriftEvent;
  watchlistMatches?: WatchlistMatch[];
  sourceId?: string;
  signalId?: string;
  now: string;
}

const SEV_RANK: Record<AlertSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return SEV_RANK[a] >= SEV_RANK[b] ? a : b;
}

/**
 * Generate explainable AlertDrafts for the supplied conditions. Deterministic;
 * `now` is injected. Returns [] when nothing warrants an alert.
 */
export function generateAlerts(input: GenerateAlertsInput): AlertDraft[] {
  const { signal, change, drift, watchlistMatches, sourceId, signalId, now } = input;
  const alerts: AlertDraft[] = [];

  // --- new_signal -----------------------------------------------------------
  if (signal) {
    const severity: AlertSeverity = signal.confidence >= 0.7 ? 'MEDIUM' : 'LOW';
    alerts.push({
      signalId,
      sourceId: sourceId ?? signal.sourceId,
      alertType: 'new_signal',
      severity,
      title: `New signal: ${snippet(signal.title, 80)}`,
      explanation:
        `A new "${signal.signalCategory}" signal was captured ` +
        `(type ${signal.signalType}, confidence ${round(signal.confidence)}). ` +
        `Severity ${severity} because confidence ${signal.confidence >= 0.7 ? '≥' : '<'} 0.7. ` +
        `Draft only — pending human review.`,
      createdAt: now,
    });
  }

  // --- source_changed (only when 'major') -----------------------------------
  if (change && change.changeType === 'major') {
    alerts.push({
      signalId,
      sourceId,
      alertType: 'source_changed',
      severity: 'MEDIUM',
      title: 'Source changed substantially',
      explanation:
        `Monitored source content changed materially (${change.summary}). ` +
        `Similarity ${round(change.similarity)} fell below the major-change threshold. ` +
        `Flagged MEDIUM for review.`,
      createdAt: now,
    });
  }

  // --- narrative_shift ------------------------------------------------------
  if (drift) {
    alerts.push({
      signalId,
      sourceId,
      alertType: 'narrative_shift',
      severity: 'HIGH',
      title: 'Narrative shift detected',
      explanation:
        `${drift.explanation} ` +
        `Confidence ${round(drift.confidence)}. Narrative shifts are flagged HIGH ` +
        `as they may indicate an evolving campaign or framing — pending review.`,
      createdAt: now,
    });
  }

  // --- watchlist_match (+ possible high_risk_signal escalation) -------------
  if (watchlistMatches && watchlistMatches.length > 0) {
    let topWatchlistSeverity: AlertSeverity = 'LOW';
    for (const m of watchlistMatches) {
      topWatchlistSeverity = maxSeverity(topWatchlistSeverity, m.severity);
      alerts.push({
        signalId,
        sourceId,
        alertType: 'watchlist_match',
        severity: m.severity,
        title: `Watchlist match: ${m.watchlistName}`,
        explanation:
          `Signal matched watchlist "${m.watchlistName}" on ` +
          `${m.matchedTerms.length} term(s) [${snippet(m.matchedTerms.join(', '), 80)}], ` +
          `score ${round(m.score)}. Severity ${m.severity} per the watchlist definition. ` +
          `A match flags a PUBLIC topic for review — it is not an accusation.`,
        createdAt: now,
      });
    }

    // high_risk_signal escalation.
    const hasHighPlus = SEV_RANK[topWatchlistSeverity] >= SEV_RANK.HIGH;
    if (hasHighPlus) {
      const highConfidence = signal ? signal.confidence >= 0.7 : false;
      const severity: AlertSeverity = highConfidence ? 'CRITICAL' : 'HIGH';
      alerts.push({
        signalId,
        sourceId,
        alertType: 'high_risk_signal',
        severity,
        title: 'High-risk signal',
        explanation:
          `A HIGH/CRITICAL watchlist ("${topWatchlistSeverity}") matched this signal` +
          (signal ? ` at confidence ${round(signal.confidence)}` : '') +
          `. Escalated to ${severity} ` +
          `(${highConfidence ? 'high-confidence signal → CRITICAL' : 'no/low-confidence signal → HIGH'}). ` +
          `Routed for priority human review — never auto-actioned.`,
        createdAt: now,
      });
    }
  }

  return alerts;
}
