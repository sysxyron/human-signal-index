'use client';

// =============================================================================
// HSI Phase 15 — OutcomeFeedbackControl. Authenticated control to leave a 1..5
// rating + optional free-text feedback on a recorded outcome via
// addOutcomeFeedbackAction(outcomeId, rating, feedback?). useTransition; loading /
// error / auth states. Feedback feeds the human-in-the-loop signal — it is not an
// auto-action. Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Card, Button, Textarea } from '@hsi/ui';
import { MessageSquare, Star, Loader2, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';

type FeedbackResult =
  | { ok: true }
  | { ok: false; error: string; code?: DbErrorCode };

export function OutcomeFeedbackControl({
  outcomeId,
  action,
  canSubmit,
  demo = false,
}: {
  outcomeId: string;
  action: (outcomeId: string, rating: number, feedback?: string) => Promise<FeedbackResult>;
  canSubmit: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(null);
  const [done, setDone] = useState(false);

  const Title = (
    <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
      <MessageSquare className="h-4 w-4 text-electric" /> Reviewer feedback
    </h3>
  );

  if (demo) {
    return (
      <Card className="space-y-2" padded>
        {Title}
        <p className="flex items-center gap-1.5 text-caption text-warning">
          <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to
          leave feedback.
        </p>
      </Card>
    );
  }

  if (!canSubmit) {
    return (
      <Card className="space-y-2" padded>
        {Title}
        <SignInPrompt message="Sign in to leave feedback" redirectedFrom={pathname} />
      </Card>
    );
  }

  const onSubmit = () => {
    if (rating < 1) {
      setError({ message: 'Pick a 1–5 rating before submitting.' });
      return;
    }
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await action(outcomeId, rating, text.trim() || undefined);
      if (res.ok) {
        setDone(true);
        setText('');
        router.refresh();
      } else {
        setError({ message: formatErrorMessage(res.error), code: res.code });
      }
    });
  };

  const active = hover || rating;

  return (
    <Card className="space-y-3" padded>
      {Title}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            disabled={pending}
            aria-label={`Rate ${n} of 5`}
            className="rounded p-0.5 transition disabled:opacity-50"
          >
            <Star
              className="h-6 w-6"
              style={{
                color: n <= active ? '#F59E0B' : '#334155',
                fill: n <= active ? '#F59E0B' : 'none',
              }}
            />
          </button>
        ))}
        <span className="ml-2 text-caption text-text-muted">
          {rating > 0 ? `${rating}/5` : 'Rate this outcome'}
        </span>
      </div>
      <Textarea
        label="Feedback (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Was the outcome verdict fair? Anything the reviewer should know?"
        rows={3}
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
          {pending ? 'Submitting…' : 'Submit feedback'}
        </Button>
        {done ? <SuccessNotice message="Feedback recorded — thank you." /> : null}
      </div>
      {error ? (
        <ErrorState
          title="Could not submit feedback"
          message={error.message}
          code={error.code}
          redirectedFrom={pathname}
        />
      ) : null}
    </Card>
  );
}
