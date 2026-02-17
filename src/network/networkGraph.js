/**
 * Network Graph
 *
 * Builds and manages a graph data structure from entities and relationships.
 *
 * The graph represents:
 * - Nodes: people, organizations (the entities we extracted)
 * - Edges: relationships between them (organizational, financial, co-mention, etc.)
 *
 * The data structure is designed to be directly consumable by Vis.js
 * in a future Chrome extension for visual network analysis.
 *
 * Think of it like a detective's "wall of connections" — photos of people
 * and organizations connected by strings, with labels on each connection.
 */

/**
 * Build the complete network graph from entities and relationships.
 *
 * @param {string} targetOrgName - The organization being assessed
 * @param {Array} entities - Extracted entities from entityExtractor
 * @param {Array} relationships - Relationships from crossReferencer
 * @returns {Object} The graph: { nodes, edges, graphMetadata }
 */
function buildNetworkGraph(targetOrgName, entities, relationships) {
  const nodes = [];
  const edges = [];

  // --- Create the target organization node ---
  // This is always the center of the graph
  nodes.push({
    id: 'org-target',
    label: targetOrgName,
    type: 'organization',
    isTarget: true,
    metadata: {
      roles: [],
      mentionCount: 0,
      sources: [],
    },
  });

  // --- Create nodes from extracted entities ---
  const nodeIds = new Set(['org-target']);

  for (const entity of entities) {
    if (nodeIds.has(entity.id)) continue; // skip duplicates

    nodes.push({
      id: entity.id,
      label: entity.name,
      type: entity.type,
      isTarget: false,
      metadata: {
        roles: entity.roles || [],
        mentionCount: entity.mentionCount || 1,
        confidence: entity.confidence || 0,
        aliases: entity.aliases || [],
        sources: entity.sourceText ? [entity.sourceText] : [],
        language: entity.language || 'en',
      },
    });

    nodeIds.add(entity.id);
  }

  // --- Create edges from relationships ---
  // Deduplicate: if multiple relationships connect the same two nodes,
  // merge them into one edge with combined evidence and boosted confidence.
  const edgeMap = new Map(); // "from|to" → edge object

  for (const rel of relationships) {
    // Only add edges for nodes that exist in the graph
    if (!nodeIds.has(rel.from) && rel.from !== 'org-target') continue;
    if (!nodeIds.has(rel.to) && rel.to !== 'org-target') continue;

    const key = [rel.from, rel.to].sort().join('|');

    if (edgeMap.has(key)) {
      const existing = edgeMap.get(key);
      // Merge evidence
      existing.evidence.push(...(rel.evidence || []));
      // Take higher confidence
      existing.confidence = Math.max(existing.confidence, rel.confidence || 0);
      // Prefer more specific type over 'co-mention'
      if (existing.type === 'co-mention' && rel.type !== 'co-mention') {
        existing.type = rel.type;
        existing.label = rel.label;
      }
    } else {
      edgeMap.set(key, {
        id: `edge-${edgeMap.size + 1}`,
        from: rel.from,
        to: rel.to,
        fromName: rel.fromName,
        toName: rel.toName,
        type: rel.type || 'co-mention',
        label: rel.label || '',
        confidence: rel.confidence || 0.3,
        evidence: [...(rel.evidence || [])],
        detectedVia: rel.detectedVia || 'unknown',
      });
    }
  }

  edges.push(...edgeMap.values());

  // --- Compute graph metadata ---
  const edgeTypeCounts = {};
  for (const edge of edges) {
    edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
  }

  const graphMetadata = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    edgeTypeBreakdown: edgeTypeCounts,
    generatedAt: new Date().toISOString(),
  };

  return { nodes, edges, graphMetadata };
}

/**
 * Add a node to an existing graph.
 *
 * @param {Object} graph - The graph object
 * @param {Object} entity - Entity to add as a node
 */
function addNode(graph, entity) {
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  if (existingIds.has(entity.id)) return;

  graph.nodes.push({
    id: entity.id,
    label: entity.name,
    type: entity.type,
    isTarget: false,
    metadata: {
      roles: entity.roles || [],
      mentionCount: entity.mentionCount || 1,
      confidence: entity.confidence || 0,
      sources: entity.sourceText ? [entity.sourceText] : [],
    },
  });

  graph.graphMetadata.totalNodes = graph.nodes.length;
}

/**
 * Add an edge to an existing graph.
 *
 * @param {Object} graph - The graph object
 * @param {Object} relationship - Relationship to add as an edge
 */
