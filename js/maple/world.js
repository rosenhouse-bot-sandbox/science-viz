// The whole maple as one nested model, drawn with one camera: the lawn and far hills, the tree and
// its leaves, the followed leaf with a small window cut in it, the cells in the wall of that
// window, one cell's chloroplasts and vacuole, one chloroplast's stacks of membrane, and the
// pigment molecules on one membrane and in the vacuole. Each part is built at its true size in its
// own units (metres, leaf lengths, micrometres, nanometres) and placed inside the part above.
import { program, instanced, ball, tube, square, box, add, sub, mul, dot, cross, unit, len, quatOf, qmul, qaxis, qrot, qconj, qalong, rng } from './gl.js?v=389d1a6f';
import * as SH from './shaders.js?v=389d1a6f';
import { leafRGB, pigments, bandTable, wavelengthRGB, encode, clamp, smooth, mix, NM0, NSTEP, sunAt, thickness } from './model.js?v=389d1a6f';
import { buildTree, leafShape, place, SPOT, LOBES, DROOP, bladeAt, foldOf, FOLD } from './tree.js?v=389d1a6f';
import { pigmentShapes } from './molecules.js?v=389d1a6f';

// The leaf cut through, in micrometres. In the frame of the cut: x runs along the wall of the window,
// y into the leaf behind the wall, z up through the leaf's thickness. (0, CELL_Y, 0) is the middle of the followed cell.
export const SEC = { top: 35, skin: 21.5, tall: 41, r: 5.5, pitch: 12.4, loose: -27, lower: -91, bottom: -101, veinX: 92, veinZ: -53, veinR: 21, veinEvery: 390, pore: 47.5, poreEvery: 76 };
export const CUT = { half: 420, slide: 0.3 };              // the cells built reach this many micrometres either side of the followed cell along the cut; and how far apart the two parts of the cut leaf are moved, in leaf lengths
const CELL_Y = 6, WALL_R = 3.85;                           // the followed cell's middle is 6 um behind the wall; chloroplasts sit 3.85 um from a cell's axis
const PLASTID = [0, CELL_Y - WALL_R, 0], MEMBRANE_Y = PLASTID[1] - 0.0785;   // the followed chloroplast, and the outer face of its middle stack
export const TARGETS = { membrane: [0, MEMBRANE_Y, 0], vacuole: [0, CELL_Y, 0] };
const NORTH = [0.541, 0.841], WEST = [0.841, -0.541];      // compass points on the ground (x, z): the afternoon Sun is to the right, beyond the tree
const NEAR_NM = 11.5, VAC_NM = 15, VAC_PITCH = 4.2, PITCH = 2.9;

