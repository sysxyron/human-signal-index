# HSI Design System

Human Signal Index uses a dark, intelligence-themed "observatory" design system:
calm, premium, and legible, built to make complex provenance information readable
without sensationalism. The two reference images in
[`references/`](references/README.md) are the **visual source of truth**.

Tokens live in `apps/web/tailwind.config.ts` and `packages/ui`. Change values
there — never hardcode in feature code (see
[`../deployment/README.md`](../deployment/README.md) §14).

---

## 1. Color tokens

| Token | Hex | Use |
| --- | --- | --- |
| Background | `#050714` | App/page background. |
| Surface | `#0A0F1F` | Cards, panels, glassmorphism surfaces. |
| Primary | `#2563EB` | Primary actions, key emphasis. |
| Electric blue | `#3B82F6` | Links, focus, active states, data accents. |
| Risk red | `#EF4444` | High-risk badges/alerts. |
| Verified green | `#10B981` | Verified/approved/traceable states. |
| Accent purple | `#8B5CF6` | Secondary accents, AI/analysis highlights. |
| Text primary | `#F8FAFC` | Primary text. |
| Text secondary | `#94A3B8` | Secondary/meta text. |

## 2. Type scale

- **Font:** Inter (primary).
- **H1:** 56 / 40 / 34 px (desktop / tablet / mobile)
- **H2:** 40 / 32 / 28 px
- **H3:** 28 / 24 px
- **Body:** 16 / 18 px
- **Caption:** 12 px

## 3. Layout, spacing & radius

- Homepage max width: **1440px**; section container max width: **1180px**.
- **12-column** grid; glassmorphism surfaces over the dark background.
- Card radius **16px**; button radius **10px**; input radius **10px**.
- Spacing on a consistent scale (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64).

## 4. Component inventory

| Component | Notes |
| --- | --- |
| Buttons | Primary / secondary / ghost / destructive (10px radius). |
| Inputs & forms | Text, textarea, select, file upload (10px radius). |
| Cards / panels | Glassmorphism surfaces (16px radius). |
| Navigation | Top nav (public), sidebar (dashboard, 13 sections). |
| Tables / data grids | Signals, sources, reviews, alerts. |
| Risk badges | 5-level system (see §5). |
| Category tags | 36-category taxonomy chips (see §6). |
| Traceability viz | Signal → Evidence → Analysis → Source Trace (see §7). |
| Alerts / toasts | Severity-colored. |
| Modals / drawers | Review, evidence preview, escalation. |
| Charts | Volume, risk distribution, category heatmap. |
| Badges/labels | Status (intake/in-review/published), verified, sensitive. |

Built on the shadcn/ui foundation, themed via tokens in `packages/ui`.

## 5. Risk-badge system

| Level | Label | Color cue |
| --- | --- | --- |
| 1 | Philosophical | Neutral / muted |
| 2 | Advocacy | Electric blue `#3B82F6` |
| 3 | Mobilization | Accent purple `#8B5CF6` |
| 4 | Harm-adjacent | Amber/orange (warning) |
| 5 | Explicit harm | Risk red `#EF4444` |

Badges show the number + label; never display operational detail.

## 6. Category-tag system

- One chip per category from the 36-category taxonomy.
- Neutral surface styling; tooltip shows the category definition.
- Multiple tags allowed per signal; tags describe rhetoric, not people.

## 7. Traceability visual system

The signature HSI visualization makes provenance legible at a glance:

```
[ SIGNAL ] ──> [ EVIDENCE ] ──> [ ANALYSIS ] ──> [ SOURCE TRACE ]
  title         raw passage      AI extraction     mapped passages +
  + category    (private)        + interpretation   confidence (≥0.72)
```

- **Signal** — the tracked narrative (verified green when approved).
- **Evidence** — raw source passage (private; chain-of-custody).
- **Analysis** — AI extraction + clearly-labeled interpretation (accent purple).
- **Source Trace** — the claim→passage mapping with confidence; below-threshold
  links are flagged.

This component visually enforces the four-layer separation from the methodology.

## 8. The reference images are the source of truth

When implementing or revising any surface, defer to the two images in
[`references/`](references/README.md):

- `hsi-full-design-system-reference.png` — tokens, components, system.
- `hsi-marketing-homepage-reference.png` — public homepage composition.

If code and the references diverge, the references win; update tokens/components,
then this doc, then re-verify both `www` and `app` surfaces.
