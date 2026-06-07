// =============================================================================
// @hsi/research-agents — concept parser
// Deterministic free-text -> ConceptSignals extraction. Regex + keyword rules
// only; no network, no randomness. Always populates keywords[], and supplies
// Earth-like defaults where nothing matches so downstream agents always have a
// coherent baseline to reason from.
// =============================================================================

import type { ConceptSignals, MetabolismRate, ResearchConcept } from './types';

/** Options for parseConcept (kept minimal in Phase 3). */
export interface ParseConceptOptions {
  id?: string;
  title?: string;
}

/** Parse a free-text concept into a structured ResearchConcept. */
export function parseConcept(text: string, opts: ParseConceptOptions = {}): ResearchConcept {
  const lower = text.toLowerCase();
  const extracted = extractSignals(text, lower);
  return {
    id: opts.id,
    text,
    title: opts.title ?? deriveTitle(text),
    extracted,
  };
}

/** Build a short title from the first sentence/clause of the concept. */
function deriveTitle(text: string): string {
  const trimmed = text.trim();
  const firstSentence = trimmed.split(/[.!?\n]/)[0] ?? trimmed;
  const clipped = firstSentence.trim().slice(0, 80);
  return clipped.length > 0 ? clipped : 'Untitled concept';
}

/** Parse a number that may include commas/underscores ("1,000" -> 1000). */
function parseLooseNumber(raw: string): number {
  return Number(raw.replace(/[,_\s]/g, ''));
}

