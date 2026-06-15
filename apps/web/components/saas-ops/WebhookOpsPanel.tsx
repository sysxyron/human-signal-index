'use client';

// HSI Phase 39 — webhook operations panel (client). Shows processed/failed/dead-
// letter counts and the dead-letter queue with replay (admin-gated DAL, replay-safe
// + idempotent). No secrets here.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, Inbox } from 'lucide-react';
import { replayWebhookAction, type WebhookOpsView } from '@/lib/saas-ops/operations';

export function WebhookOpsPanel({ data }: { data: WebhookOpsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const replay = (eventId: string) => {
    setMsg(null); setBusy(eventId);
    startTransition(async () => {
      const r = await replayWebhookAction(eventId);
      setMsg(r.ok ? 'Replayed successfully.' : (r.error ?? 'Replay failed.'));
      setBusy(null);
      if (r.ok) router.refresh();
    });
  };

  const cards: Array<{ label: string; value: number; icon: typeof CheckCircle2; tint: string }> = [
    { label: 'Processed', value: data.processed, icon: CheckCircle2, tint: '#10B981' },
    { label: 'Failed', value: data.failed, icon: AlertTriangle, tint: '#F59E0B' },
    { label: 'Dead-letter', value: data.deadLettered, icon: Inbox, tint: '#EF4444' },
    { label: 'Replayable', value: data.replayable, icon: RefreshCw, tint: '#3B82F6' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => { const Icon = c.icon; return (
          <Card key={c.label} className="space-y-1 border-border" padded>
            <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Icon className="h-3.5 w-3.5" style={{ color: c.tint }} /> {c.label}</div>
            <div className="text-h5 font-bold tabular-nums text-text-primary">{c.value.toLocaleString()}</div>
          </Card>
        ); })}
      </div>
      {msg ? <div className="rounded-card border border-border bg-surface/50 px-4 py-2.5 text-caption text-text-secondary">{msg}</div> : null}
      <div>
        <h2 className="mb-2 text-label uppercase tracking-wide text-text-muted">Dead-letter queue</h2>
        {data.deadletters.length === 0 ? (
          <Card className="border-border" padded><p className="text-caption text-text-muted">No unresolved failed events. 🎉</p></Card>
        ) : (
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Event</th><th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-right">Attempts</th><th className="px-4 py-2.5 text-left">Last error</th><th className="px-4 py-2.5 text-right">Action</th></tr>
              </thead>
              <tbody>
                {data.deadletters.map((d) => (
                  <tr key={d.stripeEventId} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-label text-text-secondary">{d.stripeEventId.slice(0, 18)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{d.type}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">{d.attempts}</td>
                    <td className="px-4 py-2.5 text-risk">{d.lastError ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="secondary" disabled={pending || !d.replayable} onClick={() => replay(d.stripeEventId)}>
                        {busy === d.stripeEventId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Replay
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
