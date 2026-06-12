// =============================================================================
// HSI Phase 19 — Public Intelligence Portal (/intelligence). PUBLIC, force-dynamic.
// getPublicIntelligenceAction() returns the published intelligence library (PUBLISHED
// + RETRACTED, RLS-gated so anonymous visitors see only public reports). Each card
// shows title, summary, trust score, confidence, evidence/source counts, published
// date, review/governance status, and topics. Filterable by topic via ?topic=.
//
// Offline (NOT_CONFIGURED) → labeled demo. Anonymous-accessible.
// =============================================================================

import Link from 'next/link';
import { PageHeader, Section } from '../../../components/page-header';
import type { PublicIntelligenceData } from '@hsi/shared-types';
import { getPublicIntelligenceAction } from '@/lib/publishing/actions';
import { demoPublicIntelligence, PUBLIC_TOPICS } from '@/lib/publishing/view';
import { PublicationCard } from '@/components/publishing/PublicationCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Published Intelligence' };

export default async function IntelligencePortalPage({ searchParams }: { searchParams: { topic?: string } }) {
  const topic = searchParams.topic?.trim() || undefined;
  const res = await getPublicIntelligenceAction(topic ? { topic } : undefined);

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
        eyebrow="Public intelligence"
        title="Published intelligence"
        description="Trust-aware, evidence-backed reports — every conclusion explainable, traceable, and human-approved. Retractions remain visible."
      />
      <Section>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Link href={'/intelligence' as never} className="rounded-full px-3 py-1 text-caption font-semibold transition"
            style={!topic ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' } : { color: '#94A3B8', border: '1px solid #2A3A5C' }}>
            All
          </Link>
          {PUBLIC_TOPICS.map((t) => (
            <Link key={t.slug} href={`/intelligence?topic=${t.slug}` as never} className="rounded-full px-3 py-1 text-caption font-semibold transition"
              style={topic === t.slug ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' } : { color: '#94A3B8', border: '1px solid #2A3A5C' }}>
              {t.title}
            </Link>
          ))}
          <Link href={'/search' as never} className="ml-auto rounded-full border border-border px-3 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary">
            Search →
          </Link>
        </div>

        {isDemo ? (
          <p className="mb-4 rounded-card border border-warning/40 bg-warning/5 px-3 py-2 text-caption text-warning">
            Showing demo content — connect Supabase to surface live published intelligence.
          </p>
        ) : null}

        {data.items.length === 0 ? (
          <p className="text-caption text-text-muted">No published intelligence yet{topic ? ` for “${topic}”` : ''}.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((item) => <PublicationCard key={item.slug} item={item} />)}
          </div>
        )}
      </Section>
    </>
  );
}
