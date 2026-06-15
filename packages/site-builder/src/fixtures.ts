// =============================================================================
// Deterministic demo blocks for tests + offline previews. No randomness.
// =============================================================================

import type { SiteBlock } from './types';

export const demoSiteBlocks: SiteBlock[] = [
  { id: 'h', type: 'hero', position: 0, content: { headline: 'Signal over noise', subheadline: 'Governed, traceable intelligence.', ctaLabel: 'Explore', ctaHref: '/public-reports' } },
  { id: 'f', type: 'feature_grid', position: 1, content: { features: [{ title: 'Collect', body: 'Public signals.' }, { title: 'Verify', body: 'Evidence + review.' }] } },
  { id: 's', type: 'statistic', position: 2, content: { value: '96.3%', label: 'Traceability score' } },
  { id: 't', type: 'testimonial', position: 3, content: { quote: 'HSI changed how we verify.', author: 'A. Analyst', role: 'Newsroom' } },
  { id: 'c', type: 'cta', position: 4, content: { label: 'Join', href: '/sign-up' } },
];
