'use server';
// =============================================================================
// HSI Phase 73.3 — Geo backfill action (admin). Deterministically enriches geo
// on source candidates that lack coordinates, using the exact location registry
// first, then the built-in gazetteer when place text exists. Unprovable sources
// keep GEO_UNKNOWN. Admin-gated + audited. No AI, no invented coordinates.
// No ingestion/publishing/review change.
// =============================================================================

import { revalidateTag } from 'next/cache';
import { requireAdmin, getServiceClient, recordSecurityAudit, type DbResult } from '@/lib/admin/guard';
import { resolveGeo } from './resolve';

export interface BackfillResult { scanned: number; resolved: number; viaRegistry: number; viaGazetteer: number; unresolved: number }

interface CandRow { id: string; source_name: string | null; primary_url: string | null; feed_or_api_url: string | null; country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null }

export async function backfillGeoAction(): Promise<DbResult<BackfillResult>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const writer = (await getServiceClient()) ?? gate.ctx.db;

  try {
    const { data } = await writer
      .from('source_candidates')
      .select('id, source_name, primary_url, feed_or_api_url, country, region, city, latitude, longitude')
      .or('latitude.is.null,longitude.is.null')
      .limit(10000);
    const rows = (data ?? []) as CandRow[];

    let viaRegistry = 0; let viaGazetteer = 0; let unresolved = 0;
    for (const r of rows) {
      if (r.latitude != null && r.longitude != null) continue;
      const g = resolveGeo({ sourceName: r.source_name, primaryUrl: r.primary_url, feedUrl: r.feed_or_api_url, country: r.country, region: r.region, city: r.city, latitude: r.latitude, longitude: r.longitude });
      if (!g) { unresolved++; continue; } // GEO_UNKNOWN preserved — never fabricated
      await writer.from('source_candidates').update({
        country: g.country, region: g.region, city: g.city,
        latitude: g.latitude, longitude: g.longitude, geo_confidence: g.geoConfidence, geo_source: g.geoSource,
      }).eq('id', r.id);
      if (g.method === 'location_registry') viaRegistry++; else viaGazetteer++;
    }

    const resolved = viaRegistry + viaGazetteer;
    await recordSecurityAudit(gate.ctx.db, {
      actorId: gate.ctx.user.id, eventType: 'global_map.geo_backfill',
      message: `Backfilled geo for ${resolved} source candidate(s) (${viaRegistry} registry, ${viaGazetteer} gazetteer, ${unresolved} unresolved/GEO_UNKNOWN).`,
      metadata: { scanned: rows.length, resolved, viaRegistry, viaGazetteer, unresolved },
    });
    revalidateTag('global-map'); revalidateTag('narrative-map');
    return { ok: true, data: { scanned: rows.length, resolved, viaRegistry, viaGazetteer, unresolved } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Backfill failed.', code: 'DB_ERROR' };
  }
}
