// =============================================================================
// @hsi/distribution-engine — public type surface (WorldForge/HSI Phase 19).
//
// The DIGEST + DISTRIBUTION layer: generate subscriber digests (daily / weekly /
// topic), build publication feeds (RSS / JSON / Webhook), and plan distribution
// to subscribers. It NEVER distributes UNPUBLISHED intelligence and NEVER
// generates digest content without source references.
//
// PRINCIPLES (binding — identical to Phases 16-18):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys; the engine PLANS distribution,
//     the worker performs the side-effects.
//   * EXPLAINABLE + AUDITABLE — every digest item references its source.
// =============================================================================

/** A published item the distribution layer can reference (PUBLISHED only). */
export interface PublishedItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  trustScore?: number;
  topics: string[];
  /** ISO publish date. */
  publishedAt: string;
  /** Whether the item is currently published (gate — never distribute false). */
  published: boolean;
  /** A source reference (publication permalink / evidence id). */
  sourceRef: string;
}

/** The kinds of change a digest can surface. */
export type DigestItemKind =
  | 'new_report'
  | 'updated_report'
  | 'trust_change'
  | 'governance_action'
  | 'research_opportunity'
  | 'escalation'
  | 'outcome_change';

/** One digest entry — ALWAYS carries a source reference. */
export interface DigestItem {
  kind: DigestItemKind;
  title: string;
  detail: string;
  /** The source this entry references (required — no source → excluded). */
  sourceRef: string;
  /** Optional link slug into the public portal. */
  slug?: string;
  at: string;
}

/** A generated digest. */
export interface Digest {
  kind: 'daily' | 'weekly' | 'topic';
  /** Topic slug for a topic digest. */
  topic?: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  items: DigestItem[];
  /** Items dropped because they lacked a source reference (transparency). */
  droppedNoSource: number;
  generatedAt: string;
}

/** The raw change inputs a digest is built from. */
export interface DigestInput {
  newReports?: PublishedItem[];
  updatedReports?: PublishedItem[];
  trustChanges?: Array<{ slug: string; title: string; detail: string; sourceRef?: string; at?: string }>;
  governanceActions?: Array<{ slug?: string; title: string; detail: string; sourceRef?: string; at?: string }>;
  researchOpportunities?: Array<{ title: string; detail: string; sourceRef?: string; at?: string }>;
  escalations?: Array<{ title: string; detail: string; sourceRef?: string; at?: string }>;
  outcomeChanges?: Array<{ slug?: string; title: string; detail: string; sourceRef?: string; at?: string }>;
}

// ---- Subscribers ------------------------------------------------------------

/** Subscriber tier. */
export type SubscriberType = 'FREE' | 'RESEARCHER' | 'ANALYST' | 'ORGANIZATION';

/** Digest cadence preference. */
export type DigestFrequency = 'none' | 'daily' | 'weekly';

/** Delivery channel preference. */
export type DeliveryChannel = 'email' | 'rss' | 'json' | 'webhook';

/** A subscriber. */
export interface Subscriber {
  id: string;
  email: string;
  type: SubscriberType;
  active: boolean;
  createdAt: string;
}

/** A subscriber's preferences. */
export interface SubscriptionPreferences {
  subscriberId: string;
  digestFrequency: DigestFrequency;
  /** Topics the subscriber follows (empty = all). */
  topics: string[];
  /** Notification toggles. */
  notifyTrustChanges: boolean;
  notifyRetractions: boolean;
  channels: DeliveryChannel[];
}

// ---- Feeds ------------------------------------------------------------------

export type FeedFormat = 'rss' | 'json';

/** A built feed (content + content-type). */
export interface Feed {
  format: FeedFormat;
  contentType: string;
  body: string;
  itemCount: number;
}

/** A webhook payload for a single distribution event. */
export interface WebhookPayload {
  event: 'publication.published' | 'publication.retracted' | 'digest.generated';
  at: string;
  data: Record<string, unknown>;
}

// ---- Distribution -----------------------------------------------------------

/** A planned distribution to one subscriber (the worker performs the send). */
export interface DistributionEvent {
  subscriberId: string;
  channel: DeliveryChannel;
  kind: 'digest' | 'feed' | 'webhook';
  /** Reference to the digest / publication being distributed. */
  ref: string;
  /** Item count being delivered. */
  itemCount: number;
  at: string;
  status: 'planned';
}
