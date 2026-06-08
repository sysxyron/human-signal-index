// =============================================================================
// @hsi/source-intelligence — community detection (Phase 9).
//
// detectCommunities groups graph nodes into communities via DETERMINISTIC,
// seeded label propagation: every node starts in its own community; each bounded
// iteration, nodes (visited in a fixed seeded order) adopt the strongest-weighted
// label among their neighbours, breaking ties by the lowest community id. It is
// pure — no Math.random(), no clocks — so the same graph always yields the same
// communities. Bounded iterations guarantee termination.
//
// This surfaces clusters of related narratives for HUMAN review; it asserts no
// truth about any community, only structural grouping over PUBLIC narrative data.
// =============================================================================

/** A minimal undirected-ish graph (edges may be directed; weight defaults 1). */
export interface CommunityGraphInput {
  nodes: { id: string; label: string }[];
  edges: { source: string; target: string; weight?: number }[];
}

/** A detected community of nodes. */
export interface Community {
  id: string;
  /** Human label: the label of the community's representative (lowest-id) node. */
  label: string;
  memberIds: string[];
  size: number;
}

export interface CommunityResult {
  communities: Community[];
  /** nodeId → communityId. */
  membership: Record<string, string>;
}

/** Max label-propagation passes (bounded → deterministic termination). */
export const MAX_COMMUNITY_ITERATIONS = 20;

/** A tiny deterministic order seed from a string (no Math.random()). */
function orderKey(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Detect communities by seeded label propagation. Deterministic & pure.
 * Isolated nodes form singleton communities. Communities are emitted sorted by
 * descending size then ascending representative id.
 */
export function detectCommunities(graph: CommunityGraphInput): CommunityResult {
  const nodes = graph.nodes;
  if (nodes.length === 0) return { communities: [], membership: {} };

  const labelById = new Map<string, string>(nodes.map((n) => [n.id, n.label]));
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);

  // Build undirected adjacency with accumulated weights (ignore dangling edges).
  const adj = new Map<string, Map<string, number>>();
  for (const id of ids) adj.set(id, new Map());
  for (const e of graph.edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target) || e.source === e.target) continue;
    const w = e.weight ?? 1;
    const a = adj.get(e.source)!;
    const b = adj.get(e.target)!;
    a.set(e.target, (a.get(e.target) ?? 0) + w);
    b.set(e.source, (b.get(e.source) ?? 0) + w);
  }

  // Each node's current community label = a node id (starts as itself).
  const comm = new Map<string, string>(ids.map((id) => [id, id]));

  // Deterministic processing order: by seeded order key, ties by id.
  const order = [...ids].sort((x, y) => orderKey(x) - orderKey(y) || x.localeCompare(y));

  for (let iter = 0; iter < MAX_COMMUNITY_ITERATIONS; iter += 1) {
    let changed = false;
    for (const id of order) {
      const neighbours = adj.get(id)!;
      if (neighbours.size === 0) continue;
      // Sum neighbour edge-weights by their current community label.
      const score = new Map<string, number>();
      for (const [nb, w] of neighbours) {
        const c = comm.get(nb)!;
        score.set(c, (score.get(c) ?? 0) + w);
      }
      // Pick the highest-scoring label; tie-break by lowest community id.
      let best = comm.get(id)!;
      let bestScore = score.get(best) ?? 0;
      for (const [label, s] of score) {
        if (s > bestScore || (s === bestScore && label < best)) {
          best = label;
          bestScore = s;
        }
      }
      if (best !== comm.get(id)) {
        comm.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group members by their final community label.
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const c = comm.get(id)!;
    const arr = groups.get(c) ?? [];
    arr.push(id);
    groups.set(c, arr);
  }

  // Build communities; representative = lowest-id member (stable label source).
  const communities: Community[] = [...groups.entries()].map(([, members]) => {
    const sortedMembers = [...members].sort((a, b) => a.localeCompare(b));
    const rep = sortedMembers[0];
    return {
      id: `community_${rep}`,
      label: labelById.get(rep) ?? rep,
      memberIds: sortedMembers,
      size: sortedMembers.length,
    };
  });
  communities.sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));

  const membership: Record<string, string> = {};
  for (const c of communities) {
    for (const m of c.memberIds) membership[m] = c.id;
  }

  return { communities, membership };
}
