/**
 * Koppla — Values Assessment Tool — Main Entry Point / CLI
 *
 * Usage:
 *   node src/index.js "Organization Name"
 *   node src/index.js --list              (list saved assessments)
 *
 * This is the main script that ties everything together:
 * 1. Takes an organization name as input
 * 2. Runs it through sanctions checks
 * 3. Detects languages and translates non-English/Swedish text
 * 4. Extracts entities (people, organizations, roles)
 * 5. Cross-references entities and builds a network graph
 * 6. Scores evidence and generates hypotheses
 * 7. Assigns a flag (red/yellow/green/grey)
 * 8. Saves the results to a JSON file
 * 9. Prints a readable summary
 */

const { checkAllSanctions } = require('./scrapers/sanctionsScraper');
const { scoreAllEvidence } = require('./scoring/credibility');
const { assignFlag } = require('./scoring/flagAssignment');
const { saveAssessment, listAssessments } = require('./storage/storage');
const { CATEGORIES } = require('./keywords/keywords');

// New Phase 2 modules
const { detectLanguage } = require('./language/languageDetector');
const { translateIfNeeded, clearCache: clearTranslationCache } = require('./language/translator');
const { extractFromMultipleTexts } = require('./entities/entityExtractor');
const { crossReference } = require('./network/crossReferencer');
const { buildNetworkGraph, calculateCentrality, exportForVisJs } = require('./network/networkGraph');
const { generateHypotheses } = require('./analysis/hypothesisGenerator');

// --- CLI Argument Parsing ---

const args = process.argv.slice(2); // remove "node" and script path

// Show help if no arguments
if (args.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Koppla — Values Assessment Tool v2.0       ║
╚══════════════════════════════════════════════════╝

Usage:
  node src/index.js "Organization Name"    Assess an organization
  node src/index.js --list                 List saved assessments
  node src/index.js --help                 Show this help

Example:
  node src/index.js "Acme Corporation"
`);
  process.exit(0);
}

// Handle --list command
if (args[0] === '--list') {
  const assessments = listAssessments();
  if (assessments.length === 0) {
    console.log('No saved assessments found.');
  } else {
    console.log('\nSaved Assessments:');
    console.log('─'.repeat(60));
    for (const a of assessments) {
      const flagEmoji = getFlagEmoji(a.flag);
      console.log(`  ${flagEmoji} ${a.orgName} (${a.date})`);
      console.log(`     File: ${a.filename}`);
    }
  }
  process.exit(0);
}

// Handle --help
if (args[0] === '--help') {
  process.argv = process.argv.slice(0, 2);
  require('./index');
  process.exit(0);
}

// Main assessment flow
const orgName = args.join(' '); // allow "Acme Corp" without quotes
runAssessment(orgName);

/**
 * Main assessment function.
 * Orchestrates the full pipeline: check → language → entities → network → score → flag → save → display.
 *
 * @param {string} orgName - The organization name to assess
 */
async function runAssessment(orgName) {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Koppla — Values Assessment Tool v2.0       ║
╚══════════════════════════════════════════════════╝
`);
  console.log(`Assessing: "${orgName}"`);
  console.log('─'.repeat(50));

  // Clear translation cache from any previous run
  clearTranslationCache();

  // === Step 1: Check sanctions lists ===
  console.log('\n[1/7] Checking sanctions lists...');
  const sanctionsResult = await checkAllSanctions(orgName);

  // === Step 2: Build evidence list ===
  console.log('\n[2/7] Building evidence list...');
  const evidence = buildEvidenceFromSanctions(sanctionsResult);
  console.log(`  Found ${evidence.length} piece(s) of evidence`);

  // === Step 3: Language detection & translation ===
  console.log('\n[3/7] Processing languages...');
  const processedTexts = await processLanguages(evidence, sanctionsResult);
  const languagesDetected = [...new Set(processedTexts.map((t) => t.language))];
  const translationsPerformed = processedTexts.filter(
    (t) => t.translationSource !== 'not-needed' && t.translationSource !== 'none'
  ).length;
  console.log(`  Texts processed: ${processedTexts.length}`);
  console.log(`  Languages detected: ${languagesDetected.join(', ') || 'none'}`);
  console.log(`  Translations performed: ${translationsPerformed}`);

  // === Step 4: Entity extraction ===
  console.log('\n[4/7] Extracting entities...');
  const textObjects = processedTexts.map((pt) => ({
    text: pt.translatedText || pt.originalText,
    source: pt.source,
    sourceUrl: pt.sourceUrl || '',
    language: pt.language,
  }));
  const extractionResult = extractFromMultipleTexts(textObjects, orgName);
  console.log(`  Entities found: ${extractionResult.summary.people} people, ${extractionResult.summary.organizations} organizations`);

  // === Step 5: Cross-referencing & network graph ===
  console.log('\n[5/7] Cross-referencing & building network...');
  const textSources = processedTexts.map((pt) => ({
    text: pt.translatedText || pt.originalText,
    source: pt.source,
  }));
  const crossRefResult = crossReference(
    extractionResult.entities,
    evidence,
    orgName,
    textSources
  );
  const networkGraph = buildNetworkGraph(
    orgName,
    extractionResult.entities,
    crossRefResult.relationships
  );
  console.log(`  Relationships: ${crossRefResult.summary.totalRelationships}`);
  console.log(`  Anomalies: ${crossRefResult.summary.totalAnomalies}`);
  console.log(`  Network: ${networkGraph.graphMetadata.totalNodes} nodes, ${networkGraph.graphMetadata.totalEdges} edges`);

  // === Step 6: Score evidence & generate hypotheses ===
  console.log('\n[6/7] Scoring evidence & generating hypotheses...');
  const scoredResults = scoreAllEvidence(evidence);
  const { hypotheses, confidenceWarnings } = generateHypotheses(
    scoredResults,
    networkGraph,
    crossRefResult,
    extractionResult
  );
  console.log(`  Overall score: ${scoredResults.overallScore.toFixed(1)}`);
  console.log(`  Credible sources: ${scoredResults.credibleSourceCount}`);
  console.log(`  Hypotheses generated: ${hypotheses.length}`);
  console.log(`  Name warnings: ${confidenceWarnings.length}`);

  // === Step 7: Assign flag ===
  console.log('\n[7/7] Assigning flag...');
  const flag = assignFlag({
    sanctionsResult,
    scoredResults,
    hypotheses,
    confidenceWarnings,
  });

  // === Compile and save assessment ===
  const assessment = {
    orgName,
    assessedAt: new Date().toISOString(),
    flag,
    sanctions: sanctionsResult,
    scoring: {
      overallScore: scoredResults.overallScore,
      credibleSourceCount: scoredResults.credibleSourceCount,
      totalItems: scoredResults.totalItems,
      byCategory: Object.fromEntries(
        Object.entries(scoredResults.byCategory).map(([cat, data]) => [
          cat,
          { count: data.count, totalScore: data.totalScore },
        ])
      ),
    },
    evidence: scoredResults.scoredEvidence,
    categories: CATEGORIES,

    // --- New Phase 2 data ---
    entities: extractionResult,
    networkGraph,
    visJsExport: exportForVisJs(networkGraph),
    hypotheses,
    confidenceWarnings,
    languageProcessing: {
      textsProcessed: processedTexts.length,
      languagesDetected,
      translationsPerformed,
    },

    metadata: {
      version: '2.0',
      toolName: 'Koppla',
      sourcesChecked: ['OFAC SDN List', 'UN Sanctions List', 'EU Sanctions List'],
      sourcesNotYetImplemented: ['News', 'Forums', 'Social Media', 'NGO Reports'],
      analysisLayers: [
        'sanctions-check',
        'language-detection',
        'entity-extraction',
        'cross-referencing',
        'network-graph',
        'hypothesis-generation',
      ],
    },
  };

  console.log('\nSaving assessment...');
  const savedPath = saveAssessment(assessment);
  console.log(`  Saved to: ${savedPath}`);

  // Print summary
  printSummary(assessment);
}

