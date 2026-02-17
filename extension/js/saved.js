/**
 * Saved Assessments View — full list of all saved assessments
 */

/**
 * Render the saved assessments view.
 */
async function renderSaved() {
  const container = document.getElementById('view-saved');

  // Fetch latest list
  const list = await API.listAssessments();
  if (list.error) {
    container.innerHTML = `<div class="section-title">${getIcon('heart')} Saved Assessments</div>
      <div class="empty-state">${list.message || 'Could not load assessments'}</div>`;
    return;
  }

  state.assessmentList = list;

  if (list.length === 0) {
    container.innerHTML = `<div class="section-title">${getIcon('heart')} Saved Assessments</div>
      <div class="empty-state">No saved assessments yet.<br>Run your first assessment from the dashboard.</div>`;
    return;
  }

  // Sort by date (newest first)
  const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = `
    <div class="section-title">${getIcon('heart')} Saved Assessments</div>
    <div class="saved-list">
      ${sorted.map((a) => `
        <div class="neu-card neu-card--clickable saved-item mb-sm" data-filename="${a.filename}">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="flag-dot flag-dot--${a.flag}"></span>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.orgName}</div>
              <div class="text-xs text-muted">${formatDate(a.date)} &middot; ${getFlagLabel(a.flag)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Click to load
  container.querySelectorAll('.saved-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const filename = item.dataset.filename;
      showLoading('Loading assessment...');
      const assessment = await API.loadAssessment(filename);
      hideLoading();
      if (!assessment.error) {
        state.currentAssessment = assessment;
        navigateTo('results');
      } else {
        showToast(assessment.message || 'Failed to load');
      }
    });
  });
}
