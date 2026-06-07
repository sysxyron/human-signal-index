// =============================================================================
// apps/worker/processors — signal processing pipeline.
//
// Provenance ladder (HSI core principle), enforced as discrete stages:
//   capture (public only) -> extract -> classify -> risk-score
//     -> traceability check -> MARK FOR HUMAN REVIEW
//
// HARD RULE: this pipeline NEVER auto-publishes. The terminal stage always
// leaves output in a human-review state. Publishing is a separate, human-gated
// action elsewhere.
// =============================================================================

import { analyzeText, type RhetoricResult, type RiskAssessment } from '@hsi/classifiers';
import {
  compareGeneratedAgainstSources,
  splitIntoPassages,
  type SourcePassage,
  type TraceabilityReport,
} from '@hsi/traceability';
import { signalExtractionPrompt, type PromptSource } from '@hsi/ai-prompts';
import type { CapturedSource } from '@hsi/source-connectors';
import type { AppConfig } from '@hsi/config';

import { getAiProvider } from './aiProvider';
import { logger } from '../src/logger';

export interface PipelineInput {
  /** Public material already captured by a connector. */
  capture: CapturedSource;
  /** Loaded, validated config (provides AI provider + traceability threshold). */
  config: AppConfig;
  /** ISO timestamp for this run (provenance) — passed in, not Date.now() here. */
  runAt: string;
}

export type PipelineStatus = 'pending_human_review';

export interface PipelineResult {
  /** Always 'pending_human_review' — the pipeline never auto-publishes. */
  status: PipelineStatus;
  capture: { url: string; hashDigest: string; capturedAt: string };
  /** Stage 2: AI extraction (draft summary), with provenance. */
  extraction: { summaryDraft: string; mocked: boolean; provenance: Record<string, unknown> };
  /** Stage 3: explainable rhetoric classification. */
  rhetoric: RhetoricResult;
  /** Stage 4: 1-5 defensive risk assessment. */
  risk: RiskAssessment;
  /** Stage 5: traceability of the AI summary against the captured source. */
  traceability: TraceabilityReport;
  /** Convenience flags surfaced to the review queue. */
  publishableByTraceability: boolean;
  requiresUrgentReview: boolean;
  runAt: string;
}

/**
 * Run the full pipeline for one captured public source.
 * Logs declared inputs at each stage (ICM — Inputs Clearly Marked).
 */
export async function processSignalSource(input: PipelineInput): Promise<PipelineResult> {
  const { capture, config, runAt } = input;
  const declaredInputs = {
    url: capture.url,
    hashDigest: capture.hashDigest,
    capturedAt: capture.capturedAt,
    connector: capture.connector,
  };

  // ---- Stage 1: capture (already done) — log declared inputs. ---------------
  logger.info('pipeline.capture', { stage: 1, declaredInputs });

  // ---- Stage 2: AI extraction (draft summary). ------------------------------
  const sources: PromptSource[] = [
    { id: capture.url, url: capture.url, excerpt: capture.content.slice(0, 4000) },
  ];
  const ai = getAiProvider(config);
  const messages = signalExtractionPrompt({ text: capture.content.slice(0, 8000), sources });
  const completion = await ai.complete({ messages, maxTokens: 800 });
  const summaryDraft = completion.text;
  logger.info('pipeline.extract', {
    stage: 2,
    declaredInputs: { sourceIds: sources.map((s) => s.id) },
    mocked: completion.mocked,
    provider: completion.provider,
  });

  // ---- Stage 3: classify rhetoric (explainable). ----------------------------
  const { rhetoric, risk } = analyzeText(capture.content);
  logger.info('pipeline.classify', {
    stage: 3,
    declaredInputs: { hashDigest: capture.hashDigest },
    topCategories: rhetoric.classifications.slice(0, 3).map((c) => c.slug),
  });

  // ---- Stage 4: risk score (1-5, defensive). --------------------------------
  logger.info('pipeline.risk', {
    stage: 4,
    declaredInputs: { hashDigest: capture.hashDigest },
    level: risk.level,
    recommendedAction: risk.recommendedAction,
  });

  // ---- Stage 5: traceability check (AI summary vs. declared source). --------
  const sourcePassages: SourcePassage[] = splitIntoPassages(capture.content).map((text, i) => ({
    id: `${capture.url}#${i}`,
    text,
    sourceUrl: capture.url,
  }));
  const generatedPassages = splitIntoPassages(summaryDraft).map((text, i) => ({
    id: `gen-${i}`,
    text,
  }));
  const traceability = compareGeneratedAgainstSources(generatedPassages, sourcePassages, runAt, {
    thresholds: { minPublishConfidence: config.TRACEABILITY_MIN_CONFIDENCE },
    note: `ai:${completion.provider}/${completion.mocked ? 'mock' : 'live'}`,
  });
  logger.info('pipeline.traceability', {
    stage: 5,
    declaredInputs: { sourcePassages: sourcePassages.length, generatedPassages: generatedPassages.length },
    traceabilityScore: Number(traceability.traceabilityScore.toFixed(3)),
    flaggedClaims: traceability.flaggedClaims.length,
    publishable: traceability.publishable,
  });

  // ---- Stage 6: STOP at human review. NEVER auto-publish. -------------------
  const requiresUrgentReview = risk.level >= 4;
  logger.info('pipeline.human_review_required', {
    stage: 6,
    status: 'pending_human_review',
    requiresUrgentReview,
    note: 'Pipeline never auto-publishes; awaiting human reviewer.',
  });

  return {
    status: 'pending_human_review',
    capture: { url: capture.url, hashDigest: capture.hashDigest, capturedAt: capture.capturedAt },
    extraction: { summaryDraft, mocked: completion.mocked, provenance: completion.provenance },
    rhetoric,
    risk,
    traceability,
    publishableByTraceability: traceability.publishable,
    requiresUrgentReview,
    runAt,
  };
}
