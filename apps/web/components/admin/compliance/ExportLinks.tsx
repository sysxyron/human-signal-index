// =============================================================================
// HSI Phase 41 — compliance export links (server-safe). Anchors hit the
// admin-gated export route which streams a CSV/JSON download.
// =============================================================================

import { Download } from 'lucide-react';

export function ExportLinks({ type, label }: { type: string; label?: string }) {
  const base = `/api/admin/compliance/export?type=${encodeURIComponent(type)}`;
  return (
    <span className="inline-flex items-center gap-2 text-caption">
      <Download className="h-3.5 w-3.5 text-text-muted" />
      <span className="text-text-muted">{label ?? 'Export'}:</span>
      <a className="font-semibold text-electric hover:text-white" href={`${base}&format=csv`}>CSV</a>
      <span className="text-text-muted">·</span>
      <a className="font-semibold text-electric hover:text-white" href={`${base}&format=json`}>JSON</a>
    </span>
  );
}
