# WorldForge Fusion (HSI Phase 9)

WorldForge fusion is the **cross-subsystem bridge** that turns a captured PUBLIC
signal/narrative into a WorldForge **research run** — strictly through human
approval. It connects the Phase-7/8/9 signal observatory to the Phase-2/3/4
research/evidence/governance pipeline without ever shortcutting review.

- Bridge table: migration `0013` — `hsin_worldforge_links`.
- Links reference the signal observatory (`hsin_signals`, `hsin_narratives`) and
  the WorldForge side (`research_runs`, `worlds`).

---

## End-to-end flow (never auto-published)

```
   signal ─► narrative ─► research prompt DRAFT ─► HUMAN APPROVAL ─► research run
 (hsin_signals)(hsin_narratives)  (prompt_draft)        │           (research_runs)
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │  evidence → consensus →        │
                                          │  governance → review          │
                                          └──────────────────────────────┘
                                                         │
                                                  world created (worlds)
                                                         │
   hsin_worldforge_links.status:  draft ─► approved ─► created     (or rejected)
```

Each arrow that changes state is **human-gated**. The worker may *draft* a link
(propose a prompt), but it **never** approves, never creates a research run, and
**never auto-publishes** a world.

## The `hsin_worldforge_links` bridge

One row fuses a signal/narrative into a WorldForge artifact:

| Column            | Meaning                                                       |
|-------------------|---------------------------------------------------------------|
| `signal_id`       | The originating captured signal (nullable).                   |
| `narrative_id`    | The originating narrative (nullable).                         |
| `research_run_id` | Set once a research run is created from the link.             |
| `world_id`        | Set once a world is generated.                                |
| `prompt_draft`    | The proposed concept prompt (a DRAFT for human review).       |
| `status`          | `draft` → `approved`/`rejected` → `created`.                  |
| `created_by`      | The owner of the draft.                                       |

## Status lifecycle & who can move it

- `draft` — proposed (by a user, or worker-drafted as a request). Owner has full
  CRUD; researcher+ may read.
- `approved` / `rejected` — a **reviewer+** decision (access shape D in `0013`:
  reviewer+ READ + UPDATE).
- `created` — a research run / world was generated **after** approval.

The background worker uses the service-role key and could write a `draft`, but
the governance pipeline (evidence weighting, consensus, review queues, publishing
checklist) gates everything downstream. No path advances `draft → created`
without a human.

## Relationship to triage

The triage rule-engine (Phase 8) **never** drafts research automatically unless
`SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS=true` (default **false**); otherwise a
`draft_research` action is downgraded to `request_research_review` — i.e. a human
is asked to decide. WorldForge fusion honors the same principle: it surfaces a
*candidate* prompt, a human decides whether it becomes research.

## Offline-safety

Fusion link creation is a DB/governance action. With no service-role env the
worker performs no writes; the bridge is inert. Nothing in this path auto-acts,
and nothing throws.
