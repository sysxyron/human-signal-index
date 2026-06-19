'use server';

// =============================================================================
// HSI Phase 69 — Marketplace server actions. Admin mutations (publish / archive /
// feature / pin / version / publisher) reuse the IAM guard for audit; the RBAC-
// enforcing service does the work. Signed-in users favorite / rate. View +
// download events are logged (real counters). Return DbResult; never throw.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, recordSecurityAudit } from '@/lib/admin/guard';
import { createClient, getUser } from '@/lib/supabase/server';
import * as svc from './service';
import { logEventDal } from './persistence';
import type { DbResult, CreateProductInput } from './persistence';

function rev(path?: string): void { try { revalidatePath('/marketplace'); if (path) revalidatePath(path); revalidatePath('/dashboard/marketplace'); } catch { /* best-effort */ } }

// ---- admin ------------------------------------------------------------------

export async function publishProductAction(input: Omit<CreateProductInput, 'slug'> & { slug?: string; publish?: boolean }): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.publishMarketplaceProduct(input);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'MARKETPLACE_PUBLISH', message: `Marketplace product published: ${input.title}.`, metadata: { id: r.data.id, type: input.productType } }); rev(); }
  return r;
}

export async function archiveProductAction(id: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.archiveMarketplaceProduct(id);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'MARKETPLACE_ARCHIVE', message: `Marketplace product archived: ${id}.`, metadata: { id } }); rev(); }
  return r;
}

export async function setProductStatusAction(id: string, status: 'draft' | 'published' | 'archived'): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.setProductStatus(id, status);
  if (r.ok) rev();
  return r;
}

export async function featureProductAction(id: string, value: boolean): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.featureProduct(id, value);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'MARKETPLACE_FEATURE', message: `Marketplace product ${value ? 'featured' : 'unfeatured'}: ${id}.`, metadata: { id, value } }); rev(); }
  return r;
}

export async function pinProductAction(id: string, value: boolean): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.pinProduct(id, value);
  if (r.ok) rev();
  return r;
}

export async function versionProductAction(id: string, changelog: string): Promise<DbResult<{ version: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.versionProduct(id, changelog);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'MARKETPLACE_VERSION', message: `Marketplace product ${id} → v${r.data.version}.`, metadata: { id, version: r.data.version } }); rev(); }
  return r;
}

export async function createPublisherAction(name: string, bio?: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.createPublisher(name, bio);
  if (r.ok) rev();
  return r;
}

// ---- authed engagement ------------------------------------------------------

export async function favoriteProductAction(productId: string, on: boolean): Promise<DbResult<{ favorited: boolean }>> {
  const r = await svc.favoriteProduct(productId, on);
  if (r.ok) rev();
  return r;
}

export async function rateProductAction(productId: string, rating: number, review?: string): Promise<DbResult<{ rating: number }>> {
  const r = await svc.rateProduct(productId, rating, review);
  if (r.ok) rev();
  return r;
}

// ---- engagement counters (any visitor) -------------------------------------

export async function logViewAction(productId: string): Promise<{ ok: true }> {
  const user = await getUser();
  await logEventDal(createClient(), productId, 'view', user?.id ?? null);
  return { ok: true };
}

export async function logDownloadAction(productId: string): Promise<{ ok: true }> {
  const user = await getUser();
  await logEventDal(createClient(), productId, 'download', user?.id ?? null);
  return { ok: true };
}
