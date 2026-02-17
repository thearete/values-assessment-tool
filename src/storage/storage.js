/**
 * Storage Module
 *
 * Handles saving and loading assessment results as JSON files.
 * Each assessment is saved as: {org-name}-{date}.json
 *
 * Files are stored in the data/assessments/ directory.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

// Resolve the assessments directory relative to the project root
const projectRoot = path.resolve(__dirname, '..', '..');
const assessmentsDir = path.join(projectRoot, config.storage.assessmentsDir);

/**
 * Make sure the assessments directory exists.
 * Creates it (and parent dirs) if it doesn't.
 */
function ensureDirectory() {
  if (!fs.existsSync(assessmentsDir)) {
    fs.mkdirSync(assessmentsDir, { recursive: true });
  }
}

/**
 * Generate a filename for an assessment.
 * Format: {org-name}-{YYYY-MM-DD}.json
 *
 * @param {string} orgName - Organization name
 * @returns {string} The filename (not full path)
 */
function generateFilename(orgName) {
  // Sanitize the org name for use in a filename
  const safeName = orgName
    .toLowerCase()
    .replace(/[^a-z0-9åäöéü\s-]/gi, '') // keep letters, numbers, Swedish chars, spaces, hyphens
    .replace(/\s+/g, '-')                 // spaces to hyphens
    .substring(0, 50);                     // limit length

  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${safeName}-${date}.json`;
}

/**
 * Save an assessment result to a JSON file.
 *
 * @param {Object} assessment - The full assessment object to save
 * @returns {string} The full path to the saved file
 */
function saveAssessment(assessment) {
  ensureDirectory();

  const filename = generateFilename(assessment.orgName);
  const filepath = path.join(assessmentsDir, filename);

  // Add metadata before saving
  const dataToSave = {
    ...assessment,
    savedAt: new Date().toISOString(),
    version: '1.0',
  };

  fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2), 'utf-8');
  return filepath;
}

/**
 * Load an assessment from a JSON file.
 *
 * @param {string} filename - The filename to load (not full path)
 * @returns {Object|null} The parsed assessment, or null if not found
 */
function loadAssessment(filename) {
  const filepath = path.join(assessmentsDir, filename);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  const data = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(data);
}

/**
 * List all saved assessments.
 *
 * @returns {Array} Array of { filename, orgName, date, flag } objects
 */
function listAssessments() {
  ensureDirectory();

  const files = fs.readdirSync(assessmentsDir).filter((f) => f.endsWith('.json'));

  return files.map((filename) => {
    try {
      const data = loadAssessment(filename);
      return {
        filename,
        orgName: data.orgName || 'Unknown',
        date: data.savedAt || 'Unknown',
        flag: data.flag?.flag || 'Unknown',
      };
    } catch {
      return {
        filename,
        orgName: 'Error reading file',
        date: 'Unknown',
        flag: 'Unknown',
      };
    }
  });
}

module.exports = {
  saveAssessment,
  loadAssessment,
  listAssessments,
  generateFilename,
};
