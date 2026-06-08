import { Flame, ChevronUp, Minus } from 'lucide-react';
import { priorityStyle } from '@/lib/governance/view';

/** A pill rendering a ReviewPriority with its governance color + an intensity icon. */
export function PriorityBadge({
  priority,
  className = '',
}: {
  priority: string;
  className?: string;
}) {
  const s = priorityStyle(priority);
  const Icon =
    priority === 'urgent' ? Flame : priority === 'high' ? ChevronUp : Minus;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}
