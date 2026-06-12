// =============================================================================
// HSI Phase 19 — Public Search (/search). PUBLIC, force-dynamic.
// searchPublicAction(query, filters) searches published reports + topics with
// optional topic/category/min-trust filters. Anonymous-accessible.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { PageHeader, Section } from '../../../components/page-header';
import { SearchIcon } from 'lucide-react';
import type { SearchResultsData } from '@hsi/shared-types';
import { searchPublicAction } from '@/lib/publishing/actions';
import { demoSearchResults } from '@/lib/publishing/view';
import { PublicationCard } from '@/components/publishing/PublicationCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Search Intelligence' };

export default async function SearchPage({ searchParams }: { searchParams: { q?: string; topic?: string; minTrust?: string } }) {
  const query = searchParams.q?.trim() ?? '';
  const minTrust = searchParams.minTrust ? Number(searchParams.minTrust) : undefined;
  const filters = {
    ...(searchParams.topic ? { topic: searchParams.topic } : {}),
    ...(minTrust !== undefined && !Number.isNaN(minTrust) ? { minTrust } : {}),
  };
  const res = await searchPublicAction(query, filters);

  let data: SearchResultsData;
  let isDemo = false;
  if (res.ok) data = res.data;
  else {
    data = demoSearchResults(query);
    isDemo = res.code === 'NOT_CONFIGURED';
  }

  return (
    <>
      <PageHeader eyebrow="Search" title="Search published intelligence" description="Find reports, topics, and conclusions across the public intelligence library." />
      <Section>
        <form action="/search" method="get" className="mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input name="q" defaultValue={query} placeholder="Search reports, topics, evidence…"
              className="w-full rounded-card border border-border bg-surface px-3 py-2 pl-9 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
          </div>
          <select name="minTrust" defaultValue={minTrust !== undefined ? String(minTrust) : ''}
            className="rounded-card border border-border bg-surface px-2 py-2 text-caption text-text-primary focus:border-electric focus:outline-none">
            <option value="">Any trust</option>
            <option value="40">Trust ≥ 40</option>
            <option value="60">Trust ≥ 60</option>
            <option value="70">Trust ≥ 70</option>
          </select>
          <button type="submit" className="rounded-card bg-primary px-4 py-2 text-caption font-semibold text-white">Search</button>
        </form>

        {isDemo ? (
          <p className="mb-4 rounded-card border border-warning/40 bg-warning/5 px-3 py-2 text-caption text-warning">
            Showing demo content — connect Supabase to search live intelligence.
          </p>
        ) : null}

        <p className="mb-4 text-caption text-text-muted">
          {data.total} result{data.total === 1 ? '' : 's'}{query ? ` for “${query}”` : ''}.
        </p>

        {data.topics.length > 0 ? (
          <div className="mb-6 flex flex-wrap gap-1.5">
            <span className="text-caption text-text-muted">Topics:</span>
            {data.topics.map((t) => (
              <Link key={t.slug} href={`/topics/${t.slug}` as never} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-text-secondary hover:text-text-primary">
                {t.title}
              </Link>
            ))}
          </div>
        ) : null}

        {data.publications.length === 0 ? (
          <p className="text-caption text-text-muted">No matching published reports.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.publications.map((item) => <PublicationCard key={item.slug} item={item} />)}
          </div>
        )}
      </Section>
    </>
  );
}
