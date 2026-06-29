// =============================================================================
// HSI Milestone 86 — beta-application & demo-request persistence (SERVER-ONLY).
//
// Inserts public-form submissions into beta_applications / demo_requests using the
// SERVICE-ROLE client (the only writer; the anon/browser key has no insert policy,
// see migration 0059). Dedups by normalized email within a recent window so a
// double-submit / refresh does not create duplicate rows. Admin list reads use the
// service-role-preferred public client on an already-admin-gated page.
//
// Everything is env-tolerant and NEVER throws: with no service-role key the
// persist functions return { persisted:false, reason:'not_configured' } and the
// route still succeeds for the user (validate-only degrade). No PII is logged.
//
// The orchestration (dedup-then-insert) is tested deterministically via an
// injectable client (opts.client); production passes none and uses getServiceClient.
// =============================================================================

import { getServiceClient } from '@/lib/admin/guard';
import { readPublicClient } from '@/lib/public-intelligence';
import { logError } from '@/lib/errors/format-error';
import {
  normalizeEmail,
  betaApplicationRow,
  demoRequestRow,
  type BetaApplicationInput,
  type DemoRequestInput,
} from './intake';

/** Default dedup window: collapse repeat submissions from the same email. */
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export type PersistResult =
  | { persisted: true; id: string; duplicate: false }
  | { persisted: false; duplicate: true } // existing recent row → treated as success
  | { persisted: false; reason: 'not_configured' | 'error' };

// Minimal Supabase surface used here (so tests can inject a fake without the SDK).
export interface IntakeClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): { gte(col: string, val: string): { limit(n: number): Promise<{ data: unknown[] | null }> } };
    };
    insert(row: Record<string, unknown>): { select(cols: string): { single(): Promise<{ data: unknown; error: { message: string } | null }> } };
  };
}

interface PersistOpts {
  nowIso?: string;
  windowMs?: number;
  /** Injected client for tests; production resolves the service-role client. */
  client?: IntakeClient | null;
}

async function resolveClient(opts: PersistOpts): Promise<IntakeClient | null> {
  if (opts.client !== undefined) return opts.client;
  return (await getServiceClient()) as unknown as IntakeClient | null;
}

async function recentExists(client: IntakeClient, table: string, email: string, sinceIso: string): Promise<boolean> {
  try {
    const { data } = await client.from(table).select('id').eq('email', email).gte('created_at', sinceIso).limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false; // never block a submission on a dedup read failure
  }
}

async function insertRow(client: IntakeClient, table: string, row: Record<string, unknown>, logScope: string): Promise<PersistResult> {
  try {
    const { data, error } = await client.from(table).insert(row).select('id').single();
    if (error) {
      logError(logScope, error.message);
      return { persisted: false, reason: 'error' };
    }
    return { persisted: true, id: (data as { id: string }).id, duplicate: false };
  } catch (e) {
    logError(logScope, e);
    return { persisted: false, reason: 'error' };
  }
}

async function persist(
  table: string,
  email: string,
  row: Record<string, unknown>,
  logScope: string,
  opts: PersistOpts,
): Promise<PersistResult> {
  const client = await resolveClient(opts);
  if (!client) return { persisted: false, reason: 'not_configured' };
  const windowMs = opts.windowMs ?? DEDUPE_WINDOW_MS;
  const nowMs = opts.nowIso ? new Date(opts.nowIso).getTime() : Date.now();
  const sinceIso = new Date(nowMs - windowMs).toISOString();
  if (await recentExists(client, table, email, sinceIso)) return { persisted: false, duplicate: true };
  return insertRow(client, table, row, logScope);
}

/** Persist a beta application (dedup by email within the window). */
export async function persistBetaApplication(input: BetaApplicationInput, opts: PersistOpts = {}): Promise<PersistResult> {
  const email = normalizeEmail(input.email);
  return persist('beta_applications', email, betaApplicationRow(input, email), 'beta-intake/apply', opts);
}

/** Persist a demo request (dedup by email within the window). */
export async function persistDemoRequest(input: DemoRequestInput, opts: PersistOpts = {}): Promise<PersistResult> {
  const email = normalizeEmail(input.email);
  return persist('demo_requests', email, demoRequestRow(input, email), 'beta-intake/demo', opts);
}

// ---- admin list reads (already-admin-gated pages) ---------------------------

export interface BetaApplicationListItem {
  id: string; name: string; email: string; organization: string | null;
  role: string; status: string; createdLabel: string;
}
export interface DemoRequestListItem {
  id: string; name: string; email: string; organization: string;
  useCase: string; status: string; createdLabel: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export async function listBetaApplications(limit = 100): Promise<BetaApplicationListItem[]> {
  const c = readPublicClient();
  if (!c) return [];
  try {
    const { data } = await c
      .from('beta_applications')
      .select('id, name, email, organization, role, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: (r.name as string) ?? '—',
      email: (r.email as string) ?? '—',
      organization: (r.organization as string | null) ?? null,
      role: (r.role as string) ?? '—',
      status: (r.status as string) ?? 'pending',
      createdLabel: fmtDate(r.created_at as string),
    }));
  } catch {
    return [];
  }
}

export async function listDemoRequests(limit = 100): Promise<DemoRequestListItem[]> {
  const c = readPublicClient();
  if (!c) return [];
  try {
    const { data } = await c
      .from('demo_requests')
      .select('id, name, email, organization, use_case, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: (r.name as string) ?? '—',
      email: (r.email as string) ?? '—',
      organization: (r.organization as string) ?? '—',
      useCase: (r.use_case as string) ?? '—',
      status: (r.status as string) ?? 'new',
      createdLabel: fmtDate(r.created_at as string),
    }));
  } catch {
    return [];
  }
}
