// =============================================================================
// providerHealth.ts — in-memory provider health tracking (WorldForge Phase 5).
//
// Records per-provider success/failure outcomes so the engine (and the host app)
// can introspect which retrieval backends are HEALTHY, DEGRADED, or OFFLINE.
// PURE aside from the injected clock — never calls Date.now()/Math.random().
// =============================================================================

import { DEFAULT_NOW } from './normalize';

/** Operational status derived from a provider's recent success/failure record. */
export type ProviderStatus = 'HEALTHY' | 'DEGRADED' | 'OFFLINE';

/** A snapshot of one provider's health. */
export interface ProviderHealth {
  /** Provider name (matches EvidenceProvider.name). */
  name: string;
  /** Whether the provider reports itself enabled (gated by key/email/mode). */
  enabled: boolean;
  /** Whether the provider is currently usable (enabled AND not fully failing). */
  available: boolean;
  /** ISO timestamp of the last recorded success (if any). */
  lastSuccess?: string;
  /** ISO timestamp of the last recorded failure (if any). */
  lastFailure?: string;
  /** Latency (ms) of the most recent successful call. */
  latencyMs?: number;
  /** Total failures recorded (within the rolling window). */
  errorCount: number;
  /** Total successes recorded (within the rolling window). */
  successCount: number;
  /** Derived operational status. */
  status: ProviderStatus;
}

/** Internal mutable per-provider record. */
interface HealthRecord {
  name: string;
  enabled: boolean;
  lastSuccess?: string;
  lastFailure?: string;
  latencyMs?: number;
  errorCount: number;
  successCount: number;
  /** Last error message (truncated) for diagnostics. */
  lastError?: string;
}

/** How many of the most-recent outcomes the window considers for DEGRADED. */
export const HEALTH_WINDOW = 10;

function statusFor(rec: HealthRecord): ProviderStatus {
  if (!rec.enabled) return 'OFFLINE';
  // Failing and never succeeded -> OFFLINE.
  if (rec.errorCount > 0 && rec.successCount === 0) return 'OFFLINE';
  // Some failures but also some successes -> DEGRADED.
  if (rec.errorCount > 0) return 'DEGRADED';
  return 'HEALTHY';
}

function availableFor(rec: HealthRecord): boolean {
  if (!rec.enabled) return false;
  return !(rec.errorCount > 0 && rec.successCount === 0);
}

/**
 * In-memory tracker of provider health. A single tracker instance is typically
 * shared across an engine run; the host app may also keep a long-lived one.
 */
export class ProviderHealthTracker {
  private readonly records = new Map<string, HealthRecord>();

  /** Pre-declare a provider's enabled state (so OFFLINE shows even before calls). */
  register(name: string, enabled: boolean): void {
    const rec = this.ensure(name);
    rec.enabled = enabled;
  }

  /** Record a successful call. `latencyMs` is the measured round-trip time. */
  recordSuccess(name: string, latencyMs: number, now: string = DEFAULT_NOW): void {
    const rec = this.ensure(name);
    rec.enabled = true;
    rec.successCount += 1;
    rec.latencyMs = latencyMs;
    rec.lastSuccess = now;
    // A success heals the window: drop the error tally back toward zero so a
    // provider that recovers eventually returns to HEALTHY.
    if (rec.errorCount > 0) rec.errorCount -= 1;
  }

  /** Record a failed call (timeout, non-ok, parse error, etc.). */
  recordFailure(name: string, now: string = DEFAULT_NOW, error?: string): void {
    const rec = this.ensure(name);
    rec.enabled = true;
    rec.errorCount = Math.min(rec.errorCount + 1, HEALTH_WINDOW);
    rec.lastFailure = now;
    if (error) rec.lastError = error.slice(0, 200);
  }

  /** A point-in-time snapshot of all known providers. */
  snapshot(): ProviderHealth[] {
    return [...this.records.values()]
      .map((rec) => ({
        name: rec.name,
        enabled: rec.enabled,
        available: availableFor(rec),
        lastSuccess: rec.lastSuccess,
        lastFailure: rec.lastFailure,
        latencyMs: rec.latencyMs,
        errorCount: rec.errorCount,
        successCount: rec.successCount,
        status: statusFor(rec),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Reset all recorded health (mainly for tests). */
  reset(): void {
    this.records.clear();
  }

  private ensure(name: string): HealthRecord {
    let rec = this.records.get(name);
    if (!rec) {
      rec = { name, enabled: false, errorCount: 0, successCount: 0 };
      this.records.set(name, rec);
    }
    return rec;
  }
}

/** A module-level default tracker the engine writes to when none is injected. */
export const defaultProviderHealthTracker = new ProviderHealthTracker();

/** Snapshot of the module-level default tracker. */
export function getProviderHealth(): ProviderHealth[] {
  return defaultProviderHealthTracker.snapshot();
}
