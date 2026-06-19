'use client';

// =============================================================================
// HSI Phase 64 — Evidence Graph controls (client). Node search (navigates to
// ?q=…, server-side paged) + admin "Rebuild graph" (deterministic builder).
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Button } from '@hsi/ui';
import { Search, RefreshCw } from 'lucide-react';
import { rebuildGraphAction } from '@/lib/evidence-graph/actions';

export function GraphSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); router.push(`/dashboard/evidence-graph?q=${encodeURIComponent(q.trim())}` as never); }}
    >
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search nodes by label…" className="min-w-[240px] flex-1" aria-label="Search graph nodes" />
      <Button type="submit" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
    </form>
  );
}

export function RebuildGraphButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await rebuildGraphAction();
      setMsg(r.ok ? `Graph rebuilt: ${r.data.nodes} nodes, ${r.data.edges} edges.` : (r.error ?? 'Rebuild failed.'));
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" disabled={pending} onClick={run}><RefreshCw className="h-4 w-4" /> {pending ? 'Rebuilding…' : 'Rebuild graph'}</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
