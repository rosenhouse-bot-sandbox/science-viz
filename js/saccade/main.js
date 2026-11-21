// Overshoot saccades: the controller. The state is the zoom (0 Screen, 1 Eyes, 2 Muscles), healthy or poor pursuit,
// how fast time runs, and the target. The simulation in model.js moves the eyes; scene.js draws them.
import { makeSim, STEP, SCREEN, MUSCLES, PURSUIT, onScreen, gazeOf, eyeGaze, listing, turnOf, rate, musclePath, rot } from './model.js?v=852b0b18';
import { makeScene, camera } from './scene.js?v=852b0b18';
import { SRC, CONDITIONS, NOTE, NOTE_SRC, MODEL, MODEL_SRC, INSET } from './facts.js?v=852b0b18';
import { gamepad } from '../gamepad/gamepad.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const cv = $('view'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
let scene = null, broken = false;

const STOPS = [
  { id: 'screen', name: 'Screen', pivot: [0, -10, -320], yaw: 0.103, pitch: 0.2195, dist: 597 },
  { id: 'eyes', name: 'Eyes', pivot: [0, 0, -2], yaw: Math.PI, pitch: 0.12, dist: 175 },
  { id: 'muscles', name: 'Muscles', pivot: [24, 0, 12], yaw: 1.75, pitch: 1.22, dist: 120 },
];
const LAST = STOPS.length - 1;
const SIDE = [0, -20, -440];                          // pulls the path between Screen and Eyes out to the side, halfway between them
const SPEEDS = [[0.01, '1/100'], [0.02, '1/50'], [0.05, '1/20'], [0.1, '1/10'], [0.2, '1/5'], [0.5, '1/2'], [1, '1']];
const st = { z: 0, cond: 'poor', sp: 3, tspeed: 20, auto: true, play: !reduced, yaw: 0, pitch: 0, pick: null };
const free = { x: 0, y: 0, w: 1, h: 1 }, view = { W: 1, H: 1, dpr: 1 };
const FOV = 34 * Math.PI / 180;
let sim = makeSim({ cond: st.cond, speed: st.tspeed, auto: st.auto });
const drawn = { z: 0, t: 0 };                          // what the last picture showed (for the tests)
let dirty = true, raf = 0, last = 0, fly = null, acc = 0, zoomAt = -1e9, held = null, frame = null, jumpSide = 1;

// ---- what the eyes and muscles are doing now ----
function compute() {
  const s = sim.s, P = onScreen(s.E[0], s.E[1]), ve = s.Ve, speed = [ve[1], -ve[0], 0];
  const eyes = [1, -1].map((side) => {
    const dir = eyeGaze(side, P), R = listing(dir), turn = turnOf(dir), drive = {}, rates = {};
    for (const m of MUSCLES) { rates[m.id] = rate(m.id, side, turn, speed); drive[m.id] = rates[m.id] / 400; }
    return { side, R, dir, drive, rates, pick: st.pick };
  });
  // the last 0.4 s of where the eyes looked, for the trail on the screen
  const trail = [], B = sim.B;
  for (let j = s.k - 400; j <= s.k; j += 4) if (j > 0) { const J = sim.at(j); trail.push([B.eh[J], B.ev[J]]); }
  const c = cam();
  frame = { eyes, P, T: s.T.slice(), E: s.E.slice(), trail, pupil: 0.3, beams: 0.5, beamW: 0.35 + c.dist * 0.0022, cam: c };
}

