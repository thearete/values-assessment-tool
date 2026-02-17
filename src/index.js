/**
 * Values Assessment Tool — Main Entry Point / CLI
 *
 * Usage:
 *   node src/index.js "Organization Name"
 *   node src/index.js --list              (list saved assessments)
 *
 * This is the main script that ties everything together:
 * 1. Takes an organization name as input
 * 2. Runs it through sanctions checks
 * 3. Scores and assigns a flag
 * 4. Saves the results to a JSON file
 * 5. Prints a readable summary
 */

const { checkAllSanctions } = require('./scrapers/sanctionsScraper');
const { scoreAllEvidence } = require('./scoring/credibility');
const { assignFlag } = require('./scoring/flagAssignment');
const { saveAssessment, listAssessments } = require('./storage/storage');
const { CATEGORIES } = require('./keywords/keywords');

// --- CLI Argument Parsing ---

const args = process.argv.slice(2); // remove "node" and script path

// Show help if no arguments
if (args.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Values Assessment Tool v1.0                ║
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
  // Re-run with no args to show help
  process.argv = process.argv.slice(0, 2);
  require('./index');
  process.exit(0);
}

// Main assessment flow
const orgName = args.join(' '); // allow "Acme Corp" without quotes
runAssessment(orgName);

/**
 * Main assessment function.
 * Orchestrates the full pipeline: check → score → flag → save → display.
 *
 * @param {string} orgName - The organization name to assess
 */
async function runAssessment(orgName) {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Values Assessment Tool v1.0                ║
╚══════════════════════════════════════════════════╝
`);
  console.log(`Assessing: "${orgName}"`);
  console.log('─'.repeat(50));

  // --- Step 1: Check sanctions lists ---
  console.log('\n📋 Step 1: Checking sanctions lists...');
  const sanctionsResult = await checkAllSanctions(orgName);

  // --- Step 2: Build evidence list ---
  // For now, evidence comes from sanctions checks only.
  // As we add more scrapers (news, forums, etc.), they'll feed into this list.
  console.log('\n📊 Step 2: Building evidence list...');
  const evidence = buildEvidenceFromSanctions(sanctionsResult);
  console.log(`  Found ${evidence.length} piece(s) of evidence`);

  // --- Step 3: Score evidence ---
  console.log('\n⚖️  Step 3: Scoring evidence...');
  const scoredResults = scoreAllEvidence(evidence);
  console.log(`  Overall score: ${scoredResults.overallScore.toFixed(1)}`);
  console.log(`  Credible sources: ${scoredResults.credibleSourceCount}`);

  // --- Step 4: Assign flag ---
  console.log('\n🚩 Step 4: Assigning flag...');
  const flag = assignFlag({ sanctionsResult, scoredResults });

  // --- Step 5: Compile and save assessment ---
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
    metadata: {
      version: '1.0',
      sourcesChecked: ['OFAC SDN List', 'UN Sanctions List', 'EU Sanctions List'],
      sourcesNotYetImplemented: ['News', 'Forums', 'Social Media', 'NGO Reports'],
    },
  };

  console.log('\n💾 Step 5: Saving assessment...');
  const savedPath = saveAssessment(assessment);
  console.log(`  Saved to: ${savedPath}`);

  // --- Step 6: Print summary ---
  printSummary(assessment);
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
  console.log('═'.repeat(50));
  console.log(`  ASSESSMENT RESULT: ${emoji} ${flag.flag}`);
  console.log('═'.repeat(50));
  console.log(`  Organization: ${assessment.orgName}`);
  console.log(`  Date:         ${assessment.assessedAt}`);
  console.log(`  Flag:         ${emoji} ${flag.flag}`);
  console.log(`  Reason:       ${flag.reason}`);

  if (flag.details.length > 0) {
    console.log(`  Details:`);
    for (const detail of flag.details) {
      console.log(`    • ${detail}`);
    }
  }

  console.log('─'.repeat(50));
  console.log(`  Sanctions:      ${assessment.sanctions.sanctioned ? 'YES — found on list' : 'Not found'}`);
  console.log(`  Evidence items: ${assessment.scoring.totalItems}`);
  console.log(`  Overall score:  ${assessment.scoring.overallScore.toFixed(1)}`);

  if (assessment.sanctions.errors.length > 0) {
    console.log(`\n  ⚠️  Some sources had errors:`);
    for (const err of assessment.sanctions.errors) {
      console.log(`    • ${err}`);
    }
  }

  console.log(`\n  Sources checked: ${assessment.metadata.sourcesChecked.join(', ')}`);
  console.log(`  Not yet available: ${assessment.metadata.sourcesNotYetImplemented.join(', ')}`);
  console.log('═'.repeat(50));
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
