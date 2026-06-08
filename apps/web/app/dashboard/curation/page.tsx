// =============================================================================
// WorldForge Phase 6 — CURATION DASHBOARD (Server Component, force-dynamic).
// reviewer+/curator gated. getCurationDashboardAction() -> panels for Pending
// Publications, High Priority Reviews, Escalations, Contradictions, and Low
// Evidence Coverage runs, plus top stat cards. Each item links to its
// review/publication page. Auth + role + error + empty handling.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import {
  ShieldCheck,
  AlertTriangle,
  Send,
  Flame,
  ArrowUpCircle,
  GitFork,
  BarChartHorizontal,
} from 'lucide-react';
import type { CurationDashboardData, ReviewQueueItem } from '@hsi/shared-types';
import { getUser, getSessionRole } from '@/lib/supabase/server';
import { getCurationDashboardAction } from '../review/actions';
import { CurationPanel, type CurationPanelEntry } from '@/components/governance/CurationPanel';
import { PriorityBadge } from '@/components/governance/PriorityBadge';
import { VisibilityBadge } from '@/components/governance/VisibilityBadge';
import {
  roleAtLeast,
  entityDisplayLabel,
  entityLabel,
  fmtPercent,
  readEntitySummary,
} from '@/lib/governance/view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function reviewEntry(item: ReviewQueueItem): CurationPanelEntry {
  const q = item.queue;
  return {
    id: q.id,
    label: entityDisplayLabel(q.entity_type, q.entity_id, item.entitySummary),
    meta: `${entityLabel(q.entity_type)} · ${item.assignedReviewerEmail ?? 'unassigned'}`,
    href: `/dashboard/review/${q.id}`,
    badge: <PriorityBadge priority={q.priority} />,
  };
}

/** Tolerantly read a run-shaped record for the contradiction / low-coverage lists. */
function runEntry(raw: Record<string, unknown>, kind: 'contradiction' | 'coverage'): CurationPanelEntry {
  const id = typeof raw.id === 'string' ? raw.id : typeof raw.run_id === 'string' ? raw.run_id : '';
  const summary = readEntitySummary(raw);
  const title =
    summary.title ?? summary.conceptText ?? (id ? `Run ${id.slice(0, 8)}` : 'Run');
  const meta =
    kind === 'contradiction'
      ? `${summary.contradictionCount ?? '?'} contradictions`
      : `${summary.coverageScore !== undefined ? fmtPercent(summary.coverageScore) : '?'} coverage`;
  return {
    id: id || title,
    label: title,
    meta,
    href: id ? `/dashboard/worldforge/research/${id}` : '/dashboard/worldforge',
  };
}

export default async function CurationDashboardPage() {
  const [user, role] = await Promise.all([getUser(), getSessionRole()]);
  const isAuthenticated = Boolean(user);
  const canCurate = isAuthenticated && roleAtLeast(role, 'reviewer');

  if (!isAuthenticated) {
    return (
      <>
        <TopNav title="Curation Dashboard" subtitle="Reviewer &amp; curator workspace" />
        <main className="p-5 lg:p-6">
          <Card className="space-y-2 border-electric/40 bg-electric/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-electric">
              <ShieldCheck className="h-5 w-5" /> Sign in to access curation
            </h3>
            <p className="text-body-sm text-text-secondary">
              The curation dashboard is available to reviewers and curators.
            </p>
            <Link
              href="/sign-in?redirectedFrom=/dashboard/curation"
              className="text-caption font-semibold text-electric hover:text-white"
            >
              Sign in →
            </Link>
          </Card>
        </main>
      </>
    );
  }

  if (!canCurate) {
    return (
      <>
        <TopNav title="Curation Dashboard" subtitle="Reviewer &amp; curator workspace" />
        <main className="p-5 lg:p-6">
          <Card className="space-y-1.5 border-warning/40 bg-warning/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-warning">
              <AlertTriangle className="h-5 w-5" /> You don&apos;t have permission
            </h3>
            <p className="text-body-sm text-text-secondary">
              The curation dashboard requires a <strong>reviewer</strong> role or higher.
            </p>
          </Card>
        </main>
      </>
    );
  }

  const res = await getCurationDashboardAction();

  if (!res.ok) {
    return (
      <>
        <TopNav title="Curation Dashboard" subtitle="Reviewer &amp; curator workspace" />
        <main className="p-5 lg:p-6">
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <AlertTriangle className="h-5 w-5" /> Could not load the curation dashboard
            </h3>
            <p className="text-body-sm text-text-secondary">{res.error}</p>
            {res.code === 'NOT_CONFIGURED' ? (
              <p className="text-caption text-text-muted">
                Supabase is not configured in this environment.
              </p>
            ) : null}
          </Card>
        </main>
      </>
    );
  }

  const data: CurationDashboardData = res.data;

  const stats = [
    { label: 'Pending publications', value: data.pendingPublications.length, color: '#06B6D4' },
    { label: 'High-priority reviews', value: data.highPriorityReviews.length, color: '#F59E0B' },
    { label: 'Escalations', value: data.escalations.length, color: '#8B5CF6' },
    { label: 'Contradiction runs', value: data.contradictionRuns.length, color: '#EF4444' },
    { label: 'Low-coverage runs', value: data.lowCoverageRuns.length, color: '#64748B' },
  ];

  return (
    <>
      <TopNav title="Curation Dashboard" subtitle="Reviewer &amp; curator workspace" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Stat cards */}
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {stats.map((s) => (
            <Card key={s.label} className="space-y-1" padded>
              <div className="text-h3 font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-caption text-text-muted">{s.label}</div>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <CurationPanel
            title="Pending Publications"
            icon={Send}
            accent="#06B6D4"
            emptyMessage="No publications awaiting action."
            entries={data.pendingPublications.map((p) => ({
              id: p.id,
              label: `${entityLabel(p.entity_type)} ${p.entity_id.slice(0, 8)}`,
              meta: `Published by ${p.published_by?.slice(0, 12) ?? 'system'}`,
              href: `/dashboard/publications/${p.id}`,
              badge: <VisibilityBadge visibility={p.visibility} />,
            }))}
          />

          <CurationPanel
            title="High Priority Reviews"
            icon={Flame}
            accent="#F59E0B"
            emptyMessage="No high-priority reviews."
            entries={data.highPriorityReviews.map(reviewEntry)}
          />

          <CurationPanel
            title="Escalations"
            icon={ArrowUpCircle}
            accent="#8B5CF6"
            emptyMessage="No escalations — disagreement is surfaced here when it arises."
            entries={data.escalations.map(reviewEntry)}
          />

          <CurationPanel
            title="Contradictions"
            icon={GitFork}
            accent="#EF4444"
            emptyMessage="No runs with unresolved contradictions."
            entries={data.contradictionRuns.map((r) => runEntry(r, 'contradiction'))}
          />

          <CurationPanel
            title="Low Evidence Coverage"
            icon={BarChartHorizontal}
            accent="#64748B"
            emptyMessage="No low-coverage runs."
            entries={data.lowCoverageRuns.map((r) => runEntry(r, 'coverage'))}
          />
        </div>
      </main>
    </>
  );
}
