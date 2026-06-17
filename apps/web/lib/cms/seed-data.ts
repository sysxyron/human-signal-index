// =============================================================================
// HSI Phase 31B — CMS seed data. PURE (no DB, no 'use server'). Deterministic
// definitions of the existing site content as CMS records, derived from the real
// sources (role tasks, mission templates, badge defs, purpose options) where
// possible. The seed action inserts only what's MISSING (idempotent) — this module
// just declares the canonical content + a pure missing-filter helper.
// =============================================================================

import { ROLES, ROLE_LABEL, ROLE_SUMMARY, ROLE_TASKS } from '../navigation/role-tasks';
import { MISSION_TEMPLATES, BADGE_DEFINITIONS } from '@hsi/contributor-network';
import { PURPOSE_OPTIONS } from '../contributor/options';
import type { BlockType, PageType, PageStatus } from '@hsi/cms-engine';

export interface SeedBlock { type: BlockType; content: Record<string, unknown> }
export interface SeedPage { slug: string; pageType: PageType; title: string; status: PageStatus; seo: { title: string; description: string; keywords?: string[] }; blocks: SeedBlock[] }

const page = (slug: string, pageType: PageType, title: string, description: string, blocks: SeedBlock[], status: PageStatus = 'published'): SeedPage =>
  ({ slug, pageType, title, status, seo: { title: `${title} — Human Signal Index`, description }, blocks });

// ---- Homepage (Deliverable 3) ---------------------------------------------
const HOMEPAGE: SeedPage = page('home', 'landing', 'Human Signal Index',
  'A governed contributor intelligence network — verified, traceable, accountable.',
  [
    { type: 'hero', content: { heading: 'Signal over noise', subheading: 'Human Signal Index turns scattered public signals into verified, governed, traceable intelligence.', ctaLabel: 'Explore public reports', ctaHref: '/public-reports' } },
    { type: 'rich_text', content: { markdown: 'HSI collects public signals, builds evidence, runs investigations, and publishes findings — every conclusion backed by a human governance decision and a full lineage trail.' } },
    { type: 'card_grid', content: { cards: [
      { title: 'Collect public signals', body: 'Continuous capture across sources with classification + risk scoring.' },
      { title: 'Build evidence', body: 'Traceable evidence packages with provenance and reliability tiers.' },
      { title: 'Investigate together', body: 'Collaborative investigations with review, consensus, and governance.' },
      { title: 'Publish accountably', body: 'Governed publications with outcomes, trust, and authority attribution.' },
    ] } },
    { type: 'rich_text', content: { markdown: '**Trust & security first.** Role-based access, full audit trails, and traceable lineage from signal to outcome.' } },
    { type: 'cta', content: { label: 'Become a contributor', href: '/sign-up' } },
  ],
  'draft', // keep the flagship GlobeHero homepage as the live default; publish to switch.
);

