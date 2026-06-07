// =============================================================================
// @hsi/simulation-engine — dependency graph builder
// buildDependencyGraph(state, universe) constructs the full causal graph:
// root (input) nodes taken from WorldState, then derived nodes whose compute
// functions encode the formulas. Cross-category edges express WHY (e.g. gravity
// -> atmosphere retention, luminosity -> temperature, temperature -> solvent).
//
// Each derived node's compute fn reads its PARENT VALUES by node id from the
// `inputs` map, so the propagation engine can recompute it in topo order.
// =============================================================================

import {
  buildProvenance,
  KNOWN,
  PLAUSIBLE,
  SPECULATIVE,
  getUniverse,
  type Provenance,
  type ScientificConfidence,
  type Universe,
  type UniverseConstants,
  type WorldState,
} from '@hsi/world-models';
import type { ComputeFn, GraphEdge, GraphNode, NodeCategory, SimulationGraph } from './types';
import * as F from './formulas';

// Node id constants — stable string ids used by edges, resolver, propagation.
export const N = {
  // star
  starMass: 'star.mass',
  starLuminosity: 'star.luminosity',
  starTemp: 'star.temperature',
  starRadiation: 'star.radiation',
  starLifetime: 'star.lifetime',
  hzInner: 'star.hz.inner',
  hzOuter: 'star.hz.outer',
  // planet
  planetMass: 'planet.mass',
  planetRadius: 'planet.radius',
  planetOrbit: 'planet.orbit',
  planetAlbedo: 'planet.albedo',
  planetBasePressure: 'planet.basePressure',
  planetWater: 'planet.waterCoverage',
  planetMagDeclared: 'planet.magDeclared',
  gravity: 'planet.gravity',
  escapeVel: 'planet.escapeVelocity',
  temperature: 'planet.temperature',
  atmRetention: 'planet.atmRetention',
  atmDensity: 'planet.atmDensity',
  magnetosphere: 'planet.magnetosphere',
  hzPosition: 'planet.hzPosition',
  oxygenFraction: 'planet.oxygen',
  // chemistry
  chemStability: 'chem.stability',
  solventViability: 'chem.solventViability',
  metabolism: 'chem.metabolism',
  replication: 'chem.replication',
  habitability: 'chem.habitability',
  // biology
  lifePlausibility: 'bio.lifePlausibility',
  evolutionRate: 'bio.evolutionRate',
  complexity: 'bio.complexity',
  genetics: 'bio.genetics',
  cellStructure: 'bio.cellStructure',
  // intelligence
  cognitiveRate: 'intel.cognitiveRate',
  problemSolving: 'intel.problemSolving',
  intelligence: 'intel.plausibility',
  // civilization
  mathematics: 'civ.mathematics',
  riskManagement: 'civ.riskManagement',
  technology: 'civ.technology',
  society: 'civ.society',
  population: 'civ.population',
  // risk
  climateInstability: 'risk.climate',
  asteroidExposure: 'risk.asteroid',
  selfDestruction: 'risk.selfDestruction',
  stellarRisk: 'risk.stellar',
  extinction: 'risk.extinction',
  // extended (analysis) nodes — deepen the graph toward the 60-120 target
  insolation: 'planet.insolation',
  uvFlux: 'planet.uvFlux',
  surfaceShield: 'planet.surfaceShield',
  reactionRate: 'chem.reactionRate',
  metabolicEnergy: 'chem.metabolicEnergy',
  biodiversity: 'bio.biodiversity',
  oxygenation: 'bio.oxygenation',
  nicheCount: 'bio.nicheCount',
  cognitiveBandwidth: 'intel.bandwidth',
  memoryHorizon: 'intel.memoryHorizon',
  abstraction: 'intel.abstraction',
  energyUse: 'civ.energyUse',
  kardashev: 'civ.kardashev',
  longevity: 'civ.longevity',
  resilience: 'civ.resilience',
  climateFeedback: 'risk.climateFeedback',
  resourceDepletion: 'risk.resourceDepletion',
  survivalProbability: 'risk.survivalProbability',
} as const;

interface BuildCtx {
  state: WorldState;
  universe: Universe;
  consts: UniverseConstants;
  nodes: GraphNode[];
  edges: GraphEdge[];
  edgeSeq: number;
}

