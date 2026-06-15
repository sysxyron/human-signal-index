'use client';

// =============================================================================
// HSI Phase 32 — admin beta issue review queue (client). Admin-only (page gates +
// the DAL re-checks requireAdmin). Update an issue's triage status inline.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@hsi/ui';
import { updateIssueStatusAction, type BetaIssueRow } from '@/lib/beta/tester';

const STATUSES = ['open', 'triaged', 'in_progress', 'resolved', 'closed'];
const SEV_COLOR: Record<string, string> = { low: '#94A3B8', medium: '#38BDF8', high: '#F59E0B', critical: '#EF4444' };

export function BetaIssueQueue({ issues, readonly }: { issues: BetaIssueRow[]; readonly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Record<string, string>>({});

  function setStatus(id: string, status: string) {
    setLocal((m) => ({ ...m, [id]: status }));
    if (readonly) return;
    startTransition(async () => { await updateIssueStatusAction(id, status); router.refresh(); });
  }

  if (issues.length === 0) return <Card className="py-8 text-center text-caption text-text-muted" padded>No issues reported.</Card>;
  return (
    <Card className="overflow-x-auto border-border p-0" padded={false}>
      <table className="w-full text-caption">
        <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
          <tr><th className="px-4 py-2 text-left">Title</th><th className="px-4 py-2 text-left">Category</th><th className="px-4 py-2 text-left">Severity</th><th className="px-4 py-2 text-left">Reporter</th><th className="px-4 py-2 text-left">Status</th></tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.id} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2 text-text-primary">{i.title}</td>
              <td className="px-4 py-2 capitalize text-text-secondary">{i.category}</td>
              <td className="px-4 py-2"><span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${SEV_COLOR[i.severity]}1f`, color: SEV_COLOR[i.severity] }}>{i.severity}</span></td>
              <td className="px-4 py-2 text-text-muted">{i.reporter ?? '—'}</td>
              <td className="px-4 py-2">
                <select value={local[i.id] ?? i.status} disabled={readonly || pending} onChange={(e) => setStatus(i.id, e.target.value)} className="rounded-card border border-border bg-surface px-2 py-1 text-label text-text-primary disabled:opacity-60">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