/**
 * Process text through language detection and translation.
 * Extracts text content from evidence and sanctions results,
 * detects its language, and translates if needed.
 *
 * @param {Array} evidence - Evidence items
 * @param {Object} sanctionsResult - Sanctions check results
 * @returns {Array} Processed text objects with translations
 */
async function processLanguages(evidence, sanctionsResult) {
  const processedTexts = [];

  // Process evidence descriptions
  for (const ev of evidence) {
    const text = ev.description || '';
    if (!text || text.length < 5) continue;

    const langResult = detectLanguage(text);
    const translation = await translateIfNeeded(text, langResult.detectedLanguage);

    processedTexts.push({
      originalText: text,
      translatedText: translation.translatedText,
      language: langResult.detectedLanguage,
      languageName: langResult.languageName,
      needsTranslation: langResult.needsTranslation,
      translationSource: translation.translationSource,
      source: ev.source,
      sourceUrl: ev.sourceUrl,
    });
  }

  // Process raw sanctions match data (names, context lines)
  for (const result of sanctionsResult.results) {
    for (const match of result.matches || []) {
      // Process the matched name
      const nameText = match.name || '';
      if (nameText.length >= 3) {
        const langResult = detectLanguage(nameText);
        const translation = await translateIfNeeded(nameText, langResult.detectedLanguage);

        processedTexts.push({
          originalText: nameText,
          translatedText: translation.translatedText,
          language: langResult.detectedLanguage,
          languageName: langResult.languageName,
          needsTranslation: langResult.needsTranslation,
          translationSource: translation.translationSource,
          source: result.source,
          sourceUrl: result.sourceUrl,
        });
      }

      // Process raw line context if available (e.g., from EU list)
      const rawLine = match.rawLine || '';
      if (rawLine.length >= 10) {
        const langResult = detectLanguage(rawLine);
        const translation = await translateIfNeeded(rawLine, langResult.detectedLanguage);

        processedTexts.push({
          originalText: rawLine,
          translatedText: translation.translatedText,
          language: langResult.detectedLanguage,
          languageName: langResult.languageName,
          needsTranslation: langResult.needsTranslation,
          translationSource: translation.translationSource,
          source: result.source,
          sourceUrl: result.sourceUrl,
        });
      }
    }
  }

  return processedTexts;
}

