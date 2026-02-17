/**
 * Sanctions List Scraper
 *
 * Checks an organization against international sanctions lists:
 * - OFAC SDN List (US Treasury)
 * - UN Security Council Consolidated List
 * - EU Consolidated Sanctions List
 *
 * These are the most structured and reliable data sources we have.
 * Each list is available as a downloadable file (CSV or XML).
 *
 * Returns structured results indicating whether the org was found
 * on any sanctions list, along with source details.
 */

const cheerio = require('cheerio');
const config = require('../config');
const { fetchUrl, fuzzyMatch } = require('./baseScraper');

/**
 * Check the OFAC SDN list (CSV format).
 *
 * The CSV has columns like:
 *   SDN Name, SDN Type, Program, Title, Vessel Info, ...
 * We're interested in column 0 (name) and column 1 (type).
 * Type "-0-" means an individual, other values are entities/organizations.
 *
 * @param {string} orgName - Organization name to search for
 * @returns {Object} { found: boolean, matches: Array, source: string, error: string|null }
 */
async function checkOFAC(orgName) {
  console.log('  Checking OFAC SDN List...');

  const result = await fetchUrl(config.sanctions.ofacUrl);
  if (!result.success) {
    return {
      found: false,
      matches: [],
      source: 'OFAC SDN List',
      sourceUrl: config.sanctions.ofacUrl,
      error: result.error,
    };
  }

  const matches = [];

  // Parse CSV line by line
  const lines = result.data.split('\n');
  for (const line of lines) {
    // Simple CSV parsing — split by comma, but respect quoted fields
    const fields = parseCSVLine(line);
    if (fields.length < 2) continue;

    const name = fields[0];
    const type = fields[1];

    // Skip individuals (we only care about organizations/entities)
    // In OFAC data, "-0-" is the type code for individuals
    if (type === '-0-') continue;

    // Check if this entry matches our search
    if (fuzzyMatch(orgName, name)) {
      matches.push({
        name: name.trim(),
        type: type.trim(),
        program: fields[2] ? fields[2].trim() : 'Unknown',
      });
    }
  }

  return {
    found: matches.length > 0,
    matches,
    source: 'OFAC SDN List (US Treasury)',
    sourceUrl: config.sanctions.ofacUrl,
    error: null,
  };
}

/**
 * Check the UN Security Council Sanctions List (XML format).
 *
 * The XML contains <ENTITY> elements for organizations and
 * <INDIVIDUAL> elements for people. We search the entities.
 *
 * @param {string} orgName - Organization name to search for
 * @returns {Object} { found: boolean, matches: Array, source: string, error: string|null }
 */
async function checkUN(orgName) {
  console.log('  Checking UN Sanctions List...');

  const result = await fetchUrl(config.sanctions.unUrl);
  if (!result.success) {
    return {
      found: false,
      matches: [],
      source: 'UN Sanctions List',
      sourceUrl: config.sanctions.unUrl,
      error: result.error,
    };
  }

  const matches = [];

  // Parse the XML using cheerio
  const $ = cheerio.load(result.data, { xmlMode: true });

  // Look through ENTITY entries (organizations, not individuals)
  $('ENTITY').each((_, element) => {
    const firstName = $(element).find('FIRST_NAME').text() || '';
    const secondName = $(element).find('SECOND_NAME').text() || '';
    const fullName = `${firstName} ${secondName}`.trim();

    if (fullName && fuzzyMatch(orgName, fullName)) {
      matches.push({
        name: fullName,
        listType: $(element).find('UN_LIST_TYPE').text() || 'Unknown',
        referenceNumber: $(element).find('REFERENCE_NUMBER').text() || '',
      });
    }
  });

  return {
    found: matches.length > 0,
    matches,
    source: 'UN Security Council Consolidated List',
    sourceUrl: config.sanctions.unUrl,
    error: null,
  };
}

/**
 * Check the EU Consolidated Sanctions List (CSV format).
 *
 * @param {string} orgName - Organization name to search for
 * @returns {Object} { found: boolean, matches: Array, source: string, error: string|null }
 */
async function checkEU(orgName) {
  console.log('  Checking EU Sanctions List...');

  const result = await fetchUrl(config.sanctions.euUrl);
  if (!result.success) {
    return {
      found: false,
      matches: [],
      source: 'EU Sanctions List',
      sourceUrl: config.sanctions.euUrl,
      error: result.error,
    };
  }

  const matches = [];

  // Parse CSV line by line
  const lines = result.data.split('\n');

  // The EU list CSV typically has a header row. We look for name-like columns.
  // The format varies, so we search all fields for our org name.
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);

    // Check each field for a match
    for (const field of fields) {
      if (field && field.length > 2 && fuzzyMatch(orgName, field)) {
        matches.push({
          name: field.trim(),
          rawLine: lines[i].substring(0, 200), // first 200 chars for context
        });
        break; // only one match per line
      }
    }
  }

  return {
    found: matches.length > 0,
    matches,
    source: 'EU Consolidated Sanctions List',
    sourceUrl: config.sanctions.euUrl,
    error: null,
  };
}

/**
 * Run all sanctions checks for an organization.
 *
 * @param {string} orgName - Organization name to check
 * @returns {Object} Combined results from all sanctions lists
 */
async function checkAllSanctions(orgName) {
  console.log(`\nChecking sanctions lists for: "${orgName}"`);

  // Run all three checks (sequentially to respect rate limiting)
  const ofacResult = await checkOFAC(orgName);
  const unResult = await checkUN(orgName);
  const euResult = await checkEU(orgName);

  const results = [ofacResult, unResult, euResult];

  // Determine overall sanctions status
  const foundOnAnyList = results.some((r) => r.found);
  const errors = results.filter((r) => r.error).map((r) => `${r.source}: ${r.error}`);

  return {
    orgName,
    sanctioned: foundOnAnyList,
    results,
    totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
    errors,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Simple CSV line parser that handles quoted fields.
 * Splits a CSV line into an array of field values.
 *
 * @param {string} line - A single line from a CSV file
 * @returns {string[]} Array of field values
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim()); // push the last field

  return fields;
}

module.exports = {
  checkOFAC,
  checkUN,
  checkEU,
  checkAllSanctions,
};
