// Shoulder: the controller. The state is the zoom (0 Shoulder, 1 Joint, 2 Tendon), a condition or an exercise,
// and the arm's lift and turn. Everything drawn and every number shown comes from model.js.
import { unpack, makeModel, MUSCLES, clamp, smooth, apply, turn as turnDir } from './model.js?v=c69aaabe';
import { V } from './geom.js?v=c69aaabe';
import { makeView, COL } from './view.js?v=c69aaabe';
import { SRC, DOES, ALONE, CONDITIONS, EXERCISES, MODEL_NOTE, MODEL_SRC } from './facts.js?v=c69aaabe';
import { EX_POSE, EX_STILL, EX_SECONDS } from './exercises.js?v=c69aaabe';
import { gamepad } from '../gamepad/gamepad.js?v=c69aaabe';
import { touchSliders } from '../touch/slider.js?v=c69aaabe';

const PINCH = 0.9;   // scales of zoom for each e-fold of finger spread: one full spread is about one scale, as on Maple and Engine

const STAMP = 'c69aaabe';                                        // written by tests/stamp.mjs: the data files' version
const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = $('view'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance' });
let model = null, view = null, broken = false;

const STOPS = [{ id: 'shoulder', name: 'Shoulder' }, { id: 'joint', name: 'Joint' }, { id: 'tendon', name: 'Tendon' }];
const LAST = STOPS.length - 1;
// flex: the muscle pulling alone, if any ({ id, c }: c from 0, where the pull starts, to 1, the end of its pull)
const st = { z: 0, mode: 'explore', cond: 'healthy', ex: 'external', lift: 0, turn: 0, phase: 0, play: false, yaw: 0, pitch: 0, pick: null, flex: null };
const FOV = 30 * Math.PI / 180;
const free = { x: 0, y: 0, w: 1, h: 1 }, cam = { W: 1, H: 1, dpr: 1 };
// look: while a muscle pulls, the Shoulder view stands back to show the elbow (wide), and the deltoid fades where
// it is when it hides the muscle that pulls (see); the view goes round to the front for a muscle that cannot be seen
// from behind (front, in radians); and the part of the deltoid that pulls stays in the picture as the view goes in
// (deltA, deltM, deltP). Each eases from 0 to where it is wanted.
const look = { wide: 0, see: 0, front: 0, deltA: 0, deltM: 0, deltP: 0 };
// how far round: the subscapularis is seen from straight in front; the front of the deltoid from the front and the
// side, so that the arm it lifts forward is not lifted straight at the eye
const FRONT = { subscap: 1.8, deltA: 1.1 };
function looks() {
  const id = st.flex?.id, cuff = id ? MUSCLES.find((m) => m.id === id).cuff : false;
  return { wide: id ? 1 : 0, see: cuff ? 1 : 0, front: FRONT[id] || 0, deltA: +(id === 'deltA'), deltM: +(id === 'deltM'), deltP: +(id === 'deltP') };
}
let dirty = true, raf = 0, last = 0, fly = null, pull = null;   // pull: the flex easing from one c to another
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
// The front and the middle of the deltoid pulling alone also pull the ball up, by as much (drawn; facts.js ALONE)
const RIDES = new Set(['deltA', 'deltM']);

const exSeconds = () => EX_SECONDS[st.ex] || 6;

function basePose() {
  if (st.mode === 'exercise') {
    const e = EX_POSE[st.ex](st.phase); return { elev: e.elev, plane: e.plane, rot: e.rot, elbow: e.elbow };
  }
  return { elev: st.lift, plane: 30, rot: st.turn, elbow: 90, up: st.cond === 'full' ? RIDE_UP : 0 };
}
// One muscle pulling alone moves the arm from where the sliders or the exercise put it (model.contract). The path
// is worked out again only when that starting pose changes.
const PULL_DEG = 40;                                     // how far the arm turns at the end of a pull, in degrees
let pathMemo = { key: '', path: null };
function pathFor(id, P0) {
  const key = id + JSON.stringify(P0);
  if (pathMemo.key !== key) pathMemo = { key, path: model.contract(model.built.find((b) => b.id === id), P0, PULL_DEG) };
  return pathMemo.path;
}
function along(path, c) {
  const x = clamp(c) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(x)), f = x - i, a = path[Math.max(0, i)], b = path[Math.min(path.length - 1, i + 1)];
  if (path.length < 2) return { ...path[0] };
  const mix = (k) => a[k] + (b[k] - a[k]) * f;
  return { ...a, elev: mix('elev'), plane: mix('plane'), rot: mix('rot'), len: mix('len') };
}
function poseNow() {
  const P = basePose();
  if (!st.flex || !model) return P;
  const q = along(pathFor(st.flex.id, P), st.flex.c);
  return { elev: q.elev, plane: q.plane, rot: q.rot, elbow: P.elbow, up: Math.max(P.up ?? 0, RIDES.has(st.flex.id) ? RIDE_UP * clamp(st.flex.c) : 0) };
}

