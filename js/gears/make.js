// Gears on a cube and an octahedron, the workshop: for each part, its dimensioned drawing, and how it is made on a
// lathe and a mill, step by step. The state is which toy, which part, which view, the machine time, and the camera.
import { MM, parts, unitMM } from './model.js?v=e30be9be';
import { planOf, startOf, MANDREL, PARTS, NAMES, by, SHOWN } from './plan.js?v=e30be9be';
import { stockOf, gearSpec, screwSpec } from './spec.js?v=e30be9be';
import { timeline, makeReplay, DZ } from './cut.js?v=e30be9be';
import { makeLook } from './look.js?v=e30be9be';
import { makeShop, M4, turnedMesh, milledMesh, holeMesh, slotMesh } from './shop.js?v=e30be9be';
import { grow, lathe, box, gearMesh, smallParts, sphere } from './mesh.js?v=e30be9be';
import { collisions, turnedEnvelope } from './collide.js?v=e30be9be';
import { cutting, chipMesh, rnd } from './chips.js?v=e30be9be';
import { drawing } from './drawing.js?v=e30be9be';
import { perspective, lookAt, mul4 } from '../gl/gl.js?v=e30be9be';
import { dot, cross, norm, bodyFaces } from './model.js?v=e30be9be';
import { gamepad } from '../gamepad/gamepad.js?v=e30be9be';
import { touchSliders } from '../touch/slider.js?v=e30be9be';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = 2 * Math.PI, D = Math.PI / 180;
const cv = $('view'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
const SHAPE_NAME = { cube4: 'Cube', octa: 'Octahedron' };
const st = { shape: 'cube4', part: 'gear', view: 'make', t: 0, play: !reduced, yaw: 0, pitch: 0, zoom: 1, step: 0, rate: 1 };
const free = { x: 0, y: 0, w: 1, h: 1 }, view = { W: 1, H: 1, dpr: 1 };
let shop = null, broken = false, dirty = true, raf = 0, last = 0, cam = null, cur = null, spin = 0;
const drawn = { t: -1, key: '' };

// ---- the part being made: its plan on a timeline, and how to replay it ----
function load() {
  const sh = by[st.shape], plan = planOf(st.part, sh);
  const tl = timeline(plan);
  const start = startOf(st.part, sh);
  const replay = plan.length ? makeReplay(plan, tl, start) : null;
  // the steps in order, with their times
  const steps = []; plan.forEach((op, oi) => op.steps.forEach((s, si) => steps.push({ op: oi, si, s, t0: s.t0, t1: s.t1 })));
  // how much faster than the machine it plays: each step's first pass slowly enough to follow (about five seconds),
  // the passes after it faster, so that a long step still takes under half a minute
  for (const s of steps) {
    const segs = tl.segs.filter((g) => g.op === s.op && g.step === s.si), split = segs[1] ? segs[1].t0 : s.t1;
    s.split = split; s.slow = clamp((split - s.t0) / 5, 1, 8);
    const rest = s.t1 - split; s.fast = rest > 0 ? Math.max(s.slow, rest / clamp(1.2 * Math.sqrt(rest), 3, 20)) : s.slow;
  }
  const rate = Math.max(4, Math.round(tl.T / 90));     // for the pile of chips: one chip for every so many machine seconds
  cur = { sh, plan, tl, replay, steps, rate, key: st.shape + st.part, spans: plan.map((_, oi) => cutting(plan, tl, oi)) };
  st.rate = rateAt(st.t);
  st.t = clamp(st.t, 0, tl.T);
}

// machine seconds for each second of playing, at machine time t
function rateAt(t) { const s = cur.steps[stepAt(t)]; return !s ? 1 : t < s.split ? s.slow : s.fast; }

// ---- the camera: it circles the part ----
// where the camera starts for each way of holding the part
// (on the lathe, from out past the free end, so that a drilled or bored hole shows)
const VIEWS = { chuck: { yaw: 0.95, pitch: 0.85, zoom: 0.55 }, collet: { yaw: 0.95, pitch: 0.85, zoom: 0.4 }, mandrel: { yaw: 0.95, pitch: 0.85, zoom: 0.5 },
  vise: { yaw: -0.8, pitch: 0.28, zoom: 0.62 }, indexer: { yaw: 0.8, pitch: 0.42, zoom: 0.5 }, dividing: { yaw: 1.35, pitch: 0.32, zoom: 0.5 }, colletblock: { yaw: 0.75, pitch: 0.75, zoom: 0.5 },
  bench: { yaw: 0.5, pitch: 0.45, zoom: 1 } };
let target = [0, 0, 0], frameDist = 100, upAxis = [0, 1, 0];
// what turns in this frame, for the collision check: the lathe's spindle, or the mill's tool; and the cutting edge
let spinAxis = null, cutTip = null, slide = null, viseW = 0;
function camera() {
  const p = st.pitch, y = st.yaw, R = frameDist * st.zoom;
  // the lathe's world has y up; the mill's has z up
  const up = upAxis, f = up[2] ? [Math.cos(p) * Math.sin(y), -Math.cos(p) * Math.cos(y), Math.sin(p)] : [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const pos = target.map((v, k) => v + f[k] * R);
  // a narrow picture (a phone) gets a wider lens, so the part and what holds it still fit across
  const fov = 2 * Math.atan(Math.tan(24 * D / 2) * view.H / free.h * Math.max(1, 1.5 * free.h / free.w));
  const vp = mul4(perspective(fov, view.W / view.H, R * 0.05, R * 30), lookAt(pos, target, up));
  const ox = (free.x + free.w / 2) / view.W * 2 - 1, oy = 1 - (free.y + free.h / 2) / view.H * 2;
  for (let c = 0; c < 4; c++) { vp[c * 4] += ox * vp[c * 4 + 3]; vp[c * 4 + 1] += oy * vp[c * 4 + 3]; }
  const fw = norm(pos.map((v, k) => target[k] - v)), r = norm(cross(fw, up)), u = cross(r, fw);
  const rot = new Float32Array([r[0], u[0], -fw[0], r[1], u[1], -fw[1], r[2], u[2], -fw[2]]);
  return { vp, pos, rot };
}

// ---- building the picture ----
const meshCache = new Map();
function cached(key, make) { if (!meshCache.has(key)) meshCache.set(key, shop.mesh(make())); return meshCache.get(key); }
let partKey = '', holeKey = '', slotKey = '', chipKey = '';
function dynSet(m, key, prevKey, make) { if (key !== prevKey) m.set(make()); return key; }
const P_LATHE = (dir) => new Float32Array([0, dir, 0, 0, 0, 0, 1, 0, dir, 0, 0, 0, 0, 0, 0, 1]);

function frameOf() {
  const items = [], R = cur.replay;
  if (st.part === 'bearing' || !R) return bench(items);
  spinAxis = null; cutTip = null;
  const r = R.at(st.t), op = cur.plan[r.op], step = op.steps[r.step], p = r.seg.p, tool = p.tool && typeof p.tool === 'object' ? p.tool : step.tool;
  const L = shop.lathe3, MI = shop.mill;
  const cutting = r.away < 1 && r.seg.t0 <= st.t && st.t <= r.seg.t1;
  if (op.machine === 'lathe') {
    upAxis = [0, 1, 0];
    const S = r.lathe, dir = op.dir, rot = M4.rx(spin);
    const Mpart = M4.mul(rot, M4.mul(P_LATHE(dir), M4.t(0, 0, -op.zJaw)));
    partKey = dynSet(shop.dyn.part, 'L' + cur.key + st.t.toFixed(3), partKey, () => turnedMesh(S));
    items.push({ name: 'part', role: 'part', mesh: shop.dyn.part, M: Mpart, part: true, lathe: { S, dir, zJaw: op.zJaw } });
    // the holder: a 3-jaw chuck (gripping the bar, or a mandrel), or a collet chuck
    const grip = gripRadius(R.atOp[r.op].S, op);
    if (op.hold === 'collet') items.push({ name: 'collet', role: 'hold', mesh: L.collet, M: rot });
    else {
      items.push({ name: 'chuck', role: 'hold', mesh: L.chuck, M: rot });
      const rg = op.hold === 'mandrel' ? 5 : grip;
      items.push({ name: 'jaws', role: 'hold', mesh: cached('jaws' + rg.toFixed(2), () => jaws(rg)), M: rot });
      if (op.hold === 'mandrel') items.push({ name: 'mandrel', role: 'hold', mesh: cached('mandrel' + cur.key, () => mandrel(gearSpec(cur.sh), dir)), M: rot });
    }
    items.push({ name: 'bed', role: 'skip', mesh: L.base, M: M4.id() });
    // the tool
    const [tz, tr] = r.tip || [op.dir > 0 ? 30 : -30, 14];   // the tip, pulled back between passes by the replay
    const tipX = dir * (tz - op.zJaw);
    const tail = tool.type === 'center' || tool.type === 'drill' || tool.type === 'reamer' || tool.type === 'die';
    const postZ = tail ? 40 : tr;
    const tx = tail ? 30 : tipX + (tool.type === 'boring' ? 38 : 0);   // a boring bar's holder sits out toward the tailstock
    items.push({ name: 'carriage', role: 'move', mesh: L.carriage, M: M4.t(tx, 0, 0) });
    items.push({ name: 'cross slide', role: 'move', mesh: L.cross, M: M4.t(tx, 0, postZ) }); slide = { tx, z: postZ };
    items.push({ name: 'compound', role: 'move', mesh: L.compound, M: M4.mul(M4.t(tx, 0, postZ + 14), M4.ry(tool.compound || 0)) });
    // the post sits behind the bit, so the bit reaches past it toward the chuck (or away, for a left-hand bit)
    const px = tail || tool.type === 'boring' ? 0 : tool.left ? -7 : 7;
    items.push({ name: 'tool post', role: 'move', mesh: L.post, M: M4.t(tx + px, 0, postZ) });
    if (!tail) items.push({ name: 'tool', role: 'cut', mesh: cached('lt' + tool.type + (tool.left ? 'L' : '') + (tool.w || ''), () => shop.latheTool(tool)), M: M4.t(tipX, 0, postZ) });
    // the tailstock, with a drill, center drill, reamer or die; parked to the right otherwise
    let qx = 150;
    if (tail) {
      const into = tipX;
      if (tool.type === 'die') { items.push({ name: 'die holder', role: 'cut', mesh: L.die, M: M4.t(into, 0, 0) }); qx = into + 45; }
      else {
        const t = shop.rotaryTool(tool), len = t.P.reduce((m, v, i) => (i % 3 === 2 ? Math.max(m, v) : m), 0);
        items.push({ name: 'drill', role: 'cut', edge: (tool.d || 1) / 2 + 0.8, mesh: cached('rt' + tool.type + tool.d, () => shop.rotaryTool(tool)), M: M4.mul(M4.t(into, 0, 0), M4.mul(new Float32Array([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]), M4.rz(0))) });
        items.push({ name: 'drill chuck', role: 'move', mesh: L.jacobs, M: M4.t(into + len - 8, 0, 0) });
        qx = into + len - 8 + 52;
      }
    }
    items.push({ name: 'tailstock quill', role: 'move', mesh: L.quill, M: M4.t(qx, 0, 0) }, { name: 'tailstock', role: 'move', mesh: L.tail, M: M4.t(qx + 60, 0, 0) });
    // look at the part's free end, where the cutting is
    const free = Math.max(dir * (S.z0 - op.zJaw), dir * (S.z0 + (S.n - 1) * 0.01 - op.zJaw));
    spinAxis = { p: [0, 0, 0], s: [1, 0, 0] }; cutTip = tail ? [tipX, 0, 0] : [tipX, 0, postZ];
    target = [Math.max(free - 8, 4), -4, 4];
    frameDist = 210;
  } else millFrame(items, r, op, step, tool, p);
  items.push(chipsOf(r, op, step, tool));
  return { items, cutting, axis: spinAxis, tip: cutTip };
}
// the chips: flying off the tool while it cuts, and piled below the work (see chips.js)
const SMALL = ['center', 'drill', 'reamer', 'spot', 'saw', 'part', 'boring', 'tap', 'die'];
function chipsOf(r, op, step, tool) {
  const lathe = op.machine === 'lathe', size = SMALL.includes(tool.type) ? 1 : 2, tail = ['center', 'drill', 'reamer', 'die'].includes(tool.type);
  let src = null, floor, pile;
  if (lathe) {
    // off a turning tool: down and out toward the operator; out of a drilled hole: out round the drill, along it
    const L = r.lathe, end = Math.max(op.dir * (L.z0 - op.zJaw), op.dir * (L.z0 + (L.n - 1) * DZ - op.zJaw));
    if (cutTip) src = tail ? { at: [end + 0.5, 0, 0], size, vel: (i) => { const a = rnd(i, 1) * 6.283, v = 150 + 250 * rnd(i, 2); return [80 + 200 * rnd(i, 9), v * Math.cos(a), v * Math.sin(a)]; } }
      : { at: cutTip, size, vel: (i) => [(rnd(i, 1) - 0.5) * 300, -100 - 350 * rnd(i, 2), 150 + 400 * rnd(i, 9)] };
    // they land on the cross slide (it carries them along), the compound, or the bed (sizes from shop.js)
    const sl = slide, top = -65, bed = -113.5;
    floor = (q) => { const dx = q[0] - sl.tx, dz = q[2] - sl.z; return Math.abs(dx) < 18 && dz > -8 && dz < 40 ? -53 : Math.abs(dx) < 26 && dz > -40 && dz < 44 ? top : bed; };
    pile = (i) => ({ p: [sl.tx + (rnd(i, 11) - 0.5) * 50, top + 0.3, sl.z - 39 + 30 * rnd(i, 12)], size });
  } else {
    // off a milling cutter: out round it, a little up its axis
    const s = spinAxis ? spinAxis.s : [0, 0, 1], e = norm(Math.abs(s[2]) < 0.9 ? cross(s, [0, 0, 1]) : cross(s, [1, 0, 0])), f = cross(s, e);
    if (cutTip) src = { at: cutTip, size, vel: (i) => { const a = rnd(i, 1) * 6.283, v = 250 + 600 * rnd(i, 2), u = 80 + 250 * rnd(i, 9); return [0, 1, 2].map((k) => v * (Math.cos(a) * e[k] + Math.sin(a) * f[k]) + u * s[k]); } };
    // they land in the vise, on its jaws, or on the table (sizes from shop.js)
    const vise = op.hold === 'vise' || op.hold === 'colletblock', o = viseW / 2;
    floor = (q) => (!vise || Math.abs(q[0]) > 52 || q[1] < -95 || q[1] > 75 ? 0 : Math.abs(q[1]) > o + 0.5 && Math.abs(q[1]) < o + 28 ? 56 : 30);
    const c = target;
    pile = (i) => { const a = rnd(i, 11) * 6.283, d = 12 + 40 * Math.sqrt(rnd(i, 12)), q = [c[0] + d * Math.cos(a), c[1] + d * Math.sin(a), 0]; q[2] = floor(q) + 0.3; return { p: q, size }; };
  }
  const key = 'C' + cur.key + st.t.toFixed(3) + (cutTip ? cutTip.map((x) => x.toFixed(2)).join() : '');
  chipKey = dynSet(shop.dyn.chips, key, chipKey, () => chipMesh({ spans: cur.spans[r.op], t: st.t, rate: rateAt(st.t), pileRate: cur.rate, src, up: lathe ? 1 : 2, floor, pile }));
  return { name: 'chips', role: 'skip', mesh: shop.dyn.chips, M: M4.id() };
}
// how far out the jaws close: the bar's radius where they grip
function gripRadius(S, op) {
  if (!S) return 5;
  let r = 0; for (let i = 0; i < S.n; i++) { const z = S.z0 + i * 0.01; if (op.dir * (z - op.zJaw) < -0.5 && op.dir * (z - op.zJaw) > -10) r = Math.max(r, S.ro[i]); }
  return r || 5;
}
function jaws(rg) {
  const g = grow();
  for (let k = 0; k < 3; k++) {
    const from = g.P.length / 3;
    box(g, [-18, rg + 8, -5.5], [-6, rg + 24, 5.5], [13, 0, 0]);
    box(g, [-18, rg, -5.5], [0, rg + 8, 5.5], [13, 0, 0]);
    const m = M4.rx(k * TAU / 3);
    for (let i = from; i < g.P.length / 3; i++) { const q = M4.apply(m, g.P.slice(3 * i, 3 * i + 3)), n = M4.dir(m, g.N.slice(3 * i, 3 * i + 3)); g.P.splice(3 * i, 3, ...q); g.N.splice(3 * i, 3, ...n); }
  }
  return g;
}
// the expanding mandrel the gear sits on for its second turning setup: gripped in the chuck, the gear's outer face
// against its shoulder (x = MANDREL, clear of the jaws), the split spigot through the bore
function mandrel(g, dir) {
  const m = grow(), t = g.zo - g.zi + 0.1, L = MANDREL;   // the spigot ends just past the hub, clear of a tool in the recess
  lathe(m, [[0, -18], [5, -18], [5, L - 3], [3.4, L - 3], [3.4, L], [2, L], [2, L + t], [1.7, L + t + 0.3], [0, L + t + 0.3]], 1, 48);
  const out = grow();
  for (let i = 0; i < m.P.length / 3; i++) { const [x, y, z] = m.P.slice(3 * i, 3 * i + 3), [a, b, c] = m.N.slice(3 * i, 3 * i + 3); out.v([z, x, y], [c, a, b], m.T.slice(3 * i, 3 * i + 3)); }
  out.I.push(...m.I);
  return out;
}

// ---- the mill ----
function millFrame(items, r, op, step, tool, p) {
  upAxis = [0, 0, 1];
  const MI = shop.mill, M = r.mill, sh = cur.sh;
  items.push({ name: 'table', role: 'static', mesh: MI.table, M: M4.id() });
  let Rm = null, O = [0, 0, 0], spindle = [0, 0, 1], tipW = null, partM = null;
  if (op.hold === 'vise') {
    Rm = step.rot;
    const box0 = bounds(cur.replay.atOp[r.op].M, Rm, cur.steps.find((s) => s.op === r.op && s.si === r.step), r);
    // the part stands 4 above the jaws, more for a big chamfer mill, whose cone reaches down past the edge it cuts
    const top = 55 + Math.max(4, step.tool.type === 'chamfer' ? step.tool.d / 2 + 1 : 0), hp = Math.max(4, top - (box0.z1 - box0.z0) - 30);
    O = [0, -(box0.y0 + box0.y1) / 2, 30 + hp - box0.z0];
    const w = box0.y1 - box0.y0; viseW = w;
    items.push({ name: 'vise', role: 'static', mesh: cached('vise' + w.toFixed(2), () => shop.millVise(w)), M: M4.id() });
    items.push({ name: 'parallels', role: 'static', mesh: cached('par' + w.toFixed(2) + hp.toFixed(2), () => parallels(w, hp)), M: M4.id() });
  } else if (op.hold === 'indexer') {
    const H = 70, nose = -14;
    items.push({ name: 'indexer', role: 'static', mesh: MI.indexer, M: M4.t(nose, 0, H) });
    const n = p.n || [0, 1, 0], ax = op.axis;
    Rm = indexRot(ax, n, op.tilt, r, op);
    const along = extent(cur.replay.atOp[r.op].M, ax);
    O = [nose - 6 - along.lo, 0, H];
    items.push({ name: 'square collet', role: 'static', mesh: cached('sqcollet', squareCollet), M: M4.t(nose, 0, H) });
  }
  if (op.hold === 'vise' || op.hold === 'indexer') {
    partM = M4.rows(Rm, O);
    partKey = dynSet(shop.dyn.part, 'M' + cur.key + st.t.toFixed(3), partKey, () => milledMesh(M));
    holeKey = dynSet(shop.dyn.holes, 'H' + cur.key + st.t.toFixed(3), holeKey, () => holeMesh(M));
    items.push({ name: 'part', role: 'part', mesh: shop.dyn.part, M: partM, part: true, holes: M.holes.filter((h) => h.depth > 0 || h.spot > 0) });
    items.push({ name: 'holes', role: 'skip', mesh: shop.dyn.holes, M: partM });
    const pose = r.tip;
    const RT = [Rm[0], Rm[3], Rm[6], Rm[1], Rm[4], Rm[7], Rm[2], Rm[5], Rm[8]];
    if (pose) {
      const w = M4.apply(partM, pose.at);
      if (tool.type === 'chamfer') {
        spindle = [0, 0, 1];
        // a 90° chamfer mill: its cone lies on the chamfer, the tool's axis outside the edge
        const nW = norm(M4.dir(partM, pose.n)), h = norm([nW[0] * Math.SQRT2 - 0, nW[1] * Math.SQRT2, 0]), gen = norm([-h[0], -h[1], 1]);
        const k = tool.d / 4 / Math.sin(Math.PI / 4);
        tipW = w.map((v, i) => v - gen[i] * k);
      } else { spindle = norm(M4.dir(partM, pose.n)); tipW = w; }
    }
  } else if (op.hold === 'dividing') return gearOnHead(items, r, op, step, tool, p);
  else if (op.hold === 'colletblock') return screwInBlock(items, r, op, step, tool, p);
  // the tool, its holder and the spindle
  const lift = r.away * 6;
  if (!tipW) tipW = [O[0], O[1], O[2] + 30];
  tipW = tipW.map((v, i) => v + spindle[i] * lift);
  const tm = cached('mt' + tool.type + tool.d, () => shop.millTool(tool));
  const Mt = M4.mul(M4.axis(spindle, tipW), M4.rz(spin));
  items.push({ name: 'cutter', role: 'cut', mesh: tm, M: Mt });
  spinAxis = { p: tipW, s: spindle }; cutTip = tipW;
  const tl = toolLength(tool), small = tool.type === 'drill' || tool.type === 'spot' || tool.type === 'tap';
  // small drills and taps go in a drill chuck; cutters in a collet, under its nut
  const holder = tipW.map((v, i) => v + spindle[i] * (tl - (small ? 8 : 6)));
  items.push({ name: 'tool holder', role: 'spin', mesh: small ? MI.jacobs : MI.nut, M: M4.mul(M4.axis(spindle, holder), M4.rz(small ? spin : spin * 0)) });
  items.push({ name: 'spindle', role: 'spin', mesh: MI.quill, M: M4.axis(spindle, holder.map((v, i) => v + spindle[i] * (small ? 52 : 24))) });
  target = O.slice(); frameDist = 210;
}
const toolLength = (t) => ({ fly: 40, end: 60, chamfer: 50, spot: 50, drill: Math.max(12, t.d / 2 * 14) + 20, tap: 26 })[t.type] || 40;
function parallels(w, hp) { const g = grow(); for (const s of [1, -1]) box(g, [-40, s > 0 ? w / 2 - 3.5 : -w / 2 + 0.5, 30], [40, s > 0 ? w / 2 - 0.5 : -w / 2 + 3.5, 30 + hp], [1, 0, 0]); return g; }
// a 5C square collet: a round face with a square hole 14 across (the part's corner flats), the square bore running back inside
function squareCollet() {
  const g = grow(), a = 7.05, rc = a * Math.SQRT2, R = 15, zf = 0.6, N = 48;
  lathe(g, [[rc, -25], [rc, zf]], 4, 4, Math.PI / 4, Math.PI / 4 + 2 * Math.PI);   // the square bore
  lathe(g, [[R, zf], [R, -2]], 1, N);                                                 // the round outside
  const sq = (t) => { const c = Math.cos(t), s = Math.sin(t), k = a / Math.max(Math.abs(c), Math.abs(s)); return [k * c, k * s]; };
  for (let i = 0; i < N; i++) {   // the face: from the square hole out to the round edge
    const t0 = i / N * 2 * Math.PI, t1 = (i + 1) / N * 2 * Math.PI, p0 = sq(t0), p1 = sq(t1);
    const v = [g.v([p0[0], p0[1], zf], [0, 0, 1], [1, 0, 0]), g.v([R * Math.cos(t0), R * Math.sin(t0), zf], [0, 0, 1], [1, 0, 0]), g.v([R * Math.cos(t1), R * Math.sin(t1), zf], [0, 0, 1], [1, 0, 0]), g.v([p1[0], p1[1], zf], [0, 0, 1], [1, 0, 0])];
    g.I.push(v[0], v[1], v[2], v[0], v[2], v[3]);
  }
  // the square's corners fall between the samples; close them with a fan from each corner
  for (let q = 0; q < 4; q++) {
    const t = Math.PI / 4 + q * Math.PI / 2, c = sq(t), i0 = Math.floor(t / (2 * Math.PI) * N), ta = i0 / N * 2 * Math.PI, tb = (i0 + 1) / N * 2 * Math.PI;
    const A = sq(ta), B = sq(tb), ids = [c, A, B].map((p) => g.v([p[0], p[1], zf + 0.001], [0, 0, 1], [1, 0, 0]));
    g.I.push(ids[0], ids[2], ids[1], ids[0], ids[1], ids[2]);
  }
  return rotX(g);
}
function rotX(g) { const out = grow(); for (let i = 0; i < g.P.length / 3; i++) { const [x, y, z] = g.P.slice(3 * i, 3 * i + 3), [a, b, c] = g.N.slice(3 * i, 3 * i + 3); out.v([z, x, y], [c, a, b], g.T.slice(3 * i, 3 * i + 3)); } out.I.push(...g.I); return out; }
// the part's extent in the machine, at the start of a step
function bounds(M0, R, stepRec, r) {
  const M = stepState(stepRec) || M0;
  let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const f of bodyFacesOf(M)) for (const q of f.poly) { const y = R[3] * q[0] + R[4] * q[1] + R[5] * q[2], z = R[6] * q[0] + R[7] * q[1] + R[8] * q[2]; z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { z0, z1, y0, y1 };
}
const stepCache = new Map();
function stepState(rec) { if (!rec) return null; const k = cur.key + rec.op + '-' + rec.si; if (!stepCache.has(k)) stepCache.set(k, cur.replay.at(rec.t0 + 1e-6).mill); return stepCache.get(k); }
const bodyFacesOf = (M) => bodyFaces(M.planes);
function extent(M, ax) { let lo = 1e9, hi = -1e9; for (const f of bodyFacesOf(M)) for (const q of f.poly) { const s = dot(q, ax); lo = Math.min(lo, s); hi = Math.max(hi, s); } return { lo, hi }; }
// the indexer's turn that puts face normal n straight up the tilted spindle: part axis `ax` along +x
function indexRot(ax, n, tilt) {
  // A: ax to +x, then turn about x so that n's part square to the axis points up (+z)
  const a = norm(ax), perp = norm(n.map((v, k) => v - dot(n, a) * a[k])), b = cross(a, perp);
  // rows: machine x = a, machine z = perp, machine y = z × x = perp × a ... keep right-handed: y = cross(z, x)
  const y = cross(perp, a);
  return [a[0], a[1], a[2], y[0], y[1], y[2], perp[0], perp[1], perp[2]];
}

// the gear on its mandrel in the dividing head, the form cutter on the horizontal arbor
function gearOnHead(items, r, op, step, tool, p) {
  const sh = cur.sh, g = gearSpec(sh), P = parts(sh), u = g.u, beta = op.tilt;
  const MI = shop.mill, H = 90, nose = [-10, 0, H], a = [Math.cos(beta), 0, Math.sin(beta)];
  items.push({ name: 'dividing head base', role: 'static', mesh: MI.dbase, M: M4.t(-10, 0, H) });
  items.push({ name: 'dividing head', role: 'static', mesh: MI.dhead, M: M4.mul(M4.t(-10, 0, H), M4.ry(-beta)) });
  const Lm = 26;   // nose to the mandrel's shoulder, along the spindle
  // the gear's frame: its z points back along the spindle; the gap being cut is on top
  // where the cutter is along the gap (0: the outer end, 1: the inner), how deep, and how far the head is turned.
  // A side pass turns the head a little; between passes the table winds back, the crank turns the gap to the top,
  // and the cutter comes down to the next depth.
  const pitch = 2 * Math.PI / g.N, psiOf = (q) => q.gap * pitch - pitch / 2 + (q.side || 0) * 0.035;
  const q = p.k === 'gap' ? p : { gap: 0, side: 0, depth: 0 }, mv = r.move;
  const before = st.t < r.seg.t0, fr = clamp((r.f - 0.12) / 0.76, -0.25, 1.25);
  let psi = psiOf(q), along = before ? -0.25 : r.away >= 1 && r.f >= 1 ? 1.25 : fr, dNow = q.depth ?? 1, side = q.side || 0;
  if (mv) {
    const q1 = mv.to.p, w = mv.w;
    psi += (psiOf(q1) - psi) * w; along = 1.25 - 1.5 * w; dNow += ((q1.depth ?? 1) - dNow) * w; side += ((q1.side || 0) - side) * w;
  }
  const zW = a.map((v) => -v), upW = [-Math.sin(beta), 0, Math.cos(beta)], yW = cross(zW, upW);
  // gear frame axes in the world: the azimuth psi maps to "up"
  const ex = [0, 1, 2].map((k) => Math.cos(psi) * upW[k] - Math.sin(psi) * yW[k]), ey = [0, 1, 2].map((k) => Math.sin(psi) * upW[k] + Math.cos(psi) * yW[k]);
  const shoulder = nose.map((v, k) => v + a[k] * Lm), O = shoulder.map((v, k) => v - zW[k] * g.zo);
  const Mg = new Float32Array([ex[0] * u, ex[1] * u, ex[2] * u, 0, ey[0] * u, ey[1] * u, ey[2] * u, 0, zW[0] * u, zW[1] * u, zW[2] * u, 0, O[0], O[1], O[2], 1]);
  const M = r.mill, gaps = Array.from({ length: g.N }, (_, k) => (M.gaps ? [clamp((M.gaps[k] - 0.12) / 0.76, 0, 1), M.gapD[k], M.gapD0[k]] : [0, 0, 0]));
  partKey = dynSet(shop.dyn.part, 'G' + cur.key + gaps.map((x) => x.map((v) => v.toFixed(3)).join(':')).join(), partKey, () => gearMesh(sh.profile, P, gaps));
  items.push({ name: 'part', role: 'part', mesh: shop.dyn.part, M: Mg, part: true });
  items.push({ name: 'mandrel', role: 'static', mesh: cached('dmandrel', () => rotX((() => { const m = grow(); lathe(m, [[0, -20], [5, -20], [5, Lm - 3], [3.5, Lm - 3], [3.5, Lm], [2, Lm], [2, Lm + 3.2], [1.5, Lm + 3.6], [1.5, Lm + 5], [0, Lm + 5]], 1, 48); return m; })())), M: M4.mul(M4.t(...nose), M4.ry(-beta)) });
  // the cutter: its lowest point runs along the bottom of the gap, from the outer end in
  // (the cutter stays at the top; the indexing turns the gap being cut, at azimuth `top` in the gear's frame, up to it)
  // (short of full depth, the cutter's lowest point runs that much nearer the tips)
  const rootAt = (s) => { const th = sh.profile.root + (1 - dNow) * (sh.profile.tip - sh.profile.root), rho = s / Math.cos(th - sh.profile.alpha); const q = [Math.sin(th) * rho * Math.cos(psi), Math.sin(th) * rho * Math.sin(psi), Math.cos(th) * rho]; return M4.apply(Mg, q.map((v) => v / u)); };
  const outer = rootAt(g.coneOut + 0.2), inner = rootAt(g.coneIn - 0.2);
  const lift = r.away * 3;
  const bottom = [0, 1, 2].map((k) => outer[k] + (inner[k] - outer[k]) * along);
  const R = tool.d / 2, c = [bottom[0], bottom[1] + side * 0.12, bottom[2] + R + lift];
  spinAxis = { p: c, s: [0, 1, 0] }; cutTip = bottom;
  items.push({ name: 'gear cutter', role: 'cut', mesh: cached('gc' + tool.d, () => shop.gearCutter(tool)), M: M4.mul(M4.t(...c), M4.mul(ALONG_Y(), M4.rz(spin))) });
  items.push({ name: 'arbor', role: 'spin', mesh: MI.quill, M: M4.mul(M4.t(c[0], c[1] + 120, c[2]), ALONG_Y()) });
  target = shoulder.map((v, k) => v - zW[k] * 4); frameDist = 210;
}
const ALONG_Y = () => new Float32Array([0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);

// the screw in a collet block in the vise, the slitting saw on a stub arbor
function screwInBlock(items, r, op, step, tool, p) {
  const s = screwSpec(cur.sh), MI = shop.mill, H = 50, face = 22;
  items.push({ name: 'vise', role: 'static', mesh: cached('vise40', () => shop.millVise(40)), M: M4.id() });
  items.push({ name: 'collet block', role: 'static', mesh: cached('cblock', () => { const g = grow(); box(g, [-face - 40, -20, H - 20], [face, 20, H + 20], [4, 0, 0]); return g; }), M: M4.id() });
  // screw frame: z along the world's +x, head out of the block; x up (the slot's width), y across (the saw's way)
  const top = s.z.top, O = [face + 3 - top, 0, H];
  const Mp = new Float32Array([0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, O[0], O[1], O[2], 1]);
  const S = cur.replay.final.S;
  partKey = dynSet(shop.dyn.part, 'S' + cur.key, partKey, () => turnedMesh(S));
  const sl = r.mill.slot;
  const slot = sl ? [s.slot / 2, top - s.slotD, -sl[0], -sl[1]] : [0, 0, 0, 0];
  items.push({ name: 'part', role: 'part', mesh: shop.dyn.part, M: Mp, part: true, slot: sl ? [s.slot / 2, top - s.slotD, Math.min(slot[2], slot[3]), Math.max(slot[2], slot[3])] : null });
  if (sl) { slotKey = dynSet(shop.dyn.slot, 'sl' + sl[1].toFixed(3), slotKey, () => slotMesh(top, s.flange / 2, s.slot, s.slotD, -sl[0], -sl[1])); items.push({ name: 'slot', role: 'skip', mesh: shop.dyn.slot, M: Mp }); }
  const y = r.tip ? r.tip.slot : p.from, R = tool.d / 2;
  const c = [O[0] + top - s.slotD + R, y, H];   // the saw lies flat beyond the head, its edge at the slot's bottom
  spinAxis = { p: c, s: [0, 0, 1] }; cutTip = [O[0] + top - s.slotD, y, H];
  items.push({ name: 'saw', role: 'cut', mesh: cached('saw' + tool.d, () => shop.sawCutter(tool)), M: M4.mul(M4.t(...c), M4.rz(spin)) });
  items.push({ name: 'spindle', role: 'spin', mesh: MI.quill, M: M4.t(c[0], c[1], c[2] + 60) });
  target = [O[0] + top - 2, 0, H]; frameDist = 120;
}

// the bearing: bought, not made. It sits on a bench by itself.
function bench(items) {
  upAxis = [0, 1, 0];
  const P = parts(cur.sh), u = P.u, sp = smallParts(P), mid = P.bearing.mid;
  const Ms = M4.mul(M4.s(u), M4.t(0, 0, -mid));
  items.push({ mesh: cached('b-out' + cur.key, () => sp.outer), M: Ms }, { mesh: cached('b-in' + cur.key, () => sp.inner), M: Ms });
  for (let k = 0; k < P.bearing.balls; k++) {
    const a = k / P.bearing.balls * TAU;
    items.push({ mesh: cached('b-ball' + cur.key, () => sp.ball), M: M4.mul(M4.s(u), M4.t(P.bearing.pitch * Math.cos(a), P.bearing.pitch * Math.sin(a), 0)) });
  }
  target = [0, 0, 0]; frameDist = 14;
  return { items, cutting: false };
}

let look = null;
function draw() {
  cam = camera();
  const f = frameOf();
  if (!look) { shop.draw({ items: f.items, spin }, cam, { x: 0, y: 0, w: cv.width, h: cv.height }); return f; }
  const R = frameDist * st.zoom, zUp = upAxis[2] === 1;
  look.frame((c, vpx, hook) => shop.draw({ items: f.items, spin }, c, vpx, hook), cam, cv.width, cv.height,
    { up: upAxis, lDir: zUp ? [0.3, -0.45, 1] : [0.3, 1, 0.45], unit: 1, center: target, size: 170, near: R * 0.05, far: R * 30, aoR: 5 });
  return f;
}

// ---- the panel ----
const shown = {};
const set = (id, text) => { if (shown[id] !== text) { shown[id] = text; $(id).textContent = text; } };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function stepAt(t) { const S = cur.steps; for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].t0 - 1e-6) return i; return 0; }
function sync() {
  for (const b of $('shapes').children) b.setAttribute('aria-pressed', String(b.dataset.id === st.shape));
  for (const b of $('parts').children) b.setAttribute('aria-pressed', String(b.dataset.id === st.part));
  for (const b of $('views').children) b.setAttribute('aria-pressed', String(b.dataset.v === st.view));
  const making = st.view === 'make', bought = st.part === 'bearing';
  $('makeBox').hidden = !making || bought;
  $('sheet').hidden = making; cv.hidden = !making;
  set('note', making && bought ? `Bought, not made: a 681X ball bearing, 1.5 × 4 × 2 mm.` : '');
  if (making && !bought && cur.steps.length) {
    const i = stepAt(st.t), s = cur.steps[i], op = cur.plan[s.op];
    st.step = i;
    set('setup', `${op.title}`);
    set('stepTitle', `${i + 1}. ${s.s.title}`);
    set('stepLine', s.s.line);
    set('stepTool', toolText(s.s));
    $('prev').disabled = i === 0; $('next').disabled = i === cur.steps.length - 1;
    const tv = $('time'), v = Math.round(st.t / cur.tl.T * 1000);
    if (+tv.value !== v) tv.value = v;
    tv.style.setProperty('--v', (v / 10) + '%'); tv.setAttribute('aria-valuetext', `${mmss(st.t)} of ${mmss(cur.tl.T)}, step ${i + 1}: ${s.s.title}`);
    set('timeV', `${mmss(st.t)} / ${mmss(cur.tl.T)}`);
    const pl = st.play ? 'Pause' : 'Play';
    if (shown.play !== pl) { shown.play = pl; $('play').setAttribute('aria-pressed', String(pl === 'Pause')); $('play').setAttribute('aria-label', pl); }
  }
  writeHash();
}
function toolText(s) {
  const t = s.tool, rpm = s.rpm ? `${s.rpm.toLocaleString('en-US')} rpm` : 'by hand';
  const name = { turn: 'HSS turning tool', face: 'HSS facing tool', part: `${t.w} mm parting blade`, boring: 'Ø1.8 boring bar', center: 'center drill', drill: `Ø${t.d} drill`, reamer: `Ø${t.d} reamer`, die: 'M1.4 × 0.3 die',
    fly: 'fly cutter', end: `Ø${t.d} end mill`, chamfer: `Ø${t.d} chamfer mill`, spot: 'spot drill', tap: 'M1.4 × 0.3 tap', gearcutter: 'gear cutter', saw: `Ø${t.d} × ${t.w} saw` }[t.type] || t.type;
  return `${name} · ${rpm}`;
}
let hashTimer = 0;
function writeHash() { clearTimeout(hashTimer); hashTimer = setTimeout(() => history.replaceState(null, '', '#' + new URLSearchParams({ s: st.shape, p: st.part, v: st.view })), 400); }
function readHash(hash = location.hash) {
  const q = new URLSearchParams(hash.slice(1));
  if (SHOWN.includes(q.get('s'))) st.shape = q.get('s');
  if (PARTS.includes(q.get('p'))) st.part = q.get('p');
  if (q.get('v') === 'draw' || q.get('v') === 'make') st.view = q.get('v');
}

// ---- the drawing ----
let sheetKey = '';
function sheet() {
  const k = st.shape + st.part;
  if (k === sheetKey) return;
  sheetKey = k;
  const s = $('sheet'); s.replaceChildren(drawing(st.part, by[st.shape]));
  pz.k = 1; pz.x = pz.y = 0; placeSheet();
}
// zoom and pan on the sheet: k from 1 (the whole sheet) to 6, kept so the sheet never leaves its box
const pz = { k: 1, x: 0, y: 0 };
function placeSheet() {
  const svg = $('sheet').firstElementChild; if (!svg) return;
  const w = free.w, h = free.h;
  pz.k = clamp(pz.k, 1, 6); pz.x = clamp(pz.x, w * (1 - pz.k), 0); pz.y = clamp(pz.y, h * (1 - pz.k), 0);
  svg.style.transform = pz.k === 1 ? '' : `translate(${pz.x}px, ${pz.y}px) scale(${pz.k})`;
  $('sheet').classList.toggle('zoomed', pz.k > 1);
}
function zoomSheet(f, cx = free.w / 2, cy = free.h / 2) {   // cx, cy in the sheet box
  const k = clamp(pz.k * f, 1, 6), r = k / pz.k;
  pz.x = cx - (cx - pz.x) * r; pz.y = cy - (cy - pz.y) * r; pz.k = k; placeSheet();
}

// ---- time ----
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function touch() { dirty = true; kick(); }
function tick(now) {
  raf = 0;
  if (broken) return;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
  const moving = st.view === 'make' && st.play && cur.replay && st.part !== 'bearing';
  if (moving) {
    const was = cur.steps[stepAt(st.t)].op;
    // the speed eases between a step's slow first pass and its faster rest, so nothing jumps
    st.rate += (rateAt(st.t) - st.rate) * (1 - Math.exp(-dt * 2.5));
    st.t += dt * st.rate; if (st.t >= cur.tl.T) { st.t = cur.tl.T; st.play = false; }
    if (cur.steps[stepAt(st.t)].op !== was) resetView();
    dirty = true;
  }
  // the spindle turns while a cut is being made; shown far slower than it really turns
  if (st.view === 'make' && shop) { spin += dt * 2.4; dirty = true; }
  if (dirty) {
    dirty = false;
    try {
      if (st.view === 'make') { if (shop) { draw(); drawn.t = st.t; drawn.key = cur.key; } } else sheet();
      sync();
    } catch (e) { oops(e); }
  }
  if (st.view === 'make' && shop && (moving || !reduced)) kick(); else last = 0;
}
function oops(e) { console.error(e); if (broken) return; broken = true; st.play = false; $('oops').hidden = false; }

let res = +(new URLSearchParams(location.search).get('res')) || 1;
function measure() {
  const W = innerWidth, H = innerHeight, r = $('panel').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1) * res;
  if (r.right < W * 0.7) { free.x = r.right + 12; free.y = 0; free.w = W - free.x; free.h = H; }
  else { free.x = 0; free.y = 52; free.w = W; free.h = Math.max(120, r.top - 52); }
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  view.W = W; view.H = H; view.dpr = dpr;
  const sh = $('sheet').style; sh.left = free.x + 'px'; sh.top = free.y + 'px'; sh.width = free.w + 'px'; sh.height = free.h + 'px'; placeSheet();
  touch();
}