// ---- the camera ----
function cam() {
  const z = st.z, i = Math.min(LAST - 1, Math.floor(z)), f = smooth(z - i), a = STOPS[i], b = STOPS[i + 1];
  // between Screen and Eyes the camera swings round the side, and stands back so that the eyes and the screen stay in view
  const M = i === 0 ? SIDE : a.pivot.map((x, k) => (x + b.pivot[k]) / 2);
  const pivot = a.pivot.map((x, k) => (1 - f) * (1 - f) * x + 2 * f * (1 - f) * M[k] + f * f * b.pivot[k]);
  const dist = a.dist * Math.pow(b.dist / a.dist, f) * (1 + (i === 0 ? 2.1 : 0) * Math.sin(Math.PI * f));
  const yaw = a.yaw + (b.yaw - a.yaw) * f + st.yaw, pitch = clamp(a.pitch + (b.pitch - a.pitch) * f + (i === 0 ? 0.35 * Math.sin(Math.PI * f) : 0) + st.pitch, -1.2, 1.35);
  const pos = [pivot[0] + dist * Math.cos(pitch) * Math.sin(yaw), pivot[1] + dist * Math.sin(pitch), pivot[2] + dist * Math.cos(pitch) * Math.cos(yaw)];
  return { pos, at: pivot, dist };
}
// the field of view is set by the free part of the screen, and the picture is centered there
function fovFull() { return 2 * Math.atan(Math.tan(FOV / 2) * view.H / free.h); }
function mainCam(c) {
  const k = camera(c.pos, c.at, [0, 1, 0], fovFull(), view.W / view.H, Math.max(1, c.dist * 0.02), 6000), m = k.vp;
  const ox = (free.x + free.w / 2) / view.W * 2 - 1, oy = 1 - (free.y + free.h / 2) / view.H * 2;
  for (let col = 0; col < 4; col++) { m[col * 4] += ox * m[col * 4 + 3]; m[col * 4 + 1] += oy * m[col * 4 + 3]; }
  return k;
}
// the inset: what the right eye sees, from its center along its line of sight
function insetBox() {
  const w = Math.round(clamp(free.w * 0.36, 132, 300)), h = Math.round(w * 0.62);
  return { x: free.x + free.w - w - 14, y: free.y + 14, w, h };
}
const INSET_DEG = 10;
function eyeCam(box) {
  const e = frame.eyes[0], c = [31.5, 0, 0], up = rot(e.R, [0, 1, 0]), at = c.map((x, i) => x + e.dir[i] * 100);
  const fovy = 2 * Math.atan(Math.tan(INSET_DEG / 2 * Math.PI / 180) * box.h / box.w);
  return camera(c, at, up, fovy, box.w / box.h, 5, 3000);
}

function draw() {
  const d = view.dpr;
  scene.build(frame);
  scene.paint(frame, false); scene.upload(0);
  scene.paint(frame, true); scene.upload(1);
  scene.draw(frame, mainCam(frame.cam), { x: 0, y: 0, w: cv.width, h: cv.height });
  const b = insetBox();
  scene.draw(frame, eyeCam(b), { x: Math.round(b.x * d), y: Math.round(cv.height - (b.y + b.h) * d), w: Math.round(b.w * d), h: Math.round(b.h * d) }, { inside: true });
  const box = $('inset'); box.style.transform = `translate(${b.x}px,${b.y}px)`; box.style.width = b.w + 'px'; box.style.height = b.h + 'px';
  $('fovea').style.width = $('fovea').style.height = (b.w * 2 / INSET_DEG) + 'px';
}

