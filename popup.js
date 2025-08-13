const els = {
  from: document.getElementById('from'),
  to: document.getElementById('to'),
  doDelete: document.getElementById('doDelete'),
  doUndoRepost: document.getElementById('doUndoRepost'),
  limit: document.getElementById('limit'),
  start: document.getElementById('start'),
  stop: document.getElementById('stop'),
  status: document.getElementById('status'),
  countUndo: document.getElementById('countUndo'),
  countDelete: document.getElementById('countDelete'),
  countRemaining: document.getElementById('countRemaining'),
  progressBar: document.getElementById('progressBar')
};

const state = { limit: 0, undo: 0, del: 0 };

function setStatus(msg){ els.status.textContent = msg; }

function updateCounters(processed){
  const total = processed != null ? processed : (state.undo + state.del);
  const rem = Math.max(0, Math.max(state.limit, 0) - total);
  if(els.countUndo) els.countUndo.textContent = String(state.undo);
  if(els.countDelete) els.countDelete.textContent = String(state.del);
  if(els.countRemaining) els.countRemaining.textContent = String(rem);
  if(els.progressBar){
    const denom = state.limit > 0 ? state.limit : 1;
    const pct = Math.max(0, Math.min(100, (total / denom) * 100));
    els.progressBar.style.width = pct.toFixed(1) + '%';
  }
}

(async function init(){
  const saved = await chrome.storage.local.get(['omit_from','omit_to','omit_doDelete','omit_doUndo','omit_limit','omit_running']);
  if(saved.omit_from) els.from.value = saved.omit_from;
  if(saved.omit_to) els.to.value = saved.omit_to;
  els.doDelete.checked = saved.omit_doDelete ?? true;
  els.doUndoRepost.checked = saved.omit_doUndo ?? true;
  els.limit.value = saved.omit_limit ?? 50;
  state.limit = Math.min(50, Math.max(1, Number(els.limit.value)||50));
  state.undo = 0; state.del = 0; updateCounters(0);
  setStatus(saved.omit_running ? 'Running… Open your profile tab.' : 'Ready');
})();

async function getActiveTab(){
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
}

async function persist(){
  await chrome.storage.local.set({
    omit_from: els.from.value,
    omit_to: els.to.value,
    omit_doDelete: els.doDelete.checked,
    omit_doUndo: els.doUndoRepost.checked,
    omit_limit: Math.min(50, Math.max(1, Number(els.limit.value)||50))
  });
}

els.start.addEventListener('click', async () => {
  await persist();
  // Reset counters based on current limit input
  state.limit = Math.min(50, Math.max(1, Number(els.limit.value)||50));
  state.undo = 0; state.del = 0; updateCounters(0);

  const tab = await getActiveTab();
  if(!tab) return setStatus('No active tab');
  chrome.tabs.sendMessage(tab.id, {type: 'OMIT_START'});
  await chrome.storage.local.set({omit_running: true});
  setStatus('Started');
});

els.stop.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if(tab) chrome.tabs.sendMessage(tab.id, {type: 'OMIT_STOP'});
  await chrome.storage.local.set({omit_running: false});
  setStatus('Stopped');
});

function openPicker(input){
  try{
    if(typeof input.showPicker === 'function'){
      input.showPicker();
      return;
    }
  }catch(_){ /* ignore */ }
  // Fallback
  input.focus();
  input.click();
}

document.getElementById('fromCal')?.addEventListener('click', () => openPicker(els.from));

document.getElementById('toCal')?.addEventListener('click', () => openPicker(els.to));

chrome.runtime.onMessage.addListener((msg) => {
  if(msg.type === 'OMIT_PROGRESS'){
    setStatus(msg.text);
    // Optionally detect done to finalize remaining/progress
    const m = /Done\. Processed (\d+)/i.exec(msg.text || '');
    if(m){
      const processed = Number(m[1]);
      updateCounters(isNaN(processed) ? undefined : processed);
    }
  } else if(msg.type === 'OMIT_COUNTER'){
    if(msg.action === 'undo') state.undo += 1;
    if(msg.action === 'delete') state.del += 1;
    const processed = Number(msg.processed);
    updateCounters(isNaN(processed) ? undefined : processed);
  }
});
