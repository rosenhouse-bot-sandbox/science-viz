// Gears on a cube and an octahedron: how each part is made, setup by setup, tool by tool, pass by pass. Sizes come
// from spec.js. The machines are an ordinary small shop's: a lathe with a 3-jaw chuck, a collet chuck and a
// tailstock, and a knee mill whose head tilts, with a vise, a 5C spin indexer and a tilting dividing head.
//
// Lathe passes are in the part's own frame: z along its axis, r out from it. A setup says which way the part
// faces (dir +1: its +z end toward the tailstock) and where the chuck's jaws end (zJaw). Mill passes are in the
// part's frame too; a setup says how the part sits on the machine (rot: part to machine) and how far the head
// is tilted. Speeds are real; feeds are real, in mm a second.
import { by, SHOWN, gearSpec, spacerSpec, screwSpec, coreSpec, stockOf } from './spec.js?v=04d3d5af';
import { norm, cross, dot } from './model.js?v=04d3d5af';

const D = Math.PI / 180;
// spindle speed for a cut at surface speed v (m/min) on diameter d (mm), within what the machine can do
const LATHE_MAX = 2500, MILL_MAX = 4000;
const rpm = (v, d, max) => Math.min(max, Math.round(1000 * v / (Math.PI * d) / 50) * 50);
const lrpm = (d, v = 60) => rpm(v, d, LATHE_MAX), mrpm = (d, v = 60) => rpm(v, d, MILL_MAX);
const perRev = (f, n) => f * n / 60;            // feed in mm a revolution to mm a second
const steps = (from, to, cut) => { const n = Math.max(1, Math.ceil(Math.abs(from - to) / cut - 1e-9)), out = []; for (let k = 1; k <= n; k++) out.push(from + (to - from) * k / n); return out; };

