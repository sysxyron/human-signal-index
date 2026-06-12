// =============================================================================
// HSI Phase 21 — Forecast detail (/dashboard/forecasts/[id]). Server Component,
// force-dynamic. getForecastDetailAction(id) returns the forecast + its
// explanation (factors / assumptions / invalidation / limitations), its version
// timeline, observed outcomes, and any alerts. Answers "what evidence supports
// this prediction and what would invalidate it?". Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import type { ForecastDetailData } from '@hsi/shared-types';
import { getForecastDetailAction } from '@/lib/forecasting/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoForecastDetail, formatPct, formatDate } from '@/lib/forecasting/view';
import { ForecastingNav } from '@/components/forecasting/ForecastingNav';
import { ConfidenceBadge, ForecastStatusBadge } from '@/components/forecasting/badges';
import { ForecastExplanationPanel, ForecastTimeline } from '@/components/forecasting/panels';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ForecastDetailPage({ params }: { params: { id: string } }) {
  const [res, role, user] = await Promise.all([getForecastDetailAction(params.id), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ForecastDetailData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoForecastDetail(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const f = data?.forecast;

  return (
    <>
      <TopNav title="Forecast" subtitle="A hypothesis — its evidence, assumptions, and what would invalidate it" />
      <main className="space-y-6 p-5 lg:p-6">
        <ForecastingNav />
        <Link href={'/dashboard/forecasts' as never} className="inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to forecasts
        </Link>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing forecasts requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load the forecast" message={errored.message} code={errored.code} redirectedFrom={`/dashboard/forecasts/${params.id}`} />
        ) : !data || !f ? (
          <ErrorState title="Forecast not found" message="This forecast does not exist." />
        ) : (
          <div className="space-y-6">
            <Card className="space-y-2 border-border" padded>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-electric" />
                  <h2 className="text-h6 font-semibold text-text-primary">{f.prediction}</h2>
                  {isDemo ? <DemoBadge /> : null}
                </div>
                <div className="flex items-center gap-2">
                  <ConfidenceBadge confidence={f.confidence} />
                  <ForecastStatusBadge status={f.status} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-muted">
                <span>confidence <span className="font-semibold text-text-primary">{formatPct(f.confidence)}</span></span>
                <span>reliability <span className="font-semibold text-text-primary">{formatPct(f.reliability)}</span></span>
                {f.horizon ? <span>horizon {f.horizon}</span> : null}
                {f.expires_at ? <span>expires {formatDate(f.expires_at)}</span> : null}
                <span>v{f.version ?? 1}</span>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <ForecastExplanationPanel explanation={data.explanation} />
              <div className="space-y-6">
                <ForecastTimeline versions={data.versions} />
                {data.outcomes.length > 0 ? (
                  <Card className="space-y-2 border-border" padded>
                    <h3 className="text-h6 font-semibold text-text-primary">Observed outcomes</h3>
                    <table className="w-full text-caption">
                      <tbody>
                        {data.outcomes.map((o) => (
                          <tr key={o.id} className="border-b border-border/40 last:border-0">
                            <td className="py-1.5 text-text-secondary">{o.observation ?? '—'}</td>
                            <td className="py-1.5 text-right tabular-nums text-text-muted">predicted {formatPct(o.confidence)}</td>
                            <td className="py-1.5 pl-3 text-right tabular-nums text-text-secondary">observed {formatPct(o.success)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