function addEdge(graph, relationship) {
  const edgeId = `edge-${graph.edges.length + 1}`;

  graph.edges.push({
    id: edgeId,
    from: relationship.from,
    to: relationship.to,
    fromName: relationship.fromName,
    toName: relationship.toName,
    type: relationship.type || 'co-mention',
    label: relationship.label || '',
    confidence: relationship.confidence || 0.3,
    evidence: relationship.evidence || [],
    detectedVia: relationship.detectedVia || 'unknown',
  });

  graph.graphMetadata.totalEdges = graph.edges.length;
}

/**
 * Get all edges connected to a specific node.
 *
 * @param {Object} graph - The graph object
 * @param {string} nodeId - Node ID to search for
 * @returns {Array} Edges connected to this node
 */
function getConnections(graph, nodeId) {
  return graph.edges.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId
  );
}

/**
 * Calculate degree centrality for each node.
 * Degree centrality = number of connections a node has.
 * Higher centrality = more connected = potentially more important.
 *
 * @param {Object} graph - The graph object
 * @returns {Array<{nodeId: string, label: string, degree: number}>} Sorted by degree (highest first)
 */
function calculateCentrality(graph) {
  const degreeCounts = {};

  // Initialize all nodes with 0
  for (const node of graph.nodes) {
    degreeCounts[node.id] = { nodeId: node.id, label: node.label, degree: 0 };
  }

  // Count edges for each node
  for (const edge of graph.edges) {
    if (degreeCounts[edge.from]) degreeCounts[edge.from].degree++;
    if (degreeCounts[edge.to]) degreeCounts[edge.to].degree++;
  }

  // Sort by degree descending
  return Object.values(degreeCounts).sort((a, b) => b.degree - a.degree);
}

/**
 * Export the graph in Vis.js-compatible format.
 * This is the format that the future Chrome extension will consume
 * for visual network rendering.
 *
 * @param {Object} graph - The graph object
 * @returns {Object} Vis.js-compatible data { nodes, edges }
 */
function exportForVisJs(graph) {
  // Vis.js nodes need: id, label, group (for coloring), shape, title (tooltip)
  const visNodes = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    group: node.isTarget ? 'target' : node.type, // groups: 'target', 'person', 'organization'
    shape: node.type === 'person' ? 'dot' : 'diamond',
    size: node.isTarget ? 30 : 15 + (node.metadata?.mentionCount || 1) * 2,
    title: buildTooltip(node),
    font: { size: node.isTarget ? 16 : 12 },
  }));

  // Vis.js edges need: from, to, label, color, dashes, width
  const visEdges = graph.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    label: edge.label,
    title: `Type: ${edge.type} | Confidence: ${(edge.confidence * 100).toFixed(0)}%`,
    width: Math.max(1, edge.confidence * 4),
    dashes: edge.type === 'co-mention', // dashed lines for weaker connections
    color: getEdgeColor(edge.type),
    arrows: { to: { enabled: true } },
  }));

  return { nodes: visNodes, edges: visEdges };
}

/**
 * Build a tooltip string for a node (shown on hover in Vis.js).
 */
function buildTooltip(node) {
  const parts = [node.label];

  if (node.isTarget) {
    parts.push('(Target Organization)');
  }

  if (node.metadata?.roles?.length > 0) {
    parts.push(`Roles: ${node.metadata.roles.join(', ')}`);
  }

  if (node.metadata?.mentionCount > 1) {
    parts.push(`Mentioned ${node.metadata.mentionCount} times`);
  }

  if (node.metadata?.confidence) {
    parts.push(`Confidence: ${(node.metadata.confidence * 100).toFixed(0)}%`);
  }

  return parts.join('\n');
}

/**
 * Get edge color based on relationship type.
 */
function getEdgeColor(type) {
  const colors = {
    organizational: { color: '#2196F3', highlight: '#1976D2' },  // blue
    financial:      { color: '#F44336', highlight: '#D32F2F' },  // red
    'event-based':  { color: '#FF9800', highlight: '#F57C00' },  // orange
    'co-mention':   { color: '#9E9E9E', highlight: '#757575' },  // grey
    'sanctions-link': { color: '#E91E63', highlight: '#C2185B' }, // pink
  };

  return colors[type] || colors['co-mention'];
}

module.exports = {
  buildNetworkGraph,
  addNode,
  addEdge,
  getConnections,
  calculateCentrality,
  exportForVisJs,
};
