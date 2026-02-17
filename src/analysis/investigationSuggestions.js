/**
 * Investigation Suggestions Generator
 *
 * After Koppla runs an analysis, this module looks at what's missing,
 * what's uncertain, and what's close to a threshold — then generates
 * actionable suggestions for the analyst.
 *
 * Think of it as a senior analyst reviewing a junior analyst's work
 * and saying: "Good start. Now go check this, and this would help clarify that."
 *
 * Suggestion types:
 * - Source errors: "Re-run — a sanctions check failed"
 * - Missing roles: "We found a person but don't know their role"
 * - Near-threshold: "One more indicator and this turns YELLOW"
 * - Low-confidence hypotheses: "This lead needs more evidence"
 * - Unexplored connections: "This entity is mentioned a lot but unlinked"
 * - Common names: "This name is too common — need more identifiers"
 * - Translation gaps: "Some text couldn't be translated"
 */

let suggestionCounter = 0;

/**
 * Generate investigation suggestions from a completed assessment.
 *
 * @param {Object} assessment - The full assessment object (after all analysis)
 * @returns {Object} { suggestions: Array, summary: Object }
 */
function generateSuggestions(assessment) {
  suggestionCounter = 0;
  const suggestions = [];

  // --- 1. Source errors ---
  suggestions.push(...checkSourceErrors(assessment));

  // --- 2. Missing entity roles ---
  suggestions.push(...checkMissingRoles(assessment));

  // --- 3. Near-threshold flags ---
  suggestions.push(...checkNearThreshold(assessment));

  // --- 4. Low-confidence hypotheses ---
  suggestions.push(...checkLowConfidenceHypotheses(assessment));

  // --- 5. Unexplored connections ---
  suggestions.push(...checkUnexploredConnections(assessment));

  // --- 6. Common name warnings ---
  suggestions.push(...checkCommonNames(assessment));

  // --- 7. Translation gaps ---
  suggestions.push(...checkTranslationGaps(assessment));

  // Sort by priority: high first, then medium, then low
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return {
    suggestions,
    summary: {
      total: suggestions.length,
      high: suggestions.filter((s) => s.priority === 'high').length,
      medium: suggestions.filter((s) => s.priority === 'medium').length,
      low: suggestions.filter((s) => s.priority === 'low').length,
      actionable: suggestions.filter((s) => s.actionable).length,
    },
  };
}

/**
 * Check for sanctions/source errors that might have caused incomplete results.
 */
function checkSourceErrors(assessment) {
  const suggestions = [];
  const errors = assessment.sanctions?.errors || [];
  const totalChecks = assessment.sanctions?.results?.length || 0;

  if (errors.length > 0) {
    suggestions.push(createSuggestion({
      type: 'source-error',
      priority: 'high',
      description: `${errors.length} of ${totalChecks} sanctions checks failed. Results may be incomplete. Re-running the analysis might resolve temporary network issues.`,
      actionable: true,
      suggestedAction: `Re-run: node src/index.js "${assessment.orgName}"`,
    }));
  }

  return suggestions;
}

/**
 * Check for entities that were found but have no confirmed role.
 */
function checkMissingRoles(assessment) {
  const suggestions = [];
  const entities = assessment.entities?.entities || [];

  for (const entity of entities) {
    if (entity.type === 'person' && (!entity.roles || entity.roles.length === 0)) {
      // Only suggest for entities with decent confidence
      if (entity.confidence >= 0.5) {
        suggestions.push(createSuggestion({
          type: 'missing-role',
          priority: 'medium',
          description: `Entity "${entity.name}" found but role is unknown. If you know their position (CEO, director, etc.), providing it as a seed could reveal organizational links.`,
          actionable: true,
          suggestedAction: `Add seed: --seed "${entity.name}, [ROLE]"`,
          relatedEntityId: entity.id,
        }));
      }
    }
  }

  return suggestions;
}

/**
 * Check if the flag is near a threshold (GREEN close to YELLOW, YELLOW close to RED).
 */
function checkNearThreshold(assessment) {
  const suggestions = [];
  const threshold = assessment.thresholdInfo;

  if (!threshold) return suggestions;

  // GREEN and close to YELLOW
  if (threshold.currentFlag === 'GREEN' && threshold.distanceToYellow <= 1) {
    suggestions.push(createSuggestion({
      type: 'near-threshold',
      priority: 'high',
      description: `This organization is GREEN but only ${threshold.distanceToYellow} indicator(s) away from YELLOW. Checking news sources or NGO reports for "${assessment.orgName}" could resolve this.`,
      actionable: true,
      suggestedAction: `Search news for "${assessment.orgName}" and add findings as evidence in future versions`,
    }));
  }

  // YELLOW and close to RED
  if (threshold.currentFlag === 'YELLOW') {
    suggestions.push(createSuggestion({
      type: 'near-threshold',
      priority: 'high',
      description: `This organization is YELLOW. If additional credible sources are found, it may escalate to RED. ${threshold.distanceToRed}`,
      actionable: false,
      suggestedAction: '',
    }));
  }

  return suggestions;
}

