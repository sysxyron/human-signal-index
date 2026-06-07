-- =============================================================================
-- Human Signal Index — worldforge-seed.sql
-- Neutral demo seed for the WorldForge (Phase 2) simulation subsystem.
--
-- Inserts 2 PUBLIC demo worlds + their simulations:
--   1. "Earth (Reference)" — a standard-physics calibration baseline.
--   2. "Chronid Prime"     — a frozen super-earth whose subjective day ≈ 1000
--      Earth years; crystal genetics, geological neural networks, billion-year
--      civilization (an illustrative speculative-science demonstration world).
--
-- Each world gets a simulation, a version-1 snapshot, one example counterfactual,
-- and a couple of provenance rows. The jsonb here uses MINIMAL but valid
-- representative objects; the application writes the FULL canonical WorldState
-- (the engine's {id,name,universeType,star,planets[],chemistry,biology,
-- intelligence,civilization,risks,meta}). These placeholders only demonstrate
-- shape + publicity + provenance wiring.
--
-- Idempotent: guarded with NOT EXISTS checks on natural keys (world/sim name).
-- Safe to run multiple times. Run AFTER migrations 0001 -> 0005.
-- =============================================================================

do $$
declare
  earth_world_id    uuid;
  earth_sim_id      uuid;
  chronid_world_id  uuid;
  chronid_sim_id    uuid;
