// =============================================================================
// HSI Phase 75 — Narrative geographic footprint (PURE, deterministic, no I/O).
//
// A narrative's geography is INHERITED from its member SOURCES (the only
// geo-bearing entity in the model: X → Signal → Source → real coordinates). This
// module rolls a narrative's member-source coordinates up into an observable
// footprint: which countries/regions it spans, how many members are plottable,
// and how many are ungeolocated. It NEVER geocodes, infers, or fabricates a
// coordinate. The "centroid" is explicitly the arithmetic MEAN of member-source
// coordinates (a representation of where plotted members sit), NOT a claim that
// the narrative "is" at one place. Empty / coordinate-less input yields a zeroed,
// NOT-OBSERVED footprint. PURE: no @/ value imports, fully unit-testable.
// =============================================================================

/** One member source of a narrative, with whatever geography it carries. A
 *  null lat/lng means the source has no real coordinates (NOT plottable). */
export interface NarrativeGeoSource {
  sourceId: string;
  name: string;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

/** A plotted member source (real, finite, in-range coordinates only). */
export interface NarrativeGeoPoint {
  sourceId: string;
  name: string;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number;
  lng: number;
}

export interface CountryTally { country: string; sourceCount: number }
export interface RegionTally { key: string; country: string; region: string; sourceCount: number }

export interface NarrativeGeography {
  totalSources: number;        // member sources considered
  geoReadySources: number;     // sources with real, plottable coordinates
  ungeolocatedSources: number; // member sources with no usable coordinates
  coverageRatio: number;       // geoReady / total (0 when no sources)
  countries: CountryTally[];   // distinct countries among plotted members, desc
  regions: RegionTally[];      // distinct country·region among plotted members, desc
  points: NarrativeGeoPoint[]; // plottable member sources (real coords only)
  dominantCountry: string | null; // most-represented country, or null (NOT OBSERVED)
  centroid: { lat: number; lng: number } | null; // MEAN of plotted coords, or null
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  reason: string;              // human-readable observed-vs-NOT-OBSERVED summary
}

/** Real, finite, in-range geographic coordinate (never fabricated). */
function isPlottable(lat: number | null, lng: number | null): lat is number {
  return (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

const round = (n: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Roll a narrative's member sources up into an observable geographic footprint.
 * Only sources with real, plottable coordinates contribute to the map/centroid;
 * everything else is counted as ungeolocated. Deterministic: ties broken by name.
 */
export function rollupNarrativeGeography(sources: NarrativeGeoSource[]): NarrativeGeography {
  const total = sources.length;
  const points: NarrativeGeoPoint[] = [];
  for (const s of sources) {
    if (!isPlottable(s.lat, s.lng)) continue;
    points.push({
      sourceId: s.sourceId, name: s.name,
      country: s.country, region: s.region, city: s.city,
      lat: s.lat, lng: s.lng as number,
    });
  }

  const geoReady = points.length;
  const ungeolocated = total - geoReady;
  const coverageRatio = total === 0 ? 0 : round(geoReady / total, 2);

  // distinct countries among plotted members
  const countryAcc = new Map<string, number>();
  const regionAcc = new Map<string, { country: string; region: string; count: number }>();
  for (const p of points) {
    if (p.country) countryAcc.set(p.country, (countryAcc.get(p.country) ?? 0) + 1);
    if (p.country && p.region) {
      const key = `${p.country} · ${p.region}`;
      const e = regionAcc.get(key) ?? { country: p.country, region: p.region, count: 0 };
      e.count += 1; regionAcc.set(key, e);
    }
  }
  const countries: CountryTally[] = Array.from(countryAcc, ([country, sourceCount]) => ({ country, sourceCount }))
    .sort((a, b) => b.sourceCount - a.sourceCount || a.country.localeCompare(b.country));
  const regions: RegionTally[] = Array.from(regionAcc, ([key, v]) => ({ key, country: v.country, region: v.region, sourceCount: v.count }))
    .sort((a, b) => b.sourceCount - a.sourceCount || a.key.localeCompare(b.key));

  const dominantCountry = countries.length ? countries[0].country : null;

  let centroid: NarrativeGeography['centroid'] = null;
  let bounds: NarrativeGeography['bounds'] = null;
  if (geoReady > 0) {
    let sumLat = 0, sumLng = 0;
    let minLat = points[0].lat, maxLat = points[0].lat, minLng = points[0].lng, maxLng = points[0].lng;
    for (const p of points) {
      sumLat += p.lat; sumLng += p.lng;
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
    }
    centroid = { lat: round(sumLat / geoReady), lng: round(sumLng / geoReady) };
    bounds = { minLat: round(minLat), maxLat: round(maxLat), minLng: round(minLng), maxLng: round(maxLng) };
  }

  const reason = geoReady === 0
    ? (total === 0
        ? 'No member sources — geography NOT OBSERVED.'
        : `${total} member source${total === 1 ? '' : 's'}, none with real coordinates — geography NOT OBSERVED.`)
    : `${geoReady}/${total} member source${total === 1 ? '' : 's'} plotted across ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}` +
      (ungeolocated > 0 ? `; ${ungeolocated} ungeolocated.` : '.');

  // points sorted deterministically (country, then name) for stable rendering
  points.sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '') || a.name.localeCompare(b.name));

  return { totalSources: total, geoReadySources: geoReady, ungeolocatedSources: ungeolocated, coverageRatio, countries, regions, points, dominantCountry, centroid, bounds, reason };
}
