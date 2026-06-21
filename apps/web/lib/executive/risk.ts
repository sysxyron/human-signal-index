// =============================================================================
// HSI Phase 74 — Risk monitoring (PURE, deterministic). Eight risk categories,
// each GREEN/YELLOW/RED via thresholds documented in code (reusing the Phase 73
// mission helpers). Transparent rules, no hidden scoring. No I/O.
// =============================================================================

import { ratioStatus, inverseRatioStatus, backlogStatus } from '../operations-center/mission';
import type { RiskCard, RiskStatus, RiskCategory } from './types';

export interface RiskInputs {
  narrativesMissingEvidence: number; narrativesTotal: number;
  signalsWithEvidence: number; totalSignals: number;
  trustLow: number; trustObserved: number;
  forecastDiverging: number; forecastMissed: number; forecastTotal: number;
  attentionCritical: number;
  sourcesOffline: number; sourcesTotal: number;
  reviewBacklog: number;
  geoReady: number; sourcesAll: number;
}

function card(category: RiskCategory, label: string, status: RiskStatus, detail: string): RiskCard {
  return { category, label, status, detail };
}

export function computeRisks(i: RiskInputs): RiskCard[] {
  return [
    card('narrative', 'Narrative Risk', inverseRatioStatus(i.narrativesMissingEvidence, i.narrativesTotal),
      `${i.narrativesMissingEvidence}/${i.narrativesTotal} narratives lack corroborating evidence.`),
    card('trust', 'Trust Risk', inverseRatioStatus(i.trustLow, i.trustObserved),
      `${i.trustLow}/${i.trustObserved} scored sources are low-trust.`),
    card('evidence', 'Evidence Risk', ratioStatus(i.signalsWithEvidence, i.totalSignals),
      `${i.signalsWithEvidence}/${i.totalSignals} signals have linked evidence.`),
    card('forecast', 'Forecast Risk', inverseRatioStatus(i.forecastDiverging + i.forecastMissed, i.forecastTotal),
      `${i.forecastDiverging + i.forecastMissed}/${i.forecastTotal} forecasts diverging or missed.`),
    card('operational', 'Operational Risk', backlogStatus(i.attentionCritical, 0, 2),
      `${i.attentionCritical} critical attention item(s) open.`),
    card('collection', 'Collection Risk', inverseRatioStatus(i.sourcesOffline, i.sourcesTotal),
      `${i.sourcesOffline}/${i.sourcesTotal} sources offline or blocked.`),
    card('review', 'Review Risk', backlogStatus(i.reviewBacklog, 10, 50),
      `${i.reviewBacklog} item(s) awaiting review.`),
    card('geo', 'Geo Risk', ratioStatus(i.geoReady, i.sourcesAll),
      `${i.geoReady}/${i.sourcesAll} sources are map-ready.`),
  ];
}

const RANK: Record<RiskStatus, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
/** Overall posture = worst category. Empty → YELLOW. */
export function overallRisk(cards: RiskCard[]): RiskStatus {
  if (cards.length === 0) return 'YELLOW';
  return cards.reduce<RiskStatus>((worst, c) => (RANK[c.status] > RANK[worst] ? c.status : worst), 'GREEN');
}
