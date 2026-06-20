// =============================================================================
// HSI Phase 70.4 — Signal detail view (server, display-only). Full traceable
// lineage for one signal: metadata, evidence, claims, relationships, narratives,
// forecasts, health, influence, source lineage, transparency lineage. Read-only.
// =============================================================================

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ArrowLeft, Activity, GitBranch, Layers, Target, Network, FileText, MapPin } from 'lucide-react';
import type { SignalNetworkDetail } from '@/lib/signal-network/data';
import { signalHealthLabel } from '@/lib/signal-network/health';
import { relationshipLabel } from '@/lib/signal-network/relationships';
import type { SignalRelationship } from '@/lib/signal-network/types';

const n = (v: number) => v.toLocaleString('en-US');

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="space-y-0.5"><div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div><div className="text-body-sm text-text-primary">{value}</div></div>;
}

export function SignalDetailView({ d }: { d: SignalNetworkDetail }) {
  const r = d.row;
  return (
    <div className="space-y-6">
      <Link href={'/dashboard/signal-network' as never} className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-electric"><ArrowLeft className="h-3.5 w-3.5" /> Back to Signal Network</Link>

      {/* metadata + health + influence */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h5 font-semibold text-text-primary">{r.title}</h2>
          <span className="text-[10px] uppercase tracking-wide text-text-muted">{d.signalType ?? '—'}{r.category ? ` · ${r.category}` : ''}{r.status ? ` · ${r.status}` : ''}</span>
        </div>
        {d.signalSummary ? <p className="text-body-sm text-text-secondary">{d.signalSummary}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Health" value={<span>{signalHealthLabel(r.health)} <span className="text-text-muted">— {r.healthReason}</span></span>} />
          <Field label="Reach" value={`${n(r.influence.reach)} connected nodes`} />
          <Field label="Downstream usage" value={`${n(r.influence.downstreamUsage)} (reports + forecasts + narratives)`} />
          <Field label="Supporting evidence" value={n(r.influence.supportingEvidence)} />
          <Field label="Confidence" value={d.confidence != null ? `${Math.round(d.confidence * 100)}%` : 'not recorded'} />
          <Field label="Captured" value={r.createdLabel} />
          <Field label="Source lineage" value={d.sourceId ? <Link href={`/dashboard/source-discovery/source/${d.sourceId}` as never} className="text-electric hover:underline">{d.sourceName ?? 'Source'}</Link> : 'no source recorded'} />
          <Field label="Transparency" value={<Link href={'/transparency' as never} className="text-electric hover:underline">Public transparency portal</Link>} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* relationships */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Relationships</h3><span className="ml-auto text-caption text-text-muted">{n(r.relationshipTotal)}</span></div>
          {d.relationships.length === 0 ? <p className="text-caption text-text-muted">No graph relationships yet.</p> : (
            <ul className="space-y-1">
              {d.relationships.map((rel, i) => (
                <li key={i} className="flex items-center gap-2 text-caption">
                  <span className="shrink-0 rounded-full border border-border bg-surface-2/40 px-2 py-0.5 text-[10px] text-text-secondary">{(SIGNAL_REL.includes(rel.type as SignalRelationship) ? relationshipLabel(rel.type as SignalRelationship) : rel.type)}</span>
                  <span className="text-text-muted">{rel.direction === 'incoming' ? '←' : '→'}</span>
                  <span className="min-w-0 flex-1 truncate text-text-secondary">{rel.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{rel.targetType}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* evidence + reports */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Network className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Evidence & claims</h3><span className="ml-auto text-caption text-text-muted">{n(d.evidence.length)}</span></div>
          {d.evidence.length === 0 ? <p className="text-caption text-text-muted">No connected evidence/claims.</p> : (
            <ul className="space-y-1">{d.evidence.map((e, i) => <li key={i} className="flex items-center gap-2 text-caption text-text-secondary"><span className="text-[10px] uppercase tracking-wide text-text-muted">{e.type}</span><span className="min-w-0 flex-1 truncate">{e.label}</span></li>)}</ul>
          )}
          {d.reports.length > 0 ? (
            <div className="space-y-1 border-t border-border pt-2">
              <div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-text-muted" /><span className="text-[10px] uppercase tracking-wide text-text-muted">Reports</span></div>
              <ul className="space-y-1">{d.reports.map((rep, i) => <li key={i} className="truncate text-caption text-text-secondary">{rep.label}</li>)}</ul>
            </div>
          ) : null}
        </Card>

        {/* narratives */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Narratives</h3><span className="ml-auto text-caption text-text-muted">{n(d.narratives.length)}</span></div>
          {d.narratives.length === 0 ? <p className="text-caption text-text-muted">Not attributed to any narrative.</p> : (
            <ul className="space-y-1">{d.narratives.map((nr) => <li key={nr.id} className="flex items-center gap-2 text-caption"><Link href={'/dashboard/narratives' as never} className="min-w-0 flex-1 truncate text-text-secondary hover:text-electric">{nr.name}</Link>{nr.status ? <span className="text-[10px] uppercase tracking-wide text-text-muted">{nr.status}</span> : null}</li>)}</ul>
          )}
        </Card>

        {/* forecasts */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Target className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Forecasts</h3><span className="ml-auto text-caption text-text-muted">{n(d.forecasts.length)}</span></div>
          {d.forecasts.length === 0 ? <p className="text-caption text-text-muted">No forecasts attributed via this signal&apos;s narratives.</p> : (
            <ul className="space-y-1">{d.forecasts.map((f) => <li key={f.id} className="flex items-center gap-2 text-caption"><Link href={'/dashboard/forecast-validation' as never} className="min-w-0 flex-1 truncate text-text-secondary hover:text-electric">{f.title}</Link>{f.status ? <span className="text-[10px] uppercase tracking-wide text-text-muted">{f.status}</span> : null}</li>)}</ul>
          )}
        </Card>
      </div>

      <Card className="space-y-1">
        <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-text-muted" /><MapPin className="h-4 w-4 text-text-muted" /><h3 className="text-h6 font-semibold text-text-primary">Lineage note</h3></div>
        <p className="text-[11px] text-text-muted">Every relationship above is a real graph edge to an existing record. Nothing is inferred or fabricated; this view reads the evidence graph, narratives, and forecasts. Human review remains authoritative.</p>
      </Card>
    </div>
  );
}

const SIGNAL_REL: SignalRelationship[] = ['SUPPORTS', 'CONTRADICTS', 'REFERENCES', 'DERIVED_FROM', 'RELATED_TO'];
