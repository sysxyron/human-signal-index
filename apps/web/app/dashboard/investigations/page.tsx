// =============================================================================
// HSI Phase 20 — Investigations board (/dashboard/investigations). Server
// Component, force-dynamic. getInvestigationsBoardAction() returns the
// collaborative investigations with their findings/challenges/contributor counts,
// contentiousness, and current consensus candidate. Researcher+ start one;
// researcher+ view. Answers "what investigations are active?".
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Users, Info } from 'lucide-react';
import type { InvestigationsBoardData } from '@hsi/shared-types';
import { createInvestigationAction, getInvestigationsBoardAction } from '@/lib/collective/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoInvestigationsBoard, formatDate, formatPct } from '@/lib/collective/view';
import { CollectiveNav } from '@/components/collective/CollectiveNav';
import { CreateInvestigationControl } from '@/components/collective/controls';
import { AgreementBadge, InvestigationStateBadge } from '@/components/collective/badges';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InvestigationsPage() {
  const [res, role, user] = await Promise.all([getInvestigationsBoardAction(), getSessionRole(), getUser()]);
  const mayResearch = canResearch(role) && Boolean(user);

  let data: InvestigationsBoardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoInvestigationsBoard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayResearch;
  const rows = data?.rows ?? [];

  return (
    <>
      <TopNav title="Investigations" subtitle="Collaborative intelligence — submit findings, challenge conclusions, form consensus" />
      <main className="space-y-6 p-5 lg:p-6">
        <CollectiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Users className="h-5 w-5 text-electric" /> Active investigations
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Investigations are worked collaboratively. Consensus is a weighted candidate (not a vote, not truth);
            dissent is always recorded; every conclusion needs a <span className="font-semibold text-text-primary">human governance decision</span>.
          </p>
        </Card>

        {mayResearch && !isDemo ? (
          <Card className="border-border" padded>
            <CreateInvestigationControl action={createInvestigationAction} canAct={mayResearch} demo={isDemo} />
          </Card>
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing investigations requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load investigations" message={errored.message} code={errored.code} redirectedFrom="/dashboard/investigations" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No investigations yet" message="Start an investigation to begin collaborating." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <Link key={r.id} href={`/dashboard/investigations/${r.id}` as never} className="block">
                <Card className="space-y-3 border-border transition hover:border-electric/50" padded>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-h6 font-semibold text-text-primary">{r.title}</h3>
                    <InvestigationStateBadge state={r.state} />
                  </div>
                  <p className="line-clamp-2 text-caption text-text-secondary">{r.question}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
                    <span>{r.findingCount} finding(s)</span>
                    <span>{r.challengeCount} challenge(s)</span>
                    <span>{r.contributorCount} contributor(s)</span>
                    <span>contention {formatPct(r.contentiousness)}</span>
                  </div>
                  {r.consensusPosition ? (
                    <div className="flex items-center gap-2 text-caption">
                      <span className="text-text-muted">Consensus:</span>
                      <span className="font-medium text-text-primary">{r.consensusPosition}</span>
                      <AgreementBadge score={r.agreementScore} />
                    </div>
                  ) : null}
                  <p className="text-[11px] text-text-muted">Updated {formatDate(r.updatedAt)}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
