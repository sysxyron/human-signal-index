// =============================================================================
// Provenance — Server Component shell.
// Reads the authenticated user and passes isAuthenticated to the client child so
// the persist action is gated. force-dynamic so `next build` does not evaluate
// the session during static prerender.
// =============================================================================

import { getUser } from '@/lib/supabase/server';
import { ProvenanceClient } from './ProvenanceClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProvenancePage() {
  const user = await getUser();
  return <ProvenanceClient isAuthenticated={Boolean(user)} />;
}