// ---- the trace: left and right over the last 2 s ----
const TRACE_S = 2, TRACE_DEG = 16;
function trace() {
  const c = $('trace'), r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (!r.width) return;
  if (c.width !== Math.round(r.width * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
  const x = c.getContext('2d'), W = c.width, H = c.height, s = sim.s, B = sim.B;
  x.clearRect(0, 0, W, H);
  const X = (t) => W - (s.t - t) / TRACE_S * W, Y = (deg) => H / 2 - deg / TRACE_DEG * (H / 2 - 4 * d);
  x.strokeStyle = 'rgba(234,240,255,.12)'; x.lineWidth = d;
  for (const g of [-10, 0, 10]) { x.beginPath(); x.moveTo(0, Y(g)); x.lineTo(W, Y(g)); x.stroke(); }
  const n = Math.min(s.k, Math.round(TRACE_S / STEP));
  const line = (arr, col, w) => { x.strokeStyle = col; x.lineWidth = w * d; x.lineJoin = 'round'; x.beginPath(); for (let j = s.k - n, f = true; j <= s.k; j += 2) { const J = sim.at(j), t = s.t - (s.k - j) * STEP; f ? x.moveTo(X(t), Y(arr[J])) : x.lineTo(X(t), Y(arr[J])); f = false; } x.stroke(); };
  line(B.th, '#ffd773', 2); line(B.eh, '#7fd6ff', 1.6);
  x.fillStyle = '#ff9a4d';
  for (const e of s.events) if (e.kind === 'overshoot' && e.t1 > s.t - TRACE_S) { x.beginPath(); x.arc(X(e.t1), Y(e.E1[0]), 3.2 * d, 0, 7); x.fill(); }
}

// ---- the panel ----
const shown = {};
const set = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
function sync() {
  const zi = $('zoom'), lvl = Math.round(st.z);
  if (Math.abs(zi.value - st.z) > 0.0015) zi.value = st.z;
  zi.style.setProperty('--v', (st.z / LAST * 100) + '%'); zi.setAttribute('aria-valuetext', STOPS[lvl].name); set('zoomV', STOPS[lvl].name);
  for (const b of $('stops').children) b.setAttribute('aria-current', String(+b.dataset.i === lvl));
  for (const b of $('conds').children) b.setAttribute('aria-pressed', String(b.dataset.id === st.cond));
  const sp = $('speed'); if (+sp.value !== st.sp) sp.value = st.sp;
  const spt = SPEEDS[st.sp][0] === 1 ? 'Real speed' : `${SPEEDS[st.sp][1]} of real speed`;
  sp.style.setProperty('--v', (st.sp / (SPEEDS.length - 1) * 100) + '%'); sp.setAttribute('aria-valuetext', spt); set('speedV', spt);
  const ts = $('tspeed'); if (+ts.value !== st.tspeed) ts.value = st.tspeed;
  ts.style.setProperty('--v', ((st.tspeed - ts.min) / (ts.max - ts.min) * 100) + '%'); ts.setAttribute('aria-valuetext', `${st.tspeed} degrees per second`); set('tspeedV', `${st.tspeed}°/s`);
  $('auto').checked = st.auto;
  const pl = st.play ? 'Pause' : 'Play';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', String(st.play)); $('play').setAttribute('aria-label', pl); }
  const it = CONDITIONS.find((c) => c.id === st.cond);
  if (shown.cap !== it.id) { shown.cap = it.id; $('capTitle').textContent = it.title; $('capBody').textContent = it.body; sources(); }
  // numbers, from the simulation
  const g = sim.gain(), ev = sim.recent(5), moving = ev.filter((e) => !['past', 'short', 'on'].includes(e.kind)), over = moving.filter((e) => e.kind === 'overshoot').length;
  set('gainV', g === null ? '–' : g.toFixed(2));
  set('overV', `${over} of ${ev.length}`);
  const le = sim.s.events[sim.s.events.length - 1];
  set('lastV', le ? `${le.amp.toFixed(1)}° in ${Math.round(le.D * 1000)} ms` : '–');
  set('peakV', le ? `${Math.round(le.peak)}°/s` : '–');
  set('landV', le ? landText(le) : '–');
  const r = frame.eyes[0].rates;
  set('lrV', `${Math.round(r.lr)}`); set('mrV', `${Math.round(r.mr)}`);
  for (const li of $('muscleList').children) li.querySelector('b').textContent = `${Math.round(r[li.dataset.id])} spikes/s`;
  for (const li of $('muscleList').children) li.querySelector('button').setAttribute('aria-pressed', String(st.pick === li.dataset.id));
  writeHash();
}
function landText(e) {
  const a = Math.abs(e.ahead).toFixed(1);
  return { overshoot: `${a}° ahead of the target`, catchup: 'on the target', anticipatory: `${a}° ahead of the target`, backup: 'back toward the target', past: `${a}° past the target`, short: `${a}° short of the target`, on: 'on the target', other: 'on the target' }[e.kind];
}
function sources() {
  const ol = $('sources'); ol.replaceChildren();
  const it = CONDITIONS.find((c) => c.id === st.cond);
  for (const k of [...new Set([...it.src, ...NOTE_SRC, ...MODEL_SRC])]) { const li = document.createElement('li'), a = document.createElement('a'); a.href = SRC[k].url; a.textContent = SRC[k].name; a.rel = 'noopener'; li.append(a); ol.append(li); }
}
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', '#' + new URLSearchParams({ z: st.z.toFixed(2), c: st.cond, sp: st.sp, ts: st.tspeed, auto: st.auto ? 1 : 0 })), 400);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('z')) st.z = clamp(parseFloat(q.get('z')) || 0, 0, LAST);
  if (CONDITIONS.some((c) => c.id === q.get('c'))) st.cond = q.get('c');
  if (q.has('sp')) st.sp = clamp(Math.round(+q.get('sp')) || 0, 0, SPEEDS.length - 1);
  if (q.has('ts')) st.tspeed = clamp(Math.round(+q.get('ts')) || 20, 5, 40);
  if (q.has('auto')) st.auto = q.get('auto') !== '0';
  sim.set({ cond: st.cond, speed: st.tspeed, auto: st.auto });
  return q.has('z');
}

// ---- time ----
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function touch() { dirty = true; kick(); }
function tick(now) {
  raf = 0;
  if (broken || !scene) return;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  if (fly) {
    const d = fly.to - st.z, step = Math.sign(d) * Math.min(Math.abs(d), dt * (0.7 + 2.6 * Math.abs(d)));
    st.z += step; zoomAt = now; if (Math.abs(fly.to - st.z) < 0.002) { st.z = fly.to; fly = null; } dirty = true;
  }
  // time stands still while the view zooms, so that only one thing moves at once
  const zooming = fly || now - zoomAt < 250;
  if (st.play && !zooming) {
    acc += Math.min(dt, 0.05) * SPEEDS[st.sp][0];
    const n = Math.floor(acc / STEP + 1e-9); acc -= n * STEP;
    if (n) { sim.advance(n * STEP, held); dirty = true; }
  }
  if (dirty) { dirty = false; try { compute(); draw(); trace(); sync(); drawn.z = st.z; drawn.t = sim.s.t; } catch (e) { oops(e); } }
  if (st.play || fly || zooming) kick(); else last = 0;
}
function oops(e) { console.error(e); if (broken) return; broken = true; st.play = false; fly = null; $('oops').hidden = false; }
function zoomTo(z) { z = clamp(z, 0, LAST); if (reduced) { st.z = z; fly = null; zoomAt = performance.now(); } else fly = { to: z }; touch(); }
const zoomBy = (z) => { fly = null; st.z = clamp(z, 0, LAST); zoomAt = performance.now(); touch(); };

let res = +(new URLSearchParams(location.search).get('res')) || 1;
// the story's box keeps the height of the longest story, so that switching pursuit moves nothing below it
function capHeight() {
  const cap = $('cap'), h2 = $('capTitle'), p = $('capBody'), keep = [h2.textContent, p.textContent];
  cap.removeAttribute('aria-live'); cap.style.minHeight = ''; let m = 0;
  for (const c of CONDITIONS) { h2.textContent = c.title; p.textContent = c.body; m = Math.max(m, cap.offsetHeight); }
  [h2.textContent, p.textContent] = keep; cap.style.minHeight = m + 'px'; cap.setAttribute('aria-live', 'polite');
}
function measure() {
  capHeight();
  const W = innerWidth, H = innerHeight, r = $('panel').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1) * res;
  if (r.right < W * 0.7) { free.x = r.right + 12; free.y = 0; free.w = W - free.x; free.h = H; }
  else { free.x = 0; free.y = 52; free.w = W; free.h = Math.max(120, r.top - 52); }
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  view.W = W; view.H = H; view.dpr = dpr; touch();
}

