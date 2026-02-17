/**
 * Language Detector
 *
 * Detects the language of text content using the 'franc' library (offline).
 * This runs entirely locally with no API calls — fast and free.
 *
 * Used in the pipeline to determine if scraped text needs translation
 * before entity extraction can work on it.
 *
 * franc returns ISO 639-3 codes (3-letter): 'eng', 'swe', 'ara', etc.
 * It needs at least ~20 characters for reliable detection.
 */

const { franc } = require('franc');
const { isArabicText } = require('./arabicUtils');

// --- Language code to name mapping ---
// We only need the languages we care about; franc handles 400+ but we
// map the ones relevant to our use case.
const LANGUAGE_NAMES = {
  ara: 'Arabic',
  eng: 'English',
  swe: 'Swedish',
  fas: 'Persian (Farsi)',
  tur: 'Turkish',
  urd: 'Urdu',
  fra: 'French',
  deu: 'German',
  spa: 'Spanish',
  rus: 'Russian',
  zho: 'Chinese',
  hin: 'Hindi',
  por: 'Portuguese',
  jpn: 'Japanese',
  kor: 'Korean',
  und: 'Unknown',
};

// --- Script type detection ---
// Unicode ranges for different writing systems
const SCRIPT_RANGES = {
  arabic:   { start: 0x0600, end: 0x06FF },
  cyrillic: { start: 0x0400, end: 0x04FF },
  chinese:  { start: 0x4E00, end: 0x9FFF },
  japanese: { start: 0x3040, end: 0x30FF },  // hiragana + katakana
  korean:   { start: 0xAC00, end: 0xD7AF },
  thai:     { start: 0x0E00, end: 0x0E7F },
  hebrew:   { start: 0x0590, end: 0x05FF },
  devanagari: { start: 0x0900, end: 0x097F },
};

/**
 * Detect the script type of text by checking Unicode ranges.
 * Falls back to 'latin' if no special script is detected.
 *
 * @param {string} text - Text to analyze
 * @returns {string} Script type name
 */
function detectScript(text) {
  if (!text) return 'unknown';

  const charCounts = {};

  for (const char of text) {
    const code = char.charCodeAt(0);

    for (const [scriptName, range] of Object.entries(SCRIPT_RANGES)) {
      if (code >= range.start && code <= range.end) {
        charCounts[scriptName] = (charCounts[scriptName] || 0) + 1;
      }
    }
  }

  // Return the script with the most characters, or 'latin' if none detected
  const entries = Object.entries(charCounts);
  if (entries.length === 0) return 'latin';

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * Detect the language of a text string.
 *
 * Strategy:
 * 1. If text is very short (< 20 chars), use script detection as a heuristic
 * 2. Otherwise, use franc for reliable language identification
 * 3. As a final check, use our Arabic detection for Arabic script
 *
 * @param {string} text - Text to analyze
 * @returns {Object} Detection result
 *   { detectedLanguage, languageName, confidence, needsTranslation, scriptType }
 */
function detectLanguage(text) {
  if (!text || text.trim().length === 0) {
    return {
      detectedLanguage: 'und',
      languageName: 'Unknown',
      confidence: 0,
      needsTranslation: false,
      scriptType: 'unknown',
    };
  }

  const trimmed = text.trim();
  const scriptType = detectScript(trimmed);

  // --- Short text fallback ---
  // franc is unreliable with very short text, so use script heuristics
  if (trimmed.length < 20) {
    if (scriptType === 'arabic' || isArabicText(trimmed)) {
      return {
        detectedLanguage: 'ara',
        languageName: 'Arabic',
        confidence: 0.6,  // lower confidence for short text
        needsTranslation: true,
        scriptType: 'arabic',
      };
    }

    // For short Latin-script text, assume English (most common in our data sources)
    return {
      detectedLanguage: 'eng',
      languageName: 'English',
      confidence: 0.4,  // low confidence — just a guess
      needsTranslation: false,
      scriptType,
    };
  }

  // --- Use franc for reliable detection ---
  const detected = franc(trimmed);

  // franc returns 'und' (undetermined) if it can't figure it out
  if (detected === 'und') {
    // Try our Arabic detector as a fallback
    if (isArabicText(trimmed)) {
      return {
        detectedLanguage: 'ara',
        languageName: 'Arabic',
        confidence: 0.7,
        needsTranslation: true,
        scriptType: 'arabic',
      };
    }

    return {
      detectedLanguage: 'und',
      languageName: 'Unknown',
      confidence: 0,
      needsTranslation: false,
      scriptType,
    };
  }

  // --- Build result ---
  const languageName = LANGUAGE_NAMES[detected] || detected;

  // Languages that don't need translation (we can process them directly)
  const skipLanguages = ['eng', 'swe'];
  const needsTranslation = !skipLanguages.includes(detected);

  // Estimate confidence based on text length
  // Longer text → higher confidence in franc's detection
  let confidence;
  if (trimmed.length > 200) confidence = 0.95;
  else if (trimmed.length > 100) confidence = 0.85;
  else if (trimmed.length > 50) confidence = 0.75;
  else confidence = 0.6;

  return {
    detectedLanguage: detected,
    languageName,
    confidence,
    needsTranslation,
    scriptType,
  };
}

/**
 * Check if a language code is one we support well.
 * "Supported" means we have keywords, entity patterns, and translation for it.
 *
 * @param {string} langCode - ISO 639-3 language code
 * @returns {boolean}
 */
function isSupportedLanguage(langCode) {
  const supported = ['eng', 'swe', 'ara'];
  return supported.includes(langCode);
}

module.exports = {
  detectLanguage,
  detectScript,
  isSupportedLanguage,
  LANGUAGE_NAMES,
};
