// =============================================================================
// HSI Phase 38 — Stripe webhook endpoint. SERVER-ONLY (Node runtime). Verifies
// the Stripe signature, records every raw event to stripe_events (replay-safe via
// the unique event id), and syncs subscriptions / invoices / customers using the
// service-role client (no user session on a webhook — same trust boundary as the
// worker). Idempotent: a duplicate or unhandled event is acknowledged (200) and
// not re-applied. Invalid signature → 400. No RBAC/auth/middleware involvement.
// =============================================================================

import { NextResponse } from 'next/server';
import { classifyEvent, decideProcessing } from '@hsi/billing';
import { sdkConstructEvent, getPricing, webhookConfigured } from '@/lib/billing/stripe';
import { getServiceClient } from '@/lib/admin/guard';
import {
  applySubscriptionSync, snapshotFromStripeSubscription, recordInvoiceRow,
  billingAudit, orgIdForCustomer,
} from '@/lib/billing/sync';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ack = (extra: Record<string, unknown> = {}) => NextResponse.json({ received: true, ...extra });

export async function POST(req: Request): Promise<Response> {
  // 1. Verify signature on the RAW body.
  const signature = req.headers.get('stripe-signature') ?? '';
  const rawBody = await req.text();
  if (!webhookConfigured()) return ack({ skipped: 'not_configured' });
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const event = await sdkConstructEvent(rawBody, signature);
  if (!event?.id) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });

  // 2. Service-role client (server-only). No session on a webhook.
  const db = await getServiceClient();
  if (!db) return ack({ skipped: 'service_unavailable' }); // never retry-storm in dev

  // 3. Idempotency / replay protection (pure decision + DB unique constraint).
  let seen = new Set<string>();
  try {
    const { data } = await db.from('stripe_events').select('stripe_event_id').eq('stripe_event_id', event.id);
    seen = new Set(((data ?? []) as Array<{ stripe_event_id: string }>).map((r) => r.stripe_event_id));
  } catch { /* treat as unseen */ }

  const decision = decideProcessing(String(event.id), String(event.type), seen);
  if (!decision.process) return ack({ skipped: decision.reason, type: event.type });

  // 4. Persist the raw event (unique event id makes a concurrent duplicate fail).
  const obj = event.data?.object ?? {};
  const orgIdHint = (obj?.metadata?.organization_id as string) || null;
  try {
    const { error } = await db.from('stripe_events').insert({
      stripe_event_id: event.id, type: event.type, organization_id: orgIdHint, payload: event as unknown,
    });
    if (error) return ack({ skipped: 'duplicate_insert', type: event.type }); // lost the race → already handled
  } catch {
    return ack({ skipped: 'duplicate_insert', type: event.type });
  }

  // 5. Dispatch.
  let handlerError: string | null = null;
  try {
    const action = classifyEvent(String(event.type));
    if (action === 'sync_subscription') {
      // The object is a subscription (or a checkout.session referencing one).
      const subRaw = obj?.object === 'subscription' ? obj : obj?.subscription ? { id: obj.subscription, customer: obj.customer } : obj;
      const snap = snapshotFromStripeSubscription(subRaw, getPricing());
      if (snap) {
        const orgId = orgIdHint || (snap.stripeCustomerId ? await orgIdForCustomer(db, snap.stripeCustomerId) : null);
        if (orgId) await applySubscriptionSync(db, orgId, snap, 'webhook', null);
        else handlerError = 'org_not_resolved';
      }
    } else if (action === 'record_invoice') {
      const customerId = String(obj?.customer ?? '');
      const orgId = orgIdHint || (customerId ? await orgIdForCustomer(db, customerId) : null);
      if (orgId) {
        await recordInvoiceRow(db, orgId, obj);
        await billingAudit(db, { orgId, actor: null, action: String(event.type), next: { status: obj?.status }, source: 'webhook' });
      } else handlerError = 'org_not_resolved';
    } else if (action === 'record_customer') {
      const orgId = orgIdHint;
      const customerId = String(obj?.id ?? '');
      if (orgId && customerId) {
        await db.from('stripe_customers').upsert({ organization_id: orgId, stripe_customer_id: customerId, email: obj?.email ?? null }, { onConflict: 'organization_id' });
      }
    }
  } catch (e) {
    handlerError = e instanceof Error ? e.message : 'handler_error';
  }

  // 6. Mark processed (best-effort).
  try {
    await db.from('stripe_events').update({ processed: handlerError === null, processed_at: new Date().toISOString(), error: handlerError })
      .eq('stripe_event_id', event.id);
  } catch { /* best-effort */ }

  return ack({ type: event.type, processed: handlerError === null });
}
