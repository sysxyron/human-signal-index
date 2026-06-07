// =============================================================================
// WorldForge Phase 3 — Research view helpers (CLIENT-SAFE).
// Pure presentation helpers + small typed view-casts for the jsonb columns the
// persistence layer stores (`output` / `report` / `blueprint`). No server-only
// imports here — this module is imported by 'use client' components.
//
// RECORD TYPES: the canonical record/bundle types live in `@hsi/shared-types`
// (owned by the persistence agent). We import + re-export them so every research
// component shares one type surface, and add the client-safe `DbResult`, jsonb
// view-casts, and the unified `ResearchRunView` adapter on top.
// =============================================================================

import type {
  AgentDomain,
  AgentOutput,
  ConsensusReport,
  Dispute,
  ProvenanceSource,
  ResearchRunResult,
  ScientificConfidenceTier,
  SimulationBlueprint,
} from '@hsi/research-agents';
import type {
  ResearchRunRecord,
  ResearchRunBundle,
  ResearchAgentOutputRecord,
  ResearchConsensusReportRecord,
  ResearchDisputeRecord,
  ResearchCitationRecord,
  ResearchRunStatus,
} from '@hsi/shared-types';
import {
  Atom,
  Globe2,
  FlaskConical,
  Dna,
  Sprout,
  Brain,
  Building2,
  Sigma,
  ShieldAlert,
  Search,
  ScalesIcon,
  type LucideIcon,
} from './research-icons';

// Re-export the canonical record types so research components import from one
// place (this client-safe module) rather than reaching into @hsi/shared-types.
export type {
  ResearchRunRecord,
  ResearchRunBundle,
  ResearchAgentOutputRecord,
  ResearchConsensusReportRecord,
  ResearchDisputeRecord,
  ResearchCitationRecord,
  ResearchRunStatus,
};

// DbResult mirrors the persistence layer contract exactly.
export type DbResultCode = 'AUTH_REQUIRED' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

// -----------------------------------------------------------------------------
// jsonb view-casts — narrow `unknown` jsonb to engine types in ONE place.
// -----------------------------------------------------------------------------

/** Cast a stored agent-output jsonb to the engine AgentOutput shape. */
export function asAgentOutput(output: Record<string, unknown>): AgentOutput {
  return output as unknown as AgentOutput;
}

/** Cast a stored consensus jsonb to the engine ConsensusReport shape. */
export function asConsensusReport(
  report: Record<string, unknown>,
): ConsensusReport {
  return report as unknown as ConsensusReport;
}

/** Cast a stored blueprint jsonb to the engine SimulationBlueprint shape. */
export function asBlueprint(
  blueprint: Record<string, unknown> | undefined,
): SimulationBlueprint | null {
  return blueprint ? (blueprint as unknown as SimulationBlueprint) : null;
}

// -----------------------------------------------------------------------------
// Domain presentation — icon, label, accent color per agent domain.
// -----------------------------------------------------------------------------

export interface DomainStyle {
  label: string;
  icon: LucideIcon;
  color: string;
}

export const DOMAIN_STYLES: Record<AgentDomain, DomainStyle> = {
  physics: { label: 'Physics', icon: Atom, color: '#3B82F6' },
  planetology: { label: 'Planetology', icon: Globe2, color: '#06B6D4' },
  chemistry: { label: 'Chemistry', icon: FlaskConical, color: '#10B981' },
  biology: { label: 'Biology', icon: Dna, color: '#22C55E' },
  evolution: { label: 'Evolution', icon: Sprout, color: '#84CC16' },
  intelligence: { label: 'Intelligence', icon: Brain, color: '#8B5CF6' },
  civilization: { label: 'Civilization', icon: Building2, color: '#06B6D4' },
  mathematics: { label: 'Mathematics', icon: Sigma, color: '#A855F7' },
  risk: { label: 'Risk', icon: ShieldAlert, color: '#EF4444' },
  skeptic: { label: 'Skeptic', icon: Search, color: '#F59E0B' },
  consensus: { label: 'Consensus', icon: ScalesIcon, color: '#3B82F6' },
};

export function domainStyle(domain: string): DomainStyle {
  return (
    DOMAIN_STYLES[domain as AgentDomain] ?? {
      label: domain,
      icon: Atom,
      color: '#94A3B8',
    }
  );
}

