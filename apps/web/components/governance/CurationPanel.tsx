import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export interface CurationPanelEntry {
  id: string;
  label: string;
  meta?: string;
  href: string;
  badge?: React.ReactNode;
}

/**
 * A labelled panel listing a homogeneous set of curation items (pending
 * publications, high-priority reviews, escalations, contradiction runs, low
 * coverage runs). Each entry links to its review/publication page. Empty state
 * included.
 */
export function CurationPanel({
  title,
  icon: Icon,
  accent,
  entries,
  emptyMessage,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  entries: CurationPanelEntry[];
  emptyMessage: string;
}) {
  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Icon className="h-4 w-4" style={{ color: accent }} />
          {title}
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-caption font-semibold"
          style={{ backgroundColor: `${accent}1f`, color: accent, border: `1px solid ${accent}55` }}
        >
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-card border border-border bg-surface-2/40 px-4 py-5 text-center text-caption text-text-muted">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href as never}
                className="group flex items-center justify-between gap-2 rounded-card border border-border bg-surface-2/40 px-3 py-2 transition hover:border-electric/50 hover:bg-surface-2/70"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-medium text-text-primary group-hover:text-electric">
                    {e.label}
                  </span>
                  {e.meta ? (
                    <span className="block truncate text-[11px] text-text-muted">{e.meta}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {e.badge}
                  <ArrowRight className="h-3.5 w-3.5 text-text-muted group-hover:text-electric" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
