import { Lock, Users, Globe } from 'lucide-react';
import { visibilityStyle, type VisibilityIcon } from '@/lib/governance/view';

const ICONS: Record<VisibilityIcon, typeof Lock> = {
  lock: Lock,
  users: Users,
  globe: Globe,
};

/** A pill rendering a PublicationVisibility tier with an icon. */
export function VisibilityBadge({
  visibility,
  className = '',
}: {
  visibility: string;
  className?: string;
}) {
  const s = visibilityStyle(visibility);
  const Icon = ICONS[s.icon];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
      title={s.help}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}
