// =============================================================================
// HSI Phase 19 — Publishing dashboard (/dashboard/publishing). Server Component,
// force-dynamic. getPublishingDashboardAction() returns draft reports, the review
// queue, the publishing queue, published reports, retractions, digest runs,
// subscriber count, and publication analytics. Curator/admin may publish queued
// reports + retract published ones. Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Newspaper, FileText, Send, Users, AlertOctagon, Mail } from 'lucide-react';
import type { PublishingDashboardData } from '@hsi/shared-types';
import {
  getPublishingDashboardAction,
  retractPublicationAction,
  transitionPublicationAction,
} from '@/lib/publishing/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoPublishingDashboard, formatDate, formatTrust } from '@/lib/publishing/view';
import { PublishingNav } from '@/components/publishing/PublishingNav';
import { PublicationStateBadge } from '@/components/publishing/badges';
import { PublishControl, RetractControl } from '@/components/publishing/PublishingControls';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PublishingDashboardPage() {
  const [res, role, user] = await Promise.all([getPublishingDashboardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: PublishingDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoPublishingDashboard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Publishing" subtitle="From governed research to public, trust-aware intelligence — human-approved at every step" />
      <main className="space-y-6 p-5 lg:p-6">
        <PublishingNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Newspaper className="h-5 w-5 text-electric" /> Publishing operations
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="The publishing dashboard requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load publishing" message={errored.message} code={errored.code} redirectedFrom="/dashboard/publishing" />
        ) : !data ? null : (
          <div className="space-y-6">
            {/* Analytics */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat icon={FileText} label="Drafts" value={String(data.drafts.length)} color="#94A3B8" />
              <Stat icon={Send} label="In review" value={String(data.reviewQueue.length)} color="#F59E0B" href="/dashboard/publishing/review" />
              <Stat icon={Newspaper} label="Published" value={String(data.analytics.totalPublished)} color="#10B981" href="/intelligence" />
              <Stat icon={AlertOctagon} label="Retracted" value={String(data.analytics.totalRetracted)} color="#EF4444" href="/dashboard/publishing/retractions" />
              <Stat icon={Users} label="Subscribers" value={String(data.subscriberCount)} color="#3B82F6" />
            </div>

            {/* Publishing queue (APPROVED → publish) */}
            <Card className="space-y-3 border-border" padded>
              <h3 className="text-h6 font-semibold text-text-primary">Publishing queue (approved)</h3>
              {data.publishingQueue.length === 0 ? (
                <p className="text-caption text-text-muted">Nothing approved and awaiting publication.</p>
              ) : (
                <div className="space-y-3">
                  {data.publishingQueue.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface/50 p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{p.title}</span>
                          <PublicationStateBadge state={p.state} />
                        </div>
                        <p className="text-[11px] text-text-muted">trust {formatTrust(p.trust_score)} · {p.evidence_count ?? 0} evidence · {p.source_count ?? 0} sources</p>
                      </div>
                      <PublishControl publicationId={p.id} state={p.state} action={transitionPublicationAction} canAct={mayCurate} demo={isDemo} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Published (retract) */}
            <Card className="space-y-3 border-border" padded>
              <h3 className="text-h6 font-semibold text-text-primary">Published reports</h3>
              {data.published.length === 0 ? (
                <p className="text-caption text-text-muted">Nothing published yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.published.map((p) => (
                    <div key={p.id} className="space-y-2 rounded-card border border-border bg-surface/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/intelligence/${p.slug}` as never} className="font-medium text-text-primary hover:underline">{p.title}</Link>
                        <span className="text-[11px] text-text-muted">{formatDate(p.published_at)}</span>
                      </div>
                      <RetractControl publicationId={p.id} action={retractPublicationAction} canAct={mayCurate} demo={isDemo} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Digest runs */}
            <Card className="space-y-3 border-border" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Mail className="h-4 w-4 text-electric" /> Recent digest runs</h3>
              {data.digestRuns.length === 0 ? (
                <p className="text-caption text-text-muted">No digests generated yet (the publishing worker generates these).</p>
              ) : (
                <ul className="space-y-1 text-caption text-text-secondary">
                  {data.digestRuns.map((d) => (
                    <li key={d.id}>{d.kind} · {d.item_count ?? 0} items · {d.dropped_no_source ?? 0} dropped (no source) · {formatDate(d.created_at)}</li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </main>
    </>
  );
}

function Stat({ icon: Icon, label, value, color, href }: { icon: typeof Newspaper; label: string; value: string; color: string; href?: string }) {
  const inner = (
    <Card className="flex items-center gap-3 border-border transition hover:border-electric/50" padded>
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1f` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <div>
        <div className="text-h6 font-bold tabular-nums text-text-primary">{value}</div>
        <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      </div>
    </Card>
  );
  return href ? <Link href={href as never} className="block">{inner}</Link> : inner;
}