// ---- lathe parts ----
// roughing passes down a straight line from (z0, r0) to (z1, r1), each pass offset out from it, then the finish pass
function taper(z0, r0, z1, r1, depth, cut, feed, side = 1) {
  const l = Math.hypot(z1 - z0, r1 - r0), nz = -(r1 - r0) / l * side, nr = (z1 - z0) / l * side, out = [];
  for (const off of steps(depth, 0, cut)) out.push({ k: 'turn', pts: [[z0 + nz * off, r0 + nr * off], [z1 + nz * off, r1 + nr * off]], feed });
  return out;
}
// how far the expanding mandrel's shoulder stands out from the chuck's jaws: far enough that the tool post, which
// reaches 7 mm toward the chuck past the tool's point, stays clear of the jaws while the tool works on the gear
export const MANDREL = 24;
function gearPlan(sh) {
  const g = gearSpec(sh), st = stockOf('gear', sh), R0 = st.d / 2, a = g.alpha;
  const T = g.tipOut, B = g.rootOut, Ti = g.tipIn, Bi = g.rootIn, zo = g.zo, zi = g.zi, rb = g.bore / 2;
  const cutZ = Ti.z - 0.3;                         // where it is parted off, leaving 0.3 to face in the second setup
  const n1 = lrpm(st.d), nD = lrpm(3.8, 40), nR = lrpm(4, 15);
  // the back cone, extended past the tips so that the tool runs out clear: from below the tip corner up to the outer face
  const bc = (r) => B.z + (B.r - r) / Math.tan(Math.PI / 2 - a);           // z on the back cone at radius r
  const fc = (r) => Bi.z + (Bi.r - r) / Math.tan(Math.PI / 2 - a);         // z on the front cone at radius r
  const face = (r) => Ti.z + (r - Ti.r) * (T.z - Ti.z) / (T.r - Ti.r);       // z on the face cone (the teeth's tops) at radius r
  const op1 = {
    machine: 'lathe', hold: 'chuck', dir: 1, zJaw: zo - 16, stock: { r: R0, free: zo + 0.5 }, title: 'Lathe: outer side',
    steps: [
      { title: 'Face the end', line: `Takes 0.5 off the sawn end. This face is the gear's outer side.`, tool: { type: 'turn' }, rpm: n1,
        passes: [{ k: 'face', z: zo, r0: R0 + 0.5, r1: 0, feed: perRev(0.05, n1) }] },
      { title: 'Turn the outside', line: `Ø${(2 * R0).toFixed(0)} down to Ø${g.od.toFixed(2)}, the teeth's tips.`, tool: { type: 'turn' }, rpm: n1,
        passes: steps(R0, T.r, 0.4).map((r) => ({ k: 'turn', pts: [[zo + 0.2, r], [cutZ - 1.6, r]], feed: perRev(0.06, n1) })) },
      { title: 'Turn the back cone', line: `Compound set to ${(90 - a / D).toFixed(2)}°.`, tool: { type: 'turn', compound: Math.PI / 2 - a }, rpm: n1,
        passes: taper(bc(T.r + 0.3), T.r + 0.3, zo + 0.02, B.r - 0.02 * Math.tan(a), (T.r - B.r) * Math.cos(a), 0.35, perRev(0.04, n1)) },
      { title: 'Center drill', line: 'A No. 1 center drill, so the drill starts true.', tool: { type: 'center', d: 1 }, rpm: LATHE_MAX,
        passes: [{ k: 'drill', z0: zo + 1, z1: zo - 1.2, d: 2.5, pilot: 1, feed: perRev(0.02, LATHE_MAX) }] },
      { title: 'Drill Ø3.8', line: `Through, past where it will be parted off. Peck to clear the chips.`, tool: { type: 'drill', d: 3.8 }, rpm: nD,
        passes: [{ k: 'drill', z0: zo + 1, z1: cutZ - 2.5, d: 3.8, feed: perRev(0.05, nD) }] },
      { title: 'Ream Ø4 H7', line: 'Slow, for a round, smooth bore. The bearing goes in here.', tool: { type: 'reamer', d: 4 }, rpm: nR,
        passes: [{ k: 'bore', pts: [[zo + 1, rb], [cutZ - 1.5, rb]], feed: perRev(0.1, nR) }] },
      { title: 'Part off', line: `A 1 mm blade, 0.3 longer than the gear.`, tool: { type: 'part', w: 1 }, rpm: lrpm(st.d, 30),
        passes: [{ k: 'part', z: cutZ, w: 1, r0: R0 + 0.3, r1: rb - 0.2, feed: perRev(0.02, lrpm(st.d, 30)) }] },
    ],
  };
  const n2 = lrpm(g.od);
  const recess = steps(Ti.z, zi, 0.35);
  const op2 = {
    machine: 'lathe', hold: 'mandrel', dir: -1, zJaw: zo + MANDREL, title: 'Lathe: inner side, on a mandrel',
    steps: [
      { title: 'Face to the teeth\'s ends', line: 'A 4 mm expanding mandrel holds it by the bore.', tool: { type: 'turn' }, rpm: n2,
        passes: [{ k: 'face', z: Ti.z, r0: T.r + 0.5, r1: rb + 0.2, feed: perRev(0.04, n2) }] },
      { title: 'Turn the teeth\'s tops', line: `Compound set to ${(g.tip / D).toFixed(2)}°.`, tool: { type: 'turn', compound: g.tip }, rpm: n2,
        passes: taper(Ti.z - 0.3 * Math.cos(g.tip), Ti.r - 0.3 * Math.sin(g.tip), T.z + 0.02 * Math.cos(g.tip), T.r + 0.02 * Math.sin(g.tip), (T.r - Ti.r) * Math.cos(g.tip) + 0.05, 0.35, perRev(0.04, n2)) },
      { title: 'Cut the recess', line: `${(zi - Ti.z).toFixed(2)} deep, from the outside in. Too small for a square bit.`, tool: { type: 'boring' }, rpm: n2,
        passes: recess.map((z) => ({ k: 'faceIn', z, r0: Math.min(Ti.r - 0.05, Bi.r + (zi - z) * Math.tan(Math.PI / 2 - a)) - 0.3, r1: rb + 0.1, feed: perRev(0.04, n2) })) },
      { title: 'Turn the front cone', line: `Compound set to ${(90 - a / D).toFixed(2)}°, the other way.`, tool: { type: 'boring', compound: -(Math.PI / 2 - a) }, rpm: n2,
        passes: [{ k: 'bore', pts: [[Ti.z - 0.02, Ti.r + 0.02], [zi, Bi.r]], feed: perRev(0.03, n2) }] },
    ],
  };
  // the teeth: a form cutter, one gap at a time. The dividing head is tilted to the root angle, so that the bottom of
  // each gap runs level under the cutter.
  const nC = mrpm(40, 30), gaps = [];
  for (let k = 0; k < g.N; k++) gaps.push({ k: 'gap', gap: k, side: 0, feed: 0.8 });
  const op3 = {
    machine: 'mill', hold: 'dividing', tilt: g.root, title: 'Mill: the teeth, in the dividing head',
    steps: [
      { title: 'Cut the first gap', line: `Module ${g.m} cutter, No. ${g.cutter}. Head tilted ${(g.root / D).toFixed(2)}°.`, tool: { type: 'gearcutter', d: 40, w: 4 }, rpm: nC,
        passes: [gaps[0], { k: 'gap', gap: 0, side: 1, feed: 0.8 }, { k: 'gap', gap: 0, side: -1, feed: 0.8 }] },
      { title: `Index and cut the rest`, line: `${g.N - 1} more gaps, ${360 / g.N % 1 ? (360 / g.N).toFixed(2) : 360 / g.N}° apart. Each gets a middle pass, then one each side.`, tool: { type: 'gearcutter', d: 40, w: 4 }, rpm: nC,
        passes: gaps.slice(1).flatMap((p) => [p, { ...p, side: 1 }, { ...p, side: -1 }]) },
    ],
  };
  return [op1, op2, op3];
}

