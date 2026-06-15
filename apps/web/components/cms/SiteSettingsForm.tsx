'use client';

// =============================================================================
// HSI Phase 34 — site settings / branding editor (client). Admin-only (page gates
// + DAL re-checks requireAdmin). Changes are audited with before/after.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Loader2, Save } from 'lucide-react';
import { saveSiteSettingsAction, type SiteSettings } from '@/lib/cms/site-ops';

export function SiteSettingsForm({ initial, readonly }: { initial: SiteSettings; readonly?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<SiteSettings>(initial);
  const [x, setX] = useState(initial.socialLinks.x ?? '');
  const [linkedin, setLinkedin] = useState(initial.socialLinks.linkedin ?? '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof SiteSettings, v: string) => setS((p) => ({ ...p, [k]: v }));

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveSiteSettingsAction({ ...s, socialLinks: { ...(x ? { x } : {}), ...(linkedin ? { linkedin } : {}) } });
      setMsg(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'));
      if (res.ok) router.refresh();
    });
  }

  const field = (label: string, k: keyof SiteSettings, placeholder = '') => (
    <label className="space-y-1"><span className="text-label text-text-muted">{label}</span>
      <input value={String(s[k] ?? '')} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" />
    </label>
  );

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 border-border sm:grid-cols-2" padded>
        {field('Site name', 'siteName')}
        {field('Contact email', 'contactEmail')}
        {field('Logo URL', 'logoUrl', '/logo.svg')}
        {field('Favicon URL', 'faviconUrl', '/favicon.ico')}
        <label className="space-y-1 sm:col-span-2"><span className="text-label text-text-muted">Footer text</span>
          <input value={s.footerText} onChange={(e) => set('footerText', e.target.value)} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" />
        </label>
        <label className="space-y-1"><span className="text-label text-text-muted">Social — X</span><input value={x} onChange={(e) => setX(e.target.value)} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        <label className="space-y-1"><span className="text-label text-text-muted">Social — LinkedIn</span><input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
      </Card>
      <p className="text-label text-text-muted">Theme colours, typography, and layout presets are future-ready (stored in <code className="text-text-primary">theme</code> jsonb) — the editor for those ships in a later phase.</p>
      {msg ? <div className="rounded-card border border-border bg-surface/50 px-4 py-2.5 text-caption text-text-secondary">{msg}</div> : null}
      <Button onClick={save} disabled={pending || readonly}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</Button>
    </div>
  );
}
