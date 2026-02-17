/**
 * Vis.js Network Graph — full and mini rendering
 */

// Graph options matching the neumorphic theme
const GRAPH_OPTIONS = {
  nodes: {
    font: { color: '#2d3748', face: 'Segoe UI, sans-serif', size: 12 },
    borderWidth: 2,
    shadow: { enabled: true, size: 4, color: 'rgba(0,0,0,0.1)' },
  },
  groups: {
    target: {
      color: { background: '#1a6b54', border: '#145541', highlight: { background: '#2a8f72', border: '#145541' } },
      shape: 'diamond',
      size: 25,
      font: { color: '#ffffff', size: 14 },
    },
    person: {
      color: { background: '#63B3ED', border: '#3182CE', highlight: { background: '#90CDF4', border: '#3182CE' } },
      shape: 'dot',
      size: 15,
    },
    organization: {
      color: { background: '#B794F4', border: '#805AD5', highlight: { background: '#D6BCFA', border: '#805AD5' } },
      shape: 'diamond',
      size: 18,
    },
  },
  edges: {
    smooth: { type: 'continuous' },
    font: { size: 10, color: '#718096', face: 'Segoe UI, sans-serif' },
    color: { color: '#A0AEC0', highlight: '#718096' },
    width: 1.5,
  },
  physics: {
    barnesHut: {
      gravitationalConstant: -3000,
      centralGravity: 0.3,
      springLength: 120,
      springConstant: 0.04,
    },
    stabilization: { iterations: 150 },
  },
  interaction: {
    hover: true,
    tooltipDelay: 200,
    zoomView: true,
    dragView: true,
  },
  layout: {
    improvedLayout: true,
  },
};

// Mini graph options (no interaction, no physics animation)
const MINI_GRAPH_OPTIONS = {
  ...GRAPH_OPTIONS,
  interaction: {
    dragNodes: false,
    dragView: false,
    zoomView: false,
    selectable: false,
    hover: false,
  },
  physics: {
    barnesHut: {
      gravitationalConstant: -2000,
      springLength: 60,
    },
    stabilization: { iterations: 50 },
  },
  nodes: {
    ...GRAPH_OPTIONS.nodes,
    font: { ...GRAPH_OPTIONS.nodes.font, size: 8 },
  },
  edges: {
    ...GRAPH_OPTIONS.edges,
    font: { size: 0 }, // Hide edge labels in mini view
    width: 1,
  },
};

/**
 * Initialize a full interactive Vis.js network graph.
 * @param {string} containerId - DOM element ID
 * @param {Object} visJsData - { nodes, edges } from the assessment
 */
function initGraph(containerId, visJsData) {
  const container = document.getElementById(containerId);
  if (!container || !visJsData || typeof vis === 'undefined') return;

  try {
    const data = {
      nodes: new vis.DataSet(visJsData.nodes || []),
      edges: new vis.DataSet(visJsData.edges || []),
    };
    new vis.Network(container, data, GRAPH_OPTIONS);
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Could not render graph</div>';
    console.error('Graph render error:', err);
  }
}

/**
 * Initialize a small static graph preview for the dashboard card.
 * @param {string} containerId - DOM element ID
 * @param {Object} visJsData - { nodes, edges } from the assessment
 */
function initMiniGraph(containerId, visJsData) {
  const container = document.getElementById(containerId);
  if (!container || !visJsData || typeof vis === 'undefined') return;

  try {
    // Use smaller node sizes for mini view
    const miniNodes = (visJsData.nodes || []).map((n) => ({
      ...n,
      size: Math.max(5, (n.size || 10) * 0.5),
      label: '', // Hide labels in mini view
    }));

    const data = {
      nodes: new vis.DataSet(miniNodes),
      edges: new vis.DataSet(visJsData.edges || []),
    };
    new vis.Network(container, data, MINI_GRAPH_OPTIONS);
  } catch (err) {
    container.innerHTML = '';
    console.error('Mini graph render error:', err);
  }
}
