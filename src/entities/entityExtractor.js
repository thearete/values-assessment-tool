/**
 * Entity Extractor
 *
 * The "detective brain" — extracts people, organizations, and roles from text.
 *
 * Uses a two-pass approach:
 * 1. NLP pass: the 'compromise' library finds English names reliably
 * 2. Regex pass: our custom patterns catch Swedish, Arabic, and missed names
 *
 * After extraction, entities are deduplicated and scored for confidence.
 * The output feeds into the cross-referencer and network graph builder.
 */

const nlp = require('compromise');
const { extractWithPatterns } = require('./entityPatterns');
const { normalizeName } = require('../scrapers/baseScraper');
const config = require('../config');

/**
 * Simple Levenshtein distance calculation.
 * Used for fuzzy deduplication — determines if two names are "close enough"
 * to be the same entity (e.g., "Mohamed" vs "Mohammed").
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance (lower = more similar)
 */
function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity between two strings (0 to 1, where 1 = identical).
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score
 */
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Generate a unique ID for an entity.
 * Format: "entity-{index}-{first4chars}"
 */
let entityCounter = 0;
function generateEntityId(name) {
  entityCounter++;
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  return `entity-${entityCounter}-${slug}`;
}

/**
 * Reset the entity counter (call between assessment runs).
 */
function resetCounter() {
  entityCounter = 0;
}

/**
 * Extract entities from a single text using the two-pass approach.
 *
 * @param {string} text - Text to extract entities from
 * @param {Object} context - Metadata about the text source
 * @param {string} context.source - Where the text came from (e.g., "OFAC SDN List")
 * @param {string} context.sourceUrl - URL of the source
 * @param {string} context.language - Detected language of the text
 * @returns {Object} Extraction result with entities array
 */
function extractEntities(text, context = {}) {
  if (!text || text.trim().length === 0) {
    return { entities: [], summary: { totalEntities: 0, people: 0, organizations: 0 } };
  }

  const rawEntities = [];

  // === PASS 1: NLP extraction (compromise) ===
  // This works best on English text. It understands grammar and context
  // to find names that regex alone would miss.
  try {
    const doc = nlp(text);

    // Find person names
    const people = doc.people().out('array');
    for (const name of people) {
      if (name && name.length >= 3) {
        rawEntities.push({
          name: name.trim(),
          type: 'person',
          extractedBy: 'nlp',
          language: context.language || 'en',
        });
      }
    }

    // Find organization names
    const orgs = doc.organizations().out('array');
    for (const name of orgs) {
      if (name && name.length >= 3) {
        rawEntities.push({
          name: name.trim(),
          type: 'organization',
          extractedBy: 'nlp',
          language: context.language || 'en',
        });
      }
    }
  } catch (err) {
    // NLP failed — that's okay, regex pass will still run
    console.log(`  NLP extraction failed: ${err.message}`);
  }

  // === PASS 2: Regex extraction ===
  // Catches what NLP missed, especially Swedish and Arabic names.
  const langHint = context.language || 'all';
  const regexResults = extractWithPatterns(text, langHint);

  for (const person of regexResults.people) {
    rawEntities.push({
      name: person.name,
      type: 'person',
      extractedBy: 'regex',
      matchedBy: person.matchedBy,
      language: person.language,
    });
  }

  for (const org of regexResults.organizations) {
    rawEntities.push({
      name: org.name,
      type: 'organization',
      extractedBy: 'regex',
      matchedBy: org.matchedBy,
      language: org.language,
    });
  }

  // Collect role mentions (used later for relationship building)
  const roleMentions = regexResults.roles;

  // === Deduplicate and enrich ===
  const deduplicated = deduplicateEntities(rawEntities);

  // Assign roles to entities based on proximity in text
  assignRoles(deduplicated, roleMentions, text);

  // Score confidence for each entity
  scoreConfidence(deduplicated);

  // Add context metadata
  for (const entity of deduplicated) {
    entity.sourceText = context.source || 'unknown';
    entity.sourceUrl = context.sourceUrl || '';
    // Extract mention contexts (surrounding text for each occurrence)
    entity.mentionContexts = findMentionContexts(entity.name, text);
    entity.mentionCount = entity.mentionContexts.length || 1;
  }

  // Filter by minimum confidence
  const minConfidence = config.entityExtraction?.minConfidence || 0.3;
  const filtered = deduplicated.filter((e) => e.confidence >= minConfidence);

  // Limit max entities per text (safety valve)
  const maxEntities = config.entityExtraction?.maxEntitiesPerText || 50;
  const limited = filtered.slice(0, maxEntities);

  // Build summary
  const summary = {
    totalEntities: limited.length,
    people: limited.filter((e) => e.type === 'person').length,
    organizations: limited.filter((e) => e.type === 'organization').length,
  };

  return { entities: limited, summary };
}

