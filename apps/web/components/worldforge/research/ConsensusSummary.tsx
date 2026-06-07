'use client';

import { Card } from '@hsi/ui';
import { ScalesIcon } from '@/lib/worldforge/research-icons';
import { CheckCircle2 } from 'lucide-react';
import type { ConsensusReport } from '@hsi/research-agents';
import { ConfidenceScore } from './ConfidenceScore';
import { ClassificationBar } from './ClassificationBar';

export interface ConsensusSummaryProps {
  consensus: ConsensusReport;
  /** Hide the key-findings list (used in tight overview contexts). */
  compactFindings?: boolean;
  className?: string;
}

/** The consensus synthesis panel: summary, scores, tier breakdown, findings. */
export function ConsensusSummary({
  consensus,
  compactFindings = false,
  className = '',
}: ConsensusSummaryProps) {
  const findings = compactFindings
    ? consensus.keyFindings.slice(0, 4)
    : consensus.keyFindings;

  return (
    <Card className={`space-y-5 ${className}`} padded>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <ScalesIcon className="h-5 w-5 text-electric" />
            Consensus synthesis
          </h3>
          <p className="max-w-2xl text-body-sm leading-relaxed text-text-secondary">
            {consensus.summary}
          </p>
        </div>
        <div className="flex shrink-0 gap-4">
          <ConfidenceScore
            score={consensus.overallConfidence}
            label="Confidence"
            size={62}
          />
          <ConfidenceScore
            score={consensus.agreementScore}
            label="Agreement"
            size={62}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-label text-text-muted">
          Claim classification across all agents
        </p>
        <ClassificationBar breakdown={consensus.classificationBreakdown} />
      </div>

      {findings.length ? (
        <div className="space-y-2">
          <p className="text-label text-text-muted">Key findings</p>
          <ul className="space-y-1.5">
            {findings.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-body-sm text-text-secondary"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
