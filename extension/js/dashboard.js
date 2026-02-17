/**
 * Dashboard View — 4-card grid with New Assessment, Recent, Network, Suggestions
 */

/**
 * Render the dashboard view.
 */
async function renderDashboard() {
  const container = document.getElementById('view-dashboard');
  const assessment = state.currentAssessment;

  // Fetch recent assessments
  const list = await API.listAssessments();
  if (!list.error) {
    state.assessmentList = list;
  }

  container.innerHTML = `
    <div class="card-grid" id="dashboard-grid">
      <!-- Card 1: New Assessment -->
      <div class="neu-card neu-card--clickable dashboard-card" id="card-new">
        <div class="card-icon">${getIcon('plus')}</div>
        <div class="card-title">New Assessment</div>
        <div class="card-subtitle">Search an organization</div>
      </div>

      <!-- Card 2: Recent -->
      <div class="neu-card dashboard-card" id="card-recent">
        <div class="card-icon">${getIcon('clock')}</div>
        <div class="card-title">Recent</div>
        <div id="recent-list-container"></div>
      </div>

      <!-- Card 3: Network -->
      <div class="neu-card neu-card--clickable dashboard-card" id="card-network">
        <div class="card-icon">${getIcon('network')}</div>
        <div class="card-title">Network</div>
        ${assessment && assessment.visJsExport
          ? '<div class="mini-graph-container" id="mini-graph"></div>'
          : '<div class="card-placeholder">Run an assessment to see the network</div>'}
      </div>

      <!-- Card 4: Suggestions -->
      <div class="neu-card neu-card--clickable dashboard-card" id="card-suggestions">
        <div class="card-icon">${getIcon('lightbulb')}</div>
        <div class="card-title">Suggestions</div>
        <div id="suggestions-preview"></div>
      </div>
    </div>

    <!-- New Assessment Form (hidden by default) -->
    <div class="neu-card new-assessment-form hidden" id="new-assessment-form">
      <div class="section-title">
        ${getIcon('plus')} New Assessment
      </div>
      <div class="form-group">
        <label for="org-name-input">Organization name</label>
        <input type="text" class="neu-input" id="org-name-input" placeholder="Search organization...">
      </div>
      <div class="form-group">
        <label>Seed people (optional)</label>
        <div class="seed-input-row">
          <input type="text" class="neu-input" id="seed-person-input" placeholder="Name, Role (e.g. John Smith, CEO)">
          <button class="neu-btn neu-btn--small" id="add-seed-person">Add</button>
        </div>
        <div class="seed-chips" id="person-seeds"></div>
      </div>
      <div class="form-group">
        <label>Seed organizations (optional)</label>
        <div class="seed-input-row">
          <input type="text" class="neu-input" id="seed-org-input" placeholder="Organization name">
          <button class="neu-btn neu-btn--small" id="add-seed-org">Add</button>
        </div>
        <div class="seed-chips" id="org-seeds"></div>
      </div>
      <div class="form-actions">
        <button class="neu-btn" id="cancel-assessment">Cancel</button>
        <button class="neu-btn neu-btn--primary" id="run-assessment">Run Assessment</button>
      </div>
    </div>
  `;

  // Populate recent assessments
  renderRecentList();

  // Populate suggestions preview
  renderSuggestionsPreview();

  // Render mini graph if assessment exists
  if (assessment && assessment.visJsExport) {
    setTimeout(() => initMiniGraph('mini-graph', assessment.visJsExport), 100);
  }

  // Event listeners
  setupDashboardEvents();
}

/**
 * Render the recent assessments mini-list inside the Recent card.
 */
function renderRecentList() {
  const container = document.getElementById('recent-list-container');
  if (!container) return;

  const list = state.assessmentList;
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="card-placeholder">No assessments yet</div>';
    return;
  }

  // Show up to 3 most recent
  const recent = list.slice(0, 3);
  container.innerHTML = `<ul class="recent-list">
    ${recent.map((a) => `
      <li class="recent-item" data-filename="${a.filename}">
        <span class="flag-dot flag-dot--${a.flag}"></span>
        <span class="name">${a.orgName}</span>
        <span class="date">${formatDate(a.date)}</span>
      </li>
    `).join('')}
  </ul>`;

  // Click to load assessment
  container.querySelectorAll('.recent-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const filename = item.dataset.filename;
      showLoading('Loading assessment...');
      const assessment = await API.loadAssessment(filename);
      hideLoading();
      if (!assessment.error) {
        state.currentAssessment = assessment;
        navigateTo('results');
      }
    });
  });
}

/**
 * Render suggestion previews in the Suggestions card.
 */
