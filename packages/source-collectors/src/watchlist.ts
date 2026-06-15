// =============================================================================
// Watchlist capture — PURE (fetch injected). Monitors public pages that have no
// RSS: fetch → extract readable text → normalize → hash → snapshot → diff. A
// signal is created upstream when the hash changes. No DB here.
// =============================================================================

// Deep submodule imports (NOT the barrel) so the Playwright-backed public-page
// connector never enters a web/client bundle that only needs hashing/RSS.
import { sha256Hex } from '@hsi/source-connectors/src/hash';
import { normalizeSourceUrl } from '@hsi/source-connectors/src/url';
import { assertPublicCapturePolicy } from '@hsi/source-connectors/src/policy';
import type { FetchText } from '@hsi/source-connectors/src/rssConnector';
import type { SourceDiff, WatchlistSnapshot } from './types';

/** Strip scripts/styles/tags + decode common entities → readable text. PURE. */
export function extractReadableText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = withoutBlocks
    .replace(/<\/(p|div|br|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Collapse whitespace deterministically for stable hashing. PURE. */
export function normalizeContent(text: string): string {
  return text.replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Build a snapshot (hash of normalized readable text) from raw page content. PURE-ish (await hash). */
export async function snapshotFromContent(url: string, rawHtml: string, capturedAt: string): Promise<WatchlistSnapshot> {
  const text = normalizeContent(extractReadableText(rawHtml));
  return { url, text, contentHash: await sha256Hex(text), capturedAt };
}

/** Diff a new snapshot against the previous hash + length. PURE. */
export function diffSnapshots(previous: { contentHash: string; length: number } | null, next: WatchlistSnapshot): SourceDiff {
  const newLength = next.text.length;
  const prevLength = previous?.length ?? 0;
  return {
    changed: previous == null || previous.contentHash !== next.contentHash,
    previousHash: previous?.contentHash ?? null,
    newHash: next.contentHash,
    previousLength: prevLength,
    newLength,
    addedChars: Math.max(0, newLength - prevLength),
    removedChars: Math.max(0, prevLength - newLength),
  };
}

/** Capture a watchlisted page: fetch → snapshot. Public-only policy enforced. */
export async function captureWatchlist(url: string, capturedAt: string, fetchText: FetchText): Promise<WatchlistSnapshot> {
  assertPublicCapturePolicy(url);
  const normalized = normalizeSourceUrl(url);
  const html = await fetchText(normalized);
  return snapshotFromContent(normalized, html, capturedAt);
}
