// =============================================================================
// HSI Phase 7 — Signal Detail (/dashboard/signals/[id]). Server Component.
// Signal classification + confidence, source, versions, tags, review status,
// related alerts, related research runs + publications, and a full PROVENANCE
// panel. Reviewer+ actions (SignalReviewPanel) + a prominent Create Research Run
// button (researcher+). getSignalAction(id). Offline/?demo=1 → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import {
  Inbox,
  Database,
  History,
  Tag,
  Bell,
  FlaskConical,
  FileText,
  GitMerge,
} from 'lucide-react';
import type {
  HsinCaptureJobRecord,
  HsinSignalReviewRecord,
  HsinSignalVersionRecord,
  SignalWithContext,
} from '@hsi/shared-types';
import { getSignalAction } from '@/lib/signals/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  canReview as canReviewRole,
  demoSignalById,
  excerpt,
  formatDateTime,
  relativeTime,
  sourceTypeLabel,
  titleize,
  alertTypeLabel,
} from '@/lib/signals/view';
import { IntelNav } from '@/components/signals/IntelNav';
import {
  DemoBadge,
  SignalCategoryBadge,
  SignalStatusBadge,
  ConfidenceChip,
  AlertSeverityBadge,
  AlertStatusBadge,
} from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';
import { SignalReviewPanel } from '@/components/signals/SignalReviewPanel';
import { CreateResearchButton } from '@/components/signals/CreateResearchButton';
import { SignalProvenancePanel } from '@/components/signals/SignalProvenancePanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** getSignalAction may return SignalWithContext enriched for the detail view. */
interface SignalDetail extends SignalWithContext {
  versions?: HsinSignalVersionRecord[];
  reviews?: HsinSignalReviewRecord[];
  captureJob?: HsinCaptureJobRecord;
  publicationIds?: string[];
}

