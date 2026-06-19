// =============================================================================
// HSI Phase 68 — Transparency Portal presentational components (server, public).
// Read-only, public-safe rendering shared across the portal sections. No actions,
// no client interactivity, no internal data.
// =============================================================================

import { Card } from '@hsi/ui';

const SECTIONS = [
  { href: '/transparency', label: 'Overview' },
  { href: '/transparency/forecasts', label: 'Forecasts' },
  { href: '/transparency/narratives', label: 'Narratives' },
  { href: '/transparency/sources', label: 'Sources' },
  { href: '/transparency/corrections', label: 'Corrections' },
  { href: '/transparency/methodology', label: 'Methodology' },
];

export function TransparencyNav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Transparency sections">
      {SECTIONS.map((s) => (
        <a
          key={s.href}
          href={s.href}
          className={`rounded-btn border px-3 py-1.5 text-caption font-semibold transition ${active === s.href ? 'border-electric bg-electric/10 text-electric' : 'border-border bg-surface-2/40 text-text-secondary hover:border-electric hover:text-electric'}`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

export function MetricTiles({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((m) => (
        <Card key={m.label} className="text-center">
          <div className="text-h4 font-bold tabular-nums text-text-primary">{typeof m.value === 'number' ? m.value.toLocaleString('en-US') : m.value}</div>
          <div className="mt-1 text-caption uppercase tracking-wide text-text-muted">{m.label}</div>
        </Card>
      ))}
    </div>
  );
}

export function BarList({ rows, color = '#3B82F6' }: { rows: { label: string; value: number; hint?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex items-center justify-between text-caption">
            <span className="text-text-secondary">{r.label}</span>
            <span className="text-text-muted">{r.hint ?? r.value.toLocaleString('en-US')}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round((r.value / max) * 100)}%`, backgroundColor: color, opacity: 0.85 }} /></div>
        </li>
      ))}
    </ul>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
