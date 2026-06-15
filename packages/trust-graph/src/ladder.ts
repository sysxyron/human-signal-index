// =============================================================================
// Trust LADDER (Deliverable 7) — contributor RECOGNITION levels keyed off the
// authority score. These are NOT RBAC roles and NEVER change user_roles; they are
// display tiers only. PURE.
// =============================================================================

import type { TrustLevel } from './types';

export const TRUST_LEVELS: TrustLevel[] = [
  { name: 'Observer', minAuthority: 0, order: 1 },
  { name: 'Analyst', minAuthority: 35, order: 2 },
  { name: 'Researcher', minAuthority: 45, order: 3 },
  { name: 'Senior Researcher', minAuthority: 55, order: 4 },
  { name: 'Investigator', minAuthority: 62, order: 5 },
  { name: 'Senior Investigator', minAuthority: 70, order: 6 },
  { name: 'Authority', minAuthority: 78, order: 7 },
  { name: 'Expert', minAuthority: 85, order: 8 },
  { name: 'Master', minAuthority: 92, order: 9 },
  { name: 'Legend', minAuthority: 97, order: 10 },
];

/** The recognition level for an authority score (0..100). */
export function levelForAuthority(authority: number): TrustLevel {
  let current = TRUST_LEVELS[0];
  for (const l of TRUST_LEVELS) if (authority >= l.minAuthority) current = l; else break;
  return current;
}

/** The next level + authority needed, or null at the top. */
export function nextLevel(authority: number): { level: TrustLevel; authorityToNext: number } | null {
  const cur = levelForAuthority(authority);
  const next = TRUST_LEVELS.find((l) => l.order === cur.order + 1);
  return next ? { level: next, authorityToNext: Math.max(0, next.minAuthority - authority) } : null;
}
