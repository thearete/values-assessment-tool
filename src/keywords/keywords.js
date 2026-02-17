/**
 * Keyword Database for Organization Values Assessment
 *
 * Contains categorized keywords in Swedish and English used to identify
 * potential concerns about an organization's alignment with democratic values.
 *
 * Each keyword has:
 *   - term: the search term
 *   - language: "sv" (Swedish) or "en" (English)
 *   - category: which value area it relates to
 *   - severity: "high", "medium", or "low" — how strong an indicator it is
 */

// --- LGBTQ+ Rights ---
const lgbtqKeywords = [
  // Swedish
  { term: 'homofob', language: 'sv', category: 'lgbtq', severity: 'high' },
  { term: 'homofobi', language: 'sv', category: 'lgbtq', severity: 'high' },
  { term: 'transfob', language: 'sv', category: 'lgbtq', severity: 'high' },
  { term: 'transfobi', language: 'sv', category: 'lgbtq', severity: 'high' },
  { term: 'hbtq-kritisk', language: 'sv', category: 'lgbtq', severity: 'medium' },
  { term: 'hbtq-fientlig', language: 'sv', category: 'lgbtq', severity: 'high' },
  { term: 'anti-hbtq', language: 'sv', category: 'lgbtq', severity: 'high' },
  { term: 'mot homosexualitet', language: 'sv', category: 'lgbtq', severity: 'medium' },
  { term: 'konversionsterapi', language: 'sv', category: 'lgbtq', severity: 'high' },
  { term: 'homosexuell propaganda', language: 'sv', category: 'lgbtq', severity: 'high' },
  // English
  { term: 'homophobic', language: 'en', category: 'lgbtq', severity: 'high' },
  { term: 'homophobia', language: 'en', category: 'lgbtq', severity: 'high' },
  { term: 'transphobic', language: 'en', category: 'lgbtq', severity: 'high' },
  { term: 'transphobia', language: 'en', category: 'lgbtq', severity: 'high' },
  { term: 'anti-lgbtq', language: 'en', category: 'lgbtq', severity: 'high' },
  { term: 'anti-lgbt', language: 'en', category: 'lgbtq', severity: 'high' },
  { term: 'conversion therapy', language: 'en', category: 'lgbtq', severity: 'high' },
  { term: 'against homosexuality', language: 'en', category: 'lgbtq', severity: 'medium' },
  { term: 'gay propaganda', language: 'en', category: 'lgbtq', severity: 'high' },
];

// --- Gender Equality ---
const genderKeywords = [
  // Swedish
  { term: 'sexistisk', language: 'sv', category: 'gender', severity: 'high' },
  { term: 'sexism', language: 'sv', category: 'gender', severity: 'high' },
  { term: 'kvinnodiskriminering', language: 'sv', category: 'gender', severity: 'high' },
  { term: 'könsdiskriminering', language: 'sv', category: 'gender', severity: 'high' },
  { term: 'kvinnoförtryck', language: 'sv', category: 'gender', severity: 'high' },
  { term: 'lönediskriminering', language: 'sv', category: 'gender', severity: 'medium' },
  { term: 'trakasseri', language: 'sv', category: 'gender', severity: 'medium' },
  { term: 'sexuella trakasserier', language: 'sv', category: 'gender', severity: 'high' },
  { term: 'metoo', language: 'sv', category: 'gender', severity: 'medium' },
  // English
  { term: 'sexist', language: 'en', category: 'gender', severity: 'high' },
  { term: 'sexism', language: 'en', category: 'gender', severity: 'high' },
  { term: 'gender discrimination', language: 'en', category: 'gender', severity: 'high' },
  { term: 'sexual harassment', language: 'en', category: 'gender', severity: 'high' },
  { term: 'pay discrimination', language: 'en', category: 'gender', severity: 'medium' },
  { term: 'glass ceiling', language: 'en', category: 'gender', severity: 'low' },
  { term: 'misogynist', language: 'en', category: 'gender', severity: 'high' },
  { term: 'misogyny', language: 'en', category: 'gender', severity: 'high' },
];

// --- Racism & Xenophobia ---
const racismKeywords = [
  // Swedish
  { term: 'rasistisk', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'rasism', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'främlingsfientlig', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'främlingsfientlighet', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'etnisk diskriminering', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'hatbrott', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'vit makt', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'antisemitisk', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'antisemitism', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'islamofob', language: 'sv', category: 'racism', severity: 'high' },
  { term: 'islamofobi', language: 'sv', category: 'racism', severity: 'high' },
  // English
  { term: 'racist', language: 'en', category: 'racism', severity: 'high' },
  { term: 'racism', language: 'en', category: 'racism', severity: 'high' },
  { term: 'xenophobic', language: 'en', category: 'racism', severity: 'high' },
  { term: 'xenophobia', language: 'en', category: 'racism', severity: 'high' },
  { term: 'ethnic discrimination', language: 'en', category: 'racism', severity: 'high' },
  { term: 'hate crime', language: 'en', category: 'racism', severity: 'high' },
  { term: 'white supremacy', language: 'en', category: 'racism', severity: 'high' },
  { term: 'white supremacist', language: 'en', category: 'racism', severity: 'high' },
  { term: 'antisemitic', language: 'en', category: 'racism', severity: 'high' },
  { term: 'antisemitism', language: 'en', category: 'racism', severity: 'high' },
  { term: 'islamophobic', language: 'en', category: 'racism', severity: 'high' },
  { term: 'islamophobia', language: 'en', category: 'racism', severity: 'high' },
];