function spacerPlan(sh) {
  const s = spacerSpec(sh), L = s.L, R0 = 1.5, n = LATHE_MAX, nd = lrpm(1.6, 40);
  return [{
    machine: 'lathe', hold: 'collet', dir: 1, zJaw: -6, stock: { r: R0, free: L + 0.3 }, title: 'Lathe: from 3 mm rod, in a collet',
    steps: [
      { title: 'Face the end', line: 'Ø3 rod in a 3 mm collet.', tool: { type: 'turn' }, rpm: n, passes: [{ k: 'face', z: L, r0: R0 + 0.3, r1: 0, feed: perRev(0.03, n) }] },
      { title: 'Center drill', line: 'No. 00 center drill, just deep enough for the drill to start.', tool: { type: 'center', d: 0.5 }, rpm: n, passes: [{ k: 'drill', z0: L + 1, z1: L - 0.5, d: 1.2, pilot: 0.5, feed: perRev(0.01, n) }] },
      { title: 'Drill Ø1.6', line: 'Through, and 1.5 past.', tool: { type: 'drill', d: 1.6 }, rpm: nd, passes: [{ k: 'drill', z0: L + 1, z1: -1.8, d: 1.6, feed: perRev(0.02, nd) }] },
      { title: `Turn to Ø${s.od}`, line: 'One pass.', tool: { type: 'turn' }, rpm: n, passes: [{ k: 'turn', pts: [[L + 0.2, s.od / 2], [-1.4, s.od / 2]], feed: perRev(0.03, n) }] },
      { title: 'Chamfer', line: '0.1 × 45°, inside and out.', tool: { type: 'turn' }, rpm: n, passes: [{ k: 'turn', pts: [[L + 0.05, s.od / 2 - 0.15], [L - 0.15, s.od / 2 + 0.05]], feed: perRev(0.02, n) }, { k: 'bore', pts: [[L + 0.05, s.id / 2 + 0.15], [L - 0.15, s.id / 2 - 0.05]], feed: perRev(0.02, n) }] },
      { title: 'Part off', line: 'A 0.8 mm blade. Leave it 0.1 long.', tool: { type: 'part', w: 0.8 }, rpm: n, passes: [{ k: 'part', z: -0.1, w: 0.8, r0: R0 + 0.2, r1: s.id / 2 - 0.1, feed: perRev(0.01, n) }] },
    ],
  }, {
    machine: 'lathe', hold: 'collet', dir: -1, zJaw: 0.6, title: 'Lathe: turned round, face to length',
    steps: [
      { title: 'Face to length', line: `Back in the collet, against a stop. Face to ${L.toFixed(2)} long.`, tool: { type: 'turn' }, rpm: n, passes: [{ k: 'face', z: 0, r0: s.od / 2 + 0.3, r1: s.id / 2 - 0.1, feed: perRev(0.02, n) }] },
      { title: 'Chamfer', line: 'The same 0.1 × 45°, inside and out.', tool: { type: 'turn' }, rpm: n, passes: [{ k: 'turn', pts: [[-0.05, s.od / 2 - 0.15], [0.15, s.od / 2 + 0.05]], feed: perRev(0.02, n) }, { k: 'bore', pts: [[-0.05, s.id / 2 + 0.15], [0.15, s.id / 2 - 0.05]], feed: perRev(0.02, n) }] },
    ],
  }];
}