// ---- Marketing / content pages (Deliverable 2) ----------------------------
const CONTENT_PAGES: SeedPage[] = [
  page('trust', 'content', 'Trust & Transparency', 'How HSI earns and measures trust.', [
    { type: 'hero', content: { heading: 'Trust & Transparency', subheading: 'Every finding is traceable, every decision is governed.' } },
    { type: 'rich_text', content: { markdown: 'HSI measures contributor trust and authority from real, reviewed outcomes — not activity volume. Trust never grants access; RBAC does.' } },
  ]),
  page('security', 'legal', 'Security', 'HSI security posture and reporting.', [
    { type: 'hero', content: { heading: 'Security', subheading: 'Defense-in-depth: RBAC, RLS, audit trails, and least privilege.' } },
    { type: 'rich_text', content: { markdown: 'Report a vulnerability via our disclosure channels. We never expose service-role credentials client-side and audit every privileged action.' } },
  ]),
  page('security-awareness', 'knowledge', 'Security Awareness', 'Security awareness for contributors.', [
    { type: 'rich_text', content: { markdown: 'Protect your account: use a strong password, watch for phishing, and report suspicious activity. Magic-link sign-in is supported.' } },
  ]),
  page('vulnerability-disclosure', 'legal', 'Vulnerability Disclosure', 'Responsible vulnerability disclosure policy.', [
    { type: 'rich_text', content: { markdown: 'We welcome good-faith security research. Report issues privately; we acknowledge, triage, and remediate, and credit reporters.' } },
  ]),
  page('whistleblower', 'legal', 'Whistleblower Center', 'Confidential whistleblower channel.', [
    { type: 'rich_text', content: { markdown: 'Report wrongdoing confidentially. Submissions are handled with care and minimal access.' } },
  ]),
  page('report-confidentially', 'content', 'Report Confidentially', 'Submit sensitive information securely.', [
    { type: 'rich_text', content: { markdown: 'Use this channel for sensitive tips. Provide as much verifiable detail as you safely can.' } },
  ]),
  // About is seeded as DRAFT (like the homepage) so the rich, nine-section
  // hardcoded /about page stays the live default. Publishing this in the CMS
  // intentionally overrides it; "refresh seeded content" re-syncs these blocks.
  page('about', 'content', 'About HSI', 'What Human Signal Index is, why it exists, how it works, and who it serves.', [
    { type: 'hero', content: { heading: 'A public-interest intelligence platform', subheading: 'HSI helps researchers, journalists, and the public understand the narratives shaping society, with evidence and human review at every step.' } },
    { type: 'rich_text', content: { markdown: '**What HSI is.** A public-interest platform for studying the narratives, claims, and movements that influence public life, bringing signal collection, evidence review, and a trained contributor network under one transparent process.' } },
    { type: 'rich_text', content: { markdown: '**Why it exists.** Public conversation moves faster than the evidence behind it. HSI rebuilds the record so the public can hold claims, and the people who make them, to account.' } },
    { type: 'card_grid', content: { cards: [
      { title: 'Collect', body: 'Public signals are gathered and preserved with their source and capture time.' },
      { title: 'Verify evidence', body: 'Evidence is gathered, checked, and archived so it can be inspected later.' },
      { title: 'Human review', body: 'Trained reviewers assess each finding and document the reasoning.' },
      { title: 'Publish', body: 'Only findings with a complete, traceable evidence chain are published.' },
    ] } },
    { type: 'rich_text', content: { markdown: '**What makes it different.** Evidence first, human review, traceability, transparency, and contributor recognition. **Core principles:** accuracy over speed, evidence over opinion, transparency over opacity, accountability over anonymity, and human judgment over blind automation.' } },
    { type: 'rich_text', content: { markdown: '**Governance and contributors.** Authority is earned and reviewed, never assumed. Decisions are written to an audit log and can be reversed, and corrections stay visible. Contributors advance from Viewer through Curator by approval, never automatically.' } },
    { type: 'cta', content: { label: 'Read our mission', href: '/mission' } },
  ], 'draft'),
  page('faq', 'help', 'FAQ', 'Frequently asked questions about HSI.', [
    { type: 'faq', content: { items: [
      { q: 'How do I contribute?', a: 'Sign up, choose a purpose, and start with missions. Privileged roles are granted by an administrator after an application.' },
      { q: 'How is trust measured?', a: 'From real, reviewed outcomes — accuracy, reliability, and impact. Trust is recognition, not access.' },
      { q: 'Is my data traceable?', a: 'Yes — every artifact has a lineage from signal to outcome.' },
    ] } },
  ]),
  page('research-reports', 'report', 'Research Reports', 'Published HSI research and intelligence reports.', [
    { type: 'rich_text', content: { markdown: 'Browse published, governed intelligence reports. Each report links to its evidence and lineage.' } },
    { type: 'cta', content: { label: 'View public reports', href: '/public-reports' } },
  ]),
  page('signal-library', 'knowledge', 'Signal Library', 'The HSI signal taxonomy and library.', [
    { type: 'rich_text', content: { markdown: 'Explore signal categories, classification, and how signals become investigations.' } },
  ]),
  page('education-hub', 'knowledge', 'Education Hub', 'Learn how to contribute effectively to HSI.', [
    { type: 'rich_text', content: { markdown: 'Guides on submitting signals, building evidence, reviewing, and the governance lifecycle.' } },
  ]),
];

export const SEED_PAGES: SeedPage[] = [HOMEPAGE, ...CONTENT_PAGES];

// ---- Navigation (Deliverable 4) -------------------------------------------
export interface SeedNav { location: 'header' | 'footer' | 'dashboard_help'; label: string; href: string; position: number; group?: string }
export const SEED_NAV: SeedNav[] = [
  { location: 'header', label: 'About', href: '/about', position: 0 },
  { location: 'header', label: 'Methodology', href: '/methodology', position: 1 },
  { location: 'header', label: 'Research Reports', href: '/research-reports', position: 2 },
  { location: 'header', label: 'Signal Library', href: '/signal-library', position: 3 },
  { location: 'header', label: 'Education Hub', href: '/education-hub', position: 4 },
  // Footer — grouped (Phase 41B.3 D). "Trust" not "Trust & Transparency" (J).
  { location: 'footer', group: 'Platform', label: 'Dashboard', href: '/dashboard', position: 0 },
  { location: 'footer', group: 'Platform', label: 'Signal Library', href: '/signal-library', position: 1 },
  { location: 'footer', group: 'Platform', label: 'Research Reports', href: '/research-reports', position: 2 },
  { location: 'footer', group: 'Platform', label: 'Submit a Signal', href: '/submit-a-signal', position: 3 },
  { location: 'footer', group: 'About', label: 'Our Mission', href: '/mission', position: 4 },
  { location: 'footer', group: 'About', label: 'About HSI', href: '/about', position: 5 },
  { location: 'footer', group: 'About', label: 'Methodology', href: '/methodology', position: 6 },
  { location: 'footer', group: 'About', label: 'Contact', href: '/contact', position: 7 },
  { location: 'footer', group: 'Trust', label: 'Trust', href: '/trust', position: 8 },
  { location: 'footer', group: 'Trust', label: 'Transparency', href: '/transparency', position: 9 },
  { location: 'footer', group: 'Trust', label: 'Ethics', href: '/ethics', position: 10 },
  { location: 'footer', group: 'Trust', label: 'Accessibility', href: '/accessibility', position: 11 },
  { location: 'footer', group: 'Security & Reporting', label: 'Vulnerability Disclosure', href: '/security/vulnerability-disclosure', position: 12 },
  { location: 'footer', group: 'Security & Reporting', label: 'Responsible Disclosure', href: '/security/responsible-disclosure', position: 13 },
  { location: 'footer', group: 'Security & Reporting', label: 'Whistleblower Center', href: '/whistleblower', position: 14 },
  { location: 'footer', group: 'Security & Reporting', label: 'Report Confidentially', href: '/report-confidentially', position: 15 },
  { location: 'dashboard_help', label: 'FAQ', href: '/faq', position: 0 },
  { location: 'dashboard_help', label: 'Education Hub', href: '/education-hub', position: 1 },
];

