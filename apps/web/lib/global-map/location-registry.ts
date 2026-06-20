// =============================================================================
// HSI Phase 73.3 — Deterministic location registry (PURE). Exact, curated
// mappings from a KNOWN source/organization to its real, publicly-documented
// headquarters location. This is NOT geocoding and NOT inference — it is a hand-
// curated lookup of well-known HQs. It only ever resolves on an EXACT name or
// EXACT registrable-domain match; anything else returns null (GEO_UNKNOWN stays).
// No fuzzy matching, no generated data. Coordinates are real HQ coordinates.
// No I/O.
// =============================================================================

import { domainOf } from '../source-discovery/duplicates';

export interface RegistryLocation {
  country: string; region: string | null; city: string;
  latitude: number; longitude: number;
  /** city-level HQ confidence (org HQ, not article-level). */
  confidence: number;
}

interface RegistryEntry extends RegistryLocation {
  names: string[];     // exact (normalized) source names / aliases
  domains: string[];   // exact registrable domains
}

const HQ = (city: string, region: string | null, country: string, latitude: number, longitude: number): RegistryLocation => ({ city, region, country, latitude, longitude, confidence: 0.8 });

// Real, publicly-documented headquarters. (city, region, country, lat, lng)
const WASHINGTON = HQ('Washington', 'District of Columbia', 'United States', 38.9072, -77.0369);
const NEW_YORK = HQ('New York', 'New York', 'United States', 40.7128, -74.0060);
const LONDON = HQ('London', 'England', 'United Kingdom', 51.5074, -0.1278);
const BRUSSELS = HQ('Brussels', null, 'Belgium', 50.8503, 4.3517);
const GENEVA = HQ('Geneva', null, 'Switzerland', 46.2044, 6.1432);
const ARLINGTON = HQ('Arlington', 'Virginia', 'United States', 38.8799, -77.1068);

