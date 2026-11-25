// Gears on a cube and an octahedron: what the part looks like at any moment of its machining, and where the tool is.
// A part's plan (plan.js) is laid out on a timeline in real seconds; state(t) replays every pass up to t.
//
// A lathe part is kept as two radii along its axis, sampled every 0.01 mm: the outside (ro) and the inside (ri).
// Where ro <= ri there is no metal. A mill part is a list of planes (it stays convex), with holes, gear gaps and a
// slot on top.
import { dot, cross, norm } from './model.js?v=e35e505e';
import { bodyFaces } from './model.js?v=e35e505e';

export const DZ = 0.01;
const RAPID = 0.8, CHANGE = 2.5;        // seconds to bring a tool in between passes, and to change tools between steps
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, f) => a + (b - a) * f;

// ---- the timeline ----
// every pass gets a start and an end in real seconds; a step starts with a tool change
export function timeline(plan) {
  const out = [];
  let t = 0;
  plan.forEach((op, oi) => op.steps.forEach((st, si) => {
    const s0 = t; t += CHANGE;
    st.passes.forEach((p, pi) => {
      const len = passLength(p, op);
      const dur = Math.max(0.4, len / (p.feed || 1));
      out.push({ op: oi, step: si, pass: pi, t0: t + RAPID, t1: t + RAPID + dur, p });
      t += RAPID + dur;
    });
    t += RAPID;
    st.t0 = s0; st.t1 = t;
  }));
  return { segs: out, T: t };
}
function passLength(p, op) {
  if (p.k === 'face' || p.k === 'faceIn' || p.k === 'part') return Math.abs(p.r1 - p.r0);
  if (p.k === 'turn' || p.k === 'bore') { let l = 0; for (let i = 1; i < p.pts.length; i++) l += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]); return l; }
  if (p.k === 'drill') return Math.abs(p.z1 - p.z0);
  if (p.k === 'thread') return Math.abs(p.z1 - p.z0);
  if (p.k === 'hole' || p.k === 'tap') return p.depth + 0.5;
  if (p.k === 'plane') return p.len || 20;
  if (p.k === 'gap') return 8;
  if (p.k === 'slot') return Math.abs(p.to - p.from);
  return 1;
}

