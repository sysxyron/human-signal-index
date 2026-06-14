// =============================================================================
// HSI Phase 25 — My Missions (/dashboard/missions). Server Component,
// force-dynamic. Any signed-in user. Shows role-scoped weekly missions with live
// progress, XP + Intel Credit rewards, and status. Read-only (rewards are granted
// by the worker on claim). Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Target, Trophy, Coins } from 'lucide-react';
import type { MissionView } from '@hsi/contributor-network';
import { getMyMissionsAction } from '@/lib/contributor/missions';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not started', color: '#94A3B8' },
  in_progress: { label: 'In progress', color: '#38BDF8' },
  completed: { label: 'Completed', color: '#10B981' },
  claimed: { label: 'Claimed', color: '#A78BFA' },
  expired: { label: 'Expired', color: '#EF4444' },
};

function MissionCard({ m }: { m: MissionView }) {
  const s = STATUS_STYLE[m.status] ?? STATUS_STYLE.not_started;
  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-h6 font-semibold text-text-primary">{m.title}</h3>
          <p className="mt-0.5 text-label uppercase tracking-wide text-text-muted">{m.role} mission</p>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-label font-semibold" style={{ backgroundColor: `${s.color}1f`, color: s.color }}>{s.label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${m.percent}%` }} />
      </div>
      <ul className="space-y-1.5">
        {m.steps.map((step) => (
          <li key={step.key} className="flex items-center justify-between text-caption">
            <span className={step.complete ? 'text-text-muted line-through' : 'text-text-secondary'}>{step.label}</span>
            <span className="tabular-nums text-text-muted">{step.done}/{step.target}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4 border-t border-border pt-2 text-caption text-text-secondary">
        <span className="inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-electric" /> {m.xpReward} XP</span>
        <span className="inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 text-warning" /> {m.creditReward} credits</span>
      </div>
    </Card>
  );
}

export default async function MissionsPage() {
  const res = await getMyMissionsAction();
  if (!res.ok) {
    return (
      <>
        <TopNav title="My Missions" subtitle="Weekly missions for your role" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load missions" message="Your missions are unavailable right now." redirectedFrom="/dashboard/missions" />
        </main>
      </>
    );
  }
  const { missions } = res.data;
  return (
    <>
      <TopNav title="My Missions" subtitle="Weekly missions — earn XP and Intel Credits" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-electric/30 bg-electric/5" padded>
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Complete mission steps through your normal work. Rewards are granted automatically when a mission is completed — no privileged access is ever granted by missions.</p>
        </Card>
        {missions.length === 0 ? (
          <EmptyState title="No missions yet" message="Missions for your role will appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {missions.map((m) => <MissionCard key={m.id} m={m} />)}
          </div>
        )}
      </main>
    </>
  );
}
