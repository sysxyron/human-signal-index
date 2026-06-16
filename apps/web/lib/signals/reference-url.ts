// =============================================================================
// HSI Phase 41B — reference URL classification (PURE, client-safe).
//
// Beta feedback (B): DOI links may be Zenodo links and must be accepted, not
// rejected for "not being a traditional DOI URL". This classifies a submitted
// reference URL and accepts public academic/archive links — doi.org, Zenodo
// record + DOI URLs, arXiv — as well as any other public http(s) URL. It keeps
// the public-only safety check (no credentials / login-gated / non-http).
// =============================================================================

export type ReferenceKind = 'doi' | 'zenodo' | 'arxiv' | 'web' | 'invalid';

export interface ReferenceClassification {
  ok: boolean;
  kind: ReferenceKind;
  /** Normalized URL (trimmed) when ok. */
  url?: string;
  /** Extracted DOI (e.g. from doi.org or zenodo.org/doi/…), when present. */
  doi?: string;
  reason?: string;
}

/** Markers that indicate a private / auth-gated surface — rejected for safety. */
const PRIVATE_MARKERS = ['/login', '/signin', '/sign-in', 'token=', 'session=', 'password', '/account', '/inbox', '/dm/'];

/** Extract a DOI suffix (10.xxxx/...) from a doi.org or zenodo /doi/ URL path. */
function extractDoi(pathname: string): string | undefined {
  const m = pathname.match(/(10\.\d{4,9}\/[^\s?#]+)/i);
  return m ? m[1].toLowerCase() : undefined;
}

/**
 * Classify a reference URL. Accepts public http(s) URLs (incl. doi.org, Zenodo
 * records/doi, arXiv). Rejects empty, non-http(s), credentialed, or apparently
 * private/auth-gated URLs. PURE.
 */
export function classifyReferenceUrl(input: string | undefined | null): ReferenceClassification {
  const raw = (input ?? '').trim();
  if (!raw) return { ok: false, kind: 'invalid', reason: 'No URL provided.' };

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, kind: 'invalid', reason: 'Enter a valid URL.' };
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, kind: 'invalid', reason: 'Only public http(s) links are accepted.' };
  }
  if (u.username || u.password) {
    return { ok: false, kind: 'invalid', reason: 'Links must not contain credentials.' };
  }
  const lower = `${u.pathname}${u.search}`.toLowerCase();
  if (PRIVATE_MARKERS.some((m) => lower.includes(m))) {
    return { ok: false, kind: 'invalid', reason: 'Public pages only — that link looks private/auth-gated.' };
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'doi.org' || host === 'dx.doi.org') {
    return { ok: true, kind: 'doi', url: raw, doi: extractDoi(u.pathname) };
  }
  if (host === 'zenodo.org' || host.endsWith('.zenodo.org')) {
    // zenodo.org/records/123, zenodo.org/record/123, zenodo.org/doi/10.5281/zenodo.123
    return { ok: true, kind: 'zenodo', url: raw, doi: extractDoi(u.pathname) };
  }
  if (host === 'arxiv.org' || host.endsWith('.arxiv.org')) {
    return { ok: true, kind: 'arxiv', url: raw };
  }
  return { ok: true, kind: 'web', url: raw };
}

/** Convenience: is this an acceptable public reference URL? PURE. */
export function isAcceptableReferenceUrl(input: string | undefined | null): boolean {
  return classifyReferenceUrl(input).ok;
}

/** A short human label for a reference kind (for display). PURE. */
export function referenceKindLabel(kind: ReferenceKind): string {
  switch (kind) {
    case 'doi': return 'DOI';
    case 'zenodo': return 'Zenodo';
    case 'arxiv': return 'arXiv';
    case 'web': return 'Web';
    default: return 'Invalid';
  }
}
