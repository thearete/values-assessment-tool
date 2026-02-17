/**
 * Name Commonality Checker
 *
 * Detects when an entity's name is very common, which means there's a
 * higher risk of false positives. For example, "Mohammed Ahmed" is one
 * of the most common name combinations in the world — finding it on a
 * sanctions list doesn't necessarily mean it's the same person.
 *
 * This module flags these cases so the analyst knows to verify with
 * additional identifying information (date of birth, address, etc.).
 */

// ===================================================================
// COMMON NAME DATABASES
// ===================================================================

// Top common English first names
const COMMON_ENGLISH_FIRST = new Set([
  'james', 'john', 'robert', 'michael', 'david', 'william', 'richard',
  'joseph', 'thomas', 'charles', 'christopher', 'daniel', 'matthew',
  'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth',
  'susan', 'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty',
  'margaret', 'sandra', 'ashley', 'dorothy', 'kimberly', 'emily', 'donna',
  'peter', 'george', 'edward', 'brian', 'ronald', 'timothy', 'jason',
  'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan',
  'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin',
  'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick',
  'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam',
  'nathan', 'henry', 'douglas', 'zachary', 'kevin', 'noah', 'ethan',
]);

// Top common English last names
const COMMON_ENGLISH_LAST = new Set([
  'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller',
  'davis', 'rodriguez', 'martinez', 'hernandez', 'lopez', 'gonzalez',
  'wilson', 'anderson', 'thomas', 'taylor', 'moore', 'jackson', 'martin',
  'lee', 'perez', 'thompson', 'white', 'harris', 'sanchez', 'clark',
  'ramirez', 'lewis', 'robinson', 'walker', 'young', 'allen', 'king',
  'wright', 'scott', 'torres', 'nguyen', 'hill', 'flores', 'green',
  'adams', 'nelson', 'baker', 'hall', 'rivera', 'campbell', 'mitchell',
  'carter', 'roberts', 'gomez', 'phillips', 'evans', 'turner', 'diaz',
  'parker', 'cruz', 'edwards', 'collins', 'reyes', 'stewart', 'morris',
]);

// Top common Swedish first names
const COMMON_SWEDISH_FIRST = new Set([
  'erik', 'lars', 'karl', 'anders', 'johan', 'per', 'nils', 'lennart',
  'björn', 'peter', 'jan', 'olof', 'sven', 'hans', 'bengt', 'bo',
  'ulf', 'thomas', 'göran', 'mikael', 'leif', 'christer', 'mats',
  'stefan', 'magnus', 'gunnar', 'jonas', 'mattias', 'henrik', 'fredrik',
  'anna', 'maria', 'karin', 'margareta', 'elisabeth', 'eva', 'kristina',
  'birgitta', 'marie', 'ingrid', 'linnéa', 'sofia', 'elin', 'sara',
  'emma', 'kerstin', 'lena', 'marianne', 'helena', 'katarina', 'annika',
  'jenny', 'susanne', 'monica', 'johanna', 'ulla', 'carina', 'malin',
  'andreas', 'daniel', 'alexander', 'oscar', 'william', 'viktor',
  'gustaf', 'axel', 'carl', 'david', 'martin', 'patrik', 'tobias',
]);

// Top common Swedish last names
const COMMON_SWEDISH_LAST = new Set([
  'andersson', 'johansson', 'karlsson', 'nilsson', 'eriksson', 'larsson',
  'olsson', 'persson', 'svensson', 'gustafsson', 'pettersson', 'jonsson',
  'jansson', 'hansson', 'bengtsson', 'jönsson', 'lindberg', 'jakobsson',
  'magnusson', 'lindström', 'olofsson', 'lindqvist', 'lindgren', 'berg',
  'axelsson', 'bergström', 'lundberg', 'lind', 'lundgren', 'lundqvist',
  'mattsson', 'berglund', 'fredriksson', 'sandberg', 'henriksson', 'forsberg',
  'sjöberg', 'wallin', 'engström', 'danielsson', 'håkansson', 'eklund',
  'lundin', 'gunnarsson', 'holm', 'björk', 'bergman', 'fransson',
  'samuelsson', 'nordin', 'nyström', 'holmberg', 'isaksson', 'arvidsson',
]);

// Top common Arabic first names (transliterated)
const COMMON_ARABIC_FIRST = new Set([
  'mohammed', 'muhammad', 'mohamed', 'mohammad', 'ahmed', 'ahmad',
  'ali', 'hassan', 'hasan', 'hussein', 'husain', 'hussain',
  'omar', 'umar', 'khalid', 'khaled', 'ibrahim', 'youssef', 'yusuf',
  'yousef', 'mustafa', 'mostafa', 'abdullah', 'abdallah',
  'faisal', 'faysal', 'salman', 'nasser', 'nasir', 'saeed', 'said',
  'karim', 'kareem', 'tariq', 'tarek', 'walid', 'waleed',
  'sami', 'adel', 'adil', 'rashid', 'rachid', 'majid', 'majed',
  'jamal', 'gamal', 'hamad', 'hamid', 'bilal', 'zaid', 'zayd',
  'fatima', 'fatimah', 'aisha', 'aysha', 'maryam', 'mariam',
  'nour', 'noor', 'layla', 'leila', 'sara', 'sarah', 'huda',
  'amina', 'aminah', 'zainab', 'zaynab', 'khadija', 'khadijah',
  'yasmin', 'hana', 'rania', 'dina', 'lina', 'samira', 'jamila',
]);

