/**
 * Entity Patterns
 *
 * Regex patterns for extracting people, organizations, and roles from text.
 * Organized by language: English, Swedish, and Arabic (transliterated).
 *
 * These supplement the NLP-based extraction (compromise library).
 * Regex catches names and patterns that NLP might miss, especially
 * in Swedish text and transliterated Arabic names.
 *
 * Pattern naming: each pattern has a 'name' field for debugging,
 * so you can see which pattern matched.
 */

// ===================================================================
// PERSON NAME PATTERNS
// ===================================================================

const PERSON_PATTERNS = [
  // --- English names ---
  // Standard Western name: "John Smith", "Mary Jane Watson"
  {
    name: 'en-standard-name',
    pattern: /\b([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15}){1,3})\b/g,
    language: 'en',
    type: 'person',
  },

  // --- Swedish names ---
  // Handles Swedish characters: "Göran Persson", "Björk Guðmundsdóttir"
  {
    name: 'sv-standard-name',
    pattern: /\b([A-ZÅÄÖÉÜ][a-zåäöéü]{1,15}(?:\s+[A-ZÅÄÖÉÜ][a-zåäöéü]{1,15}){1,3})\b/g,
    language: 'sv',
    type: 'person',
  },

  // Swedish names with "von", "af": "Carl von Linné", "Gustaf af Ugglas"
  {
    name: 'sv-noble-name',
    pattern: /\b([A-ZÅÄÖ][a-zåäö]+\s+(?:von|af|de)\s+[A-ZÅÄÖ][a-zåäö]+)\b/g,
    language: 'sv',
    type: 'person',
  },

  // --- Arabic transliterated names ---
  // Names with "Al-" prefix: "Ahmed Al-Rashid", "Omar Al-Bashir"
  {
    name: 'ar-al-prefix',
    pattern: /\b([A-Z][a-z]+\s+(?:Al|al|El|el)-[A-Z][a-z]+(?:\s+(?:Al|al|El|el)-[A-Z][a-z]+)?)\b/g,
    language: 'ar',
    type: 'person',
  },

  // Names with "Abu", "Ibn", "Bin", "Bint": "Abu Bakr", "Ibn Saud"
  {
    name: 'ar-patronymic',
    pattern: /\b((?:Abu|Ibn|Bin|Bint)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
    language: 'ar',
    type: 'person',
  },

  // Names with "Abdul", "Abdel", "Abd": "Abdul Rahman Al-Saud"
  {
    name: 'ar-abd-prefix',
    pattern: /\b((?:Abdul?|Abdel|Abd)\s+[A-Z][a-z]+(?:\s+(?:Al|al|El|el)-?[A-Z][a-z]+){0,2})\b/g,
    language: 'ar',
    type: 'person',
  },

  // General Arabic transliterated: "Mohammed Hassan", "Fatima Zahra"
  {
    name: 'ar-general',
    pattern: /\b((?:Mohammed|Muhammad|Mohamed|Ahmad|Ahmed|Ali|Omar|Hassan|Hussein|Khalid|Ibrahim|Youssef|Mustafa|Fatima|Aisha|Maryam|Nour|Layla|Zainab|Khadija)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g,
    language: 'ar',
    type: 'person',
  },
];

// ===================================================================
// ROLE / TITLE PATTERNS
// ===================================================================

const ROLE_PATTERNS = [
  // --- English roles ---
  // "CEO of", "chairman of", "founder of"
  {
    name: 'en-role-of',
    pattern: /\b(CEO|CFO|COO|CTO|CMO|chairman|chairwoman|chairperson|president|vice[- ]president|director|managing\s+director|founder|co-founder|board\s+member|secretary[- ]general|treasurer|executive\s+director|general\s+manager|chief\s+executive)\s+(?:of\s+)?/gi,
    language: 'en',
    type: 'role',
  },

  // "X, the CEO of Y" or "X, CEO of Y"
  {
    name: 'en-comma-role',
    pattern: /,\s*(?:the\s+)?(CEO|CFO|COO|CTO|chairman|chairwoman|president|director|founder|co-founder|board\s+member|secretary[- ]general)\s+(?:of|at)\s+/gi,
    language: 'en',
    type: 'role',
  },

  // "X serves as CEO" or "X appointed as director"
  {
    name: 'en-serves-as',
    pattern: /(?:serves?|appointed|named|acts?)\s+as\s+(CEO|CFO|COO|CTO|chairman|chairwoman|president|director|founder|board\s+member|secretary[- ]general)/gi,
    language: 'en',
    type: 'role',
  },

  // --- Swedish roles ---
  // "VD för", "ordförande för", "grundare av"
  {
    name: 'sv-role-for',
    pattern: /\b(VD|verkställande\s+direktör|ordförande|vice\s+ordförande|styrelseledamot|grundare|medgrundare|generalsekreterare|kassör|direktör|chef)\s+(?:för|i|av|på)\s+/gi,
    language: 'sv',
    type: 'role',
  },

  // "X är VD för Y" (X is CEO of Y)
  {
    name: 'sv-is-role',
    pattern: /\bär\s+(VD|ordförande|styrelseledamot|grundare|direktör|chef)\s+(?:för|i|av|på)\s+/gi,
    language: 'sv',
    type: 'role',
  },
];

// ===================================================================
// ORGANIZATION NAME PATTERNS
// ===================================================================

const ORG_PATTERNS = [
  // --- Organizations by suffix ---
  // "Acme Inc", "Swedish Red Cross AB", "Deutsche Bank AG"
  {
    name: 'org-suffix',
    pattern: /\b([A-ZÅÄÖa-zåäö][A-ZÅÄÖa-zåäö\s&'-]{1,50})\s+(Inc\.?|Ltd\.?|LLC|AB|Corp\.?|GmbH|AG|SA|PLC|Pty|Co\.?|Foundation|Stiftelse|Förening|Organisation|Organization|Group|Holdings)\b/gi,
    language: 'all',
    type: 'organization',
  },

  // --- Organizations by prefix ---
  // "The Red Cross", "The World Bank"
  {
    name: 'org-the-prefix',
    pattern: /\b(The\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\s+(?:Foundation|Organization|Organisation|Institute|Association|Committee|Council|Authority|Agency|Commission)\b/g,
    language: 'en',
    type: 'organization',
  },

  // Swedish organizations: "Riksbanken", "Försäkringskassan"
  {
    name: 'sv-org-suffix',
    pattern: /\b([A-ZÅÄÖ][a-zåäö]+(?:banken|kassan|verket|myndigheten|styrelsen|nämnden|rådet|institutet|museet|bolaget))\b/g,
    language: 'sv',
    type: 'organization',
  },
];

// ===================================================================
// FINANCIAL KEYWORDS (for relationship typing)
// ===================================================================

const FINANCIAL_KEYWORDS = [
  // English
  'funding', 'funded', 'investment', 'investor', 'transaction', 'transfer',
  'payment', 'donation', 'donated', 'financial', 'money laundering',
  'bank account', 'wire transfer', 'offshore', 'shell company',
  // Swedish
  'finansiering', 'investering', 'transaktion', 'överföring',
  'betalning', 'donation', 'penningtvätt', 'bankkonto',
  'skalbolag',
];

// ===================================================================
// EXTRACTION FUNCTION
// ===================================================================

/**
 * Apply regex patterns to text and extract matching entities.
 *
 * @param {string} text - Text to scan
 * @param {string} language - Language hint ('en', 'sv', 'ar', or 'all')
 * @returns {Object} { people: Array, organizations: Array, roles: Array }
 */
function extractWithPatterns(text, language = 'all') {
  const people = [];
  const organizations = [];
  const roles = [];

  // --- Extract people ---
  for (const pattern of PERSON_PATTERNS) {
    // Apply pattern if it matches the language or is universal
    if (language !== 'all' && pattern.language !== language && pattern.language !== 'all') {
      continue;
    }

    // Reset regex lastIndex (important for /g patterns)
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length >= 3 && !isCommonWord(name)) {
        people.push({
          name,
          matchedBy: pattern.name,
          language: pattern.language,
          index: match.index,
        });
      }
    }
  }

  // --- Extract organizations ---
  for (const pattern of ORG_PATTERNS) {
    if (language !== 'all' && pattern.language !== language && pattern.language !== 'all') {
      continue;
    }
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(text)) !== null) {
      const name = (match[1]?.trim() + ' ' + (match[2] || '')).trim();
      if (name && name.length >= 3) {
        organizations.push({
          name,
          matchedBy: pattern.name,
          language: pattern.language,
          index: match.index,
        });
      }
    }
  }

  // --- Extract roles ---
  for (const pattern of ROLE_PATTERNS) {
    if (language !== 'all' && pattern.language !== language && pattern.language !== 'all') {
      continue;
    }
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(text)) !== null) {
      const role = match[1]?.trim();
      if (role) {
        roles.push({
          role,
          matchedBy: pattern.name,
          language: pattern.language,
          index: match.index,
        });
      }
    }
  }

  return { people, organizations, roles };
}

