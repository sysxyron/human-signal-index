// =============================================================================
// @hsi/source-intelligence — content hashing (chain of custody).
// Uses WebCrypto (globalThis.crypto.subtle) — available in Node 20+, browsers,
// and edge runtimes — then a clearly-labeled non-cryptographic FNV-1a fallback.
// Deliberately avoids importing `node:crypto` so this module is bundler-safe for
// the browser/edge (no `node:` scheme). Zero hard deps; async for subtle.digest.
// =============================================================================

/** SHA-256 hex digest of a string (with a graceful FNV-1a fallback). */
export async function sha256Hex(input: string): Promise<string> {
  const cryptoObj: Crypto | undefined =
    (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (cryptoObj?.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await cryptoObj.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // No WebCrypto available (very old runtime) → labeled non-cryptographic hash.
  return `fnv1a-${fnv1a(input)}`;
}

/** Non-cryptographic fallback hash (only when no crypto is available). */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
