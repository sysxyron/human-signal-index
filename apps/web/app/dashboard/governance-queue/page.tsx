// =============================================================================
// HSI Phase 25 — Governance Queue (/dashboard/governance-queue). Server
// Component, force-dynamic. Reviewer+ only. Surfaces escalated / in-governance
// investigations for governance review. Decisions are recorded with a required
// rationale on the investigation detail. Read-only list. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { Scale, ArrowRight, AlertTriangle } from 'lucide-react';
import type { InvestigationRow } from '@hsi/shared-types';
import { getGovernanceQueueAction } from '@/lib/contributor/governance';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRIORITY_COLOR: Record<string, string> = { low: '#94A3B8', medium: '#38BDF8', high: '#F59E0B', critical: '#EF4444' };

export default async function GovernanceQueuePage() {
  const res = await getGovernanceQueueAction();
  if (!res.ok) {
    return (
      <>
        <TopNav title="Governance Queue" subtitle="Escalated and sensitive investigations" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} title="Insufficient permissions" message={res.code === 'FORBIDDEN' ? 'The governance queue is restricted to reviewers and above.' : 'The governance queue is unavailable right now.'} redirectedFrom="/dashboard/governance-queue" />
        </main>
      </>
    );
  }
  const queue = res.data;
  return (
    <>
      <TopNav title="Governance Queue" subtitle="Escalated investigations, policy concerns, publication disputes" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Every governance decision is recorded with a rationale. Governance never auto-publishes — publishing stays governed by the existing publication workflows.</p>
        </Card>
        {queue.length === 0 ? (
          <EmptyState title="Queue is clear" message="No investigations are awaiting governance review." />
        ) : (
          <div className="space-y-3">
            {queue.map((inv: InvestigationRow) => (
              <Link key={inv.id} href={`/dashboard/investigations/workflow/${inv.id}` as never} className="block">
                <Card className="flex items-center justify-between gap-4 border-border transition hover:border-electric/50" padded>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {inv.priority === 'critical' ? <AlertTriangle className="h-4 w-4 shrink-0 text-error" /> : null}
                      <h3 className="truncate text-h6 font-semibold text-text-primary">{inv.title}</h3>
                    </div>
                    {inv.summary ? <p className="mt-0.5 truncate text-caption text-text-secondary">{inv.summary}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full px-2.5 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${PRIORITY_COLOR[inv.priority]}1f`, color: PRIORITY_COLOR[inv.priority] }}>{inv.priority}</span>
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-label font-medium capitalize text-text-secondary">{inv.status.replace(/_/g, ' ')}</span>
                    <ArrowRight className="h-4 w-4 text-text-muted" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
