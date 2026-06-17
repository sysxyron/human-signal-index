# Phase 42 — Homepage Future Intelligence Experience

Homepage UX only. No changes to RBAC, Auth, CMS engine, Signals, Database,
Middleware, or Supabase. The platform-owned (bespoke) guard from 41B.3A is
preserved — the template always renders; CMS fills only approved hero slots.

## Before / after

| | Before | After |
| --- | --- | --- |
| Hero visual | small static `GlobeHero` sphere | `SignalNetwork` — animated node-link intelligence graph (hub + 2 rings, glowing nodes, drawing links, travelling signal pulses, slow scaffold rotation) |
| Metrics | static `MetricCard` numbers | `AnimatedMetric` — count-up on scroll, weekly delta chips, trend sparkline, live pulse dot |
| Live data | none | "Latest Public Signals" feed (real published intelligence when available, else seeded demo) |
| Dashboard feel | a single preview card | `MissionControlPreview` — terminal-framed operational mock: signal-activity line chart, risk donut, traceability gauge, narrative heatmap, alerts |
| Differentiator | a bullet list | `TraceabilityPipeline` — animated Signal → Evidence → Analysis → Human Review → Publication |
| Human-in-loop | implicit | dedicated "AI assists. Humans decide." section (evidence review, governance, auditability, traceability) |
| Above footer | nothing | "Current Platform Activity" animated metric strip |
| Motion | CSS only | Framer Motion (reveal-on-scroll, fade-ins, floating, glowing nodes, hover), reduced-motion aware |

## New dependency
`framer-motion@^11` added to `@hsi/web` (React 18 / Next 14 compatible).

## Files
- `components/home/motion.tsx` — `Reveal`, `RevealGroup`/`RevealItem`, `Floating` (reduced-motion aware).
- `components/home/SignalNetwork.tsx` — hero visualization (deterministic, decorative/aria-hidden).
- `components/home/AnimatedMetric.tsx` — count-up metric (+ `MetricSpec`).
- `components/home/LiveSignalsFeed.tsx` — live feed (+ `FeedItem`).
- `components/home/MissionControlPreview.tsx` — operational dashboard mock (+ `MissionControlData`).
- `components/home/TraceabilityPipeline.tsx` — animated pipeline.
- `components/home/HumanInLoop.tsx` — human-in-the-loop section.
- `components/home/PlatformActivity.tsx` — above-footer activity strip.
- `app/(marketing)/page.tsx` — reassembled around the new sections (CTAs, bespoke hero slots, AuthHashForwarder, CMS guard preserved).

## Requirement coverage
1. Hero redesign → `SignalNetwork`. 2. Animated metrics (count-up, trend, weekly delta, pulse) → `AnimatedMetric`. 3. Live signals feed (title/risk/category/time; real-or-demo) → `LiveSignalsFeed`. 4. Dashboard preview (activity chart, risk, traceability, heatmap, alerts) → `MissionControlPreview`. 5. Traceability pipeline → `TraceabilityPipeline`. 6. Human-in-the-loop → `HumanInLoop`. 7. Motion design via Framer Motion → `motion.tsx` + per-component. 8. Footer intelligence metrics → `PlatformActivity`. 9. Preserve backend → done (UX only).

## Performance impact
- The homepage is server-rendered on demand (it already read CMS via cookies, so it was dynamic). Heavy visuals are isolated **client islands**; the page shell + copy are server-rendered.
- Framer Motion adds ~JS to the client bundle for the homepage route only (see build output sizes). Animations use transform/opacity (GPU-friendly); reveal animations run once (`viewport={{ once: true }}`); the SVG hero uses a bounded node/link/pulse count.
- No layout-thrash animations (no width/height/top transitions); `animate-ping`/transform only.

## Accessibility review
- All motion respects `prefers-reduced-motion` (and the in-app Accessibility Center) via `useReducedMotion` — animations are skipped and final values render immediately.
- The hero visualization is purely decorative (`aria-hidden`); no information is conveyed by motion alone.
- Count-up metrics settle on the true value; reduced-motion shows it instantly.
- Semantic headings/sections retained; CTAs remain real links; keyboard focus + the global focus ring are unaffected.
- Color is not the only signal (labels accompany risk/severity dots).

## Screenshots
Not captured in this environment (no browser runner). The build registers the homepage route and all sections compile; visual QA should be done on a preview deploy. Suggested shots: hero network, animated metric strip, live feed, Mission Control preview, traceability pipeline, platform-activity strip.

## Verification
- `pnpm typecheck` (apps/web `tsc --noEmit`): clean.
- `pnpm test` (full `tsx --test` suite): green (see run).
- `pnpm build` (`next build`): exit 0 (see run).

## Notes / follow-ups
- Live feed uses published intelligence when present; true per-signal public feed would need an anon-safe read path (signals are auth-gated today).
- Metric values are representative demo figures with deltas; wiring to a live public stats endpoint is a follow-up (no anon stats endpoint today).
- `next lint` remains broken repo-wide (ESLint 9 vs Next 14.2.5), unrelated; typecheck + tests + build are the gates.
