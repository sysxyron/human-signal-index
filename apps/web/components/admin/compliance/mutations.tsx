'use client';

// =============================================================================
// HSI Phase 41 — compliance client mutation controls. Each is a thin wrapper
// over a 'use server' action with a transition + inline error. Admin gating +
// audit happen server-side in the DAL; these are UI only.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Textarea } from '@hsi/ui';
import {
  createEvidenceAction,
  createIncidentAction,
  createRiskAction,
  seedComplianceDefaultsAction,
  setEvidenceStatusAction,
  setIncidentStatusAction,
  setPolicyStatusAction,
  setRiskStatusAction,
  setVendorReviewAction,
  updateRetentionAction,
} from '@/lib/compliance/actions';
import type {
  EvidenceStatus,
  EvidenceType,
  IncidentStatus,
  PolicyStatus,
  RiskSeverity,
  RiskStatus,
  VendorReviewStatus,
} from '@/lib/compliance/types';

type Result = { ok: boolean; error?: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, onOk?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) { onOk?.(); router.refresh(); }
      else setError(res.error ?? 'Action failed.');
    });
  };
  return { pending, error, run };
}

const SEVERITIES: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];

// ---- Risks -----------------------------------------------------------------

export function CreateRiskForm() {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<RiskSeverity>('medium');
  const [owner, setOwner] = useState('');
  const [mitigation, setMitigation] = useState('');
  if (!open) return <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Add risk</Button>;
  return (
    <div className="grid gap-2 rounded-card border border-border bg-surface/60 p-3 sm:grid-cols-2">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. No formal access-review cadence" />
      <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as RiskSeverity)}>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
      <Input label="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
      <Input label="Mitigation (optional)" value={mitigation} onChange={(e) => setMitigation(e.target.value)} />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" variant="primary" disabled={pending || !title.trim()} onClick={() => run(() => createRiskAction({ title, severity, owner: owner || undefined, mitigation: mitigation || undefined }), () => { setOpen(false); setTitle(''); setOwner(''); setMitigation(''); })}>{pending ? 'Saving…' : 'Create risk'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {error ? <span className="text-caption text-risk">{error}</span> : null}
      </div>
    </div>
  );
}

const RISK_STATUSES: RiskStatus[] = ['open', 'mitigating', 'accepted', 'resolved'];
export function RiskStatusSelect({ id, current }: { id: string; current: RiskStatus }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-1">
      <Select value={current} disabled={pending} onChange={(e) => run(() => setRiskStatusAction(id, e.target.value as RiskStatus))}>
        {RISK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      {error ? <span className="text-caption text-risk" title={error}>!</span> : null}
    </span>
  );
}

// ---- Incidents -------------------------------------------------------------

export function CreateIncidentForm() {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<RiskSeverity>('medium');
  const [system, setSystem] = useState('');
  if (!open) return <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Log incident</Button>;
  return (
    <div className="grid gap-2 rounded-card border border-border bg-surface/60 p-3 sm:grid-cols-2">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as RiskSeverity)}>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
      <Input label="Affected system (optional)" value={system} onChange={(e) => setSystem(e.target.value)} />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" variant="primary" disabled={pending || !title.trim()} onClick={() => run(() => createIncidentAction({ title, severity, affectedSystem: system || undefined }), () => { setOpen(false); setTitle(''); setSystem(''); })}>{pending ? 'Saving…' : 'Log incident'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {error ? <span className="text-caption text-risk">{error}</span> : null}
      </div>
    </div>
  );
}

const INCIDENT_STATUSES: IncidentStatus[] = ['investigating', 'contained', 'resolved', 'postmortem'];
export function IncidentStatusSelect({ id, current }: { id: string; current: IncidentStatus }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-1">
      <Select value={current} disabled={pending} onChange={(e) => run(() => setIncidentStatusAction(id, e.target.value as IncidentStatus))}>
        {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      {error ? <span className="text-caption text-risk" title={error}>!</span> : null}
    </span>
  );
}

// ---- Evidence --------------------------------------------------------------

