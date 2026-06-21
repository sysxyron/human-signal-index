// =============================================================================
// HSI Phase 73.4 — Documentation content (PURE data). Plain-language reference
// for the public docs portal. No marketing language, no hype, no fabricated
// metrics or APIs. Sections marked `comingSoon` are clearly upcoming.
// =============================================================================

export interface DocSection {
  heading: string;
  body?: string[];
  bullets?: string[];
  comingSoon?: boolean;
}

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  intro: string;
  sections: DocSection[];
}

const concepts: DocPage = {
  slug: 'concepts', title: 'Core Concepts',
  description: 'Plain-language definitions of the core concepts in Human Signal Index: sources, signals, evidence, narratives, forecasts, review, and transparency.',
  keywords: ['concepts', 'definitions', 'source', 'signal', 'evidence', 'narrative', 'forecast', 'trust', 'transparency'],
  intro: 'These are the building blocks of HSI. Each term has a specific, consistent meaning across the platform.',
  sections: [
    { heading: 'Source', body: ['A public origin of information that HSI monitors — a website, feed, channel, document, or organization. Sources are added and reviewed by people; nothing is collected without a human-added source.'] },
    { heading: 'Signal', body: ['A captured observation from a source: a claim, post, or change worth tracking. Signals are reviewed before they inform any published conclusion.'] },
    { heading: 'Evidence', body: ['Material that supports or contradicts a claim, linked back to its original passage and timestamp so it can be verified.'] },
    { heading: 'Narrative', body: ['A cluster of related signals, evidence, and sources that form a recognizable storyline. Narratives are built from real relationships in the evidence graph, not inferred by a model.'] },
    { heading: 'Forecast', body: ['A recorded prediction with a resolution date. Forecasts are tracked against outcomes so accuracy and calibration can be measured over time.'] },
    { heading: 'Investigation', body: ['A workspace that organizes related sources and evidence around a question or event.'] },
    { heading: 'Review', body: ['Human evaluation of a signal, evidence item, or finding before it is approved or published. Review is required; the platform does not publish on its own.'] },
    { heading: 'Publication', body: ['A reviewed finding made available with its citations attached.'] },
    { heading: 'Retraction', body: ['A withdrawal of a publication. Retractions are recorded openly rather than removed quietly.'] },
    { heading: 'Transparency', body: ['The practice of showing how a conclusion was reached: its sources, evidence, review, and any corrections.'] },
    { heading: 'Trust', body: ['A recorded, explainable measure of a source’s reliability. Trust is not a hidden score and is not a claim that something is true.'] },
  ],
};

const workflow: DocPage = {
  slug: 'workflow', title: 'How Work Flows Through HSI',
  description: 'The HSI workflow from source to publication, with provenance and traceability preserved at every step.',
  keywords: ['workflow', 'pipeline', 'provenance', 'traceability', 'review', 'publication'],
  intro: 'Work moves through a consistent path. Every step keeps a record back to the original source.',
  sections: [
    { heading: '1. Source', body: ['A person adds a public source and reviews it before it is activated.'] },
    { heading: '2. Signal', body: ['Observations from the source become signals, each reviewable on its own.'] },
    { heading: '3. Evidence', body: ['Evidence is attached to claims and linked to the exact passage it came from.'] },
    { heading: '4. Narrative', body: ['Related signals and evidence cluster into narratives over the evidence graph.'] },
    { heading: '5. Forecast', body: ['Where appropriate, a forecast is recorded with a resolution date for later evaluation.'] },
    { heading: '6. Review', body: ['A reviewer validates the evidence and provenance before anything is published.'] },
    { heading: '7. Publication', body: ['The reviewed finding is published with its citations. Corrections and retractions are tracked openly.'] },
    { heading: 'Provenance and traceability', body: ['At each step the record links back to its origin, so any published conclusion can be traced to the source passages behind it.'] },
  ],
};

