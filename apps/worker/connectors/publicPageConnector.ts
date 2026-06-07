// =============================================================================
// apps/worker/connectors — public web page connector (skeleton wrapper).
// Delegates to @hsi/source-connectors capturePublicPage (Playwright, optional).
// PUBLIC PAGES ONLY. Respects robots.txt. No login bypass.
// =============================================================================

import {
  capturePublicPage,
  type PublicPageCaptureResult,
} from '@hsi/source-connectors';

/**
 * Capture a single PUBLIC web page. Returns { ok:false } when Playwright is not
 * installed or robots.txt disallows — callers should skip, not crash.
 */
export async function fetchPublicPage(
  url: string,
  capturedAt: string,
  contentSelector?: string,
): Promise<PublicPageCaptureResult> {
  return capturePublicPage(url, { capturedAt, respectRobotsTxt: true, contentSelector });
}
