'use client';

// =============================================================================
// HSI Phase 65 — Narrative controls (client, admin). Create a narrative by seeding
// it with an Evidence Graph node id (deterministic clustering does the rest), and
// recompute an existing narrative. Calls admin-gated server actions.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Button } from '@hsi/ui';
import { Sparkles, RefreshCw } from 'lucide-react';
import { createNarrativeAction, recomputeNarrativeAction } from '@/lib/narrative-intelligence/actions';

export function CreateNarrativeForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [seedNodeId, setSeedNodeId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const r = await createNarrativeAction({ name, summary: summary || undefined, seedNodeId: seedNodeId.trim() });
      if (r.ok) {
        setMsg(`Created with ${r.data.members} members (${r.data.status}).`);
        setName(''); setSummary(''); setSeedNodeId('');
        router.push(`/dashboard/narratives/${r.data.narrativeId}` as never);
      } else setMsg(r.error ?? 'Create failed.');
    });

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Seed a narrative</h3></div>
      <p className="text-caption text-text-muted">Pick a node id from the Evidence Graph; membership is expanded deterministically over real edges — no AI inference.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Narrative name" aria-label="Narrative name" />
        <Input value={seedNodeId} onChange={(e) => setSeedNodeId(e.target.value)} placeholder="Seed graph node id (uuid)" aria-label="Seed node id" />
      </div>
      <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary (optional)" aria-label="Summary" />
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending || !name.trim() || !seedNodeId.trim()} onClick={submit}><Sparkles className="h-4 w-4" /> Create narrative</Button>
        {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
      </div>
    </Card>
  );
}

export function RecomputeNarrativeButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await recomputeNarrativeAction(id);
      setMsg(r.ok ? `Recomputed: ${r.data.members} members, ${r.data.status}.` : (r.error ?? 'Failed.'));
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" disabled={pending} onClick={run}><RefreshCw className="h-4 w-4" /> {pending ? 'Recomputing…' : 'Recompute'}</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
