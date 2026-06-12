// =============================================================================
// @hsi/distribution-engine — publication FEEDS (RSS / JSON / Webhook).
//
// buildRssFeed / buildJsonFeed render a feed from PUBLISHED items only — the
// `published` gate is enforced here, so an unpublished item can NEVER leak into a
// feed. buildWebhookPayload builds a single event payload. Deterministic; pure;
// no network (the worker performs delivery).
// =============================================================================

import type { Feed, PublishedItem, WebhookPayload } from './types';

/** Keep only items that are currently published. */
export function onlyPublished(items: PublishedItem[]): PublishedItem[] {
  return items.filter((i) => i.published);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build an RSS 2.0 feed from PUBLISHED items. `baseUrl` forms each item link.
 * Deterministic — pass `now` via opts. Unpublished items are excluded.
 */
export function buildRssFeed(
  items: PublishedItem[],
  opts: { now: string; baseUrl?: string; title?: string },
): Feed {
  const base = (opts.baseUrl ?? 'https://hsi.example').replace(/\/$/, '');
  const published = onlyPublished(items);
  const channelTitle = escapeXml(opts.title ?? 'HSI Published Intelligence');
  const entries = published
    .map((i) => {
      const link = `${base}/intelligence/${i.slug}`;
      const trust = i.trustScore !== undefined ? ` [trust ${Math.round(i.trustScore)}/100]` : '';
      return [
        '    <item>',
        `      <title>${escapeXml(i.title)}${trust}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid>${escapeXml(i.id)}</guid>`,
        `      <pubDate>${escapeXml(i.publishedAt)}</pubDate>`,
        `      <description>${escapeXml(i.summary)}</description>`,
        ...i.topics.map((t) => `      <category>${escapeXml(t)}</category>`),
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${channelTitle}</title>`,
    `    <link>${escapeXml(base)}/intelligence</link>`,
    `    <description>Trust-aware, evidence-backed published intelligence.</description>`,
    `    <lastBuildDate>${escapeXml(opts.now)}</lastBuildDate>`,
    entries,
    '  </channel>',
    '</rss>',
  ].join('\n');

  return { format: 'rss', contentType: 'application/rss+xml; charset=utf-8', body, itemCount: published.length };
}

/**
 * Build a JSON Feed 1.1 from PUBLISHED items. Deterministic. Unpublished excluded.
 */
export function buildJsonFeed(
  items: PublishedItem[],
  opts: { now: string; baseUrl?: string; title?: string },
): Feed {
  const base = (opts.baseUrl ?? 'https://hsi.example').replace(/\/$/, '');
  const published = onlyPublished(items);
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: opts.title ?? 'HSI Published Intelligence',
    home_page_url: `${base}/intelligence`,
    feed_url: `${base}/intelligence/feed.json`,
    items: published.map((i) => ({
      id: i.id,
      url: `${base}/intelligence/${i.slug}`,
      title: i.title,
      summary: i.summary,
      date_published: i.publishedAt,
      tags: i.topics,
      _hsi: { trustScore: i.trustScore ?? null, sourceRef: i.sourceRef },
    })),
  };
  return {
    format: 'json',
    contentType: 'application/feed+json; charset=utf-8',
    body: JSON.stringify(feed, null, 2),
    itemCount: published.length,
  };
}

/** Build a webhook payload for a distribution event. */
export function buildWebhookPayload(
  event: WebhookPayload['event'],
  data: Record<string, unknown>,
  opts: { now: string },
): WebhookPayload {
  return { event, at: opts.now, data };
}
