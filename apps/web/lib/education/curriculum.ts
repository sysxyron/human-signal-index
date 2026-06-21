// =============================================================================
// HSI Phase 73.4 — Education curriculum (PURE data). Tracks and lessons for the
// Education Hub. Lessons are upcoming video content: no fake durations, no fake
// videos — every lesson is marked `coming_soon` with a clear placeholder.
// =============================================================================

export type LessonStatus = 'coming_soon';

export interface Lesson {
  title: string;
  summary: string;
  /** Estimated length is intentionally unset until real content exists. */
  estimatedLength: string | null;
  status: LessonStatus;
}

export interface Track {
  key: string;
  title: string;
  audience: string;
  lessons: Lesson[];
}

const lesson = (title: string, summary: string): Lesson => ({ title, summary, estimatedLength: null, status: 'coming_soon' });

export const TRACKS: Track[] = [
  {
    key: 'getting-started', title: 'Getting Started', audience: 'Everyone new to HSI',
    lessons: [
      lesson('What is Human Signal Index', 'An overview of HSI as a public-source intelligence and trust analysis platform.'),
      lesson('Platform Overview', 'A tour of the main areas: sources, signals, evidence, narratives, forecasts, and reports.'),
      lesson('Core Concepts', 'The vocabulary HSI uses, and how each concept relates to the others.'),
      lesson('Research Lifecycle', 'How work moves from a raw source to a reviewed, published finding.'),
      lesson('Understanding the Dashboard', 'How to read the dashboard and find what you need.'),
    ],
  },
  {
    key: 'researcher', title: 'Researcher Track', audience: 'Researchers and OSINT practitioners',
    lessons: [
      lesson('Adding Sources', 'How to add a public source and what metadata to capture.'),
      lesson('Source Discovery', 'Using the discovery and import tools to find and queue sources.'),
      lesson('Source Review', 'Reviewing candidate sources before they are activated.'),
      lesson('Evidence Collection', 'Capturing evidence with provenance back to the original passage.'),
      lesson('Investigations', 'Organizing related sources and evidence into an investigation.'),
    ],
  },
  {
    key: 'analyst', title: 'Analyst Track', audience: 'Analysts working with signals and narratives',
    lessons: [
      lesson('Signals', 'What a signal is and how signals are created and reviewed.'),
      lesson('Narratives', 'How narratives cluster related signals and evidence over the graph.'),
      lesson('Contradictions', 'Reading supporting and contradicting relationships between records.'),
      lesson('Forecasting', 'Recording forecasts and tracking their outcomes.'),
      lesson('Risk Analysis', 'How risk levels are assigned and explained.'),
    ],
  },
  {
    key: 'reviewer', title: 'Reviewer Track', audience: 'Reviewers and editors',
    lessons: [
      lesson('Review Queue', 'Working through items awaiting review.'),
      lesson('Validation', 'Checking evidence and provenance before approval.'),
      lesson('Publication Workflow', 'How reviewed findings are published.'),
      lesson('Corrections', 'Recording corrections to published material.'),
      lesson('Retractions', 'When and how a publication is retracted.'),
    ],
  },
  {
    key: 'intelligence-operations', title: 'Intelligence Operations', audience: 'Operations and command users',
    lessons: [
      lesson('Operations Center', 'Using the command center to see what needs attention.'),
      lesson('Global Map', 'Reading the geospatial intelligence layers.'),
      lesson('Executive Intelligence', 'Summary views for leadership and decision support.'),
      lesson('Early Warning', 'How thresholds surface emerging issues.'),
      lesson('Reporting', 'Producing and exporting structured reports.'),
    ],
  },
  {
    key: 'platform-administration', title: 'Platform Administration', audience: 'Administrators',
    lessons: [
      lesson('Roles', 'The role ladder and what each role can do.'),
      lesson('Permissions', 'How access is enforced across routes and data.'),
      lesson('Auditor', 'Running the platform self-check auditor.'),
      lesson('Source Management', 'Managing the source registry and geo activation.'),
      lesson('Platform Governance', 'Oversight, transparency, and accountability practices.'),
    ],
  },
];

export const TOTAL_LESSONS = TRACKS.reduce((n, t) => n + t.lessons.length, 0);
