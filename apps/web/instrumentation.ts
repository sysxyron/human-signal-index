// =============================================================================
// Next.js startup instrumentation — runs once when the server process boots.
// Phase 14B: validate required/optional environment variables at startup and
// log readable warnings. NEVER logs secret VALUES (only key names + status).
// Required-missing → warning; required-invalid → warning; optional-missing →
// info (degraded, never blocks startup). Surfaced in /dashboard/security too.
// =============================================================================

export async function register(): Promise<void> {
  // Only run on the Node.js server runtime (not edge), and never throw.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { validateStartupEnv } = await import('./lib/env/validate-env');
    const result = validateStartupEnv(process.env as Record<string, string | undefined>);

    if (result.requiredMissing.length > 0) {
      console.warn(
        `[HSI startup] Missing REQUIRED env: ${result.requiredMissing.join(', ')} — ` +
          'the app may not function. See /dashboard/security and docs/deployment/cloudflare-supabase-auth.md.',
      );
    }
    for (const s of result.required) {
      if (s.present && !s.valid) {
        console.warn(`[HSI startup] Invalid env ${s.key}: ${s.message ?? 'invalid value'}`);
      }
    }
    if (result.optionalMissing.length > 0) {
      console.info(
        `[HSI startup] Optional env not set (related features degraded): ${result.optionalMissing.join(', ')}`,
      );
    }
    for (const w of result.warnings) {
      console.warn(`[HSI startup] ${w.message}`);
    }
    if (result.ok) {
      console.info('[HSI startup] Environment validation passed (all required vars present).');
    }
  } catch (err) {
    // Validation must never crash startup.
    console.warn('[HSI startup] Env validation skipped due to an error.', err);
  }
}
