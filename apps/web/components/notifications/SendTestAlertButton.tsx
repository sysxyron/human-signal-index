'use client';

// =============================================================================
// HSI Phase 62 — Admin "send test alert" (client). Exercises the notification
// pipeline end-to-end (create → receive → view) by addressing a SYSTEM_ALERT to
// the admin themselves. Honors the admin's own preferences (may be suppressed).
// Admin-only; rendered only for admins by the page.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Send } from 'lucide-react';
import { createSelfNotificationAction } from '@/lib/notifications/actions';

export function SendTestAlertButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const send = () =>
    start(async () => {
      setMsg(null);
      const r = await createSelfNotificationAction({
        type: 'SYSTEM_ALERT',
        severity: 'NOTICE',
        title: 'Test alert',
        body: 'This is a self-addressed test of the notification pipeline.',
      });
      setMsg(r.ok ? (r.data.suppressed ? 'Suppressed by your preferences.' : 'Test alert sent.') : (r.error ?? 'Failed.'));
      if (r.ok && !r.data.suppressed) router.refresh();
    });

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" disabled={pending} onClick={send}><Send className="h-4 w-4" /> Send test alert</Button>
      {msg ? <span className="text-caption text-text-muted">{msg}</span> : null}
    </div>
  );
}
