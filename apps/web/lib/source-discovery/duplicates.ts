// =============================================================================
// HSI Phase 70.3 — Duplicate detection (PURE, deterministic). Compares a candidate
// against existing sources by exact URL, domain, and feed; flags related sources.
// Exact duplicates block approval; the rest require reviewer confirmation.
// =============================================================================

import type { CandidateInput, ExistingSource, DuplicateResult } from './types';

/** Normalized hostname (lowercase, no leading www., no port). '' when unparseable. */
export function domainOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const m = /^(?:https?:\/\/)?(?:www\.)?([^/:\s]+)/i.exec(url.trim());
    return m ? m[1].toLowerCase() : '';
  }
}

function normUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

export function detectExactDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const cUrls = [normUrl(candidate.primaryUrl), normUrl(candidate.feedOrApiUrl)].filter(Boolean);
  for (const e of existing) {
    const eUrls = [normUrl(e.homepageUrl), normUrl(e.rssUrl)].filter(Boolean);
    if (cUrls.some((c) => eUrls.includes(c))) {
      return { duplicateStatus: 'exact_duplicate', existingSourceId: e.id, existingSourceName: e.name, duplicateReason: 'Identical URL already in the registry.' };
    }
  }
  return null;
}

export function detectFeedDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const cFeed = domainOf(candidate.feedOrApiUrl);
  if (!cFeed) return null;
  for (const e of existing) {
    if (e.rssUrl && domainOf(e.rssUrl) === cFeed) {
      return { duplicateStatus: 'feed_duplicate', existingSourceId: e.id, existingSourceName: e.name, duplicateReason: `Feed domain "${cFeed}" matches an existing feed.` };
    }
  }
  return null;
}

export function detectDomainDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const cDomain = domainOf(candidate.primaryUrl) || domainOf(candidate.feedOrApiUrl);
  if (!cDomain) return null;
  for (const e of existing) {
    const eDomain = domainOf(e.homepageUrl) || domainOf(e.rssUrl);
    if (eDomain && eDomain === cDomain) {
      return { duplicateStatus: 'domain_duplicate', existingSourceId: e.id, existingSourceName: e.name, duplicateReason: `Domain "${cDomain}" already covered by an existing source.` };
    }
  }
  return null;
}

export function detectRelatedSource(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  // Same registrable root (e.g. sub.example.com vs example.com) → related, not duplicate.
  const root = (d: string) => d.split('.').slice(-2).join('.');
  const cDomain = domainOf(candidate.primaryUrl) || domainOf(candidate.feedOrApiUrl);
  if (!cDomain) return null;
  for (const e of existing) {
    const eDomain = domainOf(e.homepageUrl) || domainOf(e.rssUrl);
    if (eDomain && eDomain !== cDomain && root(eDomain) === root(cDomain)) {
      return { duplicateStatus: 'related_source', existingSourceId: e.id, existingSourceName: e.name, duplicateReason: `Shares root domain "${root(cDomain)}" with an existing source.` };
    }
  }
  return null;
}

/** Strongest duplicate signal: exact > domain > feed > related > none. */
export function detectDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult {
  return (
    detectExactDuplicate(candidate, existing)
    ?? detectDomainDuplicate(candidate, existing)
    ?? detectFeedDuplicate(candidate, existing)
    ?? detectRelatedSource(candidate, existing)
    ?? { duplicateStatus: 'none', existingSourceId: null, existingSourceName: null, duplicateReason: null }
  );
}
