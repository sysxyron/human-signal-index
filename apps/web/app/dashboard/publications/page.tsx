// =============================================================================
// WorldForge Phase 6 — PUBLICATIONS list (Server Component, force-dynamic).
// listPublicationsAction() -> a grid of PublicationCards (title/entity,
// visibility badge, published_by, published_at, latest_version), each linking
// to its detail page. Error / empty / not-configured handling.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { FileBarChart, AlertTriangle } from 'lucide-react';
import { listPublicationsAction } from '../review/actions';
import { PublicationCard } from '@/components/governance/PublicationCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PublicationsPage() {
  const res = await listPublicationsAction();

  return (
    <>
      <TopNav title="Publications" subtitle="Published reports &amp; their versions" />
      <main className="space-y-6 p-5 lg:p-6">
        {!res.ok ? (
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <AlertTriangle className="h-5 w-5" /> Could not load publications
            </h3>
            <p className="text-body-sm text-text-secondary">{res.error}</p>
            {res.code === 'NOT_CONFIGURED' ? (
              <p className="text-caption text-text-muted">
                Supabase is not configured in this environment.
              </p>
            ) : res.code === 'AUTH_REQUIRED' ? (
              <Link
                href="/sign-in?redirectedFrom=/dashboard/publications"
                className="text-caption font-semibold text-electric hover:text-white"
              >
                Sign in to view publications →
              </Link>
            ) : null}
          </Card>
        ) : res.data.length === 0 ? (
          <Card className="space-y-2" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <FileBarChart className="h-5 w-5 text-electric" /> No publications yet
            </h3>
            <p className="text-body-sm text-text-secondary">
              Approved entities published from the{' '}
              <Link href="/dashboard/curation" className="font-semibold text-electric hover:text-white">
                Curation dashboard
              </Link>{' '}
              appear here with full version history.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {res.data.map((record) => (
              <PublicationCard key={record.id} record={record} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
