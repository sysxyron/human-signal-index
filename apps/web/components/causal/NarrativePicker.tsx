'use client';

// =============================================================================
// HSI Phase 11 — NarrativePicker. A client <select> that drives a `?narrativeId=`
// query param (used by the causal explanation selector + the replay page).
// Preserves any other existing query params; pushes the new URL on change.
// =============================================================================

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { HsinNarrativeRecord } from '@hsi/shared-types';

export function NarrativePicker({
  narratives,
  selectedId,
  label = 'Narrative',
  paramName = 'narrativeId',
}: {
  narratives: HsinNarrativeRecord[];
  selectedId?: string;
  label?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(paramName, value);
    else params.delete(paramName);
    const qs = params.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as never);
  };

  return (
    <label className="flex items-center gap-2 text-caption text-text-secondary">
      <span className="text-text-muted">{label}</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-btn border border-border bg-surface-2 px-3 py-1.5 text-caption font-medium text-text-primary outline-none focus:border-electric"
      >
        <option value="">Select…</option>
        {narratives.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
    </label>
  );
}
