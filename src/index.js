/**
 * Koppla — Values Assessment Tool — Main Entry Point / CLI
 *
 * Usage:
 *   node src/index.js "Organization Name"
 *   node src/index.js "Org Name" --seed "Ahmed Al-Rashid, CEO"
 *   node src/index.js "Org Name" --seed-org "Shell Company Ltd"
 *   node src/index.js "Org Name" --pdf "/path/to/report.pdf"
 *   node src/index.js --list
 *
 * Pipeline (9 steps):
 * 1. Check sanctions (org + seed names)
 * 2. Build evidence list
 * 3. Extract text from PDFs (if provided)
 * 4. Detect languages & translate
 * 5. Extract entities (seeds injected)
 * 6. Cross-reference & build network graph
 *    6.5. Calculate hop distances & apply decay
 * 7. Score evidence & generate hypotheses
 * 8. Assign flag (with threshold info)
 * 9. Generate investigation suggestions
 * Save + print
 */

const { checkAllSanctions } = require('./scrapers/sanctionsScraper');
const { extractFromMultiplePDFs } = require('./scrapers/pdfScraper');
const { scoreAllEvidence } = require('./scoring/credibility');
const { assignFlag } = require('./scoring/flagAssignment');
const { saveAssessment, listAssessments } = require('./storage/storage');
const { CATEGORIES } = require('./keywords/keywords');
const { detectLanguage } = require('./language/languageDetector');
const { translateIfNeeded, clearCache: clearTranslationCache } = require('./language/translator');
const { extractFromMultipleTexts } = require('./entities/entityExtractor');
const { crossReference } = require('./network/crossReferencer');
const { buildNetworkGraph, calculateCentrality, exportForVisJs } = require('./network/networkGraph');
const { calculateHopDistances, applyDistanceDecay } = require('./analysis/hopDistance');
const { generateHypotheses } = require('./analysis/hypothesisGenerator');
const { generateSuggestions } = require('./analysis/investigationSuggestions');

// ===================================================================
// CLI ARGUMENT PARSING
// ===================================================================

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
  printHelp();
  process.exit(0);
}

if (rawArgs[0] === '--help') {
  printHelp();
  process.exit(0);
}

if (rawArgs[0] === '--list') {
  const assessments = listAssessments();
  if (assessments.length === 0) {
    console.log('No saved assessments found.');
  } else {
    console.log('\nSaved Assessments:');
    console.log('─'.repeat(60));
    for (const a of assessments) {
      console.log(`  ${getFlagEmoji(a.flag)} ${a.orgName} (${a.date})`);
      console.log(`     File: ${a.filename}`);
    }
  }
  process.exit(0);
}

// Parse structured args: org name, --seed, --seed-org, --pdf
const { orgName, seeds, pdfPaths } = parseArgs(rawArgs);

if (!orgName) {
  console.log('Error: Organization name is required.');
  console.log('Usage: node src/index.js "Organization Name" [--seed "Name, Role"] [--pdf file.pdf]');
  process.exit(1);
}

// Run the assessment
runAssessment(orgName, seeds, pdfPaths);

/**
 * Parse CLI arguments into structured data.
 *
 * Supports:
 *   node src/index.js "Org Name" --seed "Person, Role" --seed "Person2" --seed-org "Org" --pdf file.pdf
 *
 * Everything before the first -- flag is the org name.
 * --seed "Name, Role" → adds a person seed (role is optional after comma)
 * --seed-org "Name" → adds an organization seed
 * --pdf "path" → adds a PDF file path
 */
function parseArgs(args) {
  const seeds = [];
  const pdfPaths = [];
  const orgParts = [];
  let i = 0;

  while (i < args.length) {
    if (args[i] === '--seed' && i + 1 < args.length) {
      i++;
      const seedInput = args[i];
      // Parse "Name, Role" or just "Name"
      const parts = seedInput.split(',').map((s) => s.trim());
      seeds.push({
        name: parts[0],
        type: 'person',
        role: parts[1] || null,
        providedBy: 'user',
        confidence: 1.0,
      });
    } else if (args[i] === '--seed-org' && i + 1 < args.length) {
      i++;
      seeds.push({
        name: args[i],
        type: 'organization',
        role: null,
        providedBy: 'user',
        confidence: 1.0,
      });
    } else if (args[i] === '--pdf' && i + 1 < args.length) {
      i++;
      pdfPaths.push(args[i]);
    } else if (!args[i].startsWith('--')) {
      orgParts.push(args[i]);
    }
    i++;
  }

  return {
    orgName: orgParts.join(' '),
    seeds,
    pdfPaths,
  };
}

