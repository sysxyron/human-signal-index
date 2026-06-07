import { z } from 'zod';

// =============================================================================
// @hsi/config — validated environment configuration for the Human Signal Index.
// Zod schema is the single source of truth. loadConfig() validates a raw env
// object and returns a typed, frozen config (fail fast on misconfiguration).
// =============================================================================

/** Supported AI providers. Pipeline behavior is chosen from this union. */
export const AI_PROVIDERS = ['openai', 'anthropic'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Default model per provider when AI_MODEL is not explicitly set. */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
};

export const appConfig = z.object({
  // --- Public app URLs -------------------------------------------------------
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),

  // --- Supabase --------------------------------------------------------------
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // --- Database --------------------------------------------------------------
  DATABASE_URL: z.string().url(),
  // Direct (non-pooled) connection used by Prisma migrate / introspection.
  DIRECT_URL: z.string().url().optional(),

  // --- AI provider -----------------------------------------------------------
  AI_PROVIDER: z.enum(AI_PROVIDERS).default('openai'),
  AI_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // --- Observability ---------------------------------------------------------
  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

  // --- Cloudflare Turnstile (bot/abuse protection) ---------------------------
  CLOUDFLARE_TURNSTILE_SITE_KEY: z.string().optional(),
  CLOUDFLARE_TURNSTILE_SECRET_KEY: z.string().optional(),

  // --- Worker / cron ---------------------------------------------------------
  CRON_SECRET: z.string().min(8),

  // --- Uploads & traceability ------------------------------------------------
  UPLOAD_MAX_MB: z
    .preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().min(1).max(500))
    .default(250),
  TRACEABILITY_MIN_CONFIDENCE: z
    .preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().min(0).max(1))
    .default(0.72),
});

export type AppConfig = z.infer<typeof appConfig>;

/** AI provider configuration slice, resolved with model defaults applied. */
export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey?: string;
  /** True when an API key for the selected provider is present. */
  enabled: boolean;
}

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Validate a raw environment object (defaults to process.env) and return a
 * frozen, typed config. Throws ConfigError on invalid/missing required vars.
 */
export function loadConfig(env: NodeJS.ProcessEnv | Record<string, unknown> = process.env): AppConfig {
  const parsed = appConfig.safeParse(env);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new ConfigError(`Invalid HSI configuration — ${summary}`, parsed.error.issues);
  }
  return Object.freeze(parsed.data);
}

/** Resolve the AI provider config slice (applies model defaults). */
export function getAiConfig(config: AppConfig): AiConfig {
  const provider = config.AI_PROVIDER;
  const apiKey = provider === 'openai' ? config.OPENAI_API_KEY : config.ANTHROPIC_API_KEY;
  return {
    provider,
    model: config.AI_MODEL ?? DEFAULT_MODELS[provider],
    apiKey,
    enabled: Boolean(apiKey),
  };
}

/** Typed accessor over an already-loaded config (avoids re-parsing). */
export function getConfigValue<K extends keyof AppConfig>(config: AppConfig, key: K): AppConfig[K] {
  return config[key];
}
