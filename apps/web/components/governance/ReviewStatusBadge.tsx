import { CircleDot } from 'lucide-react';
import { statusStyle } from '@/lib/governance/view';

/** A pill rendering a ReviewQueueStatus with its governance color. */
export function ReviewStatusBadge({
  status,
  className = '',
}: {
  status: string;
  className?: string;
}) {
  const s = statusStyle(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
    >
      <CircleDot className="h-3 w-3" />
      {s.label}
    </span>
  );
}
