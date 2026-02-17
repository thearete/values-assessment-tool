/**
 * Base Scraper
 *
 * Provides shared functionality for all scrapers:
 * - HTTP requests with proper headers and timeouts
 * - Rate limiting (waits between requests to be respectful)
 * - Retry logic for failed requests
 * - Error handling
 *
 * Other scrapers extend or use this module instead of making raw HTTP calls.
 */

const axios = require('axios');
const config = require('../config');

/**
 * Sleep for a given number of milliseconds.
 * Used for rate limiting between requests.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an HTTP GET request with rate limiting, retries, and error handling.
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - Optional overrides
 * @param {number} options.timeout - Request timeout in ms
 * @param {string} options.responseType - Axios response type ('text', 'arraybuffer', etc.)
 * @param {Object} options.headers - Additional headers
 * @returns {Object} { success: boolean, data: string|null, error: string|null, url: string }
 */
async function fetchUrl(url, options = {}) {
  const maxRetries = config.scraping.maxRetries;
  const delay = config.scraping.delayBetweenRequests;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait before making request (rate limiting)
      if (attempt > 1) {
        console.log(`  Retry attempt ${attempt}/${maxRetries} for ${url}`);
      }
      await sleep(delay);

      const response = await axios.get(url, {
        timeout: options.timeout || config.scraping.requestTimeout,
        responseType: options.responseType || 'text',
        headers: {
          'User-Agent': config.scraping.userAgent,
          ...options.headers,
        },
      });

      return {
        success: true,
        data: response.data,
        statusCode: response.status,
        error: null,
        url,
      };
    } catch (error) {
      const errorMessage = error.response
        ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message;

      // If this was our last retry, return the error
      if (attempt === maxRetries) {
        return {
          success: false,
          data: null,
          statusCode: error.response?.status || null,
          error: errorMessage,
          url,
        };
      }

      // Otherwise, log and try again
      console.log(`  Request failed (${errorMessage}), retrying...`);
    }
  }
}

/**
 * Normalize an organization name for comparison.
 * Converts to lowercase, removes extra whitespace and common suffixes.
 *
 * @param {string} name - The organization name
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')           // collapse multiple spaces
    .replace(/[.,;:'"!?]/g, '')     // remove punctuation
    .replace(/\b(inc|ltd|llc|ab|corp|gmbh|ag|sa|plc)\b\.?/gi, '') // remove common suffixes
    .trim();
}

/**
 * Check if two organization names are a fuzzy match.
 * Returns true if one name contains the other, or if they share
 * enough words in common.
 *
 * @param {string} searchName - The name we're looking for
 * @param {string} candidateName - The name from the data source
 * @returns {boolean} Whether they match
 */
function fuzzyMatch(searchName, candidateName) {
  const a = normalizeName(searchName);
  const b = normalizeName(candidateName);

  // Skip if either name is too short after normalization (avoids false positives)
  if (a.length < 3 || b.length < 3) return false;

  // Exact match after normalization
  if (a === b) return true;

  // One contains the other (but only if the shorter one is meaningful — at least 4 chars)
  if (b.length >= 4 && a.includes(b)) return true;
  if (a.length >= 4 && b.includes(a)) return true;

  // Check word overlap — if 2+ significant words match, consider it a potential match
  const wordsA = a.split(' ').filter((w) => w.length > 2);
  const wordsB = b.split(' ').filter((w) => w.length > 2);
  const commonWords = wordsA.filter((word) => wordsB.includes(word));

  return commonWords.length >= 2;
}

module.exports = {
  fetchUrl,
  sleep,
  normalizeName,
  fuzzyMatch,
};
