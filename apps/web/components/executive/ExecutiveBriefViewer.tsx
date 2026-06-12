// =============================================================================
// HSI Phase 22 — ExecutiveBriefViewer. Renders one persisted brief record: kind,
// headline, sections (with source references), and limitations. Server-safe.
// Briefs are advisory and never auto-sent.
// =============================================================================

import { Card } from '@hsi/ui';
import { FileText, Info } from 'lucide-react';
import type { HsinExecutiveBriefRecord } from '@hsi/shared-types';
import { formatDateTime } from '@/lib/executive/view';

interface Section { key?: string; title?: string; items?: string[]; sources?: string[] }

function readSections(value: unknown): Section[] {
  const raw = Array.isArray(value) ? value : (value && typeof value === 'object' ? (value as Record<string, unknown>).items : undefined);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      title: typeof s.title === 'string' ? s.title : undefined,
      items: Array.isArray(s.items) ? s.items.map((x) => String(x)) : [],
      sources: Array.isArray(s.sources) ? s.sources.map((x) => String(x)) : [],
    }));
}
function readList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : (value && typeof value === 'object' ? (value as Record<string, unknown>).items : undefined);
  return Array.isArray(raw) ? raw.map((x) => String(x)) : [];
}

export function ExecutiveBriefViewer({ brief }: { brief: HsinExecutiveBriefRecord }) {
  const sections = readSections(brief.sections);
  const limitations = readList(brief.limitations);
  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <FileText className="h-4 w-4 text-electric" /> {brief.title ?? 'Brief'}
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-label uppercase tracking-wide text-text-muted">{brief.kind}</span>
        </h3>
        <span className="text-label text-text-muted">{formatDateTime(brief.generated_at ?? brief.created_at)}</span>
      </div>
      {brief.headline ? <p className="text-caption leading-relaxed text-text-secondary">{brief.headline}</p> : null}

      <div className="space-y-3">
        {sections.map((s, i) => (
          <div key={i} className="rounded-card border border-border bg-surface/50 p-3">
            <div className="text-label font-semibold uppercase tracking-wide text-text-primary">{s.title}</div>
            <ul className="mt-1 space-y-0.5 text-caption text-text-secondary">
              {(s.items ?? []).map((it, j) => <li key={j} className="flex gap-1.5"><span className="text-electric">•</span> {it}</li>)}
            </ul>
            {s.sources && s.sources.length > 0 ? (
              <div className="mt-1 text-label text-text-muted">Sources: {Array.from(new Set(s.sources)).slice(0, 8).join(', ')}</div>
            ) : null}
          </div>
        ))}
      </div>

      {limitations.length > 0 ? (
        <div className="space-y-0.5">
          {limitations.map((l, i) => (
            <p key={i} className="flex items-start gap-1.5 text-label text-text-muted"><Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" /> {l}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
