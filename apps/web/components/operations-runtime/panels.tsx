// =============================================================================
// HSI Phase 74.3 — Operations Center panels (server, display-only, READ-ONLY).
// Surfaces runtime flags, read-routing decisions, backend availability, and a
// human summary from the live runtime snapshot. No editing, no mutations.
// =============================================================================

import type { ReactNode } from 'react';
import { Card } from '@hsi/ui';
import { SlidersHorizontal, Network, Server, FileText, Clock } from 'lucide-react';
import type { RuntimeStatus, AvailabilityStatus } from '@/lib/operations-runtime/data';

const ON = 'border-verified/40 bg-verified/10 text-verified';
const OFF = 'border-border bg-surface-2/50 text-text-muted';
const WARN = 'border-warning/40 bg-warning/10 text-warning';
const RISK = 'border-risk/40 bg-risk/10 text-risk';

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}

const AVAIL_STYLE: Record<AvailabilityStatus, string> = { PASS: ON, WARNING: WARN, FAIL: RISK, NOT_OBSERVED: OFF };
const HEALTH_STYLE: Record<string, string> = { healthy: ON, degraded: WARN, down: RISK, unknown: OFF };

function boolBadge(v: boolean) { return <Badge label={v ? 'ON' : 'OFF'} className={v ? ON : OFF} />; }

export function OperationsCenter({ status }: { status: RuntimeStatus }) {
  const r = status.runtime;
  const flags: { label: string; value: string; badge: ReactNode }[] = [
    { label: 'HSI Mode', value: r.hsiMode, badge: <Badge label={r.hsiMode} className={r.hsiMode === 'normal' ? ON : r.hsiMode === 'protected_read' ? WARN : RISK} /> },
    { label: 'Maintenance Banner', value: r.maintenanceBanner ? 'active' : 'off', badge: <Badge label={r.maintenanceBanner ? 'ACTIVE' : 'OFF'} className={r.maintenanceBanner ? WARN : OFF} /> },
    { label: 'Maintenance Message', value: r.maintenanceMessage || '—', badge: <Badge label={r.maintenanceMessage ? 'SET' : 'EMPTY'} className={r.maintenanceMessage ? WARN : OFF} /> },
    { label: 'Beta Signup', value: r.betaSignupOpen ? 'open' : 'paused', badge: <Badge label={r.betaSignupOpen ? 'OPEN' : 'PAUSED'} className={r.betaSignupOpen ? ON : WARN} /> },
    { label: 'Global Map', value: r.globalMapEnabled ? 'enabled' : 'disabled', badge: boolBadge(r.globalMapEnabled) },
    { label: 'Source Ingest', value: r.sourceIngestEnabled ? 'enabled' : 'disabled', badge: boolBadge(r.sourceIngestEnabled) },
    { label: 'Protected Read Mode', value: r.protectedReadMode ? 'enabled' : 'disabled', badge: <Badge label={r.protectedReadMode ? 'ON' : 'OFF'} className={r.protectedReadMode ? WARN : OFF} /> },
    { label: 'Primary DB Health', value: r.primaryDbHealth, badge: <Badge label={r.primaryDbHealth} className={r.primaryDbHealth === 'healthy' ? ON : r.primaryDbHealth === 'down' ? RISK : r.primaryDbHealth === 'degraded' ? WARN : OFF} /> },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-h5 font-semibold text-text-primary">Operations Center</h2>
          <p className="text-caption text-text-muted">Read-only view of current runtime state. Source: {r.source}. Last runtime evaluation (UTC): {new Date(status.timestamp).toUTCString()}.</p>
        </div>
      </div>

      {/* Runtime summary */}
      <Card className="space-y-2">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Runtime summary</h3></div>
        <ul className="space-y-0.5">{status.summary.lines.map((l, i) => <li key={i} className="text-body-sm text-text-secondary">{l}</li>)}</ul>
      </Card>

      {/* Runtime flags */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Runtime flags</h3><span className="ml-auto text-caption text-text-muted">source: {r.source}</span></div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {flags.map((f) => (
            <li key={f.label} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption">
              <span className="min-w-0 flex-1 truncate text-text-secondary">{f.label}</span>
              <span className="shrink-0 truncate text-text-primary">{f.value}</span>
              {f.badge}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Read routing */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Network className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Read routing status</h3></div>
          {(['public', 'dashboard'] as const).map((scope) => {
            const d = status.routing[scope];
            return (
              <div key={scope} className="space-y-0.5 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption">
                <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-wide text-text-muted">{scope} reads</span>{d.requestedBackend !== d.effectiveBackend ? <Badge label="fallback" className={WARN} /> : <Badge label="ok" className={ON} />}</div>
                <p className="text-text-secondary">Requested: <span className="text-text-primary">{d.requestedBackend}</span> · Effective: <span className="text-text-primary">{d.effectiveBackend}</span></p>
                {d.fallbackReason ? <p className="text-[11px] text-warning">Reason: {d.fallbackReason}</p> : null}
              </div>
            );
          })}
        </Card>

        {/* Backend availability */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Server className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Backend availability</h3></div>
          <ul className="space-y-1">
            {(Object.entries(status.availability) as [string, AvailabilityStatus][]).map(([backend, st]) => (
              <li key={backend} className="flex items-center gap-2 text-caption">
                <span className="min-w-0 flex-1 truncate text-text-secondary capitalize">{backend}</span>
                <Badge label={st.replace('_', ' ')} className={AVAIL_STYLE[st]} />
              </li>
            ))}
          </ul>
          <div className="border-t border-border pt-2">
            <div className="flex items-center gap-2 text-caption">
              <span className="min-w-0 flex-1 truncate text-text-secondary">Live primary DB probe</span>
              <span className="shrink-0 text-text-muted">{status.databaseHealth.latencyMs != null ? `${status.databaseHealth.latencyMs}ms · ` : ''}{status.databaseHealth.probe}</span>
              <Badge label={status.databaseHealth.status} className={HEALTH_STYLE[status.databaseHealth.status] ?? OFF} />
            </div>
          </div>
          <p className="text-[11px] text-text-muted">Primary is the live write/read backend (probed read-only above). Replica, D1, and cache are declared for future use and not yet implemented.</p>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-caption text-text-muted"><Clock className="h-3.5 w-3.5" /> Last runtime evaluation (UTC): {new Date(status.timestamp).toUTCString()}</p>
    </section>
  );
}
