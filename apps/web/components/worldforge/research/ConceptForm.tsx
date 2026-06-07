'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Card, Button, Input, Textarea } from '@hsi/ui';
import { FlaskConical, Sparkles, ArrowRight } from 'lucide-react';
import { CHRONID_RESEARCH_CONCEPT } from '@hsi/research-agents';
import { createResearchRunAction } from '@/app/dashboard/worldforge/research/actions';
import { ErrorCard, SignInPrompt } from '@/components/worldforge/PersistenceUI';

export interface ConceptFormProps {
  isAuthenticated: boolean;
}

const PIPELINE = [
  'Concept',
  '9 domain agents',
  'Skeptic',
  'Consensus',
  'Blueprint',
  'Generate world',
];

/** New-research entry form: concept + optional title → createResearchRunAction. */
export function ConceptForm({ isAuthenticated }: ConceptFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [concept, setConcept] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [pending, startTransition] = useTransition();

  const canSubmit = isAuthenticated && !authExpired;
  const trimmed = concept.trim();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || !canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await createResearchRunAction(
        trimmed,
        title.trim() || undefined,
      );
      if (res.ok) {
        router.push(
          `/dashboard/worldforge/research/${res.data.runId}` as never,
        );
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Card className="space-y-3" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <FlaskConical className="h-4 w-4 text-electric" />
          How a research run works
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {PIPELINE.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <span className="rounded-full border border-border bg-surface-2/70 px-3 py-1.5 text-caption font-semibold text-text-primary">
                {step}
              </span>
              {i < PIPELINE.length - 1 ? (
                <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
              ) : null}
            </span>
          ))}
        </div>
        <p className="text-caption leading-relaxed text-text-muted">
          Describe a world or being in plain language. Nine domain agents reason
          in dependency order, a skeptic falsifies the weakest claims, and a
          consensus agent synthesizes a buildable, fully-traceable blueprint —
          which you can then turn into a real simulatable world.
        </p>
      </Card>

      <Card className="space-y-4" padded>
        <Input
          id="research-title"
          label="Title (optional)"
          placeholder="e.g. Chronid Prime"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={pending}
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="research-concept"
              className="block text-label text-text-secondary"
            >
              World concept
            </label>
            <button
              type="button"
              onClick={() => setConcept(CHRONID_RESEARCH_CONCEPT)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric transition hover:text-white disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Try the Chronid example
            </button>
          </div>
          <Textarea
            id="research-concept"
            rows={6}
            placeholder="A being whose subjective day equals 1,000 Earth years…"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            disabled={pending}
          />
          <p className="text-caption text-text-muted">
            {trimmed.length} characters
          </p>
        </div>

        {error ? <ErrorCard message={error} title="Could not start run" /> : null}

        {canSubmit ? (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !trimmed}
            >
              <FlaskConical className="h-4 w-4" />
              {pending ? 'Starting research…' : 'Run research'}
            </Button>
            {pending ? (
              <span className="text-caption text-text-muted">
                Running 9 agents, skeptic, and consensus…
              </span>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-caption text-text-secondary">
              {authExpired
                ? 'Your session expired. Sign in again to run research.'
                : 'Running research saves a run to your account.'}
            </p>
            <SignInPrompt
              message="Sign in to run research"
              redirectedFrom={pathname}
            />
          </div>
        )}
      </Card>
    </form>
  );
}
