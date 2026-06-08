// =============================================================================
// HSI Phase 7 — Source Detail (/dashboard/sources/[id]). Server Component.
// Metadata, recent signals, health timeline, narrative timeline, watchlist
// membership, recent alerts, and research runs created. getSourceAction(id).
// Offline (NOT_CONFIGURED / ?demo=1) → labeled demo derived from fixtures.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import {
  Database,
  ExternalLink,
  Link2,
  ListChecks,
  Inbox,
  Bell,
  FlaskConical,
} from 'lucide-react';
import type {
  HsinNarrativeDriftRecord,
  HsinSignalAlertRecord,
  HsinSignalRecord,
  HsinSourceHealthRecord,
  SourceWithStats,
} from '@hsi/shared-types';
import { getSourceAction } from '@/lib/signals/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canCapture as canCaptureRole,
  demoSourceById,
  formatDateTime,
  relativeTime,
  sourceTypeLabel,
  alertTypeLabel,
} from '@/lib/signals/view';
import { IntelNav } from '@/components/signals/IntelNav';
import {
  DemoBadge,
  SourceStatusBadge,
  SourceHealthBadge,
  AlertSeverityBadge,
  AlertStatusBadge,
  ConfidenceChip,
  SignalCategoryBadge,
} from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';
import { CaptureNowButton } from '@/components/signals/CaptureNowButton';
import { NarrativeTimeline } from '@/components/signals/NarrativeTimeline';
import { SourceHealthTimeline } from '@/components/signals/SourceHealthTimeline';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** The detail action may return a SourceWithStats enriched with related lists. */
interface SourceDetail extends SourceWithStats {
  recentSignals?: HsinSignalRecord[];
  healthHistory?: HsinSourceHealthRecord[];
  narrativeDrift?: HsinNarrativeDriftRecord[];
  alerts?: HsinSignalAlertRecord[];
  researchRunIds?: string[];
}