/**
 * Check if a "name" is actually a common English word (false positive filter).
 * These words happen to match capitalized-word patterns but aren't names.
 */
function isCommonWord(text) {
  const commonWords = new Set([
    'The', 'This', 'That', 'These', 'Those', 'They', 'There', 'Their',
    'What', 'When', 'Where', 'Which', 'While', 'With', 'Will', 'Would',
    'Could', 'Should', 'Have', 'Has', 'Had', 'Been', 'Being',
    'From', 'Into', 'About', 'After', 'Before', 'Between',
    'Under', 'Over', 'Also', 'Very', 'Just', 'More', 'Most',
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'However', 'Although', 'Therefore', 'Furthermore', 'Meanwhile',
    'According', 'Several', 'During', 'Another', 'Other',
    'Section', 'Article', 'Chapter', 'Report', 'Source',
    'Not Found', 'No Results',
  ]);

  return commonWords.has(text) || commonWords.has(text.split(' ')[0]);
}

/**
 * Check if text contains financial keywords.
 * Used by the cross-referencer to type relationships.
 *
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function containsFinancialKeywords(text) {
  const lower = text.toLowerCase();
  return FINANCIAL_KEYWORDS.some((kw) => lower.includes(kw));
}

module.exports = {
  PERSON_PATTERNS,
  ROLE_PATTERNS,
  ORG_PATTERNS,
  FINANCIAL_KEYWORDS,
  extractWithPatterns,
  containsFinancialKeywords,
  isCommonWord,
};
