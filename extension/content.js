/**
 * Koppla — Content Script (Floating Widget)
 *
 * Injects a small floating widget in the top-right corner of web pages.
 * Shows assessment status: spinning during analysis, flag color on completion.
 * Clicking expands to a compact overlay with summary info.
 *
 * All styles are inside Shadow DOM to avoid conflicts with host pages.
 */

(function () {
  // Don't inject on extension pages or about: pages
  if (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'about:') return;

  const FLAG_COLORS = { RED: '#E53E3E', YELLOW: '#D69E2E', GREEN: '#38A169', GREY: '#A0AEC0' };
  const FLAG_LABELS = { RED: 'Critical concerns', YELLOW: 'Requires attention', GREEN: 'No concerns found', GREY: 'Insufficient data' };

  let currentState = null;
  let overlayOpen = false;

  // === Create Shadow DOM Widget ===

  const host = document.createElement('div');
  host.id = 'koppla-widget-host';
  host.style.cssText = 'all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647; font-family: "Segoe UI", sans-serif;';

  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }

      #koppla-fab {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #1a6b54;
        color: white;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 2px 2px 8px rgba(0,0,0,0.2);
        font-weight: 700;
        font-size: 16px;
        position: relative;
        transition: transform 0.2s;
        user-select: none;
      }
      #koppla-fab:hover { transform: scale(1.1); }
      #koppla-fab.visible { display: flex; }

      @keyframes koppla-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(26, 107, 84, 0.4); }
        50% { box-shadow: 0 0 0 10px rgba(26, 107, 84, 0); }
      }
      #koppla-fab.running { animation: koppla-pulse 2s infinite; }

      #koppla-flag-dot {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid white;
        display: none;
      }

      #koppla-step {
        position: absolute;
        top: 46px;
        right: 0;
        background: rgba(45, 55, 72, 0.9);
        color: white;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s;
      }
      #koppla-step.visible { opacity: 1; }

      #koppla-overlay {
        position: absolute;
        top: 48px;
        right: 0;
        width: 280px;
        background: #e8eef1;
        border-radius: 16px;
        box-shadow: 5px 5px 10px #c5ccd3, -5px -5px 10px #f0f5f8;
        padding: 16px;
        font-size: 13px;
        color: #2d3748;
        display: none;
      }
      #koppla-overlay.visible { display: block; }

      .overlay-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .overlay-org {
        font-weight: 700;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 220px;
      }
      .overlay-close {
        background: none;
        border: none;
        cursor: pointer;
        color: #718096;
        font-size: 18px;
        line-height: 1;
        padding: 2px;
      }
      .overlay-close:hover { color: #2d3748; }

      .overlay-flag {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 10px;
        margin-bottom: 10px;
      }
      .flag-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .flag-text {
        font-weight: 600;
        font-size: 13px;
      }

      .overlay-reason {
        font-size: 12px;
        color: #718096;
        margin-bottom: 10px;
        line-height: 1.4;
      }

      .overlay-hint {
        font-size: 11px;
        color: #a0aec0;
        text-align: center;
      }

      .overlay-spinner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
      }
      .mini-spinner {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid #dfe6eb;
        border-top-color: #1a6b54;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .spinner-text {
        font-size: 12px;
        color: #718096;
      }
    </style>

    <div id="koppla-fab">
      K
      <div id="koppla-flag-dot"></div>
      <div id="koppla-step"></div>
    </div>
    <div id="koppla-overlay"></div>
  `;

  document.body.appendChild(host);

  // === Get DOM references ===

  const fab = shadow.getElementById('koppla-fab');
  const flagDot = shadow.getElementById('koppla-flag-dot');
  const stepEl = shadow.getElementById('koppla-step');
  const overlay = shadow.getElementById('koppla-overlay');

  // === Event Handlers ===

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    overlayOpen = !overlayOpen;
    if (overlayOpen) {
      renderOverlay();
      overlay.classList.add('visible');
      stepEl.classList.remove('visible');
    } else {
      overlay.classList.remove('visible');
    }
  });

  document.addEventListener('click', () => {
    if (overlayOpen) {
      overlayOpen = false;
      overlay.classList.remove('visible');
    }
  });

  // === State Display ===

  function updateWidget(state) {
    currentState = state;
    if (!state || state.status === 'idle') {
      fab.classList.remove('visible', 'running');
      flagDot.style.display = 'none';
      stepEl.classList.remove('visible');
      overlay.classList.remove('visible');
      overlayOpen = false;
      return;
    }

    fab.classList.add('visible');

    if (state.status === 'running') {
      fab.classList.add('running');
      flagDot.style.display = 'none';
      stepEl.textContent = state.currentStep || 'Processing...';
      if (!overlayOpen) stepEl.classList.add('visible');
    } else {
      fab.classList.remove('running');
      stepEl.classList.remove('visible');

      if (state.status === 'completed' && state.assessment) {
        const flag = state.assessment.flag?.flag || 'GREY';
        flagDot.style.display = 'block';
        flagDot.style.background = FLAG_COLORS[flag] || FLAG_COLORS.GREY;
      } else if (state.status === 'error') {
        flagDot.style.display = 'block';
        flagDot.style.background = FLAG_COLORS.RED;
      }
    }

    if (overlayOpen) renderOverlay();
  }

  function renderOverlay() {
    if (!currentState) return;

    if (currentState.status === 'running') {
      overlay.innerHTML = `
        <div class="overlay-header">
          <div class="overlay-org">${escapeHtml(currentState.orgName || '')}</div>
          <button class="overlay-close" id="overlay-close">&times;</button>
        </div>
        <div class="overlay-spinner">
          <div class="mini-spinner"></div>
          <div class="spinner-text">${escapeHtml(currentState.currentStep || 'Processing...')}</div>
        </div>
        <div class="overlay-hint">Assessment in progress...</div>
      `;
    } else if (currentState.status === 'completed' && currentState.assessment) {
      const a = currentState.assessment;
      const flag = a.flag?.flag || 'GREY';
      const reason = a.flag?.reason || '';
      const bgColors = { RED: '#FED7D7', YELLOW: '#FEFCBF', GREEN: '#C6F6D5', GREY: '#EDF2F7' };

      overlay.innerHTML = `
        <div class="overlay-header">
          <div class="overlay-org">${escapeHtml(a.orgName || '')}</div>
          <button class="overlay-close" id="overlay-close">&times;</button>
        </div>
        <div class="overlay-flag" style="background: ${bgColors[flag] || bgColors.GREY}">
          <div class="flag-dot" style="background: ${FLAG_COLORS[flag]}"></div>
          <div class="flag-text">${FLAG_LABELS[flag] || 'Unknown'}</div>
        </div>
        <div class="overlay-reason">${escapeHtml(reason)}</div>
        <div class="overlay-hint">Click the Koppla icon in the toolbar for full details</div>
      `;
    } else if (currentState.status === 'error') {
      overlay.innerHTML = `
        <div class="overlay-header">
          <div class="overlay-org">${escapeHtml(currentState.orgName || '')}</div>
          <button class="overlay-close" id="overlay-close">&times;</button>
        </div>
        <div class="overlay-reason" style="color: #E53E3E;">${escapeHtml(currentState.error || 'Assessment failed')}</div>
        <div class="overlay-hint">Click the Koppla icon in the toolbar to try again</div>
      `;
    }

    // Wire close button
    const closeBtn = shadow.getElementById('overlay-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        overlayOpen = false;
        overlay.classList.remove('visible');
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === Message Listening ===

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_CHANGED') {
      updateWidget(message.payload);
    }
  });

  // === Initial State Check ===

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) return; // Extension context invalid
    if (response) updateWidget(response);
  });
})();