// -----------------------------------------------------------------------------
// ProvenanceSource presentation — the 6 traceability categories.
// -----------------------------------------------------------------------------

export interface ProvenanceSourceStyle {
  label: string;
  short: string;
  color: string;
  soft: string;
  border: string;
  /** One-line description of what the category means. */
  description: string;
}

export const PROVENANCE_SOURCE_STYLES: Record<
  ProvenanceSource,
  ProvenanceSourceStyle
> = {
  'user-input': {
    label: 'User Input',
    short: 'User',
    color: '#3B82F6',
    soft: 'rgba(59,130,246,0.14)',
    border: 'rgba(59,130,246,0.45)',
    description: 'Echoed straight from the concept the user wrote.',
  },
  'prior-agent': {
    label: 'Prior Agent',
    short: 'Agent',
    color: '#06B6D4',
    soft: 'rgba(6,182,212,0.14)',
    border: 'rgba(6,182,212,0.45)',
    description: "Derived from an earlier agent's output (a dependency).",
  },
  'known-science': {
    label: 'Known Science',
    short: 'Science',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
    description: 'Textbook or observed fact.',
  },
  'model-inference': {
    label: 'Model Inference',
    short: 'Inference',
    color: '#8B5CF6',
    soft: 'rgba(139,92,246,0.14)',
    border: 'rgba(139,92,246,0.45)',
    description: 'Computed here from signals and formulas.',
  },
  'speculative-assumption': {
    label: 'Speculative Assumption',
    short: 'Assumption',
    color: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.45)',
    description: 'An explicit, flagged assumption.',
  },
  'unsupported-generation': {
    label: 'Unsupported',
    short: 'Unsupported',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.5)',
    description: 'Generated with no grounding — weakest, falsifiable.',
  },
};

export function provenanceSourceStyle(
  source: string,
): ProvenanceSourceStyle {
  return (
    PROVENANCE_SOURCE_STYLES[source as ProvenanceSource] ??
    PROVENANCE_SOURCE_STYLES['model-inference']
  );
}

/** The 6 sources ordered most → least grounded (for legends / grouping). */
export const PROVENANCE_SOURCE_ORDER: ProvenanceSource[] = [
  'user-input',
  'known-science',
  'prior-agent',
  'model-inference',
  'speculative-assumption',
  'unsupported-generation',
];

// -----------------------------------------------------------------------------
// Dispute severity presentation.
// -----------------------------------------------------------------------------

export function severityColor(severity: string): string {
  switch (severity) {
    case 'high':
      return '#EF4444';
    case 'medium':
      return '#F59E0B';
    case 'low':
      return '#3B82F6';
    default:
      return '#94A3B8';
  }
}

export function disputeStatusColor(status: string): string {
  switch (status) {
    case 'open':
      return '#EF4444';
    case 'mitigated':
      return '#F59E0B';
    case 'accepted':
      return '#10B981';
    default:
      return '#94A3B8';
  }
}

// -----------------------------------------------------------------------------
// Misc formatting.
// -----------------------------------------------------------------------------

/** Format a 0..100 score; null → em-dash. */
export function fmtScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '—';
  return `${Math.round(value)}`;
}

/** Confidence ring/bar color from a 0..100 score. */
export function scoreColor(score: number): string {
  if (score >= 75) return '#10B981';
  if (score >= 50) return '#3B82F6';
  if (score >= 30) return '#F59E0B';
  return '#EF4444';
}

/** Trim a long concept to a card-friendly snippet. */
export function conceptSnippet(text: string, max = 160): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Human date for a created_at timestamp. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// -----------------------------------------------------------------------------
// Unified run view-model. Both a DB ResearchRunBundle and the in-memory demo
// ResearchRunResult are normalised to this single shape so every detail page
// renders from ONE path (no DB-vs-demo branching in the JSX).
// -----------------------------------------------------------------------------

export interface ResearchRunView {
  id: string;
  title: string;
  conceptText: string;
  status: ResearchRunStatus | string;
  overallConfidence: number;
  agreementScore: number;
  worldId: string | null;
  createdAt: string | null;
  /** Domain agents + skeptic (consensus lives in `consensus`). */
  agents: AgentOutput[];
  disputes: Dispute[];
  consensus: ConsensusReport | null;
  blueprint: SimulationBlueprint | null;
  /** True when this view is the labeled, read-only Chronid demo. */
  isDemo: boolean;
}

