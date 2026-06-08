// =============================================================================
// @hsi/causal-intelligence — narrative life-cycle milestones.
//
// detectNarrativeMilestones walks a narrative's time-ordered snapshot history
// and emits the milestones it reached. Every milestone is threshold-gated and
// its description is grounded in the actual numbers. Pure & deterministic.
//
// MILESTONES (each with confidence + metrics + occurredAt):
//   birth      — the first snapshot with any signals (the narrative appears).
//   growth     — a sustained rise: ≥ GROWTH_STEPS consecutive non-decreasing
//                signal steps with net rise ≥ GROWTH_NET_PCT%.
//   viral      — a sharp simultaneous signal surge (≥ VIRAL_SIGNAL_PCT%) AND
//                amplification jump (≥ VIRAL_AMP_DELTA) in one step.
//   peak       — the maximum signals/amplification point that is then followed
//                by a fall (a local/global high before decline).
//   decline    — a sustained drop: ≥ DECLINE_STEPS non-increasing steps with net
//                fall ≥ GROWTH_NET_PCT%.
//   death      — no new signals (flat/zero) for ≥ DEAD_STALE_DAYS up to `now`.
//   resurgence — a renewed rise (≥ RESURGENCE_PCT%) AFTER a decline/death.
// =============================================================================

import type {
  CausalEvent,
  CausalInput,
  MilestoneType,
  NarrativeMilestone,
  NarrativeSnapshot,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Documented thresholds --------------------------------------------------
export const GROWTH_STEPS = 2;
export const GROWTH_NET_PCT = 40;
export const VIRAL_SIGNAL_PCT = 100;
export const VIRAL_AMP_DELTA = 20;
export const DECLINE_STEPS = 2;
export const DEAD_STALE_DAYS = 21;
export const RESURGENCE_PCT = 50;

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function orderByTime(snaps: NarrativeSnapshot[]): NarrativeSnapshot[] {
  return [...snaps].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.id.localeCompare(b.id),
  );
}

function pct(from: number, to: number): number {
  return round(((to - from) / Math.max(1, from)) * 100, 0);
}

function mk(
  input: CausalInput,
  milestoneType: MilestoneType,
  occurredAt: string,
  confidence: number,
  description: string,
  metrics: Record<string, number>,
): NarrativeMilestone {
  return {
    id: `ms_${input.narrativeId}_${milestoneType}_${occurredAt}`,
    narrativeId: input.narrativeId,
    milestoneType,
    confidence: round(clamp01(confidence), 3),
    description,
    occurredAt,
    metrics,
    createdAt: input.now,
  };
}

/**
 * Detect a narrative's life-cycle milestones. Deterministic, threshold-gated.
 * `events` is accepted to ground viral/spike detection in already-detected
 * events when available (falls back to its own snapshot math otherwise).
 */
