'use client';

// =============================================================================
// HSI Phase 32 — tester self-service console (client). Join a cohort, view the
// mission queue + progress, report issues, and give feedback — all WITHOUT admin
// intervention. Privileged role advancement links to the admin-approved
// application flow (no self-approval).
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button } from '@hsi/ui';
import { Loader2, Bug, MessageSquare, Trophy, ArrowRight } from 'lucide-react';
import { COHORTS, type IssueCategory, type IssueSeverity } from '@hsi/beta-engine';
import { joinCohortAction, reportIssueAction, submitFeedbackAction, claimCompletionAction, type TesterDashboard } from '@/lib/beta/tester';

const CATEGORIES: IssueCategory[] = ['ui', 'workflow', 'performance', 'permissions', 'data', 'security'];
const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];

export function TesterConsole({ dashboard }: { dashboard: TesterDashboard }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // issue form
  const [cat, setCat] = useState<IssueCategory>('ui');
  const [sev, setSev] = useState<IssueSeverity>('medium');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  // feedback form
  const [nps, setNps] = useState(8);
  const [fb, setFb] = useState('');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setMsg(null);
    startTransition(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Action failed.')); if (r.ok) router.refresh(); });
  }

  if (!dashboard.joined) {
    return (
      <Card className="space-y-3 border-electric/30 bg-electric/5" padded>
        <h3 className="text-h6 font-semibold text-text-primary">Join a beta cohort</h3>
        <p className="text-caption text-text-secondary">Pick the cohort that matches how you want to test. You join instantly — no approval needed. (Privileged roles are still earned via an application.)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COHORTS.map((c) => (
            <button key={c.key} type="button" disabled={pending} onClick={() => run(() => joinCohortAction(c.key), `Joined ${c.name}.`)} className="rounded-card border border-border bg-surface/50 p-3 text-left transition hover:border-electric/50 disabled:opacity-60">
              <div className="font-semibold text-text-primary">{c.name}</div>
              <div className="text-caption text-text-secondary">{c.description}</div>
            </button>
          ))}
        </div>
        {msg ? <p className="text-caption text-text-secondary">{msg}</p> : null}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress + missions */}
      <Card className="space-y-3 border-border" padded>
        <div className="flex items-center justify-between">
          <h3 className="text-h6 font-semibold text-text-primary">Your beta progress</h3>
          <span className="rounded-full bg-electric/15 px-2.5 py-0.5 text-label font-semibold capitalize text-electric">{dashboard.status} · {dashboard.cohort ?? 'no cohort'}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${dashboard.progress.completionPct}%` }} /></div>
        <div className="flex flex-wrap gap-4 text-caption text-text-secondary">
          <span>{dashboard.progress.completionPct}% complete</span>
          <span>{dashboard.progress.completedMissions}/{dashboard.progress.assignedMissions} missions</span>
          <span>{dashboard.progress.xp} XP</span>
          <span>{dashboard.badges.length} recognition badges</span>
        </div>
        {dashboard.progress.completionPct >= 100 && dashboard.status !== 'completed' ? (
          <Button onClick={() => run(() => claimCompletionAction(), 'Program completed — certificate awarded!')} disabled={pending}><Trophy className="h-4 w-4" /> Claim completion certificate</Button>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Mission queue */}
        <Card className="space-y-2 border-border" padded>
          <h3 className="text-h6 font-semibold text-text-primary">Mission queue</h3>
          {dashboard.missions.length === 0 ? <p className="text-caption text-text-muted">No missions assigned — great work!</p> : (
            <ul className="space-y-1.5">
              {dashboard.missions.map((m) => <li key={m.id} className="flex items-center justify-between text-caption text-text-secondary"><span>{m.title}</span><Link href={"/dashboard/missions" as never} className="text-electric hover:underline">Open</Link></li>)}
            </ul>
          )}
          <Link href={"/dashboard/onboarding/purpose" as never} className="inline-flex items-center gap-1.5 text-caption text-electric hover:underline">Apply for a contributor role <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Card>

        {/* Report issue */}
        <Card className="space-y-2 border-border" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Bug className="h-4 w-4 text-warning" /> Report an issue</h3>
          <div className="flex gap-2">
            <select value={cat} onChange={(e) => setCat(e.target.value as IssueCategory)} className="rounded-card border border-border bg-surface px-2 py-1.5 text-caption text-text-primary">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={sev} onChange={(e) => setSev(e.target.value as IssueSeverity)} className="rounded-card border border-border bg-surface px-2 py-1.5 text-caption text-text-primary">{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="What happened?" className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
          <Button onClick={() => run(() => reportIssueAction({ category: cat, severity: sev, title, description: desc }), 'Issue reported — thank you!')} disabled={pending || !title.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />} Report</Button>
        </Card>
      </div>

      {/* Feedback + NPS */}
      <Card className="space-y-2 border-border" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><MessageSquare className="h-4 w-4 text-electric" /> Feedback</h3>
        <label className="block text-caption text-text-secondary">How likely are you to recommend HSI? <span className="font-semibold text-text-primary">{nps}/10</span>
          <input type="range" min={0} max={10} value={nps} onChange={(e) => setNps(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <textarea value={fb} onChange={(e) => setFb(e.target.value)} rows={2} placeholder="Anything we should know?" className="w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
        <Button onClick={() => run(() => submitFeedbackAction({ message: fb, nps }), 'Thanks for the feedback!')} disabled={pending}>Submit feedback</Button>
      </Card>

      {msg ? <div className="rounded-card border border-border bg-surface/50 px-4 py-2.5 text-caption text-text-secondary">{msg}</div> : null}
    </div>
  );
}
