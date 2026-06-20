// =============================================================================
// HSI Phase 71 — Map readiness aggregation (PURE). Real counts only — every
// number is a tally of input records. No estimates, no fabrication. No I/O.
// =============================================================================

import type { GeoStatus } from './geo-model';

export interface ReadinessSource {
  geoStatus: GeoStatus;
  sourceType: string | null;
  category: string | null;
  familyKey: string;
  country: string | null;
}

export interface BreakdownRow { key: string; total: number; ready: number; partial: number; missing: number }

export interface MapReadiness {
  totalSources: number; geoReady: number; partialGeo: number; missingGeo: number; notApplicable: number;
  byType: BreakdownRow[]; byCategory: BreakdownRow[]; byFamily: BreakdownRow[]; byCountry: BreakdownRow[];
}

function tally(rows: ReadinessSource[], keyOf: (r: ReadinessSource) => string): BreakdownRow[] {
  const m = new Map<string, BreakdownRow>();
  for (const r of rows) {
    const key = keyOf(r) || '—';
    const row = m.get(key) ?? { key, total: 0, ready: 0, partial: 0, missing: 0 };
    row.total++;
    if (r.geoStatus === 'GEO_READY') row.ready++;
    else if (r.geoStatus === 'PARTIAL_GEO') row.partial++;
    else if (r.geoStatus === 'MISSING_GEO') row.missing++;
    m.set(key, row);
  }
  return Array.from(m.values()).sort((a, b) => b.ready - a.ready || b.total - a.total);
}

export function computeMapReadiness(rows: ReadinessSource[]): MapReadiness {
  return {
    totalSources: rows.length,
    geoReady: rows.filter((r) => r.geoStatus === 'GEO_READY').length,
    partialGeo: rows.filter((r) => r.geoStatus === 'PARTIAL_GEO').length,
    missingGeo: rows.filter((r) => r.geoStatus === 'MISSING_GEO').length,
    notApplicable: rows.filter((r) => r.geoStatus === 'NOT_APPLICABLE').length,
    byType: tally(rows, (r) => r.sourceType ?? 'unknown'),
    byCategory: tally(rows, (r) => r.category ?? 'unclassified'),
    byFamily: tally(rows, (r) => r.familyKey).filter((b) => b.total > 1).slice(0, 25),
    byCountry: tally(rows, (r) => r.country ?? 'unknown'),
  };
}