begin
  ---------------------------------------------------------------------------
  -- 1. Earth (Reference) — standard-physics calibration baseline
  ---------------------------------------------------------------------------
  select id into earth_world_id from public.worlds where name = 'Earth (Reference)';
  if earth_world_id is null then
    insert into public.worlds (name, description, universe_type, base_state, is_public, tags)
    values (
      'Earth (Reference)',
      'Standard-physics calibration baseline. Used to validate that WorldForge formulas reproduce known Earth/Sol values before exploring exotic worlds.',
      'standard-physics',
      jsonb_build_object(
        'id', 'earth-reference',
        'name', 'Earth (Reference)',
        'universeType', 'standard-physics',
        'star', jsonb_build_object('class', 'G2V', 'massSolar', 1.0, 'luminositySolar', 1.0),
        'planets', jsonb_build_array(
          jsonb_build_object('name', 'Earth', 'gravityG', 1.0, 'tempK', 288, 'hasLiquidWater', true)
        ),
        'chemistry', jsonb_build_object('solvent', 'water', 'metabolism', 'carbon-oxygen'),
        'biology', jsonb_build_object('genetics', 'dna', 'intelligenceTier', 'tool-using'),
        'civilization', jsonb_build_object('kardashev', 0.73),
        'risks', jsonb_build_array(),
        'meta', jsonb_build_object('note', 'Representative placeholder; app writes full canonical state.')
      ),
      true,
      array['demo','reference','standard-physics']
    )
    returning id into earth_world_id;
  end if;

  select id into earth_sim_id from public.simulations where name = 'Earth (Reference) — Baseline Run';
  if earth_sim_id is null then
    insert into public.simulations (world_id, name, universe_type, current_state, latest_version, status)
    select earth_world_id, 'Earth (Reference) — Baseline Run', 'standard-physics',
           w.base_state, 1, 'active'
    from public.worlds w where w.id = earth_world_id
    returning id into earth_sim_id;

    insert into public.simulation_versions (simulation_id, version, label, world_state, evaluation, parent_version)
    select earth_sim_id, 1, 'Initial calibration snapshot', s.current_state,
           jsonb_build_object('temporalAdaptationScore', 62, 'label', 'balanced',
                              'note', 'Illustrative; not peer-reviewed.'),
           null
    from public.simulations s where s.id = earth_sim_id;

    insert into public.counterfactuals
      (simulation_id, name, modification, impact_chain, explanation, confidence, affected_nodes, base_version)
    values (
      earth_sim_id,
      'What if Earth gravity were 3x?',
      jsonb_build_object('target', 'planet.gravityG', 'from', 1.0, 'to', 3.0),
      jsonb_build_array(
        jsonb_build_object('node', 'gravity', 'change', '1g -> 3g'),
        jsonb_build_object('node', 'atmosphere', 'change', 'denser; higher retention'),
        jsonb_build_object('node', 'biology.skeleton', 'change', 'shorter, heavier-boned morphologies favored'),
        jsonb_build_object('node', 'civilization.technology', 'change', 'flight + orbital launch much harder')
      ),
      'Tripling surface gravity raises atmospheric retention and equilibrium pressure, biases biology toward low, robust body plans, and sharply increases the energy cost of reaching orbit, gating spaceflight-dependent technology.',
      0.55,
      4,
      1
    );

    insert into public.simulation_provenance
      (simulation_id, node_id, source, reason, depends_on, confidence, scientific_tier)
    values
      (earth_sim_id, 'star.luminosity', 'stellar-model',
       'Luminosity from mass via L proportional to M^3.5 (main-sequence relation).',
       array['star.massSolar'], 0.95, 'known-science'),
      (earth_sim_id, 'planet.equilibriumTemp', 'climate-model',
       'Equilibrium temperature from luminosity, orbit distance, and albedo, with a greenhouse offset.',
       array['star.luminosity','planet.orbitDistance','planet.albedo'], 0.85, 'known-science');
  end if;

  ---------------------------------------------------------------------------
  -- 2. Chronid Prime — frozen super-earth, subjective day ~ 1000 Earth years
  ---------------------------------------------------------------------------
  select id into chronid_world_id from public.worlds where name = 'Chronid Prime';
  if chronid_world_id is null then
    insert into public.worlds (name, description, universe_type, base_state, is_public, tags)
    values (
      'Chronid Prime',
      'Illustrative speculative-science demonstration world: a frozen super-earth whose inhabitants experience a subjective "day" of roughly 1000 Earth years. Crystal-lattice genetics and geological-scale neural networks support a civilization measured in billions of years.',
      'alternative-constants',
      jsonb_build_object(
        'id', 'chronid-prime',
        'name', 'Chronid Prime',
        'universeType', 'alternative-constants',
        'star', jsonb_build_object('class', 'M-dwarf (dim, long-lived)', 'massSolar', 0.3, 'luminositySolar', 0.013),
        'planets', jsonb_build_array(
          jsonb_build_object('name', 'Chronid Prime', 'gravityG', 2.4, 'tempK', 64,
                             'hasLiquidWater', false, 'frozen', true)
        ),
        'chemistry', jsonb_build_object('solvent', 'ammonia/cryo', 'metabolism', 'silicate-lattice'),
        'biology', jsonb_build_object('genetics', 'crystal-lattice',
                                      'neuralSubstrate', 'geological-network',
                                      'intelligenceTier', 'deep-time-cognition'),
        'civilization', jsonb_build_object('ageYears', 1.0e9, 'kardashev', 1.2,
                                           'subjectiveDayEarthYears', 1000),
        'risks', jsonb_build_array(
          jsonb_build_object('kind', 'stellar-end-of-life', 'horizonYears', 1.0e11)
        ),
        'meta', jsonb_build_object('tier', 'speculative',
                                   'note', 'Illustrative placeholder; app writes full canonical state.')
      ),
      true,
      array['demo','speculative','chronid','deep-time']
    )
    returning id into chronid_world_id;
  end if;

  select id into chronid_sim_id from public.simulations where name = 'Chronid Prime — Deep-Time Run';
  if chronid_sim_id is null then
    insert into public.simulations (world_id, name, universe_type, current_state, latest_version, status)
    select chronid_world_id, 'Chronid Prime — Deep-Time Run', 'alternative-constants',
           w.base_state, 1, 'active'
    from public.worlds w where w.id = chronid_world_id
    returning id into chronid_sim_id;

    insert into public.simulation_versions (simulation_id, version, label, world_state, evaluation, parent_version)
    select chronid_sim_id, 1, 'Genesis snapshot (deep-time baseline)', s.current_state,
           jsonb_build_object('temporalAdaptationScore', 38,
                              'label', 'under-adapted',
                              'detail', 'Under-adapted to fast (sub-century) environmental change; balanced to geological-scale change.',
                              'note', 'Illustrative; not peer-reviewed.'),
           null
    from public.simulations s where s.id = chronid_sim_id;

    insert into public.world_timelines (simulation_id, kind, span_years, events)
    values (
      chronid_sim_id, 'civilization', 1.0e9,
      jsonb_build_array(
        jsonb_build_object('atYears', 0,        'event', 'Crystal-lattice replication stabilizes in cryogenic crust.'),
        jsonb_build_object('atYears', 1.0e7,    'event', 'Geological neural networks reach planetary scale.'),
        jsonb_build_object('atYears', 1.0e8,    'event', 'Deep-time civilization emerges; first subjective "day".'),
        jsonb_build_object('atYears', 1.0e9,    'event', 'Billion-year civilization; Kardashev ~1.2.')
      )
    );

    insert into public.counterfactuals
      (simulation_id, name, modification, impact_chain, explanation, confidence, affected_nodes, base_version)
    values (
      chronid_sim_id,
      'What if the host star were Sun-like (G2V)?',
      jsonb_build_object('target', 'star.class', 'from', 'M-dwarf', 'to', 'G2V'),
      jsonb_build_array(
        jsonb_build_object('node', 'star.lifetime', 'change', '~1e11 yr -> ~1e10 yr'),
        jsonb_build_object('node', 'planet.temp', 'change', 'thaws; cryo-chemistry fails'),
        jsonb_build_object('node', 'biology.substrate', 'change', 'geological neural network destabilizes'),
        jsonb_build_object('node', 'civilization.ageHorizon', 'change', 'billion-year deep-time arc no longer fits stellar lifetime')
      ),
      'A Sun-like star is far brighter and far shorter-lived. It would thaw Chronid Prime, breaking the cryogenic silicate chemistry the biology depends on, and would not last long enough to host a billion-year deep-time civilization.',
      0.4,
      4,
      1
    );

    insert into public.simulation_provenance
      (simulation_id, node_id, source, reason, depends_on, confidence, scientific_tier)
    values
      (chronid_sim_id, 'star.lifetime', 'stellar-model',
       'M-dwarf main-sequence lifetime scales as M/L, giving ~1e11+ yr — long enough for deep-time arcs.',
       array['star.massSolar','star.luminositySolar'], 0.9, 'known-science'),
      (chronid_sim_id, 'biology.neuralSubstrate', 'astrobiology-speculation',
       'Geological-scale neural networks on crystal-lattice genetics are a speculative substrate consistent with very slow, cold deep-time cognition.',
       array['chemistry.solvent','planet.tempK'], 0.25, 'speculative'),
      (chronid_sim_id, 'civilization.subjectiveDay', 'temporal-niche-engine',
       'Subjective "day" of ~1000 Earth years follows from a cognitive response rate matched to geological environmental change rate.',
       array['biology.neuralSubstrate','planet.tempK'], 0.2, 'speculative');
  end if;
end;
$$;

-- =============================================================================
-- End of worldforge-seed.sql
-- =============================================================================
