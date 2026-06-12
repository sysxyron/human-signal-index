// =============================================================================
// HSI Phase 19 — Public Topic page (/topics/[slug]). PUBLIC, force-dynamic.
// getTopicPageAction(slug) aggregates published reports for a topic (History,
// Archaeology, Anthropology, Genetics, Civilizations, Religion, Technology, …)
// with report count, average trust, and total evidence. Anonymous-accessible.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { PageHeader, Section } from '../../../../components/page-header';
import type { TopicPageData } from '@hsi/shared-types';
import { getTopicPageAction } from '@/lib/publishing/actions';
import { demoTopicPage, formatTrust, PUBLIC_TOPICS } from '@/lib/publishing/view';
import { PublicationCard } from '@/components/publishing/PublicationCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TopicPage({ params }: { params: { slug: string } }) {
  const res = await getTopicPageAction(params.slug);

  let data: TopicPageData;
  let isDemo = false;
  if (res.ok) data = res.data;
  else {
    data = demoTopicPage(params.slug);
    isDemo = res.code === 'NOT_CONFIGURED';
  }

  return (
    <>
      <PageHeader
        eyebrow="Topic"
        title={data.title}
        description={data.description ?? `Published intelligence on ${data.title}.`}
      />
      <Section>
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Stat label="Reports" value={String(data.reportCount)} />
          <Stat label="Avg trust" value={formatTrust(data.avgTrust)} />
          <Stat label="Evidence items" value={String(data.evidenceTotal)} />
          <div className="ml-auto flex flex-wrap gap-1.5">
            {PUBLIC_TOPICS.filter((t) => t.slug !== params.slug).slice(0, 5).map((t) => (
              <Link key={t.slug} href={`/topics/${t.slug}` as never} className="rounded-full border border-border px-2.5 py-1 text-caption text-text-secondary hover:text-text-primary">
                {t.title}
              </Link>
            ))}
          </div>
        </div>

        {isDemo ? (
          <p className="mb-4 rounded-card border border-warning/40 bg-warning/5 px-3 py-2 text-caption text-warning">
            Showing demo content — connect Supabase to surface live reports.
          </p>
        ) : null}

        {data.reports.length === 0 ? (
          <p className="text-caption text-text-muted">No published reports for this topic yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.reports.map((item) => <PublicationCard key={item.slug} item={item} />)}
          </div>
        )}
      </Section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/50 px-4 py-2">
      <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 text-h6 font-bold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}
