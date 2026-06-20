'use client';
// =============================================================================
// HSI Phase 73.1 — Beta application form (client). Controlled inputs → POST to
// /api/beta/apply with success/error states. Degrades gracefully: if the backend
// is unavailable it shows a clear message + a mailto fallback — never a dead UX.
// =============================================================================

import { useState } from 'react';
import { Input, Select, Textarea, Button } from '@hsi/ui';
import { CheckCircle2, AlertTriangle, Send } from 'lucide-react';

const PREFERRED_ROLES = ['Researcher', 'Analyst', 'Reviewer', 'Journalist', 'Organization', 'Other'];
const EXPERIENCE = ['New to OSINT / intelligence', 'Some experience', 'Experienced practitioner', 'Lead / manages a team'];

export function BetaForm() {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('submitting'); setMessage('');
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name'), email: fd.get('email'), organization: fd.get('organization'), role: fd.get('role'),
      areaOfInterest: fd.get('areaOfInterest'), reason: fd.get('reason'), experience: fd.get('experience'), preferredRole: fd.get('preferredRole'),
    };
    try {
      const res = await fetch('/api/beta/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected response.' }));
      if (res.ok && data.ok) { setState('success'); setMessage(data.message ?? 'Application received.'); }
      else { setState('error'); setMessage(data.error ?? 'Something went wrong. Please try again.'); }
    } catch {
      setState('error');
      setMessage('We could not reach the server. Please email beta@humansignalindex.org with your details and we will follow up.');
    }
  }

  if (state === 'success') {
    return (
      <div className="flex items-start gap-3 rounded-card border border-verified/40 bg-verified/10 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-verified" />
        <div className="space-y-1"><h3 className="text-h6 font-semibold text-text-primary">Application received</h3><p className="text-body-sm text-text-secondary">{message}</p></div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" id="b-name" placeholder="Your name" required autoComplete="name" />
        <Input label="Email" name="email" id="b-email" type="email" placeholder="you@example.com" required autoComplete="email" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Organization / company (optional)" name="organization" id="b-org" placeholder="Where you work, if any" autoComplete="organization" />
        <Input label="Role / background" name="role" id="b-role" placeholder="e.g. OSINT analyst, journalist, researcher" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Area of interest" name="areaOfInterest" id="b-area" placeholder="e.g. misinformation, extremism, public trust" />
        <Select label="Preferred tester role" name="preferredRole" id="b-pref" defaultValue="Researcher">
          {PREFERRED_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </div>
      <Select label="Experience level" name="experience" id="b-exp" defaultValue={EXPERIENCE[1]}>
        {EXPERIENCE.map((x) => <option key={x} value={x}>{x}</option>)}
      </Select>
      <Textarea label="Why do you want to test HSI?" name="reason" id="b-why" rows={4} placeholder="What you'd like to investigate or evaluate, and how HSI might help." required />

      {state === 'error' ? (
        <div className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning/10 p-3 text-body-sm text-text-secondary"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{message}</span></div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-text-muted">We review applications in batches. Your feedback is protected.</p>
        <Button variant="primary" type="submit" disabled={state === 'submitting'}><Send className="h-4 w-4" /> {state === 'submitting' ? 'Submitting…' : 'Apply to Beta Test'}</Button>
      </div>
    </form>
  );
}
