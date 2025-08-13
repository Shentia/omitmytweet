// Content script that runs on twitter.com/x.com
// Automates deleting posts or undoing reposts on the user's profile within a date range.

(function(){
  const STATE = { running: false, processed: 0 };

  function log(msg){
    chrome.runtime.sendMessage({type:'OMIT_LOG', text: msg});
    console.debug('[OmitMyTweet]', msg);
  }

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function smartClick(el){
    try{
      if(!el) return false;
      el.scrollIntoView({block:'center', inline:'center'});
      await sleep(50);
      const rect = el.getBoundingClientRect();
      if(rect.width === 0 || rect.height === 0) {
        // try to click anyway
        el.click?.();
        return true;
      }
      const cx = rect.left + Math.min(rect.width - 1, Math.max(1, rect.width/2));
      const cy = rect.top + Math.min(rect.height - 1, Math.max(1, rect.height/2));
      const opts = {bubbles:true, cancelable:true, composed:true, view:window, clientX:cx, clientY:cy};
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      // fallback
      el.click?.();
      return true;
    }catch(e){
      console.warn('smartClick error', e);
      try{ el.click?.(); return true; } catch(_) { return false; }
    }
  }

  function parseISODateFromNode(node){
    // Tweets have <time datetime="2025-06-13T10:31:27.000Z">Jun 13</time>
    const time = node.querySelector('time');
    if(!time) return null;
    const dt = time.getAttribute('datetime');
    if(!dt) return null;
    const d = new Date(dt);
    return isNaN(d.getTime()) ? null : d;
  }

  function withinRange(date, from, to){
    if(!date) return false;
    return date >= from && date <= to;
  }

  function isUndoRepostButton(btn){
    if(!btn) return false;
    const testid = btn.getAttribute('data-testid');
    if(testid === 'unretweet') return true;
    // aria-label may vary; attempt fuzzy match
    const al = (btn.getAttribute('aria-label') || '').toLowerCase();
    if(/undo\s*(repost|retweet)/.test(al)) return true;
    // Fallback by green color from provided screenshot
    const styleColor = btn.style && btn.style.color;
    return styleColor && styleColor.includes('rgb(0, 186, 124)');
  }

  function getAllVisibleTweets(){
    // Tweet/article containers typically have role="article"
    return Array.from(document.querySelectorAll('article[role="article"]'));
  }

  function isOwnProfile(){
    // Heuristic: presence of profile header with aria-label starting with "Profile"
    // and page path is /<handle>. This is best-effort.
    return /^https?:\/\/(x\.com|twitter\.com)\/[^\/?#]+(\/with_replies|$)/.test(location.href);
  }

  async function clickMoreAndDelete(container){
    // Find the top-right more button (three dots). Often data-testid="caret"
    const more = container.querySelector('[data-testid="caret"], [aria-label="More"], [aria-label="More options"], div[role="button"][aria-haspopup="menu"]');
    if(!more){ return false; }
    await smartClick(more);
    await sleep(250);

    // Now find Delete menu item (by text content) within the opened menu/dialog attached to body.
    const menuSelector = 'div[role="menu"], div[role="dialog"]';
    let tries = 20;
    let menu;
    while(tries-- > 0 && !(menu = document.querySelector(menuSelector))){
      await sleep(100);
    }
    if(!menu) return false;

    const deleteItem = Array.from(menu.querySelectorAll('[role="menuitem"], div[role="button"], button'))
      .find(n => /\bdelete\b/i.test(n.textContent || '') || (n.getAttribute('aria-label')||'').toLowerCase() === 'delete');
    if(!deleteItem) return false;
    await smartClick(deleteItem);
    await sleep(250);

    // Confirm dialog
    let confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"], [data-testid="tweetDeleteConfirm"]');
    if(!confirmBtn){
      confirmBtn = Array.from(document.querySelectorAll('div[role="button"], button'))
        .find(n => /\bdelete\b/i.test(n.textContent || ''));
    }
    if(confirmBtn){
      await smartClick(confirmBtn);
      await sleep(700);
      return true;
    }
    return false;
  }

  async function clickUndoRepost(container){
    // Prefer explicit data-testid first
    let btn = container.querySelector('[data-testid="unretweet"]');
    if(!btn){
      btn = Array.from(container.querySelectorAll('button, div[role="button"]')).find(b => isUndoRepostButton(b));
    }
    if(!btn) return false;

    await smartClick(btn);
    await sleep(250);

    // X often shows a confirmation sheet; confirm if present
    let confirm = document.querySelector('[data-testid="unretweetConfirm"], [data-testid="confirmationSheetConfirm"]');
    if(!confirm){
      confirm = Array.from(document.querySelectorAll('div[role="button"], button'))
        .find(n => /(undo\s*(repost|retweet))/i.test(n.textContent || ''));
    }
    if(confirm){
      await smartClick(confirm);
      await sleep(500);
    }
    return true;
  }

  function sendCounter(action, processed, limit){
    try{ chrome.runtime.sendMessage({type:'OMIT_COUNTER', action, processed, limit}); }catch(_){/*no-op*/}
  }

  async function processTimeline({from, to, doDelete, doUndo, limit}){
    STATE.running = true;
    STATE.processed = 0;

    if(!isOwnProfile()){
      log('Open your own profile timeline before starting.');
      STATE.running = false; return;
    }

    log(`Working from ${from.toISOString().slice(0,10)} to ${to.toISOString().slice(0,10)}. Limit ${limit}.`);

    // Main loop: keep scanning until limit reached or no more items in range.
    let lastHeight = -1; let idlePasses = 0;
    while(STATE.running && STATE.processed < limit && idlePasses < 8){
      const tweets = getAllVisibleTweets();
      let actedThisPass = 0;

      for(const tw of tweets){
        if(!STATE.running || STATE.processed >= limit) break;
        const d = parseISODateFromNode(tw);
        if(!d) continue;
        if(d < from) { idlePasses = 8; break; } // Past range; likely older than target
        if(!withinRange(d, from, to)) continue;

        if(doUndo && await clickUndoRepost(tw)){
          STATE.processed++; actedThisPass++;
          log(`Undo repost ${STATE.processed}/${limit}`);
          sendCounter('undo', STATE.processed, limit);
          await sleep(500);
          continue;
        }
        if(doDelete && await clickMoreAndDelete(tw)){
          STATE.processed++; actedThisPass++;
          log(`Deleted ${STATE.processed}/${limit}`);
          sendCounter('delete', STATE.processed, limit);
          await sleep(700);
          continue;
        }
      }

      if(STATE.processed >= limit) break;

      // Scroll to load more
      const sc = document.scrollingElement || document.documentElement;
      window.scrollBy(0, Math.round(window.innerHeight * 0.9));
      await sleep(600);

      const h = sc.scrollHeight;
      if(h === lastHeight && actedThisPass === 0){
        idlePasses++;
      } else {
        idlePasses = 0;
        lastHeight = h;
      }
    }

    log(`Done. Processed ${STATE.processed} item(s).`);
    STATE.running = false;
    chrome.storage.local.set({omit_running:false});
  }

  function parseDateInput(dstr){
    // dstr = yyyy-mm-dd from <input type=date>
    if(!dstr) return null;
    const [y,m,d] = dstr.split('-').map(Number);
    if(!y||!m||!d) return null;
    // Interpret as local date, convert to start/end of day in UTC
    return new Date(Date.UTC(y, m-1, d));
  }

  async function start(){
    if(STATE.running) return;
    const {omit_from, omit_to, omit_doDelete, omit_doUndo, omit_limit} = await chrome.storage.local.get(['omit_from','omit_to','omit_doDelete','omit_doUndo','omit_limit']);
    const from = parseDateInput(omit_from);
    const toStart = parseDateInput(omit_to);
    if(!from || !toStart){
      log('Please set both From and To dates in the extension popup.');
      return;
    }
    // End of the To day (23:59:59.999)
    const to = new Date(toStart.getTime() + 24*3600*1000 - 1);

    const limit = Math.min(50, Math.max(1, Number(omit_limit)||50));
    await processTimeline({from, to, doDelete: !!omit_doDelete, doUndo: !!omit_doUndo, limit});
  }

  function stop(){ STATE.running = false; log('Stopping…'); }

  chrome.runtime.onMessage.addListener((msg) => {
    if(msg.type === 'OMIT_START') start();
    if(msg.type === 'OMIT_STOP') stop();
  });
})();
