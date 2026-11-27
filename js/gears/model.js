// Gears on a cube and an octahedron: where each gear sits, which gears mesh, which way each turns, and the
// shape of the teeth. Everything the page draws and every number it shows comes from here.
//
// Each gear is a bevel gear whose axis runs from the solid's center out through the middle of a face. Two
// gears on neighboring faces have axes that meet at the center, at the angle between the two face normals.
// Their pitch cones (the cones that roll on each other without slipping) both have their tip at the center and
// touch along the line from the center through the middle of the shared edge. So each pitch cone's half-angle
// is the angle between the face normal and that line: 45° on a cube, 35.26° on an octahedron.
//
// The teeth are made the way bevel-gear machines make them: a crown gear (a bevel gear whose pitch cone is
// flat) with straight-sided teeth rolls against the blank and cuts it. Two gears cut by the same crown gear mesh
// with each other at any shaft angle. tests/gears/model.mjs turns every pair and checks that no tooth enters
// another and that the teeth do engage.

const D = Math.PI / 180;
export const PRESSURE = 20 * D;         // the angle of the crown gear's straight tooth sides
export const R_OUT = 1, R_IN = 0.74;    // the teeth run along the pitch cone from 0.74 to 1 of the distance from the center
// The gears' modules (the pitch diameter at the teeth's outer end, divided by the tooth count), in mm: see MM below.
export const MODULE = { cube: 1, octa: 0.9 };
// Backlash. Each tooth is thinner than half the tooth spacing, so that meshing teeth do not bind. JIS B 1705:1973 (bevel
// gears) gives each gear's share of a pair's backlash at the outer pitch circle from W = cbrt(d) + 0.65 m micrometers
// (d the pitch diameter, m the module, both in mm): at least 10W, and at most 25W for grade 0 (the KHK Gear Guide,
// Technical Data, p. 725, "Backlash Standard for Bevel Gears", khkgears.us). A pair's backlash is the sum of its two
// gears' shares. Each tooth here is thinned by the middle of grade 0's range, 17.5W: 0.054 mm on the cube, 0.050 mm on the
// octahedron, so a pair has 0.107 mm and 0.100 mm.
export const BACKLASH_W = 17.5;
export const thinningMM = (m, N) => BACKLASH_W * (Math.cbrt(m * N) + 0.65 * m) / 1000;

// ---- small vector helpers ----
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
// turn v by angle a about the unit axis k (right hand)
export function turn(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, v), x = cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
}

// ---- the solids ----
// y is up. The cube's four ringed faces go round the vertical; the octahedron stands on a corner.
const s3 = 1 / Math.sqrt(3);
const CUBE_RING = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
const CUBE_CAPS = [[0, 1, 0], [0, -1, 0]];
const OCTA = [];
for (const y of [1, -1]) for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) OCTA.push([x * s3, y * s3, z * s3]);

export const SHAPES = [
  { id: 'cube4', name: 'Cube, 4', solid: 'cube', faces: CUBE_RING, plain: CUBE_CAPS, teeth: 14 },
  { id: 'cube6', name: 'Cube, 6', solid: 'cube', faces: [...CUBE_RING, ...CUBE_CAPS], plain: [], teeth: 14 },
  { id: 'octa', name: 'Octahedron, 8', solid: 'octa', faces: OCTA, plain: [], teeth: 13 },
].map(makeShape);