/**
 * Check for hypotheses with low confidence that could be strengthened.
 */
function checkLowConfidenceHypotheses(assessment) {
  const suggestions = [];
  const hypotheses = assessment.hypotheses || [];

  for (const hyp of hypotheses) {
    if (hyp.confidence === 'low' || (hyp.confidenceScore && hyp.confidenceScore < 0.5)) {
      // Find related entity names
      const relatedNames = (hyp.relatedEntities || [])
        .map((id) => {
          const entity = (assessment.entities?.entities || []).find((e) => e.id === id);
          return entity ? entity.name : id;
        })
        .join(', ');

      suggestions.push(createSuggestion({
        type: 'low-confidence',
        priority: 'medium',
        description: `Hypothesis "${hyp.description.substring(0, 80)}..." has low confidence (${Math.round((hyp.confidenceScore || 0) * 100)}%). Additional information about ${relatedNames || 'related entities'} could strengthen or dismiss it.`,
        actionable: relatedNames.length > 0,
        suggestedAction: relatedNames ? `Investigate: ${relatedNames}` : '',
        relatedEntityId: hyp.relatedEntities?.[0] || null,
      }));
    }
  }

  return suggestions;
}

/**
 * Check for entities mentioned frequently but not connected in the graph.
 */
function checkUnexploredConnections(assessment) {
  const suggestions = [];
  const entities = assessment.entities?.entities || [];
  const edges = assessment.networkGraph?.edges || [];

  for (const entity of entities) {
    if ((entity.mentionCount || 0) >= 3) {
      // Check if this entity has any edges in the graph
      const hasEdges = edges.some(
        (e) => e.from === entity.id || e.to === entity.id
      );

      if (!hasEdges) {
        suggestions.push(createSuggestion({
          type: 'unexplored',
          priority: 'medium',
          description: `"${entity.name}" is mentioned ${entity.mentionCount} times but has no confirmed connections in the network. Investigating their relationship to "${assessment.orgName}" may reveal hidden links.`,
          actionable: true,
          suggestedAction: `Try: --seed "${entity.name}"`,
          relatedEntityId: entity.id,
        }));
      }
    }
  }

  return suggestions;
}

/**
 * Surface common-name warnings as suggestions.
 */
function checkCommonNames(assessment) {
  const suggestions = [];
  const warnings = assessment.confidenceWarnings || [];

  for (const warning of warnings) {
    suggestions.push(createSuggestion({
      type: 'common-name',
      priority: warning.nameFrequencyEstimate === 'very-high' ? 'high' : 'medium',
      description: warning.warning,
      actionable: true,
      suggestedAction: warning.recommendation || 'Provide additional identifying information (date of birth, national ID)',
      relatedEntityId: warning.entityId || null,
    }));
  }

  return suggestions;
}

/**
 * Check for translation failures.
 */
function checkTranslationGaps(assessment) {
  const suggestions = [];
  const lang = assessment.languageProcessing || {};

  // If there were texts that needed translation but failed
  // (We can infer this if textsProcessed > 0 but translationsPerformed is lower than expected)
  // For now, we check if any processedTexts had translation errors
  // This is a simpler check since we don't store individual translation errors in the assessment

  if (lang.textsProcessed > 0 && lang.languagesDetected) {
    const nonEnSv = lang.languagesDetected.filter(
      (l) => l !== 'eng' && l !== 'swe' && l !== 'und'
    );
    if (nonEnSv.length > 0 && lang.translationsPerformed === 0) {
      suggestions.push(createSuggestion({
        type: 'translation-gap',
        priority: 'medium',
        description: `Non-English/Swedish text detected (${nonEnSv.join(', ')}) but no translations were performed. The original text may contain entities that were missed.`,
        actionable: false,
        suggestedAction: 'Check if Google Translate is accessible from your network',
      }));
    }
  }

  return suggestions;
}

// === Helpers ===

function createSuggestion({ type, priority, description, actionable, suggestedAction, relatedEntityId }) {
  suggestionCounter++;
  return {
    id: `sug-${String(suggestionCounter).padStart(3, '0')}`,
    type,
    priority,
    description,
    actionable: actionable || false,
    suggestedAction: suggestedAction || '',
    relatedEntityId: relatedEntityId || null,
  };
}

module.exports = {
  generateSuggestions,
};