export const DEMO_RUN_ID = 'demo-chronid';

/** Build a view-model from the persisted bundle (jsonb narrowed in one place). */
export function bundleToView(bundle: ResearchRunBundle): ResearchRunView {
  const { run, outputs, consensus, disputes } = bundle;
  const consensusReport = consensus
    ? asConsensusReport(consensus.report)
    : null;
  // The synthesized blueprint is persisted on the run row.
  const blueprint = asBlueprint(run.blueprint);

  return {
    id: run.id,
    title: run.title?.trim() || 'Untitled research run',
    conceptText: run.concept_text,
    status: run.status,
    overallConfidence:
      run.overall_confidence ?? consensusReport?.overallConfidence ?? 0,
    agreementScore: run.agreement_score ?? consensusReport?.agreementScore ?? 0,
    worldId: run.world_id ?? null,
    createdAt: run.created_at,
    agents: outputs.map((o) => asAgentOutput(o.output)),
    disputes: disputes.map((d) => ({
      id: d.id,
      raisedBy: 'skeptic' as const,
      targetDomain: (d.target_domain ?? 'consensus') as AgentDomain,
      targetClaimId: d.target_claim_id ?? undefined,
      severity: (d.severity as Dispute['severity']) ?? 'medium',
      challenge: d.challenge,
      resolution: d.resolution ?? undefined,
      status: (d.status as Dispute['status']) ?? 'open',
    })),
    consensus: consensusReport,
    blueprint,
    isDemo: false,
  };
}

/** Build a view-model from the in-memory demo run result (labeled demo). */
export function demoToView(result: ResearchRunResult): ResearchRunView {
  return {
    id: DEMO_RUN_ID,
    title: result.concept.title?.trim() || 'Chronid Prime',
    conceptText: result.concept.text,
    status: 'complete',
    overallConfidence: result.consensus.overallConfidence,
    agreementScore: result.consensus.agreementScore,
    worldId: null,
    createdAt: null,
    agents: result.agentOutputs,
    disputes: result.disputes,
    consensus: result.consensus,
    blueprint: result.blueprint,
    isDemo: true,
  };
}

/** Count disputes per domain + track the highest severity (for agent cards). */
export interface DomainDisputeInfo {
  count: number;
  severity: 'low' | 'medium' | 'high';
}

const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3 };

export function disputesByDomain(
  disputes: Dispute[],
): Map<AgentDomain, DomainDisputeInfo> {
  const map = new Map<AgentDomain, DomainDisputeInfo>();
  for (const d of disputes) {
    const prev = map.get(d.targetDomain);
    const sev = (d.severity as 'low' | 'medium' | 'high') ?? 'medium';
    if (!prev) {
      map.set(d.targetDomain, { count: 1, severity: sev });
    } else {
      const higher =
        (SEVERITY_RANK[sev] ?? 0) > (SEVERITY_RANK[prev.severity] ?? 0)
          ? sev
          : prev.severity;
      map.set(d.targetDomain, { count: prev.count + 1, severity: higher });
    }
  }
  return map;
}

/** A claim flattened with its originating agent domain — for provenance views. */
export interface FlatClaim {
  domain: AgentDomain;
  domainLabel: string;
  claimId: string;
  text: string;
  source: ProvenanceSource;
  tier: ScientificConfidenceTier;
  confidence: number;
  dependsOn: string[];
}

/** Flatten every claim across all agents, tagged with its domain. */
export function flattenClaims(agents: AgentOutput[]): FlatClaim[] {
  const out: FlatClaim[] = [];
  for (const agent of agents) {
    const label = domainStyle(agent.domain).label;
    for (const c of agent.claims) {
      out.push({
        domain: agent.domain,
        domainLabel: label,
        claimId: c.id,
        text: c.text,
        source: c.source,
        tier: c.tier,
        confidence: c.confidence,
        dependsOn: c.dependsOn ?? [],
      });
    }
  }
  return out;
}

// Re-export the numeric formatter so client components can import it from this
// single client-safe module (confidence.ts is also client-safe, but keeping one
// import surface for research components avoids accidental cross-imports).
export { fmtNum } from './confidence';

export type { ScientificConfidenceTier };
