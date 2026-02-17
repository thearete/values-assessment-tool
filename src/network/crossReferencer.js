/**
 * Cross-Referencer
 *
 * Finds connections between entities by analyzing:
 * - Co-mentions: two entities appearing near each other in text
 * - Proximity: entities within a certain word distance
 * - Anomalies: unusual frequency patterns, cross-list presence
 *
 * This is where the "detective" logic lives. The cross-referencer
 * looks for patterns that a human analyst would notice:
 * "Why is this person mentioned 5 times when everyone else is mentioned once?"
 * "Why do these two entities always appear together?"
 */

const config = require('../config');
const { containsFinancialKeywords } = require('../entities/entityPatterns');

/**
 * Main cross-referencing function.
 * Analyzes entities and their appearances in text to find relationships.
 *
 * @param {Array} entities - Extracted entities from entityExtractor
 * @param {Array} evidence - Evidence items from the scoring pipeline
 * @param {string} targetOrgName - The organization being assessed
 * @param {Array<{text: string, source: string}>} textSources - Raw text sources
 * @returns {Object} { relationships, anomalies, coMentions }
 */
function crossReference(entities, evidence, targetOrgName, textSources = []) {
  const relationships = [];
  const anomalies = [];

  // --- Step 1: Detect co-mentions ---
  const coMentions = detectCoMentions(entities, textSources);
  for (const cm of coMentions) {
    relationships.push({
      from: cm.entityA.id,
      to: cm.entityB.id,
      fromName: cm.entityA.name,
      toName: cm.entityB.name,
      type: classifyRelationship(cm.context),
      label: cm.entityA.roles[0] || 'co-mentioned',
      confidence: calculateCoMentionConfidence(cm),
      evidence: [{
        description: `Co-mentioned ${cm.count} time(s) in ${cm.source || 'text'}`,
        source: cm.source || 'text analysis',
        context: cm.context,
      }],
      detectedVia: 'co-mention',
    });
  }

  // --- Step 2: Link entities with roles to the target org ---
  for (const entity of entities) {
    if (entity.roles.length > 0 && entity.type === 'person') {
      relationships.push({
        from: entity.id,
        to: 'org-target',
        fromName: entity.name,
        toName: targetOrgName,
        type: 'organizational',
        label: entity.roles[0],
        confidence: entity.confidence,
        evidence: [{
          description: `Identified as ${entity.roles.join(', ')} via ${entity.extractedBy || 'analysis'}`,
          source: entity.sourceText || 'text analysis',
          context: entity.mentionContexts?.[0] || '',
        }],
        detectedVia: 'entity-extraction',
      });
    }
  }

  // --- Step 3: Check for sanctions cross-references ---
  // If any extracted entity name appears in evidence (sanctions matches), that's significant
  for (const entity of entities) {
    for (const ev of evidence) {
      if (ev.matchedName && entity.name.toLowerCase().includes(ev.matchedName.toLowerCase())) {
        relationships.push({
          from: entity.id,
          to: 'org-target',
          fromName: entity.name,
          toName: targetOrgName,
          type: 'sanctions-link',
          label: 'sanctions match',
          confidence: 0.9,
          evidence: [{
            description: `Entity "${entity.name}" matches sanctions entry "${ev.matchedName}"`,
            source: ev.source,
            sourceUrl: ev.sourceUrl,
          }],
          detectedVia: 'sanctions-match',
        });
      }
    }
  }

  // --- Step 4: Detect anomalies ---
  const detectedAnomalies = detectAnomalies(entities, evidence);
  anomalies.push(...detectedAnomalies);

  return {
    relationships,
    anomalies,
    coMentions,
    summary: {
      totalRelationships: relationships.length,
      totalAnomalies: anomalies.length,
      relationshipTypes: countByProperty(relationships, 'type'),
    },
  };
}