/**
 * Deduplicate entities that refer to the same person/org.
 * Uses normalized name comparison + Levenshtein distance for fuzzy matching.
 *
 * @param {Array} rawEntities - Array of raw extracted entities
 * @returns {Array} Deduplicated entities with IDs
 */
function deduplicateEntities(rawEntities) {
  const threshold = config.entityExtraction?.deduplicationThreshold || 0.85;
  const unique = [];

  for (const entity of rawEntities) {
    const normA = normalizeName(entity.name);

    // Check if this entity is a near-duplicate of one we already have
    let merged = false;
    for (const existing of unique) {
      const normB = normalizeName(existing.name);

      // Exact match after normalization
      if (normA === normB) {
        // Merge: keep the one extracted by NLP if available (higher quality)
        if (entity.extractedBy === 'nlp' && existing.extractedBy !== 'nlp') {
          existing.name = entity.name;
          existing.extractedBy = 'nlp';
        }
        existing.extractionMethods = existing.extractionMethods || [existing.extractedBy];
        if (!existing.extractionMethods.includes(entity.extractedBy)) {
          existing.extractionMethods.push(entity.extractedBy);
        }
        merged = true;
        break;
      }

      // Fuzzy match
      if (similarity(normA, normB) >= threshold) {
        existing.extractionMethods = existing.extractionMethods || [existing.extractedBy];
        if (!existing.extractionMethods.includes(entity.extractedBy)) {
          existing.extractionMethods.push(entity.extractedBy);
        }
        existing.aliases = existing.aliases || [];
        existing.aliases.push(entity.name);
        merged = true;
        break;
      }
    }

    if (!merged) {
      unique.push({
        id: generateEntityId(entity.name),
        name: entity.name,
        normalizedName: normA,
        type: entity.type,
        extractedBy: entity.extractedBy,
        extractionMethods: [entity.extractedBy],
        matchedBy: entity.matchedBy || null,
        language: entity.language,
        roles: [],
        aliases: [],
        confidence: 0,
      });
    }
  }

  return unique;
}

/**
 * Try to assign roles to entities based on proximity in the source text.
 * If "CEO" appears near "John Smith", John gets the role "CEO".
 *
 * @param {Array} entities - Deduplicated entities
 * @param {Array} roleMentions - Extracted role mentions with positions
 * @param {string} text - The original text
 */
function assignRoles(entities, roleMentions, text) {
  const ROLE_PROXIMITY = 100; // characters — how close a role must be to a name

  for (const role of roleMentions) {
    // Find the closest entity to this role mention
    let closestEntity = null;
    let closestDistance = Infinity;

    for (const entity of entities) {
      // Find where this entity's name appears in the text
      const nameIndex = text.indexOf(entity.name);
      if (nameIndex === -1) continue;

      const distance = Math.abs(nameIndex - role.index);
      if (distance < closestDistance && distance < ROLE_PROXIMITY) {
        closestDistance = distance;
        closestEntity = entity;
      }
    }

    if (closestEntity && !closestEntity.roles.includes(role.role)) {
      closestEntity.roles.push(role.role);
    }
  }
}

