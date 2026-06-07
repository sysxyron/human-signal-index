# HSI Review Queue

The Review Queue is the human-in-the-loop heart of HSI. No signal reaches the
public without passing through it. This document defines its states, transitions,
reviewer actions, and service expectations.

Reviewer SOPs: [`README.md`](README.md) §2. Publishing: [`PUBLISHING-CHECKLIST.md`](PUBLISHING-CHECKLIST.md).

---

## 1. Signal states

| State | Meaning |
| --- | --- |
| `intake` | Newly submitted; awaiting source resolution. |
| `captured` | Public source snapshotted (chain-of-custody started). |
| `extracted` | AI extraction complete (`ai_runs`, `ai_trace_passages`). |
| `classified` | Categories assigned (`classifications`). |
| `scored` | Risk level assigned (`risk_scores`). |
| `traced` | Traceability audit complete; flags resolved or pending. |
| `in-review` | A reviewer is evaluating it. |
| `needs-more` | Returned for more evidence/correction. |
| `publish-ready` | Approved + gate passed; awaiting publication. |
| `published` | Live in `public_reports`. |
| `rejected` | Removed from the pipeline (logged reason). |
| `escalated` | Routed to senior reviewer / Security & Alerts. |

## 2. State machine

```
intake → captured → extracted → classified → scored → traced → in-review
                                                                   │
                  ┌────────────────────────────────────────────────┤
                  ▼                ▼                ▼                ▼
             needs-more        rejected         escalated      publish-ready → published
                  │                                  │
                  └── (re-capture / re-extract) ──────┘
```

- `needs-more` loops back to capture/extraction with a reviewer note.
- `escalated` items pause publication pending senior review.
- Only `in-review` → `publish-ready` (gate passed) → `published` reaches the public.

## 3. Reviewer actions in the queue

| Action | Resulting state |
| --- | --- |
| Approve | `publish-ready` (if gate passes) |
| Reject | `rejected` |
| Request more evidence | `needs-more` |
| Edit classification | stays `in-review` (logged) |
| Mark public-safe | clears safe-framing gate |
| Mark sensitive | adds handling constraints |
| Escalate | `escalated` |

Each action writes a `reviews` row and an `audit_logs` entry (actor, decision, notes).

## 4. The gate (entry to publish-ready)

A signal can become `publish-ready` only when:

1. A `reviews` approval exists.
2. Traceability confidence ≥ `TRACEABILITY_MIN_CONFIDENCE` (**0.72**) for all
   retained public claims.
3. No unresolved `unsupported` / `unattributed` flags.
4. Safe-framing + vulnerable-audience checks pass.
5. Only approved, cited material is included; raw evidence stays private.

## 5. Prioritization & SLA (targets)

| Priority | Criteria | Target first-touch |
| --- | --- | --- |
| Urgent | Risk 4–5, targeting, possible imminent harm | Immediate / escalate |
| High | Risk 3, sensitive themes, time-relevant | Same business day |
| Normal | Risk 1–2, routine cataloging | Within the standard cycle |

## 6. Quality rules

- Read the **raw passage** next to the AI interpretation before deciding.
- Keep all written rationale neutral and non-defamatory.
- Prefer paraphrase over quotation for dangerous/operational text.
- When uncertain about safety or scope, **escalate** rather than approve.
