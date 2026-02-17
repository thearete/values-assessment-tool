/**
 * Web Search Scraper
 *
 * Searches DuckDuckGo for public information about an organization.
 * Parses HTML results, classifies source URLs, matches snippets against
 * the keyword database, and produces evidence items for the scoring pipeline.
 *
 * No API key required — uses DuckDuckGo's HTML endpoint.
 */

const cheerio = require('cheerio');
const { fetchUrl, sleep } = require('./baseScraper');
const config = require('../config');
const { ALL_KEYWORDS } = require('../keywords/keywords');

// Web-search-specific concern terms (supplement the keyword database).
// Only strong-signal multi-word phrases or unambiguous terms.
// Deliberately excludes broad single words like "banned", "suspended",
// "allegations", "controversy" which produce too many false positives
// (e.g., "Volvo banned 3000 chemicals" = a positive action, not a concern).
const WEB_CONCERN_TERMS = [
  { term: 'sanctioned', category: 'human-rights', severity: 'high' },
  { term: 'blacklisted', category: 'human-rights', severity: 'high' },
  { term: 'indicted', category: 'human-rights', severity: 'high' },
  { term: 'convicted', category: 'human-rights', severity: 'high' },
  { term: 'terrorism', category: 'anti-democratic', severity: 'high' },
  { term: 'terrorist', category: 'anti-democratic', severity: 'high' },
  { term: 'money laundering', category: 'anti-democratic', severity: 'high' },
  { term: 'fundamentalist', category: 'anti-democratic', severity: 'high' },
  { term: 'radicalization', category: 'anti-democratic', severity: 'high' },
  { term: 'militant', category: 'anti-democratic', severity: 'high' },
  { term: 'cut ties', category: 'human-rights', severity: 'high' },
  { term: 'defunded', category: 'human-rights', severity: 'high' },
  { term: 'revoked', category: 'human-rights', severity: 'high' },
  { term: 'designated terrorist', category: 'anti-democratic', severity: 'high' },
  { term: 'terror financing', category: 'anti-democratic', severity: 'high' },
  { term: 'war crime', category: 'human-rights', severity: 'high' },
];

// URL domain → sourceType classification
const SOURCE_CLASSIFICATIONS = {
  government: [
    '.gov', 'government', 'treasury.gov', 'state.gov', 'justice.gov',
    'fbi.gov', 'congress.gov', 'europa.eu', 'parliament', 'riksdag.se',
    'regeringen.se', 'ofac',
  ],
  news: [
    'reuters.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'washingtonpost.com',
    'theguardian.com', 'dn.se', 'svt.se', 'svd.se', 'aftonbladet.se',
    'expressen.se', 'cnn.com', 'aljazeera.com', 'france24.com', 'dw.com',
    'apnews.com', 'npr.org', 'politico.com', 'ft.com', 'bloomberg.com',
    'nbcnews.com', 'cbsnews.com', 'abcnews.com', 'foxnews.com',
    'news.sky.com', 'independent.co.uk', 'telegraph.co.uk',
    'times', 'post', 'herald', 'tribune', 'gazette',
  ],
  ngo: [
    'amnesty.org', 'hrw.org', 'humanrights', 'transparency.org',
    'icrc.org', 'redcross', 'msf.org', 'oxfam.org', 'freedomhouse.org',
    'rsf.org', 'reporterswithoutborders',
  ],
  social: [
    'twitter.com', 'x.com', 'facebook.com', 'linkedin.com',
    'instagram.com', 'youtube.com', 'tiktok.com',
  ],
  forum: [
    'reddit.com', 'flashback.org', 'quora.com', 'stackexchange.com',
  ],
};

// Search suffixes combined with org name
const DEFAULT_SEARCH_SUFFIXES = [
  'controversy',
  'sanctions',
  'investigation',
  'human rights violations',
  'extremism terrorism',
  'fraud corruption',
  'banned prohibited',
];

