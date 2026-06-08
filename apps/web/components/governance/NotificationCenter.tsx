'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import type { NotificationRecord } from '@hsi/shared-types';
import {
  listNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/dashboard/review/actions';
import { fmtRelative, notificationTone, entityLabel } from '@/lib/governance/view';

/** Resolve a notification to a navigable href when it references an entity. */
function hrefFor(n: NotificationRecord): string | null {
  if (!n.entity_type || !n.entity_id) return null;
  switch (n.entity_type) {
    case 'publication':
      return `/dashboard/publications/${n.entity_id}`;
    case 'research_run':
    case 'consensus_report':
    case 'evidence_summary':
    case 'worldforge_report':
      return `/dashboard/review/${n.entity_id}`;
    default:
      return `/dashboard/review/${n.entity_id}`;
  }
}

const POLL_MS = 60_000;

/**
 * Notification bell + dropdown. Loads notifications on mount and polls every
 * 60s, shows an unread count, marks individual notifications read and supports
 * mark-all-read. Degrades silently (hides the badge) when the action fails or
 * the user is signed out — never blocks the chrome.
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await listNotificationsAction();
    if (res.ok) {
      setNotifications(res.data);
      setError(null);
    } else if (res.code !== 'AUTH_REQUIRED') {
      setError(res.error);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = notifications.filter((n) => !n.read).length;

  const markOne = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  };

  const markAll = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative rounded-lg border border-border bg-surface/80 p-2 text-text-secondary transition hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-risk px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-card border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-caption font-semibold text-text-primary">
              Notifications {unread > 0 ? `(${unread})` : ''}
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={markAll}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-electric hover:text-white"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!loaded ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-card border border-border bg-surface-2/40"
                  />
                ))}
              </div>
            ) : error ? (
              <p className="px-3 py-6 text-center text-caption text-text-muted">{error}</p>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-caption text-text-muted">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const tone = notificationTone(n.type);
                  const href = hrefFor(n);
                  const body = (
                    <div
                      className={`flex gap-2.5 px-3 py-2.5 transition hover:bg-surface-2/50 ${
                        n.read ? 'opacity-60' : ''
                      }`}
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tone, boxShadow: `0 0 6px ${tone}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-semibold text-text-primary">
                          {n.title}
                        </p>
                        {n.body ? (
                          <p className="text-[11px] leading-relaxed text-text-secondary">{n.body}</p>
                        ) : null}
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-muted">
                          <span>{fmtRelative(n.created_at)}</span>
                          {n.entity_type ? <span>· {entityLabel(n.entity_type)}</span> : null}
                        </div>
                      </div>
                      {!n.read ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            markOne(n.id);
                          }}
                          aria-label="Mark read"
                          className="self-start text-text-muted hover:text-electric"
                          title="Mark read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                  return (
                    <li key={n.id} className="border-b border-border/60 last:border-0">
                      {href ? (
                        <Link href={href as never} onClick={() => setOpen(false)}>
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
