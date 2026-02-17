/**
 * Koppla — Background Service Worker
 *
 * Runs assessment API calls independently of the popup lifecycle.
 * Stores state in chrome.storage.local so the popup and content script
 * can recover progress or results at any time.
 *
 * Message protocol:
 *   START_ASSESSMENT  → { orgName, seeds }  — begin a new assessment
 *   GET_STATE         → (none)              — return current kopplaState
 *   CLEAR_STATE       → (none)              — reset to idle
 *   STATE_CHANGED     ← broadcast           — sent when state changes
 */

const STEPS = [
  'Checking sanctions lists...',
  'Searching web for public info...',
  'Building evidence list...',
  'Processing languages...',
  'Extracting entities...',
  'Building network graph...',
  'Scoring evidence...',
  'Assigning flag...',
  'Generating suggestions...',
  'Finalizing...',
];

const DEFAULT_STATE = {
  status: 'idle',
  orgName: null,
  seeds: [],
  startedAt: null,
  completedAt: null,
  assessment: null,
  error: null,
  currentStep: null,
};

// === State Management ===

async function getState() {
  const result = await chrome.storage.local.get(['kopplaState']);
  return result.kopplaState || { ...DEFAULT_STATE };
}

async function updateState(patch) {
  const current = await getState();
  const updated = { ...current, ...patch };
  await chrome.storage.local.set({ kopplaState: updated });
  broadcastState(updated);
  return updated;
}

function broadcastState(state) {
  // Send to popup (if open)
  try {
    chrome.runtime.sendMessage({ type: 'STATE_CHANGED', payload: state });
  } catch { /* popup not open */ }

  // Send to content scripts on active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'STATE_CHANGED', payload: state });
      } catch { /* tab not ready */ }
    }
  });
}

// === Badge Management ===

function updateBadge(status, flag) {
  if (status === 'running') {
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#1a6b54' });
  } else if (status === 'completed') {
    const colors = { RED: '#E53E3E', YELLOW: '#D69E2E', GREEN: '#38A169', GREY: '#A0AEC0' };
    const symbols = { RED: '!!', YELLOW: '!', GREEN: '✓', GREY: '?' };
    chrome.action.setBadgeText({ text: symbols[flag] || '✓' });
    chrome.action.setBadgeBackgroundColor({ color: colors[flag] || '#A0AEC0' });
  } else if (status === 'error') {
    chrome.action.setBadgeText({ text: 'X' });
    chrome.action.setBadgeBackgroundColor({ color: '#E53E3E' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// === Assessment Runner ===

async function runAssessmentInBackground(orgName, seeds) {
  // Get server URL from storage
  const settings = await chrome.storage.local.get(['serverUrl']);
  const baseUrl = settings.serverUrl || 'http://localhost:3777';

  await updateState({
    status: 'running',
    orgName,
    seeds,
    startedAt: new Date().toISOString(),
    completedAt: null,
    assessment: null,
    error: null,
    currentStep: STEPS[0],
  });
  updateBadge('running');

  // Simulate step progression while the API call is pending
  let stepIndex = 0;
  const stepTimer = setInterval(async () => {
    stepIndex++;
    if (stepIndex < STEPS.length) {
      await updateState({ currentStep: STEPS[stepIndex] });
    }
  }, 3000);

  try {
    const res = await fetch(`${baseUrl}/api/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName, seeds }),
    });

    clearInterval(stepTimer);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Server returned ${res.status}`);
    }

    const assessment = await res.json();

    await updateState({
      status: 'completed',
      completedAt: new Date().toISOString(),
      assessment,
      currentStep: null,
    });

    const flag = assessment.flag?.flag || 'GREY';
    updateBadge('completed', flag);

  } catch (err) {
    clearInterval(stepTimer);

    await updateState({
      status: 'error',
      error: err.message || 'Assessment failed',
      currentStep: null,
    });
    updateBadge('error');
  }
}

// === Message Handler ===

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_ASSESSMENT') {
    const { orgName, seeds } = message.payload;
    // Run in background — don't await
    runAssessmentInBackground(orgName, seeds || []);
    sendResponse({ started: true });
    return false;
  }

  if (message.type === 'GET_STATE') {
    getState().then((state) => sendResponse(state));
    return true; // async response
  }

  if (message.type === 'CLEAR_STATE') {
    updateState({ ...DEFAULT_STATE }).then(() => {
      updateBadge('idle');
      sendResponse({ cleared: true });
    });
    return true;
  }
});

// On install/update, clear stale state
chrome.runtime.onInstalled.addListener(async () => {
  await updateState({ ...DEFAULT_STATE });
  updateBadge('idle');
});
