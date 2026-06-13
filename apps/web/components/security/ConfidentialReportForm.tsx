'use client';

// =============================================================================
// HSI Phase 23B — ConfidentialReportForm (governed placeholder).
//
// A confidential reporting workflow inspired by SecureDrop / Hushline / SEC
// whistleblower guidance. It collects a category, a description, optional evidence
// notes, and optional contact details, then issues a tracking reference
// (HSI-XXXX-XXXX) the reporter can save and use to check status later.
//
// GOVERNED PLACEHOLDER: nothing is persisted or transmitted in this build, and no
// automated action is taken — reports are reviewed by people. We are explicit that
// no online system can guarantee complete anonymity.
// =============================================================================

import { useState } from 'react';
import { Button, Card } from '@hsi/ui';
import { ShieldCheck, Copy, Search, FileUp, Lock } from 'lucide-react';

const CATEGORIES = [
  'Corruption or fraud',
  'Abuse of power or misconduct',
  'Disinformation operation',
  'Security incident',
  'Research misconduct',
  'Governance violation',
  'Other',
];

const field =
  'w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none';

// Avoid ambiguous characters (0/O, 1/I) in references.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function block(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
function newReference(): string {
  return `HSI-${block()}-${block()}`;
}

export function ConfidentialReportForm() {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [contact, setContact] = useState('');
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [lookup, setLookup] = useState('');
  const [lookupResult, setLookupResult] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (description.trim().length < 20) {
      setError('Please describe what happened in a little more detail (at least a sentence or two).');
      return;
    }
    setReference(newReference());
    setDescription(''); setEvidenceNote(''); setContact(''); setFileNames([]);
  };

  const copy = () => {
    if (!reference) return;
    try {
      void navigator.clipboard?.writeText(reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the reference is shown for manual copy */
    }
  };

  const checkStatus = () => {
    const ref = lookup.trim().toUpperCase();
    if (!/^HSI-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(ref)) {
      setLookupResult('That does not look like a valid reference. It should look like HSI-XXXX-XXXX.');
      return;
    }
    setLookupResult(`Reference ${ref}: received and awaiting human review. Status updates are handled by a person — there are no automated decisions.`);
  };

  if (reference) {
    return (
      <Card className="space-y-3 border-verified/40 bg-verified/5">
        <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ShieldCheck className="h-5 w-5 text-verified" /> Report received</h2>
        <p className="text-body-sm text-text-secondary">Save this reference. It is the only way to check on your report later — we cannot look it up by your name.</p>
        <div className="flex items-center gap-3">
          <span className="rounded-card border border-border bg-surface px-4 py-2 font-mono text-h6 tracking-wider text-text-primary">{reference}</span>
          <Button variant="secondary" size="sm" onClick={copy}><Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy'}</Button>
        </div>
        <p className="text-label text-text-muted">This is the BETA confidential reporting system. Your report is acknowledged for human review; nothing is auto-filed or auto-actioned.</p>
        <Button variant="ghost" size="sm" onClick={() => setReference(null)}>Submit another report</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="flex items-start gap-3 border-warning/40 bg-warning/5">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <p className="text-body-sm text-text-secondary">
          We take steps to protect sources and the information you submit, but <span className="font-semibold text-text-primary">no online system can
          guarantee complete anonymity</span>. For the strongest protection, submit from a personal device on a network you
          trust, and leave out details that could identify you inside the report.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-h6 font-semibold text-text-primary">Make a report</h2>

        <div className="space-y-1.5">
          <label className="text-label font-semibold uppercase tracking-wide text-text-muted">Category</label>
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-label font-semibold uppercase tracking-wide text-text-muted">What happened</label>
          <textarea className={field} rows={6} placeholder="Describe what you saw — what, when, and who was involved. Be specific where you safely can." value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="text-label font-semibold uppercase tracking-wide text-text-muted">Evidence notes (optional)</label>
          <textarea className={field} rows={3} placeholder="Describe any documents, links, or screenshots you have. Remove metadata from files before sharing them." value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-btn border border-border px-3 py-1.5 text-caption text-text-secondary transition hover:text-white">
            <FileUp className="h-3.5 w-3.5" /> Attach files
            <input type="file" multiple className="hidden" onChange={(e) => setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))} />
          </label>
          {fileNames.length > 0 ? <p className="text-label text-text-muted">Selected (not yet transmitted in this beta): {fileNames.join(', ')}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-label font-semibold uppercase tracking-wide text-text-muted">Contact (optional)</label>
          <input className={field} placeholder="An email or signal handle, only if you want us to be able to follow up" value={contact} onChange={(e) => setContact(e.target.value)} />
          <p className="text-label text-text-muted">Leave this blank to report without giving us a way to contact you.</p>
        </div>

        <Button variant="primary" size="sm" onClick={submit}><ShieldCheck className="h-4 w-4" /> Submit report</Button>
        {error ? <p className="text-caption text-risk">{error}</p> : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Search className="h-4 w-4 text-electric" /> Check a report's status</h2>
        <div className="flex flex-wrap gap-2">
          <input className={`${field} sm:max-w-xs`} placeholder="HSI-XXXX-XXXX" value={lookup} onChange={(e) => setLookup(e.target.value)} />
          <Button variant="secondary" size="sm" onClick={checkStatus}>Check status</Button>
        </div>
        {lookupResult ? <p className="text-caption text-text-secondary">{lookupResult}</p> : null}
      </Card>
    </div>
  );
}
