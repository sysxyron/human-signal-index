// =============================================================================
// Invoice shaping + formatting — PURE. Normalizes raw Stripe-ish invoice objects
// into InvoiceSummary and provides display helpers. No SDK, no network.
// =============================================================================

import type { InvoiceSummary } from './types';
import { formatAmount } from './stripe';

/** Loose shape of a Stripe invoice (only the fields we read). */
export interface RawInvoice {
  id?: string;
  number?: string | null;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  status?: string;
  created?: number; // unix seconds
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
}

/** Normalize a raw invoice into an InvoiceSummary. PURE. */
export function summarizeInvoice(raw: RawInvoice): InvoiceSummary {
  return {
    id: raw.id ?? '',
    number: raw.number ?? null,
    amountDue: Math.max(0, Math.floor(raw.amount_due ?? 0)),
    amountPaid: Math.max(0, Math.floor(raw.amount_paid ?? 0)),
    currency: (raw.currency ?? 'usd').toLowerCase(),
    status: raw.status ?? 'draft',
    createdAt: typeof raw.created === 'number' ? new Date(raw.created * 1000).toISOString() : null,
    hostedInvoiceUrl: raw.hosted_invoice_url ?? null,
    pdfUrl: raw.invoice_pdf ?? null,
  };
}

/** Newest-first by createdAt. PURE (stable). */
export function sortInvoices(invoices: InvoiceSummary[]): InvoiceSummary[] {
  return [...invoices].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

/** Display amount for an invoice (paid amount when paid, else amount due). PURE. */
export function invoiceDisplayAmount(inv: InvoiceSummary): string {
  const amount = inv.status === 'paid' ? inv.amountPaid : inv.amountDue;
  return formatAmount(amount, inv.currency);
}

export const PAID_STATUSES = new Set(['paid']);
export function isInvoicePaid(inv: InvoiceSummary): boolean {
  return PAID_STATUSES.has(inv.status);
}
