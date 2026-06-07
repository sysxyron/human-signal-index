// =============================================================================
// @hsi/source-connectors — types
// ETHICAL, PUBLIC-ONLY capture. We only ever capture publicly accessible pages.
// We never bypass logins, never scrape private communities, never collect
// private personal data, and never target private individuals.
// =============================================================================

/** Connector kinds in the registry. */
export type ConnectorKind = 'rss' | 'public_page';

/** Normalized output of any connector. */
export interface CapturedSource {
  /** Connector that produced this capture. */
  connector: ConnectorKind;
  /** Canonical, normalized URL captured. */
  url: string;
  /** Optional title / headline. */
  title?: string;
  /** Primary captured content (article text, feed item summary, etc.). */
  content: string;
  /** Raw payload (xml/html) for chain-of-custody, if retained. */
  raw?: string;
  /** SHA-256 hex digest of the content (chain of custody). */
  hashDigest: string;
  /** ISO capture timestamp — PASSED IN by the caller (not Date.now() inside). */
  capturedAt: string;
  /** Provenance/extraction metadata (author, publish date, item count, ...). */
  metadata?: Record<string, unknown>;
}

/** A single normalized RSS/Atom item. */
export interface FeedItem {
  title?: string;
  link?: string;
  content?: string;
  isoDate?: string;
  guid?: string;
}

export interface RssCaptureOptions {
  /** ISO timestamp for the capture (provenance). */
  capturedAt: string;
  /** Max items to normalize. */
  maxItems?: number;
}

export interface PublicPageCaptureOptions {
  /** ISO timestamp for the capture (provenance). */
  capturedAt: string;
  /** Respect robots.txt (default true; setting false is disallowed by policy). */
  respectRobotsTxt?: boolean;
  /** Optional CSS selector to extract main content. */
  contentSelector?: string;
  /** Navigation timeout (ms). */
  timeoutMs?: number;
}