const hash = (i, j) => { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const ID = [0, 0, 0, 1];
class Batch { constructor() { this.a = []; } add(p, q, s, c, m) { this.a.push(p[0], p[1], p[2], q[0], q[1], q[2], q[3], s[0], s[1], s[2], c[0], c[1], c[2], c[3], m[0], m[1], m[2]); } data() { return new Float32Array(this.a); } }
const LAYOUT = [3, 4, 3, 4, 3];

export function makeWorld(gl) {
  const tree = buildTree(), L = tree.leaves, F = tree.focus, fi = L.indexOf(F);
  L.splice(fi, 1); L.push(F);                             // the followed leaf last, so the others can be drawn without it
  const S = L.map(() => ({})), fo = S[S.length - 1];
  const DEEP = gl.getParameter(gl.DEPTH_BITS) >= 24;
  const prog = { sky: program(gl, SH.SKY_VS, SH.SKY_FS), land: program(gl, SH.LAND_VS, SH.LAND_FS), leaf: program(gl, SH.LEAF_VS, SH.LEAF_FS), solid: program(gl, SH.SOLID_VS, SH.SOLID_FS), memb: program(gl, SH.MEMB_VS, SH.MEMB_FS) };
  const M = { box: box(), ball3: ball(3), ball4: ball(4), ball1: ball(1), ball2: ball(2), tube: tube(8, 1, false), disc: tube(20, 1, true), stick: tube(6, 1, false), sq: square(), ring: tube(96, 1, false) };
  const INK = { chl: leafRGB({ chl: 1, car: 0, anth: 0 }, 1, 2.4), car: leafRGB({ chl: 0, car: 1.3, anth: 0 }, 1, 1.9), anth: leafRGB({ chl: 0, car: 0, anth: 1 }, 1, 2.3) };

  // ---- shapes used once ---------------------------------------------------------------------------
  const quad = instanced(gl, M.sq, [3]); quad.set(new Float32Array([0, 0, 0]));
  const ringMesh = instanced(gl, M.ring, [3]); ringMesh.set(new Float32Array([0, 0, 0]));
  // a leaf: each lobe is a strip between its two edges
  function leafMesh(lobes, fine) {
    const P = [], I = [], lobeOf = [];
    lobes.forEach((pts, li) => { const n = pts.length / 2 - 1, b = P.length / 3; for (const p of pts) { P.push(p[0], p[1], 0); lobeOf.push(li); } for (let i = 0; i < n; i++) { const a0 = b + i, a1 = b + i + 1, b0 = b + 2 * n + 1 - i, b1 = b + 2 * n - i; I.push(a0, a1, b1, a0, b1, b0); } });
    if (fine) {                                            // the blade is curved, and flat triangles cut across the curve: split every long edge, most finely round the window
      const mid = new Map(), want = (a, b) => { const mx = (P[a * 3] + P[b * 3]) / 2 - SPOT[0], my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2 - SPOT[1]; const r = Math.hypot(mx, my); return r < 0.02 ? 0.003 : r < 0.08 ? 0.012 : 0.045; };
      const L = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1]);
      const m = (a, b) => { const key = a < b ? a * 65536 + b : b * 65536 + a; if (!mid.has(key)) { mid.set(key, P.length / 3); lobeOf.push(lobeOf[a]); P.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, 0); } return mid.get(key); };
      const todo = []; for (let i = 0; i < I.length; i += 3) todo.push([I[i], I[i + 1], I[i + 2]]);
      I.length = 0;
      while (todo.length) {
        const [a, b, c] = todo.pop(), e = [[a, b, c], [b, c, a], [c, a, b]].map(([u, v, w]) => [L(u, v) / want(u, v), u, v, w]).sort((x, y) => y[0] - x[0])[0];
        if (e[0] <= 1) { I.push(a, b, c); continue; }
        const n = m(e[1], e[2]); todo.push([e[1], n, e[3]], [n, e[2], e[3]]);
      }
      if (P.length / 3 > 65535) throw new Error('leaf mesh too fine: ' + P.length / 3);
    }
    const nor = new Float32Array(P.length); lobeOf.forEach((li, k) => { nor[k * 3] = li; });   // which lobe each point is on, for the fold of a young leaf
    return { pos: new Float32Array(P), nor, idx: new Uint16Array(I) };
  }
  const leaves = instanced(gl, leafMesh(leafShape.mid), [3, 4, 4]), leafData = new Float32Array(L.length * 11);
  const oneLeaf = instanced(gl, leafMesh(leafShape.toothed, true), [3, 4, 4]);
  // the face of the cut, away from the middle where the cells are built one by one: a ribbon as deep as the leaf is thick, wherever the cut line crosses the blade
  const cutFace = (() => {
    const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c; return c; };
    const lobeAt = (x, y) => { let best = -1, bs = 9; LOBES.forEach((l, li) => { const sd = Math.abs(y * Math.cos(l.a) - x * Math.sin(l.a)); if (sd < bs && inPoly(leafShape.toothed[li], x, y)) { best = li; bs = sd; } }); return best; };   // where two lobes overlap, the one whose middle vein is nearer: it lies on top when the leaf is folded
    const P = [], I = [], Lb = [], X = cutLocalAlong(), STEP = 0.002; let prev = -1;
    for (let t = -1.2; t <= 1.2; t += STEP) {
      const x = SPOT[0] + X[0] * t, y = SPOT[1] + X[1] * t, on = lobeAt(x, y);
      if (on >= 0) { const b = P.length / 3; P.push(x, y, 0, x, y, 1); Lb.push(on, 0, 0, on, 0, 0); if (prev === on) I.push(b - 2, b - 1, b, b, b - 1, b + 1); }
      prev = on;
    }
    const m = instanced(gl, { pos: new Float32Array(P), nor: new Float32Array(Lb), idx: new Uint16Array(I) }, [3, 4, 4]); m.set(new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]));
    return m;
  })();
  const stalks = instanced(gl, M.tube, LAYOUT), stalkData = new Float32Array(L.length * 17);
  const lobeAngles = new Float32Array(LOBES.map((l) => l.a));
  const lobeDirs = new Float32Array(LOBES.flatMap((l) => [Math.cos(l.a) * l.len, Math.sin(l.a) * l.len]));

  // ---- the tree's branches ------------------------------------------------------------------------
  const branches = instanced(gl, M.tube, LAYOUT);
  { const b = new Batch();
    for (const s of tree.segs) { const d = sub(s.b, s.a), l = len(d), thin = clamp(1 - s.w0 / 0.02); b.add(mul(add(s.a, s.b), 0.5), qalong(d), [s.w0 / 2, s.w0 / 2, l / 2 + s.w0 * 0.2], [0.23 + 0.1 * thin, 0.17 + 0.02 * thin, 0.16, s.w1 / s.w0], [0, 0, 0]); }
    branches.set(b.data()); }

  // ---- the cut leaf: cells, in micrometres ----------------------------------------------------------
  const cells = { ball1: new Batch(), ball2: new Batch(), caps: new Batch(), disc: new Batch(), glassBall: new Batch(), glassCaps: new Batch(), vacBall: new Batch(), vacCaps: new Batch(), env: new Batch(), back: new Batch(), ball3: new Batch(), glassCapsFine: new Batch(), vacCapsFine: new Batch() };
  // behind the four rows of cells that are drawn, the rest of the leaf: one dark slab
  cells.back.add([0, CELL_Y + 3 * 10.8 + 7.5, (SEC.top + SEC.bottom) / 2 - 2], [0, 0, 0, 1], [CUT.half + 44, 1.2, (SEC.top - SEC.bottom) / 2 - 9], [0, 0, 0, 1], [15, 0, 0]);
  cells.back.add([0, CELL_Y + 3 * 10.8 + 7.5, (SEC.top + SEC.skin) / 2 - 1], [0, 0, 0, 1], [CUT.half + 44, 1.2, (SEC.top - SEC.skin) / 2 + 1], [0.4, 0.46, 0.4, 1], [15, 0, 0]);   // and behind the upper skin, more skin
  const veinNear = (x) => SEC.veinX + Math.round((x - SEC.veinX) / SEC.veinEvery) * SEC.veinEvery;
  const poreNear = (x) => SEC.pore + Math.round((x - SEC.pore) / SEC.poreEvery) * SEC.poreEvery;
  const toneOf = (x, low) => Math.round(clamp(1 - Math.abs(x - veinNear(x)) / 75) * 3) + (low ? 4 : 0);   // cells beside a vein run a few days behind; loose cells make little anthocyanin
  const WALL = [0.86, 0.94, 0.82, 0.035], rotZ = (a) => qaxis([0, 0, 1], a), toX = qaxis([0, 1, 0], Math.PI / 2);
  // where cells are: behind the wall of the window, and behind its two side walls. Each gives a place and how many cells deep it is from a cut face.
  const lane = { tall: [], loose: [] };                   // the front row of cells, for the dots of sunlight: each cell's middle and the chloroplasts on its near side
  const sites = [], EDGE_I = Math.floor((CUT.half + 35) / SEC.pitch);     // the cells drawn reach a little way past the window; the leaf's surface hides the rest
  for (let r = 0; r < 4; r++) for (let i = -EDGE_I; i <= EDGE_I; i++) sites.push({ x: i * SEC.pitch + (r & 1) * 6.2, y: CELL_Y + r * 10.8, row: r, i });
  for (const s of sites) {
    const main = s.row === 0 && s.i === 0 && s.y === CELL_Y, half = main ? SEC.tall / 2 : SEC.tall / 2 - 1.5 * hash(s.i, 77 + s.row), cz = SEC.tall / 2 - half, tone = toneOf(s.x, false), pos = [s.x, s.y, cz];
    const cellRec = s.row === 0 && Math.abs(s.i) < 500 ? { x: s.x, y: s.y, z0: cz - half + 3.4, z1: cz + half - 3.4, plast: [] } : null; if (cellRec) lane.tall.push(cellRec);
    const close = s.row < 2 && Math.abs(s.i) <= 3;          // the cells the zoom passes close to are built from finer shapes
    (close ? cells.glassCapsFine : cells.glassCaps).add(pos, ID, [SEC.r * 0.97, SEC.r * 0.97, half], WALL, [1, 0, 0]);
    (close ? cells.vacCapsFine : cells.vacCaps).add(pos, ID, [2.3, 2.3, half - 3.2], [0, 0, 0, 1], [2, 0, tone]);
    const rings = s.row < 2 ? 7 : 4, per = s.row < 2 ? 5 : 3, big = s.row < 2 ? 1 : 1.45;
    for (let j = 0; j < rings; j++) for (let m = 0; m < per; m++) {
      const a = -Math.PI / 2 + (m + ((main ? j + 1 : j) & 1) * 0.5) * 2 * Math.PI / per + (main ? 0 : (hash(s.i * 7 + j, m + s.row * 3) - 0.5) * 0.5), z = cz + (j - (rings - 1) / 2) * (2 * half - 5) / rings + (main ? 0 : (hash(s.i * 9 + j, m) - 0.5) * 1.2);
      const p = [s.x + Math.cos(a) * WALL_R, s.y + Math.sin(a) * WALL_R, z], q = rotZ(a), sc = [1.2 * big, 2.2 * big, 2.5 * big];
      if (cellRec && Math.sin(a) < -0.25) cellRec.plast.push(p);
      if (!main) { (close ? cells.ball3 : cells.ball1).add(p, q, sc, [0, 0, 0, 1], [4, 0, tone]); continue; }
      // the followed cell's chloroplasts are built in full: a clear envelope round stacks of membrane
      const followed = j === 3 && m === 0, rnd = rng(1000 + j * 10 + m);
      cells.env.add(p, q, sc, [0, 0, 0, 1], [6, 0, tone]);
      for (let g = 0; g < 26; g++) {
        const v = (rnd() - 0.5) * 3.0, w = (rnd() - 0.5) * 4.2, u = (rnd() - 0.5) * 1.1, rad = 0.17 + 0.07 * rnd(), hh = 0.05 + 0.08 * rnd(), th = 0.06 + 0.9 * rnd();
        if ((u / 0.78) ** 2 + (v / 1.55) ** 2 + (w / 2.1) ** 2 > 1 || (followed && Math.hypot(v, w) < 0.47)) continue;
        cells.disc.add(add(p, qrot(q, [u, v, w])), qmul(q, toX), [rad, rad, hh], [0, 0, 0, 1], [5, th, 0]);
      }
      for (let g = 0; g < 16; g++) {                      // drops of fat that fill with carotenoids as the stacks are taken apart
        const v = (rnd() - 0.5) * 3.2, w = (rnd() - 0.5) * 4.2, u = (rnd() - 0.5) * 1.3, rad = 0.2 + 0.16 * rnd();
        if ((u / 0.85) ** 2 + (v / 1.7) ** 2 + (w / 2.1) ** 2 > 1 || (followed && Math.hypot(v, w) < 0.5)) continue;
        cells.ball3.add(add(p, qrot(q, [u, v, w])), ID, [rad, rad, rad], [0, 0, 0, 1], [14, 0.1 + 0.8 * rnd(), tone]);
      }
      if (followed) for (let k = 0; k < 7; k++) {         // single sheets of the same membrane run out from the stack's edge to the stacks round it
        const a = k * 2.4 + 0.4, l = 0.3 + 0.12 * rnd(), lq = qmul(qmul(q, toX), rotZ(a));
        cells.disc.add(add(p, qrot(lq, [0.2 + l, 0, 0.012 + 0.02 * k])), lq, [l, 0.07 + 0.05 * rnd(), 0.0045], [0, 0, 0, 1], [5, 0.15 + 0.1 * k, 0]);
      }
      if (followed) for (let k = 0; k < 8; k++) cells.disc.add(add(p, qrot(q, [(3.5 - k) * 0.02, 0, 0])), qmul(q, toX), [0.24, 0.24, 0.0085], [0, 0, 0, 1], [5, k === 0 ? -1 : 0.1 * k, 0]);   // the stack the zoom goes into; its outer disc stays to the end
    }
  }
  // loose cells with air between them, below the tall ones
  const loose = (x, y, r, i, j) => {
    if (hash(i * 3 + 1 + r * 131, j * 7 + 2) < 0.26) return;
    const cx = x + (hash(i, r + 30 + j) - 0.5) * 6, cy = y + (hash(i + 17, j + r) - 0.5) * 5, cz = SEC.loose - 5 - r * 13 + (hash(i + 60, r + j * 5) - 0.5) * 5, rad = 5.6 + 2.4 * hash(i - 7, r + 3 + j);
    if (Math.hypot(cx - veinNear(cx), cz - SEC.veinZ) < SEC.veinR + rad - 1 && y > 0) return;
    if (cz < -70 && Math.abs(cx - poreNear(cx)) < 11) return;                              // the air chamber above each pore
    const tone = toneOf(cx, true), q = qaxis(unit([hash(i, j) - 0.5, hash(j, i + 5) - 0.5, 1]), hash(i + 4, r) * 3), sc = [rad * 1.12, rad, rad * 0.92];
    cells.glassBall.add([cx, cy, cz], q, sc, WALL, [1, 0, 0]);
    cells.vacBall.add([cx, cy, cz], q, mul(sc, 0.48), [0, 0, 0, 1], [2, 0, tone]);
    const rec = j === 0 ? { x: cx, y: cy, z0: cz, z1: cz, plast: [] } : null; if (rec) lane.loose.push(rec);
    for (let k = 0; k < 6; k++) { const d = unit([hash(i * 5 + k, j + r * 9) - 0.5, hash(i + k * 3, j * 5 + r) - 0.5, hash(i - k, j - r * 3) - 0.5]); const cp = add([cx, cy, cz], qrot(q, [d[0] * (sc[0] - 1.5), d[1] * (sc[1] - 1.5), d[2] * (sc[2] - 1.5)])); if (rec) rec.plast.push(cp); cells.ball1.add(cp, qmul(q, qalong(d)), [1.6, 2.0, 1.0], [0, 0, 0, 1], [4, 0, tone]); }
  };
  for (let r = 0; r < 5; r++) {
    for (let d = 0; d < 3; d++) for (let i = -34; i <= 34; i++) loose((i + (r & 1) * 0.5) * 17, 8 + d * 15, r, i, d);
  }
  // the two skins: one layer of clear cells each, with pores in the lower one
  const skin = (x, y, i, j) => {
    const up = [x + (hash(i, 5 + j) - 0.5) * 4, y + (hash(j, i + 9) - 0.5) * 4, (SEC.top + SEC.skin) / 2];
    cells.glassBall.add(up, ID, [11.2, 11.2, (SEC.top - SEC.skin) / 2 + 0.6], [0.9, 0.95, 0.88, 0.1], [1, 0, 0]);
    const lowZ = (SEC.lower + SEC.bottom) / 2, pore = Math.abs(x - poreNear(x)) < 9.5 && (j & 1) === 0;
    if (!pore) { cells.glassBall.add([x, y, lowZ], ID, [10.2, 10.2, 5.4], [0.9, 0.95, 0.88, 0.1], [1, 0, 0]); return; }
    for (const g of [1, -1]) { const p = [poreNear(x) + g * 2.9, y, lowZ]; cells.glassBall.add(p, ID, [1.9, 5.2, 3.6], WALL, [1, 0, 0]); cells.ball1.add(p, ID, [1.0, 3.6, 2.2], [0, 0, 0, 1], [4, 0, 4]); }   // a pore: a gap between two small cells that hold chloroplasts
  };
  for (let j = 0; j < 3; j++) for (let i = -30; i <= 30; i++) skin(i * 19, 9 + j * 19, i, j);
  // veins: water pipes (thick walls) above, sugar pipes (small) below, inside a ring of cells. They run back from the wall.
  for (let v = veinNear(-CUT.half - 20); v <= CUT.half + 20; v += SEC.veinEvery) {
    const along = qaxis([1, 0, 0], -Math.PI / 2);                                           // turns z to point along y
    for (let k = 0; k < 12; k++) for (let j = 0; j < 3; j++) { const a = k * 6.283 / 12; cells.glassCaps.add([v + (SEC.veinR - 5) * Math.cos(a), 11 + j * 21, SEC.veinZ + (SEC.veinR - 5) * Math.sin(a)], along, [4.3, 4.3, 10.2], [0.9, 0.95, 0.88, 0.12], [1, 0, 0]); }
    for (let k = 0; k < 7; k++) { const a = 0.5 + k * 0.36, d = k % 2 ? 4.2 : 9; cells.caps.add([v + d * Math.cos(a), 28, SEC.veinZ + 1 + d * Math.sin(a) * 0.9], along, [2.7 - 0.25 * (k % 3), 2.7 - 0.25 * (k % 3), 29], [0.86, 0.8, 0.6, 1], [0, 0, 0]); }
    for (let k = 0; k < 16; k++) { const a = 3.45 + (k % 8) * 0.35, d = k < 8 ? 4.5 : 8.6; cells.caps.add([v + d * Math.cos(a), 28, SEC.veinZ - 1.5 + d * Math.sin(a) * 0.85], along, [1.5, 1.5, 29], [0.55, 0.66, 0.5, 1], [0, 0, 0]); }
  }
  const capsuleMesh = (sides, rings) => {                  // a ball cut at its middle; the shader pulls the halves apart into a capsule
    const P = [], N = [], I = [];
    for (const sg of [1, -1]) { const b = P.length / 3;
      for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) { const t = j / rings * Math.PI / 2, a = i / sides * 6.2832, n = [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), sg * Math.sin(t)]; P.push(n[0], n[1], n[2] + sg); N.push(...n); }
      for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) { const a = b + j * (sides + 1) + i, c = a + sides + 1; sg > 0 ? I.push(a, a + 1, c, c, a + 1, c + 1) : I.push(a, c, a + 1, c, c + 1, a + 1); } }
    for (let i = 0; i < sides; i++) { const a = i, c = (rings + 1) * (sides + 1) + i; I.push(a, c, a + 1, c, c + 1, a + 1); }
    return { pos: new Float32Array(P), nor: new Float32Array(N), idx: new Uint16Array(I) };
  };
  const capsule = capsuleMesh(12, 4), capsuleFine = capsuleMesh(48, 10);
  const mk = (mesh, batch) => { const o = instanced(gl, mesh, LAYOUT); o.set(batch.data()); return o; };
  const C = { back: mk(M.box, cells.back), ball1: mk(M.ball1, cells.ball1), caps: mk(capsule, cells.caps), disc: mk(M.disc, cells.disc), glassBall: mk(M.ball2, cells.glassBall), glassCaps: mk(capsule, cells.glassCaps), vacBall: mk(M.ball1, cells.vacBall), vacCaps: mk(capsule, cells.vacCaps), env: mk(M.ball4, cells.env), ball3: mk(M.ball3, cells.ball3), glassCapsFine: mk(capsuleFine, cells.glassCapsFine), vacCapsFine: mk(capsuleFine, cells.vacCapsFine) };

  // ---- molecules, in nanometres -------------------------------------------------------------------
  const EL_PALE = { C: [[0.86, 0.84, 0.88], 0.062], O: [[0.36, 0.02, 0.1], 0.075] };   // in the red water of the vacuole the usual greys and reds would not show
  const shapes = pigmentShapes(), EL = { C: [[0.32, 0.35, 0.38], 0.062], N: [[0.3, 0.45, 1.0], 0.075], O: [[1.0, 0.3, 0.24], 0.075], Mg: [[0.85, 1.0, 0.78], 0.13] };
  function molecule(balls, sticks, shape, at, q, kind, th, id, ink, el = EL) {
    for (const [a, b] of shape.conj) { const d = [b[0] - a[0], b[1] - a[1], 0], l = len(d); sticks.add(add(at, qrot(q, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0])), qmul(q, qalong(d)), [0.052, 0.052, l / 2], [ink[0], ink[1], ink[2], 1], [kind, th, id]); }
    for (const [a, b] of shape.rest) { const d = [b[0] - a[0], b[1] - a[1], 0], l = len(d); sticks.add(add(at, qrot(q, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0])), qmul(q, qalong(d)), [0.02, 0.02, l / 2], [...el.C[0].map((v) => Math.min(1, v * 1.9)), 0], [kind, th, id]); }
    for (const a of shape.atoms) { const [c, r] = el[a.el]; balls.add(add(at, qrot(q, [a.p[0], a.p[1], 0])), ID, [r, r, r], [c[0], c[1], c[2], 0], [kind, th, id]); }
  }
  // on the membrane: chlorophylls and carotenoids, about three to one. Those near the middle are built atom by atom; the rest, far off, are flat outlines.
  const mem = { balls: new Batch(), sticks: new Batch(), flat: new Batch(), list: [] };
  for (let j = -84; j <= 84; j++) for (let i = -84; i <= 84; i++) {
    const h = hash(i * 3 + 1, j * 5 + 2), first = i === 0 && j === 0, th = first ? 0 : 0.04 + 0.92 * hash(i + 77, j - 19);
    const x = first ? 0 : (i + (hash(i, j + 3) - 0.5) * 0.45) * PITCH, y = first ? 0 : (j + (hash(i + 9, j) - 0.5) * 0.45) * PITCH, r = Math.hypot(x, y);
    if (r > 236 || (!first && h > 0.9)) continue;
    const isChl = first || h < 0.66, q = first ? qmul(rotZ(0.5), qaxis([1, 0, 0], 0.5)) : qmul(rotZ(hash(i - 5, j + 13) * 6.283), qaxis([1, 0, 0], 0.35 + 0.75 * hash(i + 31, j - 7))), at = [x, y, 0.62];
    if (r < NEAR_NM && mem.list.length < 63) { const id = mem.list.length; mem.list.push({ x, y, z: at[2], kind: isChl ? 'chl' : 'car', th: isChl ? th : th * 0.9, id }); molecule(mem.balls, mem.sticks, isChl ? shapes.chl : shapes.car, at, q, isChl ? 7 : 8, isChl ? th : th * 0.9, id, isChl ? INK.chl : INK.car); }
    else if (isChl) mem.flat.add(at, q, [0.5, 0.5, 1], [...INK.chl, 1], [10, th, 0]);
    else mem.flat.add(at, q, [1.2, 0.05, 1], [...INK.car, 1], [11, th * 0.9, 0]);
  }
  // in the vacuole: anthocyanin in water, drawn far more crowded than it is
  const vac = { balls: new Batch(), sticks: new Batch(), list: [] };
  { const n = Math.ceil(VAC_NM / VAC_PITCH), all = [];
    for (let k = -n; k <= n; k++) for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const first = !i && !j && !k, p = first ? [0, 0, 0] : [(i + (hash(i, j * 7 + k) - 0.5) * 0.7) * VAC_PITCH, (j + (hash(j, k * 5 + i) - 0.5) * 0.7) * VAC_PITCH, (k + (hash(k, i * 3 + j) - 0.5) * 0.7) * VAC_PITCH];
      if (len(p) < VAC_NM && (first || len(p) > 3.2) && (first || hash(i * 11 + k, j * 13 - k) < 0.8)) all.push({ p, th: first ? 0.02 : 0.04 + 0.92 * hash(i + 77 + k * 3, j - 19), q: first ? qmul(rotZ(0.3), qaxis([1, 0, 0], 0.45)) : qaxis(unit([hash(i, j) - 0.5, hash(j, k) - 0.5, hash(k, i) - 0.5]), hash(i + j, k) * 6.283) });
    }
    all.sort((a, b) => len(a.p) - len(b.p));
    all.forEach((m, n2) => { const id = Math.min(n2, 63); if (n2 < 63) vac.list.push({ x: m.p[0], y: m.p[1], z: m.p[2], kind: 'anth', th: m.th, id }); molecule(vac.balls, vac.sticks, shapes.anth, m.p, m.q, 9, m.th, id, INK.anth.map((v) => mix(v, 1, 0.82)), EL_PALE); }); }   // drawn pale so that it shows against the red of the water round it
  // Beyond those, out to a quarter of a micrometre: the same molecules as flat outlines, thinning with distance, so that the water is not empty on the way in
  const vacFar = new Batch();
  for (const [r0, r1, pitch] of [[VAC_NM, 40, 5.5], [40, 100, 7.5], [100, 250, 10]]) { const n = Math.ceil(r1 / pitch), pale = INK.anth.map((v) => mix(v, 1, 0.82));
    for (let k = -n; k <= n; k++) for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const p = [(i + (hash(i + r0, j * 7 + k) - 0.5) * 0.8) * pitch, (j + (hash(j, k * 5 + i + r0) - 0.5) * 0.8) * pitch, (k + (hash(k + r0, i * 3 + j) - 0.5) * 0.8) * pitch], r = len(p);
      if (r < r0 || r >= r1 || hash(i * 11 + k, j * 13 - k + r0) > 0.8) continue;
      vacFar.add(p, qaxis(unit([hash(i, j + r0) - 0.5, hash(j, k) - 0.5, hash(k, i + r0) - 0.5]), hash(i + j, k + r0) * 6.283), [0.62, 0.24, 1], [...pale, 1], [16, 0.04 + 0.92 * hash(i + 77 + k * 3, j - 19 + r0), 0]);
    } }
  const N = { vacFar: mk(M.sq, vacFar), memBalls: mk(M.ball1, mem.balls), memSticks: mk(M.stick, mem.sticks), memFlat: mk(M.sq, mem.flat), vacBalls: mk(M.ball1, vac.balls), vacSticks: mk(M.stick, vac.sticks), light: instanced(gl, M.sq, LAYOUT), sun: instanced(gl, M.sq, LAYOUT), rings: instanced(gl, M.sq, LAYOUT) };

  // ---- light: dots that each stand for a little light of one wavelength ---------------------------
  const PH = 34, photons = Array.from({ length: PH }, () => ({ y: 99 })), flash = new Float32Array(64), R = rng(77);
  const absorbs = (kind, l) => { const t = bandTable(kind), i = clamp(Math.round((l - NM0) / NSTEP), 0, t.length - 1); let mx = 0; for (let k = 0; k < t.length; k++) mx = Math.max(mx, t[k]); return 1 - Math.exp(-3 * t[i] / mx); };
  const fresh = (p, where, spread) => { p.l = 400 + 300 * R(); p.c = wavelengthRGB(p.l).map((v) => encode(v * 1.7)); p.x = (R() - 0.5) * 2 * (where === 'membrane' ? 5 : 4.5); p.z = where === 'membrane' ? 0.45 + 0.9 * R() : (R() - 0.5) * 5; p.y = spread ? (R() - 0.5) * 32 : 16; p.tried = -1; };
  let lightWhere = '';
  // Moves the light on by dt seconds. Light comes down through the leaf, which is along -y here. p: the followed leaf's pigments.
  function stepLight(dt, where, p) {
    if (where !== lightWhere) { lightWhere = where; for (const ph of photons) fresh(ph, where, true); flash.fill(0); }
    const list = where === 'membrane' ? mem.list : vac.list, amount = { chl: p.chl, car: p.car, anth: p.anth };
    for (let i = 0; i < 64; i++) flash[i] *= Math.exp(-dt * 2.6);
    for (const ph of photons) {
      const y0 = ph.y; ph.y -= dt * 7;
      for (const m of list) {
        if (m.y > y0 || m.y <= ph.y || m.id === ph.tried || amount[m.kind] < m.th + 0.06) continue;
        if (Math.hypot(ph.x - m.x, where === 'membrane' ? 0 : ph.z - m.z) > (m.kind === 'car' ? 1.0 : 0.8)) continue;
        ph.tried = m.id;
        if (R() < absorbs(m.kind, ph.l)) { flash[m.id] = 1; fresh(ph, where, false); break; }
      }
      if (ph.y < -16) fresh(ph, where, false);
    }
  }
  const lightData = new Float32Array(PH * 17);
  function loadLight() { if (cam.where !== lightWhere) { lightWhere = cam.where; for (const ph of photons) fresh(ph, cam.where, true); flash.fill(0); }
    photons.forEach((ph, i) => lightData.set([ph.x, ph.y, ph.z, 0, 0, 0, 1, 0.24, 0.24, 1, ph.c[0], ph.c[1], ph.c[2], 1, 12, 0, 0], i * 17)); N.light.set(lightData, gl.DYNAMIC_DRAW); }

  // ---- sunlight coming down through the cut leaf, in micrometres ------------------------------------
  // Each dot stands for a little sunlight of one wavelength. Whether the leaf's pigments take it in, how deep and which pigment,
  // is drawn by lot when it sets out, with the chances the model gives that wavelength in a leaf holding the day's pigments
  // (model.js, thickness): chlorophyll and carotenoids take it at a chloroplast, anthocyanin in a vacuole. The rest comes out underneath.
  const SUN_N = 80, SUN_X = [-75, 155], SUN_TOP = 62, SUN_END = -128, SUN_V = 27, SUN_R = 2.7, DIE = 0.45;   // how many, where along the wall, from and to what height, micrometres a second, a dot's radius, seconds a flash lasts
  const SHARE = { chl: 0.7, car: 0.7, anth: 0.83 };       // how much of each pigment is in the tall cells; the rest is in the loose cells below
  const beams = Array.from({ length: SUN_N }, () => ({})), RS = rng(311), sunData = new Float32Array(SUN_N * 17);
  const nearest = (list, x) => { let b = list[0]; for (const c of list) if (Math.abs(c.x - x) < Math.abs(b.x - x)) b = c; return b; };
  function freshBeam(b, p) {
    b.l = 400 + 300 * RS(); b.c = wavelengthRGB(b.l).map((v) => encode(v * 1.7)); b.dying = 0; b.kind = '';
    b.x = mix(SUN_X[0], SUN_X[1], RS()); b.y = 1.5 + 7 * RS(); b.z = b.z0 = SUN_TOP + RS() * 30; b.end = SUN_END;
    const t = thickness(p, b.l), tall = t.chl * SHARE.chl + t.car * SHARE.car + t.anth * SHARE.anth, all = t.chl + t.car + t.anth, u = -Math.log(1 - RS());
    if (u >= all) return;                                  // it gets through
    const up = u < tall, part = PIGS.map((k) => t[k] * (up ? SHARE[k] : 1 - SHARE[k])); let r = RS() * (part[0] + part[1] + part[2]), k = 0; while (k < 2 && r >= part[k]) { r -= part[k]; k++; }
    const cell = nearest(up ? lane.tall : lane.loose, b.x), depth = up ? mix(SEC.tall / 2 - 1.5, 1.5 - SEC.tall / 2, u / tall) : 0;
    b.kind = PIGS[k];
    if (k === 2) { b.x = cell.x + (RS() - 0.5) * 2; b.y = cell.y - 1; b.end = up ? clamp(depth, cell.z0, cell.z1) : cell.z0 + (RS() - 0.5) * 5; }
    else { let c = cell.plast[0]; if (up) { for (const q of cell.plast) if (Math.abs(q[2] - depth) < Math.abs(c[2] - depth)) c = q; } else c = cell.plast[Math.floor(RS() * cell.plast.length)]; b.x = c[0] + (RS() - 0.5) * 1.2; b.y = c[1]; b.end = c[2] + (RS() - 0.5) * 2; }
  }
  const PIGS = ['chl', 'car', 'anth'];
  let beamsSet = false;
  // Moves the sunlight on by dt seconds. p: the followed leaf's pigments.
  function stepSun(dt, p) {
    if (!beamsSet) { beamsSet = true; for (const b of beams) freshBeam(b, p); for (let i = 0; i < 400; i++) stepSun(0.05 * (0.5 + RS()), p); }   // run on unseen first, so that the light is already falling all the way down when it is first shown
    for (const b of beams) {
      if (b.dying) { b.dying += dt / DIE; if (b.dying >= 1) freshBeam(b, p); continue; }
      b.z -= dt * SUN_V;
      if (b.z > b.end) continue;
      if (b.kind && p[b.kind] > 0.001) { b.z = b.end; b.dying = 1e-6; } else if (b.kind) { b.kind = ''; b.end = SUN_END; } else freshBeam(b, p);
    }
  }
  function loadSun(k) {                                    // k: how strongly the dots are drawn. A dot comes into sight above the leaf and goes out of sight below it gradually.
    beams.forEach((b, i) => { const t = b.dying, r = SUN_R * (1 + 2.2 * t), v = k * (t ? 1.5 * (1 - t) * (1 - t) : smooth((b.z0 - b.z) / 18) * smooth((b.z - SUN_END) / 18)); sunData.set([b.x, b.y, b.z, 0, 0, 0, 1, r, r, 1, b.c[0] * v, b.c[1] * v, b.c[2] * v, 1, 12, 0, 0], i * 17); });
    N.sun.set(sunData, gl.DYNAMIC_DRAW);
  }

  // ---- the season -----------------------------------------------------------------------------------
  let day = -1; const tmp = { chl: 0, car: 0, anth: 0 }, pal = { body: new Float32Array(32), dot: new Float32Array(32), vac: new Float32Array(32), size: new Float32Array(8) };
  const focusAt = (dd) => dd ? pigments(day + dd, F.T) : fo.p;
  const shade = (dd, k = 1) => { const p = pigments(day + dd, F.T); tmp.chl = p.chl; tmp.car = p.car; tmp.anth = p.anth; return leafRGB(tmp).map((v) => clamp(v * k)); };
  const sun = { dir: [0, 1, 0], light: [0, 1, 0], up: 0, ground: [1, 0], sin: 0 };
  function update(d) {
    if (d === day) return; day = d;
    { const s = sunAt(d), hx = Math.cos(s.az) * NORTH[0] + Math.sin(s.az) * WEST[0], hz = Math.cos(s.az) * NORTH[1] + Math.sin(s.az) * WEST[1], e = Math.max(s.el, 0.07);   // once the Sun is down the sky above it still lights the tree
      sun.dir = [hx * Math.cos(s.el), Math.sin(s.el), hz * Math.cos(s.el)]; sun.light = [hx * Math.cos(e), Math.sin(e), hz * Math.cos(e)]; sun.ground = [hx, hz]; sun.sin = Math.sin(s.el); sun.up = smooth(sun.sin / 0.36); }
    for (let i = 0; i < L.length; i++) {
      const l = L[i], o = place(l, d, S[i]), c = leafRGB(o.p), lit = 0.86 + 0.28 * l.r3, sc = l.len * o.size, k = i * 11;
      leafData.set(o.pos, k); leafData.set(o.q, k + 3); leafData[k + 7] = c[0] * lit; leafData[k + 8] = c[1] * lit; leafData[k + 9] = c[2] * lit; leafData[k + 10] = sc;
      const m = l.pl * o.size, back = qrot(o.q, [-1, 0, 0]), foot = o.state ? add(o.pos, mul(back, m)) : l.node, dv = sub(o.pos, foot), dl = len(dv) || 1e-6;   // the stalk falls with the leaf
      const w = 0.00055 * (0.4 + 0.6 * o.size);
      stalkData.set([(foot[0] + o.pos[0]) / 2, (foot[1] + o.pos[1]) / 2, (foot[2] + o.pos[2]) / 2, ...qalong(dv), w, w, dl / 2, 0.62 * lit, 0.2 * lit, 0.2 * lit, 1, 0, 0, 0], i * 17);
    }
    leaves.set(leafData, gl.DYNAMIC_DRAW); stalks.set(stalkData, gl.DYNAMIC_DRAW);
    oneLeaf.set(new Float32Array([0, 0, 0, 0, 0, 0, 1, ...leafData.subarray((L.length - 1) * 11 + 7, L.length * 11 - 1), 1]), gl.DYNAMIC_DRAW);
    // the colours of a cell's parts, for cells near a vein (which run behind) and far from one, tall and loose
    for (let key = 0; key < 8; key++) {
      const p = focusAt(-2.5 * (key & 3)), share = key < 4 ? 1 : 0.2, pl = { chl: p.chl, car: p.car, anth: 0 }, vc = { chl: 0, car: 0, anth: p.anth * share };
      const body = leafRGB(pl, 2.0, 1.9), dotc = leafRGB(pl, 3.4, 1.6), v = leafRGB(vc, 1.25, 1.9);
      pal.body.set([...body, 1], key * 4); pal.dot.set([...dotc, 1], key * 4); pal.vac.set([...v, 0.05 + 0.9 * vc.anth], key * 4); pal.size[key] = mix(0.7, 1, smooth(p.chl * 1.6));
    }
  }

  function cutLocalAlong() { const n0 = unit([2 * DROOP * SPOT[0], 2 * DROOP * SPOT[1], 1]), wl = qrot(qconj(F.q), F.look), Y = unit(sub(wl, mul(n0, dot(wl, n0)))), X = cross(Y, n0); return unit([X[0], X[1], 0]); }
  // ---- frames -----------------------------------------------------------------------------------------
  // The followed leaf, and the frame of the cut in it (x along the wall, y into the leaf, z up through it), in the world.
  const cutLocal = { along: cutLocalAlong(), q: ID, y: [0, 1, 0], n: [0, 0, 1], top: [0, 0, 0], fold: -1 };   // the frame of the cut, in the leaf's own axes; it turns with the blade while a young leaf is still folded
  function setCut(fold) {
    if (fold === cutLocal.fold) return; cutLocal.fold = fold;
    const e = 1e-4, A = cutLocal.along, p0 = bladeAt(SPOT[0], SPOT[1], 0, fold), tx = sub(bladeAt(SPOT[0] + A[0] * e, SPOT[1] + A[1] * e, 0, fold), p0), ty = sub(bladeAt(SPOT[0] - A[1] * e, SPOT[1] + A[0] * e, 0, fold), p0);
    let n = unit(cross(tx, ty)); if (n[2] < 0) n = mul(n, -1);
    const X = unit(tx), Y = cross(n, X);
    cutLocal.q = quatOf(X, Y, n); cutLocal.y = Y; cutLocal.n = n; cutLocal.top = p0; cutLocal.stretch = len(tx) / e;   // the blade's curve stretches the drawn surface a little along the cut, most while it hangs folded
  }
  setCut(0);
  const SKIN_GAP = 1.5;                                    // the tops of the skin cells lie this far (micrometres) under the leaf's drawn surface, which stands for its waxy coat
  function frames(calm, cut = 0) {                         // cut: how far the part of the leaf beyond the cut has been moved off, in leaf lengths
    const unit = 1e-6 * Math.sqrt(fo.size);                 // a young leaf's cells are smaller: the cut and its cells are drawn at the square root of the leaf's size
    const fold = foldOf(fo.size); setCut(fold);
    const q = calm ? fo.calm : fo.q, sc = F.len * fo.size, tq = qmul(q, cutLocal.q), top = add(fo.pos, qrot(q, mul(add(cutLocal.top, mul(cutLocal.y, cut)), sc)));
    return { leafPos: fo.pos, leafQ: q, leafScale: sc, cutQ: tq, unit, cutO: sub(top, mul(qrot(tq, [0, 0, 1]), (SEC.top + SKIN_GAP) * unit)), centre: add(fo.pos, qrot(q, mul(bladeAt(0.42, 0, 0, fold), sc))), fold };
  }

  // ---- drawing ----------------------------------------------------------------------------------------
  const mv = new Float32Array(16), pm = new Float32Array(16), ray = new Float32Array(9), sunV = new Float32Array(3), n3 = new Float32Array(9);
  let cam = null;
  // Sets the camera for one part of the model: where its own origin is, how it is turned, the size of its unit in metres,
  // and the nearest and farthest distances drawn, in metres.
  let gq = ID;
  function group(o, q, s, near, far, keepDepth) {
    gq = q;
    const ax = [qrot(q, [1, 0, 0]), qrot(q, [0, 1, 0]), qrot(q, [0, 0, 1])], rel = sub(o, cam.eye);
    for (let i = 0; i < 3; i++) { mv[i * 4] = dot(ax[i], cam.r) * s; mv[i * 4 + 1] = dot(ax[i], cam.u) * s; mv[i * 4 + 2] = dot(ax[i], cam.b) * s; mv[i * 4 + 3] = 0; }
    mv[12] = dot(rel, cam.r); mv[13] = dot(rel, cam.u); mv[14] = dot(rel, cam.b); mv[15] = 1;
    pm.fill(0); pm[0] = cam.P00; pm[5] = cam.P11; pm[8] = -cam.ox; pm[9] = -cam.oy; pm[10] = (far + near) / (near - far); pm[11] = -1; pm[14] = 2 * far * near / (near - far);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) n3[i * 3 + j] = mv[i * 4 + j] / s;
    if (!keepDepth) gl.clear(gl.DEPTH_BUFFER_BIT);
  }
  const use = (p) => { gl.useProgram(p.p); if (p.u.uMV) gl.uniformMatrix4fv(p.u.uMV, false, mv); if (p.u.uP) gl.uniformMatrix4fv(p.u.uP, false, pm); if (p.u.uSun) gl.uniform3fv(p.u.uSun, sunV); return p.u; };
  const solid = (shape, fog) => { const u = use(prog.solid); gl.uniform1i(u.uShape, shape); gl.uniform4fv(u.uCamQ, qmul(qconj(gq), cam.q)); gl.uniform1f(u.uFogMax, 0); gl.uniform4fv(u.uBody, pal.body); gl.uniform4fv(u.uDot, pal.dot); gl.uniform4fv(u.uVac, pal.vac); gl.uniform1fv(u.uSize, pal.size); gl.uniform3f(u.uPig, fo.p.chl, fo.p.car, fo.p.anth); gl.uniform1fv(u.uFlash, flash); gl.uniform4fv(u.uFog, fog || [0, 0, 0, 0]); gl.uniform1f(u.uFade, 1); gl.uniform1f(u.uLum, 1); gl.uniform1f(u.uBend, 0); gl.uniform1f(u.uNear, 0); return u; };
  let baking = false;                                      // while the picture of the cut face is taken, how clear each part is is kept too
  const blend = (on, additive) => { if (on) { gl.enable(gl.BLEND); if (baking) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); } };

  function drawCells(sol) {
    sol(0); C.back.draw(); C.ball1.draw(); C.ball3.draw(); C.disc.draw(); sol(1); C.caps.draw();
    blend(true);
    sol(1); C.vacCaps.draw(); C.vacCapsFine.draw(); sol(0); C.vacBall.draw(); C.env.draw();
    sol(1); C.glassCaps.draw(); C.glassCapsFine.draw(); sol(0); C.glassBall.draw();
    blend(false);
  }
  // The face of the cut is far longer than the stretch of it whose cells are built. The rest shows a picture of those same cells, taken
  // square on to the face with no perspective, and repeated along the cut. It is taken again whenever the date changes.
  const FACE = { w: 2048, h: 320, half: (EDGE_I + 0.5) * SEC.pitch, day: NaN, tex: null, fbo: null };
  function bakeFace(f) {
    // the picture is taken along the same slant the camera looks down the face at, so that the rows of cells behind the front one show through the clear skin as they do in the cells that are built
    const eye = mul(qrot(qconj(f.cutQ), sub(cam.eye, f.cutO)), 1 / f.unit), slant = Math.round(clamp((eye[2] - (SEC.top + SEC.bottom) / 2) / Math.min(eye[1], -1e-6), -1.2, 0.4) * 40) / 40;
    if (FACE.day === day && FACE.slant === slant) return; FACE.day = day; FACE.slant = slant;
    if (!FACE.tex) {
      FACE.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, FACE.tex); gl.texStorage2D(gl.TEXTURE_2D, 12, gl.RGBA8, FACE.w, FACE.h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      FACE.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, FACE.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, FACE.tex, 0);
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, FACE.w, FACE.h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, FACE.fbo); gl.viewport(0, 0, FACE.w, FACE.h);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const was = cam, wasQ = gq, bq = qmul(f.cutQ, quatOf([1, 0, 0], [0, 0, 1], [0, -1, 0]));     // looking into the face: x along it, the leaf's upper side up
    cam = { ...cam, q: bq, r: qrot(bq, [1, 0, 0]), u: qrot(bq, [0, 1, 0]), b: qrot(bq, [0, 0, 1]) }; gq = f.cutQ;
    sunV.set([dot(sun.light, cam.r), dot(sun.light, cam.u), dot(sun.light, cam.b)]);
    const FAR = 20000, zc = (SEC.top + SEC.bottom) / 2, hh = (SEC.top - SEC.bottom) / 2 + SKIN_GAP, a = -2 / 120;       // seen from so far off that every line of sight is as good as parallel
    mv.fill(0); mv[0] = 1; mv[6] = -1; mv[9] = 1; mv[13] = -zc; mv[14] = -FAR; mv[15] = 1;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) n3[i * 3 + j] = mv[i * 4 + j];
    mv[5] = -slant;
    pm.fill(0); pm[0] = 1 / FACE.half; pm[5] = 1 / hh; pm[10] = a; pm[14] = -1 + a * (FAR - 30); pm[15] = 1;      // from 30 micrometres in front of the face to 90 behind it
    baking = true; drawCells((shape) => solid(shape, null)); baking = false;
    gl.bindTexture(gl.TEXTURE_2D, FACE.tex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); cam = was; gq = wasQ;
    sunV.set([dot(sun.light, cam.r), dot(sun.light, cam.u), dot(sun.light, cam.b)]); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  // view: { eye, q (the camera's turn: its x is right, y up, z back toward the viewer), W, H, dpr, P11, ox, oy, k (pixels per metre at what it looks at), dist, where, light }
  function draw(view) {
    cam = { ...view, r: qrot(view.q, [1, 0, 0]), u: qrot(view.q, [0, 1, 0]), b: qrot(view.q, [0, 0, 1]), P00: view.P11 * view.H / view.W };
    sunV.set([dot(sun.light, cam.r), dot(sun.light, cam.u), dot(sun.light, cam.b)]);
    const lum = mix(1, 1.25, sun.up), dayMix = (a, b) => a.map((v, i) => mix(v, b[i], sun.up));   // the higher the Sun, the brighter the daylight
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.clearColor(0.02, 0.03, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const f = frames(false, view.cut || 0), um = view.k * f.unit, kn = view.k * 1e-9, d = view.dist, diag = Math.hypot(view.W, view.H), rings = new Batch();
    if (view.cut > 0) bakeFace(f);
    const ring = (at, r, unitPx) => { const px = r * unitPx; if (px < 0.4 || px > diag) return; rings.add(at, ID, [r, r, 1], [1, 1, 1, Math.min(1, px / 3.2)], [13, 1 / px, 0]); };
    const drawRings = (unitPx) => { if (!rings.a.length) return; N.rings.set(rings.data(), gl.DYNAMIC_DRAW); solid(2); gl.disable(gl.DEPTH_TEST); blend(true); N.rings.draw(); blend(false); gl.enable(gl.DEPTH_TEST); rings.a.length = 0; };

    // the sky
    { const u = use(prog.sky); for (let i = 0; i < 3; i++) { ray[i] = cam.r[i] / cam.P00; ray[3 + i] = cam.u[i] / cam.P11; ray[6 + i] = -cam.b[i] - cam.r[i] * cam.ox / cam.P00 - cam.u[i] * cam.oy / cam.P11; }
      gl.uniformMatrix3fv(u.uRay, false, ray); gl.uniform3fv(u.uSunW, sun.dir); gl.uniform1f(u.uDay, sun.up); gl.depthMask(false); quad.draw(); gl.depthMask(true); }

    // the park and the tree, in metres
    group([0, 0, 0], ID, 1, clamp(d * 0.05, 1e-3, 2), 400);
    { const u = use(prog.land); gl.uniform1i(u.uKind, 1);
      gl.uniform4f(u.uShape, 150, 30, 1.3, 0); gl.uniform3fv(u.uTint, dayMix([0.114, 0.13, 0.31], [0.27, 0.41, 0.56])); ringMesh.draw();
      gl.uniform4f(u.uShape, 95, 17, 4.0, 0); gl.uniform3fv(u.uTint, dayMix([0.047, 0.067, 0.15], [0.1, 0.24, 0.2])); ringMesh.draw();
      gl.uniform1i(u.uKind, 0); gl.uniform4f(u.uShape, 200, 0, 0, 0); gl.uniform1f(u.uLum, mix(1, 1.9, sun.up)); gl.uniform3fv(u.uHaze, dayMix([0.2, 0.2, 0.3], [0.38, 0.53, 0.66]));
      const s = Math.max(sun.sin, 0.05);                    // the crown's middle is about 2.6 m up, so its shadow lies that far over the Sun's height off, and is stretched by as much
      gl.uniform4f(u.uShade, sun.ground[0], sun.ground[1], Math.min(2.6 * Math.sqrt(1 - s * s) / s, 40), 0.55 * smooth(sun.sin / 0.12)); gl.uniform1f(u.uShadeL, Math.min(2.7 / s, 40)); quad.draw(); }
    gl.uniform1f(solid(0).uLum, lum); branches.draw(); if (0.0011 * view.k > 0.2) stalks.draw();
    { const u = use(prog.leaf); gl.uniform1f(u.uLum, lum); gl.uniform1f(u.uDroop, DROOP); gl.uniform1i(u.uDetail, 0); gl.uniform2fv(u.uLobe, lobeDirs); gl.uniform1fv(u.uLobeA, lobeAngles); gl.uniform3f(u.uFold, f.fold, FOLD.turn, FOLD.hang); gl.uniform1f(u.uVeinW, 0.011);
      gl.bindVertexArray(leaves.vao); gl.drawElementsInstanced(gl.TRIANGLES, leaves.n, gl.UNSIGNED_SHORT, 0, L.length - 1); }
    ring(f.centre, 0.17, view.k); drawRings();

    // the followed leaf, in leaf lengths
    const leafDetail = () => { const u = use(prog.leaf); gl.uniform1f(u.uLum, lum); gl.uniform1f(u.uDroop, DROOP); gl.uniform1i(u.uDetail, 1); gl.uniform2fv(u.uLobe, lobeDirs); gl.uniform1fv(u.uLobeA, lobeAngles); gl.uniform3f(u.uFold, f.fold, FOLD.turn, FOLD.hang);
      const mm = 1e-3 / f.leafScale, hl = f.unit / f.leafScale;
      gl.uniform1f(u.uVeinW, 0.011); gl.uniform1f(u.uSideW, 0.004); gl.uniform1f(u.uNetW, 0.016 * mm); gl.uniform1f(u.uNetCell, 0.55 * mm);
      gl.uniform3fv(u.uEarly, shade(-5, 1.08)); gl.uniform3fv(u.uLate, shade(4, 0.84)); gl.uniform3fv(u.uVein, shade(-9, 1.22));
      gl.uniform2f(u.uCutO, SPOT[0], SPOT[1]); gl.uniform2f(u.uCutX, cutLocal.along[0], cutLocal.along[1]);
      gl.uniform3fv(u.uThick, mul(cutLocal.n, (SEC.top - SEC.bottom + 2 * SKIN_GAP) * hl)); gl.uniform1f(u.uMic, hl / cutLocal.stretch); gl.uniform1f(u.uCells, FACE.half - 8);                // the picture begins a little inside the last built cells and in front of them, so that no gap opens between the two from any side
      if (!(view.cut > 0)) { gl.uniform1i(u.uKeep, 0); gl.uniform3f(u.uSlide, 0, 0, 0); oneLeaf.draw(); return; }
      // the leaf is cut across: the part beyond the cut is moved off along the leaf, and its cut face shows the layers inside
      gl.uniform1i(u.uKeep, 1); gl.uniform3fv(u.uSlide, mul(cutLocal.y, view.cut)); oneLeaf.draw();
      gl.uniform1i(u.uDetail, 2); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FACE.tex); gl.uniform1i(u.uFace, 0); gl.uniform1f(u.uFaceHalf, FACE.half); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); cutFace.draw(); gl.disable(gl.BLEND); gl.uniform1i(u.uDetail, 1);
      gl.uniform1i(u.uKeep, -1); gl.uniform3f(u.uSlide, 0, 0, 0); oneLeaf.draw(); };
    group(f.leafPos, f.leafQ, f.leafScale, Math.max(d * 0.05, 2e-5), Math.max(d * 40, 1));
    leafDetail();

    // the cells round the window, in micrometres. The leaf's surface is laid down again first, unseen, so that it hides the cells under it.
    const cn = Math.max(d * 0.05, DEEP ? 2e-11 : 2e-8), cf = Math.max(d * 60, 3e-3);   // near enough for the molecules on the membrane too, where the screen can tell such depths apart
    group(f.leafPos, f.leafQ, f.leafScale, cn, cf);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);                             // the surface wins wherever a cell's top comes level with it
    gl.colorMask(false, false, false, false); leafDetail(); gl.colorMask(true, true, true, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    group(f.cutO, f.cutQ, f.unit, cn, cf, true);
    // Inside the followed cell's vacuole the view is through its water: the deeper in, the more the water's own colour hides the cell round it.
    const eyeC = mul(qrot(qconj(f.cutQ), sub(cam.eye, f.cutO)), 1 / f.unit), deep = Math.min(2.3 - Math.hypot(eyeC[0], eyeC[1] - TARGETS.vacuole[1]), SEC.tall / 2 - 3.2 - Math.abs(eyeC[2]));
    const vt = pal.vac.subarray(0, 4), water = [mix(0.6, vt[0] * 0.8, vt[3]), mix(0.68, vt[1] * 0.8, vt[3]), mix(0.6, vt[2] * 0.8, vt[3]), 1 / (0.5 * f.unit)];
    const bend = DROOP * (1 + FOLD.hang * f.fold) * f.unit / f.leafScale;             // the blade's curve, in the cut's own units: a young leaf is as curved as a grown one but its cells are nearly as big, so it matters most in spring
    const sol = (shape) => { const u = solid(shape, deep > 0 ? water : null); if (deep > 0) gl.uniform1f(u.uFogMax, deep * 3 * f.unit); gl.uniform1f(u.uBend, bend); return u; };
    if (um > 0.002) {
      drawCells(sol);
    }
    // the sunlight coming down through the cells: dots, far too small to see from the Leaf scale and too big to draw from close to
    { const px = SUN_R * um, k = 1 - smooth((px - 48) / 45);
      if (view.light && beamsSet && px > 0.25 && k > 0) { loadSun(k); solid(2); gl.disable(gl.DEPTH_TEST); blend(true, true); N.sun.draw(); blend(false); gl.enable(gl.DEPTH_TEST); } }
    ring([0, 0, SEC.top], 700, um); ring(TARGETS.vacuole, 45, um); drawRings();
    // the molecules, in nanometres. Nothing is switched on at a zoom: what is smaller than a pixel shows only as its share of that pixel.
    if (kn > 0.004) {
      const tq = f.cutQ, at = (p) => add(f.cutO, qrot(tq, mul(p, f.unit)));
      const nq = qmul(tq, quatOf([1, 0, 0], [0, 0, 1], [0, -1, 0]));                       // on the membrane: x along it, y up it (toward the top of the leaf), z out of it toward the window
      const near = Math.max(d * 0.05, 2e-11), far = Math.max(d * 60, 1e-6), fog = [0, 0, 0, 1 / 120e-9];   // the water's own colour hides what is more than a hundred or so nanometres off
      const fade = smooth((kn - 0.3) / 1.5), seeThrough = (on) => { if (on) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND); };
      if (DEEP) group(at([0, MEMBRANE_Y - 0.0003, 0]), nq, 1e-9, cn, cf, true); else group(at([0, MEMBRANE_Y - 0.0003, 0]), nq, 1e-9, near, far);   // the membrane is the face of a stack inside a chloroplast: what is in front of it hides it
      { const u = use(prog.memb); gl.uniform1f(u.uR, 240); gl.uniform1f(u.uChl, fo.p.chl); gl.uniformMatrix3fv(u.uN, false, n3); gl.uniform3fv(u.uTint, pal.dot.subarray(0, 3).map((v) => v * 1.2 / 0.85)); quad.draw(); }
      blend(true); solid(0); N.memFlat.draw(); blend(false);
      if (fade > 0) { seeThrough(fade < 1); gl.uniform1f(solid(0).uFade, fade); N.memBalls.draw(); N.memSticks.draw(); seeThrough(false); }
      if (view.light && view.where === 'membrane') { loadLight(); solid(2); blend(true, true); N.light.draw(); blend(false); }
      if (view.where === 'membrane') ring([0, 0, 0], 340, kn); drawRings();
      group(at(TARGETS.vacuole), nq, 1e-9, Math.max(d * 0.55, 2e-11), far);
      seeThrough(true); if (d < 1.5e-6) { gl.uniform1f(solid(0, fog).uNear, Math.max(d * 0.55, 2e-11)); gl.depthMask(false); N.vacFar.draw(); gl.depthMask(true); } gl.uniform1f(solid(0, fog).uNear, Math.max(d * 0.55, 2e-11)); N.vacBalls.draw(); N.vacSticks.draw(); seeThrough(false);
      if (view.light && view.where === 'vacuole') { loadLight(); solid(2); blend(true, true); N.light.draw(); blend(false); }
      if (view.where === 'vacuole') ring([0, 0, 0], 340, kn); drawRings();
    }
    gl.bindVertexArray(null);
  }
  return { tree, update, draw, frames, focus: () => fo, focusAt, stepLight, stepSun, sun, count: L.length, INK, flash };
}
