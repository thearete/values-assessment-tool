/**
 * News Scraper (Placeholder)
 *
 * This module will eventually scrape news sites for organization mentions.
 * For now it returns empty results — the sanctions scraper is our first
 * working data source.
 *
 * Future sources:
 * - DN.se (Dagens Nyheter)
 * - SVT.se (Swedish public TV)
 * - Reuters
 * - BBC
 */

/**
 * Search news sources for mentions of an organization.
 * Currently a placeholder that returns no results.
 *
 * @param {string} orgName - Organization name to search for
 * @returns {Object} Search results (empty for now)
 */
async function searchNews(orgName) {
  console.log(`  News scraper not yet implemented — skipping for "${orgName}"`);

  return {
    orgName,
    articles: [],
    source: 'News (not yet implemented)',
    error: null,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  searchNews,
};
