// =============================================================================
// WorldForge — scientific-confidence presentation helpers.
// The engine tags every node with a ScientificConfidence whose `color` is a
// Tailwind-ish token (e.g. 'emerald-500'). The HSI app uses inline hex tokens,
// so we map tiers -> hex consistently:
//   known-science      → green
//   plausible-science  → blue
//   speculative        → purple
//   fictional          → amber
//   violates-physics   → red
// =============================================================================

import type { ScientificConfidenceTier } from '@hsi/simulation-engine';

export interface TierStyle {
  label: string;
  color: string;
  soft: string;
  border: string;
}

export const TIER_STYLES: Record<ScientificConfidenceTier, TierStyle> = {
  'known-science': {
    label: 'Known Science',
    color: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    border: 'rgba(16,185,129,0.45)',
  },
  'plausible-science': {
    label: 'Plausible',
    color: '#3B82F6',
    soft: 'rgba(59,130,246,0.14)',
    border: 'rgba(59,130,246,0.45)',
  },
  speculative: {
    label: 'Speculative',
    color: '#8B5CF6',
    soft: 'rgba(139,92,246,0.14)',
    border: 'rgba(139,92,246,0.45)',
  },
  fictional: {
    label: 'Fictional',
    color: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.45)',
  },
  'violates-known-physics': {
    label: 'Violates Physics',
    color: '#EF4444',
    soft: 'rgba(239,68,68,0.16)',
    border: 'rgba(239,68,68,0.5)',
  },
};

export function tierStyle(tier: string): TierStyle {
  return (
    TIER_STYLES[tier as ScientificConfidenceTier] ?? TIER_STYLES['speculative']
  );
}

/** Order tiers from most → least grounded (for legends). */
export const TIER_ORDER: ScientificConfidenceTier[] = [
  'known-science',
  'plausible-science',
  'speculative',
  'fictional',
  'violates-known-physics',
];

/** Format a 0..1 (or 0..100) value compactly with significant figures. */
export function fmtNum(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let out: string;
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) {
    out = value.toExponential(2);
  } else if (Number.isInteger(value)) {
    out = value.toString();
  } else {
    out = value.toPrecision(abs < 1 ? 3 : 4).replace(/\.?0+$/, '');
  }
  return unit ? `${out} ${unit}` : out;
}

export function fmtPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Map a node category to a HSI tone color for cluster columns. */
export const CATEGORY_COLORS: Record<string, string> = {
  star: '#F59E0B',
  planet: '#3B82F6',
  chemistry: '#10B981',
  biology: '#22C55E',
  intelligence: '#8B5CF6',
  civilization: '#06B6D4',
  risk: '#EF4444',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#94A3B8';
}
