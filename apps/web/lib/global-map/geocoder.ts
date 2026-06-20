// =============================================================================
// HSI Phase 71 — Deterministic geocoder (PURE). A built-in offline gazetteer of
// country / US-state / major-city CENTROIDS. NOT a live geocoder, NOT AI — a
// deterministic lookup. Confidence reflects GRANULARITY (no fabricated
// precision); when nothing matches it returns null (never invents a coordinate).
// No I/O, no network.
// =============================================================================

export interface GeocodeInput { country: string | null; region: string | null; state: string | null; city: string | null }
export interface GeocodeResult { lat: number; lng: number; confidence: number; source: string; granularity: 'city' | 'state' | 'region' | 'country' }

function norm(v: string | null): string { return (v ?? '').trim().toLowerCase(); }

// ---- country centroids (subset; ISO name + common aliases) ------------------
const COUNTRY: Record<string, [number, number]> = {
  'united states': [39.8, -98.6], 'usa': [39.8, -98.6], 'us': [39.8, -98.6], 'united states of america': [39.8, -98.6],
  'united kingdom': [54.0, -2.0], 'uk': [54.0, -2.0], 'great britain': [54.0, -2.0],
  canada: [56.1, -106.3], mexico: [23.6, -102.5], brazil: [-14.2, -51.9], argentina: [-38.4, -63.6],
  france: [46.2, 2.2], germany: [51.2, 10.4], spain: [40.5, -3.7], italy: [41.9, 12.6], portugal: [39.4, -8.2],
  netherlands: [52.1, 5.3], belgium: [50.5, 4.5], switzerland: [46.8, 8.2], austria: [47.5, 14.6],
  poland: [51.9, 19.1], ukraine: [48.4, 31.2], russia: [61.5, 105.3], sweden: [60.1, 18.6], norway: [60.5, 8.5],
  finland: [64.0, 26.0], denmark: [56.3, 9.5], ireland: [53.4, -8.2], greece: [39.1, 21.8], turkey: [39.0, 35.2],
  india: [20.6, 79.0], china: [35.9, 104.2], japan: [36.2, 138.3], 'south korea': [35.9, 127.8], indonesia: [-0.8, 113.9],
  pakistan: [30.4, 69.3], bangladesh: [23.7, 90.4], vietnam: [14.1, 108.3], thailand: [15.9, 100.99], philippines: [12.9, 121.8],
  australia: [-25.3, 133.8], 'new zealand': [-40.9, 174.9],
  'south africa': [-30.6, 22.9], nigeria: [9.1, 8.7], kenya: [-0.02, 37.9], egypt: [26.8, 30.8], ethiopia: [9.1, 40.5],
  'saudi arabia': [23.9, 45.1], israel: [31.0, 34.9], iran: [32.4, 53.7], iraq: [33.2, 43.7], 'united arab emirates': [23.4, 53.8],
  colombia: [4.6, -74.3], chile: [-35.7, -71.5], peru: [-9.2, -75.0], venezuela: [6.4, -66.6],
};

// ---- US state centroids -----------------------------------------------------
const US_STATE: Record<string, [number, number]> = {
  alabama: [32.8, -86.8], alaska: [64.0, -152.0], arizona: [34.2, -111.9], arkansas: [34.9, -92.4], california: [37.2, -119.4],
  colorado: [39.0, -105.5], connecticut: [41.6, -72.7], delaware: [39.0, -75.5], florida: [28.6, -82.4], georgia: [32.6, -83.4],
  hawaii: [20.3, -156.4], idaho: [44.4, -114.6], illinois: [40.0, -89.2], indiana: [39.9, -86.3], iowa: [42.0, -93.5],
  kansas: [38.5, -98.4], kentucky: [37.5, -85.3], louisiana: [31.0, -92.0], maine: [45.4, -69.2], maryland: [39.0, -76.8],
  massachusetts: [42.3, -71.8], michigan: [44.3, -85.4], minnesota: [46.3, -94.3], mississippi: [32.7, -89.7], missouri: [38.4, -92.5],
  montana: [47.0, -109.6], nebraska: [41.5, -99.8], nevada: [39.3, -116.6], 'new hampshire': [43.7, -71.6], 'new jersey': [40.1, -74.7],
  'new mexico': [34.4, -106.1], 'new york': [42.9, -75.5], 'north carolina': [35.6, -79.4], 'north dakota': [47.5, -100.3], ohio: [40.3, -82.8],
  oklahoma: [35.6, -97.5], oregon: [44.0, -120.5], pennsylvania: [40.9, -77.8], 'rhode island': [41.7, -71.5], 'south carolina': [33.9, -80.9],
  'south dakota': [44.4, -100.2], tennessee: [35.9, -86.4], texas: [31.5, -99.3], utah: [39.3, -111.7], vermont: [44.1, -72.7],
  virginia: [37.5, -78.9], washington: [47.4, -120.5], 'west virginia': [38.6, -80.6], wisconsin: [44.6, -89.9], wyoming: [43.0, -107.6],
};
const US_STATE_ABBR: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', de: 'delaware',
  fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky',
  la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri',
  mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina',
  nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
  sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia',
  wi: 'wisconsin', wy: 'wyoming', dc: 'new york', // DC → approximate (no separate centroid)
};