/**
 * Convert sanctions results into evidence items that the scoring system can process.
 *
 * @param {Object} sanctionsResult - Result from checkAllSanctions()
 * @returns {Array} Array of evidence objects
 */
function buildEvidenceFromSanctions(sanctionsResult) {
  const evidence = [];

  for (const result of sanctionsResult.results) {
    if (result.found) {
      for (const match of result.matches) {
        evidence.push({
          sourceType: 'government',   // sanctions lists are government sources
          category: 'human-rights',   // sanctions typically relate to human rights
          severity: 'high',           // being on a sanctions list is always high severity
          description: `Found on ${result.source}: "${match.name}"`,
          source: result.source,
          sourceUrl: result.sourceUrl,
          matchedName: match.name,
          status: 'confirmed',
        });
      }
    }
  }

  return evidence;
}

/**
 * Print a readable summary of the assessment to the terminal.
 */
function printSummary(assessment) {
  const flag = assessment.flag;
  const emoji = getFlagEmoji(flag.flag);

  console.log('\n');
  console.log('═'.repeat(55));
  console.log(`  KOPPLA ASSESSMENT: ${emoji} ${flag.flag}`);
  console.log('═'.repeat(55));
  console.log(`  Organization: ${assessment.orgName}`);
  console.log(`  Date:         ${assessment.assessedAt}`);
  console.log(`  Flag:         ${emoji} ${flag.flag}`);
  console.log(`  Reason:       ${flag.reason}`);

  if (flag.details.length > 0) {
    console.log(`  Details:`);
    for (const detail of flag.details) {
      console.log(`    - ${detail}`);
    }
  }

  // --- Sanctions section ---
  console.log('─'.repeat(55));
  console.log(`  Sanctions:      ${assessment.sanctions.sanctioned ? 'YES — found on list' : 'Not found'}`);
  console.log(`  Evidence items: ${assessment.scoring.totalItems}`);
  console.log(`  Overall score:  ${assessment.scoring.overallScore.toFixed(1)}`);

  // --- Analysis section (new) ---
  console.log('─'.repeat(55));
  const entities = assessment.entities?.summary || {};
  console.log(`  Entities:       ${entities.people || 0} people, ${entities.organizations || 0} organizations`);
  const graph = assessment.networkGraph?.graphMetadata || {};
  console.log(`  Network:        ${graph.totalNodes || 0} nodes, ${graph.totalEdges || 0} edges`);

  // Show edge type breakdown if there are edges
  if (graph.edgeTypeBreakdown && Object.keys(graph.edgeTypeBreakdown).length > 0) {
    const breakdown = Object.entries(graph.edgeTypeBreakdown)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    console.log(`                  (${breakdown})`);
  }

  console.log(`  Hypotheses:     ${(assessment.hypotheses || []).length} generated`);

  // Print hypotheses if any
  if (assessment.hypotheses && assessment.hypotheses.length > 0) {
    for (const hyp of assessment.hypotheses) {
      const confEmoji = hyp.confidence === 'high' ? '!' : hyp.confidence === 'medium' ? '~' : '?';
      console.log(`    [${confEmoji}] ${hyp.description}`);
      console.log(`        Confidence: ${hyp.confidence} (${(hyp.confidenceScore * 100).toFixed(0)}%) | Type: ${hyp.type}`);
      if (hyp.warnings.length > 0) {
        for (const w of hyp.warnings) {
          console.log(`        Warning: ${w}`);
        }
      }
    }
  }

  // Confidence warnings
  if (assessment.confidenceWarnings && assessment.confidenceWarnings.length > 0) {
    console.log(`  Name warnings:  ${assessment.confidenceWarnings.length}`);
    for (const w of assessment.confidenceWarnings) {
      console.log(`    - ${w.warning}`);
    }
  }

  // Language processing
  const lang = assessment.languageProcessing || {};
  if (lang.translationsPerformed > 0) {
    console.log(`  Translations:   ${lang.translationsPerformed} performed`);
  }

  // Errors
  if (assessment.sanctions.errors.length > 0) {
    console.log(`\n  Source errors:`);
    for (const err of assessment.sanctions.errors) {
      console.log(`    - ${err}`);
    }
  }

  console.log('─'.repeat(55));
  console.log(`  Sources checked: ${assessment.metadata.sourcesChecked.join(', ')}`);
  console.log(`  Not yet available: ${assessment.metadata.sourcesNotYetImplemented.join(', ')}`);
  console.log(`  Analysis layers: ${assessment.metadata.analysisLayers.length} active`);
  console.log('═'.repeat(55));
}

/**
 * Get a visual emoji/symbol for a flag color.
 */
function getFlagEmoji(flag) {
  switch (flag) {
    case 'RED':    return '🔴';
    case 'YELLOW': return '🟡';
    case 'GREEN':  return '🟢';
    case 'GREY':   return '⚪';
    default:       return '❓';
  }
}