function rootNode(
  ctx: BuildCtx,
  id: string,
  label: string,
  category: NodeCategory,
  value: number,
  unit: string | undefined,
  sci: ScientificConfidence,
  reason: string,
  assumptions: string[] = [],
): void {
  const provenance: Provenance = buildProvenance({
    reason,
    dependsOn: [],
    scientificConfidence: sci,
  });
  ctx.nodes.push({ id, label, category, value, unit, provenance, assumptions });
}

function derivedNode(
  ctx: BuildCtx,
  id: string,
  label: string,
  category: NodeCategory,
  parents: { id: string; relation: string }[],
  unit: string | undefined,
  sci: ScientificConfidence,
  reason: string,
  compute: ComputeFn,
  assumptions: string[] = [],
): void {
  const dependsOn = parents.map((p) => p.id);
  const provenance: Provenance = buildProvenance({
    reason,
    dependsOn,
    scientificConfidence: sci,
  });
  // Resolve initial value from current parent values.
  const inputs: Record<string, number> = {};
  for (const p of parents) {
    const pn = ctx.nodes.find((nn) => nn.id === p.id);
    inputs[p.id] = pn ? pn.value : 0;
  }
  const value = compute(inputs);
  ctx.nodes.push({ id, label, category, value, unit, compute, provenance, assumptions });
  for (const p of parents) {
    ctx.edges.push({
      id: `e${ctx.edgeSeq++}`,
      source: p.id,
      target: id,
      relation: p.relation,
    });
  }
}

