'use server';

// =============================================================================
// HSI Phase 62 — Notification server actions. THIN wrappers over the engine for
// client components. All return DbResult and NEVER throw; each revalidates the
// notifications route on success. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import * as engine from './service';
import type { DbResult } from './persistence';
import type { NotificationPreferences, NotificationType, NotificationSeverity } from './types';

const ROUTE = '/dashboard/notifications';
function rev(): void {
  try { revalidatePath(ROUTE); } catch { /* best-effort */ }
}

export async function markReadAction(id: string): Promise<DbResult<{ id: string }>> {
  const r = await engine.markRead(id);
  if (r.ok) rev();
  return r;
}

export async function markAllReadAction(): Promise<DbResult<{ updated: number }>> {
  const r = await engine.markAllRead();
  if (r.ok) rev();
  return r;
}

export async function archiveNotificationAction(id: string): Promise<DbResult<{ id: string }>> {
  const r = await engine.archiveNotification(id);
  if (r.ok) rev();
  return r;
}

export async function updatePreferencesAction(prefs: NotificationPreferences): Promise<DbResult<{ ok: true }>> {
  const r = await engine.updatePreferences(prefs);
  if (r.ok) rev();
  return r;
}

/**
 * Create a notification addressed to the actor (self). Used to exercise the
 * pipeline (admin "send test alert") and by future phases via the engine. Honors
 * preferences — may be suppressed.
 */
export async function createSelfNotificationAction(input: {
  type: NotificationType; severity?: NotificationSeverity; title: string; body?: string;
}): Promise<DbResult<{ id: string | null; suppressed: boolean }>> {
  const r = await engine.createNotification(input);
  if (r.ok) rev();
  return r;
}