// a point on the picture, in CSS pixels, to a point on the screen in the scene, as gaze angles (or null off the screen)
function pick(X, Y) {
  const c = frame.cam, f = norm(sub(c.at, c.pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), tY = Math.tan(fovFull() / 2);
  const dx = (X - (free.x + free.w / 2)) / (view.H / 2) * tY, dy = -(Y - (free.y + free.h / 2)) / (view.H / 2) * tY;
  const d = [f[0] + r[0] * dx + u[0] * dy, f[1] + r[1] * dx + u[1] * dy, f[2] + r[2] * dx + u[2] * dy];
  if (d[2] >= -1e-6) return null;
  const t = (-SCREEN.d - c.pos[2]) / d[2], p = [c.pos[0] + d[0] * t, c.pos[1] + d[1] * t, -SCREEN.d];
  if (Math.abs(p[0]) > SCREEN.w / 2 || Math.abs(p[1]) > SCREEN.h / 2) return null;
  const g = gazeOf(p); return [clamp(g[0], -22, 22), clamp(g[1], -13, 13)];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

// ---- controls ----
function setAuto(on) { st.auto = on; sim.set({ auto: on }); touch(); }
function controls() {
  STOPS.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s.name; b.dataset.i = i; b.style.left = (i / LAST * 100) + '%'; b.addEventListener('click', () => zoomTo(i)); $('stops').append(b); });
  CONDITIONS.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c.name; b.dataset.id = c.id; b.addEventListener('click', () => { st.cond = c.id; sim.set({ cond: c.id }); touch(); }); $('conds').append(b); });
  $('zoom').addEventListener('input', (e) => zoomBy(+e.target.value));
  $('zoom').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return;
    e.preventDefault(); zoomBy(st.z + d * 0.05);
  });
  $('speed').addEventListener('input', (e) => { st.sp = +e.target.value; touch(); });
  $('tspeed').addEventListener('input', (e) => { st.tspeed = +e.target.value; sim.set({ speed: st.tspeed }); touch(); });
  $('auto').addEventListener('change', (e) => setAuto(e.target.checked));
  $('play').addEventListener('click', () => { st.play = !st.play; touch(); });
  $('jump').addEventListener('click', () => { jumpSide = -Math.sign(sim.s.T[0] || jumpSide) || 1; st.auto = false; sim.place([jumpSide * 10, 0]); if (!st.play) st.play = true; touch(); });
  for (const m of MUSCLES) {
    const li = document.createElement('li'), b = document.createElement('button'), name = document.createElement('span'), v = document.createElement('b'), sm = document.createElement('small');
    li.dataset.id = m.id; b.type = 'button'; name.textContent = m.name; sm.textContent = m.short; b.append(name, v, sm); li.append(b); $('muscleList').append(li);
    b.addEventListener('click', () => { st.pick = st.pick === m.id ? null : m.id; touch(); });
    b.addEventListener('pointerenter', () => { st.pick = m.id; touch(); }); b.addEventListener('pointerleave', () => { st.pick = null; touch(); });
  }
  for (const [k, list] of [['note', NOTE], ['modelNote', MODEL]]) for (const t of list) { const p = document.createElement('p'); p.className = 'fine'; p.textContent = t; $(k).append(p); }
  $('insetText').textContent = INSET;
  // a finger or mouse on the picture: on the screen it moves the target; elsewhere it turns the view. Two fingers zoom.
  const fingers = new Map(); let drag = null, span = 0;
  const spanOf = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  const pageZoomed = () => (window.visualViewport ? visualViewport.scale : 1) > 1.01;
  const leavePinch = () => cv.classList.toggle('pagezoom', pageZoomed());
  if (window.visualViewport) { visualViewport.addEventListener('resize', leavePinch); leavePinch(); }
  cv.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture?.(e.pointerId);
    if (fingers.size === 2) { drag = null; held = null; span = spanOf(); return; }
    const g = frame && pick(e.clientX, e.clientY);
    if (g) { st.auto = false; sim.place(g); held = g; drag = 'target'; if (!st.play) st.play = true; touch(); }
    else drag = [e.clientX, e.clientY];
  });
  cv.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 2) { if (pageZoomed()) { span = 0; return; } const d = spanOf(); if (span) zoomBy(st.z + Math.log(d / span) * 2); span = d; return; }
    if (drag === 'target') { const g = pick(e.clientX, e.clientY); if (g) held = g; return; }
    if (drag) { st.yaw = clamp(st.yaw - (e.clientX - drag[0]) * 0.005, -1.2, 1.2); st.pitch = clamp(st.pitch + (e.clientY - drag[1]) * 0.005, -0.6, 0.6); drag = [e.clientX, e.clientY]; touch(); }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(type, (e) => { fingers.delete(e.pointerId); span = 0; if (drag === 'target') held = null; drag = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(st.z - e.deltaY * (e.deltaMode ? 0.05 : 0.002)); }, { passive: false });
  cv.addEventListener('dblclick', () => { st.yaw = 0; st.pitch = 0; touch(); });
  $('reload').addEventListener('click', () => location.reload());
  addEventListener('resize', measure);
  addEventListener('hashchange', () => { if (readHash()) { fly = null; touch(); } });
  document.addEventListener('visibilitychange', () => { last = 0; });
  gamepad({
    look: { label: 'Turn the view', move(x, y, dt) { st.yaw = clamp(st.yaw - x * 1.4 * dt, -1.2, 1.2); st.pitch = clamp(st.pitch - y * 1.0 * dt, -0.6, 0.6); touch(); } },
    zoom: { move(v, dt) { zoomBy(st.z + v * 1.2 * dt); } },
    prev: { label: 'Zoom out to the scale before', press: () => zoomTo(Math.ceil((fly ? fly.to : st.z) - 1e-6) - 1) },
    next: { label: 'Zoom in to the next scale', press: () => zoomTo(Math.floor((fly ? fly.to : st.z) + 1e-6) + 1) },
  });
}

// ---- start ----
function start() {
  if (!gl) throw new Error('This browser does not offer WebGL 2.');
  scene = makeScene(gl);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); scene = null; });
  cv.addEventListener('webglcontextrestored', () => { scene = makeScene(gl); touch(); });
  // start with the target already swinging and the eyes following, a few seconds in
  sim.advance(3);
  $('loading').hidden = true;
  touch();
}
controls(); readHash(); measure();
try { start(); } catch (e) { oops(e); }
window.__saccade = { st, drawn, get sim() { return sim; }, get frame() { return frame; }, stops: STOPS, get busy() { return !!(fly || st.play); },
  settle() { if (fly) { st.z = fly.to; fly = null; } zoomAt = -1e9; st.play = false; touch(); }, res(k) { res = k; measure(); },
  redraw() { compute(); draw(); trace(); sync(); gl.finish(); }, pick: (x, y) => pick(x, y), musclePath, PURSUIT };