/** Build the full simulation graph for a world under a universe. */
export function buildDependencyGraph(
  state: WorldState,
  universe: Universe = getUniverse(state.universeType),
): SimulationGraph {
  const consts = universe.constants;
  const planet = state.planets[0] ?? {
    massEarth: 1,
    radiusEarth: 1,
    orbitAU: 1,
    albedo: 0.3,
    atmospherePressureAtm: 1,
    waterCoverage: 0.7,
    magnetosphereStrength: 0.5,
    atmosphereComposition: {},
  };
  const ctx: BuildCtx = { state, universe, consts, nodes: [], edges: [], edgeSeq: 0 };

  // --- STAR roots -----------------------------------------------------------
  rootNode(ctx, N.starMass, 'Star Mass', 'star', state.star.massSolar, 'M☉',
    KNOWN('Declared stellar mass.'), 'Input from world state.');
  rootNode(ctx, N.starTemp, 'Star Temperature', 'star', state.star.temperatureK, 'K',
    KNOWN('Declared effective temperature.'), 'Input from world state.');

  // --- STAR derived ---------------------------------------------------------
  derivedNode(ctx, N.starLuminosity, 'Luminosity', 'star',
    [{ id: N.starMass, relation: 'mass-luminosity relation L ∝ M^3.5' }],
    'L☉', KNOWN('Main-sequence mass-luminosity relation.'),
    'Brighter for more massive stars (L ∝ M^3.5), scaled by fusion efficiency.',
    (i) => F.luminosityFromMass(i[N.starMass], consts),
    ['Assumes a main-sequence star.']);

  derivedNode(ctx, N.starLifetime, 'Stellar Lifetime', 'star',
    [{ id: N.starMass, relation: 'lifetime ∝ M / L (fuel over burn-rate)' }],
    'Gyr', KNOWN('Main-sequence lifetime from mass.'),
    'Massive stars burn out fast (t ∝ M/L); entropy rate stretches/compresses it.',
    (i) => F.stellarLifetimeGyr(i[N.starMass], consts));

  derivedNode(ctx, N.starRadiation, 'Stellar Radiation', 'star',
    [{ id: N.starTemp, relation: 'hotter stars emit harder radiation' },
     { id: N.starLuminosity, relation: 'brighter stars deliver more flux' }],
    '0..1', KNOWN('Radiation rises with temperature & luminosity.'),
    'Normalized ionizing/UV/particle flux at the planet.',
    (i) => F.radiationIndex(i[N.starTemp], i[N.starLuminosity]));

  derivedNode(ctx, N.hzInner, 'Habitable Zone (inner)', 'star',
    [{ id: N.starLuminosity, relation: 'HZ scales with sqrt(L)' }],
    'AU', KNOWN('Habitable zone scales with stellar flux.'),
    'Inner edge where flux is too high for liquid water.',
    (i) => F.habitableZoneAU(i[N.starLuminosity]).inner);

  derivedNode(ctx, N.hzOuter, 'Habitable Zone (outer)', 'star',
    [{ id: N.starLuminosity, relation: 'HZ scales with sqrt(L)' }],
    'AU', KNOWN('Habitable zone scales with stellar flux.'),
    'Outer edge where flux is too low for liquid water.',
    (i) => F.habitableZoneAU(i[N.starLuminosity]).outer);

  // --- PLANET roots ---------------------------------------------------------
  rootNode(ctx, N.planetMass, 'Planet Mass', 'planet', planet.massEarth, 'M⊕',
    KNOWN('Declared planet mass.'), 'Input from world state.');
  rootNode(ctx, N.planetRadius, 'Planet Radius', 'planet', planet.radiusEarth, 'R⊕',
    KNOWN('Declared planet radius.'), 'Input from world state.');
  rootNode(ctx, N.planetOrbit, 'Orbit', 'planet', planet.orbitAU, 'AU',
    KNOWN('Declared orbital distance.'), 'Input from world state.');
  rootNode(ctx, N.planetAlbedo, 'Albedo', 'planet', planet.albedo, '0..1',
    KNOWN('Declared bond albedo.'), 'Input from world state.');
  rootNode(ctx, N.planetBasePressure, 'Base Atmosphere', 'planet', planet.atmospherePressureAtm, 'atm',
    KNOWN('Declared (outgassed) atmospheric pressure.'), 'Input from world state.');
  rootNode(ctx, N.planetWater, 'Solvent Coverage', 'planet', planet.waterCoverage, '0..1',
    KNOWN('Declared surface solvent coverage.'), 'Input from world state.');
  rootNode(ctx, N.planetMagDeclared, 'Dynamo Strength', 'planet', planet.magnetosphereStrength, '0..1',
    PLAUSIBLE('Declared magnetic dynamo strength.'), 'Input from world state.');
  rootNode(ctx, N.oxygenFraction, 'Oxygen Fraction', 'planet',
    F.gasFraction(planet.atmosphereComposition, 'O2'), '0..1',
    KNOWN('O2 fraction from declared atmosphere composition.'), 'Input from world state.');

  // --- PLANET derived -------------------------------------------------------
  derivedNode(ctx, N.gravity, 'Gravity', 'planet',
    [{ id: N.planetMass, relation: 'g ∝ M / R²' },
     { id: N.planetRadius, relation: 'g ∝ M / R²' }],
    'g', KNOWN('Surface gravity from mass and radius.'),
    'g = M/R² in Earth units, scaled by the universe gravity constant.',
    (i) => F.surfaceGravityG(i[N.planetMass], i[N.planetRadius], consts));

  derivedNode(ctx, N.escapeVel, 'Escape Velocity', 'planet',
    [{ id: N.gravity, relation: 'v_esc = sqrt(2 g R)' },
     { id: N.planetRadius, relation: 'v_esc = sqrt(2 g R)' }],
    'km/s', KNOWN('Escape velocity from gravity and radius.'),
    'v_esc ∝ sqrt(g·R); controls atmospheric retention.',
    (i) => F.escapeVelocityKmS(i[N.gravity], i[N.planetRadius], consts));

  derivedNode(ctx, N.temperature, 'Surface Temperature', 'planet',
    [{ id: N.starLuminosity, relation: 'flux ∝ L / d²' },
     { id: N.planetOrbit, relation: 'flux ∝ L / d²' },
     { id: N.planetAlbedo, relation: 'reflected fraction lowers absorbed flux' },
     { id: N.planetBasePressure, relation: 'greenhouse warming from atmosphere' }],
    'K', KNOWN('Equilibrium temperature + greenhouse offset.'),
    'T_eq = 278.5·((1-A)L)^0.25/sqrt(d) plus a pressure-driven greenhouse term.',
    (i) => F.equilibriumTemperatureK(i[N.starLuminosity], i[N.planetOrbit], i[N.planetAlbedo], i[N.planetBasePressure]));

  derivedNode(ctx, N.atmRetention, 'Atmospheric Retention', 'planet',
    [{ id: N.escapeVel, relation: 'higher escape velocity retains gas' },
     { id: N.temperature, relation: 'higher temperature drives thermal escape' }],
    '0..1', KNOWN('Jeans-escape retention from escape velocity & temperature.'),
    'Retention rises with v_esc and falls with temperature (thermal escape).',
    (i) => F.atmosphericRetention(i[N.escapeVel], i[N.temperature]));

  derivedNode(ctx, N.atmDensity, 'Atmosphere Density', 'planet',
    [{ id: N.planetBasePressure, relation: 'starts from outgassed pressure' },
     { id: N.atmRetention, relation: 'retained fraction sets effective density' }],
    'atm', KNOWN('Effective pressure = base × retained fraction.'),
    'How much atmosphere actually remains after escape losses.',
    (i) => F.effectiveAtmosphereAtm(i[N.planetBasePressure], i[N.atmRetention]));

  derivedNode(ctx, N.magnetosphere, 'Magnetosphere', 'planet',
    [{ id: N.planetMagDeclared, relation: 'dynamo provides the field' },
     { id: N.planetMass, relation: 'larger planets sustain dynamos' },
     { id: N.starRadiation, relation: 'radiation contends with the field' }],
    '0..1', PLAUSIBLE('Net protection: dynamo discounted by incident radiation.'),
    'Shields the atmosphere & surface from stellar radiation.',
    (i) => F.magnetosphereProtection(i[N.planetMagDeclared], i[N.planetMass], i[N.starRadiation]));

  derivedNode(ctx, N.hzPosition, 'Habitable-Zone Position', 'planet',
    [{ id: N.planetOrbit, relation: 'distance vs HZ band' },
     { id: N.hzInner, relation: 'inner HZ edge' },
     { id: N.hzOuter, relation: 'outer HZ edge' }],
    '0..1', KNOWN('How central the orbit is within the habitable zone.'),
    '1 at HZ center, 0 at/outside edges.',
    (i) => F.habitableZonePosition(i[N.planetOrbit], i[N.hzInner], i[N.hzOuter]));

  // --- CHEMISTRY ------------------------------------------------------------
  rootNode(ctx, N.chemStability, 'Chemistry Stability', 'chemistry', state.chemistry.stabilityIndex, '0..1',
    PLAUSIBLE('Declared chemistry stability under local conditions.'), 'Input from world state.');
  rootNode(ctx, N.metabolism, 'Metabolism', 'chemistry', state.chemistry.stabilityIndex, '0..1',
    PLAUSIBLE(`Metabolism descriptor: ${state.chemistry.metabolism}.`), 'Proxy value mirrors stability.');
  rootNode(ctx, N.replication, 'Replication', 'chemistry', state.chemistry.stabilityIndex, '0..1',
    PLAUSIBLE(`Replication descriptor: ${state.chemistry.replication}.`), 'Proxy value mirrors stability.');

  derivedNode(ctx, N.solventViability, 'Solvent Viability', 'chemistry',
    [{ id: N.temperature, relation: 'solvent must stay liquid at surface temperature' }],
    '0..1', solventSci(state.chemistry.solvent),
    `Probability the ${state.chemistry.solvent} solvent stays liquid at surface temperature.`,
    (i) => F.solventViability(state.chemistry.solvent, i[N.temperature], consts),
    [`Liquid band assumed for ${state.chemistry.solvent}.`]);

  derivedNode(ctx, N.habitability, 'Habitability', 'chemistry',
    [{ id: N.hzPosition, relation: 'in the habitable zone' },
     { id: N.solventViability, relation: 'liquid solvent available' },
     { id: N.atmRetention, relation: 'atmosphere retained' },
     { id: N.magnetosphere, relation: 'surface shielded' },
     { id: N.planetWater, relation: 'solvent coverage' },
     { id: N.gravity, relation: 'gravity within tolerable range' }],
    '0..1', KNOWN('Composite habitability from physical & chemical factors.'),
    'Headline "can life persist here" score.',
    (i) => F.habitabilityIndex({
      inHZ: i[N.hzPosition],
      solventViability: i[N.solventViability],
      atmosphereRetention: i[N.atmRetention],
      magnetosphere: i[N.magnetosphere],
      waterCoverage: i[N.planetWater],
      gravityG: i[N.gravity],
    }));

  // --- BIOLOGY --------------------------------------------------------------
  rootNode(ctx, N.evolutionRate, 'Evolution Rate', 'biology', state.biology.evolutionRate, '0..1',
    KNOWN('Declared evolutionary pace.'), 'Input from world state.');
  rootNode(ctx, N.genetics, 'Genetics Substrate', 'biology',
    geneticsValue(state.biology.geneticsSubstrate), '0..1',
    geneticsSci(state.biology.geneticsSubstrate),
    `Genetic substrate: ${state.biology.geneticsSubstrate}.`, ['Stability proxy for the substrate.']);
  rootNode(ctx, N.cellStructure, 'Cell Structure', 'biology', state.biology.complexityIndex, '0..1',
    PLAUSIBLE(`Cell architecture: ${state.biology.cellStructure}.`), 'Proxy from complexity index.');

  derivedNode(ctx, N.lifePlausibility, 'Life Plausibility', 'biology',
    [{ id: N.habitability, relation: 'habitable conditions enable life' },
     { id: N.chemStability, relation: 'stable chemistry enables biochemistry' }],
    '0..1', PLAUSIBLE('Life from habitability gated by chemistry & entropy.'),
    'How plausibly life arises and persists here.',
    (i) => F.lifePlausibility(i[N.habitability], i[N.chemStability], consts));

  derivedNode(ctx, N.complexity, 'Biological Complexity', 'biology',
    [{ id: N.lifePlausibility, relation: 'life must exist to grow complex' },
     { id: N.evolutionRate, relation: 'faster evolution builds complexity sooner' },
     { id: N.genetics, relation: 'substrate fidelity bounds complexity' }],
    '0..1', PLAUSIBLE('Complexity grows with time, evolution rate & substrate.'),
    'Realized biological complexity (log-scaled in planetary age).',
    (i) => F.realizedComplexity(i[N.lifePlausibility], i[N.evolutionRate] * (0.5 + 0.5 * i[N.genetics]), planet.ageGyr));

  // --- INTELLIGENCE ---------------------------------------------------------
  rootNode(ctx, N.cognitiveRate, 'Cognitive Rate', 'intelligence', state.intelligence.cognitiveRateHz, 'Hz',
    PLAUSIBLE('Declared cognitive throughput (thoughts/sec).'), 'Input from world state.');
  rootNode(ctx, N.problemSolving, 'Problem Solving', 'intelligence', state.intelligence.problemSolvingIndex, '0..1',
    PLAUSIBLE('Declared problem-solving capability.'), 'Input from world state.');

  derivedNode(ctx, N.intelligence, 'Intelligence Plausibility', 'intelligence',
    [{ id: N.complexity, relation: 'intelligence emerges from complex life' },
     { id: N.problemSolving, relation: 'problem-solving capacity' }],
    '0..1', SPECULATIVE('Intelligence emergence from sustained complexity.'),
    'How plausibly intelligence emerges here (rate-agnostic).',
    (i) => F.intelligencePlausibility(i[N.complexity], i[N.problemSolving]));

  // --- CIVILIZATION ---------------------------------------------------------
  rootNode(ctx, N.mathematics, 'Mathematics', 'civilization', state.civilization.mathematicsLevel, '0..1',
    KNOWN('Declared mathematics sophistication.'), 'Input from world state.');
  rootNode(ctx, N.riskManagement, 'Risk Management', 'civilization', state.civilization.riskManagementIndex, '0..1',
    PLAUSIBLE('Declared existential-risk management capability.'), 'Input from world state.');
  rootNode(ctx, N.society, 'Society', 'civilization', state.civilization.mathematicsLevel, '0..1',
    PLAUSIBLE(`Social organization: ${state.civilization.society}.`), 'Proxy from mathematics level.');
  rootNode(ctx, N.population, 'Population (orders)', 'civilization', state.civilization.populationOrders, 'log10',
    KNOWN('Declared log10 population.'), 'Input from world state.');

  derivedNode(ctx, N.technology, 'Technology', 'civilization',
    [{ id: N.intelligence, relation: 'intelligence enables technology' },
     { id: N.mathematics, relation: 'formal tools enable technology' },
     { id: N.riskManagement, relation: 'governance sustains technological growth' }],
    '0..3', KNOWN('Kardashev-ish technology gated by intelligence & math.'),
    'You cannot build high tech without cognition and formal mathematics.',
    (i) => F.technologyCeiling(i[N.intelligence], i[N.mathematics], i[N.riskManagement]));

  // --- RISK -----------------------------------------------------------------
  rootNode(ctx, N.climateInstability, 'Climate Instability', 'risk', state.risks.climateInstability, '0..1',
    KNOWN('Declared climate instability.'), 'Input from world state.');
  rootNode(ctx, N.asteroidExposure, 'Asteroid Exposure', 'risk', state.risks.asteroidExposure, '0..1',
    KNOWN('Declared impact exposure.'), 'Input from world state.');
  rootNode(ctx, N.selfDestruction, 'Self-Destruction Risk', 'risk', state.risks.selfDestructionRisk, '0..1',
    PLAUSIBLE('Declared self-destruction risk.'), 'Input from world state.');

  derivedNode(ctx, N.stellarRisk, 'Stellar Risk', 'risk',
    [{ id: N.starLifetime, relation: 'shrinking stellar lifetime raises pressure' }],
    '0..1', KNOWN('Risk pressure from remaining stellar lifetime.'),
    'Rises as the star approaches the end of its main sequence.',
    (i) => F.stellarRiskPressure(i[N.starLifetime]));

  derivedNode(ctx, N.extinction, 'Extinction Index', 'risk',
    [{ id: N.climateInstability, relation: 'climate shocks drive extinction' },
     { id: N.asteroidExposure, relation: 'impacts drive extinction' },
     { id: N.selfDestruction, relation: 'self-destruction drives extinction' },
     { id: N.stellarRisk, relation: 'stellar decline drives extinction' },
     { id: N.riskManagement, relation: 'governance mitigates extinction' }],
    '0..1', PLAUSIBLE('Composite extinction index with mitigation.'),
    'Aggregate near-term extinction probability.',
    (i) => F.extinctionIndex({
      climateInstability: i[N.climateInstability],
      asteroidExposure: i[N.asteroidExposure],
      selfDestructionRisk: i[N.selfDestruction],
      stellarLifetimeRemainingGyr: state.risks.stellarLifetimeRemainingGyr,
      riskManagement: i[N.riskManagement],
    }));

  // --- EXTENDED ANALYSIS NODES ----------------------------------------------
  // Deepen the graph with derived secondary metrics. Each still encodes a real
  // relation and is fully wired with provenance + causal edges.
  const c01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

  derivedNode(ctx, N.insolation, 'Insolation', 'planet',
    [{ id: N.starLuminosity, relation: 'flux ∝ L / d²' },
     { id: N.planetOrbit, relation: 'flux ∝ L / d²' }],
    'S⊕', KNOWN('Incident stellar flux relative to Earth (L/d²).'),
    'Top-of-atmosphere energy budget driving climate.',
    (i) => i[N.starLuminosity] / Math.max(i[N.planetOrbit] * i[N.planetOrbit], 1e-6));

  derivedNode(ctx, N.uvFlux, 'UV Flux', 'planet',
    [{ id: N.starRadiation, relation: 'stellar radiation sets UV' },
     { id: N.insolation, relation: 'closer/brighter raises UV' }],
    '0..1', KNOWN('Surface-relevant UV from stellar radiation & insolation.'),
    'Mutagenic/UV load before shielding.',
    (i) => c01(i[N.starRadiation] * Math.sqrt(Math.max(i[N.insolation], 0))));

  derivedNode(ctx, N.surfaceShield, 'Surface Shielding', 'planet',
    [{ id: N.magnetosphere, relation: 'field deflects particles' },
     { id: N.atmDensity, relation: 'atmosphere absorbs UV' },
     { id: N.uvFlux, relation: 'shielding contends with UV load' }],
    '0..1', KNOWN('Net surface protection from magnetosphere + atmosphere vs UV.'),
    'How protected the surface is from radiation.',
    (i) => c01((0.5 * i[N.magnetosphere] + 0.5 * c01(i[N.atmDensity])) * (1 - 0.5 * i[N.uvFlux])));

  derivedNode(ctx, N.reactionRate, 'Reaction Rate', 'chemistry',
    [{ id: N.temperature, relation: 'Arrhenius: warmer → faster reactions' },
     { id: N.chemStability, relation: 'stability bounds usable rate' }],
    '0..1', PLAUSIBLE('Arrhenius-like temperature dependence of biochemistry.'),
    'Relative rate of metabolic chemistry.',
    (i) => c01(Math.exp(-1200 / Math.max(i[N.temperature], 1) + 4) * i[N.chemStability] * 0.02));

  derivedNode(ctx, N.metabolicEnergy, 'Metabolic Energy', 'chemistry',
    [{ id: N.reactionRate, relation: 'faster chemistry yields more energy flux' },
     { id: N.solventViability, relation: 'solvent enables transport' }],
    '0..1', PLAUSIBLE('Available metabolic energy flux.'),
    'Energy budget available to life.',
    (i) => c01(i[N.reactionRate] * (0.4 + 0.6 * i[N.solventViability])));

  derivedNode(ctx, N.biodiversity, 'Biodiversity', 'biology',
    [{ id: N.complexity, relation: 'complexity breeds diversity' },
     { id: N.metabolicEnergy, relation: 'energy fuels more niches' }],
    '0..1', PLAUSIBLE('Diversity scales with complexity and energy.'),
    'Breadth of the biosphere.',
    (i) => c01(Math.sqrt(Math.max(i[N.complexity] * i[N.metabolicEnergy], 0))));

  derivedNode(ctx, N.oxygenation, 'Oxygenation', 'biology',
    [{ id: N.oxygenFraction, relation: 'declared O2 fraction' },
     { id: N.biodiversity, relation: 'productive biospheres oxygenate' }],
    '0..1', KNOWN('Atmospheric oxygenation potential.'),
    'How oxygen-rich the atmosphere becomes (enables high metabolism).',
    (i) => c01(0.5 * i[N.oxygenFraction] / 0.21 + 0.5 * i[N.biodiversity]));

  derivedNode(ctx, N.nicheCount, 'Ecological Niches', 'biology',
    [{ id: N.biodiversity, relation: 'diversity multiplies niches' },
     { id: N.surfaceShield, relation: 'shielded surfaces open land niches' }],
    'count', PLAUSIBLE('Number of distinct ecological niches (illustrative).'),
    'Approximate count of viable niches.',
    (i) => Math.round(1 + 200 * i[N.biodiversity] * (0.3 + 0.7 * i[N.surfaceShield])));

  derivedNode(ctx, N.cognitiveBandwidth, 'Cognitive Bandwidth', 'intelligence',
    [{ id: N.cognitiveRate, relation: 'throughput sets bandwidth' },
     { id: N.intelligence, relation: 'capable minds use more bandwidth' }],
    '0..1', SPECULATIVE('Effective information bandwidth of cognition.'),
    'How much information the mind processes per unit subjective time.',
    (i) => c01(0.5 * i[N.intelligence] + 0.5 * c01(Math.log10(Math.max(i[N.cognitiveRate], 1e-300)) / 2 + 1)));

  derivedNode(ctx, N.memoryHorizon, 'Memory Horizon', 'intelligence',
    [{ id: N.cognitiveRate, relation: 'slower cognition → longer subjective horizon' }],
    'yr', SPECULATIVE('Time-span the mind integrates over (∝ 1/rate).'),
    'How far back/forward the mind reasons (slow minds think in deep time).',
    (i) => 1 / Math.max(i[N.cognitiveRate], 1e-300) / (365 * 86400));

  derivedNode(ctx, N.abstraction, 'Abstraction', 'intelligence',
    [{ id: N.intelligence, relation: 'intelligence enables abstraction' },
     { id: N.cognitiveBandwidth, relation: 'bandwidth supports abstraction' }],
    '0..1', SPECULATIVE('Capacity for abstract/symbolic thought.'),
    'Substrate for mathematics and technology.',
    (i) => c01(0.6 * i[N.intelligence] + 0.4 * i[N.cognitiveBandwidth]));

  derivedNode(ctx, N.energyUse, 'Energy Use', 'civilization',
    [{ id: N.technology, relation: 'technology consumes energy' },
     { id: N.population, relation: 'more minds use more energy' }],
    '0..1', KNOWN('Civilizational energy throughput.'),
    'Aggregate energy harnessed by the civilization.',
    (i) => c01(i[N.technology] * (0.5 + 0.5 * c01(i[N.population] / 12))));

  derivedNode(ctx, N.kardashev, 'Kardashev Level', 'civilization',
    [{ id: N.energyUse, relation: 'Kardashev scale measures energy use' },
     { id: N.technology, relation: 'technology level' }],
    'K', KNOWN('Kardashev-style classification (~0..3).'),
    'Energy-based civilization classification.',
    (i) => 3 * c01(0.6 * i[N.energyUse] + 0.4 * i[N.technology]));

  derivedNode(ctx, N.longevity, 'Civilization Longevity', 'civilization',
    [{ id: N.riskManagement, relation: 'governance extends longevity' },
     { id: N.kardashev, relation: 'advanced civilizations endure or self-destruct' }],
    '0..1', PLAUSIBLE('Expected persistence of the civilization.'),
    'Likelihood the civilization endures across deep time.',
    (i) => c01(0.6 * i[N.riskManagement] + 0.4 * (1 - Math.abs(i[N.kardashev] / 3 - 0.7))));

  derivedNode(ctx, N.resilience, 'Resilience', 'civilization',
    [{ id: N.longevity, relation: 'longevity reflects resilience' },
     { id: N.riskManagement, relation: 'active risk mitigation' },
     { id: N.surfaceShield, relation: 'environmental protection' }],
    '0..1', PLAUSIBLE('Resistance to shocks.'),
    'Capacity to absorb and recover from disasters.',
    (i) => c01(0.5 * i[N.longevity] + 0.3 * i[N.riskManagement] + 0.2 * i[N.surfaceShield]));

  derivedNode(ctx, N.climateFeedback, 'Climate Feedback', 'risk',
    [{ id: N.insolation, relation: 'insolation drives climate' },
     { id: N.atmDensity, relation: 'thick atmospheres amplify feedback' },
     { id: N.climateInstability, relation: 'baseline instability' }],
    '0..1', KNOWN('Climate feedback strength.'),
    'How strongly climate amplifies perturbations.',
    (i) => c01(0.4 * i[N.climateInstability] + 0.3 * c01(Math.abs(i[N.insolation] - 1)) + 0.3 * c01(i[N.atmDensity] / 5)));

  derivedNode(ctx, N.resourceDepletion, 'Resource Depletion', 'risk',
    [{ id: N.energyUse, relation: 'consumption depletes resources' },
     { id: N.riskManagement, relation: 'stewardship slows depletion' }],
    '0..1', PLAUSIBLE('Rate of resource exhaustion.'),
    'Pressure from finite resources.',
    (i) => c01(i[N.energyUse] * (1 - 0.6 * i[N.riskManagement])));

  derivedNode(ctx, N.survivalProbability, 'Survival Probability', 'risk',
    [{ id: N.extinction, relation: 'inverse of extinction risk' },
     { id: N.resilience, relation: 'resilience improves survival' },
     { id: N.resourceDepletion, relation: 'depletion lowers survival' }],
    '0..1', PLAUSIBLE('Probability the world persists with life intact.'),
    'Net survival outlook (headline risk metric).',
    (i) => c01((1 - i[N.extinction]) * (0.5 + 0.5 * i[N.resilience]) * (1 - 0.4 * i[N.resourceDepletion])));

  return { nodes: ctx.nodes, edges: ctx.edges };
}

// --- substrate helpers ------------------------------------------------------

function geneticsValue(substrate: string): number {
  // Fidelity proxy (0..1) per substrate.
  const map: Record<string, number> = {
    DNA: 0.95,
    RNA: 0.75,
    protein: 0.6,
    crystal: 0.5,
    magnetic: 0.4,
    none: 0.0,
  };
  return map[substrate] ?? 0.5;
}

function geneticsSci(substrate: string): ScientificConfidence {
  if (substrate === 'DNA' || substrate === 'RNA') return KNOWN(`${substrate} genetics is observed biology.`);
  if (substrate === 'protein') return PLAUSIBLE('Protein-based heredity is hypothesized.');
  return SPECULATIVE(`${substrate} genetics is speculative; no empirical basis.`);
}

function solventSci(solvent: string): ScientificConfidence {
  if (solvent === 'water') return KNOWN('Liquid-water biochemistry is established science.');
  if (solvent === 'ammonia' || solvent === 'methane') return PLAUSIBLE(`${solvent} biochemistry is actively researched.`);
  return SPECULATIVE(`${solvent} biochemistry is speculative.`);
}
