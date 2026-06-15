// =============================================================================
// HSI Phase 35 — Organization Dashboard (/dashboard/org). Server Component,
// force-dynamic. Any signed-in user (scoped to their current org). Profile +
// member/contributor/investigation/publication/trust metrics. Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { Building2, Users, Microscope, FileText, ShieldCheck, ArrowRight } from 'lucide-react';
import { getOrgDashboardAction } from '@/lib/org/organizations';
import { MEMBERSHIP_LABEL } from '@/lib/org/membership';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgDashboardPage() {
  const res = await getOrgDashboardAction();
  if (!res.ok) {
    return (<><TopNav title="Organization" subtitle="Your workspace" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load organization" message="Your workspace is unavailable right now." redirectedFrom="/dashboard/org" /></main></>);
  }
  const d = res.data;
  return (
    <>
      <TopNav title={d.org.name} subtitle="Organization workspace" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex flex-wrap items-center justify-between gap-4 border-electric/30 bg-electric/5" padded>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-card bg-gradient-to-br from-primary to-accent text-white"><Building2 className="h-6 w-6" /></span>
            <div>
              <div className="text-h5 font-semibold text-text-primary">{d.org.name}</div>
              <div className="text-caption text-text-secondary">/{d.org.slug} · you are {MEMBERSHIP_LABEL[d.membershipRole]}{d.platformAdmin ? ' · platform admin' : ''}</div>
            </div>
          </div>
          <Link href={"/dashboard/org/members" as never} className="inline-flex items-center gap-1.5 rounded-card border border-border bg-surface/50 px-3 py-2 text-caption text-text-secondary hover:text-text-primary"><Users className="h-4 w-4" /> Members <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Card>
        {d.org.description ? <p className="text-caption text-text-secondary">{d.org.description}</p> : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['Members', d.members, Users], ['Investigations', d.investigations, Microscope], ['Publications', d.publications, FileText], ['Avg trust', d.avgTrust, ShieldCheck]] as Array<[string, number, React.ComponentType<{ className?: string }>]>).map(([label, n, Icon]) => (
            <Card key={label} className="space-y-1 border-border" padded><div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Icon className="h-3.5 w-3.5" /> {label}</div><div className="text-h4 font-bold tabular-nums text-text-primary">{n.toLocaleString()}</div></Card>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-label text-text-muted"><ShieldCheck className="h-3.5 w-3.5" /> All data is scoped to this organization. Switch workspaces from the header. Membership never changes your platform access.</p>
      </main>
    </>
  );
}
