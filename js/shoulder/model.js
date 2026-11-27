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
import { V, K, bandMesh, binU } from './geom.js?v=b2a1f60e';
import { solid } from './solid.js?v=b2a1f60e';

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
// With the arm above shoulder height the deltoid's three lines run nearly side by side to the arm bone, and moving a
// part aside or squeezing it there draws it as a tube with a lobe beside it, which no deltoid looks like. So the ties
// act fully up to TIE_FADE[0] degrees of lift and not at all from TIE_FADE[1], where the parts overlap as the lines have them. Lifting
// the deltoid off the cuff (overCuff) fades with them: alone it would stand the back part off the middle one.
export const TIE_FADE = [90, 120];
// A part drawn narrower is drawn thicker by as much, but with what shortening adds (frames, k) never more than THICK
// times its thickness at rest: more than that stands up as a lobe. (Past that it is drawn with less than its volume.)
export const THICK = 1.3;
const BEND = 18 * Math.PI / 180;   // the sharpest bend of a muscle's middle line from one slice to the next (see frames)
export const CLEAR = 2;       // mm kept between the arm bone and the acromion as the arm lifts (see glide)
export const ROOM = 0.8;      // mm kept between the acromion and the top of the tendon's end with its healthy bursa on it (see room)
export const BURSA_MM = 0.8;  // the healthy bursa's thickness (main.js draws a swollen one thicker)
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
    // the stored glide is worked out on a grid of lifts and turns; between them, slide a little further if needed.
    // First with the ball where the cuff holds it (up 0): CLEAR between the bones, and ROOM over the tendon's end and
    // its bursa. Then with the ball ridden up (a large tear, a weak cuff, the deltoid pulling alone): it rides up where
    // there is room, into the tendon's room but never nearer the acromion than CLEAR.
    if (P.auto !== false && !P.quick) {
      const at = (g, u) => ({ scapula: scap, clavicle: clav, humerus: { R: hum.R, t: V.add(hum.t, V.mul(dir, u - g)) } });
      // (the least slide to within 0.05 mm: the last slide that was too little and the first that was enough are halved)
      const least = (need) => { let lo = null; for (let k = 0; k < 8; k++) { const n = need(glide); if (n <= 0.01) break; lo = glide; glide += n + 0.03; } if (lo !== null) for (let k = 0; k < 3 && glide - lo > 0.05; k++) { const m = (lo + glide) / 2; if (need(m) <= 0.01) glide = m; else lo = m; } };
      least((g) => { const T0 = at(g, Math.min(up, 0)); return Math.max(CLEAR - gap(T0).mm, ROOM - room(T0)); });
      if (up > 0) least((g) => CLEAR - gap(at(g, up)).mm);
    }
    if (glide || up) hum = moved(glide);
    const fore = compose(hum, about(EL, ELB, rad(P.elbow ?? 0)));
    return { scapula: scap, clavicle: clav, humerus: hum, forearm: fore, rest: I3(), fit, glide, elev: P.elev ?? 0 };
  }
  const bodyOf = (b) => BODY[b] || 'rest';

  // ---- the gap under the acromion: the narrowest distance from the top of the arm bone to the acromion ----
  // Worked out in the shoulder blade's own frame, where the acromion's triangles never move.
  const AT = []; {
    const p = bones.scapula.pos, P3 = (k) => [p[3 * k], p[3 * k + 1], p[3 * k + 2]];
    for (let i = 0; i < acro.length; i += 3) { const a = P3(acro[i]), b = P3(acro[i + 1]), c = P3(acro[i + 2]), m = V.mean([a, b, c]); AT.push({ a, b, c, m, n: V.norm(V.cross(V.sub(b, a), V.sub(c, a))), r: Math.max(...[a, b, c].map((q) => V.len(V.sub(q, m)))) }); }
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

  // The room over the tendon. The last part of the supraspinatus tendon is fixed to the top of the arm bone and goes
  // with it under the acromion in the middle of a lift. TOP is the top face of that part with the healthy bursa on it,
  // as points fixed to the arm bone. room() is how far the nearest of them is from the acromion's surface (less than
  // nothing when one is inside the bone: the side is told by the way the nearest triangle faces). A healthy shoulder
  // keeps ROOM there: the tendon passes at its full thickness.
  // The depth muscle() pushes a point out by (solid.js) is blended between cells, so it fades to nothing over a
  // cell's width outside the bone. That depth is taken off the distance, so that a point with ROOM is also a point
  // muscle() leaves alone. Both parts change smoothly as the ball slides, so the slide does too.
  let TOP = null;
  const ROOF = HC[1] + 0.8 * headR;           // the acromion is the part of the shoulder blade above this height (in the blade's own terms)
  function room(T) {
    if (!TOP) {
      const su = built[0], ib = (su.path ||= pathOf(su)).ib; TOP = [];
      for (let i = ib; i < su.S; i++) { const q = su.sl[i]; for (let j = 1; j < K - 1; j++) TOP.push(V.add(q.c, V.add(V.mul(q.U, q.lo + binU(j) * (q.hi - q.lo)), V.mul(q.W, q.top[j] + 0.15 + BURSA_MM)))); }
    }
    const inv = { R: tr(T.scapula.R) }; inv.t = V.mul(mv(inv.R, T.scapula.t), -1);
    const rel = compose(inv, T.humerus); let best = 1e9;
    for (const p of TOP) {
      const q = apply(rel, p), dp = q[1] > ROOF ? SOL.scapula.depth(q) : 0;
      // a point clear of the blended depth is outside, and only matters if it is nearer than the nearest so far
      let d = dp > 0 ? 1e9 : best, side = 1, lean = 0;
      for (const g of groups) { if (V.len(V.sub(q, g.c)) - g.r >= d) continue; for (const t of g.ts) { if (V.len(V.sub(q, t.m)) - t.r >= d + 1e-6) continue; const off = V.sub(q, closest(q, t.a, t.b, t.c)), dd = V.len(off), l = V.dot(off, t.n); if (dd < d - 1e-6 || (dd < d + 1e-6 && Math.abs(l) > Math.abs(lean))) { d = Math.min(d, dd); lean = l; side = l < 0 ? -1 : 1; } } }
      if (d < 1e9) best = Math.min(best, (dp > 0 ? side : 1) * d - dp);
    }
    return best;
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
        const ok = (d) => { const T = pose({ elev, plane, rot, auto: false, up: -d, fit: at }); return gap(T).mm >= CLEAR && room(T) >= ROOM; };
        if (ok(0)) return 0;
        let lo = 0, hi = 1; while (!ok(hi) && hi < 20) { lo = hi; hi += 1; } for (let n = 0; n < 6; n++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
        return +hi.toFixed(2);
      });
      out.push({ back: +back.toFixed(2), ir: +ir.toFixed(2), glide: slid, ribs: best.n });
    }
    // The ball does not lurch. The least slide that keeps the room can come on all at once: the top of the tendon
    // meets the edge of the acromion at one lift and clears it only some millimeters lower. More slide than the
    // least still keeps the room, so either side of such a step the slide is raised until it changes by no more
    // than EASE mm for a degree of lift and EASE_TURN mm for a degree of turn.
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < ROTS.length; k++) for (const dir of [1, -1]) for (let n = 1; n < out.length; n++) { const i = dir > 0 ? n : out.length - 1 - n; out[i].glide[k] = Math.max(out[i].glide[k], out[i - dir].glide[k] - EASE * STEP); }
      for (const row of out) for (const dir of [1, -1]) for (let n = 1; n < ROTS.length; n++) { const k = dir > 0 ? n : ROTS.length - 1 - n; row.glide[k] = Math.max(row.glide[k], row.glide[k - dir] - EASE_TURN * Math.abs(ROTS[k] - ROTS[k - dir])); }
    }
    for (const row of out) row.glide = row.glide.map((g) => +g.toFixed(2));
    return out;
  }
  // kept in shoulder/data/pose.json (tests/shoulder/build-pose.mjs), so that the page need not work it out
  const STEP = 5, PLANES = [0, 30, 90], memo = {}, EASE = 0.12, EASE_TURN = 0.1;
  const rows = (plane) => (table && table.clear === CLEAR && table.room === ROOM && table.ease === EASE && table.step === STEP && String(table.rots) === String(ROTS) && table.planes[plane]) || (memo[plane] ||= fitPlane(plane));
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
  const makeTable = () => ({ clear: CLEAR, room: ROOM, ease: EASE, step: STEP, rots: ROTS, planes: Object.fromEntries(PLANES.map((pl) => [pl, fitPlane(pl)])) });

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
    // at rest may be as deep in that bone as it is at rest (restDeep), and no deeper; any other point is never let
    // into a bone.
    const restDeep = Object.fromEntries(Object.entries(SOL).map(([k, f]) => [k, rest.map((p) => Math.max(0, f.depth(p)))]));
    const restIn = Object.fromEntries(Object.entries(restDeep).map(([k, d]) => [k, d.map((x) => x > 0)]));
    return { ...m, sl, mesh, rest, t, at: corners(sl, mesh), L0, S, wrap: Math.min(headR + 1.2, near), restIn, restDeep };
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
  // lies on the tendon's top face whatever the pose or condition (a worn tendon's thickened face). Over a tear the
  // caller gives the tendon as it would be untorn, and the sac closes over the hole.
  // The sac's floor is the tendon's top face, evened out (a sac of fluid does not copy a sharp step in what it lies
  // on) but never under that face. The sac stands off it along the face's own direction, found from the face and not
  // from the tendon's thickness, which is nothing where the tendon ends. Each corner of the sac sits over the point of
  // the floor at the same place across it (the sac is a little wider than the tendon: past the tendon's edges it
  // carries on in the same direction), 0.15 mm off it, and its top face by the sac's thickness more.
  // With the pose T given, the sac is never in bone: where the acromion leaves less room than the sac's thickness, the
  // sac is drawn as thin as the room (its fluid moves aside), down to a film.
  function bursaOn(bu, tPos, T = null) {
    const S = supra.S, M = 2 * K, i0 = Math.floor(BURSA.from * (S - 1)), N = S - i0, P = (i, j) => [tPos[3 * (i * M + j)], tPos[3 * (i * M + j) + 1], tPos[3 * (i * M + j) + 2]];
    const G = [], Nr = [];
    for (let r = 0; r < N; r++) { G.push([]); for (let k = 0; k < K; k++) G[r].push(P(i0 + r, k)); }
    const at = (A, r, k) => A[clamp(r, 0, N - 1)][clamp(k, 0, K - 1)];
    for (let r = 0; r < N; r++) { Nr.push([]); for (let k = 0; k < K; k++) {
      let n = V.cross(V.sub(at(G, r + 1, k), at(G, r - 1, k)), V.sub(at(G, r, k + 1), at(G, r, k - 1)));
      const through = V.sub(P(i0 + r, k), P(i0 + r, M - 1 - k)), ref = V.len(through) > 0.5 ? through : (r > 0 ? Nr[r - 1][k] : through);
      if (V.dot(n, ref) < 0) n = V.mul(n, -1);
      Nr[r].push(V.len(n) > 1e-9 ? V.norm(n) : V.norm(ref));
    } }
    const blur = (A, unit) => A.map((row, r) => row.map((_, k) => { let m = V.mul(A[r][k], 4); for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) m = V.add(m, at(A, r + a, k + c)); m = V.mul(m, 1 / 8); return unit ? V.norm(m) : m; }));
    let Ns = Nr; for (let pass = 0; pass < 3; pass++) Ns = blur(Ns, true);
    let Gs = G; for (let pass = 0; pass < 2; pass++) Gs = blur(Gs, false);
    const bones = T ? [[SOL.scapula, T.scapula, invT(T.scapula)], [SOL.humerus, T.humerus, invT(T.humerus)]] : [];
    const inBone = (q) => bones.some(([f, , Ik]) => f.depth(apply(Ik, q)) > 0);
    // (the evened face only where that keeps the floor out of bone: under the acromion the tendon's own face is the floor)
    const F = G.map((row, r) => row.map((g, k) => { const up = V.add(g, V.mul(Ns[r][k], Math.max(0, V.dot(V.sub(Gs[r][k], g), Ns[r][k])))); return inBone(up) ? g : up; }));
    const out = new Float32Array(bu.rest.length * 3), ends = [[], []], caps = [];
    bu.at.forEach((c, n) => {
      if (c.cap !== undefined) { caps.push(n); return; }
      const r = c.i, s = supra.sl[i0 + r], bs = bu.sl[r];
      const x = ((c.u - s.lo) / (s.hi - s.lo) - 0.01) / 0.98 * (K - 1), k = Math.min(K - 2, Math.max(0, Math.floor(x)));
      const floor = V.add(F[r][k], V.mul(V.sub(F[r][k + 1], F[r][k]), x - k));          // on the floor, or past its edge
      const nrm = Ns[r][clamp(Math.round(x), 0, K - 1)];
      const jj = clamp(Math.round((c.s - 0.01) / 0.98 * (K - 1)), 0, K - 1), hT = bs.top[jj] - bs.bot[jj], h = c.top ? hT : 0;
      let off = 0.15 + h, q = V.add(floor, V.mul(nrm, off));
      if (c.top && inBone(q)) { let lo = 0.2, hi = off; for (let it = 0; it < 6; it++) { const m = (lo + hi) / 2; if (inBone(V.add(floor, V.mul(nrm, m)))) hi = m; else lo = m; } off = lo; q = V.add(floor, V.mul(nrm, off)); }
      // (past the tendon's edge there is no tendon under the sac to keep it out of bone: there it draws back to the edge)
      if ((x < 0 || x > K - 1) && (inBone(q) || inBone(V.add(floor, V.mul(nrm, 0.15 + hT))))) q = V.add(F[r][x < 0 ? 0 : K - 1], V.mul(nrm, c.top ? 0.2 : 0.15));
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
  // the direction of a line of points at each point (from the point before to the point after), and how far it bends there
  // (for the deltoid, a sheet whose line bends sharply where it leaves the shoulder, over two slices each way and evened
  // out along the line, so that a bend shared by a few slices turns them gradually and does not leave a step)
  const tangents = (c, wide = false) => { const n = c.length, at = (i) => c[clamp(i, 0, n - 1)], w = wide ? 2 : 1; let t = c.map((_, i) => V.norm(V.sub(at(i + w), at(i - w))));
    if (wide) for (let pass = 0; pass < 2; pass++) t = t.map((_, i) => V.norm(V.add(V.add(t[Math.max(0, i - 1)], t[Math.min(n - 1, i + 1)]), V.mul(t[i], 2)))); return t; };
  const bendAt = (c, i) => { const a = V.sub(c[i], c[i - 1]), d = V.sub(c[i + 1], c[i]), la = V.len(a), ld = V.len(d); return la < 1e-6 || ld < 1e-6 ? 0 : Math.acos(clamp(V.dot(a, d) / (la * ld), -1, 1)); };
  const bends = (c) => c.map((_, i) => (i < 1 || i > c.length - 2 ? 0 : bendAt(c, i)));
  // shares out any bend of a line of slice middles that is sharper than BEND (or than the bend there at rest)
  function unbend(g, bend0, i0, i1) {
    for (let pass = 0; pass < 24; pass++) {
      const h = g.slice(); let moved = false;
      for (let i = i0; i <= i1; i++) {
        const th = bendAt(h, i), ok = Math.max(BEND, bend0[i] + rad(4)); if (th <= ok) continue;
        g[i] = V.add(h[i], V.mul(V.sub(V.mul(V.add(h[i - 1], h[i + 1]), 0.5), h[i]), 0.6 * (1 - ok / th))); moved = true;
      }
      if (!moved) break;
    }
  }
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
    // the way the middle line runs at each slice at rest (tau), and how sharply it bends there (bend0, radians)
    const tau = tangents(cs, b.cuff === false), bend0 = bends(cs);
    return { S, cs, s, ia, ib, rho, hint, u, F0, D, E, om, W0, tau, bend0, fixed: s[ia] + s[S - 1] - s[ib], on: ln.on || b.from, hand: ln.hand,
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
  // The layers keep their order: the deltoid lies over the cuff muscles, never in them. Its line is drawn taut over a
  // ball, which stands for the joint but not for the cuff muscles on the shoulder blade, so with the arm forward or
  // across the body the back of the deltoid's line runs through them. Where the under side of a slice of the deltoid
  // would be inside a cuff muscle, the slice is lifted outward until it lies on that muscle (the line, and so the
  // length and the leverage, are not changed).
  function depthIn(q, y, fy) {
    let j0 = 0, d0 = 1e9; for (let j = 0; j < y.S; j++) { const d = V.len(V.sub(q, fy[j].c)); if (d < d0) { d0 = d; j0 = j; } }
    let deep = 0;
    for (let j = Math.max(0, j0 - 1); j <= Math.min(y.S - 1, j0 + 1); j++) {
      const sl = y.sl[j], f = fy[j], loc = V.mul(mv(tr(f.R), V.sub(q, f.c)), 1 / f.k), a = V.dot(loc, sl.U), v = V.dot(loc, sl.W), n = V.dot(loc, V.cross(sl.U, sl.W));
      if (Math.abs(n) > 6 || a < sl.lo || a > sl.hi) continue;
      const x = clamp((a - sl.lo) / (sl.hi - sl.lo)) * (K - 1), k = Math.min(K - 2, Math.floor(x)), g = x - k, top = sl.top[k] + (sl.top[k + 1] - sl.top[k]) * g, bot = sl.bot[k] + (sl.bot[k + 1] - sl.bot[k]) * g;
      if (top - bot < 1.5 || v < bot || v > top) continue;
      deep = Math.max(deep, (top - v) * f.k);
    }
    return deep;
  }
  // slices that have been moved off the line lie along a longer or shorter way than before (c0: where they were): each
  // is drawn thinner or thicker by as much, so that the part keeps its volume
  function thinned(fr, c0) {
    const S = fr.length, sp = (c, i) => V.len(V.sub(c[Math.min(S - 1, i + 1)], c[Math.max(0, i - 1)])), c1 = fr.map((f) => f.c);
    for (let i = 0; i < S; i++) { const a = sp(c0, i), d = sp(c1, i); if (a > 1e-6 && d > 1e-6) fr[i].k *= Math.sqrt(clamp(a / d, 0.6, 1.5)); }
  }
  // slices that have been moved: no bend of their middle line sharper than a muscle can make (see unbend); the two
  // slices at each end stay where the bone has them
  function settle(b, fr) { const g = fr.map((f) => f.c); unbend(g, b.path.bend0, 2, b.S - 3); fr.forEach((f, i) => { f.c = g[i]; }); }
  const CUFF = built.filter((y) => y.cuff);
  // (the scans overlap a little where one muscle lies on another: only what is deeper than at rest is lifted out)
  const OVER = [1, 4, 8, 11, 14], REST = (y) => (y.fr0 ||= y.sl.map((q) => ({ c: q.c, R: I3R, k: 1 })));
  function overCuff(b, T, out) {
    const S = b.S, fys = CUFF.map((y) => [y, frames(y, T)]), lift = new Array(S).fill(0);
    const under = (i, f, j) => { const sl = b.sl[i], u = sl.lo + binU(j) * (sl.hi - sl.lo); return V.add(f.c, mv(f.R, V.mul(V.add(V.mul(sl.U, u), V.mul(sl.W, sl.bot[j])), f.k))); };
    b.over0 ||= b.sl.map((_, i) => OVER.map((j) => CUFF.map((y) => depthIn(under(i, REST(b)[i], j), y, REST(y)))));
    for (let i = 0; i < S; i++) {
      const e = sstep(0.06, 0.2, i / (S - 1)) * (1 - sstep(0.9, 0.98, i / (S - 1))); if (e <= 0) continue;
      OVER.forEach((j, n) => { const q = under(i, out[i], j); fys.forEach(([y, fy], m) => { lift[i] = Math.max(lift[i], e * (depthIn(q, y, fy) - b.over0[i][n][m])); }); });
    }
    if (!lift.some((x) => x > 0.05)) return;
    // no slice is lifted much more than the next: the rise is spread along the part
    for (const dir of [1, -1]) for (let n = 1; n < S; n++) { const i = dir > 0 ? n : S - 1 - n, j = i - dir; lift[i] = Math.max(lift[i], lift[j] - 0.3 * V.len(V.sub(out[i].c, out[j].c))); }
    for (let pass = 0; pass < 2; pass++) { const h = lift.slice(); for (let i = 1; i < S - 1; i++) lift[i] = Math.max(h[i], (h[i - 1] + 2 * h[i] + h[i + 1]) / 4); }
    const fade = 1 - sstep(TIE_FADE[0], TIE_FADE[1], T.elev ?? 0);
    for (let i = 0; i < S; i++) if (lift[i] > 0) out[i].c = V.add(out[i].c, V.mul(mv(out[i].R, b.sl[i].W), fade * (lift[i] + 0.3 * sstep(0.05, 0.5, lift[i]))));
  }
  // A cuff muscle lies on the bone under it. Its line is drawn over a ball about the joint's middle, and when the ball
  // slides down in its socket the line goes down with it, onto the rim of the socket. Where the under side of a slice
  // would be inside a bone (deeper than the scan has it at rest), the slice is lifted whole until it lies on the bone:
  // pushing only its under side out would draw the tendon thinner, and a tendon keeps its thickness.
  function onBone(b, T, out) {
    const S = b.S, into = Object.values(SOL).map((f, n) => [f, invT(T[Object.keys(SOL)[n]])]), lift = new Array(S).fill(0);
    const under = (i, f, j) => { const sl = b.sl[i], u = sl.lo + binU(j) * (sl.hi - sl.lo); return V.add(f.c, mv(f.R, V.mul(V.add(V.mul(sl.U, u), V.mul(sl.W, sl.bot[j])), f.k))); };
    const deep = (q, fs) => Math.max(...fs.map(([f, Ik]) => f.depth(Ik ? apply(Ik, q) : q)));
    b.bone0 ||= b.sl.map((_, i) => OVER.map((j) => deep(under(i, REST(b)[i], j), Object.values(SOL).map((f) => [f, null]))));
    for (let i = 0; i < S; i++) {
      const e = sstep(0.1, 0.3, i / (S - 1)) * (1 - sstep(0.9, 0.98, i / (S - 1))); if (e <= 0) continue;
      OVER.forEach((j, n) => { lift[i] = Math.max(lift[i], e * (deep(under(i, out[i], j), into) - b.bone0[i][n])); });
    }
    if (!lift.some((x) => x > 0.05)) return;
    for (const dir of [1, -1]) for (let n = 1; n < S; n++) { const i = dir > 0 ? n : S - 1 - n, j = i - dir; lift[i] = Math.max(lift[i], lift[j] - 0.3 * V.len(V.sub(out[i].c, out[j].c))); }
    for (let pass = 0; pass < 2; pass++) { const h = lift.slice(); for (let i = 1; i < S - 1; i++) lift[i] = Math.max(h[i], (h[i - 1] + 2 * h[i] + h[i + 1]) / 4); }
    for (let i = 0; i < S; i++) if (lift[i] > 0) out[i].c = V.add(out[i].c, V.mul(mv(out[i].R, b.sl[i].W), lift[i] + 0.3 * sstep(0.05, 0.5, lift[i])));
  }
  // (worked out once for each muscle at a pose: the parts that lie edge to edge ask for each other's)
  const framesOf = new WeakMap();
  function frames(b, T) {
    let m = framesOf.get(T); if (!m) framesOf.set(T, m = new Map());
    if (!m.has(b)) m.set(b, frames0(b, T));
    return m.get(b);
  }
  function frames0(b, T) {
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
    // A muscle has thickness all along it, so its middle line cannot bend more sharply than its slices leave room for:
    // between one slice and the next it bends no more than BEND (or than it does at rest, where the scan has a sharper
    // bend). A sharper bend is shared out among the slices beside it.
    unbend(g, P.bend0, Math.max(1, ia - 4), Math.min(S - 2, jq + 4));
    // then the slices slide along that line, so that the change of length is shared out (om)
    const sg = [0]; for (let i = 1; i < S; i++) sg.push(sg[i - 1] + V.len(V.sub(g[i], g[i - 1])));
    const L0 = s[S - 1], L1 = sg[S - 1]; let sum = 0; for (let i = 0; i + 1 < S; i++) sum += (s[i + 1] - s[i]) * P.om[i];
    const eps = (L1 - L0) / sum, fac = P.om.map((w) => Math.max(0.3, 1 + eps * w)); let tot = 0; for (let i = 0; i + 1 < S; i++) tot += (s[i + 1] - s[i]) * fac[i];
    const rel0 = P.hand ? compose(invT(O), T[b.from]) : null;       // the front deltoid's own bone, seen from the bone its line rides on
    const out = [], cL = [], RL = []; let st = 0, j = 0;
    for (let i = 0; i < S; i++) {
      if (i > 0) st += (s[i] - s[i - 1]) * fac[i - 1] * L1 / tot;
      while (j < S - 2 && sg[j + 1] < st) j++;
      const f = clamp(sg[j + 1] > sg[j] ? (st - sg[j]) / (sg[j + 1] - sg[j]) : 0);
      let c = V.add(g[j], V.mul(V.sub(g[j + 1], g[j]), f));
      let R = mm(mm(rotMix(Rg[j], Rg[j + 1], f), rotMix(P.E[j], P.E[j + 1], f)), tr(P.E[i]));
      if (rel0) { const w = 1 - sstep(...P.hand, i / (S - 1)); if (w > 0) { c = V.add(c, V.mul(V.sub(apply(rel0, c), c), w)); R = mm(rotMix(I3R, rel0.R, w), R); } }
      // a muscle keeps its volume: where it shortens, its cross-section grows
      const stretch = ((fac[Math.max(0, i - 1)] + fac[Math.min(S - 2, i)]) / 2) * L1 / tot;
      cL.push(c); RL.push(R); out.push({ k: 1 / Math.sqrt(stretch) });
    }
    // A slice is a cross-section of the muscle: it stays as square to the middle line as it is at rest. Each slice is
    // turned, by the least turn, so that the line passes through it the way it does at rest. Without this a slice near
    // a bend leans over, the muscle is drawn sheared, and it loses volume.
    for (let i = 0; i < S; i++) { out[i].c = apply(O, cL[i]); out[i].R = mm(O.R, RL[i]); }
    { const c0 = out.map((o) => o.c); if (b.cuff === false) overCuff(b, T, out); else onBone(b, T, out); settle(b, out); thinned(out, c0); }
    const tq = tangents(out.map((o) => o.c), b.cuff === false);
    // (for the deltoid this fades out above shoulder height with the ties, TIE_FADE: turned square there, its wide flat
    // parts swing their edges away from each other)
    const sq = b.cuff === false ? 1 - sstep(TIE_FADE[0], TIE_FADE[1], T.elev ?? 0) : 1;
    for (let i = 0; i < S; i++) out[i].R = mm(sq < 1 ? rotMix(I3R, between(mv(out[i].R, P.tau[i]), tq[i]), sq) : between(mv(out[i].R, P.tau[i]), tq[i]), out[i].R);
    return out;
  }
  // ---- parts that lie edge to edge ----
  // The deltoid is one sheet of muscle with one attachment on the arm bone, built here as three parts side by side.
  // The infraspinatus and the teres minor lie side by side in the same way. Each part is carried by its own line,
  // and nothing in the lines keeps one part's edge on its neighbor's: the lines are drawn over one ball, not over the
  // arm bone and the muscles a real part wraps round, so as the arm lifts they close on each other, and with each
  // part at its full width the parts would run through each other. So where two parts lie edge to edge at rest
  // (TIES), their facing edges are kept together. Of the distance one edge has gone from the other, the first part of
  // a tie takes the share given: a part marked `shift` moves aside whole, as a muscle pushed by its neighbor does; the
  // other is drawn narrower or wider between its edges and thicker or thinner by as much, so that its cross-section
  // keeps its area. The lines, and so the lengths and the leverage, are as they were.
  const TIES = [['deltA', 'deltM', 0.7, 'shift', 'squeeze'], ['deltP', 'deltM', 0.7, 'shift', 'squeeze'], ['tminor', 'infra', 0.7, 'shift', 'squeeze']], TIE_NEAR = 14, TIE_FAR = 24;
  const edge0 = (b, side) => b.sl.map((q) => { const j = side ? K - 1 : 0, u = side ? q.hi : q.lo, v = (q.top[j] + q.bot[j]) / 2; return { u, v, p: V.add(q.c, V.add(V.mul(q.U, u), V.mul(q.W, v))) }; });
  const nearOn = (p, poly) => { let d = 1e9, at = 0; for (let i = 0; i + 1 < poly.length; i++) { const a = poly[i], e = V.sub(poly[i + 1], a), l2 = V.dot(e, e), f = l2 > 1e-9 ? clamp(V.dot(V.sub(p, a), e) / l2) : 0, dd = V.len(V.sub(p, V.add(a, V.mul(e, f)))); if (dd < d) { d = dd; at = i + f; } } return { d, at }; };
  const onPoly = (poly, at) => { const i = Math.min(poly.length - 2, Math.floor(at)), f = at - i; return V.add(poly[i], V.mul(V.sub(poly[i + 1], poly[i]), f)); };
  const tiesOf = new Map(built.map((b) => [b.id, []]));
  for (const [x, y, share, hx, hy] of TIES) {
    const X = built.find((b) => b.id === x), Y = built.find((b) => b.id === y);
    // which edge of each faces the other: the two that are nearest along most of their length
    let best = null;
    for (const sx of [0, 1]) for (const sy of [0, 1]) { const ex = edge0(X, sx), ey = edge0(Y, sy).map((e) => e.p), ds = ex.map((e) => nearOn(e.p, ey).d).sort((a, c) => a - c), med = ds[ds.length >> 1]; if (!best || med < best.med) best = { med, sx, sy }; }
    for (const [A, sa, B, sb, sh, how] of [[X, best.sx, Y, best.sy, share, hx], [Y, best.sy, X, best.sx, 1 - share, hy]]) {
      const ea = edge0(A, sa), eb = edge0(B, sb).map((e) => e.p);
      const rows = ea.map((e) => { const n = nearOn(e.p, eb); return { at: n.at, d0: V.sub(onPoly(eb, n.at), e.p), w: 1 - sstep(TIE_NEAR, TIE_FAR, n.d) }; });
      // no tie at a part's two ends, where it is fixed to bone
      rows.forEach((r, i) => { r.w *= sstep(0, 0.12, i / (A.S - 1)) * (1 - sstep(0.9, 1, i / (A.S - 1))); r.w1 = r.w; r.w *= sh; });
      tiesOf.get(A.id).push({ side: sa, other: B, oside: sb, rows, shift: how === 'shift' });
    }
  }
  const edgeAt = (b, fr, side) => { const e0 = edge0(b, side); return fr.map((f, i) => V.add(f.c, mv(f.R, V.mul(V.add(V.mul(b.sl[i].U, e0[i].u), V.mul(b.sl[i].W, e0[i].v)), f.k)))); };
  // A tied part at a pose: its slices' frames once it has moved aside (fr), and for each slice how far its two edges
  // then move (lo, hi) and how much thicker it is drawn (lam). null for a part with no tie.
  const tiedOf = new WeakMap();
  function tied(b, T) {
    const ts = tiesOf.get(b.id); if (!ts || !ts.length) return null;
    let m = tiedOf.get(T); if (!m) tiedOf.set(T, m = new Map());
    if (m.has(b)) return m.get(b);
    const f0 = frames(b, T), S = b.S, Z0 = [0, 0, 0], tq = tangents(f0.map((f) => f.c), b.cuff === false), sq = f0.map(() => ({ lo: Z0, hi: Z0, lam: 1 })), sh = f0.map(() => Z0);
    for (const t of ts) {
      const mine = edgeAt(b, f0, t.side), theirs = edgeAt(t.other, frames(t.other, T), t.oside);
      t.rows.forEach((r, i) => {
        if (r.w <= 0) return;
        // (only across the part and through it: a slice stays square to the part's length)
        let d = V.mul(V.sub(V.sub(onPoly(theirs, r.at), mine[i]), mv(f0[i].R, r.d0)), r.w); d = V.sub(d, V.mul(tq[i], V.dot(d, tq[i])));
        if (t.shift) sh[i] = V.add(sh[i], d); else if (t.side) sq[i].hi = d; else sq[i].lo = d;
      });
    }
    // (evened out along the part: where the neighbor's edge has a step, this part does not copy it)
    const even = (get, set) => { for (let pass = 0; pass < 3; pass++) { const h = f0.map((_, i) => get(i)); for (let i = 1; i < S - 1; i++) set(i, V.mul(V.add(V.add(h[i - 1], h[i + 1]), V.mul(h[i], 2)), 0.25)); } };
    even((i) => sh[i], (i, v) => { sh[i] = v; }); even((i) => sq[i].lo, (i, v) => { sq[i].lo = v; }); even((i) => sq[i].hi, (i, v) => { sq[i].hi = v; });
    // what both edges of a slice do alike moves the slice whole; only the rest makes it narrower or wider
    for (let i = 0; i < S; i++) { const mid = V.mul(V.add(sq[i].lo, sq[i].hi), 0.5); sh[i] = V.add(sh[i], mid); sq[i].lo = V.sub(sq[i].lo, mid); sq[i].hi = V.sub(sq[i].hi, mid); }
    // a part moves aside smoothly: no slice moves more than 0.8 of its distance from the slice before it (and an edge
    // no more than 0.35 of it, since the slices are turned to follow the first and not the second)
    const slope = (get, set, k) => { for (const dir of [1, -1]) for (let n = 1; n < S; n++) {
      const i = dir > 0 ? n : S - 1 - n, j = i - dir, lim = k * V.len(V.sub(f0[i].c, f0[j].c)), e = V.sub(get(i), get(j)), l = V.len(e);
      if (l > lim) set(i, V.add(get(j), V.mul(e, lim / l)));
    } };
    slope((i) => sh[i], (i, v) => { sh[i] = v; }, 0.8); slope((i) => sq[i].lo, (i, v) => { sq[i].lo = v; }, 0.35); slope((i) => sq[i].hi, (i, v) => { sq[i].hi = v; }, 0.35);
    const moved = sh.some((d) => V.len(d) > 1e-6);
    let fr = f0;
    if (moved) {
      fr = f0.map((f, i) => ({ c: V.add(f.c, sh[i]), R: f.R, k: f.k }));
      if (b.cuff === false) overCuff(b, T, fr);                      // moved aside, it still lies on the cuff
      settle(b, fr); thinned(fr, f0.map((f) => f.c));
      const tn = tangents(fr.map((f) => f.c), b.cuff === false); fr.forEach((f, i) => { f.R = mm(between(tq[i], tn[i]), f.R); });
    }
    const lo = edgeAt(b, fr, 0), hi = edgeAt(b, fr, 1);
    sq.forEach((o, i) => { const w0 = V.len(V.sub(hi[i], lo[i])), w1 = V.len(V.sub(V.add(hi[i], o.hi), V.add(lo[i], o.lo))); o.lam = w0 > 0.5 ? clamp(w0 / Math.max(w1, 1e-3), 0.7, 1.6) : 1; });
    // (evened out along the part, so that one slice is not drawn much thicker than the next)
    const lam = sq.map((o) => o.lam); for (let i = 0; i < S; i++) sq[i].lam = (lam[Math.max(0, i - 1)] + 2 * lam[i] + lam[Math.min(S - 1, i + 1)]) / 4;
    const out = { fr, sq }; m.set(b, out); return out;
  }

  // The deltoid is one sheet, and a sheet has one edge where two of its parts meet. Moving a part aside and drawing its neighbor wider (tied) does
  // not bring the two edges all the way together: a part that is moved is then kept on the cuff under it and free of
  // sharp bends. So what is left between the two edges is closed from both sides: each edge goes half way to the other,
  // and the part's surface follows, most at that edge and not at all from its middle on. For each slice, how far its
  // lo and hi edges go.
  const seamOf = new WeakMap(), SEAM = 8;
  function seam(b, T) {
    const ts = tiesOf.get(b.id); if (!ts || !ts.length || b.cuff !== false) return null;
    let m = seamOf.get(T); if (!m) seamOf.set(T, m = new Map());
    if (m.has(b)) return m.get(b);
    const me = tied(b, T), Z0 = [0, 0, 0], out = me.fr.map(() => ({ lo: Z0, hi: Z0, lam: 1 })), tq = tangents(me.fr.map((f) => f.c), b.cuff === false);
    const final = (x, tx, side) => edgeAt(x, tx.fr, side).map((p, i) => V.add(p, side ? tx.sq[i].hi : tx.sq[i].lo));
    for (const t of ts) {
      const mine = final(b, me, t.side), theirs = final(t.other, tied(t.other, T), t.oside), d = t.rows.map((r, i) => {
        if (r.w1 <= 0) return Z0;
        const e = V.mul(V.sub(V.sub(onPoly(theirs, r.at), mine[i]), mv(me.fr[i].R, r.d0)), 0.5 * r.w1); return V.sub(e, V.mul(tq[i], V.dot(e, tq[i])));
      });
      for (let pass = 0; pass < 2; pass++) { const h = d.slice(); for (let i = 1; i < b.S - 1; i++) d[i] = V.mul(V.add(V.add(h[i - 1], h[i + 1]), V.mul(h[i], 2)), 0.25); }
      // (no edge goes more than SEAM mm: further than that the part would be drawn out of shape)
      d.forEach((e, i) => { const l = V.len(e), k = l > 1e-6 ? SEAM * Math.tanh(l / SEAM) / l : 1; if (t.side) out[i].hi = V.mul(e, k); else out[i].lo = V.mul(e, k); });
    }
    // (drawn thicker where it is then narrower, and thinner where wider, so that its cross-section keeps its area)
    const L = final(b, me, 0), H = final(b, me, 1), lam = out.map((o, i) => { const w0 = V.len(V.sub(H[i], L[i])), w1 = V.len(V.sub(V.add(H[i], o.hi), V.add(L[i], o.lo))); return w0 > 0.5 ? clamp(w0 / Math.max(w1, 1e-3), 0.75, 1.4) : 1; });
    out.forEach((o, i) => { o.lam = (lam[Math.max(0, i - 1)] + 2 * lam[i] + lam[Math.min(b.S - 1, i + 1)]) / 4; });
    m.set(b, out); return out;
  }

  // A muscle's length at a pose, as a share of its length at rest: the parts of its line that lie on a bone, the taut
  // line between them, and what is wound on. (The mesh's own middle line is a little longer: it keeps the scan's bends.)
  const length = (b, T) => { const { P, W, extra, fixed } = lineAt(b, T); return (fixed + W.len + extra) / (P.fixed + P.W0.len); };
  // the same in mm of the line (for checking leverage against measurements)
  const lineMm = (b, T) => { const { W, extra, fixed } = lineAt(b, T); return fixed + W.len + extra; };
  // A built mesh at a pose. opts.shape(t, s, top) may return { thick, lift }: the outline's half thickness is
  // multiplied by thick, and lift (a share of the full thickness) raises the bottom face (a tear from below).
  function draw(b, T, opts = {}) {
    const H = T.humerus, ball = apply(H, HC), into = Object.keys(SOL).map((k) => [k, SOL[k], T[k], invT(T[k])]);
    // (the ties fade out as the arm goes up past TIE_FADE: see there)
    const tw = b.id === 'bursa' ? 0 : b.cuff ? 1 : 1 - sstep(TIE_FADE[0], TIE_FADE[1], T.elev ?? 0), t1 = tw > 0 ? tied(b, T) : null, tie = t1 && tw > 0 ? t1 : null;
    const f0 = frames(b, T), fr = !tie ? f0 : tw >= 1 ? tie.fr : tie.fr.map((f, i) => ({ c: V.add(f0[i].c, V.mul(V.sub(f.c, f0[i].c), tw)), R: rotMix(f0[i].R, f.R, tw), k: f0[i].k + (f.k - f0[i].k) * tw }));
    const sm = tie ? seam(b, T) : null;
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
      const mid = f.c;
      let q = V.add(f.c, mv(f.R, V.mul(V.sub(p, s.c), f.k)));
      if (tie) {                                                   // its edges go with its neighbors' (see TIES)
        const e = tie.sq[si], a = c.cap !== undefined ? 0.5 : clamp((c.s - 0.01) / 0.98);
        q = V.add(q, V.mul(V.add(V.mul(e.lo, 1 - a), V.mul(e.hi, a)), tw));
        // thicker or thinner from its under side, which stays on what it lies on
        if (c.cap === undefined && c.top) q = V.add(q, mv(f.R, V.mul(s.W, (Math.min(e.lam * (sm ? sm[si].lam : 1), THICK / f.k) - 1) * tw * f.k * 2 * c.h)));
        // its edges meet its neighbors' (see seam)
        if (sm && c.cap === undefined) q = V.add(q, V.mul(V.add(V.mul(sm[si].lo, 1 - sstep(0, 0.5, a)), V.mul(sm[si].hi, sstep(0.5, 1, a))), tw));
      }
      // wrapped over the ball: never closer to its middle than at rest
      const d = V.sub(q, ball), l = V.len(d); if (l < b.wrap) q = V.add(ball, V.mul(d, b.wrap / l));
      // (more than once: one push can lead into another bone, and from deep in a bone one push may not reach its surface)
      for (let pass = 0, moved = true; pass < (b.cuff === false ? 2 : 4) && moved; pass++) { moved = false; for (const [kk, f, Tk, Ik] of into) {
        // (the deltoid, which starts on the bone it is in at rest, is left where the scan has it there)
        const base = b.restDeep[kk][i]; if (base > 0 && b.cuff === false) continue;
        const loc = apply(Ik, q), dp = f.depth(loc) - (base > 0 ? base + 0.5 : 0); if (dp <= 0) continue;
        // (out by the side it came in, which is the side its slice's middle is on, unless that is in the bone too: the nearest way out of a thin bone can be through it)
        const o = f.out(loc); if (o) { const ow = mv(Tk.R, o), back = V.sub(mid, q); q = V.add(q, V.mul(b.cuff === false || V.dot(ow, back) >= 0 || f.depth(apply(Ik, mid)) > 0 ? ow : V.norm(back), dp + 0.4)); moved = true; }
        if (kk === 'scapula' && loc[1] > ROOF && pass < 2) pressed[i] = Math.max(pressed[i], dp);   // how far the acromion had to push this corner
      } }
      out[3 * i] = q[0]; out[3 * i + 1] = q[1]; out[3 * i + 2] = q[2];
    });
    return { pos: out, length: L, rest: b.L0, pressed };
  }
  // The deltoid is one sheet: nothing lies between its parts. What the steps above still leave between two of them,
  // once each is drawn, is closed at the end: where an edge stands further from the part beside it than it does at
  // rest, it goes half the extra way to that part (and that part's edge comes the other half), and the part's surface
  // follows, most at that edge and not at all from its middle on. (No edge goes more than CLOSE mm.)
  const drawnOf = new WeakMap(), gap0Of = new Map(), CLOSE = 12, Z3 = [0, 0, 0];
  const drawn = (b, T) => { let m = drawnOf.get(T); if (!m) drawnOf.set(T, m = new Map()); if (!m.has(b)) m.set(b, draw(b, T)); return m.get(b); };
  // the middle of a slice's edge: its top and bottom corners there
  const edgeLine = (b, at, side) => Array.from({ length: b.S }, (_, i) => { const j = i * 2 * K, a = at(j + (side ? K - 1 : 0)), c = at(j + (side ? K : 2 * K - 1)); return V.mul(V.add(a, c), 0.5); });
  const fromPos = (pos) => (k) => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]];
  // the nearest corner of a mesh to a point
  const nearest = (p, pos) => { let d = 1e18, k = 0; for (let n = 0; n < pos.length; n += 3) { const x = pos[n] - p[0], y = pos[n + 1] - p[1], z = pos[n + 2] - p[2], dd = x * x + y * y + z * z; if (dd < d) { d = dd; k = n; } } return { d: Math.sqrt(d), q: [pos[k], pos[k + 1], pos[k + 2]] }; };
  // (a corner moved into a bone it was not in at rest is put back out of it, as in draw)
  function outOfBone(b, T, k, q) {
    for (let pass = 0, moved = true; pass < 2 && moved; pass++) { moved = false; for (const kk of Object.keys(SOL)) {
      if (b.restDeep[kk][k] > 0) continue;
      const f = SOL[kk], Tk = T[kk], loc = apply(invT(Tk), q), dp = f.depth(loc); if (dp <= 0) continue;
      const o = f.out(loc); if (o) { q = V.add(q, V.mul(mv(Tk.R, o), dp + 0.4)); moved = true; }
    } }
    return q;
  }
  // (twice: the second time from where the first left both parts)
  const closedOf = new WeakMap(), ROUNDS = 2;
  function closed(b, T, round = ROUNDS) {
    if (round === 0) return drawn(b, T);
    let m = closedOf.get(T); if (!m) closedOf.set(T, m = new Map());
    const id = `${b.id} ${round}`; if (m.has(id)) return m.get(id);
    const r = closed(b, T, round - 1), ts = tiesOf.get(b.id), pos = r.pos.slice(), S = b.S;
    for (const t of ts) {
      const key = `${b.id} ${t.side}`;
      if (!gap0Of.has(key)) { const p0 = new Float32Array(t.other.rest.flat()); gap0Of.set(key, edgeLine(b, (k) => b.rest[k], t.side).map((p) => nearest(p, p0).d)); }
      const g0 = gap0Of.get(key), mine = edgeLine(b, fromPos(r.pos), t.side), theirs = closed(t.other, T, round - 1).pos;
      // (only out from the edge: where the nearest of the other part is over or under this one, the two overlap there, and
      // that is not a gap)
      const mids = Array.from({ length: S }, (_, i) => { let c = [0, 0, 0]; for (let j = 0; j < 2 * K; j++) c = V.add(c, fromPos(r.pos)(i * 2 * K + j)); return V.mul(c, 1 / (2 * K)); });
      const d = mine.map((p, i) => { const w = t.rows[i].w1; if (w <= 0) return Z3; const n = nearest(p, theirs), e = n.d - g0[i], go = V.sub(n.q, p), out = V.norm(V.sub(p, mids[i]));
        return e > 0 && n.d > 1e-6 && V.dot(go, out) > -0.5 * n.d ? V.mul(go, 0.5 * w * e / n.d) : Z3; });
      // (spread to the slices beside, so that the edge has no step, but each slice goes at least its own way)
      const d1 = d.slice(); for (let pass = 0; pass < 2; pass++) { const h = d.slice(); for (let i = 1; i < S - 1; i++) d[i] = V.mul(V.add(V.add(h[i - 1], h[i + 1]), V.mul(h[i], 2)), 0.25); }
      d.forEach((e, i) => { if (V.len(d1[i]) > V.len(e)) d[i] = d1[i]; });
      d.forEach((e, i) => { const l = V.len(e); if (l > 1e-6) d[i] = V.mul(e, CLOSE * Math.tanh(l / CLOSE) / l); });
      b.at.forEach((c, k) => { if (c.cap !== undefined) return; const a = clamp((c.s - 0.01) / 0.98), w = t.side ? sstep(0.5, 1, a) : 1 - sstep(0, 0.5, a), e = d[c.i];
        if (w > 0 && V.len(e) > 0.05) { const q = outOfBone(b, T, k, V.add(fromPos(pos)(k), V.mul(e, w))); for (let x = 0; x < 3; x++) pos[3 * k + x] = q[x]; } });
    }
    const out = { ...r, pos }; m.set(id, out); return out;
  }
  function muscle(b, T, opts = {}) {
    if (b.cuff !== false || opts.shape || !tiesOf.get(b.id)?.length) return draw(b, T, opts);
    return closed(b, T);
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

  return { marks: mk, headR, NS, DOWN, pose, length, contract, orient, poseOf, LIMIT, bodyOf, gap, bodyOf, gap, stored, glideAt, makeTable, PLANES, built, muscle, bursa, bursaOn, bones, SOL, invT, ribPen, lineOf, lineMm, frames, tied, seam, room };
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
