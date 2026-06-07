// =============================================================================
// @hsi/source-connectors — public web page capture connector (Playwright).
//
// HSI ETHICS — READ BEFORE EXTENDING:
//   * PUBLIC PAGES ONLY. Capture only what an anonymous visitor could see.
//   * NEVER log in, NEVER submit credentials, NEVER bypass paywalls/auth.
//   * RESPECT robots.txt (default on). Honor crawl-delay and Disallow.
//   * NEVER target or profile private individuals.
//
// Playwright is an OPTIONAL dependency. It is loaded via dynamic import so this
// package builds and the worker runs even when Playwright is not installed —
// in that case capturePublicPage() returns a clearly-labeled "unavailable"
// result instead of throwing at import time.
// =============================================================================

import { sha256Hex } from './hash';
import { assertPublicCapturePolicy, isAllowedByRobots } from './policy';
import type { CapturedSource, PublicPageCaptureOptions } from './types';
import { normalizeSourceUrl } from './url';

const USER_AGENT = 'HSI-PublicCapture/1.0 (+public-only; respects robots.txt)';

/** Optional fetch for robots.txt; injected for testability. */
export type RobotsFetch = (url: string) => Promise<string>;

async function fetchRobots(origin: string, fetchText: RobotsFetch): Promise<string> {
  try {
    return await fetchText(`${origin}/robots.txt`);
  } catch {
    return '';
  }
}

/** Minimal structural type for the slice of Playwright we use. */
interface PlaywrightLike {
  chromium: {
    launch: (opts?: { headless?: boolean }) => Promise<{
      newPage: () => Promise<{
        goto: (url: string, opts?: { timeout?: number; waitUntil?: string }) => Promise<unknown>;
        title: () => Promise<string>;
        content: () => Promise<string>;
        innerText: (selector: string) => Promise<string>;
      }>;
      close: () => Promise<void>;
    }>;
  };
}

async function loadPlaywright(): Promise<PlaywrightLike | null> {
  try {
    // @ts-ignore — optional dependency; may not be installed.
    const mod = await import('playwright');
    return mod as unknown as PlaywrightLike;
  } catch {
    return null;
  }
}

/** Strip tags to a plain-text approximation (used if no selector given). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PublicPageCaptureResult extends Partial<CapturedSource> {
  /** When false, Playwright was unavailable or capture was blocked by policy. */
  ok: boolean;
  reason?: string;
}

/**
 * Capture a single PUBLIC web page with Playwright.
 *  1. Enforce the public-only policy (throws on private/auth-gated URLs).
 *  2. Respect robots.txt (default).
 *  3. Render the page and extract text (selector optional).
 *  4. Return a normalized CapturedSource (hash + caller timestamp).
 *
 * Degrades gracefully: if Playwright is not installed, returns
 * { ok: false, reason: 'playwright-unavailable' } so callers can skip.
 */
export async function capturePublicPage(
  url: string,
  options: PublicPageCaptureOptions,
  deps: { fetchText?: RobotsFetch } = {},
): Promise<PublicPageCaptureResult> {
  // (1) Policy guard — throws CapturePolicyError on private/auth URLs.
  assertPublicCapturePolicy(url);
  const normalized = normalizeSourceUrl(url);
  const parsed = new URL(normalized);

  const fetchText: RobotsFetch =
    deps.fetchText ??
    (async (u: string) => {
      const res = await fetch(u, { headers: { 'user-agent': USER_AGENT } });
      return res.text();
    });

  // (2) robots.txt — default to respecting it. Policy disallows turning off.
  const respect = options.respectRobotsTxt !== false;
  if (respect) {
    const robots = await fetchRobots(parsed.origin, fetchText);
    if (!isAllowedByRobots(robots, USER_AGENT, parsed.pathname)) {
      return { ok: false, reason: 'blocked-by-robots-txt' };
    }
  }

  // (3) Render — Playwright is optional.
  const pw = await loadPlaywright();
  if (!pw) {
    return { ok: false, reason: 'playwright-unavailable' };
  }

  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(normalized, { timeout: options.timeoutMs ?? 30000, waitUntil: 'domcontentloaded' });
    const title = await page.title();
    const html = await page.content();
    const text = options.contentSelector
      ? await page.innerText(options.contentSelector).catch(() => htmlToText(html))
      : htmlToText(html);

    return {
      ok: true,
      connector: 'public_page',
      url: normalized,
      title,
      content: text,
      raw: html,
      hashDigest: await sha256Hex(text),
      capturedAt: options.capturedAt,
      metadata: { respectedRobotsTxt: respect, contentSelector: options.contentSelector ?? null },
    };
  } finally {
    await browser.close();
  }
}
