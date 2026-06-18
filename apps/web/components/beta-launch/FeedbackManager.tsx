'use client';

// =============================================================================
// HSI Phase 60 — Beta feedback system (client). Submit feedback (any signed-in
// user; RLS owner-insert) + admin status management (Open → Reviewing → Planned →
// Completed). Calls server actions; refreshes on success.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Button } from '@hsi/ui';
import { MessageSquare, Send } from 'lucide-react';
import { submitBetaFeedbackAction, setFeedbackStatusAction } from '@/lib/beta-launch/actions';
import type { FeedbackSummary, FeedbackItem } from '@/lib/beta-launch/persistence';

const CATEGORIES = [
  { value: 'bug', label: 'Bug' }, { value: 'ux', label: 'UX' }, { value: 'workflow', label: 'Workflow' },
  { value: 'trust', label: 'Trust' }, { value: 'forecasting', label: 'Forecasting' }, { value: 'source_quality', label: 'Source Quality' },
  { value: 'feature_request', label: 'Feature Request' }, { value: 'other', label: 'Other' },
];
const STATUSES = ['open', 'reviewing', 'planned', 'completed'];
const STATUS_COLOR: Record<string, string> = { open: '#F59E0B', reviewing: '#3B82F6', planned: '#8B5CF6', completed: '#10B981' };
const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export function FeedbackManager({ summary, recent }: { summary: FeedbackSummary; recent: FeedbackItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [category, setCategory] = useState('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, clear = false) =>
    start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) { if (clear) { setTitle(''); setBody(''); } router.refresh(); } });

  const cells = [
    { label: 'Open', value: summary.open }, { label: 'Reviewing', value: summary.reviewing },
    { label: 'Planned', value: summary.planned }, { label: 'Completed', value: summary.completed },
  ];

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Beta feedback</h3><span className="ml-auto text-caption text-text-muted">{summary.total} total</span></div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums" style={{ color: STATUS_COLOR[c.label.toLowerCase()] }}>{c.value}</div><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{c.label}</div></div>)}
      </div>

      {/* submit */}
      <div className="space-y-2 rounded-card border border-border bg-background-deep/40 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Category">
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" className="min-w-[200px] flex-1" aria-label="Feedback title" />
        </div>
        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details (optional)" aria-label="Feedback details" />
        <Button variant="primary" disabled={pending || !title.trim()} onClick={() => run(() => submitBetaFeedbackAction({ category, title, body: body || undefined }), 'Feedback submitted.', true)}><Send className="h-4 w-4" /> Submit feedback</Button>
      </div>

      {/* recent + status management */}
      {recent.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-6 text-center text-caption text-text-muted">No feedback yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <span className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-medium text-text-secondary">{catLabel(f.category)}</span>
              <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{f.title}</span>
              <span className="shrink-0 text-caption text-text-muted">{f.createdLabel}</span>
              <select value={f.status} disabled={pending} onChange={(e) => run(() => setFeedbackStatusAction(f.id, e.target.value), 'Status updated.')} className="shrink-0 rounded-btn border border-border bg-surface/80 px-2 py-1 text-[11px] font-semibold" style={{ color: STATUS_COLOR[f.status] }} aria-label="Status">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}

      {msg ? <p className="text-caption text-text-muted">{msg}</p> : null}
    </Card>
  );
}
