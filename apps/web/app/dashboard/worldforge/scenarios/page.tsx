// =============================================================================
// Scenario Sandbox — Server Component shell.
// Reads the authenticated user (server client) and passes isAuthenticated to the
// client child so save actions can be gated. force-dynamic so `next build` does
// not evaluate the session during static prerender.
// =============================================================================

import { getUser } from '@/lib/supabase/server';
import { ScenarioSandboxClient } from './ScenarioSandboxClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ScenarioSandboxPage() {
  const user = await getUser();
  return <ScenarioSandboxClient isAuthenticated={Boolean(user)} />;
}
