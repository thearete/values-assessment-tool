/**
 * Flag Assignment
 *
 * Determines the overall flag color for an organization based on
 * the evidence collected and scored.
 *
 * Flag rules:
 *   RED    — sanctions list match OR court conviction OR 3+ credible sources OR government ruling
 *   YELLOW — 2+ indicators from: news article, verified forum quote, NGO report, pending investigation, high-confidence hypotheses
 *   GREEN  — No concerns found after checking available sources
 *   GREY   — Insufficient data (couldn't check sources, or sources returned errors)
 *
 * Also computes thresholdInfo: shows how close the org is to the next flag level,
 * and what would need to change for the flag to shift (e.g., "1 more indicator → YELLOW").
 */

/**
 * Assign a flag color based on scored evidence and sanctions results.
 * Now also returns thresholdInfo with "what would change the flag" analysis.
 *
 * @param {Object} params
 * @param {Object} params.sanctionsResult - Result from checkAllSanctions()
 * @param {Object} params.scoredResults - Result from scoreAllEvidence()
 * @param {Array} params.hypotheses - Generated hypotheses
 * @param {Array} params.confidenceWarnings - Common-name warnings
 * @returns {Object} { flag, reason, details, severity, thresholdInfo }
 */
function assignFlag({ sanctionsResult, scoredResults, hypotheses = [], confidenceWarnings = [] }) {
  const details = [];

  // === Compute all condition states (used for both flag assignment AND threshold info) ===

  const isSanctioned = sanctionsResult.sanctioned;

  const courtEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.sourceType === 'court'
  );
  const hasCourtConviction = courtEvidence.length > 0;

  const govEvidence = scoredResults.scoredEvidence.filter(
    (e) => e.sourceType === 'government' && e.severity === 'high'
  );
  const hasGovRuling = govEvidence.length > 0;

  const hasThreeCredible = scoredResults.credibleSourceCount >= 3;

  // Count how many RED conditions are met
  const redConditions = [
    { met: isSanctioned, label: 'sanctions match' },
    { met: hasCourtConviction, label: 'court conviction' },
    { met: hasGovRuling, label: 'government ruling' },
    { met: hasThreeCredible, label: '3+ credible sources' },
  ];
  const redConditionsMet = redConditions.filter((c) => c.met).length;

  // Count yellow indicators
  let yellowIndicators = 0;

  const newsEvidence = scoredResults.scoredEvidence.filter((e) => e.sourceType === 'news');
  if (newsEvidence.length > 0) yellowIndicators++;

  const ngoEvidence = scoredResults.scoredEvidence.filter((e) => e.sourceType === 'ngo');
  if (ngoEvidence.length > 0) yellowIndicators++;

  const forumEvidence = scoredResults.scoredEvidence.filter((e) => e.sourceType === 'forum');
  if (forumEvidence.length > 0) yellowIndicators++;

  const pendingEvidence = scoredResults.scoredEvidence.filter((e) => e.status === 'pending');
  if (pendingEvidence.length > 0) yellowIndicators++;

  const highConfHypotheses = hypotheses.filter((h) => h.confidence === 'high');
  if (highConfHypotheses.length > 0) yellowIndicators += highConfHypotheses.length;

  const sanctionsErrors = sanctionsResult.errors.length;
  const totalSanctionsChecks = sanctionsResult.results.length;

  // === Determine the flag ===

  let flag, reason, severity;

  // --- RED ---
  if (isSanctioned) {
    details.push('Found on international sanctions list');
    flag = 'RED'; reason = 'Organization found on international sanctions list'; severity = 'critical';
  } else if (hasCourtConviction) {
    details.push(`Court conviction(s) found: ${courtEvidence.length}`);
    flag = 'RED'; reason = 'Court conviction found against organization'; severity = 'critical';
  } else if (hasGovRuling) {
    details.push(`Government ruling(s) found: ${govEvidence.length}`);
    flag = 'RED'; reason = 'Government ruling found against organization'; severity = 'critical';
  } else if (hasThreeCredible) {
    details.push(`${scoredResults.credibleSourceCount} credible sources report concerns`);
    flag = 'RED'; reason = `${scoredResults.credibleSourceCount} credible sources report concerns`; severity = 'critical';

  // --- YELLOW ---
  } else if (yellowIndicators >= 2) {
    if (newsEvidence.length > 0) details.push(`News article(s) found: ${newsEvidence.length}`);
    if (ngoEvidence.length > 0) details.push(`NGO report(s) found: ${ngoEvidence.length}`);
    if (forumEvidence.length > 0) details.push(`Forum mention(s) found: ${forumEvidence.length}`);
    if (pendingEvidence.length > 0) details.push(`Pending investigation(s): ${pendingEvidence.length}`);
    if (highConfHypotheses.length > 0) details.push(`${highConfHypotheses.length} high-confidence hypothesis(es)`);
    flag = 'YELLOW'; reason = `${yellowIndicators} types of indicators found`; severity = 'warning';

  // --- GREY ---
  } else if (sanctionsErrors >= totalSanctionsChecks && scoredResults.totalItems === 0) {
    details.push(`${sanctionsErrors} out of ${totalSanctionsChecks} sanctions checks failed`);
    flag = 'GREY'; reason = 'Insufficient data — could not verify from available sources'; severity = 'unknown';

  // --- GREEN ---
  } else {
    if (newsEvidence.length > 0) details.push(`News article(s) found: ${newsEvidence.length}`);
    if (ngoEvidence.length > 0) details.push(`NGO report(s) found: ${ngoEvidence.length}`);
    if (forumEvidence.length > 0) details.push(`Forum mention(s) found: ${forumEvidence.length}`);
    if (pendingEvidence.length > 0) details.push(`Pending investigation(s): ${pendingEvidence.length}`);
    if (highConfHypotheses.length > 0) details.push(`${highConfHypotheses.length} high-confidence hypothesis(es)`);
    if (yellowIndicators === 1) details.push('Only 1 indicator found (below yellow threshold)');
    if (confidenceWarnings.length > 0) details.push(`${confidenceWarnings.length} name(s) flagged as common — verify manually`);
    if (details.length === 0) details.push('All available sources checked — no issues detected');
    flag = 'GREEN'; reason = 'No significant concerns found'; severity = 'none';
  }

  // === Build threshold info — "what would change the flag" ===

  const thresholdInfo = buildThresholdInfo({
    currentFlag: flag,
    yellowIndicators,
    redConditions,
    redConditionsMet,
    scoredResults,
    sanctionsErrors,
    totalSanctionsChecks,
  });

  return { flag, reason, details, severity, thresholdInfo };
}