const methodology: DocPage = {
  slug: 'methodology', title: 'Methodology',
  description: 'HSI methodology: evidence-first design, provenance, corrections, forecast accountability, and human review.',
  keywords: ['methodology', 'evidence', 'trust', 'forecast', 'review', 'transparency', 'provenance'],
  intro: 'HSI is built around evidence and human judgment. It does not claim to detect truth, and it does not replace analysts.',
  sections: [
    { heading: 'Evidence methodology', body: ['Findings are grounded in evidence that links back to its source passage. Claims without traceable evidence are not treated as established.'] },
    { heading: 'Trust methodology', body: ['Source trust is recorded with an explanation. It reflects observed reliability over time, not a verdict on any single claim, and it is never a hidden score.'] },
    { heading: 'Forecast methodology', body: ['Forecasts are recorded before outcomes are known and evaluated against reality afterward, so accuracy and calibration can be measured rather than assumed.'] },
    { heading: 'Review methodology', body: ['Human reviewers evaluate signals, evidence, and findings. Review is required before publication.'] },
    { heading: 'Transparency methodology', body: ['Sources, evidence, corrections, and forecast outcomes are made visible so others can check the work. Corrections are tracked; nothing is quietly edited.'] },
  ],
};

const api: DocPage = {
  slug: 'api', title: 'API',
  description: 'Human Signal Index API reference. Public API access is under development.',
  keywords: ['api', 'developers', 'authentication', 'rate limits', 'endpoints', 'webhooks', 'sdk'],
  intro: 'Public API access is under development. This page outlines the planned structure. Nothing here describes available behavior yet.',
  sections: [
    { heading: 'Overview', body: ['A read-oriented API for published, public-safe intelligence is planned. Details will appear here as it becomes available.'] },
    { heading: 'Authentication', comingSoon: true, body: ['Token-based authentication is planned.'] },
    { heading: 'Rate Limits', comingSoon: true, body: ['Per-key rate limits are planned.'] },
    { heading: 'Endpoints', comingSoon: true, body: ['Endpoint definitions will be published when the API is available.'] },
    { heading: 'Webhooks', comingSoon: true, body: ['Outbound webhooks are planned.'] },
    { heading: 'SDKs', comingSoon: true, body: ['Official SDKs are planned.'] },
    { heading: 'Examples', comingSoon: true, body: ['Usage examples will be added alongside the endpoints.'] },
  ],
};

const developers: DocPage = {
  slug: 'developers', title: 'Developer Overview',
  description: 'High-level architecture of Human Signal Index for developers: frontend, backend, database, RBAC, pipelines, testing, and deployment.',
  keywords: ['developers', 'architecture', 'frontend', 'backend', 'database', 'rbac', 'testing', 'deployment'],
  intro: 'A high-level view of how HSI is built. No secrets, environment values, or credentials are listed here.',
  sections: [
    { heading: 'Frontend', body: ['A Next.js App Router application with a shared design system. Public marketing pages and the authenticated dashboard share components.'] },
    { heading: 'Backend', body: ['Server components and server actions handle data access. Read paths degrade gracefully and avoid throwing to the page.'] },
    { heading: 'Database', body: ['A managed Postgres database with row-level security. Schema changes are versioned as migrations.'] },
    { heading: 'RBAC', body: ['Roles are resolved from the database and enforced both in middleware (route gates) and navigation visibility.'] },
    { heading: 'Source pipeline', body: ['Sources are imported and reviewed, then monitored. Capture is human-gated; nothing activates automatically.'] },
    { heading: 'Research pipeline', body: ['Signals, evidence, narratives, and forecasts are linked through an evidence graph that records provenance.'] },
    { heading: 'Testing', body: ['Deterministic unit tests cover the pure logic layers; the suite runs in CI before deploy.'] },
    { heading: 'Deployment', body: ['The app deploys to a managed platform with preview and production environments.'] },
    { heading: 'Environment management', body: ['Configuration is provided through environment variables. Values and secrets are never published.'] },
  ],
};

const roles: DocPage = {
  slug: 'roles', title: 'Roles & Permissions',
  description: 'The Human Signal Index role ladder and what each role can do.',
  keywords: ['roles', 'permissions', 'researcher', 'analyst', 'reviewer', 'administrator', 'beta tester', 'organization'],
  intro: 'Access is organized by role. Higher roles include the abilities of lower ones.',
  sections: [
    { heading: 'Researcher', body: ['Adds sources, collects evidence, and works in investigations.'] },
    { heading: 'Analyst', body: ['Works with signals, narratives, contradictions, and forecasts.'] },
    { heading: 'Reviewer', body: ['Validates evidence and findings and handles the review queue, corrections, and retractions.'] },
    { heading: 'Administrator', body: ['Manages roles, sources, the platform auditor, and governance. Administrator is an internal role, not part of the public role ladder.'] },
    { heading: 'Beta Tester', body: ['An early-access participant who exercises features and provides feedback. Onboarded by email first.'] },
    { heading: 'Organization User', body: ['A member of an organization with access scoped to that organization.'] },
    { heading: 'Future Contributor', body: ['A planned role for broader public contribution under review. Details will follow.'] },
  ],
};

