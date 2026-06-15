'use client';

// =============================================================================
// HSI Phase 35 — organization / workspace switcher (client). Persists the
// selected org (cookie via server action) and refreshes. Switching changes the
// CONTENT scope (tenant isolation) only — never platform access/RBAC.
// =============================================================================

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown } from 'lucide-react';
import { setCurrentOrganizationAction } from '@/lib/org/organizations';

export function OrgSwitcher({ organizations, currentSlug }: { organizations: Array<{ slug: string; name: string }>; currentSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (organizations.length === 0) return null;

  const current = organizations.find((o) => o.slug === currentSlug) ?? organizations[0];
  if (organizations.length === 1) {
    return <span className="inline-flex items-center gap-1.5 rounded-card border border-border bg-surface/50 px-2.5 py-1 text-label text-text-secondary"><Building2 className="h-3.5 w-3.5 text-electric" /> {current.name}</span>;
  }

  function onChange(slug: string) {
    startTransition(async () => { await setCurrentOrganizationAction(slug); router.refresh(); });
  }

  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-card border border-border bg-surface/50 px-2.5 py-1 text-label text-text-secondary">
      <Building2 className="h-3.5 w-3.5 text-electric" />
      <select value={current.slug} onChange={(e) => onChange(e.target.value)} disabled={pending} className="appearance-none bg-transparent pr-4 text-text-primary outline-none disabled:opacity-60">
        {organizations.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-text-muted" />
    </label>
  );
}
