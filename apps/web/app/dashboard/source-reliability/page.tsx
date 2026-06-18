// =============================================================================
// HSI Phase 61 — Source Reliability & Crawl Orchestration.
//
// Read-only operational observability over the EXISTING ingestion system: source
// health/score, crawl schedule, retry/backoff, block detection, collection
// analytics, dependency risks, and an executive trust summary. No ingestion
// logic, no scheduling edits, no scraping workarounds — visibility only.
// Gated reviewer+ via middleware (PROTECTED_ROUTES), matching Source Registry.
// =============================================================================

import { DashboardPage } from '../../../components/dashboard-shell';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';
import { ReadOnlyNotice } from '@/components/navigation/ReadOnlyNotice';
import { getSourceReliability } from '@/lib/source-reliability';
import { SourceReliabilitySurfaces } from '@/components/source-reliability/panels';

export default async function SourceReliabilityPage() {
  const data = await getSourceReliability();

  return (
    <DashboardPage
      title="Source Reliability"
      subtitle="Crawl orchestration observatory — is our collection network healthy, scheduled, and trustworthy?"
      actions={<SafeActionButton variant="secondary" href="/dashboard/source-registry">Source Registry</SafeActionButton>}
    >
      <div className="space-y-8">
        <ReadOnlyNotice
          title="This is an observability layer, not an ingestion control panel"
          points={[
            'Health, scores, schedules, and blocks are measured from existing capture logs — nothing here fetches, retries, or edits a source.',
            'HSI respects robots.txt and terms of service: protected/login-gated sources are reported, never bypassed.',
            'To add or configure sources, use the Source Registry; capture cadence is managed by the ingestion system.',
          ]}
          actions={[{ label: 'Open Source Registry', href: '/dashboard/source-registry' }]}
        />
        <SourceReliabilitySurfaces data={data} />
      </div>
    </DashboardPage>
  );
}
