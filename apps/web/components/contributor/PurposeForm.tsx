'use client';

// =============================================================================
// HSI Phase 25 — purpose selection form (client). Lets a signed-in user declare
// their purpose and (for non-observer paths) submit a role APPLICATION. No role
// is granted here — applications are reviewed + approved by an admin.
// =============================================================================

import { useState, useTransition } from 'react';
import { Card, Button } from '@hsi/ui';
import { Check, Loader2, Send } from 'lucide-react';
import { applyForRoleAction } from '@/lib/contributor/applications';
import type { PurposeOption } from '@/lib/contributor/options';

export function PurposeForm({ options }: { options: PurposeOption[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [experience, setExperience] = useState('');
  const [reason, setReason] = useState('');
  const [organization, setOrganization] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = options.find((o) => o.path === selected) ?? null;
  const needsApplication = Boolean(chosen?.requestedRole);

  function submit() {
    if (!chosen) return;
    setResult(null);
    startTransition(async () => {
      const res = await applyForRoleAction({ path: chosen.path, experienceSummary: experience || undefined, reason: reason || undefined, organization: organization || undefined });
      if (res.ok) {
        setResult({ ok: true, message: needsApplication ? 'Your application was submitted. An administrator will review it. You keep Viewer access in the meantime.' : 'Thanks — you\'re all set as an Observer. Explore reports and follow investigations from the dashboard.' });
      } else {
        setResult({ ok: false, message: res.code === 'NOT_CONFIGURED' ? 'This is a preview environment — applications are not connected.' : res.code === 'AUTH_REQUIRED' ? 'Please sign in to continue.' : (res.error ?? 'Could not submit. Please try again.') });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const active = o.path === selected;
          return (
            <button key={o.path} type="button" onClick={() => setSelected(o.path)} className={`rounded-card border p-4 text-left transition ${active ? 'border-electric bg-electric/10' : 'border-border bg-surface/50 hover:border-electric/40'}`}>
              <div className="flex items-center justify-between">
                <span className="text-h6 font-semibold text-text-primary">{o.label}</span>
                {active ? <Check className="h-4 w-4 text-electric" /> : null}
              </div>
              <p className="mt-1 text-caption text-text-secondary">{o.blurb}</p>
              {o.requestedRole ? <p className="mt-2 text-label uppercase tracking-wide text-text-muted">Requires admin approval</p> : <p className="mt-2 text-label uppercase tracking-wide text-success">No approval needed</p>}
            </button>
          );
        })}
      </div>

      {needsApplication ? (
        <Card className="space-y-3 border-border" padded>
          <p className="text-caption text-text-secondary">Tell the reviewers a little about yourself. This becomes your role application.</p>
          <label className="block space-y-1">
            <span className="text-label font-medium text-text-secondary">Relevant experience</span>
            <textarea value={experience} onChange={(e) => setExperience(e.target.value)} rows={3} className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary outline-none focus:border-electric" placeholder="What's your background?" />
          </label>
          <label className="block space-y-1">
            <span className="text-label font-medium text-text-secondary">Why this path?</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary outline-none focus:border-electric" placeholder="What do you want to contribute?" />
          </label>
          {chosen?.path === 'organization_applicant' ? (
            <label className="block space-y-1">
              <span className="text-label font-medium text-text-secondary">Organization</span>
              <input value={organization} onChange={(e) => setOrganization(e.target.value)} className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary outline-none focus:border-electric" placeholder="Team, institution, newsroom…" />
            </label>
          ) : null}
        </Card>
      ) : null}

      {result ? (
        <div className={`rounded-card border px-4 py-3 text-caption ${result.ok ? 'border-success/40 bg-success/10 text-success' : 'border-error/40 bg-error/10 text-error'}`}>{result.message}</div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!chosen || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : needsApplication ? <Send className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {needsApplication ? 'Submit application' : 'Continue as Observer'}
        </Button>
        {chosen ? <span className="text-label text-text-muted">You keep Viewer access until an admin approves any role change.</span> : <span className="text-label text-text-muted">Choose a purpose to continue.</span>}
      </div>
    </div>
  );
}
