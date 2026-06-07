// =============================================================================
// @hsi/ai-prompts — Counter-Narrative Studio templates.
// Output formats that respond to harmful rhetoric by arguing against the IDEA,
// never the person. Every template enforces the shared HSI ethics rules and
// mental-health-safe framing.
// =============================================================================

import { HSI_OUTPUT_CONTRACT, renderSources, withSystem } from './system';
import type { ChatMessage, CounterNarrativeInput } from './types';

const sharedGuard = (input: CounterNarrativeInput) => `${renderSources(input.sources)}

TARGET CLAIM / RHETORIC TO RESPOND TO (argue against the IDEA, not any person):
"""
${input.targetClaim}
"""

CONTEXT CONTENT:
"""
${input.text}
"""

AUDIENCE: ${input.audience ?? 'general public'}
${input.categories?.length ? `IDENTIFIED CATEGORIES: ${input.categories.join(', ')}` : ''}

Rules for this output: respond to the idea, never to a private person; no harassment, doxxing, or mob incitement; cite declared sources with [source-id]; separate evidence from interpretation; keep mental-health-safe, hope-preserving framing.`;

/** Debate questions that probe the claim's assumptions. */
export function debateQuestionsPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Produce 6-10 sharp, fair DEBATE QUESTIONS that surface the hidden assumptions and weak points of the target claim.

${sharedGuard(input)}

Each question should be answerable, non-loaded, and aimed at the idea. Group as: assumptions, evidence, consequences, alternatives.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Short-form social post (single post). */
export function shortFormPostPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Draft ONE short-form post (<= 280 chars) that calmly counters the target claim with a verifiable point.

${sharedGuard(input)}

No outrage bait. One clear idea. Cite a source where natural.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Carousel outline (slide-by-slide). */
export function carouselOutlinePrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Outline a 6-8 slide CAROUSEL countering the target claim.

${sharedGuard(input)}

Per slide: a short headline + one supporting line. Slide 1 hook, last slide a constructive takeaway + "how to think critically" prompt. Cite sources on evidence slides.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Short video / TikTok script. */
export function tiktokScriptPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Write a 30-45 second SHORT-VIDEO script countering the target claim.

${sharedGuard(input)}

Format: [HOOK 0-3s] / [POINT] / [EVIDENCE with source] / [REFRAME] / [CALL TO REFLECT]. Calm, non-sensational tone. No alarmism, no targeting.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Long-form article. */
export function longFormArticlePrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Draft a long-form ARTICLE (800-1200 words) that examines and counters the target claim.

${sharedGuard(input)}

Structure: intro framing the claim fairly, what it gets right (steelman), where the evidence diverges (cited), the assumptions it relies on, a constructive alternative framing, and a closing on critical thinking. Keep it analytical, not polemical.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Public briefing note (Counter-Narrative variant). */
export function briefingNotePrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Write a 1-page PUBLIC BRIEFING NOTE for educators/journalists about the target claim.

${sharedGuard(input)}

Sections: What the rhetoric claims / Why it spreads / What the evidence shows (cited) / Responsible response guidance / Sources & limitations.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Educational explainer. */
export function educationalExplainerPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Write a neutral EDUCATIONAL EXPLAINER of the rhetoric in the target claim for a general audience.

${sharedGuard(input)}

Explain the idea fairly, its appeal, its logical structure, and how to evaluate it. Teach the reader to think, do not tell them what to conclude. No targeting.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Historical-trauma context. */
export function historicalTraumaContextPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Provide HISTORICAL-TRAUMA CONTEXT relevant to the target claim, treating documented historical suffering with care and accuracy.

${sharedGuard(input)}

Explain how similar rhetoric has appeared historically and what the documented record shows. Never minimize or erase real historical trauma. Cite sources. Be trauma-aware and non-sensational.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** AI-ethics rebuttal framing. */
export function aiEthicsRebuttalPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Provide an AI-ETHICS rebuttal to the target claim (esp. AI-savior / AI-suffering-optimization / technocratic-control framings).

${sharedGuard(input)}

Address: value alignment, the is/ought gap, who decides, fallibility and accountability, and why "let AI optimize away suffering/sentience" is not an ethically valid conclusion. Argue from ethics, cite where possible.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Cosmic / biology-level rebuttal framing. */
export function cosmicBiologyRebuttalPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Provide a COSMIC / BIOLOGY-LEVEL reframe of the target claim (e.g. responses to "all life is suffering" / efilism / extinctionism).

${sharedGuard(input)}

Draw on biology (life's resilience, cooperation, adaptation) and cosmology (rarity/value of conscious life) to offer a fact-grounded, hope-preserving counter-frame. Avoid pseudoscience; cite where possible; argue the idea, not people.

${HSI_OUTPUT_CONTRACT}`,
  });
}
