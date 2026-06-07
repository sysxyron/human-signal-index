// =============================================================================
// @hsi/ai-prompts — types
// All templates are FUNCTIONS that take typed inputs and return chat messages.
// Every template enforces HSI provenance + ethics rules (see system.ts).
// =============================================================================

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A declared source the model is allowed to cite. */
export interface PromptSource {
  id: string;
  /** Public URL the content was captured from. */
  url?: string;
  /** Captured public text (excerpt). */
  excerpt: string;
}

/** Common inputs shared by analysis prompts. */
export interface AnalysisInput {
  /** The PUBLIC content under analysis. */
  text: string;
  /** Declared sources the model may cite (provenance). */
  sources: PromptSource[];
}

/** Inputs for counter-narrative / public-education outputs. */
export interface CounterNarrativeInput extends AnalysisInput {
  /** The rhetoric/claim being responded to (argue against the IDEA). */
  targetClaim: string;
  /** Optional audience note (e.g. 'general public', 'educators'). */
  audience?: string;
  /** Optional rhetoric category slugs already identified. */
  categories?: string[];
}
