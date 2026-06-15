'use client';

// =============================================================================
// HSI Phase 31B — navigation CRUD manager (client). Admin-only (page gates + DAL
// re-checks requireAdmin). Add / edit / delete / activate links per location. All
// actions are audited server-side.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Plus, Trash2, Loader2 } from 'lucide-react';
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

  function run(fn: () => Promise<{ ok: boolean }>) { startTransition(async () => { await fn(); router.refresh(); }); }

  return (
    <div className="space-y-6">
      <Card className="space-y-2 border-border" padded>
        <h3 className="text-h6 font-semibold text-text-primary">Add link</h3>
        <div className="flex flex-wrap items-end gap-2">
          <select value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded-card border border-border bg-surface px-2 py-2 text-caption text-text-primary">{LOCATIONS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
          <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="/path" className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
          <Button onClick={() => { if (label && href) run(() => createNavItem({ location: loc, label, href, position: items.filter((i) => i.location === loc).length })); setLabel(''); setHref(''); }} disabled={pending || !label || !href}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</Button>
        </div>
      </Card>

      {LOCATIONS.map((l) => {
        const rows = items.filter((i) => i.location === l.key).sort((a, b) => a.position - b.position);
        return (
          <section key={l.key} className="space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">{l.label}</h3>
            <Card className="space-y-1.5 border-border" padded>
              {rows.length === 0 ? <p className="text-caption text-text-muted">No links.</p> : rows.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 text-caption">
                  <span className="min-w-0 truncate"><span className="text-text-primary">{i.label}</span> <span className="text-text-muted">{i.href}</span></span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => run(() => updateNavItem(i.id, { active: !i.active }))} className={`rounded-full px-2 py-0.5 text-label font-semibold ${i.active ? 'bg-success/15 text-success' : 'bg-surface-2 text-text-muted'}`}>{i.active ? 'active' : 'hidden'}</button>
                    <button type="button" onClick={() => run(() => deleteNavItem(i.id))} className="text-text-muted hover:text-error"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
