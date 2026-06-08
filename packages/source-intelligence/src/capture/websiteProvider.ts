// =============================================================================
// @hsi/source-intelligence — website capture provider (PUBLIC pages only).
//
// Fetches a PUBLIC URL via an INJECTED fetch (or a guarded global fetch when the
// caller opts in via allowNetwork). Extracts title, meta description, canonical
// URL and body text using minimal regex (no HTML-parser dependency). Computes a
// content hash for chain-of-custody. Enforces assertPublicCapturePolicy BEFORE
// any request. Never throws — capture() returns { ok:false } on any failure.
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { htmlToText } from '../internal/text';
import { CapturePolicyError, assertPublicCapturePolicy } from '../policy';
import type { CaptureProvider, CaptureResult } from '../types';
import { type CaptureDeps, resolveFetch } from './fetchDeps';

const PROVIDER = 'website';

/** Extract the first match of a regex group, or undefined. */
function first(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim() || undefined;
}

/** Pull <title>, meta description, and canonical link from raw HTML. */
export function extractHtmlMeta(html: string): {
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
} {
  const title = first(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription =
    first(
      html,
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
    ) ??
    first(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
    ) ??
    first(
      html,
      /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i,
    );
  const canonicalUrl =
    first(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ??
    first(html, /<link[^>]+href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
  return {
    title: title ? htmlToText(title) : undefined,
    metaDescription: metaDescription ? htmlToText(metaDescription) : undefined,
    canonicalUrl,
  };
}

/** Extract the readable body text from raw HTML (best-effort, dependency-free). */
export function extractBodyText(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return htmlToText(bodyMatch ? bodyMatch[1] : html);
}

/**
 * Build a website CaptureProvider. enabled() is always true (the provider
 * itself is available); whether a live request happens depends on injected
 * fetch / allowNetwork. Offline callers simply receive { ok:false }.
 */
export function websiteProvider(deps?: CaptureDeps): CaptureProvider {
  return {
    name: PROVIDER,
    sourceType: 'website',
    enabled: () => true,
    async capture(input): Promise<CaptureResult> {
      const { url, now } = input;
      if (!url) {
        return { ok: false, provider: PROVIDER, error: 'no url provided' };
      }
      // (1) Policy guard — PUBLIC pages only.
      try {
        assertPublicCapturePolicy(url);
      } catch (e) {
        const msg = e instanceof CapturePolicyError ? e.message : String(e);
        return { ok: false, provider: PROVIDER, error: msg };
      }
      // (2) Resolve a permitted fetch (null when offline / not allowed).
      const doFetch = resolveFetch(deps);
      if (!doFetch) {
        return {
          ok: false,
          provider: PROVIDER,
          error: 'network not enabled (inject fetchImpl or set allowNetwork)',
        };
      }
      // (3) Fetch + extract. Never throws out of capture().
      try {
        const res = await doFetch(url);
        if (!res.ok) {
          return { ok: false, provider: PROVIDER, error: `fetch failed ${res.status}` };
        }
        const html = await res.text();
        const meta = extractHtmlMeta(html);
        const bodyText = extractBodyText(html);
        const contentHash = await sha256Hex(bodyText);
        return {
          ok: true,
          provider: PROVIDER,
          doc: {
            url,
            title: meta.title,
            metaDescription: meta.metaDescription,
            canonicalUrl: meta.canonicalUrl,
            bodyText,
            capturedAt: now,
            contentHash,
            raw: html,
          },
        };
      } catch (e) {
        return { ok: false, provider: PROVIDER, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
