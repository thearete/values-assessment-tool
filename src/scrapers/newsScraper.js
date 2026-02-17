/**
 * News Scraper
 *
 * Searches for news articles about an organization using DuckDuckGo web search,
 * filtered for results from known news source URLs.
 *
 * Powered by the web search scraper module.
 */

const { searchForOrganization, classifySourceUrl, analyzeSnippetForKeywords } = require('./webSearchScraper');

/**
 * Search news sources for mentions of an organization.
 *
 * @param {string} orgName - Organization name to search for
 * @returns {Object} { orgName, articles, source, totalSearchResults, error, checkedAt }
 */
async function searchNews(orgName) {
  console.log(`  Searching news for "${orgName}"...`);

  const searchResult = await searchForOrganization(orgName);

  // Filter for news-classified results
  const newsResults = searchResult.allResults.filter(
    (r) => classifySourceUrl(r.url) === 'news'
  );

  const articles = newsResults.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    keywords: analyzeSnippetForKeywords(`${r.title} ${r.snippet}`),
  }));

  console.log(`  Found ${articles.length} news article(s) from ${searchResult.searchesPerformed} searches`);

  return {
    orgName,
    articles,
    source: 'DuckDuckGo News Search',
    totalSearchResults: searchResult.totalResults,
    error: searchResult.errors.length > 0 ? searchResult.errors.join('; ') : null,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  searchNews,
};
