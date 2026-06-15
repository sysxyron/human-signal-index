// =============================================================================
// HSI Phase 35 — Organization Members (/dashboard/org/members). Server Component,
// force-dynamic. Manage members of your CURRENT org (invite/role/remove) — gated
// by ORG membership role (owner/administrator), never global RBAC. Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { requireOrganization, getOrganizationMembers } from '@/lib/org/organizations';
import { canManageMembers } from '@/lib/org/membership';
import { OrgMembersConsole } from '@/components/org/OrgMembersConsole';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgMembersPage() {
  const ctx = await requireOrganization();
  if (!ctx.ok) {
    return (<><TopNav title="Members" subtitle="Organization members" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={ctx.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load organization" message="Unavailable right now." redirectedFrom="/dashboard/org/members" /></main></>);
  }
  const membersRes = await getOrganizationMembers(ctx.data.org.id);
  const members = membersRes.ok ? membersRes.data : [];
  const canManage = canManageMembers(ctx.data.membershipRole) || ctx.data.platformAdmin;

  return (
    <>
      <TopNav title="Members" subtitle={`${ctx.data.org.name} — members & roles`} />
      <main className="space-y-6 p-5 lg:p-6">
        {ctx.demo ? <OfflineDemoBanner /> : null}
        <Link href={"/dashboard/org" as never} className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Organization</Link>
        <Card className="flex items-start gap-2.5 border-border" padded>
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Organization roles control what members can do <strong className="text-text-primary">within this workspace</strong>. They never change a member&apos;s platform access (RBAC). Changes are audited.</p>
        </Card>
        {membersRes.ok || ctx.demo ? <OrgMembersConsole orgId={ctx.data.org.id} members={members} canManage={canManage} /> : <ErrorState title="Could not load members" message="Unavailable right now." />}
      </main>
    </>
  );
}