/** Expand a magnitude word ("billion") to a multiplier. */
const MAGNITUDE: Record<string, number> = {
  hundred: 1e2,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

function extractSignals(text: string, lower: string): ConceptSignals {
  const signals: ConceptSignals = { keywords: extractKeywords(lower) };

  // --- subjective day length ------------------------------------------------
  // "subjective day equals 1,000 Earth years" / "subjective day of 1000 years"
  const subjDay =
    lower.match(
      /subjective\s+(?:day|moment|instant)[^0-9]*?([0-9][0-9,_\.]*)\s*(hundred|thousand|million|billion|trillion)?\s*(?:earth\s+)?(?:years?|yrs?)/,
    ) ??
    lower.match(/([0-9][0-9,_\.]*)\s*(hundred|thousand|million|billion|trillion)?\s*(?:earth\s+)?years?\s+(?:per|=|equals?)\s+(?:subjective\s+)?(?:day|moment)/);
  if (subjDay) {
    const base = parseLooseNumber(subjDay[1]);
    const mag = subjDay[2] ? (MAGNITUDE[subjDay[2]] ?? 1) : 1;
    if (Number.isFinite(base)) signals.subjectiveDayYears = base * mag;
  } else if (/(?:one|a)\s+thousand\s+(?:earth\s+)?years?/.test(lower) && /subjective\s+(?:day|moment)/.test(lower)) {
    signals.subjectiveDayYears = 1000;
  }

  // --- frozen / cold --------------------------------------------------------
  if (/\b(frozen|ice|icy|cryogenic|glacial|sub[-\s]?zero|cold)\b/.test(lower)) {
    signals.frozen = true;
  }

  // --- gravity --------------------------------------------------------------
  // "4.5g", "3 times gravity", "high gravity"
  const gMatch =
    lower.match(/([0-9]+(?:\.[0-9]+)?)\s*g\b/) ??
    lower.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:times|x|×)\s+(?:earth(?:'s)?\s+)?gravity/) ??
    lower.match(/gravity\s+(?:of\s+)?([0-9]+(?:\.[0-9]+)?)\s*g/);
  if (gMatch) {
    const g = Number(gMatch[1]);
    if (Number.isFinite(g) && g > 0) signals.gravityG = g;
  } else if (/\bhigh[-\s]?gravity\b/.test(lower)) {
    signals.gravityG = 2.5;
  } else if (/\blow[-\s]?gravity\b/.test(lower)) {
    signals.gravityG = 0.4;
  }

  // --- super-Earth ----------------------------------------------------------
  if (/\bsuper[-\s]?earth\b/.test(lower)) {
    signals.superEarth = true;
    if (signals.gravityG === undefined) signals.gravityG = 1.8;
  }

  // --- genetics substrate ---------------------------------------------------
  if (/\bcrystal(?:line)?\b/.test(lower)) signals.geneticsSubstrate = 'crystal';
  else if (/\bsilicon|silicate\b/.test(lower)) signals.geneticsSubstrate = 'silicon';
  else if (/\brna\b/.test(lower)) signals.geneticsSubstrate = 'RNA';
  else if (/\bdna\b/.test(lower)) signals.geneticsSubstrate = 'DNA';

  // --- neural substrate -----------------------------------------------------
  if (/\bgeological|mineral\s+neural|rock|lattice|crystal(?:line)?\s+(?:brain|mind|neural)\b/.test(lower)) {
    signals.neuralSubstrate = 'geological mineral neural network';
  } else if (/\bsilicon\s+(?:brain|neural|mind)\b/.test(lower)) {
    signals.neuralSubstrate = 'silicon computational substrate';
  }

  // --- metabolism rate ------------------------------------------------------
  signals.metabolismRate = inferMetabolism(lower, signals.subjectiveDayYears);

  // --- lifespan -------------------------------------------------------------
  const lifeMatch = lower.match(
    /(?:lifespan|lives?\s+(?:for|up\s+to)|live\s+for|life\s+span)[^0-9]*?([0-9][0-9,_\.]*)\s*(hundred|thousand|million|billion|trillion)?\s*(?:earth\s+)?years?/,
  );
  if (lifeMatch) {
    const base = parseLooseNumber(lifeMatch[1]);
    const mag = lifeMatch[2] ? (MAGNITUDE[lifeMatch[2]] ?? 1) : 1;
    if (Number.isFinite(base)) signals.lifespanYears = base * mag;
  } else if (/\bbillion[-\s]?year\b/.test(lower)) {
    signals.lifespanYears = 1e9;
  } else if (/\bmillion[-\s]?year\b/.test(lower)) {
    signals.lifespanYears = 1e6;
  }

  // --- star type ------------------------------------------------------------
  signals.starType = inferStarType(lower);

  return signals;
}

function inferMetabolism(lower: string, subjectiveDayYears?: number): MetabolismRate {
  if (/\b(ultra[-\s]?slow|geologic(?:al)?\s+metabolism|near[-\s]?dormant)\b/.test(lower)) return 'ultra-slow';
  if (/\bslow\s+metabolism|slow[-\s]?living|torpor\b/.test(lower)) return 'slow';
  if (/\bfast\s+metabolism|hyperactive|frenetic\b/.test(lower)) return 'fast';
  // A vastly long subjective day implies extremely slow metabolism.
  if (subjectiveDayYears !== undefined) {
    if (subjectiveDayYears >= 1000) return 'ultra-slow';
    if (subjectiveDayYears >= 1) return 'slow';
  }
  return 'normal';
}

function inferStarType(lower: string): string | undefined {
  if (/\bred\s+dwarf|m[-\s]?dwarf|m[-\s]?type\s+star\b/.test(lower)) return 'M';
  if (/\bsun[-\s]?like|g[-\s]?type\s+star|yellow\s+(?:dwarf|star)\b/.test(lower)) return 'G';
  if (/\bwhite\s+dwarf\b/.test(lower)) return 'whiteDwarf';
  if (/\bred\s+giant\b/.test(lower)) return 'redGiant';
  if (/\bneutron\s+star\b/.test(lower)) return 'neutron';
  // Cold, long-lived worlds default to long-lived red dwarfs.
  if (/\bfrozen|ice|glacial\b/.test(lower) && /\bbillion[-\s]?year|long[-\s]?lived\b/.test(lower)) return 'M';
  return undefined;
}

/** Salient keyword extraction (deterministic, de-duplicated, stop-word filtered). */
function extractKeywords(lower: string): string[] {
  const STOP = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by',
    'for', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'that',
    'this', 'it', 'its', 'whose', 'who', 'which', 'their', 'they', 'them',
    'from', 'into', 'than', 'then', 'so', 'up', 'down', 'per', 'equals',
    'equal', 'about', 'one', 'each', 'being', 'have', 'has',
  ]);
  const tokens = lower.match(/[a-z][a-z\-]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 32) break;
  }
  return out;
}