// ---- lathe ----
// the grid covers from a little inside the chuck to the free end
export function latheStart(op, prev) {
  if (prev) return { ...prev, ro: prev.ro.slice(), ri: prev.ri.slice(), thread: prev.thread && prev.thread.slice() };
  const a = op.zJaw - op.dir * 12, b = op.stock.free;
  const z0 = Math.min(a, b), n = Math.round(Math.abs(b - a) / DZ) + 1;
  const ro = new Float32Array(n).fill(op.stock.r), ri = new Float32Array(n);
  return { z0, n, ro, ri, thread: null, stockR: op.stock.r, sawn: op.stock.free };
}
const idx = (S, z) => (z - S.z0) / DZ;
// the radius of a path at z, over the part of it covered so far (progress f along its length), or null
function pathAt(pts, f) {
  let L = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let left = f * L; const cov = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (left >= seg[i - 1]) { cov.push(pts[i]); left -= seg[i - 1]; continue; }
    const u = seg[i - 1] ? left / seg[i - 1] : 0; cov.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]); break;
  }
  return cov;
}
function rOnPath(cov, z) {
  let best = null;
  for (let i = 1; i < cov.length; i++) {
    const [za, ra] = cov[i - 1], [zb, rb] = cov[i];
    if ((z - za) * (z - zb) > 1e-12) continue;
    const r = Math.abs(zb - za) < 1e-9 ? Math.min(ra, rb) : lerp(ra, rb, (z - za) / (zb - za));
    best = best === null ? r : Math.min(best, r);
  }
  return best;
}
// apply pass p to the lathe state S, as far as progress f (0 to 1); returns where the tool's tip is: [z, r]
export function lathePass(S, op, p, f) {
  const beyond = (z, z0) => (op.dir > 0 ? z >= z0 - 1e-9 : z <= z0 + 1e-9);
  if (p.k === 'faceIn' && p.r0 > p.r1) {
    // fed in toward the center: the ring between the bore and the tool is still there until the tool reaches it
    const r = lerp(p.r0, p.r1, f), ring = new Array(S.n).fill(null);
    let any = false;
    for (let i = 0; i < S.n; i++) {
      const z = S.z0 + i * DZ; if (!beyond(z, p.z) || S.ri[i] >= p.r0) continue;
      if (r - S.ri[i] > 0.15) { ring[i] = [S.ri[i], r]; any = true; }
      S.ri[i] = p.r0;
    }
    S.ring = any ? ring : null;
    return [p.z, r];
  }
  if (p.k === 'face' || p.k === 'faceIn') {
    const r = lerp(p.r0, p.r1, f);
    for (let i = 0; i < S.n; i++) { const z = S.z0 + i * DZ; if (!beyond(z, p.z)) continue; if (p.k === 'face') S.ro[i] = Math.min(S.ro[i], r); else S.ri[i] = Math.max(S.ri[i], r); }
    return [p.z, r];
  }
  if (p.k === 'turn' || p.k === 'bore') {
    const cov = pathAt(p.pts, f);
    const zs = cov.map((q) => q[0]), lo = Math.min(...zs), hi = Math.max(...zs);
    const a = Math.max(0, Math.ceil(idx(S, lo))), b = Math.min(S.n - 1, Math.floor(idx(S, hi)));
    if (cov.length > 1) for (let i = a; i <= b; i++) { const r = rOnPath(cov, S.z0 + i * DZ); if (r === null) continue; if (p.k === 'turn') S.ro[i] = Math.min(S.ro[i], r); else S.ri[i] = Math.max(S.ri[i], r); }
    return cov[cov.length - 1];
  }
  if (p.k === 'drill') {
    const tip = lerp(p.z0, p.z1, f), into = -op.dir;       // the drill goes in toward the chuck
    for (let i = 0; i < S.n; i++) {
      const z = S.z0 + i * DZ, back = (z - tip) * -into;     // how far behind the tip, toward the free end
      if (back < 0) continue;
      let r = back * Math.tan(59 * Math.PI / 180);          // a 118° point
      if (p.pilot) r = back < p.pilot * 1.2 ? Math.min(p.pilot / 2, r) : Math.min(p.d / 2, p.pilot / 2 + (back - p.pilot * 1.2) * Math.tan(30 * Math.PI / 180));
      else r = Math.min(p.d / 2, r);
      S.ri[i] = Math.max(S.ri[i], r);
    }
    return [tip, 0];
  }
  if (p.k === 'part') {
    const r = lerp(p.r0, p.r1, f), za = op.dir > 0 ? p.z - p.w : p.z, zb = op.dir > 0 ? p.z : p.z + p.w;
    for (let i = Math.max(0, Math.ceil(idx(S, za))); i <= Math.min(S.n - 1, Math.floor(idx(S, zb))); i++) S.ro[i] = Math.min(S.ro[i], r);
    return [p.z, r];
  }
  if (p.k === 'thread') { const z = lerp(p.z0, p.z1, f); S.thread = [Math.min(p.z0, z), Math.max(p.z0, z)]; return [z, 0]; }
  return [0, 0];
}
// after a part-off: keep only the piece on the free side
export function keepFree(S, op) {
  // find the last cut (no metal) seen from the free end
  const order = []; for (let i = 0; i < S.n; i++) order.push(i);
  if (op.dir > 0) order.reverse();
  let cut = -1, met = false;
  for (const i of order) { if (S.ro[i] > S.ri[i] + 1e-6) met = true; else if (met) { cut = i; break; } }
  if (cut < 0) return S;
  const a = op.dir > 0 ? cut : 0, b = op.dir > 0 ? S.n - 1 : cut;
  return { ...S, z0: S.z0 + a * DZ, n: b - a + 1, ro: S.ro.slice(a, b + 1), ri: S.ri.slice(a, b + 1), ring: null };
}
// the outline as closed loops of [r, z], one per separate piece, simplified, for turning into a mesh
export function outline(S) {
  const loops = [];
  let i = 0;
  while (i < S.n) {
    while (i < S.n && S.ro[i] <= S.ri[i] + 1e-6) i++;
    if (i >= S.n) break;
    let j = i; while (j + 1 < S.n && S.ro[j + 1] > S.ri[j + 1] + 1e-6) j++;
    const outer = [], inner = [];
    for (let k = i; k <= j; k++) { const z = S.z0 + k * DZ; outer.push([S.ro[k], z]); inner.push([S.ri[k], z]); }
    loops.push({ outer: simplify(outer), inner: simplify(inner), z0: S.z0 + i * DZ, z1: S.z0 + j * DZ });
    i = j + 1;
  }
  // a ring left inside a recess while it is faced toward the center
  for (let i = 0; S.ring && i < S.n; i++) {
    if (!S.ring[i]) continue;
    let j = i; while (j + 1 < S.n && S.ring[j + 1]) j++;
    const outer = [], inner = [];
    for (let k = i; k <= j; k++) { const z = S.z0 + k * DZ; outer.push([S.ring[k][1], z]); inner.push([S.ring[k][0], z]); }
    loops.push({ outer: simplify(outer), inner: simplify(inner), z0: S.z0 + i * DZ, z1: S.z0 + j * DZ });
    i = j;
  }
  return loops;
}
function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = out[out.length - 1], b = pts[k], c = pts[k + 1];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) > 1e-7 || Math.abs(b[0] - c[0]) > 0.02) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---- mill ----
// the cut a plane pass makes, laid out once: where the tool starts and ends along u, and the face's middle
export function planeGeometry(planes, p, R) {
  const f = bodyFaces([...planes, { n: p.n, d: p.d, kind: 'this' }]).find((q) => q.kind === 'this');
  if (!f) return null;
  const us = f.poly.map((q) => dot(q, p.u)), c = f.poly.reduce((s, q) => [s[0] + q[0] / f.poly.length, s[1] + q[1] / f.poly.length, s[2] + q[2] / f.poly.length], [0, 0, 0]);
  return { s0: Math.min(...us) - R - 0.5, s1: Math.max(...us) + R + 0.5, c, poly: f.poly };
}
// a mill state: planes (the part so far), the plane being cut (with how far along), holes, gaps, slot
export function millStart(planes, extra = {}) { return { planes: planes.slice(), cut: null, holes: [], gaps: null, slot: null, ...extra }; }

