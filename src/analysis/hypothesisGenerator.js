/**
 * Hypothesis Generator
 *
 * Analyzes all collected data — scored evidence, network graph,
 * cross-references, extracted entities — and generates human-readable
 * hypothesis statements.
 *
 * Instead of just saying "RED flag", this module explains WHY:
 * "Possible financial trail via Ahmed Al-Rashid — connected to 2 sanctioned entities"
 *
 * Each hypothesis has a confidence level (high/medium/low) based on
 * how much evidence supports it.
 *
 * Think of it as the detective's notes — connecting the dots between
 * individual pieces of evidence into a coherent narrative.
 */

const { checkAllNames } = require('./nameCommonality');

let hypothesisCounter = 0;

/**
 * Generate hypotheses from all available analysis data.
 *
 * @param {Object} scoredResults - From credibility.js scoreAllEvidence()
 * @param {Object} networkGraph - From networkGraph.js buildNetworkGraph()
 * @param {Object} crossRefResult - From crossReferencer.js crossReference()
 * @param {Object} extractionResult - From entityExtractor.js extractFromMultipleTexts()
 * @returns {Object} { hypotheses, confidenceWarnings }
 */
function generateHypotheses(scoredResults, networkGraph, crossRefResult, extractionResult) {
  hypothesisCounter = 0;
  const hypotheses = [];

  // --- Check for sanctions-proximity hypotheses ---
  const sanctionsHypotheses = generateSanctionsProximityHypotheses(
    scoredResults,
    networkGraph,
    extractionResult
  );
  hypotheses.push(...sanctionsHypotheses);

  // --- Check for organizational-link hypotheses ---
  const orgHypotheses = generateOrganizationalLinkHypotheses(
    networkGraph,
    extractionResult
  );
  hypotheses.push(...orgHypotheses);

  // --- Check for financial-trail hypotheses ---
  const financialHypotheses = generateFinancialTrailHypotheses(
    crossRefResult,
    networkGraph
  );
  hypotheses.push(...financialHypotheses);

  // --- Check for pattern-anomaly hypotheses ---
  const anomalyHypotheses = generateAnomalyHypotheses(crossRefResult);
  hypotheses.push(...anomalyHypotheses);

  // --- Generate confidence warnings for common names ---
  const entities = extractionResult?.entities || [];
  const confidenceWarnings = checkAllNames(entities);

  // Add common-name warnings to related hypotheses
  for (const hyp of hypotheses) {
    for (const warning of confidenceWarnings) {
      if (hyp.relatedEntities.includes(warning.entityId)) {
        hyp.warnings.push(warning.warning);
      }
    }
  }

  // Filter out hypotheses below minimum confidence
  const filtered = hypotheses.filter((h) => h.confidenceScore >= 0.2);

  // Sort by confidence (highest first)
  filtered.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return { hypotheses: filtered, confidenceWarnings };
}

/**
 * Generate hypotheses about sanctions proximity.
 * "A person connected to the target org also appears near a sanctioned entity"
 */
function generateSanctionsProximityHypotheses(scoredResults, networkGraph, extractionResult) {
  const hypotheses = [];

  // Find edges that connect to sanctions-related evidence
  const sanctionsEdges = (networkGraph?.edges || []).filter(
    (e) => e.detectedVia === 'sanctions-match' || e.type === 'sanctions-link'
  );

  for (const edge of sanctionsEdges) {
    const entity = (extractionResult?.entities || []).find(
      (e) => e.id === edge.from || e.id === edge.to
    );

    if (!entity) continue;

    // Find supporting evidence from scored results
    const supporting = (scoredResults?.scoredEvidence || [])
      .filter((ev) => ev.matchedName && entity.name.toLowerCase().includes(ev.matchedName.toLowerCase()))
      .map((ev) => ({
        description: ev.description,
        source: ev.source,
        relevance: 'direct',
      }));

    const confidenceScore = calculateConfidence(supporting.length, edge.confidence);

    hypotheses.push(createHypothesis({
      description: `Sanctions exposure: "${entity.name}" is connected to the target organization and matches a sanctions list entry`,
      confidence: confidenceToLevel(confidenceScore),
      confidenceScore,
      type: 'sanctions-proximity',
      supportingEvidence: supporting,
      relatedEntities: [edge.from, edge.to].filter((id) => id !== 'org-target'),
    }));
  }

  return hypotheses;
}

/**
 * Generate hypotheses about organizational links.
 * "Person serves as [Role] at both target org and another organization"
 */
