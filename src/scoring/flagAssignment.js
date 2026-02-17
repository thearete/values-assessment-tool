/**
 * Flag Assignment
 *
 * Determines the overall flag color for an organization based on
 * the evidence collected and scored.
 *
 * Flag rules:
 *   RED    — sanctions list match OR court conviction OR 3+ credible sources OR government ruling
 *   YELLOW — 2+ indicators from: news article, verified forum quote, NGO report, pending investigation
 *   GREEN  — No concerns found after checking available sources
 *   GREY   — Insufficient data (couldn't check sources, or sources returned errors)
 */

/**
 * Assign a flag color based on scored evidence and sanctions results.
 *
 * @param {Object} params
 * @param {Object} params.sanctionsResult - Result from checkAllSanctions()
 * @param {Object} params.scoredResults - Result from scoreAllEvidence()
 * @returns {Object} { flag: string, reason: string, details: Array }
 */
function assignFlag({ sanctionsResult, scoredResults }) {
  const details = []; // Collect reasons for the flag assignment

  // --- Check for RED flag conditions ---

  // Condition 1: Found on sanctions list
  if (sanctionsResult.sanctioned) {
    details.push('Found on international sanctions list');
    return {
      flag: 'RED',
      reason: 'Organization found on international sanctions list',
      details,
      severity: 'critical',
    };
  }

  // Condition 2: Court conviction evidence
  const courtEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.sourceType === 'court'
  );
  if (courtEvidence.length > 0) {
    details.push(`Court conviction(s) found: ${courtEvidence.length}`);
    return {
      flag: 'RED',
      reason: 'Court conviction found against organization',
      details,
      severity: 'critical',
    };
  }

  // Condition 3: Government ruling
  const govEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.sourceType === 'government' && e.severity === 'high'
  );
  if (govEvidence.length > 0) {
    details.push(`Government ruling(s) found: ${govEvidence.length}`);
    return {
      flag: 'RED',
      reason: 'Government ruling found against organization',
      details,
      severity: 'critical',
    };
  }

  // Condition 4: 3+ credible sources reporting concerns
  if (scoredResults.credibleSourceCount >= 3) {
    details.push(`${scoredResults.credibleSourceCount} credible sources report concerns`);
    return {
      flag: 'RED',
      reason: `${scoredResults.credibleSourceCount} credible sources report concerns`,
      details,
      severity: 'critical',
    };
  }

  // --- Check for YELLOW flag conditions ---
  // Need 2+ indicators from: news, NGO, verified forum, pending investigation

  let yellowIndicators = 0;

  const newsEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.sourceType === 'news'
  );
  if (newsEvidence.length > 0) {
    yellowIndicators++;
    details.push(`News article(s) found: ${newsEvidence.length}`);
  }

  const ngoEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.sourceType === 'ngo'
  );
  if (ngoEvidence.length > 0) {
    yellowIndicators++;
    details.push(`NGO report(s) found: ${ngoEvidence.length}`);
  }

  const forumEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.sourceType === 'forum'
  );
  if (forumEvidence.length > 0) {
    yellowIndicators++;
    details.push(`Forum mention(s) found: ${forumEvidence.length}`);
  }

  // Check for pending investigations (could come from any source)
  const pendingEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.status === 'pending'
  );
  if (pendingEvidence.length > 0) {
    yellowIndicators++;
    details.push(`Pending investigation(s): ${pendingEvidence.length}`);
  }

  if (yellowIndicators >= 2) {
    return {
      flag: 'YELLOW',
      reason: `${yellowIndicators} types of indicators found`,
      details,
      severity: 'warning',
    };
  }

  // --- Check for GREY flag (insufficient data) ---

  // If most sanctions checks had errors, we can't be confident
  const sanctionsErrors = sanctionsResult.errors.length;
  const totalSanctionsChecks = sanctionsResult.results.length;

  if (sanctionsErrors >= totalSanctionsChecks && scoredResults.totalItems === 0) {
    return {
      flag: 'GREY',
      reason: 'Insufficient data — could not verify from available sources',
      details: [`${sanctionsErrors} out of ${totalSanctionsChecks} sanctions checks failed`],
      severity: 'unknown',
    };
  }

  // --- GREEN flag: no concerns found ---

  // If we checked at least some sources and found nothing
  if (yellowIndicators === 1) {
    details.push('Only 1 indicator found (below yellow threshold)');
  }

  return {
    flag: 'GREEN',
    reason: 'No significant concerns found',
    details: details.length > 0 ? details : ['All available sources checked — no issues detected'],
    severity: 'none',
  };
}

module.exports = {
  assignFlag,
};
