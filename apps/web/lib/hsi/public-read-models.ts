// =============================================================================
// HSI Phase 74.2 — Public read-model interface (declaration only). Names the
// read-optimized public models that a future D1 / edge-materialized read layer
// could serve. NONE are implemented yet — every model is served from primary
// today. This file exists so the routing layer and auditor can reason about
// future models without any backend work.
//
// TODO(read-models): when a public read backend lands, materialize each model
// (e.g. into D1 or an edge cache) and flip its `available` + `backend` here.
// Until then these remain primary-served and `available: false` as edge models.
// =============================================================================

import type { ReadBackend } from './read-backends';

export const PUBLIC_READ_MODELS = [
  'public_transparency_summary',
  'public_sources_summary',
  'public_global_map_points',
  'public_marketplace_catalog',
  'public_reports_index',
] as const;
export type PublicReadModel = (typeof PUBLIC_READ_MODELS)[number];

export interface PublicReadModelDescriptor {
  name: PublicReadModel;
  description: string;
  /** Where a materialized copy WOULD live; today everything is served by primary. */
  intendedBackend: ReadBackend;
  /** Whether a non-primary materialized model exists yet (always false for now). */
  available: boolean;
}

export const PUBLIC_READ_MODEL_REGISTRY: Record<PublicReadModel, PublicReadModelDescriptor> = {
  public_transparency_summary: { name: 'public_transparency_summary', description: 'Aggregate transparency overview (counts, accuracy, calibration).', intendedBackend: 'd1', available: false },
  public_sources_summary: { name: 'public_sources_summary', description: 'Public source registry summary (types, categories, health).', intendedBackend: 'd1', available: false },
  public_global_map_points: { name: 'public_global_map_points', description: 'Geo-ready map points for the public/global map.', intendedBackend: 'd1', available: false },
  public_marketplace_catalog: { name: 'public_marketplace_catalog', description: 'Published marketplace catalog index.', intendedBackend: 'cache', available: false },
  public_reports_index: { name: 'public_reports_index', description: 'Published reports index.', intendedBackend: 'cache', available: false },
};