function screwPlan(sh) {
  const s = screwSpec(sh), z = s.z, R0 = 3.5, n = lrpm(7), nf = lrpm(2, 60);
  const op1 = {
    machine: 'lathe', hold: 'collet', dir: -1, zJaw: z.top + 3, stock: { r: R0, free: -0.3 }, title: 'Lathe: the shank, from 7 mm rod',
    steps: [
      { title: 'Face the end', line: 'This end becomes the thread\'s tip.', tool: { type: 'turn' }, rpm: n, passes: [{ k: 'face', z: 0, r0: R0 + 0.3, r1: 0, feed: perRev(0.04, n) }] },
      { title: 'Turn the flange to Ø6', line: 'Right back past the flange.', tool: { type: 'turn' }, rpm: n, passes: steps(R0, s.flange / 2, 0.5).map((r) => ({ k: 'turn', pts: [[-0.2, r], [z.top + 1.6, r]], feed: perRev(0.05, n) })) },
      { title: 'Turn the boss, Ø2.2', line: 'Light passes. The shank gets thin.', tool: { type: 'turn' }, rpm: nf, passes: steps(s.flange / 2, s.boss / 2, 0.4).map((r) => ({ k: 'turn', pts: [[-0.2, r], [z.boss, r]], feed: perRev(0.03, nf) })) },
      { title: 'Turn the shoulder, Ø1.5', line: `${s.shoulderL.toFixed(2)} long. The bearing turns on this.`, tool: { type: 'turn' }, rpm: LATHE_MAX, passes: [...steps(s.boss / 2, s.shoulder / 2 + 0.05, 0.3), s.shoulder / 2].map((r) => ({ k: 'turn', pts: [[-0.2, r], [z.shoulder, r]], feed: perRev(0.02, LATHE_MAX) })) },
      { title: 'Turn for the thread', line: 'Ø1.38, a hair under 1.4, so the die cuts clean.', tool: { type: 'turn' }, rpm: LATHE_MAX, passes: [{ k: 'turn', pts: [[-0.2, 0.69], [z.thread, 0.69]], feed: perRev(0.02, LATHE_MAX) }, { k: 'turn', pts: [[-0.1, 0.69 - 0.25], [0.2, 0.69 + 0.05]], feed: perRev(0.02, LATHE_MAX) }] },
      { title: 'Cut the thread', line: 'An M1.4 die in the tailstock holder. Turn the chuck by hand.', tool: { type: 'die' }, rpm: 0, passes: [{ k: 'thread', z0: 0, z1: z.thread - 0.15, feed: 0.15 }] },
      { title: 'Part off', line: '0.2 long, to face in the next setup.', tool: { type: 'part', w: 1 }, rpm: lrpm(7, 30), passes: [{ k: 'part', z: z.top + 0.2, w: 1, r0: R0 + 0.2, r1: 0, feed: perRev(0.02, lrpm(7, 30)) }] },
    ],
  };
  const op2 = {
    machine: 'lathe', hold: 'collet', dir: 1, zJaw: z.shoulder - 0.4, title: 'Lathe: the head, held by the shoulder',
    steps: [
      { title: 'Face the head', line: `To ${s.thick} thick. A 1.5 mm collet grips the shoulder.`, tool: { type: 'turn' }, rpm: n, passes: steps(z.top + 0.2, z.top, 0.2).map((zz) => ({ k: 'face', z: zz, r0: s.flange / 2 + 0.3, r1: 0, feed: perRev(0.03, n) })) },
      { title: 'Chamfer the edge', line: '0.1 × 45°.', tool: { type: 'turn' }, rpm: n, passes: [{ k: 'turn', pts: [[z.top + 0.05, s.flange / 2 - 0.15], [z.top - 0.15, s.flange / 2 + 0.05]], feed: perRev(0.02, n) }] },
    ],
  };
  const nS = mrpm(20, 40);
  const op3 = {
    machine: 'mill', hold: 'colletblock', title: 'Mill: the slot',
    steps: [{ title: 'Saw the slot', line: `A 0.4 mm slitting saw, ${s.slotD} deep. The screw sits in a collet block.`, tool: { type: 'saw', d: 20, w: 0.4 }, rpm: nS,
      passes: [{ k: 'slot', from: -s.flange / 2 - 1.5, to: s.flange / 2 + 1.5, feed: 0.5 }] }],
  };
  return [op1, op2, op3];
}