export function makeShape(sh) {
  const n = sh.faces.map(norm), all = [...n, ...sh.plain.map(norm)];
  // two faces are neighbors when they share an edge: on both solids, those are the face normals at the
  // smallest angle to each other
  const near = Math.max(...all.flatMap((a, i) => all.filter((_, j) => j !== i).map((b) => dot(a, b))));
  const meshes = [];
  for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) if (dot(n[i], n[j]) > near - 1e-9) meshes.push({ i, j, m: norm(add(n[i], n[j])) });
  const shaft = Math.acos(near);                 // the angle between the axes of two meshing gears
  const alpha = shaft / 2;                       // each pitch cone's half-angle
  // which way each gear turns, about its own axis seen from outside: +1 or -1, or 0 for a gear that would have to
  // turn both ways. Gears are taken in order (the ring first), each turning against the gears it meets that
  // already have a direction.
  const sign = n.map(() => null), order = [0], seen = new Set([0]);
  for (let k = 0; k < order.length; k++) for (const e of meshes) for (const [a, b] of [[e.i, e.j], [e.j, e.i]]) if (a === order[k] && !seen.has(b)) { seen.add(b); order.push(b); }
  for (const i of order) {
    const got = meshes.filter((e) => e.i === i || e.j === i).map((e) => sign[e.i === i ? e.j : e.i]).filter((s) => s);
    sign[i] = !got.length ? 1 : got.every((s) => s === got[0]) ? -got[0] : 0;
  }
  // a set of meshed gears can turn only if no two meshing gears must turn the same way
  const jammed = sign.includes(0) || meshes.some((e) => sign[e.i] === sign[e.j]);
  // each gear's own frame: z along its axis, x toward the first gear it meshes with (or any edge, if none)
  const frames = n.map((z, i) => {
    const e = meshes.find((e) => e.i === i || e.j === i);
    const toward = e ? e.m : norm(add(z, all.find((b) => Math.abs(dot(b, z) - near) < 1e-9)));
    const x = norm(add(toward, scale(z, -dot(toward, z)))), y = cross(z, x);
    return { x, y, z };
  });
  // each tooth's thinning as a share of the tooth spacing (a shape made for a test, with no solid, is taken at module 1)
  const N = sh.teeth, m = MODULE[sh.solid] ?? 1, thin = thinningMM(m, N) / (Math.PI * m), profile = teethOf(alpha, N, thin);
  // where each gear's teeth sit when the turn is 0 (the angle of a tooth's middle in the gear's frame). At each
  // contact, a tooth of one gear must face a gap of the other. Measured from the contact, in tooth spacings, the
  // tooth offsets of two meshing gears add to one half, and turning keeps that sum, since they turn opposite ways.
  // So the offsets are set gear by gear, out from the first. Round each loop of four, the conditions agree for
  // any tooth count (tests/gears/model.mjs checks this by turning every pair).
  const pitch = 2 * Math.PI / N, az = (i, m) => Math.atan2(dot(m, frames[i].y), dot(m, frames[i].x));
  const off = n.map(() => null); off[0] = 0;
  for (const i of order) for (const e of meshes) {
    if (e.i !== i && e.j !== i) continue;
    const j = e.i === i ? e.j : e.i;
    if (off[j] === null) off[j] = 0.5 + (az(i, e.m) + az(j, e.m)) / pitch - off[i];
  }
  const phase = off.map((p) => (((p % 1) + 1) % 1) * pitch);
  const per = n.map((_, i) => meshes.filter((e) => e.i === i || e.j === i).length);
  // each gear's neighbors, and how many meshes lie between any two gears
  const nbr = n.map((_, i) => meshes.filter((e) => e.i === i || e.j === i).map((e) => (e.i === i ? e.j : e.i)));
  const hops = n.map((_, d) => { const h = n.map(() => -1), q = [d]; h[d] = 0; for (let k = 0; k < q.length; k++) for (const j of nbr[q[k]]) if (h[j] < 0) { h[j] = h[q[k]] + 1; q.push(j); } return h; });
  return { ...sh, normals: n, plainNormals: sh.plain.map(norm), meshes, shaft, alpha, sign, jammed, frames, phase, per, profile,
    pitch: 2 * Math.PI / N, conflicted: sign.map((s) => s === 0), thin, slack: thin * 2 * Math.PI / N, nbr, hops };
}

// How far each gear has turned about its own axis (radians, right hand about the outward axis) when the set has
// turned by t. Meshing gears turn at equal speed in opposite directions, because their pitch cones are the same
// size. A gear that would have to turn both ways does not turn, and neither does any other.
// t is one number (every tooth in the middle of its gap) or one per gear, from rest() and drive().
export function angles(sh, t) { return sh.sign.map((s, i) => (sh.jammed ? 0 : s * (Array.isArray(t) ? t[i] : t)) + sh.phase[i]); }

