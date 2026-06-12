// =============================================================================
// @hsi/publishing-engine — the explainable intelligence REPORT builder.
//
// buildIntelligenceReport() assembles the 12 canonical sections — Executive
// Summary, Evidence, Temporal, Causal, Counterfactual, Decision, Outcome,
// Calibration, Trust, Governance, Limitations, Provenance. Every section reports
// whether it is SOURCED (backed by ≥1 reference); a missing section becomes an
// explicit caveat rather than vanishing. NO black-box content — the report
// always carries its limitations + provenance.
// =============================================================================

import type { IntelligenceReport, ReportInput, ReportSection } from './types';

function section(
  key: string,
  title: string,
  body: string | undefined,
  sourced: boolean,
  items?: string[],
): ReportSection {
  const has = Boolean(body && body.trim().length > 0) || (items && items.length > 0);
  return {
    key,
    title,
    body: has ? (body ?? '').trim() : `Not available — ${title.toLowerCase()} was not supplied for this report.`,
    ...(items && items.length > 0 ? { items: items.slice() } : {}),
    sourced: Boolean(has && sourced),
  };
}

/**
 * Build a full intelligence report. Deterministic — pass `now` via opts. Every
 * section is present (absent inputs become explicit caveats); Limitations +
 * Provenance are ALWAYS populated. Inputs not mutated.
 */
export function buildIntelligenceReport(
  input: ReportInput,
  opts: { now: string },
): IntelligenceReport {
  const sourceRefs = input.sourceRefs ? input.sourceRefs.slice() : [];
  const hasSources = sourceRefs.length > 0;

  const limitations =
    input.limitations && input.limitations.length > 0
      ? input.limitations.slice()
      : ['No explicit limitations were supplied; treat all conclusions as provisional and corroborate independently.'];

  const provenance =
    input.provenance && input.provenance.length > 0
      ? input.provenance.slice()
      : hasSources
        ? sourceRefs.map((r) => `Derived from ${r}.`)
        : ['Provenance not supplied — this report cannot be fully traced and should not be relied upon.'];

  const sections: ReportSection[] = [
    section('executive_summary', 'Executive Summary', input.summary, hasSources),
    section('evidence', 'Evidence', input.evidence?.join('\n'), hasSources, input.evidence),
    section('temporal', 'Temporal Analysis', input.temporal, hasSources),
    section('causal', 'Causal Analysis', input.causal, hasSources),
    section('counterfactual', 'Counterfactual Analysis', input.counterfactual, hasSources),
    section('decision', 'Decision Analysis', input.decision, hasSources),
    section('outcome', 'Outcome Tracking', input.outcome, hasSources),
    section('calibration', 'Calibration', input.calibration, hasSources),
    section('trust', 'Trust', input.trust, hasSources),
    section('governance', 'Governance', input.governance, hasSources),
    // Limitations + Provenance are ALWAYS sourced=true (they are meta, always present).
    section('limitations', 'Limitations', limitations.join('\n'), true, limitations),
    section('provenance', 'Provenance', provenance.join('\n'), true, provenance),
  ];

  return {
    publicationId: input.publicationId,
    title: input.title,
    sections,
    sourceRefs,
    generatedAt: opts.now,
  };
}

/** True when every NON-meta section of a report is backed by a source. */
export function isFullySourced(report: IntelligenceReport): boolean {
  return report.sections
    .filter((s) => s.key !== 'limitations' && s.key !== 'provenance')
    .every((s) => s.sourced || s.body.startsWith('Not available'));
}
