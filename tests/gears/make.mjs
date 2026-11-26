// Checks the workshop's machining plans without a browser. For each part of each toy it plays the whole plan and checks:
//  - the finished part has the drawing's sizes: diameters, lengths, faces, holes, every tooth gap, the slot;
//  - no cutting tool comes within 0.4 mm of the chuck or collet that holds the part;
//  - spindle speeds stay within what the machines do, and surface speeds within what suits brass and the tool;
//  - every step says what it does and with which tool, and the steps follow each other in time;
//  - a facing cutter cuts at the radius it is drawn with, and spends most of each pass in the metal.
//
//   node tests/gears/make.mjs
import { planOf, startOf, PARTS, by, SHOWN, LATHE_MAX, MILL_MAX } from '../../js/gears/plan.js';
import { timeline, makeReplay, outline } from '../../js/gears/cut.js';
import { gearSpec, spacerSpec, screwSpec, coreSpec } from '../../js/gears/spec.js';
import { dot, cross } from '../../js/gears/model.js';
import { millTool } from '../../js/gears/shop.js';
// how far out a mill tool's bottom reaches, as drawn
const drawnR = (t) => { const g = millTool(t); let r = 0; for (let i = 0; i < g.P.length; i += 3) if (g.P[i + 2] < 0.01) r = Math.max(r, Math.hypot(g.P[i], g.P[i + 1])); return r; };

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) fail(`${what}: ${a.toFixed(3)}, should be ${b.toFixed(3)} ± ${tol}`); };
const TOL = 0.025;
// the outside radius of a turned piece at z, read off its outline
function rOf(piece, z) {
  const o = piece.outer;
  for (let i = 0; i + 1 < o.length; i++) { const [r0, z0] = o[i], [r1, z1] = o[i + 1]; if (z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) return z1 === z0 ? Math.max(r0, r1) : r0 + (r1 - r0) * (z - z0) / (z1 - z0); }
  return NaN;
}   // the lathe replay works in steps of 0.01 mm