/**
 * Score confidence for each entity based on how it was extracted.
 *
 * Confidence scale:
 *   0.9  — NLP match + role context (very reliable)
 *   0.75 — NLP match alone
 *   0.7  — Regex match + role context
 *   0.5  — Regex match alone
 *   0.3  — Single mention, no context
 *
 * Being found by both NLP and regex boosts confidence.
 */
function scoreConfidence(entities) {
  for (const entity of entities) {
    const hasNlp = entity.extractionMethods.includes('nlp');
    const hasRegex = entity.extractionMethods.includes('regex');
    const hasRole = entity.roles.length > 0;

    if (hasNlp && hasRole) {
      entity.confidence = 0.9;
    } else if (hasNlp && hasRegex) {
      entity.confidence = 0.85; // found by both methods
    } else if (hasNlp) {
      entity.confidence = 0.75;
    } else if (hasRegex && hasRole) {
      entity.confidence = 0.7;
    } else if (hasRegex) {
      entity.confidence = 0.5;
    } else {
      entity.confidence = 0.3;
    }
  }
}

/**
 * Find the text surrounding each mention of an entity name.
 * Returns up to 3 context snippets of ~100 characters each.
 *
 * @param {string} name - Entity name to search for
 * @param {string} text - Full text to search in
 * @returns {string[]} Array of context snippets
 */
function findMentionContexts(name, text) {
  const contexts = [];
  const CONTEXT_RADIUS = 50; // characters before and after the name

  let startPos = 0;
  while (contexts.length < 3) {
    const index = text.indexOf(name, startPos);
    if (index === -1) break;

    const contextStart = Math.max(0, index - CONTEXT_RADIUS);
    const contextEnd = Math.min(text.length, index + name.length + CONTEXT_RADIUS);
    const snippet = text.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim();

    contexts.push(snippet);
    startPos = index + name.length;
  }

  return contexts;
}

/**
 * Extract entities from multiple text sources and merge results.
 * Used when we have text from several scrapers.
 *
 * @param {Array<{text: string, source: string, sourceUrl: string, language: string}>} textObjects
 * @param {string} targetOrgName - The organization being assessed
 * @returns {Object} Combined extraction result
 */
function extractFromMultipleTexts(textObjects, targetOrgName) {
  resetCounter();

  const allEntities = [];

  for (const item of textObjects) {
    const result = extractEntities(item.text, {
      source: item.source,
      sourceUrl: item.sourceUrl,
      language: item.language,
    });

    allEntities.push(...result.entities);
  }

  // Deduplicate across all sources
  const threshold = config.entityExtraction?.deduplicationThreshold || 0.85;
  const merged = [];

  for (const entity of allEntities) {
    let found = false;
    for (const existing of merged) {
      if (
        normalizeName(entity.name) === normalizeName(existing.name) ||
        similarity(normalizeName(entity.name), normalizeName(existing.name)) >= threshold
      ) {
        // Merge: combine sources, roles, aliases
        existing.mentionCount = (existing.mentionCount || 1) + (entity.mentionCount || 1);
        for (const role of entity.roles || []) {
          if (!existing.roles.includes(role)) existing.roles.push(role);
        }
        for (const alias of entity.aliases || []) {
          if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
        }
        existing.confidence = Math.max(existing.confidence, entity.confidence);
        found = true;
        break;
      }
    }

    if (!found) {
      merged.push({ ...entity });
    }
  }

  // Remove the target org itself from the entity list (we already know about it)
  const filtered = merged.filter(
    (e) => normalizeName(e.name) !== normalizeName(targetOrgName)
  );

  const summary = {
    totalEntities: filtered.length,
    people: filtered.filter((e) => e.type === 'person').length,
    organizations: filtered.filter((e) => e.type === 'organization').length,
  };

  return { entities: filtered, summary };
}

module.exports = {
  extractEntities,
  extractFromMultipleTexts,
  resetCounter,
  levenshtein,
  similarity,
};
