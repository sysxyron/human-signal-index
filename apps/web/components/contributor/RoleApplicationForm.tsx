'use client';

// =============================================================================
// HSI Phase 41B.1 — viewer-facing role application form. Thin client wrapper over
// the existing audited apply/withdraw workflow (applyForRoleAction). Advancement
// is ALWAYS by admin approval — applying never grants a role.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Select, Textarea } from '@hsi/ui';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { applyForRoleAction, withdrawApplicationAction } from '@/lib/contributor/applications';
import type { RoleApplicationRow } from '@hsi/shared-types';

interface PurposeOpt { path: string; label: string; blurb: string }

export function RoleApplicationForm({
  options,
  myApplications,
}: {
  options: PurposeOpt[];
  myApplications: RoleApplicationRow[];
}) {
  const router = useRouter();
  const [path, setPath] = useState(options[0]?.path ?? '');
  const [reason, setReason] = useState('');
  const [experience, setExperience] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selected = options.find((o) => o.path === path);
  const hasPending = myApplications.some((a) => a.status === 'pending');

  const submit = () => {
    setError(null);
    setDone(false);
    if (!reason.trim()) { setError('Please share why you’d like this role.'); return; }
    start(async () => {
      const res = await applyForRoleAction({ path, reason: reason.trim(), experienceSummary: experience.trim() || undefined });
      if (res.ok) { setDone(true); setReason(''); setExperience(''); router.refresh(); }
      else if (res.code === 'AUTH_REQUIRED') setError('Please sign in to apply.');
      else setError(res.error ?? 'Could not submit your application.');
    });
  };

  const withdraw = (id: string) => {
    start(async () => {
      const res = await withdrawApplicationAction(id);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <h3 className="text-body-sm font-semibold text-text-primary">Apply for an advanced role</h3>
        {done ? (
          <p className="flex items-center gap-1.5 text-caption text-verified"><CheckCircle2 className="h-4 w-4" /> Application submitted — an admin will review it.</p>
        ) : null}
        {hasPending && !done ? (
          <p className="text-caption text-warning">You already have a pending application. You can withdraw it below before applying again.</p>
        ) : null}
        <Select label="Path" value={path} onChange={(e) => setPath(e.target.value)}>
          {options.map((o) => <option key={o.path} value={o.path}>{o.label}</option>)}
        </Select>
        {selected ? <p className="text-caption text-text-muted">{selected.blurb}</p> : null}
        <Textarea label="Why are you a good fit?" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the reviewers about your intent and how you'll use the role…" />
        <Textarea label="Relevant experience (optional)" rows={2} value={experience} onChange={(e) => setExperience(e.target.value)} />
        {error ? <p className="flex items-center gap-1.5 text-caption text-risk"><AlertTriangle className="h-4 w-4" /> {error}</p> : null}
        <Button variant="primary" size="sm" disabled={pending} onClick={submit}>{pending ? 'Submitting…' : 'Submit application'}</Button>
      </Card>

      {myApplications.length > 0 ? (
        <Card className="space-y-2">
          <h3 className="text-body-sm font-semibold text-text-primary">Your applications</h3>
          <ul className="space-y-1.5">
            {myApplications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-caption">
                <span className="text-text-secondary">
                  {a.requestedRole ?? a.requestedPath} — <span className="capitalize">{a.status}</span>
                  {a.reviewNotes ? <span className="text-text-muted"> · {a.reviewNotes}</span> : null}
                </span>
                {a.status === 'pending' ? (
                  <button className="text-text-muted hover:text-risk" disabled={pending} onClick={() => withdraw(a.id)}>Withdraw</button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
