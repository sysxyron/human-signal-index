# Phase 42.3 — Homepage Intelligence Experience Final Polish

Homepage UX only. No changes to RBAC, IAM, auth, middleware, CMS, database,
Supabase, source ingestion, cron, billing, Stripe, or compliance. This is the
Phase 42 homepage checkpoint.

## 1. Enlarged hero globe
- The globe SVG now scales up on desktop: `lg:scale-[1.26] xl:scale-[1.32]` (≈26–32% larger), with `lg:max-w-none` so it fills the column before scaling.
- The hero grid gives the globe the dominant side (`lg:grid-cols-[1fr_1.08fr]`), with a taller well (`lg:min-h-[540px]`, `lg:py-28`) and the globe centred in it.
- Scaling is applied to the **SVG only**, not the component box — the floating HUD cards stay anchored to the unscaled box, so they remain on-screen and never drift off the edge. Subtle edge bleed is allowed and is clipped by the hero `<section>` `overflow-hidden`; no horizontal page overflow. Tablet/mobile keep their capped widths (`max-w-[330px] sm:max-w-[440px]`).

## 2. Depth in the globe
`HeroNetworkGlobe` is now layered back-to-front for a command-center read:
- **Atmospheric glow + rim halo** — `hsi-globe-glow` (larger ambient) plus a new `hsi-atmosphere` rim gradient.
- **Distant background node field** — 16 dim, small, blurred nodes (`hsi-bg-blur`), drawn *static behind* the rotating cage → parallax depth.
- **Midground** — the rotating wireframe cage, categorized nodes, and connection lines, now **stronger but restrained** (gradient stroke `hsi-conn`, width 1.2, 0.85 opacity).
- **Depth / fog layer** — a `hsi-fog` haze radial over the lower front for atmosphere.
- **Foreground nodes** — 4 bright, larger nodes with soft glow + a white specular highlight, drawn on top (near depth), two with a gentle pulse.

## 3. Refined quantum / processing core
- Re-read as an **intelligence processing nucleus**, not a literal atom: a slow dashed **scanner ring**, three tilted **dashed data rings** (was solid ellipses) with small data nodes riding them, a faint concentric ring, and a luminous nucleus with a soft pulse.
- The core stays **wired into the network**: faint core-link lines to four nodes and **signal packets that emit from the core outward** along them, so packets visibly sync with / originate from the core. The core sits outside the spinning cage so it stays centred/stable.
- Fully reduced-motion aware: scanner ring, data-ring spin, core packets, and the nucleus pulse all freeze; the static rings/nucleus remain for legibility.

## 4. Strengthened "Latest Public Signals" section
- The right "Why It Matters" column is a full-height panel that **balances the signal feed** (section `items-stretch`, both columns `h-full`).
- Compact **traceability chain** (`EvidenceChain`): **Signal → Evidence → Analysis → Human Review → Publication**, with a single restrained travelling pulse (reduced motion → static). Horizontally scrollable so it never overflows on mobile.
- **Proof chips**: `96.3% Traceable` · `100% Human Reviewed` · `24.7k Sources`.
- CTA anchored to the bottom (`mt-auto`); no dead vertical space.

## 5. Subtle live activity pulses
- New `LiveActivityPulse` console line at the foot of the signal feed: cycles **New signal detected → Evidence linked → Review completed → Source verified**, one line at a time with a gentle cross-fade and a colored pulse dot, plus a `live · ops` tag. Bloomberg/ops-console tone, not a social feed.
- SSR-stable (always starts at index 0 → no hydration drift). Reduced motion → static first line, no cycling, no ping.

## 6. Header micro-polish
- Public desktop nav links get an **animated underline** via an absolute `after:` pseudo-element (`scale-x` 0→1 on hover, `transition-transform`). The active link keeps its electric color + glow and shows a full underline (`after:scale-x-100`). The underline is absolutely positioned, so there is **no layout shift**.

## 7. Mobile QA (target widths 320 / 360 / 375 / 390 / 414 / 430 / 768)
- Globe scaling is desktop-only (`lg:`/`xl:`); mobile keeps capped widths and ≤2 HUD cards (1 below 390px) → no overlapping labels, globe stays readable.
- Hero `<section>` and ticker marquee clip with `overflow-hidden`; evidence chain and signal ticker scroll horizontally → no horizontal page overflow.
- Why-It-Matters panel stacks above the feed (base 1-col grid); proof chips are a 3-col grid that fits ≥320px; cards are not cramped.

