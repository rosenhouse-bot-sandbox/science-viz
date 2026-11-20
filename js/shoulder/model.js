// Shoulder: the model. Everything the page shows is worked out here, from the scanned bones and the built
// muscles (shoulder/data/), so that the tests can run it in Node without a browser.
//
// Units are millimetres. The page's axes: x to the body's left (the right arm lies at -x), y up, z forward.
// A pose is { elev, plane, rot, elbow, up }:
//   elev   how far the arm is lifted from hanging at the side, in degrees (0 to 150)
//   plane  which way it is lifted: 0 straight out to the side, 90 straight forward, in degrees
//   rot    turning the arm about its own length: + turns out (the forearm swings out), - turns in
//   elbow  elbow bend, in degrees (0 straight, 90 the forearm level)
//   up     how far the ball of the arm bone has moved up toward the acromion, in mm (a large cuff tear)
import { V, K, bandMesh } from './geom.js';
import { solid } from './solid.js';

// ---- reading the packed meshes -------------------------------------------------------------------
export function unpack(json, buf) {
  const out = {};
  for (const m of json.meshes) {
    const q = new Uint16Array(buf, m.off, m.nv * 3), idx = new Uint16Array(buf, m.off + m.nv * 6, m.ni), pos = new Float32Array(m.nv * 3);
    for (let j = 0; j < m.nv; j++) for (let i = 0; i < 3; i++) pos[3 * j + i] = m.lo[i] + q[3 * j + i] / 65535 * (m.hi[i] - m.lo[i]);
    out[m.name] = { pos, idx };
  }
  return out;
}

