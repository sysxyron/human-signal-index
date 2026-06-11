// =============================================================================
// HSI Phase 16 — Trust Dashboard (/dashboard/trust). Server Component,
// force-dynamic. getTrustDashboardAction() returns trust rows across sources,
// narratives, forecasts, and decisions. Each section ranks its entities by trust
// score (ring + 0..100 + band badge + confidence + evidence count + calibration
// score + last-updated + an overridden flag). Filterable by band and entity type
// via the querystring (?band=&type=).
//
// When ?entityType=&entityId= is present, the TrustDetailPanel "drawer" is shown
// via getTrustAction(entityType, entityId): explanation factors + limitations +
// the TrustHistoryChart + the TrustDistributionChart (this entity highlighted) +
// the override state. Curator/admin may OVERRIDE a score (required reason, always
// logged) via overrideTrustAction, and recompute all trust via
// recomputeTrustAction. Researcher+ view; mutations re-checked server-side.
//
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/calibration-engine
// fixtures. Trust is advisory — observed signals, never a certainty.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ShieldCheck, Info, Filter } from 'lucide-react';
import type { TrustDashboardData, TrustEntityType, TrustView } from '@hsi/shared-types';
import {
  getTrustDashboardAction,
  getTrustAction,
  overrideTrustAction,
  recomputeTrustAction,
} from '@/lib/calibration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  bandDecor,
  canCurate,
  canResearch,
  demoTrustDashboard,
  demoTrustView,
  entityTypeDecor,
  filterRowsByBand,
  trustHistogram,
  trustRowsForSection,
  TRUST_ENTITY_SECTIONS,
} from '@/lib/calibration/view';
import { CalibrationNav } from '@/components/calibration/CalibrationNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { TrustRankingTable } from '@/components/calibration/TrustRankingTable';
import { TrustDetailPanel } from '@/components/calibration/TrustDetailPanel';
import { RecomputeTrustButton } from '@/components/calibration/RecomputeButtons';
import type { TrustBand } from '@hsi/shared-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BANDS: { value: string; label: string }[] = [
  { value: 'all', label: 'All bands' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function isEntityType(v: string | undefined): v is TrustEntityType {
  return (
    v === 'source' ||
    v === 'narrative' ||
    v === 'forecast' ||
    v === 'decision' ||
    v === 'intervention' ||
    v === 'recommendation'
  );
}

/** Build a querystring preserving the current filters + overriding a key. */
function withParam(
  search: Record<string, string | undefined>,
  key: string,
  value?: string,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v && k !== key) params.set(k, v);
  }
  if (value && value !== 'all') params.set(key, value);
  const qs = params.toString();
  return `/dashboard/trust${qs ? `?${qs}` : ''}`;
}