/**
 * Detect co-mentions: two entities appearing near each other in text.
 *
 * Scans each text source for pairs of entity names that appear within
 * a configurable character window of each other.
 *
 * @param {Array} entities - Extracted entities
 * @param {Array<{text: string, source: string}>} textSources - Text to scan
 * @returns {Array} Co-mention records
 */
function detectCoMentions(entities, textSources) {
  const windowChars = config.crossReferencing?.coMentionWindowChars || 200;
  const minCoMentions = config.crossReferencing?.minCoMentions || 2;
  const coMentionMap = new Map(); // "entityA.id|entityB.id" → count + contexts

  for (const source of textSources) {
    const text = source.text;
    if (!text) continue;

    // Check every pair of entities
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];

        // Find all positions of entity A in the text
        const positionsA = findAllPositions(text, a.name);
        const positionsB = findAllPositions(text, b.name);

        // Check if any pair of positions is within the window
        for (const posA of positionsA) {
          for (const posB of positionsB) {
            const distance = Math.abs(posA - posB);
            if (distance > 0 && distance <= windowChars) {
              const key = [a.id, b.id].sort().join('|');
              const existing = coMentionMap.get(key);

              // Extract the context between the two mentions
              const start = Math.min(posA, posB);
              const end = Math.max(posA, posB) + Math.max(a.name.length, b.name.length);
              const context = text.slice(
                Math.max(0, start - 20),
                Math.min(text.length, end + 20)
              );

              if (existing) {
                existing.count++;
                if (existing.contexts.length < 3) {
                  existing.contexts.push(context);
                }
              } else {
                coMentionMap.set(key, {
                  entityA: a,
                  entityB: b,
                  count: 1,
                  contexts: [context],
                  source: source.source || 'unknown',
                });
              }
            }
          }
        }
      }
    }
  }

  // Filter: only keep co-mentions that meet the minimum threshold
  const results = [];
  for (const [, value] of coMentionMap) {
    if (value.count >= minCoMentions) {
      results.push({
        entityA: value.entityA,
        entityB: value.entityB,
        count: value.count,
        context: value.contexts[0] || '',
        allContexts: value.contexts,
        source: value.source,
      });
    }
  }

  return results;
}

/**
 * Search for two entities appearing within N words of each other.
 *
 * @param {string} nameA - First entity name
 * @param {string} nameB - Second entity name
 * @param {string} text - Text to search
 * @param {number} windowWords - Max word distance (default from config)
 * @returns {Array<{context: string, distance: number}>} Proximity matches
 */
function proximitySearch(nameA, nameB, text, windowWords) {
  const maxWords = windowWords || config.crossReferencing?.proximityWindowWords || 30;
  const results = [];

  const words = text.split(/\s+/);
  const textLower = text.toLowerCase();

  // Find word indices where each name starts
  const indicesA = [];
  const indicesB = [];

  const lowerA = nameA.toLowerCase();
  const lowerB = nameB.toLowerCase();

  let wordIndex = 0;
  let charPos = 0;
  for (const word of words) {
    const segment = textLower.slice(charPos);
    if (segment.startsWith(lowerA.split(' ')[0])) {
      indicesA.push(wordIndex);
    }
    if (segment.startsWith(lowerB.split(' ')[0])) {
      indicesB.push(wordIndex);
    }
    charPos += word.length + 1;
    wordIndex++;
  }

  // Check proximity
  for (const idxA of indicesA) {
    for (const idxB of indicesB) {
      const distance = Math.abs(idxA - idxB);
      if (distance > 0 && distance <= maxWords) {
        const start = Math.max(0, Math.min(idxA, idxB) - 3);
        const end = Math.min(words.length, Math.max(idxA, idxB) + 5);
        const context = words.slice(start, end).join(' ');

        results.push({ context, distance });
      }
    }
  }

  return results;
}

