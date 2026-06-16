// =============================================================================
// HSI Phase 41B.2 — Education Hub guide catalog (PURE, client-safe).
// Shared by the hub index and the /education-hub/[slug] article framework.
// Content is structural placeholder only — no fabricated article bodies.
// =============================================================================

export type GuideTone = 'blue' | 'purple' | 'green' | 'orange';

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  tag: string;
  tone: GuideTone;
  /** What a reader will take away — used to scaffold the article page. */
  objectives: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'reading-a-signal-record',
    title: 'How to read a signal record',
    summary: 'Understand risk levels, categories, and what a traceability score actually means.',
    tag: 'Guide',
    tone: 'blue',
    objectives: [
      'Read a signal record end to end',
      'Interpret risk level and category',
      'Understand what a traceability score does and does not claim',
    ],
  },
  {
    slug: 'spotting-rhetorical-techniques',
    title: 'Spotting rhetorical techniques',
    summary: 'A walkthrough of in-group framing, urgency appeals, and authority mimicry.',
    tag: 'Explainer',
    tone: 'purple',
    objectives: [
      'Recognize common persuasion techniques',
      'Separate technique from truth value',
      'Apply the taxonomy to real examples',
    ],
  },
  {
    slug: 'provenance-and-evidence-chains',
    title: 'Provenance and evidence chains',
    summary: 'Why traceability is the backbone of credible signal intelligence.',
    tag: 'Explainer',
    tone: 'green',
    objectives: [
      'Follow an evidence chain from claim to source',
      'Judge the strength of a provenance trail',
      'Spot where a chain breaks down',
    ],
  },
  {
    slug: 'classroom-toolkit',
    title: 'Classroom toolkit',
    summary: 'Lesson plans and exercises for teaching media literacy with HSI data.',
    tag: 'Educators',
    tone: 'orange',
    objectives: [
      'Plan a media-literacy lesson around real records',
      'Run a guided evidence-evaluation exercise',
      'Assess student understanding fairly',
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