// ---- the scene ----
let frame = null;
const hidden = new Set();                                // for tests: parts left out of the picture
function compute() {
  const P = poseNow();
  const T = model.pose(P), cond = st.mode === 'explore' ? st.cond : 'healthy';
  const soft = [], len = {};
  const deltFade = (1 - smooth((st.z - 0.3) / 0.55)) * (1 - 0.8 * smooth(look.see));   // the deltoid fades away where it is as the view goes in
  const stays = (id) => smooth(look[id]) * (1 - smooth((st.z - 1.15) / 0.6));           // but the part that pulls stays, as far in as the Joint
  for (const b of model.built) {
    if (hidden.has(b.id)) continue;
    const shape = b.id === 'supra' ? SHAPE[cond] : null, m = model.muscle(b, T, shape ? { shape } : {});
    len[b.id] = m.length / m.rest;
    const delt = !b.cuff, works = st.mode === 'exercise' && EXERCISES.find((x) => x.id === st.ex).works.includes(b.id);
    const pulls = st.flex && st.flex.id === b.id ? 0.08 + 0.14 * clamp(st.flex.c) : 0;   // lit, but still its own color
    const glow = Math.max(st.pick === b.id ? 0.35 : works ? 0.16 : 0, pulls);
    const alpha = delt ? Math.max(deltFade, stays(b.id)) : 1;
    if (alpha < 0.01) continue;
    const col = delt ? COL.deltoid : COL[b.id];
    soft.push({ key: b.id, b, pos: m.pos, col, col2: COL.tendon, blend: delt ? [0.93, 1.0] : [0.74, 0.88], glow,
      hole: b.id === 'supra' && cond === 'full' ? [TEAR.from, 1.01, TEAR.s0, TEAR.s1] : null, capCol: col.map((x) => x * 0.85), capCol2: COL.tendonCut, alpha,
      warm: b.id === 'supra' ? warmFor(b, m, cond) : null });
  }
  // the supraspinatus's cut turns from muscle to tendon along it, as its surface does: each point of the cut takes the
  // color of the nearest point of the muscle's middle line, so that it follows the muscle however it bends
  const su = soft.find((x) => x.key === 'supra');
  if (su) { const ctr = (t) => { const i = Math.round(t * (su.b.S - 1)); let m = [0, 0, 0]; for (let j = 0; j < 32; j++) m = V.add(m, [su.pos[3 * (i * 32 + j)], su.pos[3 * (i * 32 + j) + 1], su.pos[3 * (i * 32 + j) + 2]]); return V.mul(m, 1 / 32); }; const pts = []; for (let i = 0; i < 17; i++) pts.push(...ctr(0.6 + 0.4 * i / 16)); su.capG = { pts: new Float32Array(pts), t: [0.6, 1, 0.74, 0.88] }; }
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
  // the bursa lies on the tendon as it is drawn at this pose (without the tendon, in a test, it moves by itself)
  const bu = model.bursa(BURSA_MM[cond] ?? BURSA_MM.healthy), bm = su ? model.bursaOn(bu, su.pos) : model.muscle(bu, T);
  soft.push({ key: 'bursa' + (BURSA_MM[cond] ?? 0.8), b: bu, pos: bm.pos, col: COL.bursa, capCol: COL.bursaCut, glow: st.pick === 'bursa' ? 0.35 : 0,
    alpha: 0.55 + 0.45 * smooth((st.z - 1.2) / 0.5) });   // see-through until the cut, so that the tendon under it shows
  const g = model.gap(T);
  // where the hole is: the middle of the tendon there as it would be untorn
  const whole = cond === 'full' && su ? model.muscle(su.b, T).pos : null;
  frame = { P, T, soft, len, gap: g.mm, gapAt: g, slide: T.glide, cond, cut0, view0, whole };
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
    // in the exercises the view stands back far enough to show the elbow, wherever the arm is, so that the arm's
    // movement can be seen; it does not follow the arm
    st.mode === 'exercise' ? { at: V.mul(V.add(V.add(ball, blade), [0, -40, 0]), 0.5), size: 520, dir: V.norm([-1, 0.45, -0.4]) }
      : { at: V.mul(V.add(V.add(ball, blade), [0, -40, 0]), 0.5), size: Math.exp(Math.log(300) + (Math.log(520) - Math.log(300)) * smooth(look.wide)), dir: V.norm([-1, 0.45, -0.4]) },
    { at: V.add(V.mul(V.add(ball, blade), 0.5), [0, 10, 0]), size: 170, dir: V.norm([-1, 0.6, -0.45]) },
    { at: frame.view0 || V.add(ball, V.mul(up, 22)), size: 60, dir: cutN() },
  ];
  const i = Math.min(LAST - 1, Math.floor(z)), f = smooth(z - i), a = views[i], b = views[i + 1];
  const at = V.add(V.mul(a.at, 1 - f), V.mul(b.at, f)), size = Math.exp(Math.log(a.size) * (1 - f) + Math.log(b.size) * f);
  let dir = V.norm(V.add(V.mul(a.dir, 1 - f), V.mul(b.dir, f)));
  // the visitor's own turn of the view
  // round to the front for a muscle that cannot be seen from behind (not at the Tendon stop): a turn about the
  // upright that keeps half the view's height, so that an arm lifted forward passes under the eye, not into it
  const fa = look.front * (1 - smooth(st.z - 1));
  if (fa) dir = V.norm(V.add(V.add(V.mul(dir, Math.cos(fa)), V.mul(V.cross([0, 1, 0], dir), Math.sin(fa))), [0, dir[1] * (1 - Math.cos(fa)) * 0.5, 0]));
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
  const s0 = frame.soft.find((x) => x.key === 'supra'), s = frame.whole ? { b: s0.b, pos: frame.whole } : s0, i = Math.round(0.92 * (s.b.S - 1)), n = frame.cut0.n, d = -V.dot(n, frame.cut0.p);
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
  { z: [1.6, 9], key: 'scapula', reach: 90, text: 'Acromion', at: () => V.add(frame.gapAt.to, V.mul(turnDir(frame.T.scapula, [0, 1, 0]), 5)), d: [-0.1, -0.14], side: 'r' },
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
    const pt = p0 && (L.key === null ? p0 : view.nearest(typeof L.key === 'function' ? L.key() : L.key, p0[0], p0[1], L.reach || 48));
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
  if (shown.mode !== st.mode) { shown.mode = st.mode; $('condCtl').hidden = ex; $('armCtl').hidden = ex; $('exCtl').hidden = !ex; }
  const moves = ex && !EX_STILL.has(st.ex);              // a held pose has nothing to play
  if (shown.moves !== moves) { shown.moves = moves; $('exPlay').hidden = !moves; }
  const P = frame.P;
  for (const [id, v, txt] of [['lift', st.lift, `${Math.round(st.lift)}°`], ['turn', st.turn, st.turn === 0 ? '0°' : `${Math.abs(Math.round(st.turn))}° ${st.turn > 0 ? 'out' : 'in'}`]]) {
    const el = $(id); if (+el.value !== v) el.value = v;
    el.style.setProperty('--v', ((v - el.min) / (el.max - el.min) * 100) + '%'); el.setAttribute('aria-valuetext', txt); set(id + 'V', txt);
  }
  const ph = $('phase'); if (Math.abs(ph.value - st.phase * 1000) > 1) ph.value = Math.round(st.phase * 1000);
  ph.style.setProperty('--v', (st.phase * 100) + '%');
  const ptxt = `lifted ${Math.round(P.elev)}°${Math.round(P.elev) ? ' ' + toward(P.plane) : ''}\nturned ${Math.abs(Math.round(P.rot))}° ${P.rot >= 0 ? 'out' : 'in'}`; ph.setAttribute('aria-valuetext', ptxt.replace('\n', ', ')); set('phaseV', ptxt);
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
    li.classList.toggle('works', on); li.classList.toggle('stretch', on && it.role === 'stretch'); li.classList.toggle('relaxed', on && it.role === 'relaxed'); li.classList.toggle('holds', on && it.role === 'holds');
    li.querySelector('button').setAttribute('aria-pressed', String(st.flex?.id === id));
  }
  flexSync();
  scaleBar(); writeHash();
}
// the Contract slider sits under the muscle that pulls
function flexSync() {
  const box = $('flexCtl'), f = st.flex;
  if (!f) { if (!box.hidden) box.hidden = true; return; }
  const li = [...$('muscleList').children].find((x) => x.dataset.id === f.id);
  if (box.parentNode !== li) li.append(box);
  if (box.hidden) box.hidden = false;
  const path = pathFor(f.id, basePose()), q = along(path, f.c), el = $('flex');
  if (Math.abs(el.value - f.c * 100) > 0.5) el.value = Math.round(f.c * 100);
  el.style.setProperty('--v', (f.c * 100) + '%');
  const short = Math.round((1 - q.len / path[0].len) * 100);
  const txt = path.length < 2 ? 'at the limit' : `${short}% shorter`;
  el.setAttribute('aria-valuetext', txt); set('flexV', txt);
  const note = $('flexNote'), says = ALONE[f.id]?.text || '';
  if (note.textContent !== says) note.textContent = says;
}
// which way the arm is lifted, in words, for the readout
const toward = (pl) => (pl > 120 ? 'across the body' : pl > 60 ? 'forward' : pl > 20 ? 'forward and out' : pl > -20 ? 'out to the side' : pl > -60 ? 'out and back' : 'back');
let modelNote = '';
function sources(it) {
  const ol = $('sources'); ol.replaceChildren();
  for (const k of [...new Set([...(it.src || []), ...MODEL_SRC])]) { const li = document.createElement('li'), a = document.createElement('a'); a.href = SRC[k].url; a.textContent = SRC[k].name; a.rel = 'noopener'; li.append(a); ol.append(li); }
}
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  const q = st.mode === 'explore' ? { z: st.z.toFixed(2), c: st.cond, lift: Math.round(st.lift), turn: Math.round(st.turn) } : { z: st.z.toFixed(2), ex: st.ex, p: st.phase.toFixed(3) };
  if (st.flex) { q.m = st.flex.id; q.k = st.flex.c.toFixed(2); }
  hashTimer = setTimeout(() => history.replaceState(null, '', '#' + new URLSearchParams(q)), 400);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('z')) st.z = clamp(parseFloat(q.get('z')) || 0, 0, LAST);
  if (CONDITIONS.some((c) => c.id === q.get('c'))) { st.mode = 'explore'; st.cond = q.get('c'); }
  if (EXERCISES.some((x) => x.id === q.get('ex'))) { st.mode = 'exercise'; st.ex = q.get('ex'); }
  if (q.has('lift')) st.lift = clamp(parseFloat(q.get('lift')) || 0, 0, 150);
  if (q.has('turn')) st.turn = clamp(parseFloat(q.get('turn')) || 0, -60, 60);
  if (q.has('p')) st.phase = clamp(parseFloat(q.get('p')) || 0);
  st.flex = MUSCLES.some((m) => m.id === q.get('m')) ? { id: q.get('m'), c: clamp(parseFloat(q.get('k')) || 0) } : null;
  return q.has('z');
}

