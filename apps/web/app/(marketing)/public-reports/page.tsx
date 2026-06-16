// =============================================================================
// HSI Phase 41B — Public Reports (/public-reports). PUBLIC, force-dynamic.
//
// Beta bug A: /public-reports 404'd. It now renders the published public reports
// (PUBLISHED + RETRACTED, RLS-gated, anonymous-safe) reusing the publishing read
// path + PublicationCard, with a clear empty state. Mirrors /intelligence.
// =============================================================================

import Link from 'next/link';
import { PageHeader, Section } from '../../../components/page-header';
import type { PublicIntelligenceData } from '@hsi/shared-types';
import { getPublicIntelligenceAction } from '@/lib/publishing/actions';
import { demoPublicIntelligence } from '@/lib/publishing/view';
import { PublicationCard } from '@/components/publishing/PublicationCard';

import type { Metadata } from 'next';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = {
  title: 'Public Reports',
  description:
    'Published, human-approved intelligence reports from Human Signal Index, each with a verifiable evidence chain. Retractions remain visible.',
  alternates: { canonical: '/public-reports' },
};

export default async function PublicReportsPage() {
  const res = await getPublicIntelligenceAction();

  let data: PublicIntelligenceData;
  let isDemo = false;
  if (res.ok) data = res.data;
  else {
    data = demoPublicIntelligence();
    isDemo = res.code === 'NOT_CONFIGURED';
  }

  return (
    <>
      <PageHeader
        eyebrow="Public reports"
        title="Published public reports"
        description="Human-approved, evidence-backed intelligence reports HSI has published. Every conclusion is explainable and traceable; retractions remain visible."
      />
      <Section>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Link href={'/intelligence' as never} className="rounded-full border border-border px-3 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary">
            Browse by topic →
          </Link>
          <Link href={'/search' as never} className="rounded-full border border-border px-3 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary">
            Search →
          </Link>
        </div>

        {isDemo ? (
          <p className="mb-4 rounded-card border border-warning/40 bg-warning/5 px-3 py-2 text-caption text-warning">
            Showing demo content — connect Supabase to surface live published reports.
          </p>
        ) : null}

        {data.items.length === 0 ? (
          <div className="rounded-card border border-border bg-surface/60 p-8 text-center">
            <p className="text-body-sm font-semibold text-text-primary">No public reports published yet</p>
            <p className="mt-1 text-caption text-text-muted">
              Approved intelligence reports will appear here once published. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((item) => <PublicationCard key={item.slug} item={item} />)}
          </div>
        )}
      </Section>
    </>
  );
}