// ---- the whole part at time t ----
// returns { op, step, pass, seg, f, lathe: S | null, mill: M | null }; startOf(op) gives each setup's starting state
export function makeReplay(plan, tl, start) {
  // the state at the start of each setup, worked out once
  const atOp = [];
  let S = null, M = null;
  plan.forEach((op, oi) => {
    if (op.machine === 'lathe') S = latheStart(op, S && oi > 0 ? S : null);
    else if (!M) M = start.mill(S);
    atOp.push({ S: S && { ...S, ro: S.ro.slice(), ri: S.ri.slice() }, M: M && clone(M) });
    for (const g of tl.segs.filter((q) => q.op === oi)) {
      if (op.machine === 'lathe') lathePass(S, op, g.p, 1); else millPass(M, op, g.p, 1, start);
    }
    if (op.machine === 'lathe' && op.steps.some((st) => st.passes.some((p) => p.k === 'part'))) S = keepFree(S, op);
  });
  const final = { S, M };
  return {
    atOp, final,
    at(t) {
      const segs = tl.segs;
      let k = segs.findIndex((g) => g.t1 > t); if (k < 0) k = segs.length - 1;
      const g = segs[k], oi = g.op, op = plan[oi];
      const base = atOp[oi], s = base.S && { ...base.S, ro: base.S.ro.slice(), ri: base.S.ri.slice(), thread: base.S.thread && base.S.thread.slice() }, m = base.M && clone(base.M);
      let tip = null, f = 0, cur = null;
      for (const q of segs) {
        if (q.op !== oi) continue;
        if (q.t0 > t) break;
        f = clamp((t - q.t0) / (q.t1 - q.t0), 0, 1); cur = q;
        tip = op.machine === 'lathe' ? lathePass(s, op, q.p, f) : millPass(m, op, q.p, f, start);
      }
      // between passes the tool is pulled back: how far, 0 (cutting) to 1 (clear)
      let away = 1;
      if (cur && op.machine === 'lathe' && t > cur.t1) {
        // on the lathe: out the way it came (off the face, or out of a bore or recess, along the axis; off a turned
        // diameter, outward), across while clear, and in again at the next pass's start
        const next = segs[segs.indexOf(cur) + 1], o1 = liftOf(cur.p, op), end = tip, u = t - cur.t1;
        const gap = next && next.op === oi ? next.t0 - cur.t1 : Infinity, R = Math.min(RAPID, gap / 3);
        const at = (q, o, k) => [q[0] + o[0] * k, q[1] + o[1] * k];
        if (u < R || gap === Infinity) { away = Math.min(1, u / R); tip = at(end, o1, away); }
        else {
          const start = lathePass({ ...s, ro: s.ro.slice(), ri: s.ri.slice() }, op, next.p, 0), o2 = liftOf(next.p, op);
          if (gap - u < R) { away = (gap - u) / R; tip = at(start, o2, away); }
          else { const w = smooth((u - R) / (gap - 2 * R)), a = at(end, o1, 1), b = at(start, o2, 1); tip = [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]; }
          if (u > gap / 2) cur = next;     // the next pass's tool, once this one is clear
        }
        return { op: oi, step: cur.step, seg: cur, f: cur === next ? 0 : f, tip, away, lathe: s, mill: m };
      }
      if (cur) {
        if (t <= cur.t1) away = 0;
        else away = clamp((t - cur.t1) / RAPID, 0, 1);
        const next = segs[segs.indexOf(cur) + 1];
        if (next && next.op === oi && next.step === cur.step && t > next.t0 - RAPID) away = Math.min(away, clamp((next.t0 - t) / RAPID, 0, 1));
      } else { cur = segs.find((q) => q.op === oi); away = 1; }
      // a parted-off piece stays in view until the setup ends
      return { op: oi, step: cur.step, seg: cur, f, tip, away, lathe: s, mill: m };
    },
  };
}
// which way a lathe tool comes off the work after a pass, in the part's [z, r]: off a turned diameter or a parting cut,
// outward; everything else (a face, a recess, a bore, a drill, the die) back along the axis toward the free end
function liftOf(p, op) { return p.k === 'turn' || p.k === 'part' ? [0, 4] : [op.dir * 5, 0]; }
const smooth = (x) => x * x * (3 - 2 * x);
const clone = (M) => ({ ...M, planes: M.planes.slice(), holes: M.holes.map((h) => ({ ...h })), gaps: M.gaps && M.gaps.slice(), slot: M.slot && M.slot.slice(), cut: null });

