/**
 * App Orchestrator — state management, view routing, initialization
 */

// === Application State ===
const state = {
  currentView: 'dashboard',
  currentAssessment: null,
  assessmentList: [],
  serverConnected: false,
};

// === View Routing ===
const VIEWS = ['dashboard', 'results', 'saved', 'settings'];

/**
 * Navigate to a view by name.
 */
function navigateTo(viewName) {
  // Hide all views
  VIEWS.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });

  // Show target view
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');

  state.currentView = viewName;

  // Update nav active state
  document.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Render the view
  switch (viewName) {
    case 'dashboard': renderDashboard(); break;
    case 'results': renderResults(state.currentAssessment); break;
    case 'saved': renderSaved(); break;
    case 'settings': renderSettings(); break;
  }

  // Scroll to top
  document.querySelector('.main-content')?.scrollTo(0, 0);
}

// === Loading Overlay ===
function showLoading(stepText) {
  const overlay = document.getElementById('loading-overlay');
  const stepEl = document.getElementById('loading-step-text');
  if (overlay) overlay.classList.remove('hidden');
  if (stepEl) stepEl.textContent = stepText || 'Loading...';
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function updateLoadingStep(stepText) {
  const stepEl = document.getElementById('loading-step-text');
  if (stepEl) stepEl.textContent = stepText;
}

// === Server Status ===
async function checkServerStatus() {
  const result = await API.checkHealth();
  state.serverConnected = !result.error;

  const dot = document.querySelector('#server-status .status-dot');
  const text = document.getElementById('server-status');
  if (dot) {
    dot.className = `status-dot ${state.serverConnected ? 'connected' : 'disconnected'}`;
  }
  if (text) {
    const statusText = state.serverConnected ? 'Server: Connected' : 'Server: Disconnected';
    text.innerHTML = `<span class="status-dot ${state.serverConnected ? 'connected' : 'disconnected'}"></span> ${statusText}`;
  }
}

// === Download & Share ===
function downloadAssessment() {
  if (!state.currentAssessment) return;

  const data = JSON.stringify(state.currentAssessment, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const name = `koppla-${(state.currentAssessment.orgName || 'assessment').toLowerCase().replace(/\s+/g, '-')}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Assessment downloaded');
}

function shareAssessment() {
  if (!state.currentAssessment) return;

  const a = state.currentAssessment;
  const flag = a.flag?.flag || 'UNKNOWN';
  const reason = a.flag?.reason || '';
  const date = formatDate(a.assessedAt);

  const text = `Koppla Assessment: ${a.orgName}\nFlag: ${flag} — ${getFlagLabel(flag)}\nReason: ${reason}\nAssessed: ${date}`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard');
  }).catch(() => {
    showToast('Copy failed');
  });
}

// === Initialization ===
async function init() {
  // Load saved server URL from chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['serverUrl'], (result) => {
      if (result.serverUrl) API.setBaseUrl(result.serverUrl);
      startApp();
    });
  } else {
    startApp();
  }
}

async function startApp() {
  // Check server
  await checkServerStatus();

  // Recover state from background service worker
  await recoverState();

  // Listen for state changes from service worker
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'STATE_CHANGED') {
        handleStateChange(message.payload);
      }
    });
  }

  // Set up header menu
  const menuToggle = document.getElementById('menu-toggle');
  const menuDropdown = document.getElementById('menu-dropdown');

  menuToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    menuDropdown?.classList.add('hidden');
  });

  document.getElementById('menu-minimize')?.addEventListener('click', () => window.close());
  document.getElementById('menu-settings')?.addEventListener('click', () => {
    menuDropdown?.classList.add('hidden');
    navigateTo('settings');
  });

  // Bottom nav
  document.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  document.getElementById('btn-download')?.addEventListener('click', downloadAssessment);
  document.getElementById('btn-share')?.addEventListener('click', shareAssessment);

  // Navigate based on recovered state
  if (state.currentAssessment) {
    navigateTo('results');
  } else {
    navigateTo('dashboard');
  }
}

// === State Recovery from Service Worker ===

async function recoverState() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve();
        return;
      }

      if (response.status === 'completed' && response.assessment) {
        state.currentAssessment = response.assessment;
      } else if (response.status === 'running') {
        showLoading(response.currentStep || 'Assessment in progress...');
      }

      resolve();
    });
  });
}

function handleStateChange(kopplaState) {
  if (kopplaState.status === 'running') {
    showLoading(kopplaState.currentStep || 'Processing...');
  } else if (kopplaState.status === 'completed' && kopplaState.assessment) {
    hideLoading();
    state.currentAssessment = kopplaState.assessment;
    navigateTo('results');
  } else if (kopplaState.status === 'error') {
    hideLoading();
    showToast(kopplaState.error || 'Assessment failed');
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