// ---- controls ----
function choose(k, v) {
  st[k] = v;
  if (k !== 'view') { st.t = 0; st.play = !reduced && st.view === 'make'; load(); stepCache.clear(); resetView(); }
  else if (v === 'make') resetView();
  touch();
}
function resetView() {
  const r = cur.replay && st.part !== 'bearing' ? cur.plan[cur.replay.at(st.t).op] : null;
  const v = !r ? VIEWS.bench : VIEWS[r.hold];
  st.yaw = v.yaw; st.pitch = v.pitch; st.zoom = v.zoom;
}
function goStep(k) {
  const i = clamp(stepAt(st.t) + k, 0, cur.steps.length - 1), s = cur.steps[i];
  const was = cur.steps[stepAt(st.t)].op;
  st.t = s.t0 + 1e-3; st.rate = rateAt(st.t); st.play = !reduced;
  if (s.op !== was) resetView();
  touch();
}
function orbit(dx, dy) { st.yaw = (st.yaw + dx) % TAU; st.pitch = clamp(st.pitch + dy, -0.2, 1.45); touch(); }
function controls() {
  for (const id of SHOWN) { const b = document.createElement('button'); b.type = 'button'; b.textContent = SHAPE_NAME[id]; b.dataset.id = id; b.addEventListener('click', () => choose('shape', id)); $('shapes').append(b); }
  for (const id of PARTS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = NAMES[id]; b.dataset.id = id; b.addEventListener('click', () => choose('part', id)); $('parts').append(b); }
  for (const b of $('views').children) b.addEventListener('click', () => choose('view', b.dataset.v));
  $('play').addEventListener('click', () => { if (st.t >= cur.tl.T - 1e-6) st.t = 0; st.play = !st.play; touch(); });
  $('time').addEventListener('input', (e) => { st.play = false; const was = cur.steps[stepAt(st.t)].op; st.t = +e.target.value / 1000 * cur.tl.T; if (cur.steps[stepAt(st.t)].op !== was) resetView(); touch(); });
  $('prev').addEventListener('click', () => goStep(-1));
  $('next').addEventListener('click', () => goStep(1));
  let drag = null; const pts = new Map(); let pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; } else drag = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { st.zoom = clamp(st.zoom * pinch / d, 0.25, 3); touch(); } pinch = d; return; }
    if (drag) { orbit(-(e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.006); drag.x = e.clientX; drag.y = e.clientY; }
  });
  for (const type of ['pointerup', 'pointercancel']) cv.addEventListener(type, (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) drag = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); st.zoom = clamp(st.zoom * Math.exp(e.deltaY * 0.0015), 0.25, 3); touch(); }, { passive: false });
  cv.addEventListener('dblclick', () => { resetView(); touch(); });
  cv.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (k) { e.preventDefault(); orbit(k[0] * 0.12, k[1] * 0.1); return; }
    if (e.key === '+' || e.key === '=') { st.zoom = clamp(st.zoom / 1.15, 0.25, 3); touch(); }
    if (e.key === '-') { st.zoom = clamp(st.zoom * 1.15, 0.25, 3); touch(); }
  });
  const sh = $('sheet'), spts = new Map(); let sdrag = null, spinch = 0;
  const local = (e) => { const r = sh.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  sh.addEventListener('pointerdown', (e) => { sh.setPointerCapture?.(e.pointerId); spts.set(e.pointerId, local(e)); if (spts.size === 2) { const [a, b] = [...spts.values()]; spinch = Math.hypot(a[0] - b[0], a[1] - b[1]); sdrag = null; } else sdrag = local(e); });
  sh.addEventListener('pointermove', (e) => {
    if (!spts.has(e.pointerId)) return; const p = local(e); spts.set(e.pointerId, p);
    if (spts.size === 2) { const [a, b] = [...spts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (spinch) zoomSheet(d / spinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); spinch = d; return; }
    if (sdrag) { pz.x += p[0] - sdrag[0]; pz.y += p[1] - sdrag[1]; sdrag = p; placeSheet(); }
  });
  for (const type of ['pointerup', 'pointercancel']) sh.addEventListener(type, (e) => { spts.delete(e.pointerId); if (spts.size < 2) spinch = 0; if (!spts.size) sdrag = null; });
  sh.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomSheet(Math.exp(-e.deltaY * 0.002), p[0], p[1]); }, { passive: false });
  sh.addEventListener('dblclick', (e) => { const p = local(e); if (pz.k > 1) { pz.k = 1; placeSheet(); } else zoomSheet(3, p[0], p[1]); });
  sh.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (k && pz.k > 1) { e.preventDefault(); pz.x += k[0] * 40; pz.y += k[1] * 40; placeSheet(); return; }
    if (e.key === '+' || e.key === '=') zoomSheet(1.25);
    if (e.key === '-') zoomSheet(0.8);
    if (e.key === '0') { pz.k = 1; placeSheet(); }
  });
  $('reload').addEventListener('click', () => location.reload());
  addEventListener('resize', measure);
  // read the address the event names: a slow frame can let writeHash's timer replace it before this runs
  addEventListener('hashchange', (e) => { clearTimeout(hashTimer); readHash(new URL(e.newURL).hash); load(); touch(); });
  document.addEventListener('visibilitychange', () => { last = 0; });
  const cycle = (k) => { const i = PARTS.indexOf(st.part); choose('part', PARTS[(i + k + PARTS.length) % PARTS.length]); };
  // Sliders a finger can work (see js/touch/slider.js).
  touchSliders();
  gamepad({
    look: { label: 'Turn the view', move(x, y, dt) { orbit(-x * 1.6 * dt, -y * 1.2 * dt); } },
    zoom: { label: ['Machine time back', 'Machine time on'], move(v, dt) { if (st.view === 'draw') { zoomSheet(Math.exp(v * dt * 1.5)); return; } if (!cur.replay) return; st.play = false; st.t = clamp(st.t + v * dt * cur.rate * 2, 0, cur.tl.T); touch(); } },
    prev: { label: 'Previous part', press: () => cycle(-1) },
    next: { label: 'Next part', press: () => cycle(1) },
  });
}