// ---- rigid transforms: a 3 × 3 rotation R (rows) and a shift t; p -> R p + t --------------------------
export const I3 = () => ({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] });
const mv = (R, p) => [V.dot(R[0], p), V.dot(R[1], p), V.dot(R[2], p)];
export const apply = (T, p) => V.add(mv(T.R, p), T.t);
export const turn = (T, d) => mv(T.R, d);
const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const tr = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
export const compose = (A, B) => ({ R: mm(A.R, B.R), t: apply(A, B.t) });   // first B, then A
// rotation by angle a (radians) about unit axis k
export function axisR(k, a) {
  const c = Math.cos(a), s = Math.sin(a), C = 1 - c, [x, y, z] = k;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
// turning about an axis through point o
export const about = (o, k, a) => { const R = axisR(k, a); return { R, t: V.sub(o, mv(R, o)) }; };
// the smallest rotation taking unit vector a to unit vector b
function between(a, b) {
  const c = V.cross(a, b), s = V.len(c), d = V.dot(a, b);
  if (s < 1e-9) return d > 0 ? I3().R : axisR(V.norm(V.cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), Math.PI);
  return axisR(V.mul(c, 1 / s), Math.atan2(s, d));
}
const rad = (d) => d * Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const sstep = (a, b, x) => smooth((x - a) / (b - a));

// principal axes of a point list (power iteration); the last is the direction it is thinnest in
function axes(ps) {
  const m = V.mean(ps), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of ps) { const d = V.sub(p, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const out = []; let M = C.map((r) => r.slice());
  for (let n = 0; n < 2; n++) {
    let x = V.norm([1, 0.6, 0.3 + n]); for (let it = 0; it < 100; it++) x = V.norm(mv(M, x));
    const l = V.dot(x, mv(M, x)); out.push(x); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] -= l * x[i] * x[j];
  }
  out.push(V.norm(V.cross(out[0], out[1])));
  return { m, ax: out };
}
const pts = (pos) => { const o = []; for (let i = 0; i < pos.length; i += 3) o.push([pos[i], pos[i + 1], pos[i + 2]]); return o; };

// ---- the muscles -----------------------------------------------------------------------------------
// Names on the page, what each attaches to, and what it does (sources in facts.js).
export const MUSCLES = [
  { id: 'supra', name: 'Supraspinatus', cuff: true, from: 'scapula' },
  { id: 'infra', name: 'Infraspinatus', cuff: true, from: 'scapula' },
  { id: 'tminor', name: 'Teres minor', cuff: true, from: 'scapula' },
  { id: 'subscap', name: 'Subscapularis', cuff: true, from: 'scapula' },
  { id: 'deltA', name: 'Deltoid, front part', cuff: false, from: 'clavicle' },
  { id: 'deltM', name: 'Deltoid, middle part', cuff: false, from: 'scapula' },
  { id: 'deltP', name: 'Deltoid, back part', cuff: false, from: 'scapula' },
];
export const BONES = ['scapula', 'clavicle', 'humerus', 'radius', 'ulna', 'rib1', 'rib2', 'rib3', 'rib4', 'rib5', 'rib6', 'rib7', 'manubrium', 'sternum'];
// which body each bone moves with
const BODY = { scapula: 'scapula', clavicle: 'clavicle', humerus: 'humerus', radius: 'forearm', ulna: 'forearm' };

export const CLEAR = 2;       // mm kept between the arm bone and the acromion as the arm lifts (see glide)
export const ROTS = [-60, -45, -30, -15, 0, 15, 30, 45, 60];   // the arm's turns the glide is worked out for
export function makeModel(bones, musclesJson, table = null) {
  const mk = musclesJson.marks, HC = mk.HC, AC = mk.AC, EL = mk.EL, headR = mk.headR;
  // The shoulder blade's own plane, measured from the scanned bone: the direction it is thinnest in.
  const sc = axes(pts(bones.scapula.pos));
  let NS = sc.ax[2]; if (NS[2] < 0) NS = V.mul(NS, -1);          // facing forward
  const DOWN = V.norm(V.sub(EL, HC));                              // the arm bone's length, shoulder to elbow, as scanned
  // the elbow bends about the axis across the arm, square to forward
  const ELB = V.norm(V.cross(DOWN, [0, 0, 1]));
  // the acromion: the part of the shoulder blade above the ball and outside the joint with the collarbone
  const acro = []; {
    const p = bones.scapula.pos, f = bones.scapula.idx;
    for (let i = 0; i < f.length; i += 3) {
      const c = [0, 1, 2].map((k) => (p[3 * f[i] + k] + p[3 * f[i + 1] + k] + p[3 * f[i + 2] + k]) / 3);
      if (c[1] > HC[1] + 0.8 * headR && c[0] < AC[0] + 12 && c[0] > HC[0] - 45) acro.push(f[i], f[i + 1], f[i + 2]);
    }
  }
  // the top of the arm bone: the part that can come near the acromion
  const humTop = []; { const p = bones.humerus.pos; for (let i = 0; i < p.length; i += 3) if (p[i + 1] > HC[1] - 30 && Math.hypot(p[i] - HC[0], p[i + 1] - HC[1], p[i + 2] - HC[2]) < headR + 16) humTop.push([p[i], p[i + 1], p[i + 2]]); }

  // ---- the pose: where each bone is ----
  // The arm is lifted two parts at the joint for each part the shoulder blade turns up (the 2:1 rhythm, Inman
  // 1944), the shoulder blade turning in its own plane about its joint with the collarbone. The shoulder blade
  // also turns about the upright through that joint by the least amount that keeps it off the ribs (fitPlane,
  // below); the collarbone stays still. The ball turns about its middle, found by fitting a sphere to the scan.
  // In this scan the acromion sits low over the ball, and turning alone would bring the bones together, so the
  // ball also slides down in its socket by the least amount that keeps CLEAR mm between them (glide, below).
  const SCJ = mk.SCJ, UPAX = [0, 1, 0];
  function blade(e, back, ir) {
    const C = about(SCJ, UPAX, -rad(back));
    const own = compose(about(AC, UPAX, rad(ir)), about(AC, NS, -e / 3));
    return { clav: C, scap: compose(C, own) };
  }
  function pose(P) {
    const e = rad(clamp(P.elev ?? 0, 0, 150)), pl = rad(P.plane ?? 30), up = P.up ?? 0;
    const fit = P.fit || stored(P.elev ?? 0, P.plane ?? 30), { clav, scap } = blade(e, fit.back, fit.ir);
    // the arm bone's final direction: down, turned toward the chosen direction by the whole lift
    const H = V.norm([-Math.cos(pl), 0, Math.sin(pl)]), ax = V.norm(V.cross(DOWN, H)), full = axisR(ax, e);
    const rot = P.rot ?? 0;
    const twist = axisR(DOWN, rad(rot));                           // about the arm's length, + turns the forearm out
    const Rg = mm(tr(scap.R), mm(full, twist));                   // the joint's own turn: what is left after the shoulder blade's
    const joint = { R: Rg, t: V.sub(HC, mv(Rg, HC)) };
    let hum = compose(scap, joint);
    // the ball slides down to keep its room (unless told not to), and a large tear lets it ride up
    const slide = (P.auto === false ? 0 : -glideAt(fit, rot)) + up;
    if (slide) { const dir = turn(scap, [0, 1, 0]); hum = { R: hum.R, t: V.add(hum.t, V.mul(dir, slide)) }; }
    const fore = compose(hum, about(EL, ELB, rad(P.elbow ?? 0)));
    return { scapula: scap, clavicle: clav, humerus: hum, forearm: fore, rest: I3(), fit };
  }
  const bodyOf = (b) => BODY[b] || 'rest';

  // ---- the gap under the acromion: the narrowest distance from the top of the arm bone to the acromion ----
  // Worked out in the shoulder blade's own frame, where the acromion's triangles never move.
  const AT = []; {
    const p = bones.scapula.pos, P3 = (k) => [p[3 * k], p[3 * k + 1], p[3 * k + 2]];
    for (let i = 0; i < acro.length; i += 3) { const a = P3(acro[i]), b = P3(acro[i + 1]), c = P3(acro[i + 2]), m = V.mean([a, b, c]); AT.push({ a, b, c, m, r: Math.max(...[a, b, c].map((q) => V.len(V.sub(q, m)))) }); }
  }
  // the acromion's triangles grouped in 10 mm cells, each with a ball round it, so that most can be skipped at once
  const cells = new Map();
  for (const t of AT) { const k = t.m.map((x) => Math.floor(x / 10)).join(); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
  const groups = [...cells.values()].map((ts) => { const c = V.mean(ts.map((t) => t.m)); return { c, r: Math.max(...ts.map((t) => V.len(V.sub(t.m, c)) + t.r)), ts }; });
  const AM = V.mean(AT.map((t) => t.m));
  function gap(T) {
    const inv = { R: tr(T.scapula.R) }; inv.t = V.mul(mv(inv.R, T.scapula.t), -1);
    const rel = compose(inv, T.humerus);                       // the arm bone as seen from the shoulder blade
    const qs = humTop.map((q) => apply(rel, q)).sort((x, y) => V.len(V.sub(x, AM)) - V.len(V.sub(y, AM)));
    let best = 1e9, at = null, on = null;
    for (const q of qs) for (const g of groups) {
      if (V.len(V.sub(q, g.c)) - g.r >= best) continue;
      for (const t of g.ts) {
        if (V.len(V.sub(q, t.m)) - t.r >= best) continue;
        const cp = closest(q, t.a, t.b, t.c), d = V.len(V.sub(q, cp)); if (d < best) { best = d; at = q; on = cp; }
      }
    }
    return { mm: best, from: apply(T.scapula, at), to: apply(T.scapula, on) };
  }

  // ---- fitting the pose: off the ribs, and room under the acromion ----
  let RIBS = null, BLADE = null;
  function ribPen(T) {
    if (!RIBS) {
      RIBS = ['rib1', 'rib2', 'rib3', 'rib4', 'rib5', 'rib6', 'rib7'].map((r) => solid(bones[r], 1));
      // the part of the shoulder blade that can reach the ribs: its inner half, every third point; and the collarbone
      BLADE = []; const p = bones.scapula.pos; for (let i = 0; i < p.length; i += 9) if (p[i] > HC[0] + 50) BLADE.push([p[i], p[i + 1], p[i + 2]]);
      const c = bones.clavicle.pos; RIBS.clav = []; for (let i = 0; i < c.length; i += 3) RIBS.clav.push([c[i], c[i + 1], c[i + 2]]);
    }
    let n = 0;
    for (const [list, Tb] of [[BLADE, T.scapula], [RIBS.clav, T.clavicle]]) for (const p of list) { const q = apply(Tb, p); for (const r of RIBS) if (r.depth(q) > 0.5) { n++; break; } }
    return n;
  }
  // At each step of lift the shoulder blade's turn is searched near the step before (so that the motion is
  // smooth) for the smallest that keeps it off the ribs. Then, for each of the arm's turns in ROTS, the ball is let
  // slide down until it is CLEAR mm from the acromion.
  function fitPlane(plane) {
    const out = []; let back = 0, ir = 0;
    for (let i = 0; i <= 150 / STEP; i++) {
      const elev = i * STEP; let best = null;
      for (let db = -6; db <= 6; db += 1.5) for (let di = -6; di <= 6; di += 1.5) {
        const b = Math.max(0, back + db), r = ir + di, bl = blade(rad(elev), b, r), n = ribPen({ scapula: bl.scap, clavicle: bl.clav }), cost = n * 1000 + b * b + r * r;
        if (!best || cost < best.cost) best = { cost, back: b, ir: r, n };
      }
      back = best.back; ir = best.ir;
      const at = { back, ir, glide: ROTS.map(() => 0) }, slid = ROTS.map((rot) => {
        const ok = (d) => gap(pose({ elev, plane, rot, auto: false, up: -d, fit: at })).mm >= CLEAR;
        if (ok(0)) return 0;
        let lo = 0, hi = 1; while (!ok(hi) && hi < 20) { lo = hi; hi += 1; } for (let n = 0; n < 6; n++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
        return +hi.toFixed(2);
      });
      out.push({ back: +back.toFixed(2), ir: +ir.toFixed(2), glide: slid, ribs: best.n });
    }
    return out;
  }
  // kept in shoulder/data/pose.json (tests/shoulder/build-pose.mjs), so that the page need not work it out
  const STEP = 5, PLANES = [0, 30, 90], memo = {};
  const rows = (plane) => (table && table.clear === CLEAR && table.step === STEP && String(table.rots) === String(ROTS) && table.planes[plane]) || (memo[plane] ||= fitPlane(plane));
  function stored(elev, plane) {
    const R = rows(plane), e = clamp(elev, 0, 150) / STEP, i = Math.min(R.length - 2, Math.floor(e)), f = e - i, a = R[i], b = R[i + 1];
    return { back: a.back + (b.back - a.back) * f, ir: a.ir + (b.ir - a.ir) * f, glide: a.glide.map((g, k) => g + (b.glide[k] - g) * f) };
  }
  // how far the ball slides down at this lift for a turn of the arm (between the turns worked out)
  function glideAt(fit, rot) {
    const r = clamp(rot, ROTS[0], ROTS[ROTS.length - 1]), k = Math.min(ROTS.length - 2, Math.floor((r - ROTS[0]) / (ROTS[1] - ROTS[0]))), f = (r - ROTS[k]) / (ROTS[k + 1] - ROTS[k]);
    return fit.glide[k] + (fit.glide[k + 1] - fit.glide[k]) * f;
  }
  const makeTable = () => ({ clear: CLEAR, step: STEP, rots: ROTS, planes: Object.fromEntries(PLANES.map((pl) => [pl, fitPlane(pl)])) });

  // ---- the muscles at a pose ----
  // The bones a moving muscle can be pushed into, as solids (solid.js): the top of the arm bone, the shoulder
  // blade round the joint, and the collarbone.
  const SOL = {
    humerus: solid(bones.humerus, 1.5, [[-1e9, HC[1] - 170, -1e9], [1e9, 1e9, 1e9]]),
    scapula: solid(bones.scapula, 1.5, [[HC[0] - 40, HC[1] - 70, HC[2] - 70], [HC[0] + 70, 1e9, HC[2] + 70]]),
    clavicle: solid(bones.clavicle, 1.5),
  };
  const invT = (T) => { const R = tr(T.R); return { R, t: V.mul(mv(R, T.t), -1) }; };
  const built = MUSCLES.map((m) => {
    const sl = musclesJson.muscles[m.id][0], mesh = bandMesh({ sl }), S = sl.length, L0 = arc(sl.map((s) => s.c));
    const rest = pts(mesh.pos), t = []; for (let i = 0; i < mesh.tt.length; i += 3) t.push(mesh.tt[i]);
    const slice = rest.map((_, i) => (i < S * 2 * K ? Math.floor(i / (2 * K)) : i === S * 2 * K ? 0 : S - 1));
    // how close the muscle comes to the middle of the ball at rest: it is never pushed in closer than that
    const near = Math.min(...rest.map((p) => V.len(V.sub(p, HC))));
    // The scans overlap the bones where a muscle attaches, and a little elsewhere. A point already inside a bone
    // at rest is left there; any other point is never let into a bone.
    const restIn = Object.fromEntries(Object.entries(SOL).map(([k, f]) => [k, rest.map((p) => f.depth(p) > 0)]));
    return { ...m, sl, mesh, rest, t, slice, L0, wrap: Math.min(headR + 1.2, near), restIn };
  });
  // how much of the insertion's movement a point at t (0 origin, 1 insertion) takes
  const follow = (t) => sstep(0.55, 0.97, t);
  function muscle(b, T, opts = {}) {
    const O = T[b.from], H = T.humerus, ball = apply(H, HC), into = Object.keys(SOL).map((k) => [k, SOL[k], T[k], invT(T[k])]);
    const at = (p, t) => { const w = follow(t); return w <= 0 ? apply(O, p) : w >= 1 ? apply(H, p) : V.add(V.mul(apply(O, p), 1 - w), V.mul(apply(H, p), w)); };
    // a muscle keeps its volume: its cross-section grows as it shortens
    const cs = b.sl.map((s, i) => at(s.c, i / (b.sl.length - 1))), L = arc(cs), k = Math.sqrt(b.L0 / L) * (opts.thick || 1);
    const out = new Float32Array(b.rest.length * 3);
    b.rest.forEach((p, i) => {
      const s = b.sl[b.slice[i]], kk = k;
      const sw = opts.swell ? opts.swell(b.t[i], i) : 1;
      let q = at(V.add(s.c, V.mul(V.sub(p, s.c), kk * sw)), b.t[i]);
      // wrapped over the ball: never closer to its middle than at rest
      const d = V.sub(q, ball), l = V.len(d); if (l < b.wrap) q = V.add(ball, V.mul(d, b.wrap / l));
      for (const [k, f, Tk, Ik] of into) {
        if (b.restIn[k][i]) continue;
        const loc = apply(Ik, q), dp = f.depth(loc); if (dp <= 0) continue;
        const o = f.out(loc); if (o) q = apply(Tk, V.add(loc, V.mul(o, dp + 0.4)));
      }
      out[3 * i] = q[0]; out[3 * i + 1] = q[1]; out[3 * i + 2] = q[2];
    });
    return { pos: out, length: L, rest: b.L0 };
  }

  return { marks: mk, headR, NS, DOWN, pose, bodyOf, gap, stored, glideAt, makeTable, PLANES, built, muscle, bones, SOL, invT, ribPen };
}

export function arc(cs) { let L = 0; for (let i = 1; i < cs.length; i++) L += V.len(V.sub(cs[i], cs[i - 1])); return L; }
export function closest(p, a, b, c) {
  const ab = V.sub(b, a), ac = V.sub(c, a), ap = V.sub(p, a), d1 = V.dot(ab, ap), d2 = V.dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = V.sub(p, b), d3 = V.dot(ab, bp), d4 = V.dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return V.add(a, V.mul(ab, d1 / (d1 - d3)));
  const cp = V.sub(p, c), d5 = V.dot(ab, cp), d6 = V.dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return V.add(a, V.mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return V.add(b, V.mul(V.sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const den = 1 / (va + vb + vc); return V.add(a, V.add(V.mul(ab, vb * den), V.mul(ac, vc * den)));
}