export function detectNarrativeMilestones(
  input: CausalInput,
  events: CausalEvent[],
): NarrativeMilestone[] {
  void events; // accepted by contract; milestones recompute from snapshots for independence.
  const snaps = orderByTime(input.snapshots);
  const out: NarrativeMilestone[] = [];
  if (snaps.length === 0) return out;

  // --- birth: first snapshot with any signals. -----------------------------
  const firstWithSignals = snaps.find((s) => s.signalCount > 0) ?? snaps[0];
  out.push(
    mk(
      input,
      'birth',
      firstWithSignals.capturedAt,
      0.85,
      `Narrative born with ${firstWithSignals.signalCount} signal${firstWithSignals.signalCount === 1 ? '' : 's'} across ${firstWithSignals.sourceCount} source${firstWithSignals.sourceCount === 1 ? '' : 's'}`,
      {
        signals: firstWithSignals.signalCount,
        sources: firstWithSignals.sourceCount,
      },
    ),
  );

  if (snaps.length < 2) return out;

  // Per-step deltas.
  const steps = snaps.slice(1).map((curr, i) => {
    const prev = snaps[i];
    return {
      prev,
      curr,
      sigPct: pct(prev.signalCount, curr.signalCount),
      sigDelta: curr.signalCount - prev.signalCount,
      ampDelta: round(curr.amplificationScore - prev.amplificationScore),
    };
  });

  // --- viral: a single step with sharp signal + amplification surge. -------
  for (const st of steps) {
    if (st.sigPct >= VIRAL_SIGNAL_PCT && st.ampDelta >= VIRAL_AMP_DELTA) {
      out.push(
        mk(
          input,
          'viral',
          st.curr.capturedAt,
          clamp01(0.6 + Math.min(st.sigPct, 400) / 800),
          `Went viral: signals +${st.sigPct}% (${st.prev.signalCount}→${st.curr.signalCount}) with amplification +${st.ampDelta} in one step`,
          {
            signalPct: st.sigPct,
            from: st.prev.signalCount,
            to: st.curr.signalCount,
            ampDelta: st.ampDelta,
          },
        ),
      );
    }
  }

  // --- growth: sustained non-decreasing rise. ------------------------------
  detectRuns(steps, 'up').forEach((run) => {
    const from = run.start.signalCount;
    const to = run.end.signalCount;
    const netPct = pct(from, to);
    if (run.length >= GROWTH_STEPS && netPct >= GROWTH_NET_PCT) {
      out.push(
        mk(
          input,
          'growth',
          run.end.capturedAt,
          clamp01(0.55 + Math.min(run.length, 4) / 10 + Math.min(netPct, 300) / 1000),
          `Sustained growth over ${run.length} steps: signals ${from}→${to} (+${netPct}%)`,
          { steps: run.length, from, to, netPct },
        ),
      );
    }
  });

  // --- peak: global max signals/amplification followed by a fall. ----------
  const maxSig = Math.max(...snaps.map((s) => s.signalCount));
  const peakIdx = snaps.findIndex((s) => s.signalCount === maxSig);
  if (peakIdx >= 0 && peakIdx < snaps.length - 1) {
    const after = snaps[peakIdx + 1];
    if (after.signalCount < maxSig) {
      const peak = snaps[peakIdx];
      out.push(
        mk(
          input,
          'peak',
          peak.capturedAt,
          clamp01(0.6 + Math.min(maxSig - after.signalCount, 50) / 100),
          `Peaked at ${maxSig} signals (amplification ${peak.amplificationScore}) before falling to ${after.signalCount}`,
          {
            peakSignals: maxSig,
            peakAmplification: peak.amplificationScore,
            nextSignals: after.signalCount,
          },
        ),
      );
    }
  }

  // --- decline: sustained non-increasing fall. -----------------------------
  detectRuns(steps, 'down').forEach((run) => {
    const from = run.start.signalCount;
    const to = run.end.signalCount;
    const netPct = pct(from, to);
    if (run.length >= DECLINE_STEPS && netPct <= -GROWTH_NET_PCT) {
      out.push(
        mk(
          input,
          'decline',
          run.end.capturedAt,
          clamp01(0.55 + Math.min(run.length, 4) / 10 + Math.min(Math.abs(netPct), 300) / 1000),
          `Sustained decline over ${run.length} steps: signals ${from}→${to} (${netPct}%)`,
          { steps: run.length, from, to, netPct },
        ),
      );
    }
  });

  // --- death: stale beyond DEAD_STALE_DAYS up to `now`. --------------------
  const last = snaps[snaps.length - 1];
  const staleDays = (Date.parse(input.now) - Date.parse(last.capturedAt)) / DAY_MS;
  if (staleDays >= DEAD_STALE_DAYS) {
    out.push(
      mk(
        input,
        'death',
        last.capturedAt,
        clamp01(0.5 + Math.min(staleDays / DEAD_STALE_DAYS, 3) / 6),
        `No new activity for ${Math.round(staleDays)} days (≥ ${DEAD_STALE_DAYS}) since last signals (${last.signalCount}) — considered dead`,
        { staleDays: Math.round(staleDays), lastSignals: last.signalCount },
      ),
    );
  }

  // --- resurgence: renewed rise AFTER a decline/death. ---------------------
  // Find the lowest trough that has a decline before it and a strong rise after.
  for (let i = 1; i < snaps.length - 1; i += 1) {
    const trough = snaps[i];
    const before = snaps[i - 1];
    const after = snaps[i + 1];
    const fellInto = trough.signalCount < before.signalCount;
    const risePct = pct(trough.signalCount, after.signalCount);
    if (fellInto && risePct >= RESURGENCE_PCT && after.signalCount > trough.signalCount) {
      out.push(
        mk(
          input,
          'resurgence',
          after.capturedAt,
          clamp01(0.55 + Math.min(risePct, 300) / 1000),
          `Resurged after a dip: signals recovered ${trough.signalCount}→${after.signalCount} (+${risePct}%) following a fall from ${before.signalCount}`,
          {
            trough: trough.signalCount,
            recoveredTo: after.signalCount,
            risePct,
            fellFrom: before.signalCount,
          },
        ),
      );
      break; // first resurgence is enough; deterministic.
    }
  }

  // Deterministic order: by time then milestone type.
  const ORDER: MilestoneType[] = [
    'birth',
    'growth',
    'viral',
    'peak',
    'decline',
    'death',
    'resurgence',
  ];
  return out.sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      ORDER.indexOf(a.milestoneType) - ORDER.indexOf(b.milestoneType),
  );
}

interface Run {
  start: NarrativeSnapshot;
  end: NarrativeSnapshot;
  length: number;
}

/**
 * Find maximal monotone runs of signal change. 'up' = non-decreasing with at
 * least one strict rise; 'down' = non-increasing with at least one strict fall.
 */
function detectRuns(
  steps: { prev: NarrativeSnapshot; curr: NarrativeSnapshot; sigDelta: number }[],
  dir: 'up' | 'down',
): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < steps.length) {
    const ok = (d: number) => (dir === 'up' ? d >= 0 : d <= 0);
    if (!ok(steps[i].sigDelta)) {
      i += 1;
      continue;
    }
    const start = steps[i].prev;
    let j = i;
    let strict = false;
    while (j < steps.length && ok(steps[j].sigDelta)) {
      if (steps[j].sigDelta !== 0) strict = true;
      j += 1;
    }
    const end = steps[j - 1].curr;
    const length = j - i;
    if (strict) runs.push({ start, end, length });
    i = j;
  }
  return runs;
}
