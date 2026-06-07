// =============================================================================
// @hsi/timeline-engine — public API
// generateTimeline(state, kind, span) emits ordered, log-scaled milestone events
// derived from a WorldState. Depends on @hsi/world-models + @hsi/simulation-engine.
// =============================================================================

export {
  generateTimeline,
  type TimelineKind,
  type TimelineEvent,
} from './timeline';
