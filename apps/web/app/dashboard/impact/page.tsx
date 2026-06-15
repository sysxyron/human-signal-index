// =============================================================================
// HSI Phase 29 — Outcome Explorer (/dashboard/impact). Server Component,
// force-dynamic, researcher+. Browse real OUTCOMES (effectiveness, not activity):
// the outcome feed (filterable by type), top contributors by impact, and team
// impact rankings. Impact is recognition only — it never changes access/RBAC.
// Offline → labeled demo. (Lives at /dashboard/impact; /dashboard/outcomes is the
// separate Phase-15 decision-performance dashboard.)
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { Target, Users, TrendingUp } from 'lucide-react';
import { OUTCOME_TYPES } from '@hsi/outcome-attribution';
import { getOutcomeExplorerAction, type OutcomeRow } from '@/lib/contributor/attribution';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ImpactExplorerPage({ searchParams }: { searchParams?: { type?: string } }) {
  const type = searchParams?.type ?? 'all';
  const res = await getOutcomeExplorerAction(type);
  if (!res.ok) {
    return (
      <>
        <TopNav title="Impact" subtitle="Outcomes & effectiveness" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} title="Insufficient permissions" message={res.code === 'FORBIDDEN' ? 'The outcome explorer is restricted to researchers and above.' : 'Outcomes are unavailable right now.'} redirectedFrom="/dashboard/impact" />
        </main>
      </>
    );
  }
  const { outcomes, topContributors, teamImpact } = res.data;

  return (
    <>
      <TopNav title="Impact" subtitle="Which signals mattered · which work changed outcomes" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-electric/30 bg-electric/5" padded>
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">This measures <strong className="text-text-primary">effectiveness, not activity</strong> — verified findings, governance actions, and publications that produced real outcomes. Impact influences trust; it never grants access.</p>
        </Card>

        {/* Type filter */}
        <div className="flex flex-wrap gap-2">
          <Link href={"/dashboard/impact?type=all" as never} className={`rounded-full px-3 py-1.5 text-caption font-medium transition ${type === 'all' ? 'bg-electric text-white' : 'border border-border bg-surface/50 text-text-secondary hover:text-text-primary'}`}>All</Link>
          {OUTCOME_TYPES.map((t) => (
            <Link key={t} href={`/dashboard/impact?type=${t}` as never} className={`rounded-full px-3 py-1.5 text-caption font-medium transition ${type === t ? 'bg-electric text-white' : 'border border-border bg-surface/50 text-text-secondary hover:text-text-primary'}`}>{t.replace(/_/g, ' ').toLowerCase()}</Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Outcome feed */}
          <section className="space-y-3 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Target className="h-4 w-4 text-electric" /> Outcomes</h2>
            {outcomes.length === 0 ? <EmptyState title="No outcomes yet" message="Outcomes appear once the worker attributes them." /> : (
              <div className="space-y-2">
                {outcomes.map((o: OutcomeRow) => (
                  <Card key={o.id} className="flex items-center justify-between gap-3 border-border" padded>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-electric/15 px-2 py-0.5 text-label font-semibold text-electric">{o.outcomeType.replace(/_/g, ' ')}</span>
                        <span className="truncate text-caption text-text-secondary">{o.reason ?? `${o.entityKind} ${o.entityId}`}</span>
                      </div>
                      <div className="mt-0.5 text-label text-text-muted">{o.entityKind} · {new Date(o.at).toLocaleDateString()}</div>
                    </div>
                    <span className="shrink-0 text-h6 font-bold tabular-nums text-electric">{Math.round(o.impactWeight * 100)}</span>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-6">
            {/* Top contributors */}
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Users className="h-4 w-4 text-electric" /> Top impact</h2>
              <Card className="space-y-2 border-border" padded>
                {topContributors.length === 0 ? <p className="text-caption text-text-muted">No contributor impact yet.</p> : topContributors.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between text-caption">
                    <span className="text-text-secondary">{i + 1}. {c.id}</span>
                    <span className="tabular-nums text-electric">{c.impact} <span className="text-text-muted">({c.outcomes})</span></span>
                  </div>
                ))}
              </Card>
            </section>
            {/* Team impact (Deliverable 14) */}
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><TrendingUp className="h-4 w-4 text-success" /> Team impact</h2>
              <Card className="space-y-2 border-border" padded>
                {teamImpact.length === 0 ? <p className="text-caption text-text-muted">No team impact yet.</p> : teamImpact.map((t) => (
                  <div key={t.teamKey} className="flex items-center justify-between text-caption">
                    <span className="capitalize text-text-secondary">{t.teamKey}</span>
                    <span className="tabular-nums text-success">{t.impact}</span>
                  </div>
                ))}
              </Card>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
