/**
 * Results View — flag badge, summary, evidence, thresholds, suggestions, graph
 */

/**
 * Render the full results view for an assessment.
 */
function renderResults(assessment) {
  const container = document.getElementById('view-results');
  if (!assessment) {
    container.innerHTML = '<div class="empty-state">No assessment loaded</div>';
    return;
  }

  const flag = assessment.flag || {};
  const flagColor = flag.flag || 'GREY';

  container.innerHTML = `
    <!-- Back button -->
    <button class="back-btn" id="results-back">
      ${getIcon('chevronLeft')} Dashboard
    </button>

    <!-- Org Header -->
    <div class="org-header">
      <div class="org-name">${assessment.orgName || 'Unknown'}</div>
      <div class="org-date">Assessed ${formatDateTime(assessment.assessedAt)}</div>
    </div>

    <!-- Flag Badge -->
    <div class="flag-badge flag-badge--${flagColor}">
      <div class="flag-header">
        <span class="flag-color-dot flag-color-dot--${flagColor}"></span>
        <span class="flag-label flag-label--${flagColor}">${getFlagLabel(flagColor)}</span>
      </div>
      <div class="flag-reason">${flag.reason || ''}</div>
      ${flag.details && flag.details.length > 0
        ? `<ul class="flag-details">${flag.details.map((d) => `<li>${d}</li>`).join('')}</ul>`
        : ''}
    </div>

    <!-- Summary -->
    ${renderSummary(assessment)}

    <!-- Evidence -->
    ${renderEvidence(assessment)}

    <!-- What would change (collapsible) -->
    ${renderThreshold(assessment)}

    <!-- Koppla suggests (collapsible) -->
    ${renderSuggestions(assessment)}

    <!-- Network Graph -->
    ${assessment.visJsExport
      ? `<div class="section-title">${getIcon('network')} Network Graph</div>
         <div class="graph-container" id="results-graph"></div>`
      : ''}
  `;

  // Event: back button — also clear background state so widget hides
  document.getElementById('results-back')?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'CLEAR_STATE' });
    }
    navigateTo('dashboard');
  });

  // Set up collapsibles
  setupCollapsibles();

  // Render graph
  if (assessment.visJsExport) {
    setTimeout(() => initGraph('results-graph', assessment.visJsExport), 100);
  }

  // Enable download/share buttons
  document.getElementById('btn-download').disabled = false;
  document.getElementById('btn-share').disabled = false;
}

/**
 * Generate a summary paragraph from the assessment data.
 */
function renderSummary(assessment) {
  const flag = assessment.flag?.flag || 'GREY';
  const scoring = assessment.scoring || {};
  const threshold = assessment.thresholdInfo || {};

  let text = '';
  if (flag === 'RED') {
    text = `Koppla found critical concerns: ${assessment.flag?.reason || 'N/A'}. ` +
      `The overall credibility score is ${(scoring.overallScore || 0).toFixed(1)} based on ` +
      `${scoring.totalItems || 0} piece(s) of evidence.`;
  } else if (flag === 'YELLOW') {
    text = `Koppla identified warning indicators: ${assessment.flag?.reason || 'N/A'}. ` +
      `Review the evidence below for details.`;
  } else if (flag === 'GREEN') {
    text = `Koppla checked ${(assessment.metadata?.sourcesChecked || []).join(', ') || 'available sources'} ` +
      `and found no significant concerns. ` +
      (threshold.distanceToYellow
        ? `The organization is ${threshold.distanceToYellow} indicator(s) away from requiring attention.`
        : '');
  } else {
    text = `Koppla could not gather enough data to make a determination. ` +
      `Some sources may have been unreachable.`;
  }

  return `<div class="results-summary">${text}</div>`;
}

/**
 * Render evidence cards, sorted by credibility weight.
 */
