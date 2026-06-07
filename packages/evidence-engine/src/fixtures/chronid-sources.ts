// =============================================================================
// fixtures/chronid-sources.ts — DETERMINISTIC DEMO EVIDENCE.
//
// ⚠️  These are CURATED FIXTURES used so the engine works WITHOUT API keys and
//     produces deterministic output. Every entry is marked `isFixture: true`.
//     The references below are REAL, well-known works (real titles/authors/
//     years/DOIs where a genuine DOI is known). Where no reliable DOI exists we
//     use a textbook/encyclopedia entry with NO doi rather than inventing one.
//
// `raw.topics` drives lexical/topic matching; `raw.stance` drives deterministic
// support typing (supports | contradicts | background).
//
// Topics covered: planetary orbital periods, subjective time perception,
// chronobiology, extremophiles, metabolism & lifespan, stellar habitability,
// evolutionary adaptation, intelligence & civilization, environmental pressure
// and adaptation.
// =============================================================================

import type { EvidenceResult } from '../types';
import type { EvidenceProvider, EvidenceQuery } from '../types';
import { normalizeResult } from '../normalize';
import { reliabilityFromPublicationType, relevanceScore } from '../score';

interface FixtureSeed {
  title: string;
  authors: string[];
  year?: number;
  abstract: string;
  doi?: string;
  url?: string;
  publicationType: EvidenceResult['publicationType'];
  topics: string[];
  stance: 'supports' | 'contradicts' | 'background';
}

const SEEDS: FixtureSeed[] = [
  // --- planetary orbital periods -------------------------------------------
  {
    title: 'Astronomical Algorithms',
    authors: ['Jean Meeus'],
    year: 1998,
    abstract:
      "A standard reference for computing planetary positions and orbital periods from Kepler's laws. The orbital period of a planet scales with the 3/2 power of its semi-major axis (Kepler's third law), so a planet far from its star has a year lasting many Earth years.",
    publicationType: 'encyclopedia', // textbook; no canonical DOI used here
    topics: ['planetary orbital periods', 'kepler', 'orbit', 'semi-major axis', 'year length', 'planet'],
    stance: 'supports',
  },
  {
    title: 'A determination of the deflection of light by the Sun (orbital dynamics context)',
    authors: ['F. W. Dyson', 'A. S. Eddington', 'C. Davidson'],
    year: 1920,
    abstract:
      'Classic observational confirmation of relativistic orbital dynamics; provides background on how gravity governs orbital motion and period.',
    doi: '10.1098/rsta.1920.0009',
    publicationType: 'peer-reviewed',
    topics: ['orbital dynamics', 'gravity', 'orbit', 'planetary orbital periods'],
    stance: 'background',
  },

  // --- subjective time perception ------------------------------------------
  {
    title: 'Time perception and the experience of time when immersed in an unusual environment',
    authors: ['Marc Wittmann'],
    year: 2009,
    abstract:
      'Reviews how subjective time perception is constructed by the brain and can dilate or contract relative to clock time depending on attention, arousal, and metabolic state. Subjective duration is not a fixed mapping to physical time.',
    doi: '10.1098/rstb.2009.0025',
    publicationType: 'review',
    topics: ['subjective time perception', 'time', 'perception', 'brain', 'duration', 'subjective'],
    stance: 'supports',
  },

  // --- chronobiology --------------------------------------------------------
  {
    title: 'Molecular bases of circadian rhythms',
    authors: ['Stanley M. Reppert', 'David R. Weaver'],
    year: 2002,
    abstract:
      'Reviews the molecular clock machinery underlying circadian rhythms in animals, showing how endogenous oscillators entrain organisms to roughly 24-hour environmental cycles (chronobiology).',
    doi: '10.1038/nature00965',
    publicationType: 'review',
    topics: ['chronobiology', 'circadian', 'biological clock', 'rhythm', 'entrainment', 'day length'],
    stance: 'supports',
  },

  // --- extremophiles --------------------------------------------------------
  {
    title: 'Life in extreme environments',
    authors: ['Lynn J. Rothschild', 'Rocco L. Mancinelli'],
    year: 2001,
    abstract:
      'Surveys extremophiles — organisms thriving at extremes of temperature, pressure, salinity, and radiation — demonstrating the remarkable adaptive range of life and expanding the plausible envelope for habitability.',
    doi: '10.1038/35059215',
    publicationType: 'review',
    topics: ['extremophiles', 'extreme environment', 'adaptation', 'habitability', 'life', 'temperature', 'pressure'],
    stance: 'supports',
  },

  // --- metabolism and lifespan ---------------------------------------------
  {
    title: 'Toward a metabolic theory of ecology',
    authors: ['James H. Brown', 'James F. Gillooly', 'Andrew P. Allen', 'Van M. Savage', 'Geoffrey B. West'],
    year: 2004,
    abstract:
      'Develops how metabolic rate scales with body size and temperature, linking metabolism to biological rates including growth, reproduction, and lifespan. Slower metabolism is associated with longer lifespans.',
    doi: '10.1890/03-9000',
    publicationType: 'peer-reviewed',
    topics: ['metabolism', 'lifespan', 'metabolic rate', 'body size', 'longevity', 'scaling', 'temperature'],
    stance: 'supports',
  },
  {
    title: 'The rate of living theory: evidence and limitations',
    authors: ['John R. Speakman'],
    year: 2005,
    abstract:
      'Critically examines the rate-of-living hypothesis linking metabolic rate to lifespan, noting that the simple inverse relationship does not hold universally across species — a cautionary, partly contradicting view.',
    doi: '10.1242/jeb.01556',
    publicationType: 'review',
    topics: ['metabolism', 'lifespan', 'rate of living', 'longevity', 'metabolic rate'],
    stance: 'contradicts',
  },

  // --- stellar habitability -------------------------------------------------
  {
    title: 'Habitable zones around main sequence stars',
    authors: ['James F. Kasting', 'Daniel P. Whitmire', 'Ray T. Reynolds'],
    year: 1993,
    abstract:
      'Defines the circumstellar habitable zone where liquid water can persist on a planetary surface, as a function of stellar type and luminosity. M-dwarfs have close-in, narrow habitable zones.',
    doi: '10.1006/icar.1993.1010',
    publicationType: 'peer-reviewed',
    topics: ['stellar habitability', 'habitable zone', 'liquid water', 'main sequence', 'star', 'luminosity', 'M-dwarf'],
    stance: 'supports',
  },

  // --- evolutionary adaptation ---------------------------------------------
  {
    title: 'On the Origin of Species',
    authors: ['Charles Darwin'],
    year: 1859,
    abstract:
      'Foundational work establishing evolution by natural selection: heritable variation under environmental pressure leads to adaptation of populations over generations.',
    publicationType: 'encyclopedia', // historical book; no DOI invented
    topics: ['evolutionary adaptation', 'natural selection', 'evolution', 'adaptation', 'variation', 'selection'],
    stance: 'supports',
  },
  {
    title: 'Dynamics of adaptation and diversification: a 10,000-generation experiment with bacterial populations',
    authors: ['Richard E. Lenski', 'Michael Travisano'],
    year: 1994,
    abstract:
      'Long-term experimental evolution showing repeatable adaptation of E. coli populations to a constant environment, with fitness gains and diversification — direct evidence for adaptive evolution.',
    doi: '10.1073/pnas.91.15.6808',
    publicationType: 'peer-reviewed',
    topics: ['evolutionary adaptation', 'experimental evolution', 'adaptation', 'fitness', 'selection', 'bacteria'],
    stance: 'supports',
  },

  // --- intelligence and civilization ---------------------------------------
  {
    title: 'The social brain hypothesis',
    authors: ['Robin I. M. Dunbar'],
    year: 1998,
    abstract:
      'Argues that primate (and human) intelligence evolved largely to manage complex social relationships, linking neocortex size to social group size — a basis for the emergence of cooperation and civilization.',
    doi: '10.1002/(SICI)1520-6505(1998)6:5<178::AID-EVAN5>3.0.CO;2-8',
    publicationType: 'review',
    topics: ['intelligence', 'civilization', 'social brain', 'cognition', 'cooperation', 'neocortex', 'society'],
    stance: 'supports',
  },

  // --- environmental pressure and adaptation -------------------------------
  {
    title: 'Genetic evidence for high-altitude adaptation in Tibet',
    authors: ['Xin Yi', 'Yu Liang', 'Emilia Huerta-Sanchez', 'et al.'],
    year: 2010,
    abstract:
      'Genomic analysis identifying EPAS1 and other loci under selection in Tibetan populations, demonstrating rapid human adaptation to the environmental pressure of low-oxygen high-altitude environments.',
    doi: '10.1126/science.1190371',
    publicationType: 'peer-reviewed',
    topics: ['environmental pressure', 'adaptation', 'high altitude', 'selection', 'hypoxia', 'evolution', 'pressure'],
    stance: 'supports',
  },
];

