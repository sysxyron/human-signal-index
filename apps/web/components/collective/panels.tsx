// =============================================================================
// HSI Phase 20 — FindingTimeline · ChallengePanel · EvidenceDebatePanel ·
// AlternativeNarrativesPanel. The collaboration surface of an investigation.
// Pure presentational, server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { FileText, Swords, BookOpen, GitFork } from 'lucide-react';
import type {
  HsinAlternativeNarrativeRecord,
  HsinChallengeRecord,
  HsinEvidenceClaimRecord,
  HsinFindingRecord,
} from '@hsi/shared-types';
import { ChallengeStatusBadge } from './badges';
import { formatPct, formatDateTime } from '@/lib/collective/view';

export function FindingTimeline({ findings }: { findings: HsinFindingRecord[] }) {
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <FileText className="h-4 w-4 text-electric" /> Findings
      </h3>
      {findings.length === 0 ? (
        <p className="text-caption text-text-muted">No findings submitted yet.</p>
      ) : (
        <ol className="relative ml-3 space-y-4 border-l border-border pl-5">
          {findings.map((f) => (
            <li key={f.id} className="relative">
              <span className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-electric" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-electric/10 px-2 py-0.5 text-[11px] font-semibold text-electric">{f.position}</span>
                <span className="text-[11px] text-text-muted">conf {formatPct(f.confidence)} · {f.endorsements ?? 0} endorsement(s)</span>
              </div>
              <p className="mt-1 text-caption leading-relaxed text-text-secondary">{f.summary}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">by {f.contributor_id ?? 'contributor'} · {formatDateTime(f.created_at)}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function ChallengePanel({ challenges }: { challenges: HsinChallengeRecord[] }) {
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Swords className="h-4 w-4 text-electric" /> Challenges
      </h3>
      {challenges.length === 0 ? (
        <p className="text-caption text-text-muted">No challenges raised.</p>
      ) : (
        <ul className="space-y-2">
          {challenges.map((c) => (
            <li key={c.id} className="rounded-card border border-border bg-surface/50 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-text-muted">vs finding {c.target_finding_id?.slice(0, 8)}</span>
                <ChallengeStatusBadge status={c.status} />
              </div>
              <p className="mt-1 text-caption text-text-secondary">{c.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function EvidenceDebatePanel({ claims }: { claims: HsinEvidenceClaimRecord[] }) {
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <BookOpen className="h-4 w-4 text-electric" /> Evidence debate
      </h3>
      {claims.length === 0 ? (
        <p className="text-caption text-text-muted">No evidence claims under debate.</p>
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => (
            <li key={c.id} className="space-y-1 rounded-card border border-border bg-surface/50 p-2">
              <p className="text-caption text-text-primary">{c.claim}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                <span>source {formatPct(c.source_quality)}</span>
                <span className="text-verified">▲ {c.support_count ?? 0}</span>
                <span className="text-risk">▼ {c.challenge_count ?? 0}</span>
                <span>reviews {c.reviews_approved ?? 0}✓/{c.reviews_rejected ?? 0}✗</span>
                <span className="font-semibold text-text-secondary">strength {formatPct(c.strength)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AlternativeNarrativesPanel({ alternatives }: { alternatives: HsinAlternativeNarrativeRecord[] }) {
  if (alternatives.length === 0) return null;
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <GitFork className="h-4 w-4 text-electric" /> Alternative narratives
      </h3>
      <ul className="space-y-2">
        {alternatives.map((a) => (
          <li key={a.id} className="rounded-card border border-border bg-surface/50 p-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">{a.title}</span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent">{a.position}</span>
            </div>
            <p className="mt-1 text-caption text-text-secondary">{a.summary}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
