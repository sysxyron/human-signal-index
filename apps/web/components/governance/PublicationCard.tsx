import Link from 'next/link';
import { Card } from '@hsi/ui';
import { FileText, ArrowRight, History, User } from 'lucide-react';
import type { PublicationRecord } from '@hsi/shared-types';
import { VisibilityBadge } from './VisibilityBadge';
import { entityLabel, fmtDate } from '@/lib/governance/view';

/** A card summarizing one publication record, linking to its detail page. */
export function PublicationCard({
  record,
  title,
}: {
  record: PublicationRecord;
  title?: string;
}) {
  return (
    <Link href={`/dashboard/publications/${record.id}`} className="block">
      <Card interactive className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
              <FileText className="h-4 w-4 shrink-0 text-electric" />
              <span className="truncate">
                {title ?? `${entityLabel(record.entity_type)} ${record.entity_id.slice(0, 8)}`}
              </span>
            </h3>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {entityLabel(record.entity_type)} · {record.entity_id.slice(0, 12)}
            </p>
          </div>
          <VisibilityBadge visibility={record.visibility} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {record.published_by ? record.published_by.slice(0, 12) : 'system'}
          </span>
          <span>Published {fmtDate(record.published_at)}</span>
          <span className="inline-flex items-center gap-1">
            <History className="h-3.5 w-3.5" />v{record.latest_version ?? 1}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 text-caption font-semibold text-electric">
          View report <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Card>
    </Link>
  );
}
