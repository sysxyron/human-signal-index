// =============================================================================
// Timelines — Server Component shell.
// Reads the authenticated user and passes isAuthenticated to the client child so
// the save action is gated. force-dynamic so `next build` does not evaluate the
// session during static prerender.
// =============================================================================

import { getUser } from '@/lib/supabase/server';
import { TimelinesClient } from './TimelinesClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TimelinesPage() {
  const user = await getUser();
  return <TimelinesClient isAuthenticated={Boolean(user)} />;
}
