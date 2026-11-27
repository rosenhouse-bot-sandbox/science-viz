// Gears on a cube and an octahedron: the controller. The state is which solid, how far the gears have turned, and
// the camera. Dragging a gear turns it about its own axis, and every gear it meshes with follows.
import { SHAPES, angles, dot, cross, norm, R_IN, R_OUT, MM, unitMM } from './model.js?v=42230d28';
import { makeScene } from './scene.js?v=42230d28';
import { makeLook } from './look.js?v=42230d28';
import { KEY } from './facts.js?v=42230d28';
import { perspective, lookAt, mul4 } from '../gl/gl.js?v=42230d28';
import { gamepad } from '../gamepad/gamepad.js?v=42230d28';
import { touchSliders } from '../touch/slider.js?v=42230d28';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = 2 * Math.PI, D = Math.PI / 180;
const cv = $('view'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
const by = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
const SHOWN = [by.cube4, by.octa];                     // (the cube with six gears jams; the tests still check that)
const CAGE = (1 + MM.bearing.ball / MM.bearing.pitch) / 2;   // a bearing's balls go round at this share of the gear's speed (outer ring turning, inner held)
const SPEED = 24 * D;                                  // how fast Play turns the gears, radians a second
const VIEW = { yaw: 0.35, pitch: 0.85 };                // the camera at the start, and after a double click
const st = { shape: 'octa', t: 0, e: 0, play: !reduced, color: false, yaw: VIEW.yaw, pitch: VIEW.pitch, hi: -1, held: -1 };
const free = { x: 0, y: 0, w: 1, h: 1 }, view = { W: 1, H: 1, dpr: 1 };
const FOV = 26 * D, DIST = 6.2;
const GOLD = [1.0, 0.72, 0.3], BLUE = [0.5, 0.64, 0.92], BRASS = [0.95, 0.74, 0.4];
let scene = null, broken = false, dirty = true, raf = 0, last = 0, cam = null;
const drawn = { t: 0, shape: '' };                     // what the last picture showed (for the tests)

const shape = () => by[st.shape];
// ---- the camera: it circles the solid's center ----
function camera() {
  const p = st.pitch, y = st.yaw, R = DIST * (1 + 0.85 * st.e), pos = [R * Math.cos(p) * Math.sin(y), R * Math.sin(p), R * Math.cos(p) * Math.cos(y)];
  const fov = 2 * Math.atan(Math.tan(FOV / 2) * view.H / free.h);
  const vp = mul4(perspective(fov, view.W / view.H, 0.5, 40), lookAt(pos, [0, 0, 0], [0, 1, 0]));
  // the picture is centered in the part of the screen the panel leaves free
  const ox = (free.x + free.w / 2) / view.W * 2 - 1, oy = 1 - (free.y + free.h / 2) / view.H * 2;
  for (let c = 0; c < 4; c++) { vp[c * 4] += ox * vp[c * 4 + 3]; vp[c * 4 + 1] += oy * vp[c * 4 + 3]; }
  const f = norm(pos.map((v) => -v)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  // world to view, for the lights that stay with the camera (column-major)
  const rot = new Float32Array([r[0], u[0], -f[0], r[1], u[1], -f[1], r[2], u[2], -f[2]]);
  return { vp, pos, rot, f, r, u, tY: Math.tan(fov / 2) };
}
// the ray from the camera through a point on the screen, in CSS pixels
function ray(X, Y) {
  const c = cam, dx = (X - (free.x + free.w / 2)) / (view.H / 2) * c.tY, dy = -(Y - (free.y + free.h / 2)) / (view.H / 2) * c.tY;
  return { o: c.pos, d: norm([0, 1, 2].map((k) => c.f[k] + c.r[k] * dx + c.u[k] * dy)) };
}
// which gear is under a point on the screen, or -1: the first point along the ray inside a gear's metal
function pick(X, Y) {
  const sh = shape(), { o, d } = ray(X, Y), tip = sh.profile.tip;
  const b = dot(o, d), c = dot(o, o) - (R_OUT + 0.06) ** 2, disc = b * b - c;
  if (disc < 0) return -1;
  const t0 = -b - Math.sqrt(disc), t1 = -b + Math.sqrt(disc);
  for (let k = 0; k <= 300; k++) {
    const t = t0 + (t1 - t0) * k / 300, p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], r = Math.hypot(...p);
    if (r < R_IN * 0.95) continue;
    const u = p.map((v) => v / r);
    for (let i = 0; i < sh.normals.length; i++) {
      // the toothed band (a little generously, so that a gap between teeth still takes the gear), or the cap
      const n = sh.normals[i], along = dot(p, n), off = Math.sqrt(Math.max(0, r * r - along * along));
      if (r <= R_OUT && Math.acos(clamp(along / r, -1, 1)) <= tip) return i;
      if (along > 0 && along <= R_OUT + 0.06 && off <= Math.sin(sh.profile.root) * R_OUT) return i;
    }
  }
  return -1;
}
// the angle of a point on the screen about gear i's axis, measured in the gear's face plane
function angleAbout(i, X, Y) {
  const sh = shape(), F = sh.frames[i], { o, d } = ray(X, Y), den = dot(d, F.z), h = R_OUT;
  let p;
  if (Math.abs(den) > 0.2) { const t = (h - dot(o, F.z)) / den; p = [0, 1, 2].map((k) => o[k] + d[k] * t); }
  else {
    // the face is seen edge on: use the point on the ray nearest the axis
    const w = dot(d, F.z), t = (dot(F.z, o) * w - dot(o, d)) / (1 - w * w); p = [0, 1, 2].map((k) => o[k] + d[k] * t);
  }
  return Math.atan2(dot(p, F.y), dot(p, F.x));
}

function frameOf() {
  const sh = shape(), ang = angles(sh, st.t);
  const tint = sh.sign.map((s) => (!st.color ? BRASS : s > 0 ? GOLD : BLUE));
  const cage = ang.map((a, i) => (a - sh.phase[i]) * CAGE);
  return { sh, ang, tint, cage, e: st.e, hi: st.held >= 0 ? st.held : st.hi };
}
let look = null, deskKey = '', deskY = 0;
function draw() {
  cam = camera();
  const f = frameOf();
  if (!look) { scene.draw(f, cam, { x: 0, y: 0, w: cv.width, h: cv.height }); return; }
  // the set sits on a desk; taken apart, it is held up so that its lowest part just touches it
  const k = f.sh.id + f.e; if (k !== deskKey) { deskKey = k; deskY = scene.lowest(f.sh, f.e) - 0.004; }
  f.desk = deskY;
  look.frame((c, vpx, hook) => scene.draw(f, c, vpx, hook), cam, cv.width, cv.height,
    { up: [0, 1, 0], lDir: [0.45, 1, 0.6], unit: 1 / unitMM(f.sh), exposure: 0.62, center: [0, deskY / 2, 0], size: 2.4 + 1.8 * f.e, near: 0.5, far: 40, aoR: 0.12 });
}

// ---- the panel ----
const shown = {};
const set = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
const deg = (r, d = 1) => `${(r * 180 / Math.PI).toFixed(d).replace(/\.0$/, '')}°`;
function sync() {
  const sh = shape();
  for (const b of $('shapes').children) b.setAttribute('aria-pressed', String(b.dataset.id === st.shape));
  const mk = 'make.html#s=' + (st.shape === 'octa' ? 'octa' : 'cube4'); if ($('more').getAttribute('href') !== mk) $('more').setAttribute('href', mk);
  const tv = $('turn'), td = Math.round(((st.t / D) % 360 + 360) % 360) % 360;
  if (+tv.value !== td) tv.value = td;
  tv.style.setProperty('--v', (td / 359 * 100) + '%'); tv.setAttribute('aria-valuetext', `${td} degrees`);
  const apart = st.e > 0;
  set('turnV', apart ? 'apart' : `${td}°`);
  tv.disabled = apart; $('play').disabled = apart;
  const ev = $('apart'), ep = Math.round(st.e * 100);
  if (Math.abs(+ev.value - st.e) > 1e-6) ev.value = st.e;
  ev.style.setProperty('--v', ep + '%'); ev.setAttribute('aria-valuetext', ep ? `${ep}% apart` : 'put together');
  const pl = st.play && !apart ? 'Pause' : 'Play';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', String(pl === 'Pause')); $('play').setAttribute('aria-label', pl); }
  $('color').checked = st.color;
  set('key', st.color ? KEY : '');
  writeHash();
}
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', '#' + new URLSearchParams({ s: st.shape, c: st.color ? 1 : 0 })), 400);
}
function readHash(hash = location.hash) {
  const q = new URLSearchParams(hash.slice(1));
  if (SHOWN.some((x) => x.id === q.get('s'))) st.shape = q.get('s');
  if (q.has('c')) st.color = q.get('c') !== '0';
}

