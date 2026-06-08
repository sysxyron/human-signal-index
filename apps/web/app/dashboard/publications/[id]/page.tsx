// =============================================================================
// WorldForge Phase 6 — PUBLICATION detail (Server Component, force-dynamic).
// getPublicationAction(id) -> record + versions. Renders the PUBLIC REPORT
// BUILDER output (latest snapshot_json as a PublicReportDraft via
// PublicReportView), the VERSION HISTORY + DIFF VIEW (PublicationVersionDiff),
// and curator actions (Republish + visibility change via PublicationActions).
// Auth + role gated; error / empty handling.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { FileBarChart, AlertTriangle, User, History } from 'lucide-react';
import type { PublicationRecord, PublicationVersionRecord } from '@hsi/shared-types';
import { getUser, getSessionRole } from '@/lib/supabase/server';
import { getPublicationAction } from '../../review/actions';
import { VisibilityBadge } from '@/components/governance/VisibilityBadge';
import { PublicReportView } from '@/components/governance/PublicReportView';
import { PublicationVersionDiff } from '@/components/governance/PublicationVersionDiff';
import { PublicationActions } from '@/components/governance/PublicationActions';
import { CommentThread } from '@/components/governance/CommentThread';
import { entityLabel, fmtDate, type PublicationVisibility } from '@/lib/governance/view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** The detail action returns the record plus its versions; read tolerantly so
 *  small shape drift (record/publication, versions key) doesn't break the page. */
interface PublicationDetail {
  record: PublicationRecord;
  versions: PublicationVersionRecord[];
}

function readDetail(data: unknown): PublicationDetail | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const record = (d.record ?? d.publication ?? d) as PublicationRecord | undefined;
  if (!record || typeof record.id !== 'string') return null;
  const versionsRaw = d.versions ?? d.publication_versions ?? [];
  const versions = Array.isArray(versionsRaw) ? (versionsRaw as PublicationVersionRecord[]) : [];
  return { record, versions };
}

export default async function PublicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [res, user, role] = await Promise.all([
    getPublicationAction(params.id),
    getUser(),
    getSessionRole(),
  ]);
  const isAuthenticated = Boolean(user);

  if (!res.ok) {
    return (
      <>
        <TopNav title="Publication" subtitle="Public report" />
        <main className="space-y-4 p-5 lg:p-6">
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <AlertTriangle className="h-5 w-5" /> Could not load this publication
            </h3>
            <p className="text-body-sm text-text-secondary">{res.error}</p>
            {res.code === 'AUTH_REQUIRED' ? (
              <Link
                href={`/sign-in?redirectedFrom=/dashboard/publications/${params.id}`}
                className="text-caption font-semibold text-electric hover:text-white"
              >
                Sign in →
              </Link>
            ) : null}
          </Card>
          <Link
            href="/dashboard/publications"
            className="text-caption font-semibold text-electric hover:text-white"
          >
            ← Back to publications
          </Link>
        </main>
      </>
    );
  }

  const detail = readDetail(res.data);
  if (!detail) {
    return (
      <>
        <TopNav title="Publication" subtitle="Public report" />
        <main className="p-5 lg:p-6">
          <Card className="space-y-1.5 border-warning/40 bg-warning/5" padded>
            <h3 className="text-h6 font-semibold text-warning">Publication not found</h3>
            <p className="text-body-sm text-text-secondary">
              This publication could not be resolved.
            </p>
          </Card>
        </main>
      </>
    );
  }

  const { record, versions } = detail;
  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);
  const latest = sorted[0];
  const title = `${entityLabel(record.entity_type)} ${record.entity_id.slice(0, 8)}`;

  return (
    <>
      <TopNav title={title} subtitle="Public report" />
      <main className="space-y-6 p-5 lg:p-6">
        <Link
          href="/dashboard/publications"
          className="inline-flex items-center gap-1 text-caption font-semibold text-text-muted hover:text-electric"
        >
          ← Back to publications
        </Link>

        {/* Header */}
        <Card className="flex flex-wrap items-center justify-between gap-4" padded>
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <FileBarChart className="h-5 w-5 text-electric" />
              {title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {record.published_by?.slice(0, 12) ?? 'system'}
              </span>
              <span>Published {fmtDate(record.published_at)}</span>
              <span className="inline-flex items-center gap-1">
                <History className="h-3.5 w-3.5" />v{record.latest_version ?? latest?.version_number ?? 1}
              </span>
            </div>
          </div>
          <VisibilityBadge visibility={record.visibility} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Public report builder output (latest snapshot) */}
            <div className="space-y-3">
              <h3 className="text-h6 font-semibold text-text-primary">Public report</h3>
              {latest ? (
                <PublicReportView snapshot={latest.snapshot_json} />
              ) : (
                <Card padded>
                  <p className="text-caption text-text-muted">
                    No published version snapshot exists yet.
                  </p>
                </Card>
              )}
            </div>

            <PublicationVersionDiff versions={versions} />

            <CommentThread
              entityType="publication"
              entityId={record.id}
              isAuthenticated={isAuthenticated}
            />
          </div>

          <div className="space-y-6">
            <PublicationActions
              publicationId={record.id}
              currentVisibility={record.visibility as PublicationVisibility}
              role={role}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </div>
      </main>
    </>
  );
}
