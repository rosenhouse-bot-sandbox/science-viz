// Sliders that a finger can work, shared by every page.
//
// On an iPad, Safari's own slider only takes a finger that lands on its small knob, a tap on the line only focuses it,
// and a slider that has focus may not drag at all (WebKit bug 266283). So this module works every <input type="range">
// on the page itself, for a finger, a pen or a mouse:
//   - a press anywhere on the slider's row takes hold of it;
//   - a press on the knob drags it from where it was taken, so it does not jump;
//   - a finger's press away from the knob glides there, then follows the finger (a mouse's lands at once, as on a desktop);
//   - the slider stays held until the finger lifts, even off the row (pointer capture).
// The input stays a real slider: keyboard, screen readers and the controller work as before. The page hears the
// same `input` and `change` events it always did. While held, the slider has the class `held` (css/touch.css draws it).
//
// A page can own the glide for a slider: `touchSliders({ zoom: { glideTo: zoomTo } })`. The module then calls
// glideTo(value) instead of moving the knob, and leaves the knob to the page until it has caught up with the finger.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const GLIDE_MS = 110;                 // time constant of the glide: most of the way in a quarter of a second
const NEAR = 12;                      // px beyond the knob's edge that still counts as a press on the knob

let hooks = {};
let held = null;                      // { el, id, grab, target, mode: 'drag' | 'glide' | 'page', last }

const num = (v, d) => (v === '' || v == null || isNaN(+v) ? d : +v);
function range(el) {
  const min = num(el.min, 0), max = num(el.max, 100), step = el.step === 'any' ? 0 : num(el.step, 1);
  return { min, max: max > min ? max : min, step };
}
function knobSize(el) {
  // The knob's drawn width sets where the value runs along the row: from half a knob in at each end.
  const k = parseFloat(getComputedStyle(el).getPropertyValue('--knob')) || 18;
  return Math.min(k, el.getBoundingClientRect().width / 2);
}
function geometry(el) {
  const r = el.getBoundingClientRect(), k = knobSize(el);
  const rtl = getComputedStyle(el).direction === 'rtl';
  return { left: r.left + k / 2, width: Math.max(1, r.width - k), k, rtl };
}
const fraction = (el, v) => { const { min, max } = range(el); return max > min ? (v - min) / (max - min) : 0; };
function knobX(el, g) { const f = fraction(el, +el.value); return g.left + (g.rtl ? 1 - f : f) * g.width; }
function valueAt(el, x, g) {
  const { min, max } = range(el);
  let f = Math.min(1, Math.max(0, (x - g.left) / g.width)); if (g.rtl) f = 1 - f;
  return min + f * (max - min);
}
function snap(el, v) {
  const { min, max, step } = range(el);
  v = Math.min(max, Math.max(min, v));
  return step ? min + Math.round((v - min) / step) * step : v;
}
function set(el, v) {
  const before = el.value;
  el.value = String(snap(el, v));
  if (el.value !== before) el.dispatchEvent(new Event('input', { bubbles: true }));
}

function frame(now) {
  if (!held || held.mode !== 'glide') return;
  const el = held.el, dt = Math.min(64, now - (held.last || now)); held.last = now;
  const cur = held.at, t = held.target, step = (t - cur) * (1 - Math.exp(-dt / GLIDE_MS));
  const { min, max, step: s } = range(el), tiny = Math.max(s / 2, (max - min) * 0.002);
  held.at = Math.abs(t - cur) <= tiny || snap(el, cur + step) === snap(el, t) ? t : cur + step;   // done once the knob shows the end
  set(el, held.at);
  if (held.at !== t) requestAnimationFrame(frame);
  else if (held.released) finish();
  else held.mode = 'drag';
}
// The finger has lifted and the knob is where it was aimed: the page hears `change`, as after a native slider's drag.
function finish() {
  const el = held.el;
  held = null;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function start(e) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== 'range' || el.disabled) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (held && held.released) finish();               // a new press while the last tap still glides: that one ends now
  if (held) return;                                  // a second finger on another slider is ignored
  e.preventDefault();                                // no native drag, no text selection, no focus jump
  if (e.pointerType === 'mouse') el.focus({ preventScroll: true });   // the arrow keys then work it, as before
  else if (document.activeElement === el) el.blur();
  const g = geometry(el), x = e.clientX, kx = knobX(el, g);
  const onKnob = Math.abs(x - kx) <= g.k / 2 + NEAR;
  const hook = hooks[el.id];
  held = { el, id: e.pointerId, grab: onKnob ? x - kx : 0, at: +el.value, target: valueAt(el, x, g), last: 0 };
  el.setPointerCapture?.(e.pointerId);
  el.classList.add('held');
  if (onKnob) held.mode = 'drag';
  else if (hook && hook.glideTo && !reduced.matches) { held.mode = 'page'; hook.glideTo(snap(el, held.target)); }
  else if (reduced.matches || e.pointerType === 'mouse') { held.mode = 'drag'; set(el, held.target); }   // a mouse lands at once, as a desktop slider does
  else { held.mode = 'glide'; requestAnimationFrame(frame); }
}
function move(e) {
  if (!held || e.pointerId !== held.id) return;
  const el = held.el, g = geometry(el);
  const v = valueAt(el, e.clientX - held.grab, g);
  held.target = v;
  if (held.mode === 'drag') set(el, v);
  else if (held.mode === 'page') {
    const { min, max } = range(el);
    if (Math.abs(+el.value - v) <= (max - min) * 0.01) { held.mode = 'drag'; set(el, v); } else hooks[el.id].glideTo(snap(el, v));
  }
}
function end(e) {
  if (!held || e.pointerId !== held.id) return;
  held.el.classList.remove('held');
  if (held.mode === 'glide') { held.released = true; held.id = null; }   // a quick tap glides on to where it was aimed
  else finish();
}

// iPad Safari runs its own slider from the touch itself, so the touch must be stopped on the slider. This listener is
// on each slider only, so that scrolling anywhere else never waits for the page.
const stopNative = (e) => { if (e.cancelable) e.preventDefault(); };
function claim(el) { if (el.dataset.touch) return; el.dataset.touch = '1'; el.addEventListener('touchstart', stopNative, { passive: false }); }
function claimAll(root) { for (const el of root.querySelectorAll('input[type=range]')) claim(el); }

let ready = false;
export function touchSliders(pageHooks = {}) {
  hooks = { ...hooks, ...pageHooks };
  if (ready) return;
  ready = true;
  addEventListener('pointerdown', start, { capture: true });
  addEventListener('pointermove', move, { capture: true });
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, end, { capture: true });
  // iPad Safari only shows a button's :active look when the page listens for touches.
  document.addEventListener('touchstart', () => {}, { passive: true });
  claimAll(document);
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches('input[type=range]')) claim(n); else claimAll(n); }
  }).observe(document.body, { childList: true, subtree: true });
}
