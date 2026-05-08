/* global browser */

document.addEventListener('DOMContentLoaded', async () => {
  const slider = document.getElementById('wpm-slider');
  const wpmDisplay = document.getElementById('wpm-display');
  const startBtn = document.getElementById('start-btn');
  const statusBar = document.getElementById('status-bar');
  const radioPage = document.getElementById('radio-page');
  const radioSelection = document.getElementById('radio-selection');

  // Restore saved WPM
  const stored = await browser.storage.local.get('wpm');
  const savedWpm = stored.wpm || 300;
  slider.value = savedWpm;
  wpmDisplay.textContent = savedWpm;
  slider.setAttribute('aria-valuenow', savedWpm);

  slider.addEventListener('input', () => {
    const val = parseInt(slider.value, 10);
    wpmDisplay.textContent = val;
    slider.setAttribute('aria-valuenow', val);
    browser.storage.local.set({ wpm: val });
  });

  // Query active tab and ping content script
  let currentState = null;
  let activeTab = null;

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
    currentState = await browser.tabs.sendMessage(activeTab.id, { action: 'ping' });
  } catch {
    showStatus('Cannot run on this page type.', 'error');
    startBtn.disabled = true;
    return;
  }

  updateUI(currentState);

  startBtn.addEventListener('click', async () => {
    if (!activeTab) return;

    const wpmVal = parseInt(slider.value, 10);
    const source = radioSelection.checked ? 'selection' : 'page';

    try {
      if (currentState && currentState.active) {
        if (currentState.paused) {
          currentState = await browser.tabs.sendMessage(activeTab.id, { action: 'resume' });
        } else {
          currentState = await browser.tabs.sendMessage(activeTab.id, { action: 'pause' });
        }
        updateUI(currentState);
      } else {
        await browser.tabs.sendMessage(activeTab.id, { action: 'start', wpm: wpmVal, source });
        window.close();
      }
    } catch {
      showStatus('Lost connection to the page. Please reload.', 'error');
    }
  });
});

function updateUI(state) {
  const startBtn = document.getElementById('start-btn');

  if (!state || !state.active) {
    startBtn.textContent = 'Start Reading';
    startBtn.classList.remove('running');
    hideStatus();
  } else if (state.paused) {
    startBtn.textContent = 'Resume';
    startBtn.classList.add('running');
    showStatus(`Paused at word ${state.wordIndex} of ${state.totalWords}`);
  } else {
    startBtn.textContent = 'Pause';
    startBtn.classList.add('running');
    showStatus(`Reading: ${state.wordIndex} / ${state.totalWords} words`);
  }
}

function showStatus(msg, type = 'info') {
  const bar = document.getElementById('status-bar');
  bar.textContent = msg;
  bar.classList.remove('hidden', 'error');
  if (type === 'error') bar.classList.add('error');
}

function hideStatus() {
  document.getElementById('status-bar').classList.add('hidden');
}
