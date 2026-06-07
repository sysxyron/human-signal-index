'use client';

import { type ReactNode } from 'react';
import {
  Radio,
  FileSearch,
  BrainCircuit,
  Link2,
  ChevronRight,
  X,
  ShieldCheck,
} from 'lucide-react';
import { cn } from './utils';
import { Card } from './primitives';

/* -------------------------------------------------------------------------- */
/* SourceTracePanel — the platform centerpiece                                  */
/* Signal → Evidence → Analysis → Source Trace, with confidence per node.       */
/* -------------------------------------------------------------------------- */

export interface TraceNode {
  label: string;
  detail: string;
  confidence: number;
}

export interface SourceTracePanelProps {
  signal?: TraceNode;
  evidence?: TraceNode;
  analysis?: TraceNode;
  sourceTrace?: TraceNode;
  className?: string;
}

const defaultNodes = {
  signal: {
    label: 'Signal',
    detail: 'Coordinated recruitment narrative detected across 4 platforms',
    confidence: 98,
  },
  evidence: {
    label: 'Evidence',
    detail: '37 captured passages, archived with cryptographic hashes',
    confidence: 94,
  },
  analysis: {
    label: 'Analysis',
    detail: 'Rhetoric classifier: in-group/out-group framing + urgency appeal',
    confidence: 89,
  },
  sourceTrace: {
    label: 'Source Trace',
    detail: 'Origin linked to 3 verified public accounts + 1 syndication hub',
    confidence: 92,
  },
} satisfies Record<string, TraceNode>;

const stages = [
  { key: 'signal', icon: Radio, color: '#3B82F6' },
  { key: 'evidence', icon: FileSearch, color: '#10B981' },
  { key: 'analysis', icon: BrainCircuit, color: '#8B5CF6' },
  { key: 'sourceTrace', icon: Link2, color: '#F59E0B' },
] as const;

export function SourceTracePanel({
  signal = defaultNodes.signal,
  evidence = defaultNodes.evidence,
  analysis = defaultNodes.analysis,
  sourceTrace = defaultNodes.sourceTrace,
  className = '',
}: SourceTracePanelProps) {
  const nodes = { signal, evidence, analysis, sourceTrace };
  return (
    <Card className={cn('space-y-5', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-h6 font-semibold text-text-primary">
            Provenance Chain
          </h4>
          <p className="mt-0.5 text-caption text-text-muted">
            Every claim is traceable back to its source.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-verified/40 bg-verified/10 px-2.5 py-1 text-caption font-semibold text-verified">
          <ShieldCheck className="h-3.5 w-3.5" /> Verified
        </span>
      </div>

      <div className="flex flex-col gap-0">
        {stages.map(({ key, icon: Icon, color }, i) => {
          const node = nodes[key];
          const isLast = i === stages.length - 1;
          return (
            <div key={key} className="relative flex gap-4">
              {/* connector column */}
              <div className="flex flex-col items-center">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                  style={{
                    backgroundColor: `${color}1a`,
                    borderColor: `${color}55`,
                    color,
                    boxShadow: `0 0 18px -4px ${color}80`,
                  }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {!isLast ? (
                  <span
                    className="my-1 w-px flex-1"
                    style={{
                      minHeight: 28,
                      background: `linear-gradient(${color}, ${stages[i + 1].color})`,
                    }}
                  />
                ) : null}
              </div>
              {/* content */}
              <div className={cn('flex-1', !isLast && 'pb-4')}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-label"
                    style={{ color }}
                  >
                    {node.label}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-caption font-semibold text-text-primary">
                      {node.confidence}%
                    </span>
                    <span className="text-[10px] uppercase text-text-muted">
                      confidence
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-body-sm leading-snug text-text-secondary">
                  {node.detail}
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${node.confidence}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* EvidenceDrawer                                                                */
/* -------------------------------------------------------------------------- */

export interface EvidenceItem {
  passage: string;
  source: string;
  capturedAt: string;
  hash: string;
}

export interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: EvidenceItem[];
  footer?: ReactNode;
}

export function EvidenceDrawer({
  open,
  onClose,
  title = 'Evidence Vault',
  items,
  footer,
}: EvidenceDrawerProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 transition',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          'absolute inset-0 bg-background-deep/70 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-electric" />
            <h3 className="text-h6 font-semibold text-text-primary">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-white"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-card border border-border bg-surface-2/60 p-4"
            >
              <p className="border-l-2 border-electric pl-3 text-body-sm italic leading-relaxed text-text-primary">
                “{item.passage}”
              </p>
              <div className="mt-3 flex items-center justify-between text-caption text-text-muted">
                <span className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> {item.source}
                </span>
                <span>{item.capturedAt}</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
                <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono">
                  {item.hash}
                </span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-verified">integrity verified</span>
              </div>
            </div>
          ))}
        </div>
        {footer ? (
          <footer className="border-t border-border px-5 py-4">{footer}</footer>
        ) : null}
      </aside>
    </div>
  );
}