function renderEvidence(assessment) {
  const evidence = assessment.evidence || [];
  if (evidence.length === 0) {
    return `<div class="evidence-section">
      <div class="section-title">${getIcon('shield')} Evidence <span class="evidence-count">(0 items)</span></div>
      <div class="empty-state">No evidence items found</div>
    </div>`;
  }

  // Sort by credibility weight (highest first)
  const sorted = [...evidence].sort((a, b) => (b.credibilityWeight || b.score || 0) - (a.credibilityWeight || a.score || 0));

  const cards = sorted.map((ev) => {
    const iconName = getEvidenceIcon(ev.sourceType);
    return `
      <div class="evidence-card">
        <div class="evidence-icon">${getIcon(iconName)}</div>
        <div class="evidence-content">
          <div class="evidence-description">${ev.description || 'No description'}</div>
          <div class="evidence-meta">
            <span class="evidence-source">${ev.source || 'Unknown source'}</span>
            ${ev.category ? `<span class="evidence-category">${ev.category}</span>` : ''}
            ${ev.sourceUrl ? `<a class="evidence-link" href="${ev.sourceUrl}" target="_blank" rel="noopener">View source</a>` : ''}
          </div>
        </div>
        <div class="evidence-weight" title="Credibility weight">
          ${(ev.credibilityWeight || ev.score || 0).toFixed(1)}
        </div>
      </div>
    `;
  }).join('');

  return `<div class="evidence-section">
    <div class="section-title">${getIcon('shield')} Evidence <span class="evidence-count">(${evidence.length} items)</span></div>
    <div class="evidence-list">${cards}</div>
  </div>`;
}

/**
 * Render the "What would change" collapsible section.
 */
function renderThreshold(assessment) {
  const threshold = assessment.thresholdInfo || assessment.flag?.thresholdInfo;
  if (!threshold || !threshold.whatWouldChange || threshold.whatWouldChange.length === 0) return '';

  return `<div class="threshold-section">
    <div class="collapsible-header" data-target="threshold-body">
      <span class="section-title mb-0">${getIcon('alertTriangle')} What would change the flag</span>
      <span class="chevron">${getIcon('chevronDown')}</span>
    </div>
    <div class="collapsible-body" id="threshold-body">
      <ul class="threshold-list">
        ${threshold.whatWouldChange.map((item) => `<li class="threshold-item">${item}</li>`).join('')}
      </ul>
      <div class="text-xs text-muted mt-sm">
        Yellow indicators: ${threshold.yellowIndicators || 0}/${threshold.yellowThreshold || 2} |
        Red conditions met: ${threshold.redConditionsMet || 0}
      </div>
    </div>
  </div>`;
}

/**
 * Render the "Koppla suggests" collapsible section.
 */
function renderSuggestions(assessment) {
  const suggestions = assessment.suggestions || [];
  if (suggestions.length === 0) return '';

  const items = suggestions.map((s) => {
    const priorityIcon = s.priority === 'high' ? '!' : s.priority === 'medium' ? '~' : '?';
    return `
      <div class="suggestion-item">
        <div class="suggestion-priority suggestion-priority--${s.priority}">${priorityIcon}</div>
        <div class="suggestion-text">
          ${s.description}
          ${s.actionable && s.suggestedAction ? `<div class="suggestion-action">${s.suggestedAction}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `<div class="suggestions-section">
    <div class="collapsible-header" data-target="suggestions-body">
      <span class="section-title mb-0">${getIcon('lightbulb')} Koppla suggests <span class="evidence-count">(${suggestions.length})</span></span>
      <span class="chevron">${getIcon('chevronDown')}</span>
    </div>
    <div class="collapsible-body" id="suggestions-body">
      <div class="suggestion-list">${items}</div>
    </div>
  </div>`;
}

/**
 * Set up collapsible section toggle behavior.
 */
function setupCollapsibles() {
  document.querySelectorAll('.collapsible-header').forEach((header) => {
    header.addEventListener('click', () => {
      const targetId = header.dataset.target;
      const body = document.getElementById(targetId);
      if (!body) return;
      header.classList.toggle('open');
      body.classList.toggle('open');
    });
  });
}
