/**
 * Arabic Utilities
 *
 * Handles Arabic-specific text processing:
 * - Script detection (is this Arabic text?)
 * - Normalization (remove diacritics, standardize letter forms)
 * - Name transliteration (Arabic script → Latin letters)
 * - Common Arabic name database for cross-referencing
 *
 * Arabic text has complexities that other scripts don't:
 * - Diacritical marks (tashkeel) that change pronunciation but not identity
 * - Multiple forms of the same letter (alef has 4+ variants)
 * - Right-to-left writing direction
 * - Names can be transliterated many ways (محمد → Mohammed, Muhammad, Mohamed...)
 */

// --- Arabic Unicode Ranges ---
// Arabic script occupies several Unicode blocks
const ARABIC_RANGE_START = 0x0600;
const ARABIC_RANGE_END = 0x06FF;
const ARABIC_SUPPLEMENT_START = 0x0750;
const ARABIC_SUPPLEMENT_END = 0x077F;

// --- Diacritical marks (tashkeel) to remove during normalization ---
// These are the short vowel marks placed above/below Arabic letters
const TASHKEEL = [
  '\u064B', // fathatan
  '\u064C', // dammatan
  '\u064D', // kasratan
  '\u064E', // fatha
  '\u064F', // damma
  '\u0650', // kasra
  '\u0651', // shadda
  '\u0652', // sukun
  '\u0670', // superscript alef
];

// Regex that matches any tashkeel character
const TASHKEEL_REGEX = new RegExp(`[${TASHKEEL.join('')}]`, 'g');

// --- Alef normalization ---
// Arabic has multiple forms of alef that should be treated as the same letter.
// We normalize them all to plain alef (ا).
const ALEF_VARIANTS = {
  '\u0622': '\u0627', // alef with madda → alef
  '\u0623': '\u0627', // alef with hamza above → alef
  '\u0625': '\u0627', // alef with hamza below → alef
  '\u0671': '\u0627', // alef wasla → alef
};