function renderSuggestionsPreview() {
  const container = document.getElementById('suggestions-preview');
  if (!container) return;

  const assessment = state.currentAssessment;
  if (!assessment || !assessment.suggestions || assessment.suggestions.length === 0) {
    container.innerHTML = '<div class="card-placeholder">Run an assessment to get suggestions</div>';
    return;
  }

  const top = assessment.suggestions.slice(0, 2);
  container.innerHTML = `<div class="suggestion-preview">
    ${top.map((s) => `
      <div class="suggestion-preview-item">
        <span class="priority-dot" style="background: ${s.priority === 'high' ? 'var(--flag-red)' : s.priority === 'medium' ? 'var(--flag-yellow)' : 'var(--flag-grey)'}"></span>
        <span>${s.description.substring(0, 60)}${s.description.length > 60 ? '...' : ''}</span>
      </div>
    `).join('')}
  </div>`;
}

/**
 * Set up event listeners for the dashboard.
 */
function setupDashboardEvents() {
  const seeds = { persons: [], orgs: [] };

  // Card clicks
  document.getElementById('card-new')?.addEventListener('click', () => {
    document.getElementById('dashboard-grid').classList.add('hidden');
    document.getElementById('new-assessment-form').classList.remove('hidden');
    document.getElementById('org-name-input').focus();
  });

  document.getElementById('card-network')?.addEventListener('click', () => {
    if (state.currentAssessment) navigateTo('results');
  });

  document.getElementById('card-suggestions')?.addEventListener('click', () => {
    if (state.currentAssessment) navigateTo('results');
  });

  // Form: Cancel
  document.getElementById('cancel-assessment')?.addEventListener('click', () => {
    document.getElementById('new-assessment-form').classList.add('hidden');
    document.getElementById('dashboard-grid').classList.remove('hidden');
  });

  // Form: Add person seed
  document.getElementById('add-seed-person')?.addEventListener('click', () => {
    const input = document.getElementById('seed-person-input');
    const val = input.value.trim();
    if (!val) return;
    const parts = val.split(',').map((s) => s.trim());
    seeds.persons.push({ name: parts[0], role: parts[1] || null });
    input.value = '';
    renderSeedChips('person-seeds', seeds.persons, 'person');
  });

  // Form: Add org seed
  document.getElementById('add-seed-org')?.addEventListener('click', () => {
    const input = document.getElementById('seed-org-input');
    const val = input.value.trim();
    if (!val) return;
    seeds.orgs.push({ name: val });
    input.value = '';
    renderSeedChips('org-seeds', seeds.orgs, 'org');
  });

  // Enter key on inputs
  document.getElementById('seed-person-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('add-seed-person').click();
  });
  document.getElementById('seed-org-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('add-seed-org').click();
  });
  document.getElementById('org-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('run-assessment').click();
  });

  // Form: Run Assessment
  document.getElementById('run-assessment')?.addEventListener('click', async () => {
    const orgName = document.getElementById('org-name-input').value.trim();
    if (!orgName) {
      document.getElementById('org-name-input').focus();
      return;
    }

    // Build seeds array
    const allSeeds = [
      ...seeds.persons.map((s) => ({ name: s.name, type: 'person', role: s.role })),
      ...seeds.orgs.map((s) => ({ name: s.name, type: 'organization', role: null })),
    ];

    showLoading('Checking sanctions lists...');

    // Simulate step updates
    const steps = [
      'Checking sanctions lists...',
      'Building evidence list...',
      'Processing languages...',
      'Extracting entities...',
      'Building network graph...',
      'Scoring evidence...',
      'Assigning flag...',
      'Generating suggestions...',
    ];
    let stepIndex = 0;
    const stepInterval = setInterval(() => {
      stepIndex++;
      if (stepIndex < steps.length) {
        updateLoadingStep(steps[stepIndex]);
      }
    }, 3000);

    const assessment = await API.runAssessment(orgName, allSeeds);
    clearInterval(stepInterval);
    hideLoading();

    if (assessment.error) {
      showToast(assessment.message || 'Assessment failed');
      return;
    }

    state.currentAssessment = assessment;
    navigateTo('results');
  });
}

/**
 * Render seed chips in a container.
 */
function renderSeedChips(containerId, seedList, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = seedList.map((s, i) => `
    <span class="seed-chip">
      ${s.name}${s.role ? ` (${s.role})` : ''}
      <span class="remove-seed" data-index="${i}" data-type="${type}">&times;</span>
    </span>
  `).join('');

  container.querySelectorAll('.remove-seed').forEach((btn) => {
    btn.addEventListener('click', () => {
      seedList.splice(parseInt(btn.dataset.index), 1);
      renderSeedChips(containerId, seedList, type);
    });
  });
}