// a plane cut replaces any shallower cut with the same normal
function addPlane(planes, n, d) {
  const i = planes.findIndex((q) => dot(q.n, n) > 1 - 1e-9);
  if (i >= 0) { if (d < planes[i].d) planes[i] = { ...planes[i], d, kind: 'cut' }; } else planes.push({ n, d, kind: 'cut' });
}
// apply mill pass p as far as f; returns the tool's position: { at: point in part frame, axis, ... }
export function millPass(M, op, p, f, start) {
  if (p.k === 'plane') {
    const R = p.tool === 'chamfer' ? 2 : (start.toolR || 6);
    const geo = p.geo || (p.geo = planeGeometry(M.planes, p, R));
    if (!geo) { if (f >= 1) addPlane(M.planes, p.n, p.d); return null; }
    const s = lerp(geo.s0, geo.s1, f);
    if (f >= 1) { addPlane(M.planes, p.n, p.d); M.cut = null; }
    else M.cut = { n: p.n, d: p.d, u: p.u, s: s + R };
    const c = geo.c, cu = dot(c, p.u);
    return { at: [0, 1, 2].map((k) => c[k] + p.u[k] * (s - cu)), n: p.n, u: p.u };
  }
  if (p.k === 'hole' || p.k === 'tap') {
    const face = M.planes.filter((q) => dot(q.n, p.n) > 0.999).reduce((a, q) => Math.min(a, q.d), Infinity);
    const c = p.n.map((x) => x * face);
    let h = M.holes.find((q) => dot(q.n, p.n) > 0.999);
    if (!h) { h = { n: p.n, c, d: 0, depth: 0, spot: 0, tap: 0 }; M.holes.push(h); }
    const dep = p.depth * f;
    if (p.k === 'tap') h.tap = Math.max(h.tap, dep);
    else if (p.spot) h.spot = Math.max(h.spot, dep);
    else { h.d = p.d; h.depth = Math.max(h.depth, dep); }
    return { at: c.map((x, k) => x - p.n[k] * dep), n: p.n, hole: true };
  }
  if (p.k === 'gap') {
    if (!M.gaps) M.gaps = new Float32Array(start.N);
    if (p.side === 0) M.gaps[p.gap] = Math.max(M.gaps[p.gap], f);
    return { gap: p.gap, side: p.side, f };
  }
  if (p.k === 'slot') { const y = lerp(p.from, p.to, f); M.slot = [p.from, y]; return { slot: y }; }
  return null;
}