export default async function TrustPage({
  searchParams,
}: {
  searchParams: { band?: string; type?: string; entityType?: string; entityId?: string };
}) {
  const band = searchParams.band ?? 'all';
  const typeFilter = isEntityType(searchParams.type) ? searchParams.type : undefined;
  const detailType = isEntityType(searchParams.entityType) ? searchParams.entityType : undefined;
  const detailId = searchParams.entityId?.trim() || undefined;

  const [res, role, user] = await Promise.all([
    getTrustDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);
  const mayOverride = canCurate(role) && Boolean(user);

  let data: TrustDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    data = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    data = demoTrustDashboard();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const forbidden = !isDemo && res.ok && !mayView;

  // Build the ranked rows per section, then apply band + type filters.
  const sections = data
    ? TRUST_ENTITY_SECTIONS.filter((t) => !typeFilter || t === typeFilter).map((type) => ({
        type,
        rows: filterRowsByBand(trustRowsForSection(data!, type), band),
      }))
    : [];

  const allRows = data
    ? TRUST_ENTITY_SECTIONS.flatMap((t) => trustRowsForSection(data!, t))
    : [];
  const histogram = trustHistogram(allRows);

  const hasData = allRows.length > 0;

  // Optional detail drawer (best-effort; failure hides the drawer, not the page).
  const searchForLinks: Record<string, string | undefined> = {
    band: band !== 'all' ? band : undefined,
    type: typeFilter,
  };

  let detailView: TrustView | null = null;
  let detailDemo = false;
  if (detailType && detailId) {
    if (isDemo) {
      detailView = demoTrustView(detailType, detailId);
      detailDemo = true;
    } else {
      try {
        const dRes = await getTrustAction(detailType, detailId);
        if (dRes.ok) {
          detailView = dRes.data;
        } else if (dRes.code === 'NOT_CONFIGURED') {
          detailView = demoTrustView(detailType, detailId);
          detailDemo = true;
        }
      } catch {
        detailView = null;
      }
    }
  }

  return (
    <>
      <TopNav
        title="Trust"
        subtitle="How trustworthy is this? — advisory scores grounded in observed signals"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <CalibrationNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <ShieldCheck className="h-5 w-5 text-electric" /> Trust scores
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RecomputeTrustButton
            action={recomputeTrustAction}
            canRecompute={mayOverride}
            demo={isDemo}
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            A trust score (0–100) blends historical accuracy, calibration, evidence
            quality, and human/governance review — discounted toward neutral when
            evidence is thin. Every score{' '}
            <span className="font-semibold text-text-primary">
              enumerates its contributing factors and explicit limitations
            </span>
            . Curators may override a score, but only with a required reason that is
            logged and shown. Trust is advisory, never a guarantee.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState
            title="Insufficient permissions"
            message="Viewing trust requires the researcher role or above."
            code="FORBIDDEN"
          />
        ) : errored ? (
          <ErrorState
            title="Could not load trust scores"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/trust"
          />
        ) : !data ? null : !hasData ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No trust scores yet"
            message="Recompute trust (curator+) once entities have accumulated accuracy, calibration, evidence, and review history. Rankings will populate here."
          />
        ) : (
          <div className="space-y-6">
            {/* Detail drawer (when an entity is selected). */}
            {detailView ? (
              <TrustDetailPanel
                view={detailView}
                histogram={histogram}
                overrideAction={overrideTrustAction}
                canOverride={mayOverride}
                demo={detailDemo}
                closeHref={withParam(searchForLinks, 'entityId', undefined)}
              />
            ) : null}

            {/* Filters */}
            <Card className="flex flex-wrap items-center gap-x-6 gap-y-3" padded>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-electric" />
                <span className="text-caption font-semibold text-text-secondary">Filters</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label text-text-muted">Band:</span>
                {BANDS.map((b) => {
                  const active = band === b.value;
                  const color = b.value === 'all' ? '#94A3B8' : bandDecor(b.value as TrustBand).color;
                  return (
                    <Link
                      key={b.value}
                      href={withParam(searchForLinks, 'band', b.value) as never}
                      className="rounded-full px-2.5 py-1 text-caption font-semibold transition"
                      style={
                        active
                          ? { backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }
                          : { color: '#94A3B8', border: '1px solid #2A3A5C' }
                      }
                    >
                      {b.label}
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label text-text-muted">Type:</span>
                <Link
                  href={withParam({ ...searchForLinks, type: undefined }, 'type', undefined) as never}
                  className="rounded-full px-2.5 py-1 text-caption font-semibold transition"
                  style={
                    !typeFilter
                      ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' }
                      : { color: '#94A3B8', border: '1px solid #2A3A5C' }
                  }
                >
                  All
                </Link>
                {TRUST_ENTITY_SECTIONS.map((t) => {
                  const active = typeFilter === t;
                  const decor = entityTypeDecor(t);
                  return (
                    <Link
                      key={t}
                      href={withParam(searchForLinks, 'type', t) as never}
                      className="rounded-full px-2.5 py-1 text-caption font-semibold transition"
                      style={
                        active
                          ? { backgroundColor: `${decor.color}1f`, color: decor.color, border: `1px solid ${decor.color}55` }
                          : { color: '#94A3B8', border: '1px solid #2A3A5C' }
                      }
                    >
                      {decor.label}
                    </Link>
                  );
                })}
              </div>
            </Card>

            {/* Ranked sections */}
            <div className="grid gap-6 lg:grid-cols-2">
              {sections.map(({ type, rows }) => (
                <TrustRankingTable
                  key={type}
                  type={type}
                  rows={rows}
                  search={searchForLinks}
                  selectedEntityId={detailType === type ? detailId : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
