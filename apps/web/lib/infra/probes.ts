// =============================================================================
// HSI Phase 70.1 — Infrastructure health composition (SERVER-ONLY). REUSES the
// existing Phase health probes (db/auth/storage) and adds lightweight subsystem
// reachability checks (notifications/agents/forecast/marketplace/transparency)
// via head-count queries. No new probing engine. Never throws.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { probeAuth, probeRest, probeStorage } from '@/lib/health/probes';
import { readPublicClient } from '@/lib/public-intelligence';
import { healthStateFromStatus, type SubsystemHealth, type HealthState } from './types';

async function tableReachable(c: SupabaseClient | null, table: string): Promise<HealthState> {
  if (!c) return 'unconfigured';
  try {
    const { error } = await c.from(table).select('id', { count: 'exact', head: true });
    return error ? 'down' : 'ok';
  } catch { return 'down'; }
}

/** The 8-subsystem infrastructure health board (Deliverable 1). */
export async function getInfrastructureHealth(): Promise<SubsystemHealth[]> {
  const c = readPublicClient();
  const [rest, auth, storage, notifications, agents, forecast, marketplace, transparency] = await Promise.all([
    probeRest(), probeAuth(), probeStorage(),
    tableReachable(c, 'notifications'),
    tableReachable(c, 'agents'),
    tableReachable(c, 'forecasts'),
    tableReachable(c, 'marketplace_products'),
    tableReachable(c, 'hsin_sources'),
  ]);
  return [
    { name: 'Database', state: healthStateFromStatus(rest.status, rest.ok), detail: rest.message },
    { name: 'Auth', state: healthStateFromStatus(auth.status, auth.ok), detail: auth.message },
    { name: 'Storage', state: healthStateFromStatus(storage.status, storage.ok), detail: storage.message },
    { name: 'Notifications', state: notifications, detail: notifications === 'ok' ? 'Notification framework reachable.' : 'Not reachable.' },
    { name: 'Agents', state: agents, detail: agents === 'ok' ? 'Agent registry reachable.' : 'Not reachable.' },
    { name: 'Forecast Engine', state: forecast, detail: forecast === 'ok' ? 'Forecast tables reachable.' : 'Not reachable.' },
    { name: 'Marketplace', state: marketplace, detail: marketplace === 'ok' ? 'Marketplace catalog reachable.' : 'Not reachable.' },
    { name: 'Transparency Portal', state: transparency, detail: transparency === 'ok' ? 'Public intelligence source reachable.' : 'Not reachable.' },
  ];
}
