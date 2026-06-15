'use client';

// =============================================================================
// HSI Phase 34 — shared content editor for missions / badges / roles (client).
// Admin-only (page gates + DAL re-checks requireAdmin). Each row edits inline and
// saves via the matching audited DAL action. Keeps three operator editors DRY.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Loader2, Save } from 'lucide-react';
import { saveMissionContentAction, saveBadgeContentAction, saveRoleContentAction } from '@/lib/cms/site-ops';

export type ContentKind = 'mission' | 'badge' | 'role';
type Row = Record<string, unknown>;

function Field({ label, value, onChange, type = 'text', disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <label className="space-y-1"><span className="text-label text-text-muted">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" />
    </label>
  );
}

function EditorRow({ kind, row, readonly }: { kind: ContentKind; row: Row; readonly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>(() => {
    const s = (k: string) => String(row[k] ?? '');
    const out: Record<string, string> =
      kind === 'mission' ? { title: s('title'), instructions: s('instructions'), xp_reward: s('xp_reward'), intel_credits: s('intel_credits'), difficulty: s('difficulty') || 'standard' }
      : kind === 'badge' ? { name: s('name'), description: s('description'), icon: s('icon'), unlock_requirements: s('unlock_requirements'), rewards: s('rewards') }
      : { title: s('title'), description: s('description') };
    return out;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const keyVal = String(row.mission_key ?? row.badge_id ?? row.role ?? '');

  function save() {
    setMsg(null);
    startTransition(async () => {
      let res;
      if (kind === 'mission') res = await saveMissionContentAction({ missionKey: keyVal, title: f.title, instructions: f.instructions, xpReward: Number(f.xp_reward) || 0, intelCredits: Number(f.intel_credits) || 0, difficulty: f.difficulty });
      else if (kind === 'badge') res = await saveBadgeContentAction({ badgeId: keyVal, name: f.name, description: f.description, icon: f.icon, unlockRequirements: f.unlock_requirements, rewards: f.rewards });
      else res = await saveRoleContentAction({ role: keyVal, title: f.title, description: f.description });
      setMsg(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'));
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card className="space-y-2 border-border" padded>
      <div className="text-label uppercase tracking-wide text-text-muted">{keyVal}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {kind === 'mission' ? (<>
          <Field label="Title" value={f.title} onChange={(v) => set('title', v)} disabled={readonly} />
          <Field label="Difficulty" value={f.difficulty} onChange={(v) => set('difficulty', v)} disabled={readonly} />
          <Field label="XP reward" type="number" value={f.xp_reward} onChange={(v) => set('xp_reward', v)} disabled={readonly} />
          <Field label="Intel credits" type="number" value={f.intel_credits} onChange={(v) => set('intel_credits', v)} disabled={readonly} />
          <label className="space-y-1 sm:col-span-2"><span className="text-label text-text-muted">Instructions</span><textarea value={f.instructions} onChange={(e) => set('instructions', e.target.value)} rows={2} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        </>) : kind === 'badge' ? (<>
          <Field label="Name" value={f.name} onChange={(v) => set('name', v)} disabled={readonly} />
          <Field label="Icon (emoji)" value={f.icon} onChange={(v) => set('icon', v)} disabled={readonly} />
          <Field label="Unlock requirements" value={f.unlock_requirements} onChange={(v) => set('unlock_requirements', v)} disabled={readonly} />
          <Field label="Rewards" value={f.rewards} onChange={(v) => set('rewards', v)} disabled={readonly} />
          <label className="space-y-1 sm:col-span-2"><span className="text-label text-text-muted">Description</span><textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        </>) : (<>
          <Field label="Title" value={f.title} onChange={(v) => set('title', v)} disabled={readonly} />
          <label className="space-y-1 sm:col-span-2"><span className="text-label text-text-muted">Description</span><textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} disabled={readonly} className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary disabled:opacity-60" /></label>
        </>)}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending || readonly}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
        {msg ? <span className="text-caption text-text-secondary">{msg}</span> : null}
      </div>
    </Card>
  );
}

export function CmsContentEditor({ kind, rows, readonly }: { kind: ContentKind; rows: Row[]; readonly?: boolean }) {
  if (rows.length === 0) return <Card className="py-8 text-center text-caption text-text-muted" padded>No {kind} content yet — seed site content from the CMS dashboard.</Card>;
  return <div className="space-y-3">{rows.map((r, i) => <EditorRow key={String(r.mission_key ?? r.badge_id ?? r.role ?? i)} kind={kind} row={r} readonly={readonly} />)}</div>;
}
