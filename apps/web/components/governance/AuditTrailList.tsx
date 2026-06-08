'use client';

import { useEffect, useState } from 'react';
import { Card } from '@hsi/ui';
import { ScrollText, Dot } from 'lucide-react';
import { getAuditTrailAction } from '@/app/dashboard/review/actions';
import { fmtDate, type ReviewEntityType } from '@/lib/governance/view';
import { ErrorCard } from '@/components/worldforge/PersistenceUI';

interface AuditEntryView {
  id: string;
  action: string;
  actor?: string;
  detail?: string;
  createdAt?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Tolerantly read an audit row (the action's row shape isn't strongly typed). */
function readEntry(raw: unknown, index: number): AuditEntryView {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<
    string,
    unknown
  >;
  return {
    id: str(r.id) ?? `audit-${index}`,
    action: str(r.action) ?? str(r.event_type) ?? str(r.type) ?? 'event',
    actor: str(r.user_id) ?? str(r.actor) ?? str(r.reviewer_id) ?? str(meta.actor),
    detail: str(r.detail) ?? str(r.details) ?? str(meta.detail) ?? str(r.notes),
    createdAt: str(r.created_at) ?? str(r.createdAt) ?? str(r.timestamp),
  };
}

/**
 * Loads + renders the immutable audit trail for an entity via
 * getAuditTrailAction. Loading / empty / error states. Read-only.
 */
export function AuditTrailList({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const [entries, setEntries] = useState<AuditEntryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getAuditTrailAction(entityType as ReviewEntityType, entityId)
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          const list = Array.isArray(res.data) ? res.data : [];
          setEntries(list.map(readEntry));
        } else {
          setError(res.error);
          setEntries([]);
        }
      })
      .catch(() => {
        if (active) {
          setError('Could not load the audit trail.');
          setEntries([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Audit trail</h3>
      </div>

      {error ? <ErrorCard message={error} title="Could not load audit trail" /> : null}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-card border border-border bg-surface-2/40" />
          ))}
        </div>
      ) : entries && entries.length > 0 ? (
        <ol className="relative space-y-0 border-l border-border pl-4">
          {entries.map((e) => (
            <li key={e.id} className="relative pb-3 last:pb-0">
              <Dot className="absolute -left-[22px] top-0 h-4 w-4 text-electric" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-caption font-semibold text-text-primary">{e.action}</span>
                <span className="text-[11px] text-text-muted">{fmtDate(e.createdAt)}</span>
              </div>
              {e.actor ? (
                <p className="text-[11px] text-text-muted">by {e.actor}</p>
              ) : null}
              {e.detail ? (
                <p className="mt-0.5 text-caption text-text-secondary">{e.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : !error ? (
        <p className="rounded-card border border-border bg-surface-2/40 px-4 py-4 text-center text-caption text-text-muted">
          No audit events recorded yet.
        </p>
      ) : null}
    </Card>
  );
}
