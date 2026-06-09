// =============================================================================
// HSI Phase 14B — startup environment validation panel for /dashboard/security.
// Shows required vs optional env status. Renders an admin WARNING banner when a
// required var is missing/invalid; optional misses render as degraded (info).
// NEVER displays secret values — only key names + present/valid status.
// Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { AlertTriangle, CheckCircle2, CircleSlash, KeyRound } from 'lucide-react';
import type { EnvValidationSummary } from '@hsi/shared-types';

export function EnvStatusPanel({ env }: { env: EnvValidationSummary }) {
  const requiredBad = !env.ok || env.requiredMissing.length > 0;

  return (
    <section className="space-y-3">
      {/* Admin warning banner when a REQUIRED env var is missing/invalid. */}
      {requiredBad ? (
        <Card className="space-y-1.5 border-risk/50 bg-risk/10" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-risk">
            <AlertTriangle className="h-4 w-4" /> Required environment variables missing
          </h3>
          <p className="text-caption leading-relaxed text-text-secondary">
            {env.requiredMissing.length > 0
              ? `Not set: ${env.requiredMissing.join(', ')}. `
              : 'One or more required variables are invalid. '}
            The platform may not function until these are configured. See
            {' '}docs/deployment/cloudflare-supabase-auth.md.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-4" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <KeyRound className="h-4 w-4 text-electric" /> Environment validation
          {env.ok ? (
            <span className="ml-2 rounded-full bg-verified/15 px-2 py-0.5 text-caption font-semibold text-verified">
              OK
            </span>
          ) : (
            <span className="ml-2 rounded-full bg-risk/15 px-2 py-0.5 text-caption font-semibold text-risk">
              Action required
            </span>
          )}
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          <EnvList title="Required" rows={env.required.map((r) => ({ key: r.key, ok: r.present && r.valid, present: r.present, message: r.message }))} requiredList />
          <EnvList
            title="Optional"
            rows={env.optional.map((o) => ({ key: o.key, ok: o.present, present: o.present }))}
          />
        </div>

        {env.warnings.length > 0 ? (
          <div className="space-y-1 rounded-btn border border-warning/40 bg-warning/5 p-3">
            <p className="text-label text-warning">Warnings</p>
            <ul className="space-y-1">
              {env.warnings.map((w, i) => (
                <li key={`${w.key}-${i}`} className="text-caption text-text-secondary">
                  {w.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-caption text-text-muted">
          No secret values are shown — only whether each variable is set and valid.
        </p>
      </Card>
    </section>
  );
}

function EnvList({
  title,
  rows,
  requiredList = false,
}: {
  title: string;
  rows: { key: string; ok: boolean; present: boolean; message?: string }[];
  requiredList?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-label text-text-secondary">{title}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const good = r.ok;
          const Icon = good ? CheckCircle2 : requiredList ? AlertTriangle : CircleSlash;
          const color = good
            ? 'text-verified'
            : requiredList
              ? 'text-risk'
              : 'text-text-muted';
          const label = good
            ? requiredList
              ? 'configured'
              : 'enabled'
            : requiredList
              ? r.present
                ? 'invalid'
                : 'missing'
              : 'not set (degraded)';
          return (
            <li
              key={r.key}
              className="flex items-center justify-between gap-2 rounded-btn border border-border bg-surface-2/40 px-3 py-1.5"
            >
              <span className="flex items-center gap-2 font-mono text-caption text-text-primary">
                <Icon className={`h-3.5 w-3.5 ${color}`} /> {r.key}
              </span>
              <span className={`text-caption ${color}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
