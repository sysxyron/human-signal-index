// =============================================================================
// apps/worker/connectors — RSS connector (thin wrapper).
// Delegates to the production @hsi/source-connectors package so the worker and
// the rest of the platform share one ethical, public-only implementation.
// =============================================================================

import { captureRssFeed, type CapturedSource } from '@hsi/source-connectors';

/**
 * Fetch + normalize a PUBLIC RSS/Atom feed into a CapturedSource.
 * @param url        Public feed URL (policy-guarded by the connector).
 * @param capturedAt ISO timestamp (provenance) — passed in, not generated here.
 */
export async function fetchRss(url: string, capturedAt: string): Promise<CapturedSource> {
  return captureRssFeed(url, { capturedAt });
}
