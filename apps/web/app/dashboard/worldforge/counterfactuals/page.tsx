// =============================================================================
// Counterfactuals — Server Component shell.
// Reads the authenticated user and passes isAuthenticated to the client child so
// the save action is gated. force-dynamic so `next build` does not evaluate the
// session during static prerender.
// =============================================================================

import { getUser } from '@/lib/supabase/server';
import { CounterfactualsClient } from './CounterfactualsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CounterfactualsPage() {
  const user = await getUser();
  return <CounterfactualsClient isAuthenticated={Boolean(user)} />;
}
