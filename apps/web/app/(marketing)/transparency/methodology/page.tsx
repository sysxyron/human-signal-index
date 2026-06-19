// =============================================================================
// HSI Phase 68 — Trust methodology (/transparency/methodology). PUBLIC, static.
// Explains exactly how each score is calculated, what data is used, the limits,
// and the confidence bands. No marketing language, no hype, no black boxes.
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { TransparencyNav } from '@/components/transparency/panels';

export const metadata: Metadata = {
  title: 'Trust Methodology',
  description: 'Exactly how HSI computes source reliability, evidence relationships, narrative health, forecast accuracy, and calibration — including the data used and the limits.',
  alternates: { canonical: '/transparency/methodology' },
};

function Method({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2">
      <h2 className="text-h6 font-semibold text-text-primary">{title}</h2>
      <div className="space-y-2 text-body-sm text-text-secondary">{children}</div>
    </Card>
  );
}

export default function MethodologyPage() {
  return (
    <>
      <PageHeader eyebrow="Transparency" title="How the numbers are calculated" description="Every score below is computed deterministically from recorded data. There are no AI-generated trust scores and no hidden calculations. Where data is insufficient, we say so rather than fabricate a number." />
      <Section><TransparencyNav active="/transparency/methodology" /></Section>

      <Section className="pt-0 space-y-4">
        <Method title="Source Reliability">
          <p>Each source's health score (0–100) is computed from observed capture telemetry: <strong>success rate ×0.6 + parse success ×0.2 + recency ×0.2</strong>, minus a penalty for consecutive failures. Bands: 95–100 Excellent · 80–94 Healthy · 60–79 At&nbsp;Risk · &lt;60 Failing.</p>
          <p>Data used: capture-event success/failure history and last-success age. Limit: a source with too few captures reports as unknown rather than a confident score. HSI observes sources and reports protection (Cloudflare, login walls); it never bypasses them.</p>
        </Method>

        <Method title="Evidence Graph">
          <p>Relationships between sources, signals, evidence, claims, reports, and corrections are built <strong>deterministically from real foreign keys and recorded tallies</strong> — never inferred by a model. Every edge carries provenance (the exact fact it came from) and a confidence: explicit links are 1.0; stance edges use the recorded support/challenge share.</p>
          <p>Limit: relationships without a recorded link are not created — absence of an edge means absence of evidence, not a hidden judgement.</p>
        </Method>

        <Method title="Narrative Engine">
          <p>A narrative is a cluster of graph members expanded deterministically from a seed over real edges. Its stability score weights <strong>coverage, source diversity, evidence density, low contradiction, and size</strong>, minus failing-source penalties. Source diversity and actor diversity saturate (more distinct entities → closer to 1).</p>
          <p>Data used: the evidence graph + source monitoring. Limit: narratives are human-seeded; the engine only expands and scores membership — it does not invent narratives, assign opinions, or score truth.</p>
        </Method>

        <Method title="Forecast Validation">
          <p>Forecasts are recorded before outcomes are known, then evaluated against reality. For probability forecasts we use the <strong>Brier score</strong> (squared error); a forecast is correct when its stated side matches the outcome. Calibration compares stated confidence against actual accuracy per confidence band; the calibration score is <strong>1 − mean |predicted − actual|</strong> (1.0 = perfectly calibrated).</p>
          <p>Confidence bands: 0.0–0.1 … 0.9–1.0. Data used: recorded predictions + recorded outcomes only. Limit: there are no AI predictions — humans/agents record the forecast; the engine only scores it. Unresolved and expired forecasts are reported as such, never counted as correct.</p>
        </Method>

        <Method title="Agent Automation">
          <p>Operational agents automate analysis with fixed, deterministic rules over the systems above. Every agent run, action, and finding is recorded and reproducible. Agents <strong>never publish, review evidence, moderate, or change trust scores</strong> — they observe and report.</p>
        </Method>

        <Method title="Limitations">
          <p>These metrics describe HSI's <em>process</em> and <em>track record</em>, not absolute truth. Counts reflect published/aggregate data only; unpublished items, private evidence, reviewer identities, and internal notes are never exposed here. When the underlying data is too thin to support a score, the portal shows "—" or 0 rather than a fabricated value.</p>
        </Method>
      </Section>
    </>
  );
}