function generateOrganizationalLinkHypotheses(networkGraph, extractionResult) {
  const hypotheses = [];

  // Find people with organizational edges
  const orgEdges = (networkGraph?.edges || []).filter((e) => e.type === 'organizational');

  // Group edges by person
  const personEdges = {};
  for (const edge of orgEdges) {
    const personId = edge.from === 'org-target' ? edge.to : edge.from;
    if (!personEdges[personId]) personEdges[personId] = [];
    personEdges[personId].push(edge);
  }

  // If a person has edges to multiple organizations, that's a hypothesis
  for (const [personId, edges] of Object.entries(personEdges)) {
    const entity = (extractionResult?.entities || []).find((e) => e.id === personId);
    if (!entity) continue;

    if (entity.roles.length > 0) {
      const rolesText = entity.roles.join(', ');
      const confidenceScore = Math.min(0.5 + entity.confidence * 0.3, 0.9);

      hypotheses.push(createHypothesis({
        description: `Organizational link: "${entity.name}" identified as ${rolesText} — may hold influence or decision-making power`,
        confidence: confidenceToLevel(confidenceScore),
        confidenceScore,
        type: 'organizational-link',
        supportingEvidence: edges.map((e) => ({
          description: e.evidence?.[0]?.description || `Connected as ${e.label}`,
          source: e.evidence?.[0]?.source || 'entity analysis',
          relevance: 'direct',
        })),
        relatedEntities: [personId],
      }));
    }
  }

  return hypotheses;
}

/**
 * Generate hypotheses about financial trails.
 * "Financial keywords found near co-mentioned entities"
 */
function generateFinancialTrailHypotheses(crossRefResult, networkGraph) {
  const hypotheses = [];

  // Find financial-type relationships
  const financialEdges = (networkGraph?.edges || []).filter((e) => e.type === 'financial');

  for (const edge of financialEdges) {
    const confidenceScore = Math.min(0.4 + edge.confidence * 0.3, 0.85);

    hypotheses.push(createHypothesis({
      description: `Possible financial connection between "${edge.fromName}" and "${edge.toName}" — financial keywords detected in shared context`,
      confidence: confidenceToLevel(confidenceScore),
      confidenceScore,
      type: 'financial-trail',
      supportingEvidence: (edge.evidence || []).map((ev) => ({
        description: ev.description,
        source: ev.source,
        relevance: 'supporting',
      })),
      relatedEntities: [edge.from, edge.to].filter((id) => id !== 'org-target'),
    }));
  }

  return hypotheses;
}

/**
 * Generate hypotheses from detected anomalies.
 * "Unusual pattern: entity mentioned N times across M sources"
 */
function generateAnomalyHypotheses(crossRefResult) {
  const hypotheses = [];
  const anomalies = crossRefResult?.anomalies || [];

  for (const anomaly of anomalies) {
    let confidenceScore;

    if (anomaly.type === 'cross-list-presence') {
      confidenceScore = 0.8; // Strong signal
    } else if (anomaly.type === 'frequency-spike') {
      confidenceScore = anomaly.severity === 'high' ? 0.6 : 0.4;
    } else {
      confidenceScore = 0.3;
    }

    hypotheses.push(createHypothesis({
      description: anomaly.description,
      confidence: confidenceToLevel(confidenceScore),
      confidenceScore,
      type: 'pattern-anomaly',
      supportingEvidence: [{
        description: anomaly.description,
        source: anomaly.source || 'pattern analysis',
        relevance: anomaly.type === 'cross-list-presence' ? 'direct' : 'circumstantial',
      }],
      relatedEntities: anomaly.entityId ? [anomaly.entityId] : [],
    }));
  }

  return hypotheses;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Create a hypothesis object with consistent structure.
 */
function createHypothesis({ description, confidence, confidenceScore, type, supportingEvidence, relatedEntities }) {
  hypothesisCounter++;
  return {
    id: `hyp-${String(hypothesisCounter).padStart(3, '0')}`,
    description,
    confidence,
    confidenceScore,
    type,
    supportingEvidence: supportingEvidence || [],
    relatedEntities: relatedEntities || [],
    warnings: [],
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate confidence score from evidence count and base confidence.
 */
function calculateConfidence(evidenceCount, baseConfidence) {
  let score = baseConfidence || 0.3;

  // More evidence = higher confidence
  if (evidenceCount >= 3) score += 0.3;
  else if (evidenceCount >= 2) score += 0.2;
  else if (evidenceCount >= 1) score += 0.1;

  return Math.min(score, 1.0);
}

/**
 * Convert a numeric confidence score to a label.
 */
function confidenceToLevel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

module.exports = {
  generateHypotheses,
};
