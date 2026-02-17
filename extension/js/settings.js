/**
 * Settings View — server URL config, connection test
 */

/**
 * Render the settings view.
 */
function renderSettings() {
  const container = document.getElementById('view-settings');

  container.innerHTML = `
    <div class="section-title">${getIcon('settings')} Settings</div>

    <div class="neu-card mb-md">
      <div class="form-group">
        <label for="settings-server-url">API Server URL</label>
        <input type="text" class="neu-input" id="settings-server-url" value="${API.baseUrl}" placeholder="http://localhost:3777">
      </div>
      <div class="form-actions">
        <button class="neu-btn" id="settings-test">Test Connection</button>
        <button class="neu-btn neu-btn--primary" id="settings-save">Save</button>
      </div>
      <div id="settings-status" class="mt-sm text-sm"></div>
    </div>

    <div class="neu-card">
      <div style="font-weight:600;margin-bottom:8px;">About</div>
      <div class="text-sm text-muted">
        Koppla v3.0<br>
        Values Assessment Tool<br><br>
        To start the server, run:<br>
        <code style="background:var(--bg-secondary);padding:2px 6px;border-radius:4px;font-size:12px;">npm run server</code>
      </div>
    </div>
  `;

  // Test connection
  document.getElementById('settings-test')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('settings-status');
    statusEl.textContent = 'Testing...';
    statusEl.style.color = 'var(--text-secondary)';

    const url = document.getElementById('settings-server-url').value.trim();
    const oldUrl = API.baseUrl;
    API.setBaseUrl(url);

    const result = await API.checkHealth();
    if (result.error) {
      statusEl.innerHTML = '<span style="color:var(--flag-red)">Disconnected — server not reachable</span>';
      API.setBaseUrl(oldUrl); // Revert
    } else {
      statusEl.innerHTML = `<span style="color:var(--flag-green)">Connected — Koppla v${result.version}</span>`;
    }
  });

  // Save settings
  document.getElementById('settings-save')?.addEventListener('click', () => {
    const url = document.getElementById('settings-server-url').value.trim();
    API.setBaseUrl(url);
    // Save to chrome.storage if available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ serverUrl: url });
    }
    showToast('Settings saved');
  });
}
