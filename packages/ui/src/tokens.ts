// HSI design tokens — single source of truth for inline styles used by UI components.

export const colors = {
  background: '#050714',
  backgroundDeep: '#02040A',
  surface: '#0A0F1F',
  surface2: '#111A2E',
  surface3: '#162033',
  border: '#1F2A44',
  borderSoft: 'rgba(148,163,184,0.16)',
  primaryBlue: '#2563EB',
  electricBlue: '#3B82F6',
  glowBlue: 'rgba(37,99,235,0.35)',
  riskRed: '#EF4444',
  riskRedSoft: 'rgba(239,68,68,0.16)',
  warningOrange: '#F59E0B',
  warningOrangeSoft: 'rgba(245,158,11,0.16)',
  verifiedGreen: '#10B981',
  verifiedGreenSoft: 'rgba(16,185,129,0.16)',
  accentPurple: '#8B5CF6',
  accentPurpleSoft: 'rgba(139,92,246,0.16)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
} as const;

export type RiskLevel = 1 | 2 | 3 | 4 | 5;

export const riskLevels: Record<
  RiskLevel,
  { label: string; color: string; soft: string }
> = {
  1: { label: 'Minimal', color: colors.verifiedGreen, soft: colors.verifiedGreenSoft },
  2: { label: 'Low', color: '#A3E635', soft: 'rgba(163,230,53,0.16)' },
  3: { label: 'Moderate', color: colors.warningOrange, soft: colors.warningOrangeSoft },
  4: { label: 'High', color: colors.riskRed, soft: colors.riskRedSoft },
  5: { label: 'Critical', color: '#B91C1C', soft: 'rgba(185,28,28,0.22)' },
};
