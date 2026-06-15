'use client';

// HSI Phase 37 — organization branding editor + preview (client). Org-admin only.
// Stores branding (no runtime theme switching yet). Audited via the DAL.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Loader2, Save } from 'lucide-react';
import { saveOrgBrandingAction, type OrgBranding } from '@/lib/billing/billing';

export function OrgBrandingForm({ initial, readonly }: { initial: OrgBranding; readonly?: boolean }) {
  const router = useRouter();
  const [b, setB] = useState<OrgBranding>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof OrgBranding, v: string) => setB((p) => ({ ...p, [k]: v }));
  function save() { setMsg(null); startTransition(async () => { const r = await saveOrgBrandingAction(b); setMsg(r.ok ? 'Saved.' : (r.error ?? 'Save failed.')); if (r.ok) router.refresh(); }); }
  const color = (label: string, k: keyof OrgBranding) => (
    <label className="space-y-1"><span className="text-label text-text-muted">{label}</span>
      <div className="flex items-center gap-2"><input type="color" value={b[k] || '#3B82F6'} onChange={(e) => set(k, e.target.value)} disabled={readonly} className="h-8 w-10 rounded border border-border bg-surface" /><input value={b[k]} onChange={(e) => set(k, e.target.value)} disabled={readonly} className="flex-1 rounded-card border border-border bg-surface px-2 py-1.5 text-label text-text-primary disabled:opacity-60" /></div>
    </label>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 border-border" padded>
        <label className="space-y-1"><span className="text-label text-text-muted">Logo URL</span><input value={b.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        <label className="space-y-1"><span className="text-label text-text-muted">Favicon URL</span><input value={b.faviconUrl} onChange={(e) => set('faviconUrl', e.target.value)} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        {color('Primary color', 'primaryColor')}
        {color('Secondary color', 'secondaryColor')}
        {color('Accent color', 'accentColor')}
        <label className="space-y-1"><span className="text-label text-text-muted">Footer text</span><input value={b.footerText} onChange={(e) => set('footerText', e.target.value)} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        {msg ? <p className="text-caption text-text-secondary">{msg}</p> : null}
        <Button onClick={save} disabled={pending || readonly}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save branding</Button>
      </Card>
      {/* Preview */}
      <Card className="space-y-3 border-border" padded>
        <div className="text-label uppercase tracking-wide text-text-muted">Preview</div>
        <div className="overflow-hidden rounded-card border border-border">
          <div className="flex items-center gap-2 p-3" style={{ backgroundColor: b.primaryColor || '#3B82F6' }}>
            {b.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt="logo" className="h-6" /> : <span className="font-bold text-white">Logo</span>}
          </div>
          <div className="space-y-2 p-4">
            <div className="h-3 w-2/3 rounded" style={{ backgroundColor: b.secondaryColor || '#8B5CF6' }} />
            <div className="h-2 w-full rounded bg-surface-2" />
            <button type="button" className="rounded-card px-3 py-1.5 text-label font-semibold text-white" style={{ backgroundColor: b.accentColor || '#10B981' }}>Accent action</button>
          </div>
          <div className="border-t border-border p-2 text-center text-label text-text-muted">{b.footerText || 'Footer text'}</div>
        </div>
        <p className="text-label text-text-muted">Branding is stored for white-label use. Runtime theme switching ships in a later phase.</p>
      </Card>
    </div>
  );
}