// ---- Role content (Deliverable 7) — from Phase-25 role tasks ---------------
export interface SeedRoleContent { role: string; title: string; description: string }
export const SEED_ROLE_CONTENT: SeedRoleContent[] = ROLES.map((r) => ({
  role: r, title: ROLE_LABEL[r],
  description: `${ROLE_SUMMARY[r]} Recommended: ${ROLE_TASKS[r].map((t) => t.label).join('; ')}.`,
}));

// ---- Mission content (Deliverable 8) — from contributor-network templates --
export interface SeedMissionContent { missionKey: string; title: string; instructions: string; rewards: string; requirements: Record<string, unknown> }
export const SEED_MISSION_CONTENT: SeedMissionContent[] = MISSION_TEMPLATES.map((m) => ({
  missionKey: m.id, title: m.title,
  instructions: m.steps.map((s) => s.label).join(' · '),
  rewards: `${m.xpReward} XP · ${m.creditReward} credits`,
  requirements: { role: m.role, steps: m.steps },
}));

// ---- Badge content (Deliverable 9) — from contributor-network defs ---------
export interface SeedBadgeContent { badgeId: string; name: string; description: string; unlockRequirements: string }
export const SEED_BADGE_CONTENT: SeedBadgeContent[] = BADGE_DEFINITIONS.map((b) => ({
  badgeId: b.id, name: b.name, description: b.description, unlockRequirements: `${b.threshold} ${b.metric.replace(/_/g, ' ')}`,
}));

// ---- Onboarding content (Deliverable 10) ----------------------------------
export interface SeedOnboarding { key: string; title: string; body: string }
export const SEED_ONBOARDING: SeedOnboarding[] = [
  { key: 'purpose_welcome', title: 'Welcome to Human Signal Index', body: 'Everyone starts as a Viewer. Choose how you want to contribute — privileged roles are earned through reviewed work and granted by an administrator.' },
  ...PURPOSE_OPTIONS.map((p) => ({ key: `purpose_${p.path}`, title: p.label, body: p.blurb })),
  { key: 'application_instructions', title: 'Applying for a role', body: 'Tell reviewers about your experience and why you want this path. You keep Viewer access until an admin approves.' },
  { key: 'tester_welcome', title: 'Beta tester welcome', body: 'Join a cohort and start contributing immediately. Report issues and give feedback — you earn XP, badges, and ranks through real work.' },
  { key: 'beta_onboarding', title: 'Beta onboarding', body: 'Complete your missions, report any issues you find, and share NPS feedback. Claim your completion certificate when you finish.' },
];

// ---- Email templates (Deliverable 11) — copy only, no sending -------------
export interface SeedEmail { key: string; subject: string; body: string }
export const SEED_EMAIL_TEMPLATES: SeedEmail[] = [
  { key: 'invite', subject: 'You are invited to Human Signal Index', body: 'You have been invited to join HSI. Click the link to accept your invitation and set up your account.' },
  { key: 'role_approved', subject: 'Your HSI role application was approved', body: 'Good news — your application has been approved. Your new role is now active. Welcome aboard.' },
  { key: 'role_rejected', subject: 'Update on your HSI role application', body: 'Thank you for applying. We are unable to approve this application at the moment. You keep your current access and may reapply later.' },
  { key: 'mission_assigned', subject: 'New HSI missions assigned', body: 'You have new missions waiting. Complete them to earn XP, badges, and rank progress.' },
  { key: 'beta_invite', subject: 'Join the HSI beta', body: 'You are invited to the HSI beta program. Join a cohort and start testing today.' },
  { key: 'feedback_request', subject: 'How is your HSI experience?', body: 'We would love your feedback. Take a moment to share your thoughts and an NPS score.' },
];

/** PURE — items not already present (by key). Drives idempotent seeding + tests. */
export function selectMissing<T>(items: T[], existingKeys: Set<string>, keyOf: (item: T) => string): T[] {
  return items.filter((i) => !existingKeys.has(keyOf(i)));
}
