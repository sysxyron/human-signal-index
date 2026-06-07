// =============================================================================
// @hsi/ai-prompts — public API
// A provenance-enforcing prompt library for the Human Signal Index. Every
// template is a typed function returning ChatMessage[] with the HSI system
// prompt prepended (cite sources, separate evidence/interpretation, argue ideas
// not people, no harassment/doxxing, mental-health-safe framing).
//
// __examples__
//   import { signalExtractionPrompt, HSI_SYSTEM_PROMPT } from '@hsi/ai-prompts';
//   const messages = signalExtractionPrompt({ text, sources: [{ id: 'src-1', excerpt }] });
// =============================================================================

export * from './types';
export * from './system';
export * from './analysis';
export * from './counter-narrative';
export * from './public-education';

import {
  publicBriefingPrompt,
  rhetoricClassificationPrompt,
  riskScoringPrompt,
  signalExtractionPrompt,
  traceabilityReviewPrompt,
} from './analysis';
import {
  aiEthicsRebuttalPrompt,
  briefingNotePrompt,
  carouselOutlinePrompt,
  cosmicBiologyRebuttalPrompt,
  debateQuestionsPrompt,
  educationalExplainerPrompt,
  historicalTraumaContextPrompt,
  longFormArticlePrompt,
  shortFormPostPrompt,
  tiktokScriptPrompt,
} from './counter-narrative';
import { publicEducationBreakdownPrompt } from './public-education';

/**
 * Backward-compatible string keys (the original stub). Kept so existing imports
 * of `prompts.signalExtraction` keep working. New code should use the typed
 * template functions exported above.
 */
export const prompts = {
  signalExtraction:
    'Analyze the public content and extract the central signal, reference any explicit source material, and classify it by category. Cite source evidence and separate evidence from interpretation.',
  rhetoricClassification:
    'Review the supplied text and classify it using the provided rhetoric taxonomy. Provide categories, matched quotes, explanation, and an evidence-based confidence score.',
  riskScoring:
    'Assign a defensive risk score from 1 to 5, summarize why, provide a cited quote, confidence, and recommended action. Label any vulnerable-audience or self-harm-adjacent signals; never include harmful methods.',
  traceabilityReview:
    'Map each generated sentence to the original source passages, identify any unsupported claims, and flag any unattributed or imported knowledge before publication.',
  publicBriefing:
    'Create a public-safe report with a summary, source citations, risk explanation, and educational context without revealing private evidence or naming private individuals.',
} as const;

/** Registry of all typed prompt-template functions, by key. */
export const promptTemplates = {
  // analysis pipeline
  signalExtraction: signalExtractionPrompt,
  rhetoricClassification: rhetoricClassificationPrompt,
  riskScoring: riskScoringPrompt,
  traceabilityReview: traceabilityReviewPrompt,
  publicBriefing: publicBriefingPrompt,
  // counter-narrative studio
  debateQuestions: debateQuestionsPrompt,
  shortFormPost: shortFormPostPrompt,
  carouselOutline: carouselOutlinePrompt,
  tiktokScript: tiktokScriptPrompt,
  longFormArticle: longFormArticlePrompt,
  briefingNote: briefingNotePrompt,
  educationalExplainer: educationalExplainerPrompt,
  historicalTraumaContext: historicalTraumaContextPrompt,
  aiEthicsRebuttal: aiEthicsRebuttalPrompt,
  cosmicBiologyRebuttal: cosmicBiologyRebuttalPrompt,
  // public education
  publicEducationBreakdown: publicEducationBreakdownPrompt,
} as const;

export type PromptTemplateKey = keyof typeof promptTemplates;
