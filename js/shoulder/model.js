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
import { V, K, bandMesh, binU } from './geom.js?v=ecd3e6ce';
import { solid } from './solid.js?v=ecd3e6ce';

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

// the bursa: from how far along the supraspinatus it starts (0 origin, 1 insertion), and how much wider than the tendon
export const BURSA = { from: 0.62, wide: 1.5 };
export const CLEAR = 2;       // mm kept between the arm bone and the acromion as the arm lifts (see glide)
export const ROTS = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90];   // the arm's turns the glide is worked out for
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
    let glide = P.auto === false ? 0 : glideAt(fit, rot);
    const dir = turn(scap, [0, 1, 0]), moved = (g) => ({ R: hum.R, t: V.add(hum.t, V.mul(dir, up - g)) });
    // the stored glide is worked out on a grid of lifts and turns; between them, slide a little further if needed
    if (P.auto !== false && up === 0) for (let k = 0; k < 3; k++) { const g = gap({ scapula: scap, humerus: moved(glide) }).mm; if (g >= CLEAR - 0.01) break; glide += CLEAR - g + 0.03; }
    if (glide || up) hum = moved(glide);
    const fore = compose(hum, about(EL, ELB, rad(P.elbow ?? 0)));
    return { scapula: scap, clavicle: clav, humerus: hum, forearm: fore, rest: I3(), fit, glide };
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
  // Each corner of a built mesh, in its slice's own terms: which slice, how far across (u), the middle of the
  // outline there and its half thickness, and whether it is on the top face; so that a condition can thicken or
  // thin the outline before the muscle is moved.
  function corners(sl, mesh) {
    const S = sl.length, M = 2 * K, out = [];
    for (let i = 0; i < S; i++) for (let j = 0; j < M; j++) {
      const s = sl[i], top = j < K, jj = top ? j : M - 1 - j, u = s.lo + binU(jj) * (s.hi - s.lo);
      out.push({ i, u, mid: (s.top[jj] + s.bot[jj]) / 2, h: Math.max(0.3, (s.top[jj] - s.bot[jj]) / 2), top, s: binU(jj) });
    }
    out.push({ cap: 0 }, { cap: S - 1 });
    return out;
  }
  function makeBuilt(m, sl) {
    const mesh = bandMesh({ sl }), S = sl.length, L0 = arc(sl.map((q) => q.c));
    const rest = pts(mesh.pos), t = []; for (let i = 0; i < mesh.tt.length; i += 3) t.push(mesh.tt[i]);
    // how close the muscle comes to the middle of the ball at rest: it is never pushed in closer than that
    const near = Math.min(...rest.map((p) => V.len(V.sub(p, HC))));
    // The scans overlap the bones where a muscle attaches, and a little elsewhere. A point already inside a bone
    // at rest is left there; any other point is never let into a bone.
    const restIn = Object.fromEntries(Object.entries(SOL).map(([k, f]) => [k, rest.map((p) => f.depth(p) > 0)]));
    return { ...m, sl, mesh, rest, t, at: corners(sl, mesh), L0, S, wrap: Math.min(headR + 1.2, near), restIn };
  }
  // Each slice's W axis is turned, if need be, to point away from the ball, so that a muscle's "top" face is the
  // one away from the joint (for the supraspinatus, the side the bursa lies on). Turning U and W together by half
  // a turn leaves the shape as it is.
  function outward(sl) {
    if (sl.reduce((a, q) => a + V.dot(q.W, V.sub(q.c, HC)), 0) >= 0) return sl;
    return sl.map((q) => ({ ...q, U: V.mul(q.U, -1), W: V.mul(q.W, -1), lo: -q.hi, hi: -q.lo,
      top: q.bot.map((_, k) => -q.bot[K - 1 - k]), bot: q.top.map((_, k) => -q.top[K - 1 - k]) }));
  }
  const built = MUSCLES.map((m) => makeBuilt(m, outward(musclesJson.muscles[m.id][0])));

  // The subacromial bursa: a thin closed sac between the supraspinatus tendon and the acromion. It is not in the
  // scans; it is built as a sheet lying on the tendon's top face, over its last part (BURSA.from to the end) and
  // wider than the tendon, and it moves with the tendon. Its thickness is set by the condition.
  const supra = built[0];
  function bursaSlices(thick) {
    const out = [], S = supra.S, i0 = Math.floor(BURSA.from * (S - 1));
    for (let i = i0; i < S; i++) {
      const s = supra.sl[i], w = (s.hi - s.lo) * BURSA.wide, c0 = (s.lo + s.hi) / 2, lo = c0 - w / 2, hi = c0 + w / 2, along = (i - i0) / (S - 1 - i0);
      const end = Math.sin(Math.PI * clamp(along * 0.9 + 0.05));               // the sac closes at both ends
      const top = [], bot = [];
      for (let j = 0; j < K; j++) {
        const u = lo + binU(j) * (hi - lo), f = clamp((u - s.lo) / (s.hi - s.lo)), x = f * (K - 1), k = Math.min(K - 2, Math.floor(x)), g = x - k;
        const floor = s.top[k] + (s.top[k + 1] - s.top[k]) * g + 0.15;         // on the tendon's top face
        const across = Math.sin(Math.PI * binU(j));                             // and closes at both sides
        bot.push(floor); top.push(floor + Math.max(0.05, thick * Math.sqrt(across * end)));
      }
      out.push({ c: s.c, U: s.U, W: s.W, lo, hi, top, bot });
    }
    return out;
  }
  const bursaFor = new Map();
  function bursa(thick) {
    const key = thick.toFixed(2);
    if (!bursaFor.has(key)) {
      const sl = bursaSlices(thick), S = supra.S, i0 = Math.floor(BURSA.from * (S - 1)), b = makeBuilt({ id: 'bursa', name: 'Subacromial bursa', from: 'scapula' }, sl);
      // it moves as the tendon under it does: its t runs over the same part of the tendon
      b.t = b.t.map((t) => (i0 + t * (S - 1 - i0)) / (S - 1)); b.tOf = (i) => (i0 + i) / (S - 1);
      bursaFor.set(key, b);
    }
    return bursaFor.get(key);
  }

  // how much of the arm bone's turn a slice at t (0 origin, 1 insertion) takes: a cuff muscle crosses the joint
  // near its end, the deltoid just below where it starts (the acromion and collarbone sit right over the joint)
  const FOLLOW = { cuff: [0.55, 0.97], deltoid: [0.04, 0.6] };
  // A built mesh at a pose. opts.shape(t, s, top) may return { thick, lift }: the outline's half thickness is
  // multiplied by thick, and lift (a share of the full thickness) raises the bottom face (a tear from below).
  function muscle(b, T, opts = {}) {
    const O = T[b.from], H = T.humerus, ball = apply(H, HC), into = Object.keys(SOL).map((k) => [k, SOL[k], T[k], invT(T[k])]);
    const tOf = b.tOf || ((i) => i / (b.S - 1)), [f0, f1] = b.cuff === false ? FOLLOW.deltoid : FOLLOW.cuff, follow = (t) => sstep(f0, f1, t);
    // The arm bone's turn as seen from the muscle's origin bone. Each slice of the muscle keeps its own shape and
    // takes the share follow(t) of that turn, about the ball's middle, keeping its own shape (so that a muscle twists
    // along its length rather than being crushed, and passes over the ball rather than through it).
    // The turn is split into a swing of the arm bone's long axis and a twist about it, each shared out by w.
    const rel = compose(invT(O), H), Rr = rel.R, a0 = DOWN, a1 = mv(Rr, a0);
    const sw = Math.acos(clamp(V.dot(a0, a1), -1, 1)), sax = V.len(V.cross(a0, a1)) > 1e-9 ? V.norm(V.cross(a0, a1)) : [1, 0, 0];
    const Tw = mm(tr(axisR(sax, sw)), Rr), tw = Math.atan2(V.dot(a0, [Tw[2][1] - Tw[1][2], Tw[0][2] - Tw[2][0], Tw[1][0] - Tw[0][1]]), Tw[0][0] + Tw[1][1] + Tw[2][2] - 1);
    const turnAt = (w) => mm(axisR(sax, sw * w), axisR(a0, tw * w));
    const slideRel = V.sub(apply(rel, HC), HC);
    const frames = b.sl.map((s, i) => {
      const w = follow(tOf(i));
      if (w <= 0) return { c: apply(O, s.c), R: O.R };
      if (w >= 1) return { c: apply(H, s.c), R: H.R };
      const Rw = turnAt(w);                                    // turned about the ball's middle: it keeps its distance
      return { c: apply(O, V.add(V.add(HC, mv(Rw, V.sub(s.c, HC))), V.mul(slideRel, w))), R: mm(O.R, Rw) };
    });
    // a muscle keeps its volume: its cross-section grows as it shortens
    const L = arc(frames.map((f) => f.c)), k = Math.sqrt(b.L0 / L);
    const out = new Float32Array(b.rest.length * 3), pressed = new Float32Array(b.rest.length);
    b.rest.forEach((p0, i) => {
      const c = b.at[i], t = b.t[i];
      let p = p0;
      if (c.cap === undefined) {
        const s = b.sl[c.i], sh = opts.shape ? opts.shape(t, c.s, c.top) : null;
        let v = c.mid + (c.top ? c.h : -c.h) * (sh?.thick ?? 1);
        if (sh?.lift && !c.top) v = Math.min(c.mid + c.h - 0.3, v + sh.lift * 2 * c.h);
        p = V.add(s.c, V.add(V.mul(s.U, c.u), V.mul(s.W, v)));
      }
      const si = c.cap !== undefined ? c.cap : c.i, s = b.sl[si], f = frames[si];
      let q = V.add(f.c, mv(f.R, V.mul(V.sub(p, s.c), k)));
      // wrapped over the ball: never closer to its middle than at rest
      const d = V.sub(q, ball), l = V.len(d); if (l < b.wrap) q = V.add(ball, V.mul(d, b.wrap / l));
      for (let pass = 0; pass < 2; pass++) for (const [kk, f, Tk, Ik] of into) {     // twice: one push can lead into another bone
        if (b.restIn[kk][i]) continue;
        const loc = apply(Ik, q), dp = f.depth(loc); if (dp <= 0) continue;
        const o = f.out(loc); if (o) q = apply(Tk, V.add(loc, V.mul(o, dp + 0.4)));
        if (kk === 'scapula' && loc[1] > HC[1] + 0.8 * headR) pressed[i] = Math.max(pressed[i], dp);   // how far the acromion had to push this corner
      }
      out[3 * i] = q[0]; out[3 * i + 1] = q[1]; out[3 * i + 2] = q[2];
    });
    return { pos: out, length: L, rest: b.L0, pressed };
  }

  return { marks: mk, headR, NS, DOWN, pose, bodyOf, gap, stored, glideAt, makeTable, PLANES, built, muscle, bursa, bones, SOL, invT, ribPen };
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
