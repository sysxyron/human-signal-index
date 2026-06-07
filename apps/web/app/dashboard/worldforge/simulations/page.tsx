// =============================================================================
// Simulations — Server Component shell.
// Loads worlds + simulations from Supabase (force-dynamic so `next build` does
// not run queries) and hands them to the client child. On error / empty it still
// renders the client child, which falls back to engine demo worlds.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { listWorlds, listSimulations } from '@/lib/worldforge/persistence';
import { getUser } from '@/lib/supabase/server';
import { SimulationsClient } from '@/components/worldforge/SimulationsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SimulationsPage() {
  const [worldsRes, simsRes, user] = await Promise.all([
    listWorlds(),
    listSimulations(),
    getUser(),
  ]);

  return (
    <>
      <TopNav title="Simulations" subtitle="Per-world reports, versioning & diff" />
      <SimulationsClient
        worlds={worldsRes.ok ? worldsRes.data : []}
        simulations={simsRes.ok ? simsRes.data : []}
        loadError={!worldsRes.ok ? worldsRes.error : null}
        isAuthenticated={Boolean(user)}
      />
    </>
  );
}