// ---- start ----
function start() {
  if (!gl) throw new Error('This browser does not offer WebGL 2.');
  look = makeLook(gl); shop = makeShop(gl, !!look);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); shop = null; });
  cv.addEventListener('webglcontextrestored', () => { look = makeLook(gl); shop = makeShop(gl, !!look); meshCache.clear(); partKey = holeKey = slotKey = chipKey = ''; touch(); });
  $('loading').hidden = true;
  touch();
}
readHash(); load(); controls(); resetView(); measure();
try { start(); } catch (e) { oops(e); }
// for the tests: what runs into what at time t, with the spindle at rest
function collide(t) {
  const was = [st.t, spin, st.play]; st.play = false; st.t = t; spin = 0;
  const f = frameOf(); [st.t, spin, st.play] = was;
  if (!f.axis) return [];
  for (const it of f.items) if (it.lathe) it.envelope = turnedEnvelope(it.lathe.S, it.lathe.dir, it.lathe.zJaw, DZ);
  const lathe = cur.plan[cur.replay.at(t).op].machine === 'lathe';
  return collisions(f.items, f.axis, f.tip, lathe ? { turning: ['hold', 'part'], still: ['move', 'cut'], cutPart: ['cut', 'part'] }
    : { turning: ['cut', 'spin'], still: ['static', 'part'], skip: [['part', 'cut']] });
}
window.__make = { get lit() { return !!look; }, collide, frame(t) { const was = [st.t, spin]; st.t = t; spin = 0; const f = frameOf(); [st.t, spin] = was; return f; }, st, drawn, get cur() { return cur; }, settle() { st.play = false; touch(); }, res(k) { res = k; measure(); },
  redraw() { if (st.view === 'make') draw(); else sheet(); sync(); gl.finish(); }, at(t) { st.play = false; const was = cur.steps[stepAt(st.t)].op; st.t = t; if (cur.steps[stepAt(t)].op !== was) resetView(); touch(); } };