// ---- the cores ----
// Faces are cut with a fly cutter or an end mill whose bottom lies on the face; edges with a 90° chamfer mill;
// holes with a spot drill, a drill and a tap. Every cut is a plane, taken in passes of at most `cut` deep.
function planePasses(n, from, to, cut, u, extent, feed, extra = {}) {
  return steps(from, to, cut).map((d) => ({ k: 'plane', n, d, u, span: extent, feed, ...extra }));
}
// a turn that takes the part's vector v to w (both unit), and keeps `keep` (part) toward `toward` (machine) as nearly as it can
function frameTo(pairs) {
  // pairs: [[part vector, machine vector], [part vector, machine vector]]: an exact rotation from two orthonormal pairs
  const [a1, b1] = pairs[0], a2 = norm(pairs[1][0]), b2 = norm(pairs[1][1]);
  const a3 = cross(a1, a2), b3 = cross(b1, b2);
  // R = B A^T, with A and B the columns a1 a2 a3, b1 b2 b3
  const R = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = b1[i] * a1[j] + b2[i] * a2[j] + b3[i] * a3[j];
  return R;      // row-major: machine = R · part
}
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], neg = (v) => v.map((x) => -x);
function corePlan(sh) {
  const c = coreSpec(sh), st = stockOf('core', sh), a = st.a / 2, h = st.L / 2, cube = sh.solid === 'cube';
  const big = cube ? c.across / 2 : c.corner;           // the block's half size once its six sides are faced
  const fly = { type: 'fly', d: 30 }, nF = mrpm(30, 90);
  const ops = [];
  // face the six sides in the vise; each setup puts one side up (machine +Z), another toward the fixed jaw (machine +Y)
  const SIDES = [[Y, X], [neg(Y), X], [X, Y], [neg(X), Y], [Z, Y], [neg(Z), Y]];
  const vise = { machine: 'mill', hold: 'vise', title: 'Mill: square it up, in the vise', setups: [], steps: [] };
  for (const [up, jaw] of SIDES) {
    const from = Math.abs(up[1]) ? h : a, rot = frameTo([[up, Z], [jaw, Y]]);
    vise.steps.push({ title: `Face the ${['top', 'bottom', 'right', 'left', 'front', 'back'][SIDES.findIndex((s) => s[0] === up)]}`, line: `To ${(2 * big).toFixed(2)} square. Fly cutter, ${nF} rpm.`,
      tool: fly, rpm: nF, rot, passes: planePasses(up, from, big, 0.5, cross(up, jaw), 18, 1.2) });
  }
  ops.push(vise);
  // the edges: four setups, a 90° chamfer mill along each top edge
  const edges = c.planes.filter((q) => q.kind === 'edge'), done = new Set(), ch = { type: 'chamfer', d: cube ? 6 : 16 }, nC = mrpm(ch.d, 60);
  const cham = { machine: 'mill', hold: 'vise', title: 'Mill: chamfer the edges', steps: [] };
  for (const [up, jaw] of [[Y, X], [neg(Y), X], [X, Y], [neg(X), Y]]) {
    const rot = frameTo([[up, Z], [jaw, Y]]), here = edges.filter((q, i) => !done.has(i) && dot(q.n, up) > 0.5);
    if (!here.length) continue;
    here.forEach((q) => done.add(edges.indexOf(q)));
    const passes = [];
    for (const q of here) {
      const e = big * Math.SQRT2, along = norm(cross(q.n, up));
      passes.push(...planePasses(q.n, e, q.d, cube ? 1 : 1.2, along, 20, 0.8, { tool: 'chamfer' }));
    }
    cham.steps.push({ title: `Chamfer ${here.length} edges`, line: `${cube ? `${c.chamfer} × 45°` : `${c.chamfer} wide`}, with a 90° chamfer mill. Turn the part between.`, tool: ch, rpm: nC, rot, passes });
  }
  ops.push(cham);
  // the gear faces and their tapped holes
  const sd = { type: 'spot', d: 3 }, dr = { type: 'drill', d: c.tap.drill }, tp = { type: 'tap', d: 1.4 };
  const holes = (list) => [
    { title: 'Spot', line: 'A 90° spot drill, to Ø1.5. The drill starts here.', tool: sd, rpm: MILL_MAX, passes: list.map((n) => ({ k: 'hole', n, d: 1.5, depth: 0.75, spot: true, feed: 0.4 })) },
    { title: `Drill Ø${c.tap.drill}`, line: `${c.tap.drillDepth} deep, in pecks of 0.5.`, tool: dr, rpm: MILL_MAX, passes: list.map((n) => ({ k: 'hole', n, d: c.tap.drill, depth: c.tap.drillDepth, feed: 0.4 })) },
    { title: 'Tap M1.4', line: `${c.tap.depth} deep, by hand, the tap guided by the spindle.`, tool: tp, rpm: 0, passes: list.map((n) => ({ k: 'tap', n, d: 1.4, depth: c.tap.depth, feed: 0.15 })) },
  ];
  if (cube) {
    // the ring of four faces is already flat; drill and tap them, one setup each, in the vise
    const drill = { machine: 'mill', hold: 'vise', title: 'Mill: drill and tap the four gear faces', steps: [] };
    [[X, Y], [Z, Y], [neg(X), Y], [neg(Z), Y]].forEach(([up, jaw], i) => {
      const rot = frameTo([[up, Z], [jaw, Y]]), [s, d, t] = holes([up]);
      drill.steps.push({ title: `Face ${i + 1}: spot, drill, tap`, line: `Spot to Ø1.5, drill Ø${c.tap.drill} × ${c.tap.drillDepth}, tap M1.4 × ${c.tap.depth} by hand.`, tool: sd, rpm: MILL_MAX, rot,
        passes: [...s.passes.map((p) => ({ ...p, tool: sd })), ...d.passes.map((p) => ({ ...p, tool: dr })), ...t.passes.map((p) => ({ ...p, tool: tp, rpm: 0 }))] });
    });
    ops.push(drill);
  } else {
    // the octahedron's eight faces: the block in a square collet in the indexer, its axis (part y) along the table,
    // the head tilted so the spindle is square to a face. Four faces, then turn the block round for the other four.
    const tilt = Math.asin(1 / Math.sqrt(3)), em = { type: 'end', d: 12 }, nE = mrpm(12, 90);
    for (const end of [1, -1]) {
      const faces = sh.normals.filter((n) => n[1] * end > 0);
      const op = { machine: 'mill', hold: 'indexer', tilt, title: `Mill: the ${end > 0 ? 'first' : 'other'} four faces, in the indexer`, axis: end > 0 ? Y : neg(Y), steps: [] };
      const passes = [];
      for (const n of faces) {
        const top = Math.max(...c.faces.flatMap((f) => f.poly).map((p) => dot(p, n)));
        passes.push(...planePasses(n, Math.max(top, big * 1.4), c.planes.find((q) => q.kind === 'face').d, 1.0, norm(cross(n, end > 0 ? Y : neg(Y))), 24, 1.5, { tool: 'end' }));
      }
      op.steps.push({ title: 'Mill the faces', line: `Head tilted ${(tilt / D).toFixed(2)}°. Index 90° between faces.`, tool: em, rpm: nE, passes });
      op.steps.push(...holes(faces));
      ops.push(op);
    }
  }
  return ops;
}

