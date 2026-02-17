/**
 * Credibility Scoring
 *
 * Assigns credibility weights to evidence based on the source type.
 * More credible sources (government, courts) get higher weights
 * than less credible ones (forums, social media).
 *
 * Weights from the brief:
 *   government = 10, court = 10, news = 7, NGO = 6, social = 4, forum = 2
 */

const config = require('../config');

/**
 * Get the credibility weight for a given source type.
 *
 * @param {string} sourceType - One of: "government", "court", "news", "ngo", "social", "forum", "unknown"
 * @returns {number} The credibility weight (1-10)
 */
function getWeight(sourceType) {
  return config.credibilityWeights[sourceType] || config.credibilityWeights.unknown;
}

/**
 * Score a single piece of evidence.
 *
 * @param {Object} evidence - An evidence item
 * @param {string} evidence.sourceType - Type of source ("government", "news", etc.)
 * @param {string} evidence.category - Value category ("lgbtq", "racism", etc.)
 * @param {string} evidence.severity - How severe the concern is ("high", "medium", "low")
 * @param {string} evidence.description - What was found
 * @returns {Object} The evidence with a calculated score added
 */
function scoreEvidence(evidence) {
  const weight = getWeight(evidence.sourceType);

  // Severity multiplier: high=1.0, medium=0.7, low=0.4
  const severityMultipliers = {
    high: 1.0,
    medium: 0.7,
    low: 0.4,
  };
  const severityMultiplier = severityMultipliers[evidence.severity] || 0.5;

  // Final score = weight * severity
  const score = weight * severityMultiplier;

  return {
    ...evidence,
    credibilityWeight: weight,
    severityMultiplier,
    score,
  };
}

/**
 * Score all evidence items and produce a summary by category.
 *
 * @param {Array} evidenceList - Array of evidence objects
 * @returns {Object} Scored results with per-category and overall totals
 */
function scoreAllEvidence(evidenceList) {
  // Score each piece of evidence
  const scored = evidenceList.map(scoreEvidence);

  // Group scores by category
  const byCategory = {};
  for (const item of scored) {
    const cat = item.category || 'uncategorized';
    if (!byCategory[cat]) {
      byCategory[cat] = {
        items: [],
        totalScore: 0,
        count: 0,
      };
    }
    byCategory[cat].items.push(item);
    byCategory[cat].totalScore += item.score;
    byCategory[cat].count += 1;
  }

  // Calculate overall totals
  const overallScore = scored.reduce((sum, item) => sum + item.score, 0);

  return {
    scoredEvidence: scored,
    byCategory,
    overallScore,
    totalItems: scored.length,
    // Count credible sources (weight >= 6, i.e., news/NGO/court/government)
    credibleSourceCount: scored.filter((item) => item.credibilityWeight >= 6).length,
  };
}

module.exports = {
  getWeight,
  scoreEvidence,
  scoreAllEvidence,
};
