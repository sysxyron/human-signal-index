// =============================================================================
// @hsi/ai-prompts — analysis pipeline templates.
// signal extraction, rhetoric classification, risk scoring, traceability
// review, public briefing. Each returns provenance-enforcing ChatMessage[].
// =============================================================================

import { HSI_OUTPUT_CONTRACT, renderSources, withSystem } from './system';
import type { AnalysisInput, ChatMessage } from './types';

/** Extract the central signal from public content, citing source evidence. */
export function signalExtractionPrompt(input: AnalysisInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Extract the central SIGNAL from the public content below.

${renderSources(input.sources)}

CONTENT UNDER ANALYSIS:
"""
${input.text}
"""

Provide:
1. SIGNAL (one sentence): the core claim/behavior worth tracking.
2. EVIDENCE: direct quotes with [source-id] for each.
3. EXTRACTION: neutral restatement of what the source says (no interpretation).
4. INTERPRETATION: what it may indicate (clearly labeled as interpretation).
5. CANDIDATE CATEGORIES: likely rhetoric categories (slugs) with a one-line why.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Classify rhetoric against the supplied taxonomy, with cited evidence. */
export function rhetoricClassificationPrompt(
  input: AnalysisInput & { taxonomy: { slug: string; label: string; description: string }[] },
): ChatMessage[] {
  const taxo = input.taxonomy.map((c) => `- ${c.slug} (${c.label}): ${c.description}`).join('\n');
  return withSystem({
    role: 'user',
    content: `TASK: Classify the rhetoric in the content below using ONLY the taxonomy provided. Do not invent categories.

TAXONOMY:
${taxo}

${renderSources(input.sources)}

CONTENT:
"""
${input.text}
"""

For each applicable category, return: slug, a 0..1 confidence, and the exact matched quote with [source-id]. Rank by confidence. If nothing applies, say so. Explain each match (auditable, not a verdict).

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Assign a 1-5 risk level with a cited quote and recommended action. */
export function riskScoringPrompt(input: AnalysisInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Assign a DEFENSIVE risk level (1-5) to the content below. This is triage for human safeguarding review, NOT a verdict.

RISK MODEL:
1 = philosophical discussion
2 = pessimistic rhetoric
3 = recruitment / activism
4 = vulnerable-person targeting or self-harm-adjacent
5 = explicit harm encouragement / coercive / operational danger

${renderSources(input.sources)}

CONTENT:
"""
${input.text}
"""

Return: level (1-5), the verbatim matchedQuote with [source-id], explanation, 0..1 confidence, recommendedAction. Be conservative. Do NOT reproduce harmful methods. Add a mental-health-safe note if level >= 4.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Map generated text back to sources and flag unsupported claims. */
export function traceabilityReviewPrompt(
  input: { generated: string; sources: AnalysisInput['sources'] },
): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Verify traceability. Map each sentence of the GENERATED text to the declared sources.

${renderSources(input.sources)}

GENERATED TEXT:
"""
${input.generated}
"""

For each sentence return: the sentence, best [source-id] (or NONE), a support label (supported | weakly_supported | unsupported | imported_knowledge), and the matched span. List every unsupported/imported_knowledge sentence under "FLAGGED — must attribute or remove". Recommend whether this is publishable.

${HSI_OUTPUT_CONTRACT}`,
  });
}

/** Produce a public-safe briefing without exposing private evidence. */
export function publicBriefingPrompt(input: AnalysisInput & { title?: string }): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Write a PUBLIC-SAFE briefing about the signal below for a general audience.

${renderSources(input.sources)}

CONTENT:
"""
${input.text}
"""

Structure:
- Summary (2-3 sentences)
- What we observed (cited, [source-id])
- Why it matters (interpretation, labeled)
- How to read this critically (media literacy)
- Sources & limitations

Do not reveal private evidence, do not name private individuals, argue against the idea not people, keep framing hope-preserving.

${HSI_OUTPUT_CONTRACT}`,
  });
}
