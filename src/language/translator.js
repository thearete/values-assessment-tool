/**
 * Translator
 *
 * Translates non-English/non-Swedish text to English using the free
 * Google Translate endpoint (no API key required).
 *
 * This module is called when the language detector finds text that
 * needs translation before entity extraction can work on it.
 *
 * Key features:
 * - In-memory cache to avoid re-translating the same text
 * - Rate limiting between requests (respectful to Google)
 * - Graceful fallback if translation fails
 * - Splits long text at sentence boundaries
 */

const translate = require('google-translate-api-x');
const { sleep } = require('../scrapers/baseScraper');
const config = require('../config');

// --- In-memory translation cache ---
// Key: original text, Value: translation result
// This prevents translating the same text twice in one run.
const translationCache = new Map();

/**
 * Translate a text string to English.
 *
 * @param {string} text - Text to translate
 * @param {string} fromLang - Source language code (ISO 639-1, e.g., 'ar', 'sv')
 *                            If not provided, Google auto-detects
 * @returns {Object} Translation result
 */
async function translateText(text, fromLang = 'auto') {
  if (!text || text.trim().length === 0) {
    return {
      originalText: text,
      translatedText: text,
      fromLanguage: fromLang,
      toLanguage: 'en',
      translationSource: 'none',
      translatedAt: new Date().toISOString(),
      cached: false,
      error: null,
    };
  }

  // Check cache first
  const cacheKey = `${text}:${fromLang}`;
  if (translationCache.has(cacheKey)) {
    return { ...translationCache.get(cacheKey), cached: true };
  }

  const targetLang = config.translation?.targetLanguage || 'en';

  try {
    // If text is too long, split into chunks
    const maxLen = config.translation?.maxTextLength || 5000;
    if (text.length > maxLen) {
      return await translateLongText(text, fromLang, targetLang);
    }

    // Rate limiting — wait before making request
    const delay = config.translation?.delayBetweenTranslations || 1000;
    await sleep(delay);

    // Call Google Translate
    const result = await translate(text, {
      from: fromLang,
      to: targetLang,
    });

    const translationResult = {
      originalText: text,
      translatedText: result.text,
      fromLanguage: result.from?.language?.iso || fromLang,
      toLanguage: targetLang,
      translationSource: 'google-translate-free',
      translatedAt: new Date().toISOString(),
      cached: false,
      error: null,
    };

    // Cache the result
    translationCache.set(cacheKey, translationResult);

    return translationResult;
  } catch (error) {
    // Graceful fallback — return original text with error info
    console.log(`  Translation failed: ${error.message}`);
    return {
      originalText: text,
      translatedText: text, // fall back to original
      fromLanguage: fromLang,
      toLanguage: targetLang,
      translationSource: 'failed',
      translatedAt: new Date().toISOString(),
      cached: false,
      error: error.message,
    };
  }
}

/**
 * Handle long text by splitting at sentence boundaries and translating chunks.
 *
 * @param {string} text - Long text to translate
 * @param {string} fromLang - Source language
 * @param {string} targetLang - Target language
 * @returns {Object} Combined translation result
 */
async function translateLongText(text, fromLang, targetLang) {
  const maxLen = config.translation?.maxTextLength || 5000;

  // Split on sentence boundaries (period + space, or newline)
  const sentences = text.split(/(?<=[.!?。])\s+|\n+/);

  const chunks = [];
  let currentChunk = '';

  // Group sentences into chunks that fit within the max length
  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).length > maxLen && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Translate each chunk
  const translatedChunks = [];
  for (const chunk of chunks) {
    const result = await translateText(chunk, fromLang);
    translatedChunks.push(result.translatedText);
  }

  return {
    originalText: text,
    translatedText: translatedChunks.join(' '),
    fromLanguage: fromLang,
    toLanguage: targetLang,
    translationSource: 'google-translate-free',
    translatedAt: new Date().toISOString(),
    cached: false,
    error: null,
    chunks: chunks.length,
  };
}

/**
 * Convenience method: only translate if the detected language needs it.
 * Skips translation for English and Swedish text.
 *
 * @param {string} text - Text to potentially translate
 * @param {string} detectedLang - ISO 639-3 language code from language detector
 * @returns {Object} Translation result (or pass-through for EN/SV)
 */
async function translateIfNeeded(text, detectedLang) {
  const skipLanguages = config.translation?.skipLanguages || ['en', 'sv'];

  // Convert ISO 639-3 (franc) to ISO 639-1 (Google Translate)
  const langMap = {
    eng: 'en',
    swe: 'sv',
    ara: 'ar',
    fas: 'fa',
    tur: 'tr',
    urd: 'ur',
    fra: 'fr',
    deu: 'de',
    spa: 'es',
    rus: 'ru',
    zho: 'zh',
    hin: 'hi',
    por: 'pt',
  };

  const shortCode = langMap[detectedLang] || detectedLang;

  // Skip if it's a language we can process directly
  if (skipLanguages.includes(shortCode)) {
    return {
      originalText: text,
      translatedText: text,
      fromLanguage: shortCode,
      toLanguage: shortCode,
      translationSource: 'not-needed',
      translatedAt: new Date().toISOString(),
      cached: false,
      error: null,
    };
  }

  return await translateText(text, shortCode);
}

/**
 * Translate multiple texts in batch with rate limiting.
 *
 * @param {Array<{text: string, language: string}>} items - Texts to translate
 * @returns {Array<Object>} Array of translation results
 */
async function translateBatch(items) {
  const results = [];

  for (const item of items) {
    const result = await translateIfNeeded(item.text, item.language);
    results.push(result);
  }

  return results;
}

/**
 * Clear the translation cache.
 * Useful between assessment runs to free memory.
 */
function clearCache() {
  translationCache.clear();
}

module.exports = {
  translateText,
  translateIfNeeded,
  translateBatch,
  clearCache,
};
