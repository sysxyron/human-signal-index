// =============================================================================
// @hsi/ai-prompts — public-education template set.
// One structured template that produces the full media-literacy breakdown:
// what the rhetoric says / assumes / leaves out / who is vulnerable / how to
// respond safely / questions for debate / historical context / AI ethics /
// biology-cosmos context. Provenance + safety enforced.
// =============================================================================

import { HSI_OUTPUT_CONTRACT, renderSources, withSystem } from './system';
import type { ChatMessage, CounterNarrativeInput } from './types';

/** Section keys produced by the public-education breakdown. */
export const PUBLIC_EDUCATION_SECTIONS = [
  'what_this_rhetoric_says',
  'what_it_assumes',
  'what_it_leaves_out',
  'who_is_vulnerable',
  'how_to_respond_safely',
  'questions_for_debate',
  'historical_context',
  'ai_ethics_context',
  'biology_cosmos_context',
] as const;

export type PublicEducationSection = (typeof PUBLIC_EDUCATION_SECTIONS)[number];

/** Full public-education breakdown for a piece of rhetoric. */
export function publicEducationBreakdownPrompt(input: CounterNarrativeInput): ChatMessage[] {
  return withSystem({
    role: 'user',
    content: `TASK: Produce a PUBLIC-EDUCATION breakdown of the rhetoric below for a media-literacy audience. This teaches the public to recognize and respond to the rhetoric — it does NOT target anyone.

${renderSources(input.sources)}

RHETORIC / CLAIM:
"""
${input.targetClaim}
"""

CONTEXT CONTENT:
"""
${input.text}
"""

AUDIENCE: ${input.audience ?? 'general public'}

Return these labeled sections:
1. What this rhetoric SAYS — plain restatement (cite [source-id]).
2. What it ASSUMES — the unstated premises.
3. What it LEAVES OUT — missing context/evidence/alternatives.
4. WHO IS VULNERABLE — which audiences are most at risk and why (no targeting of individuals).
5. HOW TO RESPOND SAFELY — constructive, non-confrontational responses; mental-health-safe; when to seek professional help.
6. QUESTIONS FOR DEBATE — 4-6 fair, probing questions.
7. HISTORICAL CONTEXT — accurate, trauma-aware parallels (cite where possible).
8. AI-ETHICS CONTEXT — relevant alignment/accountability considerations.
9. BIOLOGY / COSMOS CONTEXT — fact-grounded, hope-preserving reframe.

Argue against the idea, never a person. No harassment or mob incitement.

${HSI_OUTPUT_CONTRACT}`,
  });
}
