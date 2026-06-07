import { TopNav, Card, Table, type TableColumn } from '@hsi/ui';
import { FlaskConical } from 'lucide-react';
import {
  UNIVERSE_PRESETS,
  SimulationEngine,
  evaluateWorld,
  createEarthState,
  type Universe,
  type UniverseType,
  type WorldEvaluation,
} from '@hsi/simulation-engine';
import { ScientificConfidenceChip } from '@/components/worldforge/ScientificConfidenceChip';

interface UniverseRow {
  universe: Universe;
  evaluation: WorldEvaluation;
}

function buildRows(): UniverseRow[] {
  return (Object.keys(UNIVERSE_PRESETS) as UniverseType[]).map((type) => {
    const universe = UNIVERSE_PRESETS[type];
    // Run the SAME Earth under each universe via setUniverse → rebuild.
    const engine = new SimulationEngine(createEarthState());
    engine.setUniverse(universe);
    const evaluation = evaluateWorld(engine.getState());
    return { universe, evaluation };
  });
}

const CONSTANTS: { key: keyof Universe['constants']; label: string }[] = [
  { key: 'gravity', label: 'Gravity' },
  { key: 'lightSpeed', label: 'Light Speed' },
  { key: 'fineStructure', label: 'Fine Structure' },
  { key: 'entropyRate', label: 'Entropy Rate' },
  { key: 'fusionEfficiency', label: 'Fusion Eff.' },
];

export default function UniversesPage() {
  const rows = buildRows();

  const columns: TableColumn<UniverseRow>[] = [
    {
      key: 'universe',
      header: 'Universe',
      render: (r) => (
        <div className="min-w-0">
          <span className="font-medium text-text-primary">{r.universe.name}</span>
          <p className="mt-0.5 max-w-md text-caption text-text-muted">{r.universe.description}</p>
        </div>
      ),
    },
    {
      key: 'overall',
      header: 'Earth Overall',
      align: 'right',
      render: (r) => (
        <span className="font-semibold text-text-primary">{r.evaluation.overallScore}/100</span>
      ),
    },
    {
      key: 'hab',
      header: 'Habitability',
      align: 'right',
      render: (r) => `${Math.round(r.evaluation.habitability.value * 100)}%`,
    },
    {
      key: 'life',
      header: 'Life',
      align: 'right',
      render: (r) => `${Math.round(r.evaluation.lifePlausibility.value * 100)}%`,
    },
    {
      key: 'sci',
      header: 'Confidence',
      align: 'right',
      render: (r) => (
        <ScientificConfidenceChip
          tier={r.universe.scientificConfidence.tier}
          confidence={r.universe.scientificConfidence.confidence}
        />
      ),
    },
  ];

  return (
    <>
      <TopNav title="Universe Forge" subtitle="Same world, different physical constants" />
      <main className="space-y-6 p-5 lg:p-6">
        <Card className="space-y-2" padded>
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <FlaskConical className="h-5 w-5 text-electric" /> The same Earth, forged in different
            universes
          </h2>
          <p className="max-w-2xl text-body-sm leading-relaxed text-text-secondary">
            A Universe is a set of multipliers on physical constants. Run the identical Earth
            world state under each preset and the simulation graph recomputes every derived value —
            so habitability, life, and viability all shift without editing the world itself.
          </p>
        </Card>

        {/* Constants grid */}
        <section className="space-y-3">
          <h3 className="text-h5 font-semibold text-text-primary">Universe presets & constants</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <Card key={r.universe.type} className="space-y-3" padded>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-h6 font-semibold text-text-primary">{r.universe.name}</h4>
                  <ScientificConfidenceChip tier={r.universe.scientificConfidence.tier} />
                </div>
                <p className="text-caption leading-snug text-text-secondary">
                  {r.universe.description}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CONSTANTS.map((c) => {
                    const v = r.universe.constants[c.key];
                    const off = v !== 1;
                    return (
                      <div
                        key={c.key}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface-2/40 px-2.5 py-1.5"
                      >
                        <span className="text-caption text-text-muted">{c.label}</span>
                        <span
                          className={`font-mono text-caption font-semibold ${
                            off ? 'text-electric' : 'text-text-secondary'
                          }`}
                        >
                          ×{v}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2.5">
                  <span className="text-caption text-text-muted">Earth viability</span>
                  <span className="text-body-sm font-bold text-text-primary">
                    {r.evaluation.overallScore}/100
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Comparison table */}
        <section className="space-y-3">
          <h3 className="text-h5 font-semibold text-text-primary">
            Comparative evaluation — Earth across universes
          </h3>
          <Table columns={columns} data={rows} rowKey={(r) => r.universe.type} />
        </section>
      </main>
    </>
  );
}
