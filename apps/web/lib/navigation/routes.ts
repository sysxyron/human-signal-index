// =============================================================================
// HSI — central route registry (Post-V1 navigation audit).
//
// One source of truth for every in-app route. Use ROUTES.* instead of hardcoded
// path strings so navigation can be validated against the filesystem by
// `apps/web/scripts/route-audit.ts` and never silently drifts.
//
// CLIENT-SAFE: plain string constants, no imports. Importable from server
// components, client components, the sidebar, and the audit script alike.
//
// Every value here MUST correspond to a real `page.tsx` on disk under
// `apps/web/app/` (the audit script fails CI otherwise).
// =============================================================================

export const ROUTES = {
  // ---- top level ----------------------------------------------------------
  home: '/',
  dashboard: '/dashboard',
  signIn: '/sign-in',

  // ---- Operations ---------------------------------------------------------
  sourceRegistry: '/dashboard/source-registry',
  signalIntake: '/dashboard/signal-intake',
  evidenceVault: '/dashboard/evidence-vault',
  operations: '/dashboard/operations',
  signals: '/dashboard/signals',
  sources: '/dashboard/sources',
  watchlists: '/dashboard/watchlists',
  providers: '/dashboard/providers',

  // ---- Intelligence -------------------------------------------------------
  rhetoricClassifier: '/dashboard/rhetoric-classifier',
  riskScoring: '/dashboard/risk-scoring',
  traceabilityEngine: '/dashboard/traceability-engine',
  intelligenceOps: '/dashboard/intelligence/operations',
  intelligenceDecisions: '/dashboard/intelligence/decisions',

  // ---- Workflow -----------------------------------------------------------
  // Canonical review hub is /dashboard/review (the real Phase-6 queue).
  // /dashboard/review-queue is a back-compat redirect to it.
  reviewQueue: '/dashboard/review',
  reviewQueueLegacy: '/dashboard/review-queue',
  reviewEvidence: '/dashboard/review/evidence',
  alerts: '/dashboard/alerts',
  counterNarrative: '/dashboard/counter-narrative',
  publicReports: '/dashboard/public-reports',
  curation: '/dashboard/curation',

  // ---- Publishing (Phase 19) ---------------------------------------------
  publishing: '/dashboard/publishing',
  publishingNew: '/dashboard/publishing/new',
  publishingReview: '/dashboard/publishing/review',
  publishingRetractions: '/dashboard/publishing/retractions',

  // ---- WorldForge ---------------------------------------------------------
  worldforge: '/dashboard/worldforge',
  worldforgeSimulations: '/dashboard/worldforge/simulations',
  worldforgeScenarios: '/dashboard/worldforge/scenarios',
  worldforgeTimelines: '/dashboard/worldforge/timelines',
  worldforgeDependencyGraph: '/dashboard/worldforge/dependency-graph',
  worldforgeCounterfactuals: '/dashboard/worldforge/counterfactuals',
  worldforgeProvenance: '/dashboard/worldforge/provenance',
  worldforgeUniverses: '/dashboard/worldforge/universes',
  worldforgeResearch: '/dashboard/worldforge/research',

  // ---- Simulation / Decisions (Phase 12-13) ------------------------------
  simulation: '/dashboard/simulation',
  simulationCompare: '/dashboard/simulation/compare',
  decisionsExplorer: '/dashboard/decisions/explorer',

  // ---- Forecasting (Phase 21) --------------------------------------------
  forecasts: '/dashboard/forecasts',
  scenarios: '/dashboard/scenarios',
  warnings: '/dashboard/warnings',

  // ---- Collective intelligence (Phase 20) --------------------------------
  investigations: '/dashboard/investigations',
  consensus: '/dashboard/consensus',
  debates: '/dashboard/debates',
  contributors: '/dashboard/contributors',

  // ---- Trust, Outcomes & Governance (Phase 15-17) ------------------------
  outcomes: '/dashboard/outcomes',
  governance: '/dashboard/governance',
  trust: '/dashboard/trust',
  trustHistory: '/dashboard/trust/history',
  trustPublic: '/dashboard/trust/public',
  trustDrift: '/dashboard/trust/drift',
  trustProposals: '/dashboard/trust/proposals',
  calibration: '/dashboard/calibration',

  // ---- Executive Command Center (Phase 22) -------------------------------
  executive: '/dashboard/executive',
  priorities: '/dashboard/priorities',
  risks: '/dashboard/risks',
  opportunities: '/dashboard/opportunities',
  briefings: '/dashboard/briefings',
  execGovernance: '/dashboard/exec-governance',

  // ---- Administration / IAM (Phase 24B) ----------------------------------
  adminUsers: '/dashboard/admin/users',
  adminTeams: '/dashboard/admin/teams',
  adminApplications: '/dashboard/admin/applications',
  adminTesters: '/dashboard/admin/testers',
  adminAccessLogs: '/dashboard/admin/access-logs',

  // ---- Contributor Intelligence Network (Phase 25) -----------------------
  missions: '/dashboard/missions',
  badges: '/dashboard/badges',
  leaderboard: '/dashboard/leaderboard',
  governanceQueue: '/dashboard/governance-queue',
  onboardingPurpose: '/dashboard/onboarding/purpose',

  // ---- Account / System ---------------------------------------------------
  profile: '/dashboard/profile',
  security: '/dashboard/security',
  securityMonitor: '/dashboard/security-monitor',
  settings: '/dashboard/settings',

  // ---- Launch / Beta (Phase 23) ------------------------------------------
  launch: '/dashboard/launch',
  launchIssues: '/dashboard/launch/issues',
  testerOnboarding: '/dashboard/tester-onboarding',

  // ---- Human Operations OS (Phase 24) ------------------------------------
  operationsCenter: '/dashboard/operations-center',
  workloads: '/dashboard/workloads',
  myWork: '/dashboard/my-work',
  teams: '/dashboard/teams',
  contributorOps: '/dashboard/contributor-ops',
  executiveOperations: '/dashboard/executive-operations',
  operationsAlerts: '/dashboard/operations-alerts',

  // ---- Public trust & security programs (Phase 23B) ----------------------
  trustCenter: '/trust',
  vulnerabilityDisclosure: '/security/vulnerability-disclosure',
  responsibleDisclosure: '/security/responsible-disclosure',
  securityAwareness: '/security-awareness',
  whistleblower: '/whistleblower',
  reportConfidentially: '/report-confidentially',
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Every registered route path (deduped) — consumed by the route-audit script. */
export const ALL_ROUTES: string[] = Array.from(new Set(Object.values(ROUTES)));

/** Routes that are intentionally redirects/aliases, not standalone pages. */
export const REDIRECT_ROUTES: string[] = [ROUTES.reviewQueueLegacy];
