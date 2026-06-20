// =============================================================================
// HSI Phase 70.3.3 — Source detail view (server, display-only). Full network
// intelligence for one source: health, capability, geo, identity/family, yield,
// linked intelligence, and the recommended next action. No actions performed.
// =============================================================================

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ArrowLeft, Activity, Gauge, MapPin, Network, TrendingUp, Lightbulb } from 'lucide-react';
import type { SourceNetworkDetail } from '@/lib/source-network/data';
import { trendLabel } from '@/lib/source-network/yield';

const n = (v: number) => v.toLocaleString('en-US');

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="space-y-0.5"><div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div><div className="text-body-sm text-text-primary">{value}</div></div>;
}

export function SourceDetailView({ d }: { d: SourceNetworkDetail }) {
  const r = d.row;
  return (
    <div className="space-y-6">
      <Link href={'/dashboard/source-discovery' as never} className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-electric"><ArrowLeft className="h-3.5 w-3.5" /> Back to Source Discovery</Link>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h5 font-semibold text-text-primary">{r.name}</h2>
          <span className="text-[10px] uppercase tracking-wide text-text-muted">{r.sourceType ?? '—'}{r.category ? ` · ${r.category}` : ''}</span>
          {r.homepageUrl ? <a href={r.homepageUrl} target="_blank" rel="noreferrer noopener" className="text-caption text-electric hover:underline">{r.homepageUrl}</a> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Health" value={<span>{r.health} <span className="text-text-muted">— {r.healthReason}</span></span>} />
          <Field label="Collection capability" value={<span>{r.capabilityTier} ({r.capabilityScore}/100) <span className="text-text-muted">— {r.capabilityReason}</span></span>} />
          <Field label="Geo readiness" value={<span>{r.geoReadiness.replace(/_/g, ' ')} <span className="text-text-muted">— {r.geoReason}</span></span>} />
          <Field label="Collection priority" value={<span>{r.priority} <span className="text-text-muted">— {r.priorityReason}</span></span>} />
          <Field label="Identity key" value={<code className="text-[11px]">{r.identityKey ?? '—'}</code>} />
          <Field label="Source family" value={d.family ? <Link href={'/dashboard/source-discovery' as never} className="text-electric hover:underline">{d.family.displayName} ({d.family.size} assets)</Link> : '—'} />
          <Field label="Trust score" value={r.trustScore != null ? `${Math.round(r.trustScore)}${r.trustBand ? ` (${r.trustBand})` : ''}` : 'not yet observed'} />
          <Field label="Status" value={r.status ?? '—'} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Signal yield</h3></div>
          {r.yield.observed ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { l: 'Signals', v: r.yield.signals }, { l: 'Evidence', v: d.evidenceCount }, { l: 'Reports', v: d.reportsCount },
                { l: 'Narratives', v: d.narrativesCount }, { l: 'Forecasts', v: d.forecastsCount }, { l: 'Trend', v: r.yield.trend },
              ].map((c) => <div key={c.l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{typeof c.v === 'number' ? n(c.v) : trendLabel(c.v as never)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{c.l}</div></div>)}
            </div>
          ) : <p className="text-caption text-text-muted">Not yet observed — this source has produced no signals, evidence, or reports.</p>}
          <p className="text-[11px] text-text-muted">Last signal: {r.yield.lastSignalLabel}</p>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Network className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Linked intelligence</h3></div>
          {d.linkedSignals.length === 0 ? <p className="text-caption text-text-muted">No linked signals yet.</p> : (
            <ul className="space-y-1">{d.linkedSignals.map((s) => <li key={s.id} className="flex items-center justify-between text-caption text-text-secondary"><span>Signal</span><span className="text-text-muted">{s.whenLabel}</span></li>)}</ul>
          )}
          <p className="text-[11px] text-text-muted">Evidence claims referencing this domain: {n(d.evidenceCount)} · reports: {n(d.reportsCount)}.</p>
        </Card>
      </div>

      <Card className="space-y-2">
        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-warning" /><h3 className="text-h6 font-semibold text-text-primary">Recommended next action</h3></div>
        <p className="text-body-sm text-text-primary">{r.nextAction}</p>
        <p className="text-[11px] text-text-muted">Advisory only — nothing activates, publishes, or changes a source automatically. Human review required.</p>
      </Card>
    </div>
  );
}
