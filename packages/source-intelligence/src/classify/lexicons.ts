// =============================================================================
// @hsi/source-intelligence — classifier lexicons.
//
// Neutral, research-oriented keyword sets per category. These are PUBLIC,
// descriptive terms used to route signals for human review — NOT a judgment of
// any individual. Phase-7 WorldForge-adjacent themes (extinctionism,
// antinatalism, efilism, promortalism, population reduction, technocratic/AI
// governance, collapse/doom) are represented. Terms are matched case-insensitive
// on word boundaries; multi-word phrases match as substrings of the token join.
// =============================================================================

/** A category lexicon: the canonical category id and its trigger terms. */
export interface CategoryLexicon {
  category: string;
  terms: string[];
}

export const CATEGORY_LEXICONS: CategoryLexicon[] = [
  {
    category: 'extinction',
    terms: [
      'extinction', 'extinctionism', 'extinctionist', 'human extinction',
      'voluntary human extinction', 'vhemt', 'efilism', 'efilist',
      'antinatalism', 'antinatalist', 'promortalism', 'promortalist',
      'omnicide', 'end of humanity', 'cease procreation',
    ],
  },
  {
    category: 'population',
    terms: [
      'population reduction', 'depopulation', 'overpopulation', 'population control',
      'population collapse', 'birth rate', 'birthrate', 'fertility decline',
      'demographic collapse', 'carrying capacity', 'malthusian', 'malthus',
    ],
  },
  {
    category: 'collapse',
    terms: [
      'collapse', 'societal collapse', 'civilizational collapse', 'systemic collapse',
      'collapsology', 'collapsitarian', 'unraveling', 'breakdown of society',
      'supply chain collapse', 'doomer', 'doom', 'doomscroll', 'end times',
    ],
  },
  {
    category: 'ideology',
    terms: [
      'ideology', 'ideological', 'worldview', 'doctrine', 'manifesto', 'creed',
      'dogma', 'belief system', 'ism',
    ],
  },
  {
    category: 'movement',
    terms: [
      'movement', 'grassroots', 'coalition', 'organize', 'organizing', 'mobilize',
      'mobilization', 'activist', 'activism', 'protest', 'march', 'campaign',
    ],
  },
  {
    category: 'recruitment',
    terms: [
      'recruit', 'recruitment', 'join us', 'join the cause', 'become a member',
      'onboarding', 'enlist', 'sign up to fight', 'call to action', 'we need you',
      'volunteers wanted',
    ],
  },
  {
    category: 'propaganda',
    terms: [
      'propaganda', 'agitprop', 'astroturf', 'astroturfing', 'talking points',
      'narrative warfare', 'information operation', 'psyop', 'meme warfare',
    ],
  },
  {
    category: 'misinformation',
    terms: [
      'misinformation', 'false claim', 'debunked', 'unverified', 'hoax', 'fake news',
      'misleading', 'fact-check', 'fact check',
    ],
  },
  {
    category: 'disinformation',
    terms: [
      'disinformation', 'deliberate falsehood', 'coordinated inauthentic',
      'influence campaign', 'foreign interference', 'sockpuppet', 'deepfake',
    ],
  },
  {
    category: 'technology',
    terms: [
      'artificial intelligence', 'ai safety', 'ai governance', 'ai alignment',
      'agi', 'superintelligence', 'machine learning', 'automation', 'algorithm',
      'biotech', 'gene editing', 'crispr', 'surveillance technology',
    ],
  },
  {
    category: 'religion',
    terms: [
      'religion', 'religious', 'apocalypse', 'apocalyptic', 'eschatology', 'rapture',
      'messiah', 'prophecy', 'cult', 'salvation', 'divine', 'scripture',
    ],
  },
  {
    category: 'politics',
    terms: [
      'politics', 'political', 'election', 'government', 'policy', 'legislation',
      'parliament', 'congress', 'authoritarian', 'democracy', 'regime',
    ],
  },
  {
    category: 'economics',
    terms: [
      'economy', 'economic', 'inflation', 'recession', 'market crash', 'unemployment',
      'debt crisis', 'gdp', 'monetary', 'financial collapse',
    ],
  },
  {
    category: 'civilization',
    terms: [
      'civilization', 'civilisation', 'humanity', 'human future', 'long-term future',
      'longtermism', 'existential risk', 'x-risk', 'great filter', 'species',
    ],
  },
  {
    // Technocratic / AI governance is called out explicitly in the spec.
    category: 'narrative',
    terms: [
      'technocracy', 'technocratic', 'technocratic governance', 'world government',
      'global governance', 'great reset', 'social credit', 'central planning',
      'new world order',
    ],
  },
];

/** Map cues for SignalType inference from sourceType + body cues. */
export const SIGNAL_TYPE_BY_SOURCE: Record<string, string> = {
  website: 'article',
  rss: 'rss_item',
  youtube: 'video',
  tiktok: 'social_post',
  podcast: 'podcast_episode',
  forum: 'forum_post',
  document: 'document',
  manual: 'manual_submission',
};
