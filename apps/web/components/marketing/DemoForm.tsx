'use client';
// =============================================================================
// HSI Phase 73.1 — Demo request form (client). Controlled inputs → POST to
// /api/demo/request with success/error states. Buyer-oriented. Degrades
// gracefully with a mailto fallback if the backend is unavailable.
// =============================================================================

import { useState } from 'react';
import { Input, Select, Textarea, Button } from '@hsi/ui';
import { CheckCircle2, AlertTriangle, CalendarCheck } from 'lucide-react';

const TEAM_SIZES = ['Just me', '2–10', '11–50', '51–200', '200+'];
const TIMELINES = ['Exploring options', 'Evaluating this quarter', 'Ready to pilot now', 'Procurement / budgeted'];

export function DemoForm() {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('submitting'); setMessage('');
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name'), email: fd.get('email'), organization: fd.get('organization'), role: fd.get('role'),
      teamSize: fd.get('teamSize'), useCase: fd.get('useCase'), timeline: fd.get('timeline'), notes: fd.get('notes'),
    };
    try {
      const res = await fetch('/api/demo/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response.' }));
      if (res.ok && data.ok) { setState('success'); setMessage(data.message ?? 'Request received.'); }
      else { setState('error'); setMessage(data.error ?? 'Something went wrong. Please try again.'); }
    } catch {
      setState('error');
      setMessage('We could not reach the server. Please email demo@humansignalindex.org with your details and we will follow up.');
    }
  }

  if (state === 'success') {
    return (
      <div className="flex items-start gap-3 rounded-card border border-verified/40 bg-verified/10 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-verified" />
        <div className="space-y-1"><h3 className="text-h6 font-semibold text-text-primary">Demo request received</h3><p className="text-body-sm text-text-secondary">{message}</p></div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" id="d-name" placeholder="Your name" required autoComplete="name" />
        <Input label="Work email" name="email" id="d-email" type="email" placeholder="you@organization.org" required autoComplete="email" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Organization" name="organization" id="d-org" placeholder="Your organization" required autoComplete="organization" />
        <Input label="Role" name="role" id="d-role" placeholder="e.g. Head of research, editor, T&S lead" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Team size" name="teamSize" id="d-team" defaultValue={TEAM_SIZES[1]}>
          {TEAM_SIZES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select label="Timeline" name="timeline" id="d-timeline" defaultValue={TIMELINES[0]}>
          {TIMELINES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      <Input label="Use case" name="useCase" id="d-use" placeholder="What you'd use HSI for" required />
      <Textarea label="Notes (optional)" name="notes" id="d-notes" rows={4} placeholder="Anything else we should know before the call." />

      {state === 'error' ? (
        <div className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning/10 p-3 text-body-sm text-text-secondary"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{message}</span></div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-text-muted">We tailor each walkthrough to your workflows.</p>
        <Button variant="primary" type="submit" disabled={state === 'submitting'}><CalendarCheck className="h-4 w-4" /> {state === 'submitting' ? 'Sending…' : 'Request a Demo'}</Button>
      </div>
    </form>
  );
}