// --- Transliteration Table ---
// Maps individual Arabic letters to their Latin equivalents.
// This follows the common "simplified" transliteration used in news and documents.
const TRANSLITERATION_MAP = {
  'ا': 'a',   // alef
  'أ': 'a',   // alef with hamza above
  'إ': 'i',   // alef with hamza below
  'آ': 'aa',  // alef with madda
  'ب': 'b',   // ba
  'ت': 't',   // ta
  'ث': 'th',  // tha
  'ج': 'j',   // jim
  'ح': 'h',   // ha
  'خ': 'kh',  // kha
  'د': 'd',   // dal
  'ذ': 'dh',  // dhal
  'ر': 'r',   // ra
  'ز': 'z',   // zay
  'س': 's',   // sin
  'ش': 'sh',  // shin
  'ص': 's',   // sad
  'ض': 'd',   // dad
  'ط': 't',   // ta (emphatic)
  'ظ': 'z',   // za (emphatic)
  'ع': 'a',   // ain (simplified — actually a guttural sound)
  'غ': 'gh',  // ghain
  'ف': 'f',   // fa
  'ق': 'q',   // qaf
  'ك': 'k',   // kaf
  'ل': 'l',   // lam
  'م': 'm',   // mim
  'ن': 'n',   // nun
  'ه': 'h',   // ha
  'و': 'w',   // waw (also used as long vowel 'u/oo')
  'ي': 'y',   // ya (also used as long vowel 'i/ee')
  'ة': 'a',   // ta marbuta (at end of words, sounds like 'a' or 'ah')
  'ى': 'a',   // alef maqsura
  'ء': '',    // hamza (glottal stop — often silent in transliteration)
  'ئ': 'y',   // ya with hamza
  'ؤ': 'w',   // waw with hamza
  // Arabic-Indic numerals
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/**
 * Check if a character is in the Arabic Unicode range.
 */
function isArabicChar(char) {
  const code = char.charCodeAt(0);
  return (
    (code >= ARABIC_RANGE_START && code <= ARABIC_RANGE_END) ||
    (code >= ARABIC_SUPPLEMENT_START && code <= ARABIC_SUPPLEMENT_END)
  );
}

/**
 * Check if text is primarily Arabic.
 * Returns true if more than 50% of alphabetic characters are Arabic.
 *
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function isArabicText(text) {
  if (!text || text.length === 0) return false;

  let arabicCount = 0;
  let alphaCount = 0;

  for (const char of text) {
    // Skip whitespace, numbers, punctuation
    if (/\s/.test(char) || /\d/.test(char) || /[.,;:!?'"()\-\/]/.test(char)) continue;

    alphaCount++;
    if (isArabicChar(char)) {
      arabicCount++;
    }
  }

  if (alphaCount === 0) return false;
  return arabicCount / alphaCount > 0.5;
}

/**
 * Normalize Arabic text for consistent comparison.
 * - Removes diacritical marks (tashkeel)
 * - Normalizes alef variants to plain alef
 * - Normalizes ta marbuta to ha
 *
 * @param {string} text - Arabic text to normalize
 * @returns {string} Normalized text
 */
function normalizeArabicText(text) {
  if (!text) return '';

  let normalized = text;

  // Step 1: Remove tashkeel (diacritics)
  normalized = normalized.replace(TASHKEEL_REGEX, '');

  // Step 2: Normalize alef variants
  for (const [variant, replacement] of Object.entries(ALEF_VARIANTS)) {
    normalized = normalized.replace(new RegExp(variant, 'g'), replacement);
  }

  // Step 3: Trim and collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Transliterate an Arabic name to Latin script.
 * Goes letter by letter through the transliteration table.
 *
 * @param {string} arabicName - Name in Arabic script
 * @returns {string} Transliterated name in Latin script
 */
function transliterateName(arabicName) {
  if (!arabicName) return '';

  // First normalize the Arabic text
  const normalized = normalizeArabicText(arabicName);

  let result = '';
  for (const char of normalized) {
    if (TRANSLITERATION_MAP[char] !== undefined) {
      result += TRANSLITERATION_MAP[char];
    } else if (char === ' ') {
      result += ' ';
    } else if (char === '-') {
      result += '-';
    } else if (/[a-zA-Z0-9]/.test(char)) {
      // Already Latin — keep as is
      result += char;
    }
    // Skip characters we can't transliterate
  }

  // Clean up: capitalize first letter of each word, collapse spaces
  return result
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Common Arabic names with standard Latin transliterations.
 * Used for cross-referencing — when we find an Arabic name in one source,
 * we can check if any of these known transliterations appear in other sources.
 *
 * Each entry: { arabic, transliterations: [array of common Latin spellings] }
 */
const COMMON_ARABIC_NAMES = [
  // --- Very common given names (male) ---
  { arabic: 'محمد', transliterations: ['Mohammed', 'Muhammad', 'Mohamed', 'Mohammad'] },
  { arabic: 'أحمد', transliterations: ['Ahmed', 'Ahmad'] },
  { arabic: 'علي', transliterations: ['Ali'] },
  { arabic: 'حسن', transliterations: ['Hassan', 'Hasan'] },
  { arabic: 'حسين', transliterations: ['Hussein', 'Husain', 'Hussain'] },
  { arabic: 'عمر', transliterations: ['Omar', 'Umar'] },
  { arabic: 'خالد', transliterations: ['Khalid', 'Khaled'] },
  { arabic: 'يوسف', transliterations: ['Youssef', 'Yusuf', 'Yousef', 'Josef'] },
  { arabic: 'إبراهيم', transliterations: ['Ibrahim', 'Ibraheem'] },
  { arabic: 'عبدالله', transliterations: ['Abdullah', 'Abdallah', 'Abdollah'] },
  { arabic: 'عبدالرحمن', transliterations: ['Abdulrahman', 'Abdul Rahman', 'Abdelrahman'] },
  { arabic: 'فيصل', transliterations: ['Faisal', 'Faysal'] },
  { arabic: 'سعود', transliterations: ['Saud', 'Saoud'] },
  { arabic: 'طارق', transliterations: ['Tariq', 'Tarek', 'Tarik'] },
  { arabic: 'كريم', transliterations: ['Karim', 'Kareem'] },
  { arabic: 'سلمان', transliterations: ['Salman', 'Salmaan'] },
  { arabic: 'ناصر', transliterations: ['Nasser', 'Nasir', 'Nasr'] },
  { arabic: 'سعيد', transliterations: ['Saeed', 'Said', 'Saeid'] },
  { arabic: 'مصطفى', transliterations: ['Mustafa', 'Mostafa', 'Mustapha'] },
  { arabic: 'ماجد', transliterations: ['Majid', 'Majed', 'Maged'] },
  { arabic: 'جمال', transliterations: ['Jamal', 'Gamal'] },
  { arabic: 'عادل', transliterations: ['Adel', 'Adil'] },
  { arabic: 'رشيد', transliterations: ['Rashid', 'Rachid', 'Rasheed'] },
  { arabic: 'وليد', transliterations: ['Walid', 'Waleed', 'Oualid'] },
  { arabic: 'سامي', transliterations: ['Sami', 'Sammy'] },

  // --- Very common given names (female) ---
  { arabic: 'فاطمة', transliterations: ['Fatima', 'Fatimah', 'Fatma'] },
  { arabic: 'عائشة', transliterations: ['Aisha', 'Aysha', 'Aicha'] },
  { arabic: 'مريم', transliterations: ['Maryam', 'Mariam', 'Miriam'] },
  { arabic: 'نور', transliterations: ['Nour', 'Noor', 'Nur'] },
  { arabic: 'ليلى', transliterations: ['Layla', 'Leila', 'Laila'] },
  { arabic: 'سارة', transliterations: ['Sara', 'Sarah'] },
  { arabic: 'هدى', transliterations: ['Huda', 'Houda'] },
  { arabic: 'أمينة', transliterations: ['Amina', 'Aminah', 'Ameena'] },
  { arabic: 'زينب', transliterations: ['Zainab', 'Zaynab', 'Zineb'] },
  { arabic: 'خديجة', transliterations: ['Khadija', 'Khadijah'] },

  // --- Very common family names ---
  { arabic: 'الراشد', transliterations: ['Al-Rashid', 'Al Rashid', 'Alrashid', 'El-Rachid'] },
  { arabic: 'المنصور', transliterations: ['Al-Mansour', 'Al Mansour', 'Almansour', 'El-Mansour'] },
  { arabic: 'الحسن', transliterations: ['Al-Hassan', 'Al Hassan', 'Alhassan', 'El-Hassan'] },
  { arabic: 'الشيخ', transliterations: ['Al-Sheikh', 'Al Sheikh', 'Alsheikh', 'El-Cheikh'] },
  { arabic: 'القاسم', transliterations: ['Al-Qasim', 'Al Qasim', 'Alqasim', 'El-Kassem'] },
  { arabic: 'العمري', transliterations: ['Al-Omari', 'Al Omari', 'Alomari', 'El-Omari'] },
  { arabic: 'البكر', transliterations: ['Al-Bakr', 'Al Bakr', 'Albakr', 'El-Bakr'] },
  { arabic: 'الدين', transliterations: ['Al-Din', 'Al Din', 'Aldin', 'El-Din', 'Eddin'] },
  { arabic: 'الهاشمي', transliterations: ['Al-Hashimi', 'Al Hashimi', 'Alhashimi', 'El-Hachemi'] },
  { arabic: 'السعدي', transliterations: ['Al-Saadi', 'Al Saadi', 'Alsaadi', 'El-Saadi'] },
];

/**
 * Find known Latin transliterations for an Arabic name.
 * Checks both the full name and individual words against the database.
 *
 * @param {string} arabicText - Name in Arabic script
 * @returns {string[]} Array of possible Latin transliterations
 */
function findTransliterations(arabicText) {
  if (!arabicText) return [];

  const normalized = normalizeArabicText(arabicText);
  const results = new Set();

  // Check each word in the name against our database
  const words = normalized.split(' ');
  for (const word of words) {
    for (const entry of COMMON_ARABIC_NAMES) {
      const entryNormalized = normalizeArabicText(entry.arabic);
      if (entryNormalized === word || entry.arabic === word) {
        entry.transliterations.forEach((t) => results.add(t));
      }
    }
  }

  // Also try the auto-transliteration for the full name
  const autoTranslit = transliterateName(arabicText);
  if (autoTranslit) {
    results.add(autoTranslit);
  }

  return [...results];
}

module.exports = {
  isArabicText,
  isArabicChar,
  normalizeArabicText,
  transliterateName,
  findTransliterations,
  COMMON_ARABIC_NAMES,
  TRANSLITERATION_MAP,
};
