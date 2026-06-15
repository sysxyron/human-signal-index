// =============================================================================
// HSI Phase 27 — Contributor Authority (/dashboard/authority). Server Component,
// force-dynamic. Any signed-in user. Shows the user's QUALITY scores: trust,
// authority, reliability, accuracy, recognition level, and trust history. These
// are recognition only — they never change access or RBAC. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ShieldCheck, Gauge, Target, Award, History, Users } from 'lucide-react';
import Link from 'next/link';
import { getMyTrustAction, getTeamTrustAction } from '@/lib/contributor/trust';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function ScoreCard({ label, value, icon, accent }: { label: string; value: number; icon: ReactNode; accent: string }) {
  return (
    <Card className="space-y-1 border-border" padded>
      <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted">{icon} {label}</div>
      <div className="text-h4 font-bold" style={{ color: accent }}>{value}<span className="text-caption text-text-muted">/100</span></div>
    </Card>
  );
}

export default async function AuthorityPage() {
  const [trustRes, teamRes] = await Promise.all([getMyTrustAction(), getTeamTrustAction()]);
  if (!trustRes.ok) {
    return (
      <>
        <TopNav title="Authority" subtitle="Your contribution quality" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={trustRes.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load your authority" message="Your trust profile is unavailable right now." redirectedFrom="/dashboard/authority" />
        </main>
      </>
    );
  }
  const t = trustRes.data;
  const teams = teamRes.ok ? teamRes.data : [];

  return (
    <>
      <TopNav title="Authority" subtitle="Quality-based recognition — trust, accuracy, reliability" />
      <main className="space-y-6 p-5 lg:p-6">
        {trustRes.demo ? <OfflineDemoBanner /> : null}

        {/* Headline */}
        <Card className="flex flex-wrap items-center justify-between gap-4 border-electric/30 bg-electric/5" padded>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white"><ShieldCheck className="h-7 w-7" /></span>
            <div>
              <div className="text-label uppercase tracking-wide text-text-muted">Contributor level</div>
              <div className="text-h4 font-bold text-text-primary">{t.level}</div>
              {t.nextLevel ? <div className="text-caption text-text-secondary">{t.nextLevel.authorityToNext} authority to {t.nextLevel.name}</div> : <div className="text-caption text-success">Top level reached.</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-label uppercase tracking-wide text-text-muted">Authority</div>
            <div className="text-h2 font-bold text-electric">{t.scores.authority}</div>
          </div>
        </Card>
        <p className="text-label text-text-muted">Authority is based on contribution <strong className="text-text-primary">quality</strong> — not volume — and is recognition only. It never changes your role or access.</p>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ScoreCard label="Trust" value={t.scores.trust} icon={<ShieldCheck className="h-3.5 w-3.5 text-electric" />} accent="#38BDF8" />
          <ScoreCard label="Accuracy" value={t.scores.accuracy} icon={<Target className="h-3.5 w-3.5 text-success" />} accent="#10B981" />
          <ScoreCard label="Reliability" value={t.scores.reliability} icon={<Gauge className="h-3.5 w-3.5 text-warning" />} accent="#F59E0B" />
          <ScoreCard label="Signal accuracy" value={t.scores.signalAccuracy} icon={<Target className="h-3.5 w-3.5 text-electric" />} accent="#38BDF8" />
          <ScoreCard label="Publication" value={t.scores.publicationQuality} icon={<Award className="h-3.5 w-3.5 text-accent" />} accent="#A78BFA" />
        </div>

        {/* Contributor insights (Deliverable 13) */}
        <Card className="space-y-3 border-border" padded>
          <h3 className="text-h6 font-semibold text-text-primary">Strength analysis</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-label uppercase tracking-wide text-success">Strengths</div>
              {t.insights.strengths.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">{t.insights.strengths.map((s) => <span key={s} className="rounded-full bg-success/15 px-2.5 py-1 text-label font-medium text-success">{s}</span>)}</div>
              ) : <p className="mt-1 text-caption text-text-muted">Keep contributing to build strengths.</p>}
            </div>
            <div>
              <div className="text-label uppercase tracking-wide text-warning">Areas to improve</div>
              {t.insights.weaknesses.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">{t.insights.weaknesses.map((w) => <span key={w} className="rounded-full bg-warning/15 px-2.5 py-1 text-label font-medium text-warning">{w}</span>)}</div>
              ) : <p className="mt-1 text-caption text-text-muted">No weak areas flagged.</p>}
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Review breakdown */}
          <Card className="space-y-2 border-border" padded>
            <h3 className="text-h6 font-semibold text-text-primary">Review accuracy</h3>
            <div className="flex items-center justify-between text-caption"><span className="text-text-muted">Agreement with governance</span><span className="font-medium text-success">{t.agreementPct}%</span></div>
            <div className="flex items-center justify-between text-caption"><span className="text-text-muted">Disagreement</span><span className="font-medium text-text-secondary">{t.disagreementPct}%</span></div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-success" style={{ width: `${t.agreementPct}%` }} /></div>
          </Card>

          {/* History */}
          <Card className="space-y-2 border-border" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><History className="h-4 w-4 text-electric" /> Trust history</h3>
            {t.history.length === 0 ? <p className="text-caption text-text-muted">No changes recorded yet.</p> : (
              <ul className="space-y-1.5">
                {t.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between text-caption">
                    <span className="text-text-secondary">{h.reason}</span>
                    <span className="tabular-nums text-text-muted">{h.previousAuthority ?? '—'} → <span className="text-text-primary">{h.newAuthority}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Team trust (Deliverable 12) */}
        {teams.length > 0 ? (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Users className="h-4 w-4 text-electric" /> Team trust</h3>
            <Card className="overflow-x-auto border-border p-0" padded={false}>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2 text-left">Team</th><th className="px-4 py-2 text-right">Members</th><th className="px-4 py-2 text-right">Avg trust</th><th className="px-4 py-2 text-right">Avg reliability</th><th className="px-4 py-2 text-right">Avg authority</th></tr>
                </thead>
                <tbody>
                  {teams.map((tm) => (
                    <tr key={tm.team} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2 font-medium text-text-primary">{tm.team}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-muted">{tm.members}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{tm.avgTrust}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{tm.avgReliability}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-electric">{tm.avgAuthority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        ) : null}

        <Link href={"/dashboard/profile" as never} className="inline-block text-caption text-electric hover:underline">← Back to profile</Link>
      </main>
    </>
  );
}