const faq: DocPage = {
  slug: 'faq', title: 'Frequently Asked Questions',
  description: 'Answers to common questions about Human Signal Index: what it is, how it differs from other tools, trust, contributions, commercial use, and the beta.',
  keywords: ['faq', 'questions', 'trust', 'contribute', 'commercial', 'beta', 'api', 'corrections', 'forecasts'],
  intro: 'Common questions about how HSI works and how to use it.',
  sections: [
    { heading: 'What is HSI?', body: ['A public-source intelligence and trust analysis platform. It helps people collect, verify, investigate, forecast, and publish open-source findings with evidence trails.'] },
    { heading: 'How is HSI different from ChatGPT?', body: ['HSI is not a chatbot and does not generate conclusions. It organizes real sources and evidence, and people review findings before publication.'] },
    { heading: 'How is HSI different from social media?', body: ['HSI is a research and review environment, not a feed. The focus is provenance and evidence, not engagement.'] },
    { heading: 'How is HSI different from traditional OSINT tools?', body: ['HSI adds a review workflow, an evidence graph that records relationships, forecast accountability, and transparent corrections.'] },
    { heading: 'How does trust work?', body: ['Trust is a recorded, explainable measure of a source’s reliability over time. It is not a hidden score and not a claim that any single item is true.'] },
    { heading: 'Can I submit sources?', body: ['Yes. Signed-in users can submit a source or signal for review; submissions enter a review queue.'] },
    { heading: 'Can I contribute?', body: ['Contribution is expanding through roles and the beta program. A broader public contributor role is planned.'] },
    { heading: 'Can I use HSI commercially?', body: ['Organizations can request a demo to discuss access. Commercial terms are handled case by case.'] },
    { heading: 'How are corrections handled?', body: ['Corrections are recorded openly and linked to the affected publication rather than edited quietly.'] },
    { heading: 'How are forecasts evaluated?', body: ['Forecasts are recorded with a resolution date and scored against outcomes so accuracy and calibration can be measured.'] },
    { heading: 'How is transparency maintained?', body: ['Sources, evidence, corrections, and forecast outcomes are made visible so the work can be checked.'] },
    { heading: 'Can organizations request demos?', body: ['Yes. Use the demo request page to schedule a walkthrough.'] },
    { heading: 'Can developers access APIs?', body: ['Public API access is under development. See the API page for the planned structure.'] },
    { heading: 'How does the beta work?', body: ['Apply through the beta page. Applications are reviewed in batches and testers are onboarded by email.'] },
  ],
};

const changelog: DocPage = {
  slug: 'changelog', title: 'Changelog',
  description: 'Public changelog for the Human Signal Index platform.',
  keywords: ['changelog', 'releases', 'versions', 'updates'],
  intro: 'A summary of recent platform changes, drawn from the project phase documentation.',
  sections: [
    { heading: 'Phase 73.3 — Global Map Activation & Data Validation', body: ['Status: Complete. Added deterministic geo backfill (location registry and gazetteer), fixed MapLibre rendering, and added geospatial integrity checks to the platform auditor. No fabricated coordinates.'] },
    { heading: 'Phase 73.2 — Platform QA & Self-Check Auditor', body: ['Status: Complete. Added an admin platform self-check auditor with deterministic checks and a public-copy quality pass.'] },
    { heading: 'Phase 73.1 — Beta & Demo Conversion Pages', body: ['Status: Complete. Added the beta application and demo request pages with safe form handling.'] },
  ],
};

export const DOC_PAGES: DocPage[] = [concepts, workflow, methodology, api, developers, roles, faq, changelog];

export function getDocPage(slug: string): DocPage | undefined { return DOC_PAGES.find((p) => p.slug === slug); }

export const DOC_INDEX = DOC_PAGES.map((p) => ({ slug: p.slug, title: p.title, description: p.description }));

/** "Coming Soon" resource downloads (no fake PDFs). */
export const RESOURCES = [
  { title: 'Quick Start Guide', detail: 'A short orientation for new users.' },
  { title: 'Research Guide', detail: 'Adding sources, evidence, and investigations.' },
  { title: 'Analyst Guide', detail: 'Working with signals, narratives, and forecasts.' },
  { title: 'Reviewer Guide', detail: 'Validation, publication, corrections, and retractions.' },
  { title: 'Developer Guide', detail: 'Architecture overview and integration notes.' },
];
