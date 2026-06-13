// =============================================================================
// HSI Phase 23 — MigrationStatusPanel. Renders the migration audit (0001→0026):
// applied / missing / out-of-order / failed / unknown, with a compact grid and a
// summary. Server-safe presentational. Used by both /dashboard/launch and
// /dashboard/security.
// =============================================================================

import { Card } from '@hsi/ui';
import { Database, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import type { MigrationAuditResult } from '@/lib/launch/migration-audit';
import { migrationStateColor } from '@/lib/launch/view';

export function MigrationStatusPanel({ audit, demo = false }: { audit: MigrationAuditResult; demo?: boolean }) {
  const summaryIcon = audit.ok ? (
    <CheckCircle2 className="h-4 w-4 text-verified" />
  ) : !audit.verifiable ? (
    <HelpCircle className="h-4 w-4 text-text-muted" />
  ) : (
    <AlertTriangle className="h-4 w-4 text-warning" />
  );

  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Database className="h-4 w-4 text-electric" /> Database migrations (0001→0026)
          {demo ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-label text-text-muted">demo</span> : null}
        </h3>
        <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
          {summaryIcon}
          {audit.verifiable
            ? audit.ok
              ? `All ${audit.total} applied · latest ${audit.latestApplied}`
              : `${audit.applied}/${audit.total} applied · ${audit.missing} missing · ${audit.outOfOrder} out-of-order · ${audit.failed} failed`
            : 'Applied set not verifiable in this environment'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {audit.rows.map((row) => (
          <span
            key={row.id}
            title={`${row.id}_${row.name} — ${row.state}`}
            className="flex h-7 w-9 items-center justify-center rounded text-[10px] font-bold tabular-nums text-white"
            style={{ backgroundColor: migrationStateColor(row.state) }}
          >
            {row.id.replace(/^0+/, '') || '0'}
          </span>
        ))}
      </div>

      {audit.extra.length > 0 ? (
        <p className="text-label text-warning">Drift: {audit.extra.length} applied migration(s) not in the committed set ({audit.extra.join(', ')}).</p>
      ) : null}
      <p className="text-label text-text-muted">
        Source: <span className="font-mono">supabase_migrations.schema_migrations</span>. Unverifiable simply means the ledger
        isn’t exposed to this client — verify with the Supabase CLI (<span className="font-mono">supabase migration list</span>).
      </p>
    </Card>
  );
}