// ---- time ----
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function touch() { dirty = true; kick(); }
function tick(now) {
  raf = 0;
  if (broken || !scene) return;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  const moving = st.play && st.e === 0 && st.held < 0;
  if (moving) { st.t += SPEED * dt; dirty = true; }
  if (dirty) { dirty = false; try { draw(); sync(); drawn.t = st.t; drawn.shape = st.shape; } catch (e) { oops(e); } }
  if (moving) kick(); else last = 0;
}
function oops(e) { console.error(e); if (broken) return; broken = true; st.play = false; $('oops').hidden = false; }
function choose(id) { st.shape = id; st.held = -1; st.hi = -1; touch(); }

let res = +(new URLSearchParams(location.search).get('res')) || 1;
// the key's line keeps its height when empty, so that ticking the box moves nothing below it
function keyHeight() {
  const key = $('key'), k0 = key.textContent; key.style.minHeight = ''; key.textContent = KEY; const kh = key.getBoundingClientRect().height; key.textContent = k0; key.style.minHeight = Math.ceil(kh) + 'px';
}
function measure() {
  keyHeight();
  const W = innerWidth, H = innerHeight, r = $('panel').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1) * res;
  if (r.right < W * 0.7) { free.x = r.right + 12; free.y = 0; free.w = W - free.x; free.h = H; }
  else { free.x = 0; free.y = 52; free.w = W; free.h = Math.max(120, r.top - 52); }
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  view.W = W; view.H = H; view.dpr = dpr; cam = camera(); touch();
}

