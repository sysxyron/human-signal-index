'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select, Input, Button } from '@hsi/ui';
import { Filter, X } from 'lucide-react';
import {
  REVIEW_STATUS_ORDER,
  PRIORITY_ORDER,
  statusStyle,
  priorityStyle,
} from '@/lib/governance/view';

/**
 * Client filter bar for the review queue hub. Reads/writes the querystring so
 * the server component can read `searchParams` and re-fetch with the chosen
 * filters. Status / Priority / Reviewer / Date range.
 */
export function ReviewFilters({ className = '' }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as never);
    },
    [params, pathname, router],
  );

  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const reviewer = params.get('reviewerId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const hasAny = Boolean(status || priority || reviewer || from || to);

  return (
    <div
      className={`flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface/60 p-4 ${className}`}
    >
      <div className="flex items-center gap-1.5 self-center text-label text-text-muted">
        <Filter className="h-4 w-4 text-electric" />
        Filters
      </div>

      <div className="min-w-[150px]">
        <Select
          label="Status"
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {REVIEW_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {statusStyle(s).label}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-[140px]">
        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setParam('priority', e.target.value)}
        >
          <option value="">All priorities</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {priorityStyle(p).label}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-[180px]">
        <Input
          label="Reviewer (id or email)"
          value={reviewer}
          placeholder="reviewer…"
          onChange={(e) => setParam('reviewerId', e.target.value)}
        />
      </div>

      <div className="min-w-[140px]">
        <Input
          label="From"
          type="date"
          value={from}
          onChange={(e) => setParam('from', e.target.value)}
        />
      </div>

      <div className="min-w-[140px]">
        <Input
          label="To"
          type="date"
          value={to}
          onChange={(e) => setParam('to', e.target.value)}
        />
      </div>

      {hasAny ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace(pathname as never)}
          className="self-end"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