const EVIDENCE_TYPES: EvidenceType[] = ['audit_log', 'screenshot', 'policy', 'report', 'system_setting', 'migration', 'incident_record', 'access_review', 'export'];
export function CreateEvidenceForm({ controls }: { controls: Array<{ id: string; name: string }> }) {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EvidenceType>('audit_log');
  const [controlId, setControlId] = useState('');
  const [ref, setRef] = useState('');
  if (!open) return <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Add evidence</Button>;
  return (
    <div className="grid gap-2 rounded-card border border-border bg-surface/60 p-3 sm:grid-cols-2">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Select label="Type" value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>{EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Select>
      <Select label="Control (optional)" value={controlId} onChange={(e) => setControlId(e.target.value)}>
        <option value="">— none —</option>
        {controls.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Input label="Reference URL (optional)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://…" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" variant="primary" disabled={pending || !title.trim()} onClick={() => run(() => createEvidenceAction({ title, evidenceType: type, controlId: controlId || undefined, referenceUrl: ref || undefined }), () => { setOpen(false); setTitle(''); setRef(''); setControlId(''); })}>{pending ? 'Saving…' : 'Add evidence'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {error ? <span className="text-caption text-risk">{error}</span> : null}
      </div>
    </div>
  );
}

const EVIDENCE_STATUSES: EvidenceStatus[] = ['collected', 'verified', 'stale', 'missing'];
export function EvidenceStatusSelect({ id, current }: { id: string; current: EvidenceStatus }) {
  const { pending, run } = useAction();
  return (
    <Select value={current} disabled={pending} onChange={(e) => run(() => setEvidenceStatusAction(id, e.target.value as EvidenceStatus))}>
      {EVIDENCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </Select>
  );
}

// ---- Policies --------------------------------------------------------------

const POLICY_STATUSES: PolicyStatus[] = ['draft', 'active', 'archived'];
export function PolicyStatusSelect({ id, current }: { id: string; current: PolicyStatus }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-1">
      <Select value={current} disabled={pending} onChange={(e) => run(() => setPolicyStatusAction(id, e.target.value as PolicyStatus))}>
        {POLICY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      {error ? <span className="text-caption text-risk" title={error}>!</span> : null}
    </span>
  );
}

// ---- Vendors ---------------------------------------------------------------

const VENDOR_STATUSES: VendorReviewStatus[] = ['pending', 'reviewed', 'flagged'];
export function VendorReviewSelect({ id, current }: { id: string; current: VendorReviewStatus }) {
  const { pending, run } = useAction();
  return (
    <Select value={current} disabled={pending} onChange={(e) => run(() => setVendorReviewAction(id, e.target.value as VendorReviewStatus))}>
      {VENDOR_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
    </Select>
  );
}

// ---- Retention -------------------------------------------------------------

const RETENTION_STATUSES = ['planned', 'active', 'not_applicable'];
export function RetentionRowEditor({ id, period, status }: { id: string; period: string; status: string }) {
  const { pending, error, run } = useAction();
  const [p, setP] = useState(period);
  const [s, setS] = useState(status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={p} onChange={(e) => setP(e.target.value)} className="w-48" />
      <Select value={s} onChange={(e) => setS(e.target.value)}>{RETENTION_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateRetentionAction(id, { retentionPeriod: p, status: s }))}>{pending ? 'Saving…' : 'Save'}</Button>
      {error ? <span className="text-caption text-risk">{error}</span> : null}
    </div>
  );
}

// ---- Seed ------------------------------------------------------------------

export function SeedDefaultsButton() {
  const { pending, error, run } = useAction();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(async () => { const r = await seedComplianceDefaultsAction(); if (r.ok) setMsg(`Seeded (+${r.data.inserted})`); return r; })}>{pending ? 'Seeding…' : 'Re-seed defaults'}</Button>
      {msg ? <span className="text-caption text-verified">{msg}</span> : null}
      {error ? <span className="text-caption text-risk">{error}</span> : null}
    </span>
  );
}
