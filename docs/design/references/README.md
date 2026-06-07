# HSI Design References

This directory holds the **visual source of truth** for Human Signal Index. When
code and these images diverge, the images win — align the tokens/components, then
the design docs.

## The two reference images

| File | What it defines |
| --- | --- |
| `hsi-full-design-system-reference.png` | The complete design system: color tokens, type scale, spacing/radius, and the component inventory (buttons, cards, badges, tags, tables, traceability visualization). Use this when building or theming any UI. |
| `hsi-marketing-homepage-reference.png` | The public marketing homepage composition for `www.humansignalindex.org`: hero, sections, layout rhythm, and how the brand presents to the public. Use this when building the public site. |

## Where to place them

Save the images here, **without renaming**:

```
docs/design/references/hsi-full-design-system-reference.png
docs/design/references/hsi-marketing-homepage-reference.png
```

(These two `.png` files are managed assets — add or replace the image files
directly; do not rename them, as the docs reference these exact paths.)

## After adding the images

1. Reconcile color/type/spacing tokens in `apps/web/tailwind.config.ts` and
   `packages/ui` with `hsi-full-design-system-reference.png`.
2. Reconcile the homepage layout with `hsi-marketing-homepage-reference.png`.
3. Update [`../README.md`](../README.md) (the design system doc) to match.
4. Verify both the public site and dashboard render to the references.

If the images are not yet present, interpret the design from the tokens and
component inventory documented in [`../README.md`](../README.md).
