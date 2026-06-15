// =============================================================================
// HSI Phase 32 — Tester Dashboard (/dashboard/tester). Server Component,
// force-dynamic. Any signed-in user. Self-service beta onboarding: join a cohort,
// see your mission queue + progress, report issues, give feedback, claim
// completion — no admin intervention. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Rocket, ShieldCheck } from 'lucide-react';
import { getTesterDashboardAction } from '@/lib/beta/tester';
import { betaBadge } from '@hsi/beta-engine';
import { TesterConsole } from '@/components/beta/TesterConsole';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TesterDashboardPage() {
  const res = await getTesterDashboardAction();
  if (!res.ok) {
    return (
      <>
        <TopNav title="Beta Tester" subtitle="Your beta journey" />
        <main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load your tester dashboard" message="Unavailable right now." redirectedFrom="/dashboard/tester" /></main>
      </>
    );
  }
  const d = res.data;

  return (
    <>
      <TopNav title="Beta Tester" subtitle="Onboard, take missions, report issues — no waiting on an admin" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-electric/30 bg-electric/5" padded>
          <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Welcome to the HSI beta. Join a cohort and start contributing immediately — you earn XP, badges, and ranks through real work. Privileged roles are still granted by an administrator via an application.</p>
        </Card>

        {d.badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {d.badges.map((b) => <span key={b} className="rounded-full bg-electric/15 px-2.5 py-1 text-label font-medium text-electric">{betaBadge(b)?.name ?? b}</span>)}
          </div>
        ) : null}

        <TesterConsole dashboard={d} />

        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
          <p className="text-label text-text-muted">Your tester records are private to you (and admins). Recognition badges and ranks are cosmetic — they never change your access. Issues you report go to the admin review queue.</p>
        </Card>
      </main>
    </>
  );
}