export default async function SignalDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { demo?: string };
}) {
  const wantDemo = searchParams.demo === '1';
  const [res, role, user] = await Promise.all([
    getSignalAction(params.id),
    getSessionRole(),
    getUser(),
  ]);

  let detail: SignalDetail | null = null;
  let isDemo = false;

  if (!wantDemo && res.ok) {
    detail = res.data as SignalDetail;
  } else if (wantDemo || (!res.ok && res.code === 'NOT_CONFIGURED')) {
    const demo = demoSignalById(params.id) ?? demoSignalById('sig_demo_0');
    if (demo) {
      detail = demo as SignalDetail;
      isDemo = true;
    }
  }

  if (!detail) {
    return (
      <>
        <TopNav title="Signal" subtitle="Detail" />
        <main className="space-y-6 p-5 lg:p-6">
          <IntelNav />
          <ErrorState
            title="Could not load signal"
            message={res.ok ? 'Signal not found.' : res.error}
            code={res.ok ? undefined : res.code}
            redirectedFrom={`/dashboard/signals/${params.id}`}
          />
        </main>
      </>
    );
  }

  const { signal, source, versionCount, tags, alerts, reviewStatus, researchRunIds } =
    detail;
  const versions = detail.versions ?? [];
  const reviews = detail.reviews ?? [];
  const publicationIds = detail.publicationIds ?? [];

  const authed = Boolean(user);
  const canReviewSignal = canReviewRole(role) && authed;
  const canCreateResearch = canResearch(role) && authed;

  return (
    <>
      <TopNav title={signal.title} subtitle="Signal detail" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
                <Inbox className="h-5 w-5 text-electric" /> {signal.title}
              </h2>
              {isDemo ? <DemoBadge /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <SignalCategoryBadge category={signal.signal_category} />
              {signal.signal_type ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-caption text-text-muted">
                  {titleize(String(signal.signal_type))}
                </span>
              ) : null}
              <SignalStatusBadge status={signal.status} />
              <ConfidenceChip confidence={signal.confidence} />
            </div>
          </div>
          {/* Prominent Create Research Run + Phase-9 WorldForge fusion draft. */}
          <div className="flex flex-col items-end gap-2">
            <CreateResearchButton
              signalId={signal.id}
              canCreate={canCreateResearch}
              demo={isDemo}
              prominent
            />
            {/* ADDITIVE (Phase 9): draft a WorldForge fusion prompt (researcher+). */}
            {canCreateResearch ? (
              <Link
                href={`/dashboard/worldforge/from-signal?signalId=${encodeURIComponent(signal.id)}` as never}
                className="inline-flex items-center gap-2 rounded-btn border border-accent/40 bg-accent/10 px-3.5 py-2 text-caption font-semibold text-accent transition hover:border-accent hover:text-white"
              >
                <GitMerge className="h-3.5 w-3.5" /> Draft WorldForge prompt from this signal
              </Link>
            ) : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Signal body */}
            <Card className="space-y-3" padded>
              <h3 className="text-h6 font-semibold text-text-primary">Signal</h3>
              {signal.summary ? (
                <p className="text-body-sm leading-relaxed text-text-secondary">
                  {signal.summary}
                </p>
              ) : (
                <p className="text-body-sm text-text-muted">No summary recorded.</p>
              )}
              {signal.raw_content ? (
                <div className="rounded-btn border border-border bg-surface-2/40 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-label text-text-muted">
                    <FileText className="h-3.5 w-3.5" /> Raw excerpt
                  </p>
                  <p className="whitespace-pre-wrap text-caption leading-relaxed text-text-secondary">
                    {excerpt(signal.raw_content, 600)}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3 text-caption text-text-muted">
                <span>Captured {formatDateTime(signal.captured_at ?? signal.created_at)}</span>
                {signal.content_hash ? (
                  <span title={signal.content_hash}>
                    Hash {signal.content_hash.slice(0, 18)}…
                  </span>
                ) : null}
              </div>
            </Card>

            {/* Reviewer actions */}
            <SignalReviewPanel
              signalId={signal.id}
              canReview={canReviewSignal}
              currentStatus={reviewStatus ?? signal.status}
              demo={isDemo}
            />

            {/* Provenance */}
            <SignalProvenancePanel
              signal={signal}
              source={source}
              captureJob={detail.captureJob}
              reviews={reviews}
              researchRunIds={researchRunIds}
              publicationIds={publicationIds}
              demo={isDemo}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Source */}
            <Card className="space-y-2" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Database className="h-4 w-4 text-electric" /> Source
              </h3>
              {source ? (
                <Link
                  href={`/dashboard/sources/${source.id}${isDemo ? '?demo=1' : ''}` as never}
                  className="font-semibold text-text-primary hover:text-electric"
                >
                  {source.name}
                  <span className="ml-1 text-caption text-text-muted">
                    ({sourceTypeLabel(source.source_type)})
                  </span>
                </Link>
              ) : (
                <p className="text-body-sm text-text-muted">
                  Manual submission / no source linked.
                </p>
              )}
            </Card>

            {/* Versions */}
            <Card className="space-y-2" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <History className="h-4 w-4 text-electric" /> Versions ({versionCount})
              </h3>
              {versions.length === 0 ? (
                <p className="text-body-sm text-text-secondary">
                  {versionCount > 0
                    ? `${versionCount} immutable snapshot${versionCount === 1 ? '' : 's'} recorded.`
                    : 'No version snapshots recorded yet.'}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {versions
                    .slice()
                    .sort((a, b) => b.version_number - a.version_number)
                    .map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center justify-between text-caption"
                      >
                        <span className="font-semibold text-text-primary">
                          v{v.version_number}
                        </span>
                        <span className="text-text-muted">
                          {relativeTime(v.created_at)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            {/* Tags */}
            <Card className="space-y-2" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Tag className="h-4 w-4 text-electric" /> Tags
              </h3>
              {tags.length === 0 ? (
                <p className="text-body-sm text-text-secondary">No tags.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-caption text-text-secondary"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {/* Related alerts */}
            <Card className="space-y-2" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Bell className="h-4 w-4 text-electric" /> Related alerts
              </h3>
              {alerts.length === 0 ? (
                <p className="text-body-sm text-text-secondary">No alerts.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a) => (
                    <li key={a.id} className="space-y-1 border-b border-border/50 pb-2 last:border-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AlertSeverityBadge severity={a.severity} />
                        <AlertStatusBadge status={a.status} />
                      </div>
                      <p className="text-caption font-semibold text-text-primary">
                        {a.title ?? alertTypeLabel(a.alert_type)}
                      </p>
                      {a.explanation ? (
                        <p className="text-caption text-text-secondary">{a.explanation}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Research + publications */}
            <Card className="space-y-2" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <FlaskConical className="h-4 w-4 text-electric" /> Research & publications
              </h3>
              {researchRunIds.length === 0 && publicationIds.length === 0 ? (
                <p className="text-body-sm text-text-secondary">
                  No research runs or publications generated from this signal yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {researchRunIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {researchRunIds.map((id) => (
                        <Link
                          key={id}
                          href={`/dashboard/worldforge/research/${id}` as never}
                          className="inline-flex items-center gap-1 rounded-full border border-electric/40 bg-electric/5 px-2.5 py-1 text-caption font-semibold text-electric hover:text-white"
                        >
                          Run {id.slice(0, 8)}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {publicationIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {publicationIds.map((id) => (
                        <span
                          key={id}
                          className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-caption text-text-secondary"
                        >
                          Pub {id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
