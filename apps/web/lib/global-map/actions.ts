'use server';
// =============================================================================
// HSI Phase 71 — Geocoding pipeline (admin action). Backfills coordinates for
// approved source candidates that carry place text (country/region/city) but no
// coordinates, using the DETERMINISTIC built-in gazetteer. Stores geo_source +
// geo_confidence with every coordinate. Admin-gated + audited. Never fabricates
// precision (granularity-based confidence) and never invents a coordinate
// (unresolved places are left untouched). No ingestion/publishing change.
// =============================================================================

import { revalidateTag } from 'next/cache';
import { requireAdmin, getServiceClient, recordSecurityAudit, type DbResult } from '@/lib/admin/guard';
import { geocode } from './geocoder';

export interface GeocodeRunResult { scanned: number; geocoded: number; unresolved: number }

/** Geocode candidates with place text but no coordinates. Admin only. */
export async function geocodeCandidatesAction(): Promise<DbResult<GeocodeRunResult>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const writer = (await getServiceClient()) ?? gate.ctx.db;

  try {
    const { data } = await writer
      .from('source_candidates')
      .select('id, country, region, city, latitude, longitude')
      .or('latitude.is.null,longitude.is.null')
      .limit(5000);
    const rows = (data ?? []) as Array<{ id: string; country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null }>;

    let geocoded = 0; let unresolved = 0;
    for (const r of rows) {
      if (r.latitude != null && r.longitude != null) continue;
      if (!r.country && !r.region && !r.city) continue; // nothing to geocode (stays MISSING_GEO)
      const g = geocode({ country: r.country, region: r.region, state: null, city: r.city });
      if (!g) { unresolved++; continue; } // unresolved — NEVER fabricate a coordinate
      await writer.from('source_candidates').update({ latitude: g.lat, longitude: g.lng, geo_confidence: g.confidence, geo_source: g.source }).eq('id', r.id);
      geocoded++;
    }

    await recordSecurityAudit(gate.ctx.db, {
      actorId: gate.ctx.user.id, eventType: 'global_map.geocode',
      message: `Geocoded ${geocoded} source candidate(s) via builtin gazetteer (${unresolved} unresolved).`,
      metadata: { scanned: rows.length, geocoded, unresolved },
    });
    revalidateTag('global-map');
    return { ok: true, data: { scanned: rows.length, geocoded, unresolved } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Geocoding failed.', code: 'DB_ERROR' };
  }
}
