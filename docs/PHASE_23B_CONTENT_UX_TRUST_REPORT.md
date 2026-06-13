# Phase 23B — Content, UX, Trust & Security Hardening

**Status:** ✅ Complete · typecheck green · build green (114 pages, +6) · tests green
(2,076 / 2,076, 0 fail) · route audit green · smoke test green. No changes to
intelligence engines, governance, RBAC, middleware, evidence/simulation, database
schemas, or audit logging — this phase is content, UX, trust, accessibility, and
public-program work only.

---

## 1. Language findings

The dashboard copy written in earlier phases was already mostly plain; the
AI-flavored language concentrated in a few public strings and compound phrases.

**Rewritten (Deliverables 1–2, hyphen reduction):**
- Homepage feature copy:
  - "Link every insight back to … cryptographic provenance" → "Link every finding
    back to the original passages and timestamps, with a record you can verify."
  - "actionable, review-ready risk levels with transparent explanations" → "clear
    risk levels that reviewers can act on, each with a plain explanation."
  - "public-safe reports … evidence-based counter-narratives" → "reports,
    explainers, and counter-narratives the public can read and check."
- All six new pages were authored in plain English from the start (no
  "signal-driven", "evidence-backed", "human-governed", "cross-domain", etc.).

**Approach.** Replaced buzzword compounds with verbs and concrete nouns
("conclusions supported by evidence", "review by people", "analysis across
sources"). Where existing dashboard copy was already specific and plain, it was
left unchanged to avoid churn and risk.

## 2. Grammar findings

- American English throughout; sentence-case headings; serial clarity.
- Apostrophes/quotes encoded as HTML entities in JSX to avoid `react/no-unescaped`
  issues and render correctly.
- Consistent terminology (see §15). No AI-style triplet repetition in new copy.

## 3. Accessibility findings

**Fixed:**
- TopNav search input had no accessible name → added `type="search"`,
  `aria-label="Search signals and sources"`, and a `focus-visible` ring.
- Icon-only chrome controls already carry `aria-label` (notifications bell,
  dismiss, mark-read; the access-denied dismiss). New forms use visible `<label>`
  elements and descriptive placeholders.
- The `@hsi/ui` Button has a `focus-visible:ring-2 focus-visible:ring-electric/70`
  state, so keyboard focus is visible on every button/link-button.

**Recommendations (not blockers):**
- Associate form `<label>`s with inputs via `htmlFor`/`id` for the longest forms
  (confidential report, beta issue) — currently visible labels + placeholders.
- Run an automated `axe-core` pass and tune `text-muted` (#94A3B8 on dark) where it
  falls just under WCAG AA for small text.
- Add a "skip to content" link in the dashboard layout.

## 4. Trust improvements

- New **Trust & Transparency Center** (`/trust`): how we work (people decide,
  everything traces, decisions are recorded, evidence first) and our commitments
  (publication standards, security, your rights, transparency), with links to every
  reporting channel.
- Footer reorganized with a dedicated **Trust** and **Security & Reporting** column
  so these programs are reachable from every public page.

## 5. Security disclosure implementation

- **`/security/vulnerability-disclosure`** (Deliverable 8): scope, how to report,
  an explicit **safe-harbor** statement, out-of-scope testing, response timelines,
  coordinated-disclosure guidance, contact. Modeled on HHS VDP / CISA guidance.
- **`/security/responsible-disclosure`** (Deliverable 9): a five-step process,
  timelines, communication policy, expectations.
- **`/security-awareness`** (Deliverable 10): eight practical cards — phishing,
  social engineering, MFA, passwords, account protection, data handling, source
  protection, operational security.

## 6. Whistleblower implementation

- **`/whistleblower`** (Deliverable 11): what can be reported, how to prepare,
  evidence and privacy guidance, source protection, and an honest confidentiality
  notice.
- **`/report-confidentially`** (Deliverable 12): a confidential reporting workflow
  (category, description, evidence notes, optional file attach, optional contact).
  Inspired by SecureDrop / Hushline / SEC guidance. It states plainly: *"We take
  steps to protect sources and the information you submit, but no online system can
  guarantee complete anonymity."* It does **not** claim full anonymity.
- **Case tracking** (Deliverable 13): on submit, the reporter receives a
  `HSI-XXXX-XXXX` reference (ambiguous characters removed) they can save and use to
  check status. A status lookup validates the format and reports "received and
  awaiting human review." Governed placeholder — nothing is persisted or
  auto-actioned; humans review.

## 7. Navigation improvements (Deliverable 6)

Visible **labels** clarified; **route paths unchanged**:

| Before | After | Route (unchanged) |
| --- | --- | --- |
| Signal Intake | Signal Submission | `/dashboard/signal-intake` |
| Rhetoric Classifier | Rhetoric Analysis | `/dashboard/rhetoric-classifier` |
| Risk Scoring | Risk Assessment | `/dashboard/risk-scoring` |
| Traceability Engine | Evidence Trail | `/dashboard/traceability-engine` |

The route-audit and smoke test (which key on hrefs, not labels) confirm no
navigation target changed.

## 8. Empty state improvements (Deliverable 4)

`EmptyState` requires a meaningful `message` (callers already pass guidance such as
"The forecast worker generates forecasts … every 30 minutes" and "No items
awaiting executive review."). The shared component centers an icon + title +
guidance so no page shows a bare "No records found."

## 9. Error state improvements (Deliverable 5)

- `ErrorState` FORBIDDEN reworded from "Insufficient permissions / Your role does
  not have access" to **"You don't have access to this area — Your account doesn't
  currently have permission to open this. If you believe this is a mistake, contact
  an administrator to have your role updated."**
- AUTH_REQUIRED shows a sign-in prompt; DB errors render a readable message (never
  `[object Object]`, via `formatErrorMessage`).
- The role-denial bounce already shows the friendly `AccessDeniedNotice` (Phase
  22A) on `/dashboard`.

## 15. Copy consistency (Deliverable 15)

Canonical terms used across new/edited copy:
**Signal** (a captured public item), **Evidence** (archived source material),
**Investigation** (a research thread), **Report / Publication** (a published
finding; "report" = the artifact, "publication" = its lifecycle), **Review**
(human evaluation step), **Decision** (a recorded human choice). New pages use
these consistently; no conflicting synonyms introduced.

---

## 10. Verification results

| Gate | Result |
| --- | --- |
| `tsc --noEmit -p apps/web` | ✅ 0 errors |
| `pnpm --filter web build` | ✅ Compiled, **114 pages** (+6 public pages) |
| Full test suite | ✅ **2,076 / 2,076**, 0 fail (no engine changes) |
| `apps/web/scripts/route-audit.ts` | ✅ 131 pages, 0 missing |
| `scripts/production-smoke-test.ts` | ✅ 0 fail (route registry + nav targets PASS) |
| `pnpm --filter web lint` | ⚠️ pre-existing failure — `next lint` is incompatible with the repo's ESLint v9 flat config (`Unknown options: useEslintrc, …`). Not introduced by this phase; typecheck + build + tests are the gates. |

**Constraints honored:** no changes to intelligence engines, governance logic,
evidence/simulation behavior, RBAC, middleware, the publication workflow, database
schemas, or audit logging. All edits are content, UX copy, navigation labels,
shared state copy, accessibility attributes, and new public pages.

### Files added
- `app/(marketing)/trust/page.tsx`
- `app/(marketing)/security/vulnerability-disclosure/page.tsx`
- `app/(marketing)/security/responsible-disclosure/page.tsx`
- `app/(marketing)/security-awareness/page.tsx`
- `app/(marketing)/whistleblower/page.tsx`
- `app/(marketing)/report-confidentially/page.tsx`
- `components/security/ConfidentialReportForm.tsx`
- `docs/PHASE_23B_CONTENT_UX_TRUST_REPORT.md`

### Files modified
- `packages/ui/src/navigation.tsx` — sidebar labels, footer columns, TopNav search a11y
- `apps/web/components/signals/states.tsx` — friendlier FORBIDDEN copy
- `apps/web/app/(marketing)/page.tsx` — homepage language cleanup
- `apps/web/lib/navigation/routes.ts` — registry entries for the new public routes
