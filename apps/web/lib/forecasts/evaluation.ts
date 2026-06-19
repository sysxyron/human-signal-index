// =============================================================================
// HSI Phase 67 — Forecast evaluation (PURE, deterministic, no LLM).
//
// evaluatePrediction() compares a recorded prediction against a recorded outcome
// per prediction type and returns an explainable result + score (0–1) + rationale.
// brierScore() backs probability/binary scoring. Fully reproducible. PURE.
// =============================================================================

import type { PredictionType, PredictionValue, EvaluationResult } from './types';

export interface EvaluationVerdict { result: EvaluationResult; score: number | null; rationale: string }

/** Brier score for a probability p (0–1) against a binary outcome (0/1). Lower is better. */
export function brierScore(p: number, actualBinary: 0 | 1): number {
  const pp = Math.max(0, Math.min(1, p));
  return Math.round((pp - actualBinary) ** 2 * 1000) / 1000;
}

function s(v: unknown): string { return String(v ?? '').trim().toLowerCase(); }
function num(v: unknown): number | null { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : null; }
function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const t = s(v);
  if (['yes', 'true', '1', 'occurred', 'happened'].includes(t)) return true;
  if (['no', 'false', '0', 'did_not_occur', 'not_occurred'].includes(t)) return false;
  return null;
}

function isEmpty(o: PredictionValue): boolean { return !o || Object.keys(o).length === 0; }

/** Evaluate a prediction against an outcome. Returns `unresolved` when no outcome. */
export function evaluatePrediction(type: PredictionType, predicted: PredictionValue, actual: PredictionValue | null): EvaluationVerdict {
  if (!actual || isEmpty(actual)) return { result: 'unresolved', score: null, rationale: 'No outcome recorded yet.' };

  switch (type) {
    case 'binary':
    case 'event': {
      const pKey = type === 'event' ? predicted.willOccur ?? predicted.outcome : predicted.outcome ?? predicted.willOccur;
      const aKey = type === 'event' ? actual.occurred ?? actual.outcome : actual.outcome ?? actual.occurred;
      const pb = bool(pKey); const ab = bool(aKey);
      if (pb == null || ab == null) return { result: 'unresolved', score: null, rationale: 'Outcome not interpretable as yes/no.' };
      const correct = pb === ab;
      return { result: correct ? 'correct' : 'incorrect', score: correct ? 1 : 0, rationale: `Predicted ${pb ? 'yes' : 'no'}, actual ${ab ? 'yes' : 'no'}.` };
    }
    case 'probability': {
      const p = num(predicted.probability ?? predicted.value);
      const ab = bool(actual.outcome ?? actual.occurred);
      if (p == null || ab == null) return { result: 'unresolved', score: null, rationale: 'Probability or outcome missing.' };
      const actualBin: 0 | 1 = ab ? 1 : 0;
      const brier = brierScore(p, actualBin);
      const correct = (p >= 0.5) === (actualBin === 1);
      return { result: correct ? 'correct' : 'incorrect', score: Math.round((1 - brier) * 1000) / 1000, rationale: `p=${p} vs actual ${ab ? 'yes' : 'no'} (Brier ${brier}).` };
    }
    case 'multi-outcome':
    case 'narrative':
    case 'trend': {
      const pv = s(predicted.option ?? predicted.direction ?? predicted.value);
      const av = s(actual.option ?? actual.direction ?? actual.value);
      if (!pv || !av) return { result: 'unresolved', score: null, rationale: 'Predicted/actual option missing.' };
      const correct = pv === av;
      return { result: correct ? 'correct' : 'incorrect', score: correct ? 1 : 0, rationale: `Predicted "${pv}", actual "${av}".` };
    }
    case 'range': {
      const min = num(predicted.min); const max = num(predicted.max); const v = num(actual.value);
      if (min == null || max == null || v == null) return { result: 'unresolved', score: null, rationale: 'Range bounds or actual value missing.' };
      if (v >= min && v <= max) return { result: 'correct', score: 1, rationale: `Actual ${v} within [${min}, ${max}].` };
      const span = Math.max(1e-9, max - min);
      const dist = v < min ? min - v : v - max;
      if (dist <= span * 0.1) return { result: 'partial', score: 0.5, rationale: `Actual ${v} just outside [${min}, ${max}] (within 10%).` };
      return { result: 'incorrect', score: 0, rationale: `Actual ${v} outside [${min}, ${max}].` };
    }
    default:
      return { result: 'unresolved', score: null, rationale: 'Unknown prediction type.' };
  }
}