// ---- controls ----
function turnBy(a) { if (st.e > 0) return; st.t += a; touch(); }   // (not wrapped: the slider shows it modulo a turn)
function orbit(dx, dy) { st.yaw = (st.yaw + dx) % TAU; st.pitch = clamp(st.pitch + dy, -1.35, 1.35); touch(); }
function controls() {
  for (const s of SHOWN) { const b = document.createElement('button'); b.type = 'button'; b.textContent = s.name; b.dataset.id = s.id; b.addEventListener('click', () => choose(s.id)); $('shapes').append(b); }
  $('turn').addEventListener('input', (e) => { st.play = false; st.t = +e.target.value * D; touch(); });
  $('play').addEventListener('click', () => { st.play = !st.play; touch(); });
  $('apart').addEventListener('input', (e) => { st.e = clamp(+e.target.value, 0, 1); st.held = -1; touch(); });
  $('color').addEventListener('change', (e) => { st.color = e.target.checked; touch(); });
  // a finger or mouse on a gear turns it; anywhere else it turns the view
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    if (drag) return;
    cv.setPointerCapture?.(e.pointerId);
    const i = cam ? pick(e.clientX, e.clientY) : -1;
    if (i >= 0 && st.e === 0) { st.held = i; drag = { id: e.pointerId, gear: i, a: angleAbout(i, e.clientX, e.clientY) }; cv.classList.add('turning'); }
    else drag = { id: e.pointerId, gear: -1, x: e.clientX, y: e.clientY };
    touch();
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      if (drag.gear >= 0) {
        const a = angleAbout(drag.gear, e.clientX, e.clientY);
        let da = a - drag.a; da = ((da + Math.PI) % TAU + TAU) % TAU - Math.PI; drag.a = a;
        turnBy(da * shape().sign[drag.gear]);
      } else { orbit(-(e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.006); drag.x = e.clientX; drag.y = e.clientY; }
      return;
    }
    if (e.pointerType === 'mouse' && cam) { const i = pick(e.clientX, e.clientY); cv.classList.toggle('over', i >= 0 && st.e === 0); if (i !== st.hi) { st.hi = i; touch(); } }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(type, (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; st.held = -1; cv.classList.remove('turning'); touch(); });
  cv.addEventListener('pointerleave', () => { if (st.hi >= 0) { st.hi = -1; touch(); } });
  cv.addEventListener('dblclick', () => { st.yaw = VIEW.yaw; st.pitch = VIEW.pitch; touch(); });
  cv.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!k) return; e.preventDefault(); orbit(k[0] * 0.12, k[1] * 0.1);
  });
  $('reload').addEventListener('click', () => location.reload());
  addEventListener('resize', measure);
  // read the address the event names: a slow frame can let writeHash's timer replace it before this runs
  addEventListener('hashchange', (e) => { clearTimeout(hashTimer); readHash(new URL(e.newURL).hash); touch(); });
  document.addEventListener('visibilitychange', () => { last = 0; });
  const step = (k) => { const i = SHOWN.findIndex((s) => s.id === st.shape); choose(SHOWN[(i + k + SHOWN.length) % SHOWN.length].id); };
  // Sliders a finger can work (see js/touch/slider.js).
  touchSliders();
  gamepad({
    look: { label: 'Turn the view', move(x, y, dt) { orbit(-x * 1.6 * dt, -y * 1.2 * dt); } },
    zoom: { label: ['Turn the gears back', 'Turn the gears on'], move(v, dt) { st.play = false; turnBy(v * 1.5 * dt); } },
    prev: { label: 'The other shape', press: () => step(-1) },
    next: { label: 'The other shape', press: () => step(1) },
  });
}

// ---- start ----
function start() {
  if (!gl) throw new Error('This browser does not offer WebGL 2.');
  look = makeLook(gl); scene = makeScene(gl, SHAPES, !!look);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); scene = null; });
  cv.addEventListener('webglcontextrestored', () => { look = makeLook(gl); scene = makeScene(gl, SHAPES, !!look); deskKey = ''; touch(); });
  $('loading').hidden = true;
  touch();
}
readHash(); controls(); measure();
try { start(); } catch (e) { oops(e); }
window.__gears = { st, drawn, SHAPES, get lit() { return !!look; }, get busy() { return st.play && st.e === 0; }, pick: (x, y) => pick(x, y),
  settle() { st.play = false; touch(); }, res(k) { res = k; measure(); }, redraw() { draw(); sync(); gl.finish(); },
  // where gear i's cap is on the screen, in CSS pixels, for the tests
  capAt(i) { const n = shape().normals[i], p = [n[0] * (R_OUT + 0.04), n[1] * (R_OUT + 0.04), n[2] * (R_OUT + 0.04), 1], m = cam.vp;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / w + 1) / 2 * view.W, (1 - y / w) / 2 * view.H, dot(n, cam.pos) > 1.2]; } };
