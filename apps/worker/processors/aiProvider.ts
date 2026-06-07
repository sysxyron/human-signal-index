// =============================================================================
// apps/worker — AI provider abstraction.
// A common complete() interface over OpenAI / Anthropic-compatible APIs.
// Provider is chosen by AI_PROVIDER. If no API key is present, returns a
// clearly-labeled MOCK completion so the pipeline runs end-to-end in dev/CI
// without external calls. SDKs are loaded via dynamic import (no hard dep).
// =============================================================================

import { getAiConfig, type AppConfig } from '@hsi/config';
import type { ChatMessage } from '@hsi/ai-prompts';

export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  /** True when this is a mock (no API key / SDK absent). */
  mocked: boolean;
  /** Provenance for the ai_run record. */
  provenance: Record<string, unknown>;
}

export interface AiProviderClient {
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

function mockResult(provider: string, model: string, req: CompletionRequest): CompletionResult {
  const userMsg = [...req.messages].reverse().find((m) => m.role === 'user');
  return {
    text:
      '[MOCK COMPLETION — no API key configured]\n' +
      'DRAFT — pending human review.\n' +
      `(Would have sent ${req.messages.length} messages; last user task: ` +
      `${(userMsg?.content ?? '').slice(0, 120)}...)`,
    provider,
    model,
    mocked: true,
    provenance: { mocked: true, messageCount: req.messages.length },
  };
}

/** OpenAI-compatible client (chat completions) via dynamic import. */
function makeOpenAi(apiKey: string, model: string): AiProviderClient {
  return {
    async complete(req) {
      try {
        // @ts-ignore optional dep
        const mod = await import('openai');
        const OpenAI = mod.default ?? mod;
        const client = new OpenAI({ apiKey });
        const res = await client.chat.completions.create({
          model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
        });
        const text = res.choices?.[0]?.message?.content ?? '';
        return {
          text,
          provider: 'openai',
          model,
          mocked: false,
          provenance: { provider: 'openai', model, usage: res.usage ?? null },
        };
      } catch (err) {
        // SDK missing or call failed → mock so the pipeline still completes.
        return { ...mockResult('openai', model, req), provenance: { error: String((err as Error)?.message ?? err) } };
      }
    },
  };
}

/** Anthropic client via dynamic import. */
function makeAnthropic(apiKey: string, model: string): AiProviderClient {
  return {
    async complete(req) {
      try {
        // @ts-ignore optional dep
        const mod = await import('@anthropic-ai/sdk');
        const Anthropic = mod.default ?? mod;
        const client = new Anthropic({ apiKey });
        const system = req.messages.find((m) => m.role === 'system')?.content;
        const turns = req.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }) as { role: 'user' | 'assistant'; content: string });
        const res = await client.messages.create({
          model,
          system,
          messages: turns,
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
        });
        const text = Array.isArray(res.content)
          ? res.content.map((c: any) => c.text ?? '').join('')
          : '';
        return {
          text,
          provider: 'anthropic',
          model,
          mocked: false,
          provenance: { provider: 'anthropic', model, usage: res.usage ?? null },
        };
      } catch (err) {
        return { ...mockResult('anthropic', model, req), provenance: { error: String((err as Error)?.message ?? err) } };
      }
    },
  };
}

/** Resolve the configured AI provider client. Mocks gracefully without a key. */
export function getAiProvider(config: AppConfig): AiProviderClient {
  const ai = getAiConfig(config);
  if (!ai.enabled) {
    return { complete: async (req) => mockResult(ai.provider, ai.model, req) };
  }
  return ai.provider === 'anthropic'
    ? makeAnthropic(ai.apiKey!, ai.model)
    : makeOpenAi(ai.apiKey!, ai.model);
}
