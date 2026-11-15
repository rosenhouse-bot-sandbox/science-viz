// Xbox controller support, shared by every page (the one module that is). It reads the pad once a
// frame and turns it into three things: a ring that moves between the page's own controls, calls into
// the page for what only the page can do (its camera, its zoom, its scales), and a picture of the pad
// that says what each button does here. Nothing is added to the page until a pad connects.
//
//   gamepad({
//     look: { label, move(x, y, dt) },      right stick, each axis -1 to 1 (up is y < 0), every frame it is off centre
//     look: { label, step(dx, dy) },        or, in place of move: one call per flick, repeating while held
//     zoom: { label: [out, in], move(v, dt) },   right trigger minus left trigger, -1 to 1
//     prev: { label, press() }, next: { label, press() },      the bumpers
//     back() { return true if B was used up },                   before B falls back to the page's back link
//   })
// A label may be a function, called when the picture is opened.

const DEAD = 0.18;                  // a stick this close to centre is at rest
const FLICK = 0.55, REST = 0.35;    // a stick counts as pushed a way past the first, and let go inside the second
const FIRST = 0.38, AGAIN = 0.14;   // seconds before a held direction repeats, and between repeats
const SMOOTH = 0.06;                // seconds over which the sticks and triggers are eased
const BTN = { a: 0, b: 1, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, up: 12, down: 13, left: 14, right: 15 };
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';
const HUB = 'gamepad-hub';
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// A page opened from the Deck (…?from=deck) remembers where it came from, so that Menu can go back
// there from any page of the site. The address to return to is the one the browser reports, never
// one read from the link.
try {
  if (new URLSearchParams(location.search).get('from') === 'deck') {
    sessionStorage.setItem(HUB, JSON.stringify({ url: /^https?:\/\//.test(document.referrer) ? document.referrer : '', len: history.length }));
  }
} catch { /* no storage: Menu does nothing */ }
function hub() { try { return JSON.parse(sessionStorage.getItem(HUB)); } catch { return null; } }

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
const svg = (tag, attrs, text) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) el.setAttribute(k, attrs[k]); if (text) el.textContent = text; return el; };

// ---- which controls there are, and which one lies in a direction ----
// A tick box is drawn by its label, so the ring goes round the label.
function rectOf(el) {
  const label = el.localName === 'input' && (el.type === 'checkbox' || el.type === 'radio') ? el.closest('label') : null;
  return (label || el).getBoundingClientRect();
}
function usable(el) {
  if (el.disabled || el.tabIndex < 0 || el.localName === 'canvas' || el.type === 'hidden' || el.closest('[inert], .gp')) return false;
  if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false;
  const r = rectOf(el);
  return r.width > 0 && r.height > 0;
}
function candidates() {
  return [...(document.querySelector('dialog[open]') || document).querySelectorAll(FOCUSABLE)].filter(usable);
}
// The box an element scrolls in, if it is in one.
function scroller(el) {
  for (let s = el.parentElement; s; s = s.parentElement) if (/auto|scroll/.test(getComputedStyle(s).overflowY)) return s;
  return null;
}
// Most pages here are one fixed screen. Only a page that scrolls as a whole may be scrolled as a whole.
const pageScrolls = () => ![document.documentElement, document.body].some((el) => /hidden|clip/.test(getComputedStyle(el).overflowY));
// Is this control held in place while the rest of its panel scrolls under it (a bar stuck to the foot)?
function pinned(el, box = scroller(el)) {
  for (let p = el; p && p !== box; p = p.parentElement) if (/sticky|fixed/.test(getComputedStyle(p).position)) return box ? p : null;
  return null;
}
// The nearest control whose near edge is past this one's far edge in the direction pressed. One that
// lines up with this one (overlaps it across the direction) wins over any that does not. Controls
// that scroll are a column of their own: from one of them the ring goes to a bar pinned over that
// column only when the column has nothing further that way, since the bar may be covering what does.
function neighbour(from, dir, list = candidates()) {
  if (!pinned(from)) { const flow = list.filter((el) => !pinned(el)), to = nearest(from, dir, flow); if (to) return to; }
  return nearest(from, dir, list);
}
function nearest(from, dir, list) {
  const c = rectOf(from), across = dir === 'left' || dir === 'right', fwd = dir === 'right' || dir === 'down';
  let best = null, least = Infinity;
  for (const el of list) {
    if (el === from) continue;
    const r = rectOf(el);
    const gap = across ? (fwd ? r.left - c.right : c.left - r.right) : (fwd ? r.top - c.bottom : c.top - r.bottom);
    if (gap < -2) continue;
    const lo = across ? Math.max(r.top, c.top) : Math.max(r.left, c.left), hi = across ? Math.min(r.bottom, c.bottom) : Math.min(r.right, c.right);
    const off = Math.abs(across ? r.top + r.bottom - c.top - c.bottom : r.left + r.right - c.left - c.right) / 2;
    const score = hi > lo ? Math.max(0, gap) + off / 1000 : 1e6 + Math.max(0, gap) + 2 * off;
    if (score < least) { least = score; best = el; }
  }
  return best;
}
const isRange = (el) => el?.localName === 'input' && el.type === 'range';
const isSelect = (el) => el?.localName === 'select';
// Left and right on these change the control itself, so they never move the ring off it.
const keeps = (el, dir) => (isRange(el) || isSelect(el)) && (dir === 'left' || dir === 'right');

// ---- the pad ----
function stick(x = 0, y = 0) {
  const m = Math.hypot(x, y); if (m < DEAD) return [0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) ** 2 / m;      // squared: fine control near the centre
  return [x * k, y * k];
}
const flick = (x, y, was) => {      // a stick as one of four directions, or none
  const m = Math.hypot(x, y); if (m < (was ? REST : FLICK)) return '';
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
};
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export function gamepad(map = {}) {
  if (!navigator.getGamepads) return;
  let raf = 0, last = 0, ui = null, cur = null, ringOn = false, help = false, ringBox = '';
  let was = null, fresh = true;                       // the buttons as they were last frame
  let held = '', heldFor = 0, nextAt = 0, carry = 0, moved = null;      // the direction held, and what it has done to a slider
  let rHeld = '', rFor = 0, rNext = 0;
  let ringFor = null, ringIn = null;                  // the ringed control, and the panel it scrolls in
  const ease = { rx: 0, ry: 0, z: 0 };

  const label = (l) => (typeof l === 'function' ? l() : l);
  const backLink = () => document.querySelector('a.back[href]');
  // What each part of the pad does on this screen, as the picture shows it. A part left out does nothing.
  function keys() {
    const k = { move: 'Move the ring between controls. On a slider, left and right change it.', a: 'Press the ringed control' };
    if (map.look) k.rs = label(map.look.label);
    if (map.zoom) { const z = label(map.zoom.label) || ['Zoom out', 'Zoom in']; k.lt = z[0]; k.rt = z[1]; }
    if (map.prev) k.lb = label(map.prev.label);
    if (map.next) k.rb = label(map.next.label);
    const b = document.querySelector('dialog[open]') ? 'Close' : label(map.backLabel) || backLink()?.getAttribute('aria-label');
    if (b) k.b = b;
    k.view = help ? 'Hide this picture' : 'Show what the buttons do';
    if (hub()) k.menu = 'Back to the Deck';
    return k;
  }

  // ---- what is added to the page, once a pad connects ----
  function build() {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('../../css/gamepad.css', import.meta.url).href });
    document.head.append(css);
    const ring = h('div', 'gp gp-ring'); ring.hidden = true;
    const hint = h('p', 'gp gp-hint', 'Controller connected. Press View to see what the buttons do.'); hint.setAttribute('role', 'status');
    const box = h('div', 'gp gp-help'); box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'What the controller does on this screen');
    const card = h('div', 'gp-card'), left = h('ul', 'gp-keys'), right = h('ul', 'gp-keys');
    const row = (k, name) => { const li = h('li'); li.dataset.k = k; li.append(h('b', '', name), h('span')); return li; };
    left.append(row('lt', 'LT'), row('lb', 'LB'), row('move', 'Left stick · D-pad'), row('view', 'View'));
    right.append(row('rt', 'RT'), row('rb', 'RB'), row('a', 'A'), row('b', 'B'), row('rs', 'Right stick'), row('menu', 'Menu'));
    // The pad, drawn from the front. Each part carries the name of what it does (data-k).
    const pic = svg('svg', { viewBox: '0 0 360 232', class: 'gp-pad', 'aria-hidden': 'true' });
    const part = (k, shape, attrs, text, tx, ty) => { const g = svg('g', { 'data-k': k }); g.append(svg(shape, attrs)); if (text) g.append(svg('text', { x: tx, y: ty, 'text-anchor': 'middle' }, text)); pic.append(g); };
    part('lt', 'rect', { x: 62, y: 4, width: 52, height: 20, rx: 7 }, 'LT', 88, 18);
    part('rt', 'rect', { x: 246, y: 4, width: 52, height: 20, rx: 7 }, 'RT', 272, 18);
    part('lb', 'rect', { x: 50, y: 27, width: 78, height: 16, rx: 7 }, 'LB', 89, 39);
    part('rb', 'rect', { x: 232, y: 27, width: 78, height: 16, rx: 7 }, 'RB', 271, 39);
    pic.append(svg('path', { class: 'gp-body', d: 'M70 44H290Q328 44 338 92L355 188Q360 226 330 224Q308 222 290 192L272 164H88L70 192Q52 222 30 224Q0 226 5 188L22 92Q32 44 70 44Z' }));
    part('move', 'circle', { cx: 100, cy: 92, r: 21 }, 'L', 100, 97);
    part('move', 'path', { d: 'M132 120h16v12h12v16h-12v12h-16v-12h-12v-16h12z' });
    part('rs', 'circle', { cx: 222, cy: 140, r: 21 }, 'R', 222, 145);
    part('view', 'circle', { cx: 160, cy: 92, r: 7 });
    part('menu', 'circle', { cx: 200, cy: 92, r: 7 });
    part('a', 'circle', { cx: 264, cy: 113, r: 11 }, 'A', 264, 118);
    part('b', 'circle', { cx: 286, cy: 92, r: 11 }, 'B', 286, 97);
    pic.append(svg('circle', { class: 'gp-idle', cx: 242, cy: 92, r: 11 }), svg('circle', { class: 'gp-idle', cx: 264, cy: 71, r: 11 }));
    card.append(left, pic, right); box.append(card);
    document.body.append(ring, hint, box);
    setTimeout(() => hint.remove(), 7000);
    ui = { ring, hint, box };
    addEventListener('pointerdown', () => { ringOn = false; }, true);       // a mouse or a finger takes over: the ring goes
    addEventListener('focusin', (e) => { if (e.target !== cur && e.target instanceof Element && e.target.matches(FOCUSABLE) && usable(e.target)) cur = e.target; });
    addEventListener('keydown', (e) => { if (help && e.key === 'Escape') showHelp(false); });
  }
  // A dialog opened as a modal covers the whole page, so what is shown over it has to be inside it.
  function layer(el) { const top = document.querySelector('dialog[open]') || document.body; if (el.parentNode !== top) top.append(el); }
  function showHelp(on) {
    help = on; ui.hint.remove();
    if (on) {
      layer(ui.box);
      const k = keys();
      for (const el of ui.box.querySelectorAll('[data-k]')) {
        const text = k[el.dataset.k];
        if (el.localName === 'li') { el.hidden = !text; el.lastChild.textContent = text || ''; } else el.classList.toggle('on', !!text);
      }
    }
    ui.box.hidden = !on;
  }

  // ---- the ring ----
  function start() {
    const list = candidates();
    return (document.activeElement && list.includes(document.activeElement) && document.activeElement)
      || (map.start && list.find((el) => el.matches(map.start))) || list.find((el) => el.matches('.primary'))
      || list.find((el) => !el.matches('.back')) || list[0] || null;
  }
  function settle() { if (moved) { moved.dispatchEvent(new Event('change', { bubbles: true })); moved = null; } carry = 0; }
  function ringTo(el) {
    settle(); cur = el; ringOn = true;
    el.focus({ preventScroll: true });
    // Bring it into view by scrolling the panel it is in, and nothing else. (scrollIntoView would also
    // shift a page that is not meant to scroll at all.)
    const box = scroller(el);
    if (!box) { if (pageScrolls()) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
    let r = rectOf(el); const m = box.getBoundingClientRect();
    const dy = r.top < m.top + 8 ? r.top - m.top - 8 : r.bottom > m.bottom - 8 ? r.bottom - m.bottom + 8 : 0;
    if (dy) { box.scrollBy({ top: dy, behavior: 'instant' }); r = rectOf(el); }
    // In view, but perhaps under a bar pinned over the panel: scroll it clear of the bar.
    const over = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const bar = over && box.contains(over) && !pinned(el, box) && pinned(over, box);
    if (bar) { const b = bar.getBoundingClientRect(); box.scrollBy({ top: b.top > (m.top + m.bottom) / 2 ? r.bottom - b.top + 12 : r.top - b.bottom - 12, behavior: 'instant' }); }
  }
  // The ringed control may have been taken away by the page (another scale has other controls).
  function hold() {
    if (cur && (!cur.isConnected || !usable(cur))) { settle(); cur = null; }
    if (!cur && ringOn) { cur = start(); if (!cur) ringOn = false; }
  }
  // The ring is drawn round the control wherever it is, except where its panel has been scrolled
  // until the control is out of sight: then there is nothing to ring.
  function drawRing() {
    let box = '';
    if (ringOn && cur && !help) {
      const r = rectOf(cur), m = (cur === ringFor ? ringIn : (ringFor = cur, ringIn = scroller(cur)))?.getBoundingClientRect(), mid = (r.top + r.bottom) / 2;
      if (!m || (mid > m.top && mid < m.bottom)) box = [r.left, r.top, r.width, r.height].map((v) => Math.round(v)).join();
    }
    if (box === ringBox) return;
    ringBox = box; ui.ring.hidden = !box;
    if (box) { layer(ui.ring); const [x, y, w, hh] = box.split(','); Object.assign(ui.ring.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' }); }
  }
  // One step of a held direction: change a list, or move the ring, or (with nowhere to go) scroll.
  function direct(dir) {
    if (!ringOn || !cur) { cur = cur && usable(cur) ? cur : start(); if (cur) ringTo(cur); return; }
    if (isSelect(cur) && keeps(cur, dir)) {
      const i = clamp(cur.selectedIndex + (dir === 'right' ? 1 : -1), 0, cur.options.length - 1);
      if (i !== cur.selectedIndex) { cur.selectedIndex = i; cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    if (keeps(cur, dir)) return;      // a slider: moved every frame, below
    const to = neighbour(cur, dir);
    if (to) return ringTo(to);
    (scroller(cur) || (pageScrolls() ? document.scrollingElement : null))?.scrollBy({ top: VEC[dir][1] * 80, left: VEC[dir][0] * 80 });
  }
  // A slider under a held direction: one notch at once, then, after a pause, faster and faster.
  // A notch is the slider's own step, or a two-hundredth of its travel where the steps are finer.
  function slide(dir, dt, first) {
    const el = cur, step = +el.step || 1, notch = Math.max(1, Math.ceil((el.max - el.min) / step / 200));
    if (first) carry = 1;
    else if (heldFor > FIRST) carry += Math.min(120, 6 * 2 ** ((heldFor - FIRST) / 0.45)) * dt;
    const n = Math.floor(carry); if (!n) return;
    carry -= n;
    const before = el.value;
    if (dir === 'right') el.stepUp(n * notch); else el.stepDown(n * notch);
    if (el.value !== before) { moved = el; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  function press(el) {
    if (isRange(el) || isSelect(el)) return;
    el.click();
  }
  function buzz(pad) {
    if (calm.matches) return;
    try { pad.vibrationActuator?.playEffect?.('dual-rumble', { duration: 35, weakMagnitude: 0.35, strongMagnitude: 0 })?.catch?.(() => {}); } catch { /* no rumble on this pad */ }
  }
  function back() {
    const dlg = document.querySelector('dialog[open]');
    if (dlg) return dlg.close();
    if (map.back?.()) return;
    backLink()?.click();
  }
  function toHub() {
    const from = hub(); if (!from) return;
    if (from.url) location.assign(from.url); else history.go(Math.min(-1, from.len - 1 - history.length));
  }

  // ---- once a frame ----
  function poll(now) {
    raf = requestAnimationFrame(poll);
    const pad = [...navigator.getGamepads()].find((p) => p && p.connected);
    if (!pad) return stop();
    const dt = Math.min(0.2, (now - last) / 1000 || 0.016); last = now;      // (real time, so a slow machine is not a slow controller)
    const down = (k) => !!pad.buttons[BTN[k]]?.pressed, value = (k) => pad.buttons[BTN[k]]?.value || 0;
    const now_ = {}; for (const k in BTN) now_[k] = down(k);
    // A button already down as the page opens was pressed for the page before this one.
    if (!was) was = fresh && performance.now() < 1500 ? now_ : {};
    fresh = false;
    const hit = (k) => now_[k] && !was[k];

    // while the picture is up, the part being pressed lights up on it
    if (help) for (const el of ui.box.querySelectorAll('svg [data-k]')) {
      const k = el.dataset.k;
      el.classList.toggle('down', k === 'move' ? Object.keys(VEC).some((d) => now_[d]) || Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0) > FLICK : k === 'rs' ? Math.hypot(pad.axes[2] || 0, pad.axes[3] || 0) > DEAD : now_[k]);
    }

    if (hit('view')) showHelp(!help);
    else if (help) { if (hit('a') || hit('b')) showHelp(false); }
    else {
      if (hit('a') && ringOn && cur) { buzz(pad); press(cur); }
      if (hit('b')) back();
      if (hit('menu')) toHub();
      if (hit('lb') && map.prev) { buzz(pad); map.prev.press(); }
      if (hit('rb') && map.next) { buzz(pad); map.next.press(); }
    }

    // the left stick and the D-pad: one direction at a time
    const dir = help ? '' : now_.left ? 'left' : now_.right ? 'right' : now_.up ? 'up' : now_.down ? 'down' : flick(pad.axes[0] || 0, pad.axes[1] || 0, !!held);
    hold();
    if (dir !== held) { settle(); held = dir; heldFor = 0; nextAt = FIRST; if (dir) { const slider = ringOn && isRange(cur) && keeps(cur, dir); direct(dir); if (slider) slide(dir, dt, true); } }
    else if (dir) {
      heldFor += dt;
      if (ringOn && isRange(cur) && keeps(cur, dir)) slide(dir, dt, false);
      else if (heldFor >= nextAt) { nextAt += AGAIN; direct(dir); }
    }

    // the right stick and the triggers: analog, eased, and handed to the page
    const k = 1 - Math.exp(-dt / SMOOTH), [rx, ry] = help ? [0, 0] : stick(pad.axes[2], pad.axes[3]);
    const z = help ? 0 : value('rt') - value('lt');
    ease.rx += (rx - ease.rx) * k; ease.ry += (ry - ease.ry) * k; ease.z += ((Math.abs(z) < 0.05 ? 0 : z) - ease.z) * k;
    if (map.look?.move && Math.hypot(ease.rx, ease.ry) > 0.004) map.look.move(ease.rx, ease.ry, dt);
    if (map.look?.step) {
      const r = help ? '' : flick(pad.axes[2] || 0, pad.axes[3] || 0, !!rHeld);
      if (r !== rHeld) { rHeld = r; rFor = 0; rNext = FIRST; if (r) map.look.step(...VEC[r]); }
      else if (r && (rFor += dt) >= rNext) { rNext += AGAIN; map.look.step(...VEC[r]); }
    }
    if (map.zoom && Math.abs(ease.z) > 0.004) map.zoom.move(ease.z, dt);

    drawRing();
    was = now_;
  }
  function begin() {
    if (raf) return;
    if (!ui) build();
    last = performance.now(); was = null;
    raf = requestAnimationFrame(poll);
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    settle(); held = rHeld = ''; ringOn = false; ease.rx = ease.ry = ease.z = 0;
    if (ui) { showHelp(false); drawRing(); }
  }
  addEventListener('gamepadconnected', begin);
  addEventListener('gamepaddisconnected', () => { if (![...navigator.getGamepads()].some((p) => p && p.connected)) stop(); });
  try { if ([...navigator.getGamepads()].some((p) => p && p.connected)) begin(); } catch { /* not allowed here */ }

  // for the tests
  window.__gamepad = { candidates, neighbour, keeps, keys, ringTo, get cur() { return ringOn ? cur : null; }, get help() { return help; }, get running() { return !!raf; } };
}
