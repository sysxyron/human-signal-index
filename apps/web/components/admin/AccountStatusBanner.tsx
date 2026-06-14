'use client';

// =============================================================================
// HSI Phase 24B — AccountStatusBanner. Surfaces the signed-in user's account
// status (pending / suspended / disabled) clearly across the dashboard so invited
// users understand they are awaiting admin approval. Read-only, additive — it does
// NOT change middleware or RBAC enforcement; it informs the user.
// =============================================================================

import { useEffect, useState } from 'react';
import { ShieldAlert, Clock } from 'lucide-react';
import { getMyStatusAction } from '@/lib/admin/actions';

type Status = 'pending' | 'active' | 'suspended' | 'disabled';

const COPY: Record<Exclude<Status, 'active'>, { icon: typeof Clock; title: string; body: string; tone: string }> = {
  pending: { icon: Clock, title: 'Your account is pending approval', body: 'An administrator needs to approve your account before you have full access. You can look around in the meantime.', tone: '#F59E0B' },
  suspended: { icon: ShieldAlert, title: 'Your account is suspended', body: 'Access is temporarily limited. Contact an administrator if you believe this is a mistake.', tone: '#EF4444' },
  disabled: { icon: ShieldAlert, title: 'Your account is disabled', body: 'This account has been disabled. Contact an administrator for help.', tone: '#EF4444' },
};

export function AccountStatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let active = true;
    getMyStatusAction()
      .then((res) => { if (active && res.ok) setStatus(res.data.status); })
      .catch(() => { /* ignore — banner is best-effort */ });
    return () => { active = false; };
  }, []);

  if (!status || status === 'active') return null;
  const c = COPY[status];
  const Icon = c.icon;
  return (
    <div role="status" className="flex items-start gap-2.5 border-b px-4 py-2.5" style={{ borderColor: `${c.tone}55`, backgroundColor: `${c.tone}14` }}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: c.tone }} />
      <div className="text-caption">
        <span className="font-semibold text-text-primary">{c.title}.</span>{' '}
        <span className="text-text-secondary">{c.body}</span>
      </div>
    </div>
  );
}
