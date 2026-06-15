'use client';

// HSI Phase 37 — organization settings editor (client). Org-admin only (page +
// DAL gate). Saved through the audited DAL. Never touches RBAC.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Loader2, Save } from 'lucide-react';
import { saveOrgSettingsAction, type OrgSettings } from '@/lib/billing/billing';

export function OrgSettingsForm({ initial, readonly }: { initial: OrgSettings; readonly?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<OrgSettings>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof OrgSettings, v: string) => setS((p) => ({ ...p, [k]: v }));
  const field = (label: string, k: keyof OrgSettings) => (
    <label className="space-y-1"><span className="text-label text-text-muted">{label}</span>
      <input value={s[k]} onChange={(e) => set(k, e.target.value)} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" />
    </label>
  );
  function save() { setMsg(null); startTransition(async () => { const r = await saveOrgSettingsAction(s); setMsg(r.ok ? 'Saved.' : (r.error ?? 'Save failed.')); if (r.ok) router.refresh(); }); }
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 border-border sm:grid-cols-2" padded>
        {field('Organization name', 'name')}
        {field('Logo URL', 'logoUrl')}
        <label className="space-y-1 sm:col-span-2"><span className="text-label text-text-muted">Description</span><textarea value={s.description} onChange={(e) => set('description', e.target.value)} rows={2} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        {field('Contact email', 'contactEmail')}
        {field('Website', 'website')}
        {field('Support contact', 'supportEmail')}
      </Card>
      {msg ? <div className="rounded-card border border-border bg-surface/50 px-4 py-2.5 text-caption text-text-secondary">{msg}</div> : null}
      <Button onClick={save} disabled={pending || readonly}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
    </div>
  );
}