// Driving through the backlash. Each gear's turn p[i] is counted like the set's turn t: two meshing gears with equal p
// have each tooth in the middle of its gap, and their teeth touch when the two differ by sh.slack (the free turn
// either way). The visitor turns one gear, d. The others move only when a tooth pushes them, so a driven gear's
// teeth rest on its driver's flanks, and each mesh further from d lags by one more slack. When the turn changes
// way, the driven gears stand still while the driver crosses the backlash.
// rest: the gears as they are after d has turned some way (way: +1 or -1) and come to t.
export function rest(sh, d, t, way = 1) { return sh.hops[d].map((h) => t - way * h * sh.slack); }
// drive: d turned to t; every other gear moves as little as it must to keep each mesh within the slack. Changes p.
// Gears are moved outward from d. A gear keeps within the slack of the gears nearer d first (they push it), then of
// the others where it can (one of them may push it too); a gear further out that is in the way is pushed in its turn.
export function drive(sh, p, d, t) {
  p[d] = t;
  if (sh.jammed) return p;
  const f = sh.slack, h = sh.hops[d], order = sh.normals.map((_, i) => i).filter((i) => i !== d).sort((a, b) => h[a] - h[b]);
  const within = (ks) => { if (!ks.length) return [-Infinity, Infinity]; const v = ks.map((k) => p[k]); return [Math.max(...v) - f, Math.min(...v) + f]; };
  for (let it = 0; it < 12; it++) {
    let moved = 0;
    for (const j of order) {
      const [lo, hi] = within(sh.nbr[j].filter((k) => h[k] < h[j]));
      let q = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, p[j]));
      const [lo2, hi2] = within(sh.nbr[j].filter((k) => h[k] >= h[j])), a = Math.max(lo, lo2), b = Math.min(hi, hi2);
      if (a <= b) q = Math.min(b, Math.max(a, q));
      moved = Math.max(moved, Math.abs(q - p[j])); p[j] = q;
    }
    if (moved < 1e-12) break;
  }
  return p;
}

// ---- the teeth ----
// A tooth is described on a sphere about the center, since every surface of a bevel gear runs straight toward the
// center. At polar angle th (from the gear's axis), the tooth covers azimuths within ±half(th) of its middle.
// The tooth runs from the root (alpha - 1.25 m) to the tip (alpha + m), where m is the tooth spacing along the
// pitch circle divided by pi, measured as an angle on the sphere.
export function teethOf(alpha, N, thin) {
  const pc = 2 * Math.PI * Math.sin(alpha) / N;  // tooth spacing along the pitch circle, as an arc on the unit sphere
  const m = pc / Math.PI, add = m, ded = 1.25 * m;
  const root = alpha - ded, tip = alpha + add, tanP = Math.tan(PRESSURE);
  // The gear's frame: axis z, pitch point P = (sin a, 0, cos a). The crown gear's axis C is square to P, on the
  // far side, so the angle between the axes is 90° + alpha. Rolling the gear by f about z rolls the crown by
  // -f sin(alpha) about C, so that the pitch point moves at the same speed on both.
  const P = [Math.sin(alpha), 0, Math.cos(alpha)], C = [Math.cos(alpha), 0, -Math.sin(alpha)], Y = [0, 1, 0];
  const half = Math.PI / N, b = thin * pc;          // the crown's teeth are wider by b, so the gear's are thinner by b
  // is a point of the blank (polar th, azimuth ps) cut away by the crown gear at some roll f?
  const F = [];
  for (let k = -160; k <= 160; k++) F.push(k / 160 * 3 * half * 2);
  function cut(th, ps) {
    const g = [Math.sin(th) * Math.cos(ps), Math.sin(th) * Math.sin(ps), Math.cos(th)];
    for (const f of F) {
      const w = turn(g, [0, 0, 1], f), q = turn(w, C, f * Math.sin(alpha));
      const depth = Math.acos(Math.max(-1, Math.min(1, dot(q, C)))) - Math.PI / 2;   // how far into the blank, from the crown's pitch plane
      if (depth > ded) continue;                                                   // past the crown tooth's tip
      const az = Math.atan2(dot(q, Y), dot(q, P));                                 // along the crown's pitch circle
      // the crown's teeth sit between the gear's teeth: centered at half a spacing, then every spacing
      const u = ((az - pc / 2) % pc + pc * 1.5) % pc - pc / 2;
      if (Math.abs(u) < pc / 4 + b / 2 - depth * tanP) return true;
    }
    return false;
  }
  const rows = 28, th = [], hw = [];
  for (let r = 0; r <= rows; r++) {
    const t = root + (tip - root) * r / rows;
    let lo = 0, hi = half;                 // the tooth's middle is never cut, the middle of the gap always is (above the root)
    if (!cut(t, hi)) { th.push(t); hw.push(half); continue; }
    for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (cut(t, mid)) hi = mid; else lo = mid; }
    th.push(t); hw.push(lo);
  }
  // a tooth never widens toward its tip
  for (let r = 1; r < hw.length; r++) hw[r] = Math.min(hw[r], hw[r - 1]);
  return { N, alpha, root, tip, m, pc, th, hw, half, thin };
}

