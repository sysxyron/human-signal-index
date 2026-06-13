'use client';

// =============================================================================
// HSI Phase 19 / Post-V1 — NewReportForm. Drafts a new public report via the
// existing, governed createPublicationAction (curator+). The report is created in
// DRAFT state and NEVER published automatically — it enters the review queue and
// a human reviewer must approve it. This component exposes existing functionality
// through the previously-missing /dashboard/publishing/new route; it adds no new
// behaviour.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card } from '@hsi/ui';
import { Loader2, Plus, FileText, ArrowRight } from 'lucide-react';
import { createPublicationAction } from '@/lib/publishing/actions';
import { SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
}

export function NewReportForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ slug: string } | null>(null);

  const submit = () => {
    setError(null);
    if (title.trim().length === 0) { setError('A report title is required.'); return; }
    if (summary.trim().length === 0) { setError('A short summary is required.'); return; }
    start(async () => {
      const res = await createPublicationAction({
        slug: slugify(title),
        title: title.trim(),
        summary: summary.trim(),
        topics: topic.trim() ? [topic.trim()] : [],
      });
      if (res.ok) {
        setCreated({ slug: res.data.slug });
        setTitle(''); setTopic(''); setSummary('');
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  if (created) {
    return (
      <Card className="space-y-3 border-verified/40 bg-verified/5" padded>
        <SuccessNotice message="Draft report created. It is now in the review queue awaiting human approval." />
        <div className="flex flex-wrap gap-2">
          <Link href={'/dashboard/publishing' as never} className="inline-flex">
            <Button variant="primary" size="sm">Go to Publishing <ArrowRight className="h-4 w-4" /></Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>Draft another</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4" padded>
      <div className="space-y-1.5">
        <label className="text-label font-semibold uppercase tracking-wide text-text-muted">Report title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Q3 Narrative Landscape Review"
          className="w-full rounded-card border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-label font-semibold uppercase tracking-wide text-text-muted">Topic</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Recruitment, Influence Ops, Civic"
          className="w-full rounded-card border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-label font-semibold uppercase tracking-wide text-text-muted">Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="A short, evidence-backed summary of the finding…"
          className="w-full rounded-card border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save draft
        </Button>
        <span className="inline-flex items-center gap-1.5 text-caption text-text-muted">
          <FileText className="h-3.5 w-3.5" /> Saved as a draft — never published automatically.
        </span>
      </div>

      {error ? <ErrorState title="Could not create the draft" message={error} /> : null}
    </Card>
  );
}
