// =============================================================================
// HSI Phase 9 — ProviderAccountStatus. Derives a per-provider account summary
// from recent runs + rate limits: configured vs provider_not_configured, the
// last-seen outcome, and the most recent run time. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Boxes, CheckCircle2, XCircle, CircleSlash } from 'lucide-react';
import type {
  HsinProviderRateLimitRecord,
  HsinProviderRunRecord,
} from '@hsi/shared-types';
import { relativeTime, titleize } from '@/lib/operations/phase9-view';

interface ProviderAccount {
  name: string;
  configured: boolean;
  lastOk: boolean | null;
  lastReason?: string;
  lastSeen?: string;
  runCount: number;
}

function deriveAccounts(
  runs: HsinProviderRunRecord[],
  rateLimits: HsinProviderRateLimitRecord[],
): ProviderAccount[] {
  const map = new Map<string, ProviderAccount>();
  for (const rl of rateLimits) {
    map.set(rl.provider_name, {
      name: rl.provider_name,
      configured: true,
      lastOk: null,
      runCount: 0,
    });
  }
  // Runs sorted newest-first so the first run per provider is the latest.
  const sorted = [...runs].sort((a, b) =>
    (b.finished_at ?? b.started_at ?? b.created_at).localeCompare(
      a.finished_at ?? a.started_at ?? a.created_at,
    ),
  );
  for (const run of sorted) {
    const existing = map.get(run.provider_name);
    const notConfigured = run.reason === 'provider_not_configured';
    if (existing) {
      existing.runCount += 1;
      if (existing.lastSeen === undefined) {
        existing.lastOk = run.ok ?? null;
        existing.lastReason = run.reason ?? undefined;
        existing.lastSeen = run.finished_at ?? run.started_at ?? run.created_at;
        if (notConfigured) existing.configured = false;
      }
    } else {
      map.set(run.provider_name, {
        name: run.provider_name,
        configured: !notConfigured,
        lastOk: run.ok ?? null,
        lastReason: run.reason ?? undefined,
        lastSeen: run.finished_at ?? run.started_at ?? run.created_at,
        runCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function ProviderAccountStatus({
  runs,
  rateLimits,
}: {
  runs: HsinProviderRunRecord[];
  rateLimits: HsinProviderRateLimitRecord[];
}) {
  const accounts = deriveAccounts(runs, rateLimits);
  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Boxes className="h-4 w-4 text-electric" /> Provider accounts
      </h3>
      {accounts.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No provider activity recorded yet. Configured adapters appear here once they run
          or report a rate-limit window.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => {
            const status = !a.configured
              ? { label: 'Not configured', color: '#94A3B8', Icon: CircleSlash }
              : a.lastOk === false
                ? { label: 'Last run failed', color: '#EF4444', Icon: XCircle }
                : { label: 'Configured', color: '#10B981', Icon: CheckCircle2 };
            const Icon = status.Icon;
            return (
              <div
                key={a.name}
                className="space-y-1.5 rounded-card border border-border bg-surface-2/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-text-primary">{titleize(a.name)}</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-semibold"
                    style={{ backgroundColor: `${status.color}1f`, color: status.color, border: `1px solid ${status.color}55` }}
                  >
                    <Icon className="h-3.5 w-3.5" /> {status.label}
                  </span>
                </div>
                <p className="text-caption text-text-muted">
                  {a.runCount} run{a.runCount === 1 ? '' : 's'} observed
                  {a.lastSeen ? ` · last ${relativeTime(a.lastSeen)}` : ''}
                  {a.lastReason && a.lastReason !== 'provider_not_configured'
                    ? ` · ${titleize(a.lastReason)}`
                    : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
