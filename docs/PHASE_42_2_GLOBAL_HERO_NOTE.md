# Phase 42.2 — Global Intelligence Network Hero

Replaced the atom-style `SignalNetwork` hero with a world-scale `HeroNetworkGlobe`,
plus a horizontal "Latest Public Signals" ticker. Homepage UX only — no RBAC,
CMS, database, or auth changes.

## What shipped
- **`components/home/HeroNetworkGlobe.tsx`** (new): dark wireframe globe (latitudes + meridians) under a slow, restrained rotation; a network layer of **categorized nodes** (blue Verified, green Trusted source, orange Under review, red High risk, purple Influence activity) with soft pulses; **signal packets** travelling source→destination along connections with staggered timing; periodic **narrative hotspots** (glow → expand → fade); spherical shading for depth; and **4 floating HUD cards** (Sources today, Risk alert, Traceability 96.3%, Human review) that float gently and stay readable. Pure SVG + framer-motion — no WebGL/canvas. Decorative (`aria-hidden`).
- **`components/home/SignalTicker.tsx`** (new): continuous horizontal marquee of recent public signals (real published data when available, else seeded demo), placed above the metric cards, with edge fades.
- **`app/(marketing)/page.tsx`**: hero right column now renders `HeroNetworkGlobe` (dominant, ~min-h 460px on desktop); `SignalTicker` added above the metric strip. Hero copy, CTAs, metric cards, Mission Control preview, mission/why sections, traceability pipeline, human-in-loop, platform activity, and footer all preserved.
- Removed the old `SignalNetwork.tsx` (atom).

## Accessibility (Deliverable 9)
All motion is gated on `useReducedMotion` (honors `prefers-reduced-motion` and the in-app Accessibility Center). Reduced motion stops globe rotation, packet travel, hotspots, node pulses, HUD-card float, and the ticker scroll (ticker becomes a static scrollable row) — layout is fully preserved. The globe is decorative (`aria-hidden`); category color is paired with the node legend semantics, not color-only meaning.

## Performance (Deliverable 10)
Transform/opacity-only animations (GPU-friendly); bounded node/connection/packet/hotspot counts; reveal/rotation use a single transformed group. framer-motion was already a dependency, so the route bundle is essentially unchanged: `/` = 47.6 kB (154 kB First Load JS) vs 46.8 kB / 153 kB before. No new heavy dependencies.

## Verification
- Typecheck (`apps/web`): clean. Tests: 2655/2655 pass. Build: exit 0.
- No RBAC / CMS / database / auth changes.
