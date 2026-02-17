/**
 * Hop Distance Calculator
 *
 * Calculates how far each entity is from the target organization in the
 * network graph, and applies a decay factor to relationship confidence
 * based on distance.
 *
 * Think of it like the "six degrees of Kevin Bacon" problem:
 * - Hop 0: The target org itself
 * - Hop 1: People/orgs directly connected (CEO, board members, subsidiaries)
 * - Hop 2: Second-degree connections (the CEO's other companies)
 * - Hop 3+: Distant connections (less and less relevant)
 *
 * A problematic person 4 hops away shouldn't turn the flag red.
 * The decay factors ensure that distant connections carry less weight
 * in the overall assessment.
 */

/**
 * Decay factors for each hop distance.
 * Direct connections (hop 1) keep full weight.
 * Each additional hop reduces the weight significantly.
 */
const HOP_DECAY_FACTORS = {
  0: 1.0,    // the target org itself
  1: 1.0,    // direct connections — full weight
  2: 0.5,    // second-degree — half weight
  3: 0.25,   // third-degree — quarter weight
  default: 0.1, // 4+ hops — minimal weight (noted but barely affects scoring)
};

/**
 * Get the decay factor for a given hop distance.
 *
 * @param {number} hops - Number of hops from the target
 * @returns {number} Decay multiplier (0.0 to 1.0)
 */
function getDecayFactor(hops) {
  if (hops in HOP_DECAY_FACTORS) {
    return HOP_DECAY_FACTORS[hops];
  }
  return HOP_DECAY_FACTORS.default;
}

/**
 * Calculate hop distances for all nodes in the network graph.
 * Uses BFS (breadth-first search) starting from the target org node.
 *
 * Modifies the graph in-place: each node gets metadata.hopDistance set.
 *
 * @param {Object} networkGraph - The graph from buildNetworkGraph()
 */
function calculateHopDistances(networkGraph) {
  const { nodes, edges } = networkGraph;

  // Build an adjacency list for BFS
  const adjacency = {};
  for (const node of nodes) {
    adjacency[node.id] = [];
  }
  for (const edge of edges) {
    // Edges are bidirectional for hop counting
    if (adjacency[edge.from]) adjacency[edge.from].push(edge.to);
    if (adjacency[edge.to]) adjacency[edge.to].push(edge.from);
  }

  // BFS from the target org
  const distances = {};
  const queue = ['org-target'];
  distances['org-target'] = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDist = distances[current];

    for (const neighbor of adjacency[current] || []) {
      if (distances[neighbor] === undefined) {
        distances[neighbor] = currentDist + 1;
        queue.push(neighbor);
      }
    }
  }

  // Write hop distances onto the graph nodes
  for (const node of nodes) {
    const hopDistance = distances[node.id] !== undefined ? distances[node.id] : -1;
    node.metadata = node.metadata || {};
    node.metadata.hopDistance = hopDistance;
    node.metadata.decayFactor = hopDistance >= 0 ? getDecayFactor(hopDistance) : 0;
  }

  // Add hop distance summary to graph metadata
  const hopCounts = {};
  for (const node of nodes) {
    const hop = node.metadata.hopDistance;
    const label = hop === -1 ? 'disconnected' : `hop-${hop}`;
    hopCounts[label] = (hopCounts[label] || 0) + 1;
  }
  networkGraph.graphMetadata.hopDistribution = hopCounts;
}

/**
 * Apply distance decay to relationship/edge confidence scores.
 * Edges involving distant nodes get their confidence reduced.
 *
 * The decay is based on the MORE DISTANT of the two connected nodes.
 * So an edge between hop-1 and hop-2 uses the hop-2 decay (0.5).
 *
 * Modifies edges in-place: adds originalConfidence and adjustedConfidence fields.
 *
 * @param {Object} networkGraph - The graph (must have hop distances calculated first)
 */
function applyDistanceDecay(networkGraph) {
  const { nodes, edges } = networkGraph;

  // Build a quick lookup from node ID to hop distance
  const hopLookup = {};
  for (const node of nodes) {
    hopLookup[node.id] = node.metadata?.hopDistance ?? -1;
  }

  for (const edge of edges) {
    const hopFrom = hopLookup[edge.from] ?? -1;
    const hopTo = hopLookup[edge.to] ?? -1;

    // Use the MORE DISTANT node's hop count for decay
    const maxHop = Math.max(hopFrom, hopTo);

    if (maxHop >= 0) {
      const decay = getDecayFactor(maxHop);
      edge.originalConfidence = edge.confidence;
      edge.adjustedConfidence = edge.confidence * decay;
      edge.hopDecayApplied = decay;
      edge.maxHopDistance = maxHop;
    } else {
      // Disconnected nodes — minimal confidence
      edge.originalConfidence = edge.confidence;
      edge.adjustedConfidence = edge.confidence * 0.05;
      edge.hopDecayApplied = 0.05;
      edge.maxHopDistance = -1;
    }
  }
}

module.exports = {
  calculateHopDistances,
  applyDistanceDecay,
  getDecayFactor,
  HOP_DECAY_FACTORS,
};
