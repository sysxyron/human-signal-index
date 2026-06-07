// =============================================================================
// @hsi/source-connectors — content hashing (chain of custody).
// Uses Node's crypto when available, otherwise a pure-TS SHA-256 fallback so
// the package works in any runtime with zero hard deps.
// =============================================================================

/** SHA-256 hex digest of a string. */
export async function sha256Hex(input: string): Promise<string> {
  // Prefer WebCrypto (Node 18+, browsers, edge runtimes).
  const cryptoObj: Crypto | undefined =
    (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (cryptoObj?.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await cryptoObj.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: Node's crypto via dynamic import (avoids a static dependency).
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createHash('sha256').update(input, 'utf8').digest('hex');
  } catch {
    // Last-resort non-cryptographic digest (clearly labeled).
    return `fnv1a-${fnv1a(input)}`;
  }
}

/** Non-cryptographic fallback hash (only used if no crypto is available). */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
