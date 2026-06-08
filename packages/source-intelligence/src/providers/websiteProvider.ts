// =============================================================================
// @hsi/source-intelligence — website PROVIDER (Phase 9; PUBLIC pages only).
//
// captureWebsite(url, deps) fetches a PUBLIC page through the hardened http
// wrapper (timeout + max-bytes + policy guard), extracts title/meta/canonical/
// body (reusing the Phase-7 extractors) and computes a content hash. method
// 'website'. NEVER throws.
//
// CRITICAL — anti-bot / challenge detection: a Cloudflare/hCaptcha/Turnstile
// "challenge" page is NOT real content. Capturing it would poison the corpus, so
// when we recognize challenge markers we return reason 'blocked' (a soft,
// recoverable signal for the orchestrator) rather than a hard failure or — worse
// — a fake CapturedItem. We NEVER attempt to solve or bypass a challenge.
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { extractBodyText, extractHtmlMeta } from '../capture/websiteProvider';
import type { CapturedItem, ProviderDeps, ProviderResult } from './types';
import { fetchPublicText } from './http';

const METHOD = 'website';

/**
 * Lowercased markers of an anti-bot / JS-challenge interstitial. Presence of any
 * of these (in HTML that is otherwise content-thin) means we were served a
 * challenge, not the page → reason 'blocked'.
 */
const CHALLENGE_MARKERS = [
  'just a moment...',
  'cf-challenge',
  'cf-browser-verification',
  'attention required',
  'enable javascript and cookies to continue',
  'checking if the site connection is secure',
  'challenges.cloudflare.com',
  'hcaptcha',
  'h-captcha',
  'cf-turnstile',
  'turnstile',
  'ddos protection by',
  '_cf_chl_opt',
];

/** True when the HTML looks like an anti-bot/JS challenge interstitial. */
export function isChallengePage(html: string): boolean {
  const lower = html.toLowerCase();
  return CHALLENGE_MARKERS.some((m) => lower.includes(m));
}

/**
 * Capture a single PUBLIC web page into a CapturedItem. Returns reason 'blocked'
 * when an anti-bot challenge is detected (never a fabricated item). Never throws.
 */
export async function captureWebsite(
  url: string,
  deps: ProviderDeps,
): Promise<ProviderResult<CapturedItem>> {
  const fetched = await fetchPublicText(url, deps);
  if (!fetched.ok) return fetched;

  const html = fetched.data.text;
  if (isChallengePage(html)) {
    return {
      ok: false,
      reason: 'blocked',
      message:
        'anti-bot / JS challenge detected (Cloudflare/Turnstile/hCaptcha); ' +
        'refusing to capture challenge HTML. We never bypass challenges.',
    };
  }

  let meta;
  let bodyText: string;
  try {
    meta = extractHtmlMeta(html);
    bodyText = extractBodyText(html);
  } catch (e) {
    return { ok: false, reason: 'parse_error', message: e instanceof Error ? e.message : String(e) };
  }

  const item: CapturedItem = {
    title: meta.title ?? url,
    url,
    canonicalUrl: meta.canonicalUrl,
    summary: meta.metaDescription,
    bodyText,
    contentHash: await sha256Hex(bodyText),
  };
  return { ok: true, method: METHOD, data: item };
}