// ===================================================================
// MAIN PIPELINE
// ===================================================================

/**
 * Main assessment function.
 * Orchestrates the full 9-step pipeline.
 */
async function runAssessment(orgName, seeds = [], pdfPaths = []) {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Koppla — Values Assessment Tool v3.0       ║
╚══════════════════════════════════════════════════╝
`);
  console.log(`Assessing: "${orgName}"`);
  if (seeds.length > 0) {
    console.log(`Seeds: ${seeds.map((s) => `${s.name}${s.role ? ` (${s.role})` : ''} [${s.type}]`).join(', ')}`);
  }
  if (pdfPaths.length > 0) {
    console.log(`PDFs: ${pdfPaths.length} file(s)`);
  }
  console.log('─'.repeat(50));

  clearTranslationCache();

  // === [1/9] Check sanctions (org name + seed names) ===
  console.log('\n[1/9] Checking sanctions lists...');
  const sanctionsResult = await checkAllSanctions(orgName);

  // Also check seed person/org names against sanctions
  const seedSanctionsResults = [];
  for (const seed of seeds) {
    console.log(`  Also checking seed: "${seed.name}"...`);
    const seedResult = await checkAllSanctions(seed.name);
    seedSanctionsResults.push({ seed, result: seedResult });
  }

  // === [2/9] Build evidence list ===
  console.log('\n[2/9] Building evidence list...');
  const evidence = buildEvidenceFromSanctions(sanctionsResult);

  // Add evidence from seed sanctions checks
  for (const { seed, result } of seedSanctionsResults) {
    if (result.sanctioned) {
      for (const r of result.results) {
        for (const match of r.matches || []) {
          evidence.push({
            sourceType: 'government',
            category: 'human-rights',
            severity: 'high',
            description: `Seed "${seed.name}" found on ${r.source}: "${match.name}"`,
            source: r.source,
            sourceUrl: r.sourceUrl,
            matchedName: match.name,
            status: 'confirmed',
            linkedToSeed: seed.name,
          });
        }
      }
    }
  }
  console.log(`  Found ${evidence.length} piece(s) of evidence`);

  // === [3/9] Extract text from PDFs ===
  let pdfResults = { results: [], totalPages: 0, successCount: 0, errorCount: 0 };
  if (pdfPaths.length > 0) {
    console.log(`\n[3/9] Extracting text from ${pdfPaths.length} PDF(s)...`);
    pdfResults = await extractFromMultiplePDFs(pdfPaths);
    console.log(`  Extracted from ${pdfResults.successCount} PDF(s), ${pdfResults.totalPages} pages total`);
    if (pdfResults.errorCount > 0) {
      console.log(`  ${pdfResults.errorCount} PDF(s) failed`);
    }
  } else {
    console.log('\n[3/9] No PDFs provided — skipping');
  }

  // === [4/9] Language detection & translation ===
  console.log('\n[4/9] Processing languages...');
  const processedTexts = await processLanguages(evidence, sanctionsResult, seeds, pdfResults);
  const languagesDetected = [...new Set(processedTexts.map((t) => t.language))];
  const translationsPerformed = processedTexts.filter(
    (t) => t.translationSource !== 'not-needed' && t.translationSource !== 'none'
  ).length;
  console.log(`  Texts processed: ${processedTexts.length}`);
  console.log(`  Languages: ${languagesDetected.join(', ') || 'none'}`);
  console.log(`  Translations: ${translationsPerformed}`);

  // === [5/9] Entity extraction (seeds injected) ===
  console.log('\n[5/9] Extracting entities...');
  const textObjects = processedTexts.map((pt) => ({
    text: pt.translatedText || pt.originalText,
    source: pt.source,
    sourceUrl: pt.sourceUrl || '',
    language: pt.language,
  }));
  const extractionResult = extractFromMultipleTexts(textObjects, orgName);

  // Inject seed entities into the extraction result
  for (const seed of seeds) {
    const seedEntity = {
      id: `seed-${seeds.indexOf(seed)}-${seed.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`,
      name: seed.name,
      normalizedName: seed.name.toLowerCase().trim(),
      type: seed.type,
      extractedBy: 'user-seed',
      extractionMethods: ['user-seed'],
      roles: seed.role ? [seed.role] : [],
      aliases: [],
      confidence: 1.0,
      providedBy: 'user',
      sourceText: 'User-provided seed',
      sourceUrl: '',
      mentionContexts: [],
      mentionCount: 0,
    };

    // Check if this seed already exists in extracted entities (avoid duplicates)
    const alreadyExists = extractionResult.entities.some(
      (e) => e.normalizedName === seedEntity.normalizedName
    );
    if (!alreadyExists) {
      extractionResult.entities.push(seedEntity);
    } else {
      // Merge: boost existing entity with seed info
      const existing = extractionResult.entities.find(
        (e) => e.normalizedName === seedEntity.normalizedName
      );
      if (existing) {
        existing.confidence = 1.0;
        existing.providedBy = 'user';
        if (seed.role && !existing.roles.includes(seed.role)) {
          existing.roles.push(seed.role);
        }
      }
    }
  }

  // Update summary
  extractionResult.summary = {
    totalEntities: extractionResult.entities.length,
    people: extractionResult.entities.filter((e) => e.type === 'person').length,
    organizations: extractionResult.entities.filter((e) => e.type === 'organization').length,
  };

  console.log(`  Entities: ${extractionResult.summary.people} people, ${extractionResult.summary.organizations} organizations`);
  if (seeds.length > 0) {
    console.log(`  (includes ${seeds.length} user-provided seed(s))`);
  }

  // === [6/9] Cross-reference & build network ===
  console.log('\n[6/9] Cross-referencing & building network...');
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

  // [6.5] Calculate hop distances & apply decay
  calculateHopDistances(networkGraph);
  applyDistanceDecay(networkGraph);

  console.log(`  Relationships: ${crossRefResult.summary.totalRelationships}`);
  console.log(`  Anomalies: ${crossRefResult.summary.totalAnomalies}`);
  console.log(`  Network: ${networkGraph.graphMetadata.totalNodes} nodes, ${networkGraph.graphMetadata.totalEdges} edges`);
  if (networkGraph.graphMetadata.hopDistribution) {
    const hops = Object.entries(networkGraph.graphMetadata.hopDistribution)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    console.log(`  Hop distribution: ${hops}`);
  }

  // === [7/9] Score evidence & generate hypotheses ===
  console.log('\n[7/9] Scoring evidence & generating hypotheses...');
  const scoredResults = scoreAllEvidence(evidence);
  const { hypotheses, confidenceWarnings } = generateHypotheses(
    scoredResults,
    networkGraph,
    crossRefResult,
    extractionResult
  );
  console.log(`  Overall score: ${scoredResults.overallScore.toFixed(1)}`);
  console.log(`  Credible sources: ${scoredResults.credibleSourceCount}`);
  console.log(`  Hypotheses: ${hypotheses.length}`);
  console.log(`  Name warnings: ${confidenceWarnings.length}`);

  // === [8/9] Assign flag ===
  console.log('\n[8/9] Assigning flag...');
  const flag = assignFlag({
    sanctionsResult,
    scoredResults,
    hypotheses,
    confidenceWarnings,
  });

  // === [9/9] Generate investigation suggestions ===
  // (We build a preliminary assessment to pass to the suggestion generator)
  const prelimAssessment = {
    orgName,
    flag,
    sanctions: sanctionsResult,
    scoring: { overallScore: scoredResults.overallScore, credibleSourceCount: scoredResults.credibleSourceCount, totalItems: scoredResults.totalItems },
    entities: extractionResult,
    networkGraph,
    hypotheses,
    confidenceWarnings,
    thresholdInfo: flag.thresholdInfo,
    languageProcessing: { textsProcessed: processedTexts.length, languagesDetected, translationsPerformed },
  };

  console.log('\n[9/9] Generating investigation suggestions...');
  const { suggestions, summary: suggestionSummary } = generateSuggestions(prelimAssessment);
  console.log(`  Suggestions: ${suggestionSummary.total} (${suggestionSummary.high} high, ${suggestionSummary.medium} medium, ${suggestionSummary.low} low)`);

  // === Compile and save full assessment ===
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
    seeds,
    entities: extractionResult,
    networkGraph,
    visJsExport: exportForVisJs(networkGraph),
    hypotheses,
    confidenceWarnings,
    thresholdInfo: flag.thresholdInfo,
    suggestions,
    pdfSources: pdfResults.results.map((r) => ({
      source: r.source,
      filePath: r.filePath,
      pageCount: r.pageCount,
      success: r.success,
      error: r.error,
    })),
    languageProcessing: {
      textsProcessed: processedTexts.length,
      languagesDetected,
      translationsPerformed,
    },
    metadata: {
      version: '3.0',
      toolName: 'Koppla',
      sourcesChecked: ['OFAC SDN List', 'UN Sanctions List', 'EU Sanctions List'],
      sourcesNotYetImplemented: ['News', 'Forums', 'Social Media', 'NGO Reports'],
      analysisLayers: [
        'sanctions-check',
        'pdf-extraction',
        'language-detection',
        'entity-extraction',
        'cross-referencing',
        'network-graph',
        'hop-distance',
        'hypothesis-generation',
        'investigation-suggestions',
      ],
    },
  };

  console.log('\nSaving assessment...');
  const savedPath = saveAssessment(assessment);
  console.log(`  Saved to: ${savedPath}`);

  printSummary(assessment);
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Process text through language detection and translation.
 * Handles evidence, sanctions data, seed names, and PDF text.
 */
async function processLanguages(evidence, sanctionsResult, seeds, pdfResults) {
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

  // Process sanctions match names and raw lines
  for (const result of sanctionsResult.results) {
    for (const match of result.matches || []) {
      const nameText = match.name || '';
      if (nameText.length >= 3) {
        const langResult = detectLanguage(nameText);
        const translation = await translateIfNeeded(nameText, langResult.detectedLanguage);
        processedTexts.push({
          originalText: nameText,
          translatedText: translation.translatedText,
          language: langResult.detectedLanguage,
          translationSource: translation.translationSource,
          source: result.source,
          sourceUrl: result.sourceUrl,
        });
      }
      const rawLine = match.rawLine || '';
      if (rawLine.length >= 10) {
        const langResult = detectLanguage(rawLine);
        const translation = await translateIfNeeded(rawLine, langResult.detectedLanguage);
        processedTexts.push({
          originalText: rawLine,
          translatedText: translation.translatedText,
          language: langResult.detectedLanguage,
          translationSource: translation.translationSource,
          source: result.source,
          sourceUrl: result.sourceUrl,
        });
      }
    }
  }

  // Process seed names (in case they're in Arabic or other scripts)
  for (const seed of seeds) {
    if (seed.name && seed.name.length >= 3) {
      const langResult = detectLanguage(seed.name);
      const translation = await translateIfNeeded(seed.name, langResult.detectedLanguage);
      processedTexts.push({
        originalText: seed.name,
        translatedText: translation.translatedText,
        language: langResult.detectedLanguage,
        translationSource: translation.translationSource,
        source: 'User-provided seed',
        sourceUrl: '',
      });
    }
  }

  // Process PDF text content
  for (const pdf of (pdfResults.results || [])) {
    if (!pdf.success || !pdf.text || pdf.text.length < 10) continue;

    // PDFs can be long — process in chunks to keep language detection accurate
    const chunkSize = 5000;
    for (let i = 0; i < pdf.text.length; i += chunkSize) {
      const chunk = pdf.text.slice(i, i + chunkSize);
      const langResult = detectLanguage(chunk);
      const translation = await translateIfNeeded(chunk, langResult.detectedLanguage);
      processedTexts.push({
        originalText: chunk,
        translatedText: translation.translatedText,
        language: langResult.detectedLanguage,
        translationSource: translation.translationSource,
        source: pdf.source,
        sourceUrl: pdf.sourceUrl,
      });
    }
  }

  return processedTexts;
}

/**
 * Convert sanctions results into evidence items.
 */
function buildEvidenceFromSanctions(sanctionsResult) {
  const evidence = [];
  for (const result of sanctionsResult.results) {
    if (result.found) {
      for (const match of result.matches) {
        evidence.push({
          sourceType: 'government',
          category: 'human-rights',
          severity: 'high',
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

// ===================================================================
// OUTPUT
// ===================================================================

function printSummary(assessment) {
  const flag = assessment.flag;
  const emoji = getFlagEmoji(flag.flag);

  console.log('\n');
  console.log('═'.repeat(60));
  console.log(`  KOPPLA ASSESSMENT: ${emoji} ${flag.flag}`);
  console.log('═'.repeat(60));
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

  // Seeds
  if (assessment.seeds && assessment.seeds.length > 0) {
    console.log('─'.repeat(60));
    console.log(`  Seeds provided: ${assessment.seeds.length}`);
    for (const s of assessment.seeds) {
      console.log(`    - ${s.name}${s.role ? ` (${s.role})` : ''} [${s.type}]`);
    }
  }

  // PDFs
  if (assessment.pdfSources && assessment.pdfSources.length > 0) {
    console.log(`  PDFs processed: ${assessment.pdfSources.filter((p) => p.success).length}/${assessment.pdfSources.length}`);
  }

  // Sanctions & scoring
  console.log('─'.repeat(60));
  console.log(`  Sanctions:      ${assessment.sanctions.sanctioned ? 'YES — found on list' : 'Not found'}`);
  console.log(`  Evidence items: ${assessment.scoring.totalItems}`);
  console.log(`  Overall score:  ${assessment.scoring.overallScore.toFixed(1)}`);

  // Analysis
  console.log('─'.repeat(60));
  const entities = assessment.entities?.summary || {};
  console.log(`  Entities:       ${entities.people || 0} people, ${entities.organizations || 0} organizations`);
  const graph = assessment.networkGraph?.graphMetadata || {};
  console.log(`  Network:        ${graph.totalNodes || 0} nodes, ${graph.totalEdges || 0} edges`);
  if (graph.edgeTypeBreakdown && Object.keys(graph.edgeTypeBreakdown).length > 0) {
    const breakdown = Object.entries(graph.edgeTypeBreakdown)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    console.log(`                  (${breakdown})`);
  }
  if (graph.hopDistribution) {
    const hops = Object.entries(graph.hopDistribution)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    console.log(`  Hop distances:  ${hops}`);
  }

  // Hypotheses
  console.log(`  Hypotheses:     ${(assessment.hypotheses || []).length} generated`);
  if (assessment.hypotheses && assessment.hypotheses.length > 0) {
    for (const hyp of assessment.hypotheses) {
      const confIcon = hyp.confidence === 'high' ? '!' : hyp.confidence === 'medium' ? '~' : '?';
      console.log(`    [${confIcon}] ${hyp.description}`);
      console.log(`        Confidence: ${hyp.confidence} (${Math.round((hyp.confidenceScore || 0) * 100)}%) | Type: ${hyp.type}`);
    }
  }

  // Threshold info — "what would change the flag"
  const threshold = assessment.thresholdInfo;
  if (threshold && threshold.whatWouldChange && threshold.whatWouldChange.length > 0) {
    console.log('─'.repeat(60));
    console.log('  What would change the flag:');
    for (const change of threshold.whatWouldChange) {
      console.log(`    > ${change}`);
    }
  }

  // Koppla suggests
  if (assessment.suggestions && assessment.suggestions.length > 0) {
    console.log('─'.repeat(60));
    console.log('  Koppla suggests:');
    for (const sug of assessment.suggestions) {
      const icon = sug.priority === 'high' ? '!' : sug.priority === 'medium' ? '~' : '?';
      console.log(`    [${icon}] ${sug.description}`);
      if (sug.actionable && sug.suggestedAction) {
        console.log(`        Action: ${sug.suggestedAction}`);
      }
    }
  }

  // Errors
  if (assessment.sanctions.errors.length > 0) {
    console.log('─'.repeat(60));
    console.log(`  Source errors:`);
    for (const err of assessment.sanctions.errors) {
      console.log(`    - ${err}`);
    }
  }

  // Footer
  console.log('─'.repeat(60));
  console.log(`  Sources checked: ${assessment.metadata.sourcesChecked.join(', ')}`);
  console.log(`  Analysis layers: ${assessment.metadata.analysisLayers.length} active`);
  console.log('═'.repeat(60));
}

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Koppla — Values Assessment Tool v3.0       ║
╚══════════════════════════════════════════════════╝

Usage:
  node src/index.js "Organization Name"                    Assess an organization
  node src/index.js "Org" --seed "Person Name, Role"       Add a known person as a lead
  node src/index.js "Org" --seed-org "Other Org Name"      Add a known related organization
  node src/index.js "Org" --pdf "/path/to/report.pdf"      Include a PDF report in analysis
  node src/index.js --list                                 List saved assessments
  node src/index.js --help                                 Show this help

Seeds:
  --seed "Name"              Add a person seed (name only)
  --seed "Name, Role"        Add a person seed with their role (CEO, director, etc.)
  --seed-org "Org Name"      Add an organization seed
  Multiple seeds: --seed "Person1, CEO" --seed "Person2"

PDFs:
  --pdf file.pdf             Include a PDF report for entity/connection analysis
  Multiple PDFs: --pdf report1.pdf --pdf report2.pdf

Examples:
  node src/index.js "Acme Corp"
  node src/index.js "Acme Corp" --seed "John Smith, CEO" --seed "Jane Doe"
  node src/index.js "Acme Corp" --pdf fatf-report.pdf --seed "Ahmed Al-Rashid"
`);
}

function getFlagEmoji(flag) {
  switch (flag) {
    case 'RED':    return '🔴';
    case 'YELLOW': return '🟡';
    case 'GREEN':  return '🟢';
    case 'GREY':   return '⚪';
    default:       return '❓';
  }
}
