'use client';

// =============================================================================
// HSI Phase 62 — Notification list (client). Renders the user's active
// notifications with mark-read, mark-all-read, and archive controls. Calls server
// actions (RLS-enforced) and refreshes on success. Empty state when none.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Bell, Check, CheckCheck, Archive, ExternalLink } from 'lucide-react';
import { markReadAction, markAllReadAction, archiveNotificationAction } from '@/lib/notifications/actions';
import type { NotificationRecord, NotificationSeverity } from '@/lib/notifications/types';

const SEVERITY_STYLE: Record<NotificationSeverity, string> = {
  INFO: 'border-border bg-surface-2/50 text-text-secondary',
  NOTICE: 'border-electric/40 bg-electric/10 text-electric',
  WARNING: 'border-warning/40 bg-warning/10 text-warning',
  CRITICAL: 'border-risk/40 bg-risk/10 text-risk',
};

export function NotificationList({ items }: { items: NotificationRecord[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? ok : (r.error ?? 'Failed.'));
      if (r.ok) router.refresh();
    });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Your notifications</h3>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" disabled={pending || items.every((i) => i.readAt)} onClick={() => run(() => markAllReadAction(), 'All marked read.')}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-10 text-center text-caption text-text-muted">
          No notifications yet. Operational alerts will appear here as the platform generates them.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className={`flex items-start gap-3 rounded-card border bg-background-deep/40 px-3 py-2.5 ${it.readAt ? 'border-border/60 opacity-80' : 'border-border'}`}
            >
              <span className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[it.severity]}`}>{it.severity}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-body-sm font-semibold text-text-primary">{it.title}</span>
                  {!it.readAt ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-electric" aria-label="unread" /> : null}
                </div>
                {it.body ? <p className="mt-0.5 text-caption text-text-secondary">{it.body}</p> : null}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                  <span className="rounded-full border border-border bg-surface-2/40 px-1.5 py-0.5">{it.type}</span>
                  <span>{it.createdLabel}</span>
                  {it.link ? <a href={it.link} className="inline-flex items-center gap-0.5 text-electric hover:underline">Open <ExternalLink className="h-3 w-3" /></a> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!it.readAt ? (
                  <button type="button" disabled={pending} onClick={() => run(() => markReadAction(it.id), 'Marked read.')} title="Mark read" className="rounded-btn border border-border p-1.5 text-text-muted transition hover:border-electric hover:text-electric disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button type="button" disabled={pending} onClick={() => run(() => archiveNotificationAction(it.id), 'Archived.')} title="Archive" className="rounded-btn border border-border p-1.5 text-text-muted transition hover:border-warning hover:text-warning disabled:opacity-50">
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {msg ? <p className="text-caption text-text-muted">{msg}</p> : null}
    </Card>
  );
}
