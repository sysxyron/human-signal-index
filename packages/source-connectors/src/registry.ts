// =============================================================================
// @hsi/source-connectors — connector registry.
// Maps a ConnectorKind to a capture function returning a CapturedSource.
// =============================================================================

import { capturePublicPage } from './publicPageConnector';
import { captureRssFeed } from './rssConnector';
import type { CapturedSource, ConnectorKind } from './types';

export interface ConnectorDescriptor {
  kind: ConnectorKind;
  label: string;
  description: string;
  /** Capture a URL into a normalized CapturedSource (or null if skipped). */
  capture: (url: string, capturedAt: string) => Promise<CapturedSource | null>;
}

export const connectorRegistry: Record<ConnectorKind, ConnectorDescriptor> = {
  rss: {
    kind: 'rss',
    label: 'RSS / Atom Feed',
    description: 'Captures public RSS/Atom feeds. Public feeds only.',
    capture: (url, capturedAt) => captureRssFeed(url, { capturedAt }),
  },
  public_page: {
    kind: 'public_page',
    label: 'Public Web Page',
    description: 'Renders and captures a single PUBLIC web page (Playwright). Respects robots.txt; no login bypass.',
    capture: async (url, capturedAt) => {
      const res = await capturePublicPage(url, { capturedAt, respectRobotsTxt: true });
      if (!res.ok) return null;
      return res as CapturedSource;
    },
  },
};

/** Look up a connector by kind. */
export function getConnector(kind: ConnectorKind): ConnectorDescriptor {
  const c = connectorRegistry[kind];
  if (!c) throw new Error(`Unknown connector kind: ${kind}`);
  return c;
}

export function listConnectors(): ConnectorDescriptor[] {
  return Object.values(connectorRegistry);
}
