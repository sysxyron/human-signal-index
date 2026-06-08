// =============================================================================
// @hsi/source-intelligence — document capture provider.
//
// Accepts raw text (e.g. an uploaded/pasted PUBLIC document's extracted text)
// and normalizes it into a CapturedDoc. No network. The caller is responsible
// for only submitting PUBLIC material — this provider does not fetch anything.
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { normalizeWhitespace, snippet } from '../internal/text';
import type { CaptureProvider, CaptureResult } from '../types';

const PROVIDER = 'document';

/** Build a document CaptureProvider (offline; consumes rawText). */
export function documentProvider(): CaptureProvider {
  return {
    name: PROVIDER,
    sourceType: 'document',
    enabled: () => true,
    async capture(input): Promise<CaptureResult> {
      const { rawText, now, url } = input;
      const text = rawText ? normalizeWhitespace(rawText) : '';
      if (!text) {
        return { ok: false, provider: PROVIDER, error: 'no document text provided' };
      }
      return {
        ok: true,
        provider: PROVIDER,
        doc: {
          url,
          title: snippet(text, 80),
          bodyText: text,
          capturedAt: now,
          contentHash: await sha256Hex(text),
          raw: rawText,
        },
      };
    },
  };
}
