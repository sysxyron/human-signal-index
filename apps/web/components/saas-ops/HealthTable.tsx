'use client';

// HSI Phase 39 — subscription health table with status filters (client). Read-only
// oversight: health score, churn risk, plan, usage trend. Filtering is client-side
// over admin-gated rows. No writes.
import { useState } from 'react';
import { Card } from '@hsi/ui';
import type { HealthRow } from '@/lib/saas-ops/operations';

const HEALTH_COLOR: Record<string, string> = { healthy: '#10B981', warning: '#F59E0B', 'at-risk': '#EF4444' };
const RISK_COLOR: Record<string, string> = { low: '#10B981', medium: '#F59E0B', high: '#EF4444' };
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'healthy', label: 'Healthy' }, { key: 'warning', label: 'Warning' }, { key: 'at-risk', label: 'At-risk' },
];

export function HealthTable({ rows }: { rows: HealthRow[] }) {
  const [filter, setFilter] = useState('all');
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? rows.length : rows.filter((r) => r.status === f.key).length;
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
            <tr><th className="px-4 py-2.5 text-left">Organization</th><th className="px-4 py-2.5 text-left">Plan</th><th className="px-4 py-2.5 text-left">Health</th><th className="px-4 py-2.5 text-right">Score</th><th className="px-4 py-2.5 text-left">Churn risk</th><th className="px-4 py-2.5 text-left">Signals</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.orgId} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-text-primary">{r.orgName}<div className="text-label text-text-muted">{r.reasons[0]}</div></td>
                <td className="px-4 py-2.5 text-text-secondary">{r.plan}</td>
                <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${HEALTH_COLOR[r.status]}1f`, color: HEALTH_COLOR[r.status] }}>{r.status}</span></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.score}</td>
                <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${RISK_COLOR[r.churnRisk]}1f`, color: RISK_COLOR[r.churnRisk] }}>{r.churnRisk}</span></td>
                <td className="px-4 py-2.5 tabular-nums text-text-muted">{r.usageTrend > 0 ? '+' : ''}{Math.round(r.usageTrend * 100)}%</td>
              </tr>
            ))}
            {shown.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-text-muted">No organizations match this filter.</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
