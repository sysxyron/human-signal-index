'use client';

// =============================================================================
// HSI Phase 31B / 41B.3 (D) — navigation CRUD manager (client). Admin-only (page
// gates + DAL re-checks requireAdmin). Add / edit (label, URL, group, order) /
// activate / delete links per location. All actions are audited server-side.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Plus, Trash2, Loader2, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { createNavItem, updateNavItem, deleteNavItem, type NavItem } from '@/lib/cms/cms';

const LOCATIONS: Array<{ key: string; label: string }> = [
  { key: 'header', label: 'Header menu' }, { key: 'footer', label: 'Footer menu' }, { key: 'dashboard_help', label: 'Dashboard help links' },
];

export function NavManager({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loc, setLoc] = useState('header');
  const [label, setLabel] = useState('');
  const [href, setHref] = useState('');
  const [group, setGroup] = useState('');

  function run(fn: () => Promise<{ ok: boolean }>) { startTransition(async () => { await fn(); router.refresh(); }); }

  return (
    <div className="space-y-6">
      <Card className="space-y-2 border-border" padded>
        <h3 className="text-h6 font-semibold text-text-primary">Add link</h3>
        <div className="flex flex-wrap items-end gap-2">
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded-card border border-border bg-surface px-2 py-2 text-caption text-text-primary">{LOCATIONS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
          <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/path" className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
          {loc === 'footer' ? <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group (e.g. Platform)" className="rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" /> : null}
          <Button onClick={() => { if (label && href) run(() => createNavItem({ location: loc, label, href, group: group || undefined, position: items.filter((i) => i.location === loc).length })); setLabel(''); setHref(''); setGroup(''); }} disabled={pending || !label || !href}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</Button>
        </div>
      </Card>

      {LOCATIONS.map((l) => {
        const rows = items.filter((i) => i.location === l.key).sort((a, b) => a.position - b.position);
        return (
          <section key={l.key} className="space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">{l.label}</h3>
            <Card className="space-y-1.5 border-border" padded>
              {rows.length === 0 ? <p className="text-caption text-text-muted">No links.</p> : rows.map((i, idx) => (
                <NavRow
                  key={i.id}
                  item={i}
                  showGroup={l.key === 'footer'}
                  pending={pending}
                  isFirst={idx === 0}
                  isLast={idx === rows.length - 1}
                  onSave={(patch) => run(() => updateNavItem(i.id, patch))}
                  onToggle={() => run(() => updateNavItem(i.id, { active: !i.active }))}
                  onDelete={() => run(() => deleteNavItem(i.id))}
                  onMove={(dir) => {
                    const swapWith = rows[idx + dir];
                    if (!swapWith) return;
                    run(async () => { await updateNavItem(i.id, { position: swapWith.position }); return updateNavItem(swapWith.id, { position: i.position }); });
                  }}
                />
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}

function NavRow({ item, showGroup, pending, isFirst, isLast, onSave, onToggle, onDelete, onMove }: {
  item: NavItem; showGroup: boolean; pending: boolean; isFirst: boolean; isLast: boolean;
  onSave: (patch: { label: string; href: string; group?: string }) => void;
  onToggle: () => void; onDelete: () => void; onMove: (dir: 1 | -1) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [href, setHref] = useState(item.href);
  const [group, setGroup] = useState(item.group ?? '');
  const dirty = label !== item.label || href !== item.href || (group || '') !== (item.group ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/40 py-1.5 text-caption last:border-0">
      <span className="flex shrink-0 flex-col">
        <button type="button" disabled={isFirst || pending} onClick={() => onMove(-1)} className="text-text-muted hover:text-text-primary disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={isLast || pending} onClick={() => onMove(1)} className="text-text-muted hover:text-text-primary disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
      </span>
      <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-32 rounded-card border border-border bg-surface px-2 py-1 text-text-primary" />
      <input value={href} onChange={(e) => setHref(e.target.value)} className="min-w-0 flex-1 rounded-card border border-border bg-surface px-2 py-1 text-text-primary" />
      {showGroup ? <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group" className="w-32 rounded-card border border-border bg-surface px-2 py-1 text-text-primary" /> : null}
      <button type="button" disabled={!dirty || pending} onClick={() => onSave({ label, href, group: showGroup ? group : undefined })} className="inline-flex items-center gap-1 rounded-card border border-border px-2 py-1 text-text-secondary hover:text-text-primary disabled:opacity-30"><Save className="h-3.5 w-3.5" /> Save</button>
      <button type="button" onClick={onToggle} className={`rounded-full px-2 py-0.5 text-label font-semibold ${item.active ? 'bg-success/15 text-success' : 'bg-surface-2 text-text-muted'}`}>{item.active ? 'active' : 'hidden'}</button>
      <button type="button" onClick={onDelete} className="text-text-muted hover:text-error"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}