/**
 * Search DuckDuckGo HTML for a query string.
 *
 * @param {string} query - The search query
 * @param {number} maxResults - Max results to extract (default 10)
 * @returns {Object} { results: [{ title, url, snippet }], query, error }
 */
async function searchDuckDuckGo(query, maxResults = 10) {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  const result = await fetchUrl(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!result.success) {
    return { results: [], query, error: result.error };
  }

  const $ = cheerio.load(result.data);
  const results = [];

  $('.result__body').each((i, el) => {
    if (results.length >= maxResults) return false;

    const title = $(el).find('.result__a').text().trim();
    const href = $(el).find('.result__a').attr('href');
    const snippet = $(el).find('.result__snippet').text().trim();

    const actualUrl = extractActualUrl(href);

    if (title && actualUrl) {
      results.push({ title, url: actualUrl, snippet, searchQuery: query });
    }
  });

  return { results, query, error: null };
}

/**
 * Extract the actual URL from DuckDuckGo's redirect wrapper.
 * DDG format: //duckduckgo.com/l/?uddg=ENCODED_URL&...
 */
function extractActualUrl(ddgUrl) {
  if (!ddgUrl) return null;
  try {
    if (ddgUrl.includes('uddg=')) {
      const match = ddgUrl.match(/uddg=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    // Some results have direct URLs
    if (ddgUrl.startsWith('http')) return ddgUrl;
    if (ddgUrl.startsWith('//')) return 'https:' + ddgUrl;
    return null;
  } catch {
    return ddgUrl;
  }
}

/**
 * Run multiple targeted searches for an organization.
 *
 * @param {string} orgName - Organization name
 * @returns {Object} { allResults, searchesPerformed, totalResults, errors }
 */
async function searchForOrganization(orgName) {
  const suffixes = config.webSearch?.searchSuffixes || DEFAULT_SEARCH_SUFFIXES;
  const delay = config.webSearch?.delayBetweenSearches || 3000;
  const allResults = [];
  const errors = [];
  let searchesPerformed = 0;

  for (const suffix of suffixes) {
    const query = `${orgName} ${suffix}`;
    console.log(`    Searching: "${query}"`);

    const result = await searchDuckDuckGo(query);
    searchesPerformed++;

    if (result.error) {
      errors.push(`Search "${query}": ${result.error}`);
    } else {
      allResults.push(...result.results);
    }

    // Rate limit between searches
    if (searchesPerformed < suffixes.length) {
      await sleep(delay);
    }
  }

  // Deduplicate by normalized URL
  const seen = new Set();
  const deduplicated = allResults.filter((r) => {
    const norm = normalizeUrl(r.url);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });

  console.log(`    ${deduplicated.length} unique results from ${searchesPerformed} searches`);

  return {
    allResults: deduplicated,
    searchesPerformed,
    totalResults: deduplicated.length,
    errors,
  };
}

/**
 * Normalize a URL for deduplication.
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '');
    u.hostname = u.hostname.replace(/^www\./, '');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Classify a URL to determine the evidence source type.
 *
 * @param {string} url - The URL to classify
 * @returns {string} One of: government, news, ngo, social, forum, unknown
 */
function classifySourceUrl(url) {
  if (!url) return 'unknown';
  const lower = url.toLowerCase();
  for (const [sourceType, patterns] of Object.entries(SOURCE_CLASSIFICATIONS)) {
    if (patterns.some((p) => lower.includes(p))) {
      return sourceType;
    }
  }
  return 'unknown';
}

/**
 * Analyze a text snippet for concerning keywords.
 * Checks both the main keyword database and web-specific concern terms.
 *
 * @param {string} text - The snippet to analyze
 * @returns {Array<{ term, category, severity }>} Matched keywords
 */
function analyzeSnippetForKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matches = [];
  const seen = new Set();

  // Check main keyword database
  for (const kw of ALL_KEYWORDS) {
    if (!seen.has(kw.term) && lower.includes(kw.term)) {
      matches.push({ term: kw.term, category: kw.category, severity: kw.severity });
      seen.add(kw.term);
    }
  }

  // Check web-specific concern terms
  for (const kw of WEB_CONCERN_TERMS) {
    if (!seen.has(kw.term) && lower.includes(kw.term)) {
      matches.push({ term: kw.term, category: kw.category, severity: kw.severity });
      seen.add(kw.term);
    }
  }

  return matches;
}

/**
 * Convert raw search results into evidence items for the scoring pipeline.
 * Only includes results that contain concerning keywords.
 *
 * IMPORTANT: Web search evidence never uses sourceType 'government' or 'court' —
 * those are reserved for direct sanctions list matches and court records.
 * Government website results from web search are classified as 'news' since
 * they are unverified leads, not confirmed rulings.
 *
 * @param {Array} searchResults - From searchDuckDuckGo/searchForOrganization
 * @param {string} orgName - Organization name for context
 * @returns {Array<Object>} Evidence items
 */
function buildEvidenceFromSearchResults(searchResults, orgName) {
  const evidence = [];
  const seenUrls = new Set();

  for (const result of searchResults) {
    // Deduplicate by URL
    const normUrl = normalizeUrl(result.url);
    if (seenUrls.has(normUrl)) continue;
    seenUrls.add(normUrl);

    let sourceType = classifySourceUrl(result.url);
    const combinedText = `${result.title} ${result.snippet}`;

    // The result must actually mention the organization to be relevant.
    // Check that the org name (or a significant portion) appears in the title or snippet.
    if (!isResultRelevant(combinedText, orgName)) continue;

    const keywordMatches = analyzeSnippetForKeywords(combinedText);

    // Only create evidence if snippet contains concerning keywords
    if (keywordMatches.length === 0) continue;

    // Web search results are unverified leads — cap sourceType.
    // 'government' and 'court' are reserved for direct sanctions/court matches.
    if (sourceType === 'government' || sourceType === 'court') {
      sourceType = 'news';
    }

    // Pick the highest-severity keyword match for the primary category
    const sorted = [...keywordMatches].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.severity] || 2) - (order[b.severity] || 2);
    });
    const primary = sorted[0];
    const category = primary?.category || 'human-rights';
    const severity = primary?.severity || 'medium';

    const snippet = result.snippet.length > 200
      ? result.snippet.substring(0, 200) + '...'
      : result.snippet;

    evidence.push({
      sourceType,
      category,
      severity,
      description: `${result.title} — ${snippet}`,
      source: `Web search (${sourceType})`,
      sourceUrl: result.url,
      status: 'unverified',
      matchedKeywords: keywordMatches.map((k) => k.term),
      searchQuery: result.searchQuery || '',
    });
  }

  return evidence;
}

/**
 * Check if a search result is actually about the target organization.
 * Prevents false positives from unrelated articles that happen to appear
 * in search results (e.g., "Volcano Group" when searching for "Volvo Group").
 *
 * @param {string} text - Combined title + snippet text
 * @param {string} orgName - The organization we're searching for
 * @returns {boolean} Whether the result is relevant
 */
function isResultRelevant(text, orgName) {
  const lowerText = text.toLowerCase();
  const lowerOrg = orgName.toLowerCase();

  // Direct match: full org name appears in the text
  if (lowerText.includes(lowerOrg)) return true;

  // Partial match: for multi-word org names, check if each significant word appears
  const orgWords = lowerOrg.split(/\s+/).filter((w) => w.length > 2);
  if (orgWords.length >= 2) {
    const allWordsPresent = orgWords.every((word) => lowerText.includes(word));
    if (allWordsPresent) return true;
  }

  return false;
}

module.exports = {
  searchDuckDuckGo,
  searchForOrganization,
  classifySourceUrl,
  analyzeSnippetForKeywords,
  buildEvidenceFromSearchResults,
};
