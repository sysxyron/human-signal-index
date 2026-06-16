'use client';

// =============================================================================
// HSI Phase 41B — functional public signal submission form (beta bugs E + F).
//
// Replaces the previous dead static <form> (no action → silent native refresh,
// no persistence, decorative file input). This:
//   * shows the selected attachment name + validates type/size before upload,
//   * preserves entered values on validation failure,
//   * submits via a server action (no silent refresh — preventDefault),
//   * shows a clear success / error / sign-in / attachment message,
//   * never fails the whole submission if the attachment can't be stored.
// =============================================================================

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Card, Button, Input, Select, Textarea } from '@hsi/ui';
import { Upload, CheckCircle2, AlertTriangle, FileText, X } from 'lucide-react';
import { submitPublicSignalAction } from '@/lib/signals/submission-actions';
import { validateSubmission, validateAttachment } from '@/lib/signals/submission-validate';

const PLATFORMS = ['X / Twitter', 'Facebook', 'Telegram', 'YouTube', 'Reddit', 'TikTok', 'News / Web', 'Other'];
const CATEGORIES = ['Misinformation', 'Disinformation', 'Influence operation', 'Recruitment', 'Astroturfing', 'Civic / Election', 'Unsure'];

export function SignalSubmitForm() {
  const [sourceUrl, setSourceUrl] = useState('');
  const [observation, setObservation] = useState('');
  const [platform, setPlatform] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [success, setSuccess] = useState<{ attachmentNote?: string } | null>(null);
  const [pending, start] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = (f: File | null) => {
    setFileError(null);
    if (!f) { setFile(null); return; }
    const v = validateAttachment({ name: f.name, type: f.type, size: f.size });
    if (!v.ok) { setFile(null); setFileError(v.message); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
    setFile(f);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAuthRequired(false);

    const validation = validateSubmission({ sourceUrl, observation, platform, category, notes });
    if (!validation.ok) { setError(validation.message); return; }

    const fd = new FormData();
    fd.set('sourceUrl', sourceUrl);
    fd.set('observation', observation);
    fd.set('platform', platform);
    fd.set('category', category);
    fd.set('notes', notes);
    if (file) fd.set('attachment', file);

    start(async () => {
      const res = await submitPublicSignalAction(fd);
      if (res.ok) {
        setSuccess({ attachmentNote: res.attachmentSkipped ? res.attachmentMessage : undefined });
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthRequired(true);
      } else {
        setError(res.error ?? 'Submission failed. Please try again.');
      }
    });
  };

  if (success) {
    return (
      <Card className="space-y-3">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-verified" />
          <div>
            <h3 className="text-body-sm font-semibold text-text-primary">Signal submitted for review.</h3>
            <p className="mt-0.5 text-caption text-text-secondary">A reviewer will assess it. Thank you for the report.</p>
            {success.attachmentNote ? <p className="mt-2 text-caption text-warning">{success.attachmentNote}</p> : null}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setSuccess(null); setSourceUrl(''); setObservation(''); setPlatform(''); setCategory(''); setNotes(''); setFile(null); }}>
          Submit another
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <form className="space-y-5" onSubmit={onSubmit}>
        <Input label="Source URL" type="url" placeholder="https://… (doi.org, zenodo.org, arXiv, or any public link)"
          hint="A direct link to the public post, article, report, or record." value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        <Textarea label="What did you observe?" rows={4} placeholder="Describe the narrative, claim, or campaign and why it stood out…"
          value={observation} onChange={(e) => setObservation(e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">Select a platform</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select a category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>

        <div className="space-y-1.5">
          <span className="block text-label text-text-secondary">Supporting evidence (optional)</span>
          {file ? (
            <div className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface-2/40 px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-body-sm text-text-primary">
                <FileText className="h-4 w-4 text-electric" /> {file.name}
                <span className="text-caption text-text-muted">({Math.ceil(file.size / 1024)} KB)</span>
              </span>
              <button type="button" onClick={() => onPickFile(null)} className="text-text-muted hover:text-text-primary" aria-label="Remove file"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <label htmlFor="sig-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-2/40 px-6 py-8 text-center transition hover:border-electric">
              <Upload className="h-6 w-6 text-text-muted" />
              <span className="text-body-sm text-text-secondary">Choose a screenshot or file</span>
              <span className="text-caption text-text-muted">PNG, JPG, PDF — up to 25MB</span>
              <input ref={fileInputRef} id="sig-file" type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
          {fileError ? <p className="text-caption text-risk">{fileError}</p> : null}
        </div>

        <Textarea label="Additional notes (optional)" rows={3} placeholder="Anything else our reviewers should know…" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {error ? (
          <p className="flex items-center gap-1.5 text-caption text-risk"><AlertTriangle className="h-4 w-4" /> {error}</p>
        ) : null}
        {authRequired ? (
          <p className="flex items-center gap-1.5 text-caption text-warning">
            <AlertTriangle className="h-4 w-4" /> Please{' '}
            <Link href={'/sign-in?redirectedFrom=/public-reports' as never} className="font-semibold text-electric hover:text-white">sign in</Link>{' '}
            to submit a signal for review.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-caption text-text-muted">By submitting you confirm this concerns public content.</p>
          <Button variant="primary" type="submit" disabled={pending}>{pending ? 'Submitting…' : 'Submit for review'}</Button>
        </div>
      </form>
    </Card>
  );
}