const REGISTRY: RegistryEntry[] = [
  { ...LONDON, names: ['reuters', 'reuters news'], domains: ['reuters.com'] },
  { ...LONDON, names: ['bbc', 'bbc news'], domains: ['bbc.com', 'bbc.co.uk'] },
  { ...LONDON, names: ['the guardian', 'guardian'], domains: ['theguardian.com'] },
  { ...LONDON, names: ['chatham house', 'royal institute of international affairs'], domains: ['chathamhouse.org'] },
  { ...LONDON, names: ['financial times'], domains: ['ft.com'] },
  { ...WASHINGTON, names: ['npr', 'national public radio'], domains: ['npr.org'] },
  { ...WASHINGTON, names: ['brookings', 'brookings institution'], domains: ['brookings.edu'] },
  { ...WASHINGTON, names: ['the washington post', 'washington post'], domains: ['washingtonpost.com'] },
  { ...WASHINGTON, names: ['federal reserve', 'the federal reserve', 'federal reserve board'], domains: ['federalreserve.gov'] },
  { ...WASHINGTON, names: ['department of justice', 'doj', 'u.s. department of justice'], domains: ['justice.gov'] },
  { ...WASHINGTON, names: ['fbi', 'federal bureau of investigation'], domains: ['fbi.gov'] },
  { ...WASHINGTON, names: ['dhs', 'department of homeland security'], domains: ['dhs.gov'] },
  { ...WASHINGTON, names: ['atlantic council'], domains: ['atlanticcouncil.org'] },
  { ...WASHINGTON, names: ['csis', 'center for strategic and international studies'], domains: ['csis.org'] },
  { ...WASHINGTON, names: ['carnegie endowment', 'carnegie endowment for international peace'], domains: ['carnegieendowment.org'] },
  { ...WASHINGTON, names: ['state department', 'department of state', 'u.s. department of state'], domains: ['state.gov'] },
  { ...WASHINGTON, names: ['cdc', 'centers for disease control and prevention'], domains: ['cdc.gov'] },
  { ...WASHINGTON, names: ['nasa'], domains: ['nasa.gov'] },
  { ...WASHINGTON, names: ['the white house', 'white house'], domains: ['whitehouse.gov'] },
  { ...ARLINGTON, names: ['cisa', 'cybersecurity and infrastructure security agency'], domains: ['cisa.gov'] },
  { ...ARLINGTON, names: ['department of defense', 'dod', 'the pentagon', 'pentagon'], domains: ['defense.gov'] },
  { ...NEW_YORK, names: ['un', 'united nations'], domains: ['un.org'] },
  { ...NEW_YORK, names: ['associated press', 'ap'], domains: ['apnews.com', 'ap.org'] },
  { ...NEW_YORK, names: ['the new york times', 'new york times', 'nyt'], domains: ['nytimes.com'] },
  { ...NEW_YORK, names: ['council on foreign relations', 'cfr'], domains: ['cfr.org'] },
  { ...NEW_YORK, names: ['human rights watch', 'hrw'], domains: ['hrw.org'] },
  { ...NEW_YORK, names: ['the wall street journal', 'wall street journal', 'wsj'], domains: ['wsj.com'] },
  { ...GENEVA, names: ['who', 'world health organization'], domains: ['who.int'] },
  { ...GENEVA, names: ['wto', 'world trade organization'], domains: ['wto.org'] },
  { ...GENEVA, names: ['unhcr', 'un refugee agency'], domains: ['unhcr.org'] },
  { ...BRUSSELS, names: ['nato', 'north atlantic treaty organization'], domains: ['nato.int'] },
  { ...BRUSSELS, names: ['european commission', 'european union', 'eu'], domains: ['ec.europa.eu', 'europa.eu'] },
  { ...HQ('The Hague', null, 'Netherlands', 52.0705, 4.3007), names: ['europol'], domains: ['europol.europa.eu'] },
  { ...HQ('Lyon', null, 'France', 45.7640, 4.8357), names: ['interpol'], domains: ['interpol.int'] },
  { ...HQ('Santa Monica', 'California', 'United States', 34.0195, -118.4912), names: ['rand', 'rand corporation'], domains: ['rand.org'] },
  { ...HQ('Atlanta', 'Georgia', 'United States', 33.7490, -84.3880), names: ['cnn'], domains: ['cnn.com'] },
  { ...HQ('Doha', null, 'Qatar', 25.2854, 51.5310), names: ['al jazeera', 'aljazeera'], domains: ['aljazeera.com'] },
  { ...HQ('Amsterdam', null, 'Netherlands', 52.3676, 4.9041), names: ['bellingcat'], domains: ['bellingcat.com'] },
  { ...HQ('Paris', null, 'France', 48.8566, 2.3522), names: ['oecd', 'agence france-presse', 'afp'], domains: ['oecd.org', 'afp.com'] },
];

function norm(v: string | null | undefined): string {
  if (!v) return '';
  return v.trim().toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, ' ');
}

// Build exact lookup maps once (deterministic).
const BY_NAME = new Map<string, RegistryLocation>();
const BY_DOMAIN = new Map<string, RegistryLocation>();
for (const e of REGISTRY) {
  const loc: RegistryLocation = { country: e.country, region: e.region, city: e.city, latitude: e.latitude, longitude: e.longitude, confidence: e.confidence };
  for (const nm of e.names) BY_NAME.set(norm(nm), loc);
  for (const d of e.domains) BY_DOMAIN.set(d.toLowerCase(), loc);
}

/** Resolve a KNOWN source to its HQ location by EXACT name or EXACT domain.
 *  Returns null when there is no exact match (GEO_UNKNOWN is preserved). */
export function lookupLocation(sourceName: string | null | undefined, url?: string | null): RegistryLocation | null {
  const byName = BY_NAME.get(norm(sourceName));
  if (byName) return byName;
  const dom = domainOf(url);
  if (dom && BY_DOMAIN.get(dom)) return BY_DOMAIN.get(dom) ?? null;
  return null;
}

export const REGISTRY_SIZE = { names: BY_NAME.size, domains: BY_DOMAIN.size };
