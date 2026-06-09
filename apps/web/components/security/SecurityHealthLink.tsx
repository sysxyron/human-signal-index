// =============================================================================
// HSI Phase 14 — SecurityHealthLink. An ADDITIVE strip surfaced on the
// Operations console linking to the admin Security dashboard. Server-safe;
// purely a navigation affordance (the target page does its own admin-gate). The
// caller wraps render in a guard so any failure simply hides this strip.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ShieldCheck, ArrowRight } from 'lucide-react';

export function SecurityHealthLink() {
  return (
    <Link href={'/dashboard/security' as never} className="block">
      <Card
        className="flex items-center justify-between gap-3 border-electric/30 transition hover:border-electric/60"
        interactive
        padded
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-electric/15 text-electric">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-h6 font-semibold text-text-primary">Security health</h3>
            <p className="text-caption text-text-muted">
              Auth/REST/Storage health, failed logins, access denials &amp; RBAC audit
              (admin).
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
      </Card>
    </Link>
  );
}