export const PARTS = ['gear', 'core', 'spacer', 'screw', 'bearing'];
export const NAMES = { gear: 'Gear', core: 'Core', spacer: 'Spacer', screw: 'Screw', bearing: 'Bearing' };
export function planOf(part, sh) {
  if (part === 'gear') return gearPlan(sh);
  if (part === 'spacer') return spacerPlan(sh);
  if (part === 'screw') return screwPlan(sh);
  if (part === 'core') return corePlan(sh);
  return [];
}
export { LATHE_MAX, MILL_MAX, by, SHOWN };
// what the mill starts from: nothing for a part that comes off the lathe, the sawn bar for a core
export function startOf(part, sh) {
  const start = { N: sh.teeth, toolR: 6, mill: () => ({ planes: [], holes: [], gaps: null, slot: null, cut: null }) };
  if (part === 'core') {
    const s = stockOf('core', sh), a = s.a / 2, h = s.L / 2;
    start.mill = () => ({ planes: [[1, 0, 0, a], [-1, 0, 0, a], [0, 1, 0, h], [0, -1, 0, h], [0, 0, 1, a], [0, 0, -1, a]].map((q) => ({ n: q.slice(0, 3), d: q[3], kind: 'stock' })), holes: [], gaps: null, slot: null, cut: null });
  }
  return start;
}