for (const id of SHOWN) for (const part of PARTS) {
  const sh = by[id], plan = planOf(part, sh), name = `${id} ${part}`;
  if (part === 'bearing') { if (plan.length) fail(`${name}: the bearing is bought, but has a plan`); continue; }
  const tl = timeline(plan), R = makeReplay(plan, tl, startOf(part, sh));

  // ---- the steps ----
  let t = 0;
  plan.forEach((op) => op.steps.forEach((s) => {
    const where = `${name}, ${s.title}`;
    if (!s.title || !s.line || !s.tool || !s.passes?.length) fail(`${where}: a step needs a title, a line, a tool and passes`);
    if (!(s.t0 >= t - 1e-9 && s.t1 > s.t0)) fail(`${where}: out of order in time`);
    t = s.t1;
    const max = op.machine === 'lathe' ? LATHE_MAX : MILL_MAX;
    if (s.rpm < 0 || s.rpm > max) fail(`${where}: ${s.rpm} rpm, the ${op.machine} does 0 to ${max}`);
    // a rotating tool's surface speed: HSS in free-cutting brass, at most about 120 m/min
    const d = s.tool.d;
    if (d && op.machine === 'mill' && s.rpm) { const v = Math.PI * d * s.rpm / 1000; if (v > 120) fail(`${where}: Ø${d} at ${s.rpm} rpm is ${v.toFixed(0)} m/min`); }
    // a turned part's surface speed, at the stock's size
    if (op.machine === 'lathe' && s.rpm && op.stock) { const v = Math.PI * 2 * op.stock.r * s.rpm / 1000; if (v > 150) fail(`${where}: ${v.toFixed(0)} m/min at the stock's surface`); }
    // the tool keeps 0.4 mm clear of the chuck or collet (the spacer is only 1.4 long, so this is tight)
    if (op.machine === 'lathe') for (const p of s.passes) {
      const zs = p.k === 'turn' || p.k === 'bore' ? p.pts.map((q) => q[0]) : p.k === 'drill' ? [p.z0, p.z1] : p.k === 'thread' ? [p.z0, p.z1] : p.k === 'part' ? [op.dir > 0 ? p.z - p.w : p.z + p.w] : [p.z];
      for (const z of zs) if (op.dir * (z - op.zJaw) < 0.4) fail(`${where}: the tool reaches z ${z.toFixed(2)}, the jaws are at ${op.zJaw.toFixed(2)}`);
    }
  }));
  if (Math.abs(t - tl.T) > 1e-6 && t > tl.T) fail(`${name}: the steps run past the timeline`);

  // ---- the finished part ----
  const S = R.final.S, M = R.final.M;
  const L = S && outline(S);
  if (S && L.length !== 1) fail(`${name}: ${L.length} pieces at the end, should be one`);
  const piece = L && L[0];
  const rMax = piece && Math.max(...piece.outer.map((q) => q[0])), rIn = piece && Math.min(...piece.inner.map((q) => q[0]));
  if (part === 'gear') {
    const g = gearSpec(sh);
    near(rMax, g.tipOut.r, TOL, `${name}: outside radius`);
    near(rIn, g.bore / 2, TOL, `${name}: bore radius`);
    near(piece.z0, g.tipIn.z, TOL, `${name}: inner end`);
    near(piece.z1, g.zo, TOL, `${name}: outer face`);
    near(rOf(piece, piece.z1 - 0.001), g.rootOut.r, 0.05, `${name}: radius at the outer face`);
    if (!M?.gaps || M.gaps.length !== g.N || [...M.gaps].some((f) => f < 1)) fail(`${name}: not every tooth gap is cut`);
  }
  if (part === 'spacer') {
    const s = spacerSpec(sh);
    near(rMax, s.od / 2, TOL, `${name}: outside radius`); near(rIn, s.id / 2, TOL, `${name}: bore radius`);
    near(piece.z1 - piece.z0, s.L, TOL, `${name}: length`);
  }
  if (part === 'screw') {
    const s = screwSpec(sh);
    near(rMax, s.flange / 2, TOL, `${name}: flange radius`);
    near(piece.z1 - piece.z0, s.length, TOL, `${name}: length`);
    const rAt = (z) => rOf(piece, z);
    near(rAt(piece.z0 + (s.z.thread + s.z.shoulder) / 2), s.shoulder / 2, TOL, `${name}: shoulder radius`);
    near(rAt(piece.z0 + (s.z.shoulder + s.z.boss) / 2), s.boss / 2, TOL, `${name}: boss radius`);
    near(rAt(piece.z0 + s.z.thread / 2), s.thread / 2, 0.02, `${name}: thread's outside radius`);
    if (!S.thread || S.thread[1] - S.thread[0] < s.threadL - 0.2) fail(`${name}: the thread is not cut far enough`);
    if (!M?.slot || Math.abs(M.slot[1] - M.slot[0]) < s.flange) fail(`${name}: the slot does not cross the head`);
  }
  if (part === 'core') {
    const c = coreSpec(sh);
    for (const q of c.planes) {
      const m = M.planes.filter((p) => dot(p.n, q.n) > 1 - 1e-6);
      if (!m.length) fail(`${name}: no cut makes the ${q.kind} at [${q.n.map((x) => x.toFixed(2))}]`);
      else near(Math.min(...m.map((p) => p.d)), q.d, 0.02, `${name}: ${q.kind} at [${q.n.map((x) => x.toFixed(2))}]`);
    }
    for (const p of M.planes) if (!c.planes.some((q) => dot(p.n, q.n) > 1 - 1e-6) && p.kind !== 'stock') fail(`${name}: a cut the drawing does not have, at [${p.n.map((x) => x.toFixed(2))}]`);
    for (const h of c.holes) {
      const got = M.holes.find((q) => dot(q.n, h.n) > 0.999);
      if (!got) { fail(`${name}: no hole at [${h.n.map((x) => x.toFixed(2))}]`); continue; }
      near(got.depth, c.tap.drillDepth, 0.01, `${name}: drill depth`); near(got.tap, c.tap.depth, 0.01, `${name}: thread depth`); near(got.d, c.tap.drill, 1e-6, `${name}: drill size`);
    }
    if (M.holes.length !== c.holes.length) fail(`${name}: ${M.holes.length} holes, the drawing has ${c.holes.length}`);
  }
  // facing passes: the cutting circle is the drawn tool's, and its front arc is in the metal for most of the pass
  for (const s of tl.segs) {
    const p = s.p; if (p.k !== 'plane' || p.tool === 'chamfer') continue;
    const tool = plan[s.op].steps[s.step].tool, what = `${name}: step "${plan[s.op].steps[s.step].title}"`;
    if (!p.r) { fail(`${what}: a facing pass without its tool's radius`); continue; }
    near(p.r, tool.d / 2, 1e-9, `${what}: cutting radius against the tool's size`);
    near(drawnR(tool), p.r, 0.2, `${what}: cutting radius against the drawn ${tool.type} cutter`);
    let inMetal = 0, n = 0;
    for (let k = 1; k < 40; k++) {
      const r = R.at(s.t0 + (s.t1 - s.t0) * k / 40); if (!r.tip || !p.geo) continue; n++;
      // the face being cut, and where the circle's front is on it, line by line across the feed
      const v = cross(p.n, p.u), ax = dot(r.tip.at, p.u), vc = dot(r.tip.at, v);
      const hit = p.geo.poly.some((q, i) => { const q2 = p.geo.poly[(i + 1) % p.geo.poly.length];
        for (let j = 0; j <= 8; j++) { const pt = q.map((x, m) => x + (q2[m] - x) * j / 8), y = dot(pt, v) - vc;
          if (Math.abs(y) < p.r && Math.abs(dot(pt, p.u) - ax) < p.r && Math.hypot(dot(pt, p.u) - ax, y) <= p.r + 0.05) return true; } return false; })
        || (() => { const f = ax + p.r; const us = p.geo.poly.map((q) => dot(q, p.u)); return f >= Math.min(...us) && f <= Math.max(...us); })();
      if (hit) inMetal++;
    }
    if (n && inMetal / n < 0.7) fail(`${what}: the cutter is in the metal for only ${Math.round(100 * inMetal / n)}% of a pass`);
  }
  console.log(`${name}: ${plan.length} setups, ${plan.reduce((a, op) => a + op.steps.length, 0)} steps, ${(tl.T / 60).toFixed(1)} min`);
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
