/**
 * Configuration Constants
 *
 * Central place for all settings: API URLs, rate limits, scoring weights, etc.
 * If you need to tweak the tool's behavior, this is the file to edit.
 */

require('dotenv').config();

module.exports = {
  // --- Sanctions List URLs ---
  // These are the official download URLs for sanctions data.
  // They provide structured data (XML/CSV) that we can parse.
  sanctions: {
    // OFAC SDN (Specially Designated Nationals) list from US Treasury
    ofacUrl: 'https://www.treasury.gov/ofac/downloads/sdn.csv',

    // UN Security Council Consolidated Sanctions List (XML)
    unUrl: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',

    // EU Consolidated Sanctions List (CSV from EU open data)
    euUrl: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList/content?token=dG9rZW4tMjAxNw',
  },

  // --- Rate Limiting ---
  // Be respectful to servers: wait between requests
  scraping: {
    delayBetweenRequests: 2000, // milliseconds between HTTP requests
    maxRetries: 3,              // how many times to retry a failed request
    requestTimeout: 15000,      // max time to wait for a response (ms)
    userAgent: 'ValuesAssessmentTool/1.0 (Research Tool)',
  },

  // --- Source Credibility Weights ---
  // Higher weight = more credible source. Used when scoring evidence.
  // Based on the brief: government=10, courts=10, news=7, NGO=6, social=4, forums=2
  credibilityWeights: {
    government: 10,   // Official government agencies, sanctions lists
    court: 10,        // Court rulings and legal decisions
    news: 7,          // Established news outlets (DN, SVT, Reuters, etc.)
    ngo: 6,           // NGO reports (Amnesty, Human Rights Watch, etc.)
    social: 4,        // Social media (verified accounts)
    forum: 2,         // Forums (Flashback, Reddit, etc.)
    unknown: 1,       // Unclassified sources
  },

  // --- Flag Thresholds ---
  // Rules for assigning red/yellow/green/grey flags
  flags: {
    // Red flag triggers (any ONE of these is enough)
    red: {
      sanctionsMatch: true,          // Found on any sanctions list
      courtConviction: true,         // Has court conviction
      minCredibleSources: 3,         // 3+ credible sources reporting issues
      governmentRuling: true,        // Official government ruling against them
    },
    // Yellow flag triggers (need 2+ of these)
    yellow: {
      minIndicators: 2,              // Need at least 2 indicators
      // Each of these counts as one indicator:
      // - news article
      // - verified forum quote
      // - NGO report
      // - pending investigation
    },
  },

  // --- Storage ---
  storage: {
    assessmentsDir: 'data/assessments', // where to save assessment JSON files
  },

  // --- Translation Settings ---
  // Controls how non-English/non-Swedish text is handled
  translation: {
    targetLanguage: 'en',             // translate everything to English for analysis
    maxTextLength: 5000,              // max chars per translation request (Google limit)
    delayBetweenTranslations: 1000,   // ms between translation API calls
    skipLanguages: ['en', 'sv'],      // don't translate these (we can process them directly)
    minTextLengthForDetection: 20,    // franc needs at least this many chars for reliable detection
  },

  // --- Entity Extraction Settings ---
  // Controls how people/organizations are pulled from text
  entityExtraction: {
    minConfidence: 0.3,               // ignore entities below this confidence threshold
    maxEntitiesPerText: 50,           // safety limit — prevent runaway extraction
    deduplicationThreshold: 0.85,     // name similarity threshold for merging duplicates (0-1)
  },

  // --- Web Search Settings ---
  // DuckDuckGo HTML search for public information
  webSearch: {
    maxResultsPerQuery: 10,
    searchSuffixes: [
      'controversy',
      'sanctions',
      'investigation',
      'human rights violations',
      'extremism terrorism',
      'fraud corruption',
      'banned prohibited',
    ],
    delayBetweenSearches: 3000, // ms between DDG queries (be respectful)
  },

  // --- Cross-Referencing Settings ---
  // Controls how connections between entities are detected
  crossReferencing: {
    coMentionWindowChars: 200,        // characters to look within for co-mentions
    proximityWindowWords: 30,         // words to look within for proximity search
    minCoMentions: 2,                 // minimum co-mentions to create a relationship
    anomalyThresholdMultiplier: 3,    // flag if frequency is N times the average
  },
};
