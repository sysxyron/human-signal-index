'use client';

// =============================================================================
// HSI Phase 25 — investigation workflow actions (client). Role- and status-aware
// buttons that drive governed transitions. Every action requires a reason/comment
// and re-checks RBAC server-side. Reviewer decisions require a comment; governance
// decisions require a rationale (no silent state changes).
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@hsi/ui';
import { Loader2 } from 'lucide-react';
import {
  claimInvestigationAction, releaseInvestigationAction, submitForReviewAction,
  escalateInvestigationAction, reviewInvestigationAction, governanceDecisionAction,
} from '@/lib/contributor/investigations';

type Status = string;
function rank(role: string | null): number {
  return { viewer: 1, researcher: 2, reviewer: 3, curator: 4, admin: 5 }[role ?? 'viewer'] ?? 1;
}

export function WorkflowActions({ id, status, role }: { id: string; status: Status; role: string | null }) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const r = rank(role);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, needComment: boolean) {
    if (needComment && comment.trim().length === 0) { setMsg('Please add a comment / reason first.'); return; }
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { setComment(''); router.refresh(); }
      else setMsg(res.error ?? 'Action failed.');
    });
  }

  const isResearcher = r >= 2;
  const isReviewer = r >= 3;

  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="text-h6 font-semibold text-text-primary">Workflow actions</h3>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Reason / comment (required for review & escalation)" className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary outline-none focus:border-electric" />
      <div className="flex flex-wrap gap-2">
        {isResearcher && status === 'intake' ? <Button onClick={() => run(() => claimInvestigationAction(id), false)} disabled={pending}>Claim</Button> : null}
        {isResearcher && status === 'research' ? <Button onClick={() => run(() => releaseInvestigationAction(id), false)} disabled={pending}>Release</Button> : null}
        {isResearcher && status === 'evidence_collection' ? <Button onClick={() => run(() => submitForReviewAction(id), false)} disabled={pending}>Submit for review</Button> : null}
        {isReviewer && status === 'review' ? (
          <>
            <Button onClick={() => run(() => reviewInvestigationAction({ id, decision: 'approve', comment }), true)} disabled={pending}>Approve</Button>
            <Button onClick={() => run(() => reviewInvestigationAction({ id, decision: 'return_for_research', comment }), true)} disabled={pending}>Return for research</Button>
            <Button onClick={() => run(() => reviewInvestigationAction({ id, decision: 'request_more_evidence', comment }), true)} disabled={pending}>Request more evidence</Button>
          </>
        ) : null}
        {isReviewer && ['research', 'evidence_collection', 'review'].includes(status) ? <Button onClick={() => run(() => escalateInvestigationAction(id, comment), true)} disabled={pending}>Escalate</Button> : null}
        {isReviewer && ['escalated', 'governance'].includes(status) ? (
          <>
            <Button onClick={() => run(() => governanceDecisionAction({ id, decision: 'cleared', rationale: comment }), true)} disabled={pending}>Governance: clear</Button>
            <Button onClick={() => run(() => governanceDecisionAction({ id, decision: 'hold', rationale: comment }), true)} disabled={pending}>Governance: hold</Button>
            <Button onClick={() => run(() => governanceDecisionAction({ id, decision: 'block', rationale: comment }), true)} disabled={pending}>Governance: block</Button>
          </>
        ) : null}
        {pending ? <Loader2 className="h-4 w-4 animate-spin self-center text-text-muted" /> : null}
      </div>
      {msg ? <p className="text-caption text-error">{msg}</p> : null}
      <p className="text-label text-text-muted">Actions are role-gated server-side and recorded on the timeline. Publishing remains governed by the existing publication workflows.</p>
    </Card>
  );
}
