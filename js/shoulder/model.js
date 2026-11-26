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
import { V, K, bandMesh, binU } from './geom.js?v=c69aaabe';
import { solid } from './solid.js?v=c69aaabe';

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
export const BURSA = { from: 0.7, wide: 1.15 };
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
    // (with a large tear the ball rides up where there is room, but never nearer the acromion than CLEAR, which
    // leaves room for the tendon and bursa drawn between them)
    const keep = CLEAR;
    if (P.auto !== false && !P.quick) for (let k = 0; k < 3; k++) { const g = gap({ scapula: scap, humerus: moved(glide) }).mm; if (g >= keep - 0.01) break; glide += keep - g + 0.03; }
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
  function storedIn(elev, plane) {
    const R = rows(plane), e = clamp(elev, 0, 150) / STEP, i = Math.min(R.length - 2, Math.floor(e)), f = e - i, a = R[i], b = R[i + 1];
    return { back: a.back + (b.back - a.back) * f, ir: a.ir + (b.ir - a.ir) * f, glide: a.glide.map((g, k) => g + (b.glide[k] - g) * f) };
  }
  // between the planes worked out, the two either side are blended (beyond the last, the last is used; pose() still
  // slides the ball down further if the blend leaves less than CLEAR under the acromion)
  function stored(elev, plane) {
    if (PLANES.includes(plane)) return storedIn(elev, plane);
    const j = PLANES.findIndex((q) => q > plane);
    if (j < 0) return storedIn(elev, PLANES.at(-1));
    if (j === 0) return storedIn(elev, PLANES[0]);
    const p0 = PLANES[j - 1], p1 = PLANES[j], f = (plane - p0) / (p1 - p0), a = storedIn(elev, p0), b = storedIn(elev, p1);
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
      b.t = b.t.map((t) => (i0 + t * (S - 1 - i0)) / (S - 1));
      bursaFor.set(key, b);
    }
    return bursaFor.get(key);
  }

  // The bursa at a pose, laid on the supraspinatus as it is drawn (tPos: the posed tendon, from muscle()), so that it
  // lies on the tendon's top face whatever the pose or condition: a worn tendon's thickened face, the dip of a hole.
  // Each corner of the sac sits over the point of the tendon's top face at the same place across it (the sac is a
  // little wider than the tendon: past the tendon's edges it carries on in the same direction), lifted along the
  // tendon's thickness there by 0.15 mm, and its top face by the sac's thickness.
  function bursaOn(bu, tPos) {
    const S = supra.S, M = 2 * K, i0 = Math.floor(BURSA.from * (S - 1)), P = (i, j) => [tPos[3 * (i * M + j)], tPos[3 * (i * M + j) + 1], tPos[3 * (i * M + j) + 2]];
    const out = new Float32Array(bu.rest.length * 3), ends = [[], []], caps = [];
    bu.at.forEach((c, n) => {
      if (c.cap !== undefined) { caps.push(n); return; }
      const i = i0 + c.i, s = supra.sl[i], bs = bu.sl[c.i];
      const x = ((c.u - s.lo) / (s.hi - s.lo) - 0.01) / 0.98 * (K - 1), k = Math.min(K - 2, Math.max(0, Math.floor(x)));
      const top = V.add(P(i, k), V.mul(V.sub(P(i, k + 1), P(i, k)), x - k));            // on the top face, or past its edge
      const kk = clamp(Math.round(x), 0, K - 1), nrm = V.norm(V.sub(P(i, kk), P(i, M - 1 - kk)));   // through the tendon there
      const jj = clamp(Math.round((c.s - 0.01) / 0.98 * (K - 1)), 0, K - 1), h = c.top ? bs.top[jj] - bs.bot[jj] : 0;
      const q = V.add(top, V.mul(nrm, 0.15 + h));
      out.set(q, 3 * n);
      if (c.i === 0) ends[0].push(q); else if (c.i === bu.S - 1) ends[1].push(q);
    });
    caps.forEach((n, e) => out.set(V.mean(ends[e]), 3 * n));                            // the ends close at their middle
    return { pos: out };
  }

  // ---- how a muscle bends: its middle line is pulled taut over the ball ----
  // A muscle's middle line runs on its own bone as far as the place it leaves that bone, and on the arm bone from the
  // place it joins it. Between the two it is the shortest line that stays outside a ball about the joint's middle:
  // straight where it can be, and round the ball where the ball is in the way (the method of Garner and Pandy 2000).
  // The muscle's length is the length of that line, and its leverage is how fast that length changes as the arm turns,
  // which is how leverage is measured on a shoulder (An 1984). The slices of the mesh are carried by the line.
  //
  // LINE, for each muscle: a and b, where the line leaves its bone and joins the arm bone, as shares of the muscle's
  // length; r, the ball's radius in mm (never more than the scan leaves room for). They were chosen so that the leverage
  // for lifting, swinging and turning the arm comes closest to Axford's measurements on eight shoulders (2024, tables
  // G-1 to G-3: 10 to 60° of lift at the joint, across planes and turns), then checked against Ackland 2008 up to
  // 120° of lift. README, Shoulder, says how close that is.
  //   cap: a tendon that the arm's turn winds round the ball is wound on like a rope past this angle (see lineAt).
  //   peel, pw: the supraspinatus tendon peels off the ball near the socket (see lineAt).
  //   on, hand: the front deltoid starts on the collarbone, but its line starts on the front of the shoulder, which
  //   goes with the shoulder blade. Its first slices are handed from the one bone to the other over the shares `hand`.
  // The deltoid leaves its bone well along its length: the front, side and back of the shoulder hold it, and with an
  // earlier place its three parts lose their leverage at the side and gain too much with the arm lifted.
  // The subscapularis leaves late, at the neck of the socket: it lies on the front of the shoulder blade until there,
  // and a line from further back runs through the socket.
  const LINE = {
    supra: { a: 0.43, b: 0.84, r: 23, peel: 0.91, pw: [20, 70] }, infra: { a: 0.5, b: 0.93, r: 23, cap: 140 }, tminor: { a: 0.55, b: 0.92, r: 23, cap: 130 }, subscap: { a: 0.8, b: 0.96, r: 23, cap: 120 },
    deltA: { a: 0.286, b: 1, r: 26, on: 'scapula', hand: [0.1, 0.24] }, deltM: { a: 0.163, b: 1, r: 26 }, deltP: { a: 0.238, b: 1, r: 26 },
  };
  // the shortest way from A to B that stays outside the ball (middle C, radius rho): straight, or straight to the
  // ball, round it, and straight on. Returns its length and at(u): the point a share u of the way along, with the
  // direction of travel there and the direction away from the ball's middle (square to it). u1 is where it meets the ball.
  function wrapPath(A, B, C, rho, hint) {
    let a = V.sub(A, C), b = V.sub(B, C), la = V.len(a), lb = V.len(b);
    if (la < rho * 1.0005) { a = V.mul(a, rho * 1.0005 / la); la = rho * 1.0005; }
    if (lb < rho * 1.0005) { b = V.mul(b, rho * 1.0005 / lb); lb = rho * 1.0005; }
    const e1 = V.mul(a, 1 / la); let p = V.sub(b, V.mul(e1, V.dot(b, e1)));
    if (V.len(p) < 1e-4 * lb) p = V.sub(hint, V.mul(e1, V.dot(hint, e1)));          // the ends in line with the ball's middle: go round by the side the muscle is on
    const e2 = V.norm(p), th = Math.atan2(V.dot(b, e2), V.dot(b, e1));
    const al = Math.acos(rho / la), be = Math.acos(rho / lb), phi = th - al - be;
    const frame = (q, t) => { const n = V.sub(q, V.mul(t, V.dot(q, t))); return { p: V.add(C, q), t, n: V.norm(n) }; };
    if (phi <= 1e-6) {
      const d = V.sub(b, a), L = V.len(d), t = V.mul(d, 1 / L);
      return { len: L, u1: 0.7, at: (u) => frame(V.add(a, V.mul(d, u)), t) };
    }
    const dir = (x) => V.add(V.mul(e1, Math.cos(x)), V.mul(e2, Math.sin(x))), tan = (x) => V.add(V.mul(e1, -Math.sin(x)), V.mul(e2, Math.cos(x)));
    const T1 = V.mul(dir(al), rho), T2 = V.mul(dir(th - be), rho), l1 = Math.sqrt(la * la - rho * rho), l2 = rho * phi, l3 = Math.sqrt(lb * lb - rho * rho), L = l1 + l2 + l3;
    return { len: L, u1: Math.min(0.7, l1 / L), at(u) {
      const x = u * L;
      if (x <= l1) return frame(V.add(a, V.mul(V.sub(T1, a), l1 > 1e-9 ? x / l1 : 0)), tan(al));
      if (x <= l1 + l2) { const g = al + (x - l1) / rho; return { p: V.add(C, V.mul(dir(g), rho)), t: tan(g), n: dir(g) }; }
      return frame(V.add(T2, V.mul(V.sub(b, T2), l3 > 1e-9 ? (x - l1 - l2) / l3 : 1)), tan(th - be));
    } };
  }
  const colsOf = (f) => tr([f.t, f.n, V.cross(f.t, f.n)]);            // a frame as a rotation: its columns are t, n, t × n
  // part way from one rotation to another
  function rotMix(R0, R1, w) {
    if (w <= 0) return R0; if (w >= 1) return R1;
    const D = mm(tr(R0), R1), c = clamp((D[0][0] + D[1][1] + D[2][2] - 1) / 2, -1, 1), a = Math.acos(c);
    if (a < 1e-7) return R0;
    const k = [D[2][1] - D[1][2], D[0][2] - D[2][0], D[1][0] - D[0][1]], l = V.len(k);
    if (l < 1e-9) return w < 0.5 ? R0 : R1;
    return mm(R0, axisR(V.mul(k, 1 / l), a * w));
  }
  const I3R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // how far round the axis k the point b is from the point a
  const azim = (k, a, b) => { const ap = V.sub(a, V.mul(k, V.dot(a, k))), bp = V.sub(b, V.mul(k, V.dot(b, k))); return Math.atan2(V.dot(k, V.cross(ap, bp)), V.dot(ap, bp)); };
  // the way from the ball's middle to the middle of the socket: toward the part of the shoulder blade nearest the ball
  const SOCKET = (() => { const p = bones.scapula.pos, near = []; for (let i = 0; i < p.length; i += 3) { const q = [p[i], p[i + 1], p[i + 2]]; if (V.len(V.sub(q, HC)) < headR + 5) near.push(q); } return V.norm(V.sub(V.mean(near), HC)); })();
  // What a muscle's line needs that does not change with the pose: the slices' middles (cs) and the length along them
  // (s), the slices where the line leaves its bone (ia) and joins the arm bone (ib), the taut line at rest (W0), and
  // for each slice between them its share of the way along (u), the line's frame there (F0) and how far the slice's
  // middle is from the line (D). At rest the slices are where the scan has them.
  function pathOf(b) {
    const S = b.S, cs = b.sl.map((q) => q.c), s = [0]; for (let i = 1; i < S; i++) s.push(s[i - 1] + V.len(V.sub(cs[i], cs[i - 1])));
    const ln = LINE[b.id], ia = Math.round(ln.a * (S - 1)), ib = Math.round(ln.b * (S - 1));
    // the ball the line is drawn over: no bigger than the scan leaves room for
    let hint = [0, 0, 0], rho = ln.r; for (let i = ia; i <= ib; i++) { hint = V.add(hint, V.sub(cs[i], HC)); rho = Math.min(rho, V.len(V.sub(cs[i], HC)) - 0.05); }
    const W0 = wrapPath(cs[ia], cs[ib], HC, rho, hint), u = cs.map((_, i) => clamp((s[i] - s[ia]) / (s[ib] - s[ia])));
    const F0 = [], D = []; for (let i = ia + 1; i < ib; i++) { const f = W0.at(u[i]); F0[i] = [f.t, f.n, V.cross(f.t, f.n)]; D[i] = V.sub(cs[i], f.p); }
    const E = b.sl.map((q) => { const U = V.norm(q.U), W = V.norm(V.sub(q.W, V.mul(U, V.dot(q.W, U)))); return tr([U, W, V.cross(U, W)]); });   // each slice's own turn
    // how the change of length is shared out along the muscle: a cuff muscle's belly takes it, its tendon keeps its
    // length; the deltoid shares it evenly between its ends
    const wOf = (t) => (b.cuff === false ? 0.05 + 0.95 * sstep(0.02, 0.1, t) * (1 - sstep(0.85, 0.95, t)) : 0.03 + 0.97 * sstep(0.02, 0.12, t) * (1 - sstep(0.7, 0.86, t)));
    const om = []; for (let i = 0; i + 1 < S; i++) om.push(wOf((i + 0.5) / (S - 1)));
    // how far round the arm bone's long axis the line's end is from its start, at rest, and which way round
    const phi0 = azim(DOWN, V.sub(cs[ia], HC), V.sub(cs[ib], HC)), cap = ln.cap ? rad(ln.cap) : 0;
    return { S, cs, s, ia, ib, rho, hint, u, F0, D, E, om, W0, fixed: s[ia] + s[S - 1] - s[ib], on: ln.on || b.from, hand: ln.hand,
      cap, sense: Math.sign(phi0), gate: cap - Math.abs(phi0), ie: ln.peel ? Math.round(ln.peel * (S - 1)) : ib, pw: ln.pw };
  }
  // The taut line at a pose, in the terms of the bone its first end rides on (O). Two things are added to the plain
  // taut line, each for a place where a line over a ball goes wrong and a tendon does not.
  function lineAt(b, T) {
    const P = (b.path ||= pathOf(b)), O = T[P.on], rel = compose(invT(O), T.humerus), C = apply(rel, HC);
    const hint = V.add(P.hint, mv(rel.R, P.hint)), A = P.cs[P.ia];
    // Peeling (supraspinatus). Its tendon lies on top of the ball before it reaches its footprint, and the line joins
    // the arm bone there. With the arm lifted high that place comes round to the socket, where a tendon cannot follow.
    // As it nears the socket (from pw[1] to pw[0] degrees from the socket's middle, seen from the ball's middle) the
    // tendon peels off the ball, and the line joins the arm bone further along, up to the footprint itself (slice ie).
    let sq = P.s[P.ib], Bl = P.cs[P.ib];
    if (P.ie > P.ib) {
      const gam = Math.acos(clamp(V.dot(V.norm(mv(rel.R, V.sub(Bl, HC))), SOCKET), -1, 1)), peel = 1 - sstep(rad(P.pw[0]), rad(P.pw[1]), gam);
      if (peel > 0) { sq += peel * (P.s[P.ie] - sq); let j = P.ib; while (j < P.ie - 1 && P.s[j + 1] < sq) j++; Bl = V.add(P.cs[j], V.mul(V.sub(P.cs[j + 1], P.cs[j]), (sq - P.s[j]) / (P.s[j + 1] - P.s[j]))); }
    }
    const B = apply(rel, Bl), base = { P, O, rel, relc: rel, C, sq, fixed: P.s[P.ia] + P.s[P.S - 1] - sq, turn: 0, extra: 0 };
    if (!P.cap) return { ...base, W: wrapPath(A, B, C, P.rho, hint) };
    // Winding (infraspinatus, teres minor, subscapularis). A line drawn taut over a ball slides sideways off it once it
    // is wound far round: the shortest way then goes over the top of the ball or under it, the line loses its leverage
    // for turning the arm, and at half way round it jumps to the other side. A tendon cannot slide like that: it is
    // broad, and it is joined to the capsule under it. So the line is drawn taut only up to a turn of the arm bone about
    // its own length, P.gate (the turn that brings the hanging arm's tendon P.cap round the bone's long axis from where
    // the line starts). The rest of the turn, `over`, winds the tendon on as a rope is wound on a drum: the ball carries
    // the tendon's end round, and the length taken up is the angle times the end's distance from the long axis.
    // The arm bone's turn, as seen from the muscle's bone, is a swing of its long axis and then a turn about that axis;
    // `turned` is the second, counted the way that winds this tendon. The winding comes on over up to 30°, so that the
    // leverage has no step, and never with the arm at rest.
    const k = mv(rel.R, DOWN), bb = V.sub(B, C);
    const sax = V.len(V.cross(DOWN, k)) > 1e-9 ? V.norm(V.cross(DOWN, k)) : [1, 0, 0], Tw = mm(tr(axisR(sax, Math.acos(clamp(V.dot(DOWN, k), -1, 1)))), rel.R);
    const turned = P.sense * Math.atan2(V.dot(DOWN, [Tw[2][1] - Tw[1][2], Tw[0][2] - Tw[2][0], Tw[1][0] - Tw[0][1]]), Tw[0][0] + Tw[1][1] + Tw[2][2] - 1);
    const D = Math.min(rad(15), P.gate), x = turned - P.gate, over = x <= -D ? 0 : x >= D ? x : (x + D) * (x + D) / (4 * D);
    if (over <= 0) return { ...base, W: wrapPath(A, B, C, P.rho, hint) };
    // taut as far as the place the tendon's end would be without `over`, then round the ball with the end
    const Rc = mm(axisR(k, -P.sense * over), rel.R), relc = { R: Rc, t: V.sub(C, mv(Rc, HC)) };
    return { ...base, relc, k, turn: P.sense * over, extra: V.len(V.cross(k, bb)) * over, W: wrapPath(A, V.add(C, mv(axisR(k, -P.sense * over), bb)), C, P.rho, hint) };
  }
  // where the tendon is wound on, a point a share u of the way along the line is carried round with the ball: not at all
  // where the line meets the ball, and all the way at the tendon's end
  const spinAt = (ln, u) => (ln.turn ? axisR(ln.k, ln.turn * sstep(ln.W.u1, 1, u)) : null);
  // the line between the two bones as points in the world (for checks)
  function lineOf(b, T, n = 40) { const ln = lineAt(b, T), out = []; for (let i = 0; i <= n; i++) { const u = i / n, S = spinAt(ln, u); let p = ln.W.at(u).p; if (S) p = V.add(ln.C, mv(S, V.sub(p, ln.C))); out.push(apply(ln.O, p)); } return out; }
  // where each slice's middle and frame go at a pose (muscle() places the outline round them), and how much its
  // outline grows or shrinks (k)
  function frames(b, T) {
    if (b.id === 'bursa') {                                              // the bursa goes with the supraspinatus under it
      const S = supra.S, i0 = Math.floor(BURSA.from * (S - 1)), fs = frames(supra, T);
      return b.sl.map((q, i) => { const f = fs[i0 + i]; return { c: V.add(f.c, mv(f.R, V.sub(q.c, supra.sl[i0 + i].c))), R: f.R, k: f.k }; });
    }
    const ln = lineAt(b, T), { P, O, rel, relc, W: Wp } = ln, S = b.S, { cs, s, ia, ib } = P, Z = 0.3;
    // Each slice before it slides, in the terms of the bone the line's first end rides on: on that bone, on the taut
    // line, or on the arm bone. A slice on the line keeps how far it was from the line at rest (D), turned as the line
    // has turned there, and near the line's ends as the bone at that end has turned.
    const g = [], Rg = [], uB = 1 - (ln.sq - s[ib]) / Wp.len;       // where slice ib is on the line (short of its end if the tendon has peeled)
    for (let i = 0; i < S; i++) {
      if (i <= ia) { g.push(cs[i]); Rg.push(I3R); continue; }
      if (i >= ib) { g.push(s[i] < ln.sq ? Wp.at(1 - (ln.sq - s[i]) / Wp.len).p : apply(rel, cs[i])); Rg.push(rel.R); continue; }   // peeled off, or on the arm bone
      const u = P.u[i] * uB, f = Wp.at(u), Q = mm(colsOf(f), P.F0[i]);
      const Qe = rotMix(rotMix(I3R, Q, sstep(0, Z, P.u[i])), relc.R, sstep(1 - Z, 1, P.u[i])), Sp = spinAt(ln, u);
      const p = V.add(f.p, mv(Qe, P.D[i]));
      if (Sp) { g.push(V.add(ln.C, mv(Sp, V.sub(p, ln.C)))); Rg.push(mm(Sp, Qe)); } else { g.push(p); Rg.push(Qe); }
    }
    // Where the taut line meets a part that is fixed to a bone it can turn sharply (the footprint of a tendon, with the
    // arm lifted and turned out as far as it goes, points back along the tendon). A tendon has thickness and cannot
    // turn on a point: a turn sharper than about 70° is rounded off over the slices to each side of it.
    let jq = ib; while (jq < S - 1 && s[jq + 1] <= ln.sq) jq++;       // the slice where the line joins the arm bone (further along if the tendon has peeled)
    for (const j of [ia, jq]) {
      if (j < 1 || j > S - 2) continue;
      const turn = V.dot(V.norm(V.sub(g[j], g[j - 1])), V.norm(V.sub(g[j + 1], g[j])));
      // (the sharper the turn, the more slices share it: two to each side, and four where it turns right back)
      for (const [span, w] of [[2, 1 - sstep(-0.1, 0.35, turn)], [4, 1 - sstep(-0.7, -0.2, turn)]]) {
        for (let pass = 0; w > 0 && pass < span + 1; pass++) { const h = g.slice(); for (let i = Math.max(1, j - span); i <= Math.min(S - 2, j + span); i++) g[i] = V.add(h[i], V.mul(V.sub(V.mul(V.add(h[i - 1], h[i + 1]), 0.5), h[i]), 0.5 * w)); }
      }
    }
    // then the slices slide along that line, so that the change of length is shared out (om)
    const sg = [0]; for (let i = 1; i < S; i++) sg.push(sg[i - 1] + V.len(V.sub(g[i], g[i - 1])));
    const L0 = s[S - 1], L1 = sg[S - 1]; let sum = 0; for (let i = 0; i + 1 < S; i++) sum += (s[i + 1] - s[i]) * P.om[i];
    const eps = (L1 - L0) / sum, fac = P.om.map((w) => Math.max(0.3, 1 + eps * w)); let tot = 0; for (let i = 0; i + 1 < S; i++) tot += (s[i + 1] - s[i]) * fac[i];
    const rel0 = P.hand ? compose(invT(O), T[b.from]) : null;       // the front deltoid's own bone, seen from the bone its line rides on
    const out = []; let st = 0, j = 0;
    for (let i = 0; i < S; i++) {
      if (i > 0) st += (s[i] - s[i - 1]) * fac[i - 1] * L1 / tot;
      while (j < S - 2 && sg[j + 1] < st) j++;
      const f = clamp(sg[j + 1] > sg[j] ? (st - sg[j]) / (sg[j + 1] - sg[j]) : 0);
      let c = V.add(g[j], V.mul(V.sub(g[j + 1], g[j]), f));
      let R = mm(mm(rotMix(Rg[j], Rg[j + 1], f), rotMix(P.E[j], P.E[j + 1], f)), tr(P.E[i]));
      if (rel0) { const w = 1 - sstep(...P.hand, i / (S - 1)); if (w > 0) { c = V.add(c, V.mul(V.sub(apply(rel0, c), c), w)); R = mm(rotMix(I3R, rel0.R, w), R); } }
      // a muscle keeps its volume: where it shortens, its cross-section grows
      const stretch = ((fac[Math.max(0, i - 1)] + fac[Math.min(S - 2, i)]) / 2) * L1 / tot;
      out.push({ c: apply(O, c), R: mm(O.R, R), k: 1 / Math.sqrt(stretch) });
    }
    return out;
  }
  // A muscle's length at a pose, as a share of its length at rest: the parts of its line that lie on a bone, the taut
  // line between them, and what is wound on. (The mesh's own middle line is a little longer: it keeps the scan's bends.)
  const length = (b, T) => { const { P, W, extra, fixed } = lineAt(b, T); return (fixed + W.len + extra) / (P.fixed + P.W0.len); };
  // the same in mm of the line (for checking leverage against measurements)
  const lineMm = (b, T) => { const { W, extra, fixed } = lineAt(b, T); return fixed + W.len + extra; };
  // A built mesh at a pose. opts.shape(t, s, top) may return { thick, lift }: the outline's half thickness is
  // multiplied by thick, and lift (a share of the full thickness) raises the bottom face (a tear from below).
  function muscle(b, T, opts = {}) {
    const H = T.humerus, ball = apply(H, HC), into = Object.keys(SOL).map((k) => [k, SOL[k], T[k], invT(T[k])]);
    const fr = frames(b, T);
    const L = (b.id === 'bursa' ? 1 : length(b, T)) * b.L0;
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
      const si = c.cap !== undefined ? c.cap : c.i, s = b.sl[si], f = fr[si];
      let q = V.add(f.c, mv(f.R, V.mul(V.sub(p, s.c), f.k)));
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

  // ---- one muscle pulling alone ----
  // The arm bone's turn at a pose, and back: a pose is a swing of the arm bone's length from hanging (elev, toward
  // plane) after a turn about its length (rot), as in pose().
  const orient = (P) => { const pl = rad(P.plane ?? 30), H = V.norm([-Math.cos(pl), 0, Math.sin(pl)]); return mm(axisR(V.norm(V.cross(DOWN, H)), rad(P.elev ?? 0)), axisR(DOWN, rad(P.rot ?? 0))); };
  function poseOf(R, prev) {
    const a1 = mv(R, DOWN), c = clamp(V.dot(a1, DOWN), -1, 1), elev = Math.acos(c) / rad(1);
    let plane = prev.plane ?? 30;
    // hanging straight down there is no direction of lift, and the last one is kept. (Only straight down: this once
    // began at half a degree, which is the size of the turns contract() tries, so that from the arm hanging a pull
    // could not tell lifting forward from lifting back, and every muscle began by only turning the arm.)
    if (elev > 1e-4) {
      const ap = V.norm(V.sub(a1, V.mul(DOWN, c))); plane = Math.atan2(ap[2], -ap[0]) / rad(1);
      for (let n = 0; n < 4; n++) { const pl = rad(plane), H = [-Math.cos(pl), 0, Math.sin(pl)], hp = V.norm(V.sub(H, V.mul(DOWN, V.dot(H, DOWN)))); plane -= Math.atan2(V.dot(DOWN, V.cross(hp, ap)), V.dot(hp, ap)) / rad(1); }
      while (plane - (prev.plane ?? 30) > 180) plane -= 360; while (plane - (prev.plane ?? 30) < -180) plane += 360;
    }
    const pl = rad(plane), H = V.norm([-Math.cos(pl), 0, Math.sin(pl)]), Tw = mm(tr(axisR(V.norm(V.cross(DOWN, H)), rad(elev))), R);
    const rot = Math.atan2(V.dot(DOWN, [Tw[2][1] - Tw[1][2], Tw[0][2] - Tw[2][0], Tw[1][0] - Tw[0][1]]), Tw[0][0] + Tw[1][1] + Tw[2][2] - 1) / rad(1);
    return { ...prev, elev, plane, rot };
  }
  // Where the elbow may not go: into the side of the body. Below the shoulder, and between the back of the shoulder
  // blade and the front of the breastbone, the elbow comes no nearer the body's middle than it is with the arm hanging
  // (it hangs against the side).
  const zMax = (m) => { let z = -1e9; for (let i = 2; i < m.pos.length; i += 3) z = Math.max(z, m.pos[i]); return z; };
  const zMin = (m) => { let z = 1e9; for (let i = 2; i < m.pos.length; i += 3) z = Math.min(z, m.pos[i]); return z; };
  const SIDE = { x: apply(pose({ elev: 0, plane: 30, rot: 0, quick: true }).humerus, EL)[0], back: zMin(bones.scapula), front: zMax(bones.sternum), top: HC[1] - 30 };
  const besideBody = (e) => e[1] < SIDE.top && e[2] > SIDE.back && e[2] < SIDE.front;
  // The limits of a pull: lifted up to 150°, turned up to 60° in and 90° out (the reach of the page's sliders and
  // exercises), or further only where the pull starts.
  const LIMIT = { elev: 150, rotIn: -60, rotOut: 90 };
  // How the arm moves when one muscle pulls alone, from the pose P0: a degree at a time, the arm bone turns about
  // its ball the way that shortens the muscle fastest (the way the muscle's pull turns it), until it has turned deg
  // degrees, or the muscle can shorten no further (or barely). At a limit of the joint it goes on along the limit. The arm's
  // weight and the other muscles that steady it are left out. Returns the poses a degree apart, each with the muscle's length (share of rest).
  function contract(b, P0, deg = 40) {
    const quick = (P) => pose({ ...P, quick: true }), lenAt = (P) => length(b, quick(P)), d = rad(0.5), AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const lim = { elev: Math.max(LIMIT.elev, P0.elev ?? 0), lo: Math.min(LIMIT.rotIn, P0.rot ?? 0), hi: Math.max(LIMIT.rotOut, P0.rot ?? 0) };
    const elbowOf = (P) => apply(quick(P).humerus, EL), e0 = elbowOf(P0), xMax = Math.max(SIDE.x, besideBody(e0) ? e0[0] : -1e9);
    const intoBody = (e) => besideBody(e) && e[0] > xMax + 1e-6;
    let P = { ...P0, elev: P0.elev ?? 0, plane: P0.plane ?? 30, rot: P0.rot ?? 0 };
    const out = [{ ...P, len: lenAt(P) }];
    for (let k = 0; k < deg; k++) {
      const R = orient(P), g = AX.map((a) => (lenAt(poseOf(mm(axisR(a, d), R), P)) - lenAt(poseOf(mm(axisR(a, -d), R), P))) / (2 * d)), n = V.len(g);
      if (n < 1e-3) break;
      let w = V.mul(g, -1 / n), Q = poseOf(mm(axisR(w, rad(1)), R), P);
      const e = elbowOf(Q);
      if (intoBody(e)) {
        // slide along the side of the body: turn the arm out from the side by as much as the step would take the elbow
        // in (and 0.1 mm more). The elbow's way is found by trying the step, because the shoulder blade and collarbone
        // carry the whole arm with them as it lifts.
        const r = V.sub(elbowOf(P), apply(quick(P).humerus, HC)), nc = V.cross(r, [1, 0, 0]);
        let ok = false, wl = 1;
        for (let it = 0; it < 4 && !ok; it++) {
          w = V.sub(w, V.mul(nc, (elbowOf(Q)[0] - xMax + 0.1) / rad(1) / V.dot(nc, nc)));
          wl = V.len(w); if (wl < 1e-6) break;
          w = V.mul(w, 1 / wl); Q = poseOf(mm(axisR(w, rad(1)), R), P); ok = !intoBody(elbowOf(Q));
        }
        if (!ok || -V.dot(w, g) / n < 0.2) break;                 // no way along the side, or it barely shortens that way: it stops
      }
      let slow = 0;
      if (Q.elev > lim.elev || Q.rot < lim.lo || Q.rot > lim.hi) {
        // at a limit of the joint the arm goes on the way that is left to it, along the limit (the front of the
        // deltoid still lifts an arm that is turned in as far as it goes), unless that barely shortens the muscle
        Q = { ...Q, elev: Math.min(Q.elev, lim.elev), rot: clamp(Q.rot, lim.lo, lim.hi) };
        if (intoBody(elbowOf(Q))) break;
        slow = 0.2 * n * rad(1);
      }
      // it can shorten no further, or so little for the turn (under 3 mm of leverage) that it would not move the arm
      const len = lenAt(Q); if (len >= out.at(-1).len - Math.max(slow, 3 * rad(1) / b.L0)) break;
      P = Q; out.push({ ...P, len });
    }
    return out;
  }

  return { marks: mk, headR, NS, DOWN, pose, length, contract, orient, poseOf, LIMIT, bodyOf, gap, bodyOf, gap, stored, glideAt, makeTable, PLANES, built, muscle, bursa, bursaOn, bones, SOL, invT, ribPen, lineOf, lineMm };
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
