// =============================================================================
// @hsi/source-intelligence — deterministic OFFLINE fixtures.
//
// These let the WHOLE pipeline run with NO network: demo PUBLIC sources, sample
// captured docs, sample signals across several categories, a 2-snapshot
// narrative that produces a drift event, and a FixtureCaptureProvider that
// serves canned docs by URL. All timestamps are fixed; all content is invented
// example material (no real individuals).
//
// ETHICS: fixtures use clearly fictional example.org domains and generic public
// "movement" text — illustrative only, never targeting any real person.
// =============================================================================

import { fnv1a } from '../internal/hash';
import type {
  CaptureProvider,
  CaptureResult,
  CapturedDoc,
  SignalDraft,
  SourceInput,
} from '../types';

/** A fixed clock value used throughout the fixtures for determinism. */
export const FIXTURE_NOW = '2026-01-01T00:00:00.000Z';

/** Demo PUBLIC sources spanning rss / website / document. */
export const DEMO_SOURCES: (SourceInput & { id: string })[] = [
  {
    id: 'src_demo_rss',
    name: 'Collapse Watch (demo RSS)',
    description: 'Example public RSS feed about collapse/doom narratives.',
    sourceType: 'rss',
    rssUrl: 'https://feeds.example.org/collapse-watch.xml',
    homepageUrl: 'https://collapse-watch.example.org/',
    riskLevel: 0.5,
  },
  {
    id: 'src_demo_site',
    name: 'Efil Forum Public Wiki (demo website)',
    description: 'Example public wiki page describing an extinctionist movement.',
    sourceType: 'website',
    homepageUrl: 'https://wiki.example.org/movements/extinctionism',
    riskLevel: 0.7,
  },
  {
    id: 'src_demo_doc',
    name: 'Manifesto Upload (demo document)',
    description: 'Example pasted public document text.',
    sourceType: 'document',
    riskLevel: 0.6,
  },
];

/** A canned RSS XML body for the demo feed (parsed offline by parseRssFeed). */
export const DEMO_RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Collapse Watch</title>
  <item>
    <title>Why societal collapse is now inevitable</title>
    <link>https://collapse-watch.example.org/posts/inevitable</link>
    <description>An essay arguing civilizational collapse and systemic breakdown of society are unavoidable.</description>
    <pubDate>2025-12-30T10:00:00Z</pubDate>
    <guid>cw-inevitable</guid>
  </item>
  <item>
    <title>Population reduction as a moral imperative</title>
    <link>https://collapse-watch.example.org/posts/population</link>
    <description>A piece advocating depopulation and population control to avert overpopulation crisis.</description>
    <pubDate>2025-12-31T10:00:00Z</pubDate>
    <guid>cw-population</guid>
  </item>
</channel></rss>`;

/** Canned captured docs keyed by URL for the FixtureCaptureProvider. */
export const DEMO_CAPTURED_DOCS: Record<string, CapturedDoc> = {
  'https://wiki.example.org/movements/extinctionism': {
    url: 'https://wiki.example.org/movements/extinctionism',
    title: 'Extinctionism (movement overview)',
    metaDescription: 'Public overview of extinctionism and voluntary human extinction.',
    bodyText:
      'Extinctionism is an ideology holding that human extinction would be ethically preferable. ' +
      'Related strands include antinatalism, efilism, and promortalism. This page describes the ' +
      'movement, its recruitment language ("join the cause"), and its public manifesto.',
    canonicalUrl: 'https://wiki.example.org/movements/extinctionism',
    capturedAt: FIXTURE_NOW,
    contentHash: `fnv1a-${fnv1a('extinctionism-overview-v1')}`,
  },
};

/** Sample signals across several categories (drafts; not published). */
export const DEMO_SIGNALS: SignalDraft[] = [
  {
    sourceId: 'src_demo_site',
    title: 'Extinctionism movement overview',
    summary: 'A public wiki describing extinctionism, efilism and antinatalism.',
    contentHash: `fnv1a-${fnv1a('sig-extinction')}`,
    signalType: 'article',
    signalCategory: 'extinction',
    confidence: 0.82,
    capturedAt: FIXTURE_NOW,
    tags: ['movement', 'public-wiki'],
  },
  {
    sourceId: 'src_demo_rss',
    title: 'Population reduction as a moral imperative',
    summary: 'Advocates depopulation and population control.',
    contentHash: `fnv1a-${fnv1a('sig-population')}`,
    signalType: 'rss_item',
    signalCategory: 'population',
    confidence: 0.7,
    capturedAt: FIXTURE_NOW,
  },
  {
    sourceId: 'src_demo_rss',
    title: 'Why societal collapse is now inevitable',
    summary: 'Argues civilizational collapse and systemic breakdown are unavoidable.',
    contentHash: `fnv1a-${fnv1a('sig-collapse')}`,
    signalType: 'rss_item',
    signalCategory: 'collapse',
    confidence: 0.65,
    capturedAt: FIXTURE_NOW,
  },
  {
    sourceId: 'src_demo_doc',
    title: 'A neighborhood gardening newsletter',
    summary: 'Tips on composting and seasonal planting.',
    contentHash: `fnv1a-${fnv1a('sig-other')}`,
    signalType: 'document',
    signalCategory: 'other',
    confidence: 0.1,
    capturedAt: FIXTURE_NOW,
  },
];

/**
 * A 2-snapshot narrative that DOES produce a drift event when passed to
 * detectNarrativeDrift / trackNarrative: same topic (a movement's stance on
 * population), but the framing escalates between snapshots.
 */
export const DEMO_DRIFT_PAIR: { before: { text: string; at: string }; after: { text: string; at: string } } = {
  before: {
    text:
      'Our movement believes overpopulation is a serious problem and we should encourage ' +
      'people to voluntarily choose smaller families and sustainable lifestyles.',
    at: '2025-11-01T00:00:00.000Z',
  },
  after: {
    text:
      'Our movement now holds that overpopulation is an existential emergency and that ' +
      'urgent population reduction and depopulation policies are a moral imperative for survival.',
    at: '2025-12-01T00:00:00.000Z',
  },
};

/**
 * Offline capture provider that serves DEMO_CAPTURED_DOCS by URL, and parses
 * DEMO_RSS_XML for the demo feed URL. enabled() is always true; isFixture:true
 * on every result so callers know it is offline.
 */
export class FixtureCaptureProvider implements CaptureProvider {
  name = 'fixture';
  sourceType: string;

  constructor(
    sourceType = 'website',
    private readonly docs: Record<string, CapturedDoc> = DEMO_CAPTURED_DOCS,
  ) {
    this.sourceType = sourceType;
  }

  enabled(): boolean {
    return true;
  }

  async capture(input: { url?: string; rawText?: string; now: string }): Promise<CaptureResult> {
    const { url, now } = input;
    if (!url) return { ok: false, provider: this.name, isFixture: true, error: 'no url provided' };
    const doc = this.docs[url];
    if (!doc) {
      return {
        ok: false,
        provider: this.name,
        isFixture: true,
        error: `no fixture for ${url}`,
      };
    }
    // Re-stamp capturedAt with the caller's `now` for determinism in pipelines.
    return { ok: true, provider: this.name, isFixture: true, doc: { ...doc, capturedAt: now } };
  }
}
