// Lets the site be added to a Home Screen and opened with no network: registers the service worker
// (sw.js at the site root), which keeps a copy of every file. Every page loads this module.
//
// Opened as a Home Screen app, it also checks for a new version each time the app opens (and when it
// comes back after UPDATE_AFTER away), takes it at once, and says how that went in a small note at
// the top of the screen. A new version reloads the page once, unless the visitor has already started
// using it; then the note says it is ready for next time. In a browser tab none of this runs: the
// browser checks for itself on each visit, and the service worker gives the network's files first.
//
// A server on "localhost" runs without it, so that local work always shows the files on disk and
// the page tests see the network as before. tests/pwa/run.mjs serves on 127.0.0.1 to test it.
const SW = new URL('../sw.js', import.meta.url);
const UPDATE_AFTER = 15 * 60e3; // away this long counts as opening the app again
const RELOAD_WITHIN = 10e3;     // a new version this soon after opening reloads the page, if untouched
const KEY = 'pwa-update';       // sessionStorage: 'checked', or 'updated' just before the reload

let box = null, timer = 0; // the note, made on first use (see note() below)
const register = () => navigator.serviceWorker.register(SW, { updateViaCache: 'none' });
const app = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  if (app) watch();
  else if (document.readyState === 'complete') register().catch(() => {});
  else addEventListener('load', () => register().catch(() => {}), { once: true });
}

function watch() {
  const sw = navigator.serviceWorker, had = !!sw.controller;
  let opened = performance.now(), touched = false, checking = false, hidden = 0;
  for (const t of ['pointerdown', 'keydown', 'wheel']) addEventListener(t, () => { touched = true; }, { capture: true, passive: true });

  const said = read();
  if (said === 'updated') { note('Updated to the latest version'); write('checked'); }
  ready(() => (said ? register() : check()).catch(() => {}));

  addEventListener('visibilitychange', () => {
    if (document.hidden) { hidden = Date.now(); return; }
    if (hidden && Date.now() - hidden >= UPDATE_AFTER) { opened = performance.now(); touched = false; check(); }
  });

  async function check() {
    if (checking) return;
    checking = true;
    write('checked');
    try {
      if (!navigator.onLine) return note('Offline. Showing the saved copy.', true);
      const reg = await register();
      if (!had && !sw.controller) return; // the first visit: the page came from the network
      await within(reg.update(), 20e3);
      const w = reg.installing || reg.waiting;
      if (!w) return note('Up to date');
      if (await settled(w) !== 'activated') return note('Could not update. Showing the saved copy.', true);
      if (!touched && performance.now() - opened < RELOAD_WITHIN) { write('updated'); location.reload(); }
      else note('Update ready. Reopen the app to see it.');
    } catch {
      note(navigator.onLine ? 'Could not check for updates.' : 'Offline. Showing the saved copy.', true);
    } finally { checking = false; }
  }
}

// The state the new worker ends in: 'activated', or 'redundant' if it could not keep every file.
function settled(w) {
  return new Promise((res) => {
    const done = () => { if (w.state === 'activated' || w.state === 'redundant') res(w.state); };
    w.addEventListener('statechange', done); done();
  });
}

function within(p, ms) {
  return Promise.race([p, new Promise((_, no) => setTimeout(no, ms, new Error('timed out')))]);
}

function ready(f) {
  if (document.readyState === 'complete') f(); else addEventListener('load', f, { once: true });
}

function read() { try { return sessionStorage.getItem(KEY); } catch { return null; } }
function write(v) { try { sessionStorage.setItem(KEY, v); } catch { /* private mode: check again next time */ } }

// A small note at the top of the screen that goes away by itself. Styled through the CSSOM, which
// the pages' Content-Security-Policy allows, so that no page needs another stylesheet for it.
function note(text, warn = false) {
  if (!box) {
    box = document.createElement('div');
    box.className = 'pwa-note';
    box.setAttribute('role', 'status');
    Object.assign(box.style, {
      position: 'fixed', zIndex: '2147483647', left: '50%', top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
      transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
      padding: '7px 14px', borderRadius: '999px', font: '500 14px/1.3 system-ui, -apple-system, sans-serif',
      color: '#fff', background: 'rgba(24, 26, 32, 0.9)', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
      pointerEvents: 'none', userSelect: 'none', webkitUserSelect: 'none', textAlign: 'center', opacity: '0',
      transition: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'opacity .25s',
    });
    document.body.append(box);
  }
  box.style.border = warn ? '1px solid #f0b54a' : '1px solid transparent';
  clearTimeout(timer);
  requestAnimationFrame(() => { box.textContent = text; box.style.opacity = '1'; });
  timer = setTimeout(() => { box.style.opacity = '0'; }, warn ? 4000 : 2500);
}