## 8. Accessibility
- Every animation (globe rotation/packets/hotspots/core, HUD float, evidence-chain pulse, live-activity cycling, nav underline transition) respects `prefers-reduced-motion` (via the Accessibility Center + OS) — motion freezes/simplifies, content is preserved.
- The globe remains decorative (`aria-hidden`). Keyboard navigation is unchanged (nav underline is hover/active styling only; links keep focus styles). Text/contrast tokens unchanged.

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked; node:test `ℹ` summaries summed): **2655 / 2655 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"** (the `/` `cookies` dynamic-server line is expected — `/` is a dynamic route).
- **Mobile screenshot review:** not capturable in this environment (no browser runner) — verify on a preview deploy at the target widths.

## Files changed
- `app/(marketing)/page.tsx` — hero grid/well for the enlarged globe; proof chip labels.
- `components/home/HeroNetworkGlobe.tsx` — desktop scale-up; background/foreground node layers; atmosphere + fog; stronger connections; refined processing core.
- `components/home/EvidenceChain.tsx` — relabelled chain (Signal → Evidence → Analysis → Human Review → Publication); no-wrap labels.
- `components/home/LiveActivityPulse.tsx` — **new**: ops-console live activity line.
- `components/home/LiveSignalsFeed.tsx` — embeds the live activity console line.
- `packages/ui/src/navigation.tsx` — animated underline on public desktop nav links.

---

# Phase 42.3A — Mobile Signal Sections Polish

Homepage mobile CSS/layout only. No changes to RBAC, auth, CMS, DB, source
ingestion, billing, Stripe, or compliance. Shared `@hsi/ui` badge components were
**not** modified — badge sizing on the homepage is done with a transform wrapper
(the `cn` helper is a plain join, not tailwind-merge, so padding overrides via
className would be unreliable).

## 1. Latest Public Signals card (mobile)
- Each row now **stacks on mobile** (`flex-col`) and reverts to the original
  horizontal layout at `sm+` (`sm:flex-row sm:items-center`): **title first**, then
  a meta row with **badge + category + time** underneath. The leading badge is
  desktop-only (`hidden sm:inline-flex`); the mobile badge lives in the meta row.
- **Smaller badges on mobile** via an `origin-left scale-[0.85]` (risk/category)
  and `scale-90` (category tag) wrapper — reverts to `sm:scale-100`. No change to
  the shared badge component.
- Titles wrap cleanly with `line-clamp-2` on mobile (no awkward mid-word wrap),
  `sm:truncate` on desktop.
- Row spacing increased (`py-2.5 → py-3`, `gap-2` stack gap); the leading `Radio`
  icon keeps its place in the header (no longer floats next to a cramped row).
- Footer console (`LiveActivityPulse`): added `gap-3` + `whitespace-nowrap` on the
  `live · ops` tag so the activity label and the tag stay cleanly aligned and never
  collide; the left label truncates.

## 2. Why It Matters / Evidence Chain card (mobile)
- **Proof chips**: `grid-cols-1` below 390px, `grid-cols-3` at `≥390px`. In the
  1-col state each chip is a tidy `value ↔ label` row (`flex justify-between`),
  switching to the stacked centered layout at `≥390px`.
- **Evidence chain**: stays horizontally scrollable (`overflow-x-auto`); icon tiles
  enlarged (`h-8 w-8 → h-9 w-9`, icon `h-4 → h-[18px]`) and spacing increased
  (gap `1 → 1.5`, connectors `w-5 → w-6`), so it no longer feels cramped.
- The **"end to end"** label is hidden on mobile (`hidden sm:block`).
- **"Read our mission"** CTA is full-width on mobile — the anchor is now `block` so
  the `w-full sm:w-auto` button actually fills the column.
- No horizontal page overflow: the chain scrolls within its card; chips and rows
  fit within the viewport at all target widths.

## Verification (42.3A)
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2655 / 2655 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**.
- Target widths 320 / 360 / 375 / 390 / 414 / 430 — verify on a preview deploy
  (browser screenshots aren't capturable here). Reduced-motion behavior preserved
  (no animation logic changed; the live pulse + chain pulse remain gated on
  `useReducedMotion`).
