// =============================================================================
// HSI Phase 25 — Badges (/dashboard/badges). Server Component, force-dynamic. Any
// signed-in user. Shows the full badge catalog with which badges the user has
// earned. Badges recognise measurable contribution; they never change access.
// Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Award, Lock, CheckCircle2 } from 'lucide-react';
import { BADGE_DEFINITIONS } from '@hsi/contributor-network';
import { getContributionIdentityAction } from '@/lib/contributor/profile';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BadgesPage() {
  const res = await getContributionIdentityAction();
  if (!res.ok) {
    return (
      <>
        <TopNav title="Badges" subtitle="Achievements for measurable contribution" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load badges" message="Badges are unavailable right now." redirectedFrom="/dashboard/badges" />
        </main>
      </>
    );
  }
  const earned = new Set(res.data.badges.map((b) => b.id));
  return (
    <>
      <TopNav title="Badges" subtitle="Earn achievements through accepted, reviewed work" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <Award className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Badges are awarded automatically when you cross a measurable threshold ({earned.size} of {BADGE_DEFINITIONS.length} earned). They recognise contribution — they never grant access or change your role.</p>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGE_DEFINITIONS.map((b) => {
            const has = earned.has(b.id);
            return (
              <Card key={b.id} className={`space-y-2 ${has ? 'border-electric/40 bg-electric/5' : 'border-border opacity-80'}`} padded>
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${has ? 'bg-electric/20 text-electric' : 'bg-surface-2 text-text-muted'}`}>
                    {has ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </span>
                  {has ? <span className="text-label font-semibold uppercase tracking-wide text-electric">Earned</span> : <span className="text-label uppercase tracking-wide text-text-muted">Locked</span>}
                </div>
                <h3 className="text-h6 font-semibold text-text-primary">{b.name}</h3>
                <p className="text-caption text-text-secondary">{b.description}</p>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
