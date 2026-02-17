/**
 * API Client — All HTTP communication with the Koppla backend server.
 * No other module should use fetch() directly.
 */

const API = {
  baseUrl: 'http://localhost:3777',

  /**
   * Check if the server is running.
   * @returns {Object} { status, version } or { error, message }
   */
  async checkHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`);
      return await res.json();
    } catch {
      return { error: true, message: 'Server not reachable' };
    }
  },

  /**
   * Run a new assessment.
   * @param {string} orgName - Organization name
   * @param {Array} seeds - Array of { name, type, role }
   * @returns {Object} Full assessment JSON or { error, message }
   */
  async runAssessment(orgName, seeds = []) {
    try {
      const res = await fetch(`${this.baseUrl}/api/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, seeds }),
      });
      return await res.json();
    } catch {
      return { error: true, message: 'Server not reachable. Is the Koppla server running?' };
    }
  },

  /**
   * List all saved assessments.
   * @returns {Array} Array of { filename, orgName, date, flag }
   */
  async listAssessments() {
    try {
      const res = await fetch(`${this.baseUrl}/api/assessments`);
      return await res.json();
    } catch {
      return { error: true, message: 'Server not reachable' };
    }
  },

  /**
   * Load a specific saved assessment.
   * @param {string} filename - The assessment filename
   * @returns {Object} Full assessment JSON or { error, message }
   */
  async loadAssessment(filename) {
    try {
      const res = await fetch(`${this.baseUrl}/api/assessments/${encodeURIComponent(filename)}`);
      return await res.json();
    } catch {
      return { error: true, message: 'Server not reachable' };
    }
  },

  /**
   * Update the base URL (from settings).
   */
  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, '');
  },
};
