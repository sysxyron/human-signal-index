'use client';

// HSI Phase 38 — admin subscriptions table with status filters (client). Read-only
// oversight: plan, status, MRR, renewal, usage. Filtering is client-side over rows
// the admin-gated DAL already returned. No writes here.
import { useState } from 'react';
import { Card } from '@hsi/ui';
import type { BillingSubscriptionRow } from '@/lib/billing/billing';

const STATUS_COLOR: Record<string, string> = { active: '#10B981', trial: '#3B82F6', past_due: '#F97316', paused: '#F59E0B', expired: '#94A3B8', canceled: '#94A3B8' };
const FILTERS: Array<{ key: string; label: string; match: (s: string) => boolean }> = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'active', label: 'Active', match: (s) => s === 'active' },
  { key: 'trial', label: 'Trialing', match: (s) => s === 'trial' || s === 'trialing' },
  { key: 'past_due', label: 'Past due', match: (s) => s === 'past_due' },
  { key: 'canceled', label: 'Canceled', match: (s) => s === 'expired' || s === 'canceled' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export function SubscriptionsTable({ rows }: { rows: BillingSubscriptionRow[] }) {
  const [filter, setFilter] = useState('all');
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = rows.filter((r) => active.match(r.status));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? rows.length : rows.filter((r) => f.match(r.status)).length;
          return (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className={`rounded-btn px-3 py-1.5 text-label font-semibold transition ${filter === f.key ? 'bg-primary/20 text-white' : 'border border-border text-text-secondary hover:bg-surface-2'}`}>
              {f.label} <span className="tabular-nums text-text-muted">{count}</span>
            </button>
          );
        })}
      </div>
      <Card className="overflow-x-auto border-border p-0" padded={false}>
        <table className="w-full text-caption">
          <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
            <tr><th className="px-4 py-2.5 text-left">Organization</th><th className="px-4 py-2.5 text-left">Plan</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">Cycle</th><th className="px-4 py-2.5 text-right">MRR</th><th className="px-4 py-2.5 text-left">Renews</th><th className="px-4 py-2.5 text-right">Invest.</th><th className="px-4 py-2.5 text-right">Contrib.</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.orgId} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-text-primary">{r.orgName}{r.cancelAtPeriodEnd ? <span className="ml-1.5 rounded-full bg-risk/15 px-1.5 py-0.5 text-[10px] font-semibold text-risk">cancelling</span> : null}</td>
                <td className="px-4 py-2.5 text-text-secondary">{r.plan}</td>
                <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${STATUS_COLOR[r.status] ?? '#94A3B8'}1f`, color: STATUS_COLOR[r.status] ?? '#94A3B8' }}>{r.status.replace('_', ' ')}</span></td>
                <td className="px-4 py-2.5 capitalize text-text-muted">{r.billingCycle}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.mrrLabel}</td>
                <td className="px-4 py-2.5 text-text-muted">{fmtDate(r.renewalDate)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.investigations.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.contributors.toLocaleString()}</td>
              </tr>
            ))}
            {shown.length === 0 ? <tr><td colSpan={8} className="px-4 py-6 text-center text-text-muted">No organizations match this filter.</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
