'use client';

// =============================================================================
// HSI Phase 23 — IssueReportForm (BETA ISSUE SYSTEM). A governed placeholder:
// validates a tester's bug report and acknowledges receipt with a reference. It
// does NOT persist or trigger any automated action — beta issues are reviewed by
// a human. Clearly labeled so testers know reports are acknowledged, not stored.
// =============================================================================

import { useState, useTransition } from 'react';
import { Button, Card } from '@hsi/ui';
import { Loader2, Send, FlaskConical } from 'lucide-react';
import { submitBetaIssueAction, type SubmitIssueInput } from '@/lib/launch/actions';
import { SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import type { IssueSeverity } from '@/lib/launch/types';

const SEVERITIES: { value: IssueSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical — data loss / security / cannot use' },
  { value: 'high', label: 'High — major feature broken' },
  { value: 'medium', label: 'Medium — feature impaired, workaround exists' },
  { value: 'low', label: 'Low — cosmetic / minor' },
];

const field = 'w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none';

export function IssueReportForm() {
  const [pending, start] = useTransition();
  const [form, setForm] = useState<SubmitIssueInput>({
    title: '', route: '', role: '', severity: 'medium',
    stepsToReproduce: '', expectedBehavior: '', actualBehavior: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const set = (k: keyof SubmitIssueInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setError(null); setRef(null);
    start(async () => {
      const res = await submitBetaIssueAction(form);
      if (res.ok) {
        setRef(res.data.reference);
        setForm({ title: '', route: '', role: '', severity: 'medium', stepsToReproduce: '', expectedBehavior: '', actualBehavior: '' });
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-accent" />
        <h3 className="text-h6 font-semibold text-text-primary">Report a beta issue</h3>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-label font-semibold uppercase tracking-wide text-accent">Beta issue system</span>
      </div>

      <input className={field} placeholder="Title — short summary" value={form.title} onChange={(e) => set('title', e.target.value)} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={field} placeholder="Route (e.g. /dashboard/forecasts)" value={form.route} onChange={(e) => set('route', e.target.value)} />
        <input className={field} placeholder="Your role (viewer/researcher/…)" value={form.role} onChange={(e) => set('role', e.target.value)} />
        <select className={field} value={form.severity} onChange={(e) => set('severity', e.target.value as IssueSeverity)}>
          {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <textarea className={field} rows={2} placeholder="Steps to reproduce" value={form.stepsToReproduce} onChange={(e) => set('stepsToReproduce', e.target.value)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <textarea className={field} rows={2} placeholder="Expected behavior" value={form.expectedBehavior} onChange={(e) => set('expectedBehavior', e.target.value)} />
        <textarea className={field} rows={2} placeholder="Actual behavior" value={form.actualBehavior} onChange={(e) => set('actualBehavior', e.target.value)} />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit report
        </Button>
        <span className="text-label text-text-muted">Reports are acknowledged for human review — not auto-filed, not auto-acted.</span>
      </div>

      {ref ? <SuccessNotice message={`Thank you — report acknowledged (${ref}). A human reviewer will triage it.`} /> : null}
      {error ? <ErrorState title="Could not submit" message={error} /> : null}
    </Card>
  );
}