// the tooth's half-width (radians of azimuth) at polar angle th, or -1 past the tip
export function halfWidth(pr, th) {
  if (th <= pr.root) return pr.half;
  if (th > pr.tip) return -1;
  const f = (th - pr.root) / (pr.tip - pr.root) * (pr.th.length - 1), i = Math.min(pr.th.length - 2, Math.floor(f)), u = f - i;
  return pr.hw[i] * (1 - u) + pr.hw[i + 1] * u;
}

// Is the direction d (a unit vector, any length along it is the same) inside gear i's metal when the set has
// turned by t? Only the toothed band and the body under it count, not the end faces.
export function inside(sh, i, t, d, ang = angles(sh, t)) {
  const F = sh.frames[i], z = dot(d, F.z), th = Math.acos(Math.max(-1, Math.min(1, z)));
  if (th <= sh.profile.root) return true;
  if (th > sh.profile.tip) return false;
  const ps = Math.atan2(dot(d, F.y), dot(d, F.x)) - ang[i], p = sh.pitch;
  const u = ((ps % p) + p * 1.5) % p - p / 2;      // azimuth from the middle of the nearest tooth
  return Math.abs(u) < halfWidth(sh.profile, th);
}

// ---- the parts, in millimeters ----
// The real sizes. The gears are measured by their module (the pitch diameter at the teeth's outer end, divided by
// the tooth count): 1 mm on the cube, 0.9 mm on the octahedron, both standard sizes. That sets how many
// millimeters one unit of the picture is, a little under 10 for the cube and a little over 10 for the octahedron.
// Each gear turns on a 681XZZ ball bearing (shielded; 1.5 mm bore, 4 mm across, 2 mm wide, seven 0.6 mm balls: the
// maker's catalog, nsk.com, 681XZZMC3P6), bought, not made.
export const unitMM = (sh) => MODULE[sh.solid] * sh.teeth / (2 * Math.sin(sh.alpha));
export const MM = {
  bearing: { d: 1.5, D: 4, B: 2, innerOD: 2.3, outerID: 3.25, balls: 7, ball: 0.6, pitch: 2.75 },
  spacer: { od: 2.2, id: 1.6 },
  // a shoulder screw: slotted flange, a boss that bears on the bearing's inner ring (so the flange clears the gear),
  // a shoulder the bearing's inner ring sits on, and an M1.4 thread into the core
  screw: { flange: 6, thick: 0.8, boss: 2.2, bossH: 0.3, shoulder: 1.5, thread: 1.4, pitch: 0.3, threadL: 2.5, slot: 0.4, slotD: 0.35, clamp: 0.05 },
  tap: { drill: 1.1, depth: 3, drillDepth: 3.6 },
  // the core: center to a gear's face; each edge cut back by a 45° chamfer (cube, its leg) or to a flat this wide
  // (octahedron); and the octahedron's six corners cut flat, this far from the center
  core: { cube: 4.5, octa: 5.5 },
  chamfer: { cube: 0.6, octa: 1.2 },
  corner: { octa: 7 },
};
// A screw moves along its axis only by turning: one turn for each pitch. Backing out (a right-hand thread) it turns
// counterclockwise seen from its head, until its thread has left the hole. out: how far it has come out, in mm. Radians,
// right hand about the outward axis.
export const screwTurn = (out) => 2 * Math.PI * Math.min(Math.max(0, out), MM.screw.threadL) / MM.screw.pitch;
// a gear blank's outline in its own frame (r out from the axis, z along it, from the solid's center), in units.
// The teeth's outer ends lie on the back cone and their inner ends on the front cone: both square to the pitch
// cone, as on any bevel gear. Tip: the teeth's tops; root: the bottom of the gaps.
export function blank(sh) {
  const pr = sh.profile, a = pr.alpha;
  const at = (th, R) => { const rho = R / Math.cos(th - a); return { r: rho * Math.sin(th), z: rho * Math.cos(th) }; };
  return { tipOut: at(pr.tip, R_OUT), rootOut: at(pr.root, R_OUT), tipIn: at(pr.tip, R_IN), rootIn: at(pr.root, R_IN),
    pitchOut: at(a, R_OUT), pitchIn: at(a, R_IN) };
}
// distance from the center along a tooth's line at polar angle th, at the back (R_OUT) or front (R_IN) cone
export const endAt = (pr, th, R) => R / Math.cos(th - pr.alpha);