/**
 * Build threshold information: how close is the flag to changing?
 * Generates plain-English "what would change" statements.
 */
function buildThresholdInfo({ currentFlag, yellowIndicators, redConditions, redConditionsMet, scoredResults }) {
  const yellowThreshold = 2;
  const distanceToYellow = Math.max(0, yellowThreshold - yellowIndicators);

  const whatWouldChange = [];

  if (currentFlag === 'GREEN') {
    // What would make it YELLOW?
    if (distanceToYellow === 1) {
      whatWouldChange.push('1 more indicator type (news/NGO/forum/investigation) would change this to YELLOW');
    } else if (distanceToYellow > 1) {
      whatWouldChange.push(`${distanceToYellow} more indicator types needed to reach YELLOW`);
    }

    // What would make it RED?
    const unmetRed = redConditions.filter((c) => !c.met).map((c) => c.label);
    if (unmetRed.length > 0) {
      whatWouldChange.push(`Any of these would immediately trigger RED: ${unmetRed.join(', ')}`);
    }
  }

  if (currentFlag === 'YELLOW') {
    // What would make it RED?
    const unmetRed = redConditions.filter((c) => !c.met).map((c) => c.label);
    if (unmetRed.length > 0) {
      whatWouldChange.push(`Any of these would escalate to RED: ${unmetRed.join(', ')}`);
    }

    // How many more credible sources to hit the "3+ credible" RED trigger?
    const credibleGap = 3 - scoredResults.credibleSourceCount;
    if (credibleGap > 0) {
      whatWouldChange.push(`${credibleGap} more credible source(s) would trigger RED via "3+ credible sources" rule`);
    }
  }

  if (currentFlag === 'RED') {
    whatWouldChange.push('Already at highest flag level — no escalation possible');
  }

  if (currentFlag === 'GREY') {
    whatWouldChange.push('Re-running with working network connections may resolve to GREEN, YELLOW, or RED');
  }

  return {
    currentFlag,
    yellowIndicators,
    yellowThreshold,
    distanceToYellow,
    redConditionsMet,
    distanceToRed: currentFlag === 'RED' ? 0 : `Needs: ${redConditions.filter((c) => !c.met).map((c) => c.label).join(' or ')}`,
    whatWouldChange,
  };
}

module.exports = {
  assignFlag,
};
