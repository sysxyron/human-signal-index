'use client';

// =============================================================================
// HSI Phase 8 — CreateScheduleForm. Curator+ creates a cron-style scheduler rule
// via createSchedulerRuleAction. Collapsible inline panel; auth/role-gated; full
// loading / error / success states. Demo data is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Input, Select } from '@hsi/ui';
import { Plus, X } from 'lucide-react';
import { createSchedulerRuleAction } from '@/lib/operations/actions';
import { describeCron } from '@/lib/operations/view';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';

const JOB_TYPES = ['capture', 'apply_triage', 'build_narrative_graph'];

export function CreateScheduleForm({
  canManage,
  demo = false,
}: {
  canManage: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [jobType, setJobType] = useState<string>('capture');
  const [cron, setCron] = useState('0 * * * *');
  const [sourceId, setSourceId] = useState('');
  const [enabled, setEnabled] = useState(true);

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New schedule
      </Button>
    );
  }

  const submit = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await createSchedulerRuleAction({
        jobType,
        cronExpression: cron.trim(),
        sourceId: sourceId.trim() || undefined,
        enabled,
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
        setTimeout(() => setOpen(false), 600);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Card className="w-full space-y-4" padded>
      <div className="flex items-center justify-between">
        <h3 className="text-h6 font-semibold text-text-primary">New scheduler rule</h3>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-text-muted hover:text-text-primary"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {demo ? (
        <p className="text-caption text-warning">
          Demo data is read-only — connect Supabase to create real schedules.
        </p>
      ) : !canManage ? (
        <SignInPrompt
          message="Sign in as a curator to create scheduler rules"
          redirectedFrom={pathname}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Job type"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
          >
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input
            label="Source ID (optional)"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="Leave blank for all sources"
          />
          <div className="sm:col-span-2">
            <Input
              label="Cron expression (5-field UTC)"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 * * * *"
            />
            <p className="mt-1 text-caption text-text-muted">
              {describeCron(cron)}
            </p>
          </div>
          <label className="flex items-center gap-2 text-caption text-text-secondary sm:col-span-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface-2"
            />
            Enable immediately
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={pending || !cron.trim()}
            >
              {pending ? 'Creating…' : 'Create schedule'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {done ? <SuccessNotice message="Scheduler rule created." /> : null}
          {error ? <ErrorState title="Could not create rule" message={error} /> : null}
        </div>
      )}
    </Card>
  );
}