// ---- major cities -----------------------------------------------------------
const CITY: Record<string, [number, number]> = {
  'albany': [42.65, -73.75], 'new york': [40.71, -74.01], 'new york city': [40.71, -74.01], 'washington': [38.91, -77.04],
  'los angeles': [34.05, -118.24], 'san francisco': [37.77, -122.42], 'chicago': [41.88, -87.63], 'boston': [42.36, -71.06],
  'seattle': [47.61, -122.33], 'austin': [30.27, -97.74], 'miami': [25.76, -80.19], 'atlanta': [33.75, -84.39],
  'london': [51.51, -0.13], 'paris': [48.86, 2.35], 'berlin': [52.52, 13.40], 'madrid': [40.42, -3.70], 'rome': [41.90, 12.50],
  'amsterdam': [52.37, 4.90], 'brussels': [50.85, 4.35], 'moscow': [55.76, 37.62], 'kyiv': [50.45, 30.52], 'kiev': [50.45, 30.52],
  'tokyo': [35.68, 139.69], 'beijing': [39.90, 116.41], 'delhi': [28.61, 77.21], 'mumbai': [19.08, 72.88], 'singapore': [1.35, 103.82],
  'sydney': [-33.87, 151.21], 'toronto': [43.65, -79.38], 'mexico city': [19.43, -99.13], 'são paulo': [-23.55, -46.63], 'sao paulo': [-23.55, -46.63],
  'dubai': [25.20, 55.27], 'tel aviv': [32.08, 34.78], 'cairo': [30.04, 31.24], 'nairobi': [-1.29, 36.82], 'lagos': [6.52, 3.38],
};

/** Resolve a country name (with aliases) to a state-table key context. */
function isUS(country: string): boolean { return ['united states', 'usa', 'us', 'united states of america'].includes(country); }

/** Deterministic centroid lookup. Most specific available wins: city > state/
 *  region > country. Returns null when nothing matches — never fabricates. */
export function geocode(input: GeocodeInput): GeocodeResult | null {
  const country = norm(input.country);
  const region = norm(input.region);
  const state = norm(input.state) || region; // region carries state when no state col
  const city = norm(input.city);

  // city (highest confidence)
  if (city && CITY[city]) {
    const [lat, lng] = CITY[city];
    return { lat, lng, confidence: 0.9, source: 'builtin_gazetteer:city', granularity: 'city' };
  }

  // US state / region
  if ((isUS(country) || !country) && state) {
    const key = US_STATE[state] ? state : (US_STATE_ABBR[state] ? US_STATE_ABBR[state] : '');
    if (key && US_STATE[key]) {
      const [lat, lng] = US_STATE[key];
      return { lat, lng, confidence: 0.6, source: 'builtin_gazetteer:state', granularity: 'state' };
    }
  }

  // country (low confidence centroid)
  if (country && COUNTRY[country]) {
    const [lat, lng] = COUNTRY[country];
    return { lat, lng, confidence: 0.3, source: 'builtin_gazetteer:country', granularity: 'country' };
  }

  return null; // nothing resolvable — no coordinate is invented
}

/** Coverage introspection for the readiness report. */
export const GAZETTEER_COVERAGE = { countries: Object.keys(COUNTRY).length, usStates: Object.keys(US_STATE).length, cities: Object.keys(CITY).length };
