// =============================================================================
// HSI Phase 36 — Create Organization (/dashboard/org/create). Server Component,
// force-dynamic. Any signed-in user can self-provision a workspace (becomes owner).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Building2 } from 'lucide-react';
import { getUser } from '@/lib/supabase/server';
import { OrgCreateForm } from '@/components/org/OrgCreateForm';
import { ErrorState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgCreatePage() {
  const user = await getUser();
  if (!user) {
    return (<><TopNav title="Create Organization" subtitle="New workspace" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code="AUTH_REQUIRED" title="Sign in required" message="Sign in to create an organization." redirectedFrom="/dashboard/org/create" /></main></>);
  }
  return (
    <>
      <TopNav title="Create Organization" subtitle="Spin up a new isolated workspace" />
      <main className="mx-auto max-w-2xl space-y-6 p-5 lg:p-6">
        <Card className="flex items-start gap-3 border-electric/30 bg-electric/5" padded>
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">A new organization is a fully isolated tenant — its own contributors, investigations, publications, and trust graph. You become its owner.</p>
        </Card>
        <OrgCreateForm />
      </main>
    </>
  );
}