// Top common Arabic last names / family names (transliterated)
const COMMON_ARABIC_LAST = new Set([
  'al-rashid', 'al-mansour', 'al-hassan', 'al-sheikh', 'al-qasim',
  'al-omari', 'al-bakr', 'al-din', 'al-hashimi', 'al-saadi',
  'al-mahmoud', 'al-ibrahim', 'al-ali', 'al-ahmed', 'al-khalid',
  'al-saud', 'al-thani', 'al-nahyan', 'al-maktoum', 'al-sabah',
  'al-khalifa', 'al-sharif', 'al-amin', 'al-hadi', 'al-nasser',
  'khan', 'shah', 'sheikh', 'sharif', 'hashim', 'hashimi',
  'hassan', 'hussein', 'ahmed', 'mahmoud', 'ibrahim', 'mustafa',
  'malik', 'sultan', 'amir', 'rahim', 'rahman', 'hamid',
  'el-masri', 'el-amin', 'el-sayed', 'el-din', 'el-mahdi',
  'bin laden', 'bin salman', 'bin zayed', 'bin rashid',
  'al-asad', 'al-maliki', 'al-abadi', 'al-sistani',
]);

/**
 * Check how common a name is across our databases.
 *
 * @param {string} name - Full name to check (e.g., "Mohammed Ahmed")
 * @returns {Object} { isCommon, frequencyEstimate, warning, details }
 */
function checkNameCommonality(name) {
  if (!name || name.trim().length === 0) {
    return {
      isCommon: false,
      frequencyEstimate: 'unknown',
      warning: null,
      details: {},
    };
  }

  const parts = name.toLowerCase().trim().split(/\s+/);
  // Handle "Al-" prefixed names: treat "al-rashid" as one unit
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
  // For names like "Al-Rashid", also check hyphenated form
  const lastNameHyphenated = parts.length > 2 ? parts.slice(-2).join('-') : null;

  const firstNameCommon = isFirstNameCommon(firstName);
  const lastNameCommon = lastName ? isLastNameCommon(lastName) || (lastNameHyphenated ? isLastNameCommon(lastNameHyphenated) : false) : false;

  let frequencyEstimate;
  let warning = null;

  if (firstNameCommon && lastNameCommon) {
    frequencyEstimate = 'very-high';
    warning = `"${name}" — both first and last name are very common. High false-positive risk. Verify with additional identifying information (date of birth, address, national ID).`;
  } else if (firstNameCommon || lastNameCommon) {
    frequencyEstimate = 'high';
    warning = `"${name}" — ${firstNameCommon ? 'first' : 'last'} name is very common. Moderate false-positive risk. Consider verifying identity.`;
  } else {
    frequencyEstimate = 'low';
  }

  return {
    isCommon: frequencyEstimate !== 'low',
    frequencyEstimate,
    warning,
    details: {
      firstName,
      lastName,
      firstNameCommon,
      lastNameCommon,
    },
  };
}

/**
 * Check if a first name is in any of our common-name databases.
 */
function isFirstNameCommon(name) {
  const lower = name.toLowerCase();
  return (
    COMMON_ENGLISH_FIRST.has(lower) ||
    COMMON_SWEDISH_FIRST.has(lower) ||
    COMMON_ARABIC_FIRST.has(lower)
  );
}

/**
 * Check if a last name is in any of our common-name databases.
 */
function isLastNameCommon(name) {
  const lower = name.toLowerCase();
  return (
    COMMON_ENGLISH_LAST.has(lower) ||
    COMMON_SWEDISH_LAST.has(lower) ||
    COMMON_ARABIC_LAST.has(lower)
  );
}

/**
 * Check all entities for name commonality and return warnings.
 *
 * @param {Array} entities - Extracted entities
 * @returns {Array} Confidence warnings for common names
 */
function checkAllNames(entities) {
  const warnings = [];

  for (const entity of entities) {
    if (entity.type !== 'person') continue;

    const result = checkNameCommonality(entity.name);
    if (result.isCommon) {
      warnings.push({
        entityId: entity.id,
        entityName: entity.name,
        warning: result.warning,
        nameFrequencyEstimate: result.frequencyEstimate,
        recommendation: result.frequencyEstimate === 'very-high'
          ? 'Verify with additional identifying information (DOB, address, national ID)'
          : 'Consider verifying identity with a second identifier',
      });
    }
  }

  return warnings;
}

module.exports = {
  checkNameCommonality,
  checkAllNames,
  isFirstNameCommon,
  isLastNameCommon,
};
