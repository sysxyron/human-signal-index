// =============================================================================
// nli/llmClassifier.ts — optional live NLI classifier via OpenAI chat (Phase 5).
//
// Gated by `openaiApiKey`. On absence OR any failure (no key, no fetch, network
// error, bad JSON) it FALLS BACK to the deterministic heuristic classifier and
// NEVER throws. The prompt instructs the model to PRESERVE UNCERTAINTY and to
// not over-claim support for speculative/fictional claims.
//
// OpenAI endpoint: https://api.openai.com/v1/chat/completions
// =============================================================================

import type { Claim } from '@hsi/research-agents';
import type { EvidenceEngineConfig, EvidenceResult, SupportType } from '../types';
import { clamp01 } from '../score';
import type { SupportClassification, SupportClassifier } from './types';
import { classifyHeuristic } from './heuristicClassifier';
import type { FetchImpl, MillisClock } from '../providers/http';
import type { ProviderHealthTracker } from '../providerHealth';

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions';
const CHAT_MODEL = 'gpt-4o-mini';
const HEALTH_NAME = 'OpenAI Chat (NLI)';

/** Injectable deps for the LLM classifier. */
export interface LlmClassifierDeps {
  fetchImpl?: FetchImpl;
  clock?: MillisClock;
  now?: string;
  healthTracker?: ProviderHealthTracker;
  /** Override the chat model. */
  model?: string;
}

const SYSTEM_PROMPT =
  'You classify how a scientific source relates to a claim. ' +
  'Respond ONLY with compact JSON: {"classification":"supports|contradicts|background|unclear","confidence":0..1,"rationale":"<short>"}. ' +
  'Preserve uncertainty: if the source does not clearly affirm or contradict the claim, return "background" or "unclear" with low confidence. ' +
  'Do NOT mark "supports" for speculative or fictional claims unless the source explicitly affirms them.';

function coerceClassification(value: unknown): SupportType {
  if (
    value === 'supports' ||
    value === 'contradicts' ||
    value === 'background' ||
    value === 'unclear'
  ) {
    return value;
  }
  return 'unclear';
}

/**
 * Create an LLM-backed classifier. Without a key (or on any failure) it returns
 * the heuristic classification — so it is always safe to construct.
 */
export function createLlmClassifier(
  cfg: EvidenceEngineConfig,
  deps: LlmClassifierDeps = {},
): SupportClassifier {
  const apiKey = cfg.openaiApiKey;
  const model = deps.model ?? CHAT_MODEL;
  const fetchImpl =
    deps.fetchImpl ??
    ((globalThis as { fetch?: FetchImpl }).fetch?.bind(globalThis) as
      | FetchImpl
      | undefined);

  const live = Boolean(apiKey && fetchImpl);

  return {
    name: live ? `llm(${model})` : 'llm(fallback:heuristic)',
    mode: live ? 'live' : 'fixture',
    async classify(claim, result, relevance): Promise<SupportClassification> {
      const fallback = classifyHeuristic(claim, result, relevance);
      if (!apiKey || !fetchImpl) return fallback;

      const clock = deps.clock ?? (() => 0);
      const start = clock();
      try {
        const userPrompt =
          `Claim (tier=${claim.tier}): ${claim.text}\n\n` +
          `Source: ${result.title}\n${result.abstract ?? ''}`;
        const res = await fetchImpl(OPENAI_CHAT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        if (!res.ok) throw new Error(`http-${res.status}`);
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content ?? '';
        const parsed = JSON.parse(content) as {
          classification?: unknown;
          confidence?: unknown;
          rationale?: unknown;
        };
        deps.healthTracker?.recordSuccess(HEALTH_NAME, clock() - start, deps.now);

        const classification = coerceClassification(parsed.classification);
        const confidence =
          typeof parsed.confidence === 'number'
            ? clamp01(parsed.confidence)
            : fallback.confidence;
        const rationale =
          typeof parsed.rationale === 'string' && parsed.rationale.length > 0
            ? parsed.rationale
            : 'LLM classification.';

        // Honesty guardrail: even a live model cannot upgrade an ungrounded
        // claim to 'supports' unless the heuristic (curated stance) allows it.
        if (
          classification === 'supports' &&
          fallback.classification !== 'supports' &&
          (claim.tier === 'speculative' ||
            claim.tier === 'fictional' ||
            claim.tier === 'violates-known-physics')
        ) {
          return {
            classification: 'background',
            confidence: Math.min(confidence, 0.4),
            rationale: `${rationale} (Honesty-capped: ungrounded claim not affirmed on this evidence.)`,
          };
        }
        return { classification, confidence, rationale };
      } catch (err) {
        deps.healthTracker?.recordFailure(
          HEALTH_NAME,
          deps.now,
          err instanceof Error ? err.message : String(err),
        );
        return fallback; // never throw — degrade to heuristic
      }
    },
  };
}
