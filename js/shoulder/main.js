// Shoulder: the controller. The state is the zoom (0 Shoulder, 1 Joint, 2 Tendon), a condition or an exercise,
// and the arm's lift and turn. Everything drawn and every number shown comes from model.js.
import { unpack, makeModel, MUSCLES, clamp, smooth, apply, turn as turnDir } from './model.js?v=7579d653';
import { V } from './geom.js?v=7579d653';
import { makeView, COL } from './view.js?v=7579d653';
import { SRC, DOES, CONDITIONS, EXERCISES, MODEL_NOTE, MODEL_SRC } from './facts.js?v=7579d653';
import { gamepad } from '../gamepad/gamepad.js';

const STAMP = '7579d653';                                        // written by tests/shoulder/stamp.mjs: the data files' version
const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = $('view'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance' });
let model = null, view = null, broken = false;

const STOPS = [{ id: 'shoulder', name: 'Shoulder' }, { id: 'joint', name: 'Joint' }, { id: 'tendon', name: 'Tendon' }];
const LAST = STOPS.length - 1;
const st = { z: 0, mode: 'explore', cond: 'healthy', ex: 'external', lift: 0, turn: 0, phase: 0, play: false, yaw: 0, pitch: 0, pick: null };
const FOV = 30 * Math.PI / 180;
const free = { x: 0, y: 0, w: 1, h: 1 }, cam = { W: 1, H: 1, dpr: 1 };
let dirty = true, raf = 0, last = 0, fly = null;
const drawn = { n: 0 };

// ---- what each condition does to the model (drawn sizes are said on screen in facts.js) ----
const TEAR = { from: 0.84, half: 0.2, s0: 0.3, s1: 0.7 }; // where the supraspinatus is torn: the last part of its length, 0.4 of its width (s0, s1 set at start)
const SHAPE = {
  tendinopathy: (t) => (t > 0.72 ? { thick: 1 + 0.5 * smooth((t - 0.72) / 0.1) } : null),
  // a full tear: the hole is cut out of the surface (hole, in compute), and the tendon there is also flattened to
  // nothing over a little more than the hole, so that its edges are closed walls and the cut through it shows a gap
  full: (t, s) => (t > TEAR.from - 0.03 && s > TEAR.s0 - 0.07 && s < TEAR.s1 + 0.07 ? { thick: 0.02 } : null),
  partial: (t, s) => (t > TEAR.from && s > TEAR.s0 && s < TEAR.s1 ? { lift: 0.5 * smooth((t - TEAR.from) / 0.04) } : null),
};
const BURSA_MM = { healthy: 0.8, bursitis: 3 };
const RIDE_UP = 3;                                       // mm the ball rides up with a large full-thickness tear (drawn)

// ---- exercises: the pose through one round, p from 0 to 1 ----
const wave = (p) => (1 - Math.cos(2 * Math.PI * p)) / 2;   // 0 at the start, 1 halfway, back to 0
const EX_POSE = {
  pendulum: (p) => ({ elev: 90 + 12 * Math.sin(2 * Math.PI * p), plane: 90, rot: 0, elbow: 0, swing: 12 * Math.cos(2 * Math.PI * p) }),
  sleeper: (p) => ({ elev: 90, plane: 90, rot: -60 * wave(p), elbow: 90 }),
  external: (p) => ({ elev: 0, plane: 30, rot: 60 * wave(p), elbow: 90 }),
  internal: (p) => ({ elev: 0, plane: 30, rot: -60 * wave(p), elbow: 90 }),
  external90: (p) => ({ elev: 90, plane: 0, rot: 90 * wave(p), elbow: 90 }),
};
const EX_SECONDS = 6;

function poseNow() {
  if (st.mode === 'exercise') {
    const e = EX_POSE[st.ex](st.phase), P = { elev: e.elev, plane: e.plane, rot: e.rot, elbow: e.elbow };
    if (e.swing !== undefined) P.plane = 90 + e.swing;     // the pendulum's circle: forward and back, and out and in
    P.plane = clamp(P.plane, 0, 90); return P;
  }
  return { elev: st.lift, plane: 30, rot: st.turn, elbow: 90, up: st.cond === 'full' ? RIDE_UP : 0 };
}
// the pose's plane is one of those the stored table has, or between two of them: the model interpolates only by lift,
// so a plane between is drawn as the nearer of the two
const snapPlane = (pl) => (pl < 15 ? 0 : pl < 60 ? 30 : 90);

// ---- the scene ----
let frame = null;
const hidden = new Set();                                // for tests: parts left out of the picture
function compute() {
  const P = poseNow(); P.plane = snapPlane(P.plane);
  const T = model.pose(P), cond = st.mode === 'explore' ? st.cond : 'healthy';
  const soft = [], len = {};
  const deltFade = 1 - smooth((st.z - 0.3) / 0.55);      // the deltoid fades away where it is as the view goes in
  for (const b of model.built) {
    if (hidden.has(b.id)) continue;
    const shape = b.id === 'supra' ? SHAPE[cond] : null, m = model.muscle(b, T, shape ? { shape } : {});
    len[b.id] = m.length / m.rest;
    const delt = !b.cuff, works = st.mode === 'exercise' && EXERCISES.find((x) => x.id === st.ex).works.includes(b.id);
    const glow = st.pick === b.id ? 0.35 : works ? 0.16 : 0;
    if (delt && deltFade < 0.01) continue;
    const col = delt ? COL.deltoid : COL[b.id];
    soft.push({ key: b.id, b, pos: m.pos, col, col2: COL.tendon, blend: delt ? [0.93, 1.0] : [0.74, 0.88], glow,
      hole: b.id === 'supra' && cond === 'full' ? [TEAR.from, 1.01, TEAR.s0, TEAR.s1] : null, capCol: col.map((x) => x * 0.85), capCol2: COL.tendonCut, alpha: delt ? deltFade : 1,
      warm: b.id === 'supra' ? warmFor(b, m, cond) : null });
  }
  // the supraspinatus's cut turns from muscle to tendon along it, as its surface does
  const su = soft.find((x) => x.key === 'supra');
  if (su) { const ctr = (t) => { const i = Math.round(t * (su.b.S - 1)); let m = [0, 0, 0]; for (let j = 0; j < 32; j++) m = V.add(m, [su.pos[3 * (i * 32 + j)], su.pos[3 * (i * 32 + j) + 1], su.pos[3 * (i * 32 + j) + 2]]); return V.mul(m, 1 / 32); }; su.capG = [ctr(0.74), ctr(0.88)]; }
  // the cut goes through the tendon where it is now: through the middle of its slice at 0.86 of its length, square
  // to the tendon's width, so that whatever the pose it shows the tendon along its length
  let cut0 = CUT0 && { p: apply(T.scapula, CUT0.p), n: V.norm(turnDir(T.scapula, CUT0.n)) }, view0 = null;
  if (su && CUT0) {
    const i = Math.round(0.86 * (su.b.S - 1)), P3 = (j) => [su.pos[3 * (i * 32 + j)], su.pos[3 * (i * 32 + j) + 1], su.pos[3 * (i * 32 + j) + 2]];
    let n = V.norm(V.sub(P3(15), P3(0))); if (V.dot(n, cut0.n) < 0) n = V.mul(n, -1);
    const ctr = (t) => { const k = Math.round(t * (su.b.S - 1)); let m = [0, 0, 0]; for (let j = 0; j < 32; j++) m = V.add(m, [su.pos[3 * (k * 32 + j)], su.pos[3 * (k * 32 + j) + 1], su.pos[3 * (k * 32 + j) + 2]]); return V.mul(m, 1 / 32); };
    cut0 = { p: ctr(0.86), n }; view0 = V.mul(V.add(ctr(0.8), ctr(0.98)), 0.5);   // the view: the tendon's last part, where tears are
  }
  // impingement: the lit corners near the cut light the cut face too
  if (su && su.warm && cut0) {
    const c = { n: cut0.n, d: -V.dot(cut0.n, cut0.p) }, pts = [];
    for (let i = 0; i < su.warm.length && pts.length < 144; i++) if (su.warm[i] > 0 && Math.abs(V.dot(c.n, [su.pos[3 * i], su.pos[3 * i + 1], su.pos[3 * i + 2]]) + c.d) < 2.5) pts.push(su.pos[3 * i], su.pos[3 * i + 1], su.pos[3 * i + 2]);
    su.capWarm = new Float32Array(pts);
  }
  const bu = model.bursa(BURSA_MM[cond] ?? BURSA_MM.healthy), bm = model.muscle(bu, T);
  soft.push({ key: 'bursa' + (BURSA_MM[cond] ?? 0.8), b: bu, pos: bm.pos, col: COL.bursa, capCol: COL.bursaCut, glow: st.pick === 'bursa' ? 0.35 : 0,
    alpha: 0.55 + 0.45 * smooth((st.z - 1.2) / 0.5) });   // see-through until the cut, so that the tendon under it shows
  const g = model.gap(T);
  frame = { P, T, soft, len, gap: g.mm, gapAt: g, slide: T.glide, cond, cut0, view0 };
}
// impingement: the corners of the tendon that the acromion presses on at this pose, that is, the corners the model
// has to push out of the shoulder blade (none are pushed with the arm at rest)
function warmFor(b, m, cond) {
  if (cond !== 'impingement') return null;
  const out = new Float32Array(m.pressed.length);
  for (let i = 0; i < out.length; i++) if (b.t[i] > 0.6 && m.pressed[i] > 0) out[i] = 0.5 + 0.5 * smooth(m.pressed[i] / 1.5);
  return out;
}

// ---- the camera ----
function aimAt(z) {
  const M = model.marks, T = frame.T, ball = apply(T.humerus, M.HC), up = turnDir(T.scapula, [0, 1, 0]);
  const blade = apply(T.scapula, [-115, 1265, 40]);
  const views = [
    { at: V.mul(V.add(V.add(ball, blade), [0, -40, 0]), 0.5), size: 300, dir: V.norm([-1, 0.45, -0.4]) },
    { at: V.add(V.mul(V.add(ball, blade), 0.5), [0, 10, 0]), size: 170, dir: V.norm([-1, 0.6, -0.45]) },
    { at: frame.view0 || V.add(ball, V.mul(up, 22)), size: 60, dir: cutN() },
  ];
  const i = Math.min(LAST - 1, Math.floor(z)), f = smooth(z - i), a = views[i], b = views[i + 1];
  const at = V.add(V.mul(a.at, 1 - f), V.mul(b.at, f)), size = Math.exp(Math.log(a.size) * (1 - f) + Math.log(b.size) * f);
  let dir = V.norm(V.add(V.mul(a.dir, 1 - f), V.mul(b.dir, f)));
  // the visitor's own turn of the view
  const ry = st.yaw, rp = st.pitch, side = V.norm(V.cross([0, 1, 0], dir));
  dir = V.norm(V.add(V.mul(dir, Math.cos(ry)), V.mul(V.cross([0, 1, 0], dir), Math.sin(ry))));
  dir = V.norm(V.add(V.mul(dir, Math.cos(rp)), V.mul([0, 1, 0], Math.sin(rp)))); void side;
  const fh = free.h / cam.H, dist = size / 2 / Math.tan(FOV / 2) / fh;
  return { eye: V.add(at, V.mul(dir, dist)), at, up: [0, 1, 0], fov: FOV, W: cam.W, H: cam.H, near: dist * 0.05, far: dist * 6,
    ox: 2 * (free.x + free.w / 2) / cam.W - 1, oy: 1 - 2 * (free.y + free.h / 2) / cam.H, dist, size, dir };
}
// the cut, front to back through the supraspinatus tendon where it passes under the acromion (compute() places it
// on the tendon as it is posed). Its normal points backward, toward the eye: the back half fades.
let CUT0 = null;
function cutN() { return frame.cut0.n; }
function cutPlane(c) {
  const n = frame.cut0.n, p = frame.cut0.p, d = -V.dot(n, p);
  const a = V.norm(V.cross(n, [0, 1, 0])), b = V.cross(a, n), R = 400;
  const facing = clamp(V.dot(c.dir, n) * 2.5);           // turned round behind the cut, it fades away
  const amount = smooth((st.z - 1.15) / 0.7) * facing;
  return { plane: [...n, d], amount, c0: V.add(p, V.add(V.mul(a, -R), V.mul(b, -R))), c1: V.add(p, V.add(V.mul(a, R), V.mul(b, -R))), c2: V.add(p, V.add(V.mul(a, R), V.mul(b, R))), c3: V.add(p, V.add(V.mul(a, -R), V.mul(b, R))) };
}

function draw() {
  drawn.n++;
  const c = aimAt(st.z), cut = cutPlane(c);
  view.draw({ T: frame.T, soft: frame.soft, cut }, c);
  frame.cam = c; frame.cut = cut;
}

// ---- labels on the picture ----
const sliceAt = (key, t) => { const s = frame.soft.find((x) => x.key === key), b = s.b, i = Math.round(t * (b.S - 1)), M = 32; let m = [0, 0, 0]; for (let j = 0; j < M; j++) m = V.add(m, [s.pos[3 * (i * M + j)], s.pos[3 * (i * M + j) + 1], s.pos[3 * (i * M + j) + 2]]); return V.mul(m, 1 / M); };
const bone = (b, p) => apply(frame.T[model.bodyOf(b)], p);
// a point in the tear, on the cut: in the slice at 0.92 of the tendon's length, f of the way up from its underside
function tearAt(f) {
  const s = frame.soft.find((x) => x.key === 'supra'), i = Math.round(0.92 * (s.b.S - 1)), n = frame.cut0.n, d = -V.dot(n, frame.cut0.p);
  const ring = Array.from({ length: 32 }, (_, j) => [s.pos[3 * (i * 32 + j)], s.pos[3 * (i * 32 + j) + 1], s.pos[3 * (i * 32 + j) + 2]]);
  // the middle of the slice, and its top and bottom faces at the corners nearest the cut
  const near = (a) => a.reduce((b, q) => (Math.abs(V.dot(n, q) + d) < Math.abs(V.dot(n, b) + d) ? q : b));
  const top = near(ring.slice(0, 16)), bot = near(ring.slice(16)), mid = (q) => V.sub(q, V.mul(n, V.dot(n, q) + d));
  return V.add(V.mul(mid(bot), 1 - f), V.mul(mid(top), f));
}
// each label names a part (key) and a point on it; its dot goes to the nearest place the part is really seen, and the
// label is left out when the part is not seen near that point
const LABELS = [
  { z: [-1, 0.6], key: 'scapula', text: 'Shoulder blade', sub: 'scapula', at: () => bone('scapula', [-90, 1230, 0]), d: [0.12, 0.1] },
  { z: [-1, 0.6], key: 'clavicle', text: 'Collarbone', sub: 'clavicle', at: () => bone('clavicle', [-70, 1335, 105]), d: [0.06, -0.14] },
  { z: [-1, 0.6], key: 'humerus', text: 'Arm bone', sub: 'humerus', at: () => bone('humerus', [-195, 1150, 70]), d: [-0.16, 0.06], side: 'r' },
  { z: [-1, 0.6], key: 'deltM', text: 'Deltoid', sub: 'lifts the arm', at: () => sliceAt('deltM', 0.45), d: [-0.14, -0.12], side: 'r' },
  { z: [0.6, 1.6], key: 'scapula', text: 'Acromion', sub: 'the bony roof of the shoulder', at: () => bone('scapula', V.add(model.marks.AC, [-14, 2, -6])), d: [-0.1, -0.16], side: 'r' },
  { z: [0.6, 1.6], key: 'supra', text: 'Supraspinatus', at: () => sliceAt('supra', 0.3), d: [0.12, -0.14] },
  { z: [0.6, 1.6], key: 'infra', text: 'Infraspinatus', at: () => sliceAt('infra', 0.4), d: [0.14, 0.04] },
  { z: [0.6, 1.6], key: 'tminor', text: 'Teres minor', at: () => sliceAt('tminor', 0.55), d: [0.12, 0.12] },
  { z: [0.6, 1.6], key: 'subscap', text: 'Subscapularis', sub: 'on the front of the shoulder blade', at: () => sliceAt('subscap', 0.7), d: [0.1, 0.18] },
  { z: [1.6, 9], key: 'scapula', text: 'Acromion', at: () => frame.gapAt.to, d: [-0.1, -0.14], side: 'r' },
  { z: [1.6, 9], key: () => 'bursa' + (BURSA_MM[frame.cond] ?? 0.8), text: 'Bursa', sub: 'a thin sac that lets the tendon slide', at: () => sliceAt('bursa' + (BURSA_MM[frame.cond] ?? 0.8), 0.7), d: [0.14, -0.14] },
  { z: [1.6, 9], key: 'supra', text: 'Supraspinatus tendon', at: () => sliceAt('supra', 0.94), d: [-0.16, 0.12], side: 'r' },
  // the tears: pointed at where the tendon is torn, on the cut (no check that a part is seen there: a hole is not a part)
  { z: [1.6, 9], key: null, when: () => frame.cond === 'full', text: 'Hole through the tendon', at: () => tearAt(0.5), d: [0.1, -0.2] },
  { z: [1.6, 9], key: null, when: () => frame.cond === 'partial', text: 'Torn from below', sub: 'the joint side', at: () => tearAt(0.15), d: [0.1, 0.2] },
  { z: [1.6, 9], key: 'humerus', text: 'Ball', sub: 'head of the arm bone', at: () => V.add(frame.gapAt.from, V.mul(V.norm(V.sub(apply(frame.T.humerus, model.marks.HC), frame.gapAt.from)), 10)), d: [0.12, 0.16] },
];
const NS = 'http://www.w3.org/2000/svg';
function makeLabels() {
  for (const L of LABELS) {
    L.el = document.createElement('div'); L.el.className = 'tag' + (L.side === 'r' ? ' r' : ''); L.el.append(L.text);
    if (L.sub) { const s = document.createElement('small'); s.textContent = L.sub; L.el.append(s); }
    L.el.style.display = 'none'; $('labels').append(L.el);
    L.line = document.createElementNS(NS, 'line'); L.dot = document.createElementNS(NS, 'circle'); L.dot.setAttribute('r', 3); $('leaders').append(L.line, L.dot);
  }
}
let placed = [];
function labels() {
  placed = [];
  for (const L of LABELS) {
    const op = smooth((st.z - L.z[0]) / 0.12) * (1 - smooth((st.z - L.z[1] + 0.12) / 0.12));
    const p0 = op > 0.02 && (!L.when || L.when()) ? view.project(L.at(), cam.W, cam.H) : null;
    const pt = p0 && (L.key === null ? p0 : view.nearest(typeof L.key === 'function' ? L.key() : L.key, p0[0], p0[1], 48));
    const on = !!pt && pt[0] > free.x + 8 && pt[0] < free.x + free.w - 8 && pt[1] > free.y + 8 && pt[1] < free.y + free.h - 8, disp = on ? '' : 'none';
    if (L.el.style.display !== disp) { L.el.style.display = disp; L.line.style.display = L.dot.style.display = disp; }
    if (!on) continue;
    if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    const f = free.h, tx = clamp(pt[0] + L.d[0] * f, free.x + (L.side === 'r' ? L.w + 6 : 6), free.x + free.w - (L.side === 'r' ? 6 : L.w + 6));
    let ty = clamp(pt[1] + L.d[1] * f, free.y + L.h / 2 + 6, free.y + free.h - L.h / 2 - 6);
    const x0 = L.side === 'r' ? tx - L.w : tx, hit = (y) => placed.find((r) => x0 < r[2] + 6 && x0 + L.w > r[0] - 6 && y - L.h / 2 < r[3] + 3 && y + L.h / 2 > r[1] - 3);
    for (let i = 0, r; i < 6 && (r = hit(ty)); i++) ty = r[3] + L.h / 2 + 4;
    placed.push([x0, ty - L.h / 2, x0 + L.w, ty + L.h / 2]);
    L.el.style.opacity = op.toFixed(2);
    L.el.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) translate(${L.side === 'r' ? '-100%' : '0'},-50%)`;
    for (const [k, v] of [['x1', pt[0]], ['y1', pt[1]], ['x2', tx + (L.side === 'r' ? 5 : -5)], ['y2', ty]]) L.line.setAttribute(k, v.toFixed(1));
    L.dot.setAttribute('cx', pt[0].toFixed(1)); L.dot.setAttribute('cy', pt[1].toFixed(1)); L.line.style.opacity = L.dot.style.opacity = op.toFixed(2);
  }
}

// ---- the panel ----
const shown = {};
const set = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
const mm = (x) => x.toFixed(1) + ' mm';
function scaleBar() {
  const k = free.h / frame.cam.size, want = 96 / k, e = Math.pow(10, Math.floor(Math.log10(want))), n = want / e >= 5 ? 5 : want / e >= 2 ? 2 : 1, len = n * e;
  $('scaleBar').style.width = (len * k).toFixed(1) + 'px'; set('scaleText', len >= 10 ? `${len / 10} cm` : `${len} mm`);
}
const item = () => (st.mode === 'explore' ? CONDITIONS.find((c) => c.id === st.cond) : EXERCISES.find((x) => x.id === st.ex));
function sync() {
  const zi = $('zoom'), lvl = Math.round(st.z);
  if (Math.abs(zi.value - st.z) > 0.0015) zi.value = st.z;
  zi.style.setProperty('--v', (st.z / LAST * 100) + '%'); zi.setAttribute('aria-valuetext', STOPS[lvl].name);
  set('zoomV', STOPS[lvl].name);
  for (const b of $('stops').children) b.setAttribute('aria-current', String(+b.dataset.i === lvl));
  [...$('zticks').children].forEach((t, i) => t.classList.toggle('on', i === lvl));
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode));
  for (const b of $('conds').children) b.setAttribute('aria-pressed', String(b.dataset.id === st.cond));
  for (const b of $('exs').children) b.setAttribute('aria-pressed', String(b.dataset.id === st.ex));
  const ex = st.mode === 'exercise';
  if (shown.mode !== st.mode) { shown.mode = st.mode; $('condCtl').hidden = ex; $('armCtl').hidden = ex; $('exCtl').hidden = !ex; $('exPlay').hidden = !ex; }
  const P = frame.P;
  for (const [id, v, txt] of [['lift', st.lift, `${Math.round(st.lift)}°`], ['turn', st.turn, st.turn === 0 ? '0°' : `${Math.abs(Math.round(st.turn))}° ${st.turn > 0 ? 'out' : 'in'}`]]) {
    const el = $(id); if (+el.value !== v) el.value = v;
    el.style.setProperty('--v', ((v - el.min) / (el.max - el.min) * 100) + '%'); el.setAttribute('aria-valuetext', txt); set(id + 'V', txt);
  }
  const ph = $('phase'); if (Math.abs(ph.value - st.phase * 1000) > 1) ph.value = Math.round(st.phase * 1000);
  ph.style.setProperty('--v', (st.phase * 100) + '%');
  const ptxt = `lifted ${Math.round(P.elev)}°, turned ${Math.abs(Math.round(P.rot))}° ${P.rot >= 0 ? 'out' : 'in'}`; ph.setAttribute('aria-valuetext', ptxt); set('phaseV', ptxt);
  const pl = st.play ? 'Pause' : 'Play the exercise';
  if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', String(st.play)); $('play').setAttribute('aria-label', pl); }
  const it = item(), key = st.mode + it.id;
  if (shown.cap !== key) {
    shown.cap = key;
    $('capTitle').textContent = it.title || it.name; $('capBody').textContent = it.body;
    $('note').textContent = it.note || ''; $('modelNote').textContent = modelNote;
    sources(it);
  }
  set('gapV', mm(frame.gap));
  for (const li of $('muscleList').children) {
    const id = li.dataset.id, l = frame.len[id];
    li.querySelector('b').textContent = l ? `${l >= 1 ? '+' : '−'}${Math.abs(Math.round((l - 1) * 100))}%` : '';
    const on = ex && it.works && it.works.includes(id);
    li.classList.toggle('works', on); li.classList.toggle('stretch', on && it.role === 'stretch'); li.classList.toggle('relaxed', on && it.role === 'relaxed');
    li.querySelector('button').setAttribute('aria-pressed', String(st.pick === id));
  }
  scaleBar(); writeHash();
}
let modelNote = '';
function sources(it) {
  const ol = $('sources'); ol.replaceChildren();
  for (const k of [...new Set([...(it.src || []), ...MODEL_SRC])]) { const li = document.createElement('li'), a = document.createElement('a'); a.href = SRC[k].url; a.textContent = SRC[k].name; a.rel = 'noopener'; li.append(a); ol.append(li); }
}
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', '#' + new URLSearchParams(st.mode === 'explore' ? { z: st.z.toFixed(2), c: st.cond, lift: Math.round(st.lift), turn: Math.round(st.turn) } : { z: st.z.toFixed(2), ex: st.ex, p: st.phase.toFixed(3) })), 400);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('z')) st.z = clamp(parseFloat(q.get('z')) || 0, 0, LAST);
  if (CONDITIONS.some((c) => c.id === q.get('c'))) { st.mode = 'explore'; st.cond = q.get('c'); }
  if (EXERCISES.some((x) => x.id === q.get('ex'))) { st.mode = 'exercise'; st.ex = q.get('ex'); }
  if (q.has('lift')) st.lift = clamp(parseFloat(q.get('lift')) || 0, 0, 150);
  if (q.has('turn')) st.turn = clamp(parseFloat(q.get('turn')) || 0, -60, 60);
  if (q.has('p')) st.phase = clamp(parseFloat(q.get('p')) || 0);
  return q.has('z');
}

// ---- time ----
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function touch() { dirty = true; kick(); }
function tick(now) {
  raf = 0;
  if (broken || !model) return;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  if (st.play) { st.phase = (st.phase + dt / EX_SECONDS) % 1; dirty = true; }
  if (fly) {
    const d = fly.to - st.z, step = Math.sign(d) * Math.min(Math.abs(d), dt * (0.6 + 3 * Math.abs(d)));
    st.z += step; if (Math.abs(fly.to - st.z) < 0.002) { st.z = fly.to; fly = null; } dirty = true;
  }
  if (dirty) { dirty = false; try { compute(); draw(); labels(); sync(); } catch (e) { oops(e); } }
  if (st.play || fly) kick(); else last = 0;
}
function oops(e) { console.error(e); if (broken) return; broken = true; st.play = false; fly = null; $('oops').hidden = false; }
function zoomTo(z) { z = clamp(z, 0, LAST); if (reduced) { st.z = z; fly = null; } else fly = { to: z }; touch(); }

function measure() {
  const W = innerWidth, H = innerHeight, r = $('panel').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1) * res;
  if (r.right < W * 0.7) { free.x = r.right + 12; free.y = 0; free.w = W - free.x; free.h = H; }
  else { free.x = 0; free.y = 52; free.w = W; free.h = Math.max(120, r.top - 52); }
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  cam.W = W; cam.H = H; cam.dpr = dpr; for (const L of LABELS) L.w = 0; touch();
}
let res = +(new URLSearchParams(location.search).get('res')) || 1;

// ---- controls ----
function controls() {
  STOPS.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s.name; b.dataset.i = i; b.style.left = (i / LAST * 100) + '%'; b.addEventListener('click', () => zoomTo(i)); $('stops').append(b); });
  STOPS.forEach((s, i) => { const t = document.createElement('i'); t.style.left = (i / LAST * 100) + '%'; $('zticks').append(t); });
  const chip = (list, box, pick) => list.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c.name; b.dataset.id = c.id; b.addEventListener('click', () => pick(c.id)); $(box).append(b); });
  chip(CONDITIONS, 'conds', (id) => { st.cond = id; touch(); });
  chip(EXERCISES, 'exs', (id) => { st.ex = id; st.phase = 0; st.play = !reduced; touch(); });
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { st.mode = b.dataset.mode; st.play = st.mode === 'exercise' && !reduced; if (st.mode === 'explore') st.phase = 0; touch(); });
  $('zoom').addEventListener('input', (e) => { fly = null; st.z = clamp(+e.target.value, 0, LAST); touch(); });
  $('lift').addEventListener('input', (e) => { st.lift = +e.target.value; touch(); });
  $('turn').addEventListener('input', (e) => { st.turn = +e.target.value; touch(); });
  $('phase').addEventListener('input', (e) => { st.phase = e.target.value / 1000; st.play = false; touch(); });
  $('play').addEventListener('click', () => { st.play = !st.play; touch(); });
  for (const [id, step] of [['zoom', 0.05]]) $(id).addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return;
    e.preventDefault(); e.target.value = +e.target.value + d * step; e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const m of MUSCLES) {
    const li = document.createElement('li'), b = document.createElement('button'), name = document.createElement('span'), v = document.createElement('b'), sm = document.createElement('small');
    li.dataset.id = m.id; b.type = 'button'; name.textContent = m.name; sm.textContent = DOES[m.id].text; b.append(name, v, sm); li.append(b); $('muscleList').append(li);
    b.addEventListener('click', () => { st.pick = st.pick === m.id ? null : m.id; touch(); });
    b.addEventListener('pointerenter', () => { st.pick = m.id; touch(); }); b.addEventListener('pointerleave', () => { st.pick = null; touch(); });
  }
  // drag on the picture turns the view; the wheel and two fingers zoom, as the Zoom slider does
  const fingers = new Map(); let span = 0, drag = null;
  // while the browser's own zoom is in (a double tap on a phone), two fingers are the browser's, to get back out
  const pageZoomed = () => (window.visualViewport ? visualViewport.scale : 1) > 1.01;
  const leavePinch = () => cv.classList.toggle('pagezoom', pageZoomed());
  if (window.visualViewport) { visualViewport.addEventListener('resize', leavePinch); leavePinch(); }
  cv.addEventListener('pointerdown', (e) => { fingers.set(e.pointerId, [e.clientX, e.clientY]); if (fingers.size === 1) drag = [e.clientX, e.clientY]; else { drag = null; span = spanOf(); } cv.setPointerCapture?.(e.pointerId); });
  const spanOf = () => { const [a, b] = [...fingers.values()]; return Math.max(24, Math.hypot(a[0] - b[0], a[1] - b[1])); };
  cv.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 2) { if (pageZoomed()) { span = 0; return; } const d = spanOf(); if (span) { fly = null; st.z = clamp(st.z + Math.log(d / span) * 2, 0, LAST); touch(); } span = d; return; }
    if (drag) { st.yaw = clamp(st.yaw - (e.clientX - drag[0]) * 0.006, -1.4, 1.4); st.pitch = clamp(st.pitch + (e.clientY - drag[1]) * 0.006, -0.9, 0.9); drag = [e.clientX, e.clientY]; touch(); }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(type, (e) => { fingers.delete(e.pointerId); span = 0; drag = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); fly = null; st.z = clamp(st.z - e.deltaY * (e.deltaMode ? 0.05 : 0.002), 0, LAST); touch(); }, { passive: false });
  $('reload').addEventListener('click', () => location.reload());
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); broken = true; $('oops').hidden = false; });
  cv.addEventListener('webglcontextrestored', () => location.reload());
  addEventListener('resize', measure);
  addEventListener('hashchange', () => { if (readHash()) { st.play = false; fly = null; touch(); } });
  gamepad({
    look: { label: 'Turn the view', move(x, y, dt) { st.yaw = clamp(st.yaw - x * 1.6 * dt, -1.4, 1.4); st.pitch = clamp(st.pitch - y * 1.2 * dt, -0.9, 0.9); touch(); } },
    zoom: { move(v, dt) { fly = null; st.z = clamp(st.z + v * 1.2 * dt, 0, LAST); touch(); } },
    prev: { label: 'Zoom out to the scale before', press: () => zoomTo(Math.ceil((fly ? fly.to : st.z) - 1e-6) - 1) },
    next: { label: 'Zoom in to the next scale', press: () => zoomTo(Math.floor((fly ? fly.to : st.z) + 1e-6) + 1) },
  });
}

// ---- start ----
async function start() {
  if (!gl) throw new Error('This browser does not offer WebGL 2.');
  const get = (f) => fetch('../shoulder/data/' + f + '?v=' + STAMP).then((r) => { if (!r.ok) throw new Error(f + ': ' + r.status); return f.endsWith('.bin') ? r.arrayBuffer() : r.json(); });
  const [bj, bb, mj, pj] = await Promise.all([get('bones.json'), get('bones.bin'), get('muscles.json'), get('pose.json')]);
  await new Promise((r) => setTimeout(r, 0));
  model = makeModel(unpack(bj, bb), mj, pj);
  view = makeView(gl, model);
  // the cut: through the supraspinatus near its end, square to the tendon's width, in the shoulder blade's frame
  const s = model.built[0].sl[Math.round(0.86 * (model.built[0].S - 1))];
  let n = V.norm([s.U[0], 0, s.U[2]]); if (n[2] > 0) n = V.mul(n, -1);   // seen from behind, the back half fades
  CUT0 = { p: s.c, n };
  // the tears are drawn across the part of the tendon's width that the cut goes through, so that the cut shows them
  const sup = model.built[0], near = sup.rest.map((p, i) => [p, i]).filter(([p, i]) => sup.t[i] > TEAR.from && sup.at[i].s !== undefined && Math.abs(V.dot(V.sub(p, s.c), n)) < 3);
  const sc = near.reduce((a, [, i]) => a + sup.at[i].s, 0) / Math.max(1, near.length);
  TEAR.s0 = clamp(sc - TEAR.half, 0.02, 0.98); TEAR.s1 = clamp(sc + TEAR.half, 0.02, 0.98);
  const maxSlide = Math.max(...Object.values(pj.planes).flat().flatMap((r) => r.glide));
  modelNote = MODEL_NOTE.replace('between the bones.', `between the bones (up to ${maxSlide.toFixed(1)} mm).`);
  $('loading').hidden = true;
}
controls(); makeLabels(); readHash(); measure();
start().then(() => { measure(); }).catch(oops);
window.__shoulder = { st, hidden, drawn, free, stops: STOPS, get model() { return model; }, get frame() { return frame; }, get busy() { return !!(fly || st.play); },
  settle() { if (fly) { st.z = fly.to; fly = null; } st.play = false; touch(); }, res(k) { res = k; measure(); },
  redraw() { compute(); draw(); labels(); sync(); gl.finish(); } };