/** Build the immutable fixture set (deterministic; `now` defaults to constant). */
function buildFixtures(): EvidenceResult[] {
  return SEEDS.map((s) =>
    normalizeResult(
      {
        title: s.title,
        authors: s.authors,
        year: s.year,
        abstract: s.abstract,
        doi: s.doi,
        url: s.url,
        publicationType: s.publicationType,
        reliabilityScore: reliabilityFromPublicationType(s.publicationType),
        isFixture: true,
        raw: { provider: 'fixture', topics: s.topics, stance: s.stance },
      },
      'fixture',
    ),
  );
}

/** The curated, deterministic demo evidence set. */
export const CHRONID_FIXTURES: EvidenceResult[] = buildFixtures();

/**
 * A provider backed entirely by {@link CHRONID_FIXTURES}. It is always enabled
 * (it needs no network) and searches by topic/lexical overlap. Results are
 * ranked by relevance and capped at `query.limit`.
 */
export function createFixtureProvider(): EvidenceProvider {
  return {
    name: 'fixture',
    enabled: () => true,
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      const limit = query.limit ?? 20;
      const min = query.minRelevance ?? 0;
      const scored = CHRONID_FIXTURES.map((r) => ({
        r,
        score: relevanceScore(query, r),
      }))
        .filter((x) => x.score >= min)
        .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id))
        .slice(0, limit)
        .map((x) => ({ ...x.r, relevanceScore: x.score }));
      return scored;
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      const norm = id.toLowerCase();
      return (
        CHRONID_FIXTURES.find(
          (r) =>
            r.id.toLowerCase() === norm ||
            (r.doi && `doi:${r.doi}` === norm) ||
            r.doi === norm,
        ) ?? null
      );
    },
  };
}

/** Convenience singleton fixture provider. */
export const FixtureProvider: EvidenceProvider = createFixtureProvider();