// Each gear is a thin brass disc with its teeth on the rim, turning on a ball bearing fitted into its middle
// (flush with the outer face). A shoulder screw through the bearing holds it to the brass core, with a spacer
// between the bearing's inner ring and the core. The core is the solid itself, its edges cut back so that they
// clear the teeth. Sizes here are in units of the teeth's outer end; MM above has them in millimeters.
export function parts(sh) {
  const u = unitMM(sh), b = blank(sh), B = MM.bearing, S = MM.screw;
  const front = b.rootOut.z, back = b.rootIn.z, core = MM.core[sh.solid] / u;
  return { u, front, back, core, rootR: b.rootOut.r,
    bearing: { outer: B.D / 2 / u, inner: B.d / 2 / u, innerOD: B.innerOD / 2 / u, outerID: B.outerID / 2 / u, ball: B.ball / 2 / u, pitch: B.pitch / 2 / u, balls: B.balls, width: B.B / u, mid: front - B.B / 2 / u },
    washer: { outer: MM.spacer.od / 2 / u, inner: MM.spacer.id / 2 / u, top: front - B.B / u },
    screw: { flange: S.flange / 2 / u, thick: S.thick / u, boss: S.boss / 2 / u, bossH: S.bossH / u, post: S.shoulder / 2 / u, thread: S.thread / 2 / u,
      shoulderEnd: core + S.clamp / u, into: S.threadL / u, slot: S.slot / u, slotD: S.slotD / u } };
}
export function bodyPlanes(sh) {
  const P = parts(sh), u = P.u, all = [...sh.normals, ...sh.plainNormals], planes = all.map((n) => ({ n, d: P.core, kind: 'face' }));
  // cut back every edge, across the line from the center through its middle. A chamfer of width w across a
  // sharp edge at distance e from the center sits at e - (w / 2) tan(alpha), alpha being half the angle between
  // the two faces' normals.
  const near = Math.max(...all.flatMap((a, i) => all.filter((_, j) => j !== i).map((b) => dot(a, b))));
  const w = sh.solid === 'cube' ? MM.chamfer.cube * Math.SQRT2 : MM.chamfer.octa;
  const e = P.core / Math.cos(sh.alpha), d = e - w / 2 / u * Math.tan(sh.alpha);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (dot(all[i], all[j]) > near - 1e-9) planes.push({ n: norm(add(all[i], all[j])), d, kind: 'edge' });
  // the octahedron's corners, cut flat: it is made from a cube of brass this size
  if (sh.solid === 'octa') for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) planes.push({ n, d: MM.corner.octa / u, kind: 'corner' });
  return planes;
}
export const insideBody = (planes, p) => planes.every((q) => dot(q.n, p) <= q.d + 1e-9);

// the body's faces, each a polygon (corners in order, counterclockwise seen from outside) with its outward normal
export function bodyFaces(planes) {
  const out = [];
  for (const q of planes) {
    const a = norm(Math.abs(q.n[0]) < 0.9 ? cross(q.n, [1, 0, 0]) : cross(q.n, [0, 1, 0])), b = cross(q.n, a), c = scale(q.n, q.d), S = 10;
    let poly = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([u, v]) => add(c, add(scale(a, u), scale(b, v))));
    for (const r of planes) {
      if (r === q) continue;
      const next = [];
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], s = poly[(k + 1) % poly.length], dp = dot(r.n, p) - r.d, ds = dot(r.n, s) - r.d;
        if (dp <= 0) next.push(p);
        if ((dp < 0 && ds > 0) || (dp > 0 && ds < 0)) { const f = dp / (dp - ds); next.push(add(p, scale(add(s, scale(p, -1)), f))); }
      }
      poly = next;
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) out.push({ n: q.n, poly, kind: q.kind });
  }
  return out;
}
