// =============================================================================
// HSI Phase 7 — SignalTable. Server-safe compact row view for the signal
// dashboard: title, source, category, type, confidence, status, captured_at.
// Links each row to the signal detail.
// =============================================================================

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { SignalWithContext } from '@hsi/shared-types';
import { relativeTime, formatDateTime, titleize } from '@/lib/signals/view';
import {
  ConfidenceChip,
  SignalCategoryBadge,
  SignalStatusBadge,
} from './badges';

export function SignalTable({
  items,
  demo = false,
}: {
  items: SignalWithContext[];
  demo?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface/60">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {['Signal', 'Source', 'Category', 'Type', 'Confidence', 'Status', 'Captured'].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-label font-semibold text-text-muted"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {items.map(({ signal, source, alerts }) => {
            const open = alerts.filter(
              (a) => a.status === 'open' || a.status === 'escalated',
            ).length;
            const href = `/dashboard/signals/${signal.id}${demo ? '?demo=1' : ''}`;
            return (
              <tr
                key={signal.id}
                className="border-b border-border/60 align-top transition last:border-0 hover:bg-surface-2/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={href as never}
                    className="font-semibold text-text-primary hover:text-electric"
                  >
                    {signal.title}
                  </Link>
                  {open > 0 ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-caption font-semibold text-risk">
                      <AlertTriangle className="h-3 w-3" /> {open}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-caption text-text-secondary">
                  {source?.name ?? 'Manual / unknown'}
                </td>
                <td className="px-4 py-3">
                  <SignalCategoryBadge category={signal.signal_category} />
                </td>
                <td className="px-4 py-3 text-caption text-text-secondary">
                  {signal.signal_type ? titleize(String(signal.signal_type)) : '—'}
                </td>
                <td className="px-4 py-3">
                  <ConfidenceChip confidence={signal.confidence} />
                </td>
                <td className="px-4 py-3">
                  <SignalStatusBadge status={signal.status} />
                </td>
                <td
                  className="px-4 py-3 text-caption text-text-secondary"
                  title={formatDateTime(signal.captured_at)}
                >
                  {relativeTime(signal.captured_at ?? signal.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