export default async function SourceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { demo?: string };
}) {
  const wantDemo = searchParams.demo === '1';
  const [res, role, user] = await Promise.all([
    getSourceAction(params.id),
    getSessionRole(),
    getUser(),
  ]);

  let detail: SourceDetail | null = null;
  let isDemo = false;

  if (!wantDemo && res.ok) {
    // Map the canonical getSource() shape onto this page's view model.
    const d = res.data;
    detail = {
      source: d.source,
      signalCount: d.recentSignals.length,
      alertCount: d.recentAlerts.length,
      watchlists: d.watchlists,
      health: d.healthTimeline[0],
      recentSignals: d.recentSignals,
      healthHistory: d.healthTimeline,
      narrativeDrift: d.narrativeDrift,
      alerts: d.recentAlerts,
      researchRunIds: d.linkedResearchRunIds,
    };
  } else if (wantDemo || (!res.ok && res.code === 'NOT_CONFIGURED')) {
    const demo = demoSourceById(params.id) ?? demoSourceById('src_demo_site');
    if (demo) {
      detail = demo as SourceDetail;
      isDemo = true;
    }
  }

  if (!detail) {
    return (
      <>
        <TopNav title="Source" subtitle="Detail" />
        <main className="space-y-6 p-5 lg:p-6">
          <IntelNav />
          <ErrorState
            title="Could not load source"
            message={res.ok ? 'Source not found.' : res.error}
            code={res.ok ? undefined : res.code}
            redirectedFrom={`/dashboard/sources/${params.id}`}
          />
        </main>
      </>
    );
  }

  const { source, health, signalCount, alertCount, watchlists } = detail;
  const recentSignals = detail.recentSignals ?? [];
  const alerts = detail.alerts ?? [];
  const drift = detail.narrativeDrift ?? [];
  const healthHistory = detail.healthHistory ?? (health ? [health] : []);
  const researchRunIds = detail.researchRunIds ?? [];

  return (
    <>
      <TopNav title={source.name} subtitle="Source detail" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Database className="h-5 w-5 text-electric" /> {source.name}
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <CaptureNowButton
            sourceId={source.id}
            canCapture={canCaptureRole(role) && Boolean(user)}
            demo={isDemo}
            size="md"
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {/* Metadata */}
        <Card className="space-y-3" padded>
          <h3 className="text-h6 font-semibold text-text-primary">Metadata</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Meta label="Type" value={sourceTypeLabel(source.source_type)} />
            <Meta label="Platform" value={source.platform ?? '—'} />
            <Meta
              label="Status"
              value={<SourceStatusBadge status={source.status} />}
            />
            <Meta
              label="Health"
              value={<SourceHealthBadge status={health?.status} />}
            />
            <Meta
              label="Risk level"
              value={source.risk_level != null ? `${source.risk_level}/5` : '—'}
            />
            <Meta label="Signals" value={String(signalCount)} />
            <Meta
              label="Alerts"
              value={
                <span className={alertCount > 0 ? 'text-risk' : undefined}>
                  {alertCount}
                </span>
              }
            />
            <Meta label="Last checked" value={formatDateTime(source.last_checked_at)} />
            <Meta label="Created" value={formatDateTime(source.created_at)} />
          </div>
          {source.description ? (
            <p className="text-body-sm leading-relaxed text-text-secondary">
              {source.description}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 text-caption">
            {source.homepage_url ? (
              <a
                href={source.homepage_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-electric hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Homepage
              </a>
            ) : null}
            {source.rss_url ? (
              <a
                href={source.rss_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-electric hover:text-white"
              >
                <Link2 className="h-3.5 w-3.5" /> RSS feed
              </a>
            ) : null}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent signals */}
          <Card className="space-y-3" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <Inbox className="h-4 w-4 text-electric" /> Recent signals
            </h3>
            {recentSignals.length === 0 ? (
              <p className="text-body-sm text-text-secondary">
                No signals captured from this source yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentSignals.slice(0, 8).map((s) => (
                  <li key={s.id} className="border-b border-border/50 pb-2 last:border-0">
                    <Link
                      href={`/dashboard/signals/${s.id}${isDemo ? '?demo=1' : ''}` as never}
                      className="font-semibold text-text-primary hover:text-electric"
                    >
                      {s.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <SignalCategoryBadge category={s.signal_category} />
                      <ConfidenceChip confidence={s.confidence} />
                      <span className="text-caption text-text-muted">
                        {relativeTime(s.captured_at ?? s.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Watchlist membership */}
          <Card className="space-y-3" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <ListChecks className="h-4 w-4 text-electric" /> Watchlist membership
            </h3>
            {!watchlists || watchlists.length === 0 ? (
              <p className="text-body-sm text-text-secondary">
                This source is not scoped to any watchlist.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {watchlists.map((w) => (
                  <span
                    key={w}
                    className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-caption text-text-secondary"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Health + narrative timelines */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SourceHealthTimeline history={healthHistory} />
          <NarrativeTimeline events={drift} />
        </div>

        {/* Recent alerts */}
        <Card className="space-y-3" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Bell className="h-4 w-4 text-electric" /> Recent alerts
          </h3>
          {alerts.length === 0 ? (
            <p className="text-body-sm text-text-secondary">
              No alerts raised for this source.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="space-y-1 border-b border-border/50 pb-2 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AlertSeverityBadge severity={a.severity} />
                    <AlertStatusBadge status={a.status} />
                    <span className="text-caption text-text-muted">
                      {alertTypeLabel(a.alert_type)}
                    </span>
                  </div>
                  <p className="text-body-sm text-text-primary">
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

        {/* Research runs created */}
        <Card className="space-y-3" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <FlaskConical className="h-4 w-4 text-electric" /> Research runs created
          </h3>
          {researchRunIds.length === 0 ? (
            <p className="text-body-sm text-text-secondary">
              No research runs have been spawned from this source&apos;s signals yet.
            </p>
          ) : (
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
          )}
        </Card>
      </main>
    </>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-label text-text-muted">{label}</p>
      <div className="mt-0.5 text-body-sm text-text-primary">{value}</div>
    </div>
  );
}
