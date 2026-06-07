// =============================================================================
// WorldForge Phase 3 — New research run (Server shell).
// Reads the authenticated user and passes isAuthenticated to the client form so
// the createResearchRunAction is auth-gated. force-dynamic so the session is not
// evaluated during static prerender.
// =============================================================================

import Link from 'next/link';
import { TopNav } from '@hsi/ui';
import { ArrowLeft } from 'lucide-react';
import { getUser } from '@/lib/supabase/server';
import { ConceptForm } from '@/components/worldforge/research/ConceptForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NewResearchPage() {
  const user = await getUser();
  return (
    <>
      <TopNav title="New research" subtitle="Describe a world to investigate" />
      <main className="mx-auto max-w-3xl space-y-5 p-5 lg:p-6">
        <Link
          href={'/dashboard/worldforge/research' as never}
          className="inline-flex items-center gap-1.5 text-caption font-semibold text-text-secondary transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All research runs
        </Link>
        <ConceptForm isAuthenticated={Boolean(user)} />
      </main>
    </>
  );
}