/**
 * Detect anomalies in entity data.
 *
 * Checks for:
 * 1. Frequency spikes — one entity mentioned far more than others
 * 2. Cross-list presence — an entity from one source also found in sanctions
 * 3. Unusual clustering — many entities from the same source connected
 *
 * @param {Array} entities - Extracted entities
 * @param {Array} evidence - Evidence items
 * @returns {Array} Anomaly records
 */
function detectAnomalies(entities, evidence) {
  const anomalies = [];
  const multiplier = config.crossReferencing?.anomalyThresholdMultiplier || 3;

  // --- Frequency spike detection ---
  if (entities.length > 0) {
    const mentionCounts = entities.map((e) => e.mentionCount || 1);
    const avgMentions = mentionCounts.reduce((a, b) => a + b, 0) / mentionCounts.length;

    for (const entity of entities) {
      const count = entity.mentionCount || 1;
      if (count >= avgMentions * multiplier && count >= 3) {
        anomalies.push({
          type: 'frequency-spike',
          entityId: entity.id,
          entityName: entity.name,
          description: `"${entity.name}" mentioned ${count} times (average: ${avgMentions.toFixed(1)}) — unusually frequent`,
          severity: count >= avgMentions * 5 ? 'high' : 'medium',
          value: count,
          threshold: avgMentions * multiplier,
        });
      }
    }
  }

  // --- Cross-list presence ---
  // Check if any extracted entity name also appears in sanctions evidence
  for (const entity of entities) {
    for (const ev of evidence) {
      if (ev.matchedName) {
        const entityLower = entity.name.toLowerCase();
        const matchLower = ev.matchedName.toLowerCase();
        if (entityLower.includes(matchLower) || matchLower.includes(entityLower)) {
          anomalies.push({
            type: 'cross-list-presence',
            entityId: entity.id,
            entityName: entity.name,
            description: `"${entity.name}" found in entity extraction AND matches "${ev.matchedName}" on ${ev.source}`,
            severity: 'high',
            source: ev.source,
          });
        }
      }
    }
  }

  return anomalies;
}

// === Helper functions ===

/**
 * Find all positions of a substring in text (case-insensitive).
 */
function findAllPositions(text, substring) {
  const positions = [];
  const lower = text.toLowerCase();
  const target = substring.toLowerCase();
  let pos = 0;

  while (pos < lower.length) {
    const found = lower.indexOf(target, pos);
    if (found === -1) break;
    positions.push(found);
    pos = found + 1;
  }

  return positions;
}

/**
 * Classify the type of relationship based on context text.
 */
function classifyRelationship(contextText) {
  if (!contextText) return 'co-mention';

  if (containsFinancialKeywords(contextText)) {
    return 'financial';
  }

  const orgKeywords = /\b(CEO|director|founder|chairman|board|VD|ordförande|grundare|employed|works?|heads?)\b/i;
  if (orgKeywords.test(contextText)) {
    return 'organizational';
  }

  const eventKeywords = /\b(investigation|arrest|convicted|charged|incident|event|raid|seized)\b/i;
  if (eventKeywords.test(contextText)) {
    return 'event-based';
  }

  return 'co-mention';
}

/**
 * Calculate confidence for a co-mention relationship.
 */
function calculateCoMentionConfidence(coMention) {
  let conf = 0.3; // base confidence for any co-mention

  // More co-mentions = higher confidence
  if (coMention.count >= 5) conf += 0.3;
  else if (coMention.count >= 3) conf += 0.2;
  else if (coMention.count >= 2) conf += 0.1;

  // If the relationship type is explicit (not just co-mention), boost
  const type = classifyRelationship(coMention.context);
  if (type !== 'co-mention') conf += 0.2;

  return Math.min(conf, 1.0);
}

/**
 * Count items by a property value. Utility for summaries.
 */
function countByProperty(items, prop) {
  const counts = {};
  for (const item of items) {
    const value = item[prop] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

module.exports = {
  crossReference,
  detectCoMentions,
  proximitySearch,
  detectAnomalies,
};
