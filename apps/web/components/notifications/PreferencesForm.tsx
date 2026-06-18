'use client';

// =============================================================================
// HSI Phase 62 — Notification preferences (client). Per-user delivery controls:
// channels, critical-only, digest cadence, and per-category toggles. Calls the
// owner-scoped server action (RLS-enforced). Email toggle is captured now; email
// delivery itself ships in a later phase (labeled accordingly).
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Settings, Save } from 'lucide-react';
import { updatePreferencesAction } from '@/lib/notifications/actions';
import { DIGEST_FREQUENCIES, type NotificationPreferences } from '@/lib/notifications/types';

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-card border border-border bg-background-deep/40 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-body-sm font-medium text-text-primary">{label}</span>
        {hint ? <span className="block text-caption text-text-muted">{hint}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-electric" aria-label={label} />
    </label>
  );
}

export function PreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [p, setP] = useState<NotificationPreferences>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof NotificationPreferences>(k: K, v: NotificationPreferences[K]) => setP((prev) => ({ ...prev, [k]: v }));

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updatePreferencesAction(p);
      setMsg(r.ok ? 'Preferences saved.' : (r.error ?? 'Failed.'));
      if (r.ok) router.refresh();
    });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Notification preferences</h3>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle label="In-app notifications" hint="Show alerts in this notification center." checked={p.inAppEnabled} onChange={(v) => set('inAppEnabled', v)} />
        <Toggle label="Email notifications" hint="Captured now; email delivery ships in a later phase." checked={p.emailEnabled} onChange={(v) => set('emailEnabled', v)} />
        <Toggle label="Critical only" hint="Only deliver CRITICAL severity (security events always shown)." checked={p.criticalOnly} onChange={(v) => set('criticalOnly', v)} />
        <label className="flex items-center justify-between gap-3 rounded-card border border-border bg-background-deep/40 px-3 py-2.5">
          <span className="text-body-sm font-medium text-text-primary">Digest frequency</span>
          <select value={p.digestFrequency} onChange={(e) => set('digestFrequency', e.target.value as NotificationPreferences['digestFrequency'])} className="rounded-btn border border-border bg-surface/80 px-2 py-1 text-[12px] font-semibold text-text-primary" aria-label="Digest frequency">
            {DIGEST_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>

      <div className="space-y-1">
        <p className="text-label uppercase tracking-wide text-text-muted">Alert categories</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Toggle label="Source alerts" checked={p.sourceAlerts} onChange={(v) => set('sourceAlerts', v)} />
          <Toggle label="Review alerts" checked={p.reviewAlerts} onChange={(v) => set('reviewAlerts', v)} />
          <Toggle label="Publication alerts" checked={p.publicationAlerts} onChange={(v) => set('publicationAlerts', v)} />
          <Toggle label="Forecast alerts" checked={p.forecastAlerts} onChange={(v) => set('forecastAlerts', v)} />
          <Toggle label="System alerts" checked={p.systemAlerts} onChange={(v) => set('systemAlerts', v)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={pending} onClick={save}><Save className="h-4 w-4" /> Save preferences</Button>
        {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
      </div>
    </Card>
  );
}
