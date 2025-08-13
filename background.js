function drawIcon(size){
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = '#0c0c14';
  ctx.fillRect(0, 0, size, size);
  // Gradient circle
  const grd = ctx.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, '#6e56cf');
  grd.addColorStop(1, '#2ec4ff');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size*0.36, 0, Math.PI*2);
  ctx.fill();
  // White ring (O)
  ctx.lineWidth = Math.max(2, size*0.08);
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size*0.22, 0, Math.PI*2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return canvas.transferToImageBitmap();
}

async function setActionIcons(){
  try{
    const sizes = [16, 32, 48, 128];
    const map = {};
    for(const s of sizes){
      map[String(s)] = await drawIcon(s);
    }
    await chrome.action.setIcon({imageData: map});
  }catch(_){ /* OffscreenCanvas not available in some builds; ignore */ }
}

chrome.runtime.onInstalled.addListener(() => {
  setActionIcons();
});
chrome.runtime.onStartup?.addListener?.(() => {
  setActionIcons();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(!msg || typeof msg.type !== 'string') return;
  if(msg.type === 'OMIT_LOG'){
    chrome.runtime.sendMessage({type:'OMIT_PROGRESS', text: msg.text});
    return;
  }
  if(msg.type.startsWith('OMIT_')){
    // Forward any structured OMIT_* messages to the extension UI (popup)
    chrome.runtime.sendMessage(msg);
  }
});