// ---- time ----
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function touch() { dirty = true; kick(); }
function tick(now) {
  raf = 0;
  if (broken || !model) return;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  if (st.play) { st.phase = (st.phase + dt / exSeconds()) % 1; dirty = true; }
  const want = looks();
  for (const k in want) if (look[k] !== want[k]) { look[k] = reduced ? want[k] : want[k] > look[k] ? Math.min(want[k], look[k] + dt / 0.5) : Math.max(want[k], look[k] - dt / 0.5); dirty = true; }
  if (pull) {
    pull.u = Math.min(1, pull.u + dt / pull.s); st.flex.c = pull.c0 + (pull.c1 - pull.c0) * smooth(pull.u); dirty = true;
    if (pull.u >= 1) { const then = pull.then; pull = null; if (then) then(); }
  }
  if (fly) {
    const d = fly.to - st.z, step = Math.sign(d) * Math.min(Math.abs(d), dt * (0.6 + 3 * Math.abs(d)));
    st.z += step; if (Math.abs(fly.to - st.z) < 0.002) { st.z = fly.to; fly = null; } dirty = true;
  }
  if (dirty) { dirty = false; try { compute(); draw(); labels(); sync(); } catch (e) { oops(e); } }
  const now1 = looks(), easing = Object.keys(now1).some((k) => look[k] !== now1[k]);
  if (st.play || fly || pull || easing) kick(); else last = 0;
}
function oops(e) { console.error(e); if (broken) return; broken = true; st.play = false; fly = null; $('oops').hidden = false; }
// the muscle pulls to the end of its pull, or lets go back to where it started; at the speed of an unhurried
// movement, about 45° a second (at once with reduced motion)
function pullTo(c1, then) {
  const f = st.flex, s = Math.max(0.25, Math.abs(c1 - f.c) * PULL_DEG / 45);
  if (reduced) { f.c = c1; pull = null; touch(); if (then) then(); return; }
  pull = { c0: f.c, c1, u: 0, s, then }; touch();
}
function tapMuscle(id) {
  st.play = false;
  const start = () => { st.flex = { id, c: 0 }; pullTo(1); };
  if (!st.flex) start();
  else if (st.flex.id === id) { if ((pull ? pull.c1 : st.flex.c) > 0) pullTo(0, () => { st.flex = null; touch(); }); else pullTo(1); }   // a second tap lets go
  else pullTo(0, start);                                  // the other muscle lets go first, so that the arm does not jump
}
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
  chip(EXERCISES, 'exs', (id) => { st.ex = id; st.phase = 0; st.play = !reduced && !EX_STILL.has(id); st.flex = null; pull = null; touch(); });
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { st.mode = b.dataset.mode; st.flex = null; pull = null; st.play = st.mode === 'exercise' && !reduced && !EX_STILL.has(st.ex); if (st.mode === 'explore') st.phase = 0; touch(); });
  $('zoom').addEventListener('input', (e) => { fly = null; st.z = clamp(+e.target.value, 0, LAST); touch(); });
  $('lift').addEventListener('input', (e) => { st.lift = +e.target.value; touch(); });
  $('turn').addEventListener('input', (e) => { st.turn = +e.target.value; touch(); });
  $('phase').addEventListener('input', (e) => { st.phase = e.target.value / 1000; st.play = false; touch(); });
  $('play').addEventListener('click', () => { st.play = !st.play; touch(); });
  $('flex').addEventListener('input', (e) => { if (!st.flex) return; pull = null; st.flex.c = e.target.value / 100; touch(); });
  for (const [id, step] of [['zoom', 0.05]]) $(id).addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return;
    e.preventDefault(); e.target.value = +e.target.value + d * step; e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const m of MUSCLES) {
    const li = document.createElement('li'), b = document.createElement('button'), name = document.createElement('span'), v = document.createElement('b'), sm = document.createElement('small');
    li.dataset.id = m.id; b.type = 'button'; name.textContent = m.name; sm.textContent = DOES[m.id].text; b.append(name, v, sm); li.append(b); $('muscleList').append(li);
    b.addEventListener('click', () => tapMuscle(m.id));
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
    if (fingers.size === 2) { if (pageZoomed()) { span = 0; return; } const d = spanOf(); if (span) { fly = null; st.z = clamp(st.z + Math.log(d / span) * PINCH, 0, LAST); touch(); } span = d; return; }
    if (drag) { st.yaw = clamp(st.yaw - (e.clientX - drag[0]) * 0.006, -1.4, 1.4); st.pitch = clamp(st.pitch + (e.clientY - drag[1]) * 0.006, -0.9, 0.9); drag = [e.clientX, e.clientY]; touch(); }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(type, (e) => { fingers.delete(e.pointerId); span = 0; drag = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); fly = null; st.z = clamp(st.z - e.deltaY * (e.deltaMode ? 0.05 : 0.002), 0, LAST); touch(); }, { passive: false });
  $('reload').addEventListener('click', () => location.reload());
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); broken = true; $('oops').hidden = false; });
  cv.addEventListener('webglcontextrestored', () => location.reload());
  addEventListener('resize', measure);
  addEventListener('hashchange', () => { if (readHash()) { st.play = false; fly = null; touch(); } });
  // Sliders a finger can work (see js/touch/slider.js): a press on the Zoom line away from its knob glides there, as a press on a scale's name does.
  touchSliders({ zoom: { glideTo: zoomTo } });
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
window.__shoulder = { st, hidden, drawn, free, stops: STOPS, get model() { return model; }, get frame() { return frame; }, get busy() { return !!(fly || st.play || pull); },
  settle() { if (fly) { st.z = fly.to; fly = null; } while (pull) { const p = pull; pull = null; st.flex.c = p.c1; if (p.then) p.then(); }
    Object.assign(look, looks()); st.play = false; touch(); }, tapMuscle, res(k) { res = k; measure(); },
  redraw() { compute(); draw(); labels(); sync(); gl.finish(); } };
