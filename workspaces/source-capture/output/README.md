# Source Capture — Output

Outputs of the Source Capture stage. These establish chain-of-custody for raw
public material.

## What lands here

| File / shape | Contents |
| --- | --- |
| `capture-metadata-<date>.json` | Per-capture: `signal_id`, `capture_id`, public URL, capture timestamp, content **hash**, capturing connector/job, private storage path. |
| `raw-source-archive/` | References/manifests for raw snapshots (the snapshots themselves live in the private `evidence` bucket). |

## Rules

- Public pages only; no login bypass, no private-group content.
- Raw captures are **private** — referenced here, stored in the `evidence` bucket.
- Content hash + timestamp must be present (chain-of-custody).

Example: `capture-metadata-2026-06-06.json`, `raw-source-archive/`.
