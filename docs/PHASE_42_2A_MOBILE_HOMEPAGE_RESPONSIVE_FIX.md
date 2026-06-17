# Phase 42.2A — Mobile Homepage UI/UX Responsive Fix

Homepage responsive UI only. No changes to RBAC, Auth, CMS, DB, Supabase, source
ingestion, compliance, billing, or Stripe. Mobile-first Tailwind tuning across the
hero + home components; reduced-motion behavior unchanged.

Target widths: 320 / 360 / 375 / 390 / 414 / 430 / 768 px.

## Fixes by area

1. **Hero layout** — tighter mobile rhythm: hero padding `py-10 sm:py-14 lg:py-24`, grid `gap-8 lg:gap-12`, copy `space-y-5 sm:space-y-6`, hero side padding `px-5 sm:px-6`. On mobile the copy + CTAs come first, the globe sits directly beneath as the visual anchor. The hero `<section>` keeps `overflow-hidden`, so the globe's glow/pulses can't cause horizontal scroll.
2. **Mobile globe** — globe container capped: `max-w-[330px] sm:max-w-[440px] lg:max-w-none`, centered (`mx-auto`), with reduced `min-h` (`260px` → `360px` → `460px`). HUD cards are now responsive: **1 card below 390px**, **2 cards 390–639px** (Sources today + Traceability — the most compact pair, both on the left so nothing overlaps), and **all 4 at `sm`+**. Reduced-motion still stops rotation/packets/hotspots/float.
3. **Signal ticker** — label and marquee **stack on mobile** (`flex-col sm:flex-row`); the label is `w-fit`; the marquee keeps `overflow-hidden` + edge fades, so it never breaks the layout or overflows.
4. **Metrics** — 2-column grid on mobile (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`), equal-width cards; metric value scales `text-h5 sm:text-h4` to avoid cramped type; the sparkline is hidden below 360px (`hidden min-[360px]:block`) so the value/delta stay aligned on the narrowest screens.
5. **How it works** — cards stack full-width on mobile (base 1-col grid), consistent `p-5` padding and icon alignment retained.
6. **Dashboard preview** — tighter mobile padding (`p-3 sm:p-4`); the dense narrative **heatmap is hidden below `sm`** (`hidden sm:block`) to cut density; the line chart, risk donut, traceability gauge, and alerts stack as readable cards.
7. **Footer** — already stacks to a single column on mobile (`md:grid-cols-2` base) with the bottom bar `flex-col sm:flex-row`; the brand wordmark now scales down on mobile.
8. **Header** — the public header shows logo + menu on mobile (nav/CTA live in the sheet); the brand wordmark is smaller/tighter on mobile (`text-[11px] tracking-[0.1em] sm:text-[13px] sm:tracking-[0.18em]`) to prevent crowding/overflow at 320px. No horizontal scroll.

## Accessibility / reduced motion
Unchanged and intact: all animations remain gated on `useReducedMotion`; the responsive classes only affect layout/visibility, not motion. Hidden HUD cards/heatmap reduce density without removing semantic content elsewhere.

## No horizontal overflow
The hero `<section>` and the ticker marquee both clip with `overflow-hidden`; the globe is width-capped and centered; right-edge HUD cards only appear at `sm`+. No element extends past the viewport at any target width.

## Verification
- Typecheck (`apps/web`): clean.
- Full test suite: green (no test files changed).
- `next build`: exit 0; homepage route size unchanged (className-only edits).
- **Mobile screenshot review:** not capturable in this environment (no browser runner) — verify on a preview deploy at the target widths (iPhone SE 375, iPhone 14/15 390, 14 Pro Max 430, common Android 360/412).

## Addendum (42.2B) — section balance + quantum core

Two follow-up polish items, same constraints (homepage UI only; no RBAC/Auth/CMS/DB/etc.).

### 1. "Latest Public Signals + Why It Matters" dead-space fix
The right column previously had empty vertical space under the CTA on desktop. Rebalanced (Option B):
- The section grid is now `items-stretch` and both columns are `h-full`, so the left feed card and the right panel are **equal height** (no dead column).
- The right column is now a richer bordered **panel** (`rounded-card border bg-surface/40 p-5 sm:p-6`, `flex flex-col`) containing: eyebrow + heading, the four "why" points, a row of **three proof-point chips** (96.3% Traceable · 100% Human-reviewed · 24.7k Live sources), a compact **Evidence chain** traceability diagram, and the CTA pinned to the bottom (`mt-auto`).
- New component `components/home/EvidenceChain.tsx`: Signal → Source → Analysis → Review → Published, with a single restrained pulse travelling the chain. Reduced motion freezes it to a static, legible diagram. Horizontally scrollable so it never overflows on mobile; the whole panel stacks above the feed on mobile (base 1-col grid).

### 2. HeroNetworkGlobe quantum core
The globe centre was empty. Added a subtle, intelligence-grade **central quantum core**:
- A luminous nucleus (`hsi-core-nucleus` radial gradient) over a soft core glow (`hsi-core-glow`), with a gentle expanding pulse ring (reduced-motion → static nucleus, no pulse).
- Three tilted **electron orbits** (`Orbit` helper) at 0°/60°/120°, counter-rotating at different speeds; reduced motion renders them as static tilted rings (no spin).
- The core is **wired into the network**: faint core-link lines run from the centre to four nodes, and **signal packets emit from the core outward** along those links, so packets visibly originate from / sync with the central core. The core sits outside the spinning cage so it stays centred and stable while the globe rotates. All motion gated on `useReducedMotion`; no neon/crypto/gaming aesthetic.

## Files changed
- `app/(marketing)/page.tsx` — hero spacing + globe sizing/anchor + ticker section padding; **Why-It-Matters panel rebalance + proof chips + evidence chain**.
- `components/home/HeroNetworkGlobe.tsx` — responsive HUD card visibility; **central quantum core + electron orbits + core-emitted packets**.
- `components/home/EvidenceChain.tsx` — **new**: compact traceability diagram for the Why panel.
- `components/home/LiveSignalsFeed.tsx` — **`h-full`** so the left card matches the right panel height.
- `components/home/SignalTicker.tsx` — stacked label on mobile.
- `components/home/AnimatedMetric.tsx` — responsive value size + sparkline visibility.
- `components/home/MissionControlPreview.tsx` — mobile padding + heatmap hidden < sm.
- `packages/ui/src/navigation.tsx` — responsive brand wordmark.
