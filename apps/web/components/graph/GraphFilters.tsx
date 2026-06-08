'use client';

// =============================================================================
// HSI Phase 8 — GraphFilters. A from/to timeline filter + category filter for
// the narrative graph. Updates the querystring; the server re-reads the graph.
// =============================================================================

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Select } from '@hsi/ui';
import { Filter, X } from 'lucide-react';

export function GraphFilters({
  categories,
  basePath = '/dashboard/intelligence/graph',
}: {
  categories: string[];
  basePath?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');

  const apply = () => {
    const next = new URLSearchParams();
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    if (category) next.set('category', category);
    const qs = next.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ''}` as never);
  };

  const clear = () => {
    setFrom('');
    setTo('');
    setCategory('');
    router.push(basePath as never);
  };

  const hasFilters = Boolean(from || to || category);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        label="From"
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="w-40"
      />
      <Input
        label="To"
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="w-40"
      />
      <Select
        label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-48"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Button variant="primary" size="sm" onClick={apply}>
        <Filter className="h-4 w-4" /> Apply
      </Button>
      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="h-4 w-4" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