// --- Anti-Democratic ---
const antiDemocraticKeywords = [
  // Swedish
  { term: 'antidemokratisk', language: 'sv', category: 'anti-democratic', severity: 'high' },
  { term: 'auktoritär', language: 'sv', category: 'anti-democratic', severity: 'high' },
  { term: 'diktatur', language: 'sv', category: 'anti-democratic', severity: 'high' },
  { term: 'korruption', language: 'sv', category: 'anti-democratic', severity: 'medium' },
  { term: 'mutor', language: 'sv', category: 'anti-democratic', severity: 'high' },
  { term: 'valfusk', language: 'sv', category: 'anti-democratic', severity: 'high' },
  { term: 'pressfrihet', language: 'sv', category: 'anti-democratic', severity: 'medium' },
  { term: 'censur', language: 'sv', category: 'anti-democratic', severity: 'medium' },
  { term: 'extremism', language: 'sv', category: 'anti-democratic', severity: 'high' },
  { term: 'extremist', language: 'sv', category: 'anti-democratic', severity: 'high' },
  // English
  { term: 'anti-democratic', language: 'en', category: 'anti-democratic', severity: 'high' },
  { term: 'authoritarian', language: 'en', category: 'anti-democratic', severity: 'high' },
  { term: 'dictatorship', language: 'en', category: 'anti-democratic', severity: 'high' },
  { term: 'corruption', language: 'en', category: 'anti-democratic', severity: 'medium' },
  { term: 'bribery', language: 'en', category: 'anti-democratic', severity: 'high' },
  { term: 'election fraud', language: 'en', category: 'anti-democratic', severity: 'high' },
  { term: 'press freedom', language: 'en', category: 'anti-democratic', severity: 'medium' },
  { term: 'censorship', language: 'en', category: 'anti-democratic', severity: 'medium' },
  { term: 'extremism', language: 'en', category: 'anti-democratic', severity: 'high' },
  { term: 'extremist', language: 'en', category: 'anti-democratic', severity: 'high' },
];

// --- Human Rights Violations ---
const humanRightsKeywords = [
  // Swedish
  { term: 'mänskliga rättigheter brott', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'barnarbete', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'tvångsarbete', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'människohandel', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'tortyr', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'slavarbete', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'folkrättsbrott', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'krigsbrott', language: 'sv', category: 'human-rights', severity: 'high' },
  { term: 'religionsfrihet', language: 'sv', category: 'human-rights', severity: 'medium' },
  { term: 'yttrandefrihet', language: 'sv', category: 'human-rights', severity: 'medium' },
  // English
  { term: 'human rights violation', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'child labor', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'child labour', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'forced labor', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'forced labour', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'human trafficking', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'torture', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'slave labor', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'war crimes', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'genocide', language: 'en', category: 'human-rights', severity: 'high' },
  { term: 'freedom of religion', language: 'en', category: 'human-rights', severity: 'medium' },
  { term: 'freedom of speech', language: 'en', category: 'human-rights', severity: 'medium' },
];

// Combine all keywords into one master list
const ALL_KEYWORDS = [
  ...lgbtqKeywords,
  ...genderKeywords,
  ...racismKeywords,
  ...antiDemocraticKeywords,
  ...humanRightsKeywords,
];

/**
 * Get all keywords, optionally filtered by category and/or language.
 *
 * @param {Object} filters - Optional filters
 * @param {string} filters.category - Filter by category (e.g. "lgbtq", "gender")
 * @param {string} filters.language - Filter by language ("sv" or "en")
 * @param {string} filters.severity - Filter by severity ("high", "medium", "low")
 * @returns {Array} Matching keyword objects
 */
function getKeywords(filters = {}) {
  let results = ALL_KEYWORDS;

  if (filters.category) {
    results = results.filter((kw) => kw.category === filters.category);
  }
  if (filters.language) {
    results = results.filter((kw) => kw.language === filters.language);
  }
  if (filters.severity) {
    results = results.filter((kw) => kw.severity === filters.severity);
  }

  return results;
}

/**
 * Get just the search terms (strings) for a given category/language.
 * Useful when you just need the list of words to search for.
 */
function getSearchTerms(filters = {}) {
  return getKeywords(filters).map((kw) => kw.term);
}

/**
 * All available categories.
 */
const CATEGORIES = ['lgbtq', 'gender', 'racism', 'anti-democratic', 'human-rights'];

module.exports = {
  ALL_KEYWORDS,
  CATEGORIES,
  getKeywords,
  getSearchTerms,
  lgbtqKeywords,
  genderKeywords,
  racismKeywords,
  antiDemocraticKeywords,
  humanRightsKeywords,
};
