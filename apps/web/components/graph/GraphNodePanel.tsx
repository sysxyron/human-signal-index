'use client';

// =============================================================================
// HSI Phase 8 — GraphNodePanel. The side panel for a selected graph node.
//   - narrative: name / category / risk + linked signals;
//   - entity:    name / type / description + evidence.
// Purely presentational (driven by the selected node from NarrativeGraphFlow).
// =============================================================================

import { X } from 'lucide-react';
import type {
  HsinEntityRecord,
  HsinNarrativeRecord,
  HsinSignalNarrativeRecord,
  HsinSignalEntityRecord,
} from '@hsi/shared-types';
import { entityTypeDecor, titleize } from '@/lib/operations/view';

export type SelectedNode =
  | { kind: 'narrative'; narrative: HsinNarrativeRecord }
  | { kind: 'entity'; entity: HsinEntityRecord };

export function GraphNodePanel({
  selected,
  signalNarratives,
  signalEntities,
  onClose,
}: {
  selected: SelectedNode;
  signalNarratives: HsinSignalNarrativeRecord[];
  signalEntities: HsinSignalEntityRecord[];
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-3 top-3 z-10 flex max-h-[616px] w-[360px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-glow">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-h6 font-semibold text-text-primary">
            {selected.kind === 'narrative' ? selected.narrative.name : selected.entity.name}
          </p>
          <p className="text-caption text-text-muted">
            {selected.kind === 'narrative' ? 'Narrative' : 'Entity'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-white"
          aria-label="Close node panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {selected.kind === 'narrative' ? (
          <NarrativeBody
            narrative={selected.narrative}
            links={signalNarratives.filter((l) => l.narrative_id === selected.narrative.id)}
          />
        ) : (
          <EntityBody
            entity={selected.entity}
            links={signalEntities.filter((l) => l.entity_id === selected.entity.id)}
          />
        )}
      </div>
    </aside>
  );
}

function NarrativeBody({
  narrative,
  links,
}: {
  narrative: HsinNarrativeRecord;
  links: HsinSignalNarrativeRecord[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {narrative.category ? (
          <span className="rounded-full border border-electric/30 bg-electric/10 px-2.5 py-1 text-caption font-semibold text-electric">
            {titleize(narrative.category)}
          </span>
        ) : null}
        {narrative.risk_level != null ? (
          <span className="rounded-full border border-risk/40 bg-risk/10 px-2.5 py-1 text-caption font-semibold text-risk">
            Risk {narrative.risk_level}/5
          </span>
        ) : null}
      </div>
      {narrative.description ? (
        <p className="text-caption leading-relaxed text-text-secondary">
          {narrative.description}
        </p>
      ) : null}
      <Group title={`Linked signals · ${links.length}`}>
        {links.length === 0 ? (
          <Empty text="No signals linked to this narrative yet." />
        ) : (
          <ul className="space-y-1.5">
            {links.map((l) => (
              <li
                key={l.id}
                className="rounded-card border border-border bg-surface-2/40 p-2 text-caption"
              >
                <span className="font-mono text-text-secondary">
                  {l.signal_id.slice(0, 12)}
                </span>
                {l.confidence != null ? (
                  <span className="ml-2 text-text-muted">
                    {Math.round(l.confidence * 100)}% conf.
                  </span>
                ) : null}
                {l.rationale ? (
                  <p className="mt-1 text-text-muted">{l.rationale}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  );
}

function EntityBody({
  entity,
  links,
}: {
  entity: HsinEntityRecord;
  links: HsinSignalEntityRecord[];
}) {
  const decor = entityTypeDecor(entity.entity_type);
  return (
    <>
      <span
        className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold"
        style={{
          backgroundColor: `${decor.color}1f`,
          color: decor.color,
          border: `1px solid ${decor.color}55`,
        }}
      >
        {decor.label}
      </span>
      {entity.description ? (
        <p className="text-caption leading-relaxed text-text-secondary">
          {entity.description}
        </p>
      ) : null}
      <p className="rounded-card border border-border bg-surface-2/40 p-2 text-caption text-text-muted">
        Entities describe PUBLIC narratives / ideologies / movements / platforms —
        not private individuals' personal data.
      </p>
      <Group title={`Mentioned in signals · ${links.length}`}>
        {links.length === 0 ? (
          <Empty text="No signal mentions recorded." />
        ) : (
          <ul className="space-y-1.5">
            {links.map((l) => (
              <li
                key={l.id}
                className="rounded-card border border-border bg-surface-2/40 p-2 text-caption"
              >
                <span className="font-mono text-text-secondary">
                  {l.signal_id.slice(0, 12)}
                </span>
                {l.evidence_text ? (
                  <p className="mt-1 text-text-muted">{l.evidence_text}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Group>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-label text-text-muted">{title}</p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-caption text-text-muted">{text}</p>;
}
