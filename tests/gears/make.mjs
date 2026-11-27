// Checks the workshop's machining plans without a browser. For each part of each toy it plays the whole plan and checks:
//  - the finished part has the drawing's sizes: diameters, lengths, faces, holes, every tooth gap, the slot;
//  - no cutting tool comes within 0.4 mm of the chuck or collet that holds the part;
//  - spindle speeds stay within what the machines do, and surface speeds within what suits brass and the tool;
//  - every step says what it does and with which tool, and the steps follow each other in time;
//  - a facing cutter cuts at the radius it is drawn with, and spends most of each pass in the metal;
//  - at every cutting step the part is held: each vise jaw, collet flat and V seat touches at least MIN_HOLD mm² of
//    it, and a collet holds at least a diameter of its length, or half the part;
//  - every pass takes metal off, takes as long as its travel at its feed, and knows which tool makes it; a tap and
//    a die go in and come back out, one turn a pitch;
//  - the gear cutter starts each pass clear of the blank, is nowhere wider than the finished gap, and is drawn to
//    that shape; a center drill is drawn to the shape of the hole it makes; the saw starts clear of the screw's head;
//  - no cut leaves a wall too thin to stand; milled faces are not drawn as turned ones.
//
//   node tests/gears/make.mjs
import { planOf, startOf, PARTS, by, SHOWN, LATHE_MAX, MILL_MAX } from '../../js/gears/plan.js';
import { timeline, makeReplay, outline, gapCut, lathePass, latheStart } from '../../js/gears/cut.js';
import { gearSpec, spacerSpec, screwSpec, coreSpec, cutterProfile, sideSetting } from '../../js/gears/spec.js';
import { holding, gripOf } from '../../js/gears/fixture.js';
import { cutting } from '../../js/gears/chips.js';
import { dot, cross } from '../../js/gears/model.js';
import { millTool, rotaryTool, gearCutter, colletMesh, milledMesh, TURN } from '../../js/gears/shop.js';
import { gearMesh } from '../../js/gears/mesh.js';
import { parts, R_IN, R_OUT } from '../../js/gears/model.js';
// how far out a mill tool's bottom reaches, as drawn
const drawnR = (t) => { const g = millTool(t); let r = 0; for (let i = 0; i < g.P.length; i += 3) if (g.P[i + 2] < 0.01) r = Math.max(r, Math.hypot(g.P[i], g.P[i + 1])); return r; };

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) fail(`${what}: ${a.toFixed(3)}, should be ${b.toFixed(3)} ± ${tol}`); };
const TOL = 0.025;
// the least a jaw, a collet flat or a V seat must touch of the part (mm²), and the least a parallel under it must;
// and the most a side pass of the gear cutter may leave on a flank the picture draws finished (mm)
const MIN_HOLD = 15, MIN_REST = 5, MAX_LEFT = 0.25;
// the outside radius of a turned piece at z, read off its outline
function rOf(piece, z) {
  const o = piece.outer;
  for (let i = 0; i + 1 < o.length; i++) { const [r0, z0] = o[i], [r1, z1] = o[i + 1]; if (z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) return z1 === z0 ? Math.max(r0, r1) : r0 + (r1 - r0) * (z - z0) / (z1 - z0); }
  return NaN;
}   // the lathe replay works in steps of 0.01 mm

for (const id of SHOWN) for (const part of PARTS) {
  const sh = by[id], plan = planOf(part, sh), name = `${id} ${part}`;
  if (part === 'bearing') { if (plan.length) fail(`${name}: the bearing is bought, but has a plan`); continue; }
  const start = startOf(part, sh), tl = timeline(plan, start), R = makeReplay(plan, tl, start);

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
    if (!M?.gaps || M.gaps.length !== g.N || M.gaps.some((q) => !gapCut(q, 20).done)) fail(`${name}: not every tooth gap is cut to depth and trimmed on both sides`);
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
  // ---- held at every cutting step ----
  // A jaw, a collet flat or a V seat must touch at least MIN_HOLD mm² of the part, before the step's cuts and after
  // them; a parallel under the part (a rest, not a clamp) at least MIN_REST.
  plan.forEach((op, oi) => op.steps.forEach((s) => {
    const where = `${name}, setup ${oi + 1}, ${s.title}`;
    if (op.machine === 'mill' && (op.hold === 'vise' || op.hold === 'indexer')) for (const [when, t] of [['before', s.t0 + 1e-6], ['after', s.t1 - 1e-6]]) {
      const H = holding(op, s, R.at(t).mill.planes);
      if (!H.length) fail(`${where}: nothing holds the part`);
      for (const h of H) if (!(h.area >= (h.rest ? MIN_REST : MIN_HOLD))) fail(`${where}: the ${h.name} touches ${h.area.toFixed(1)} mm² of the part ${when} the cuts, under ${h.rest ? MIN_REST : MIN_HOLD}`);
    }
    // a V block's screws go into holes the part already has, tapped at least 2 mm deep
    if (op.seat) for (const n of op.seat) { const h = R.atOp[oi].M.holes.find((q) => dot(q.n, n) > 0.999); if (!(h && h.tap >= 2)) fail(`${where}: no tapped hole for the V block's screw at [${n.map((x) => x.toFixed(2))}]`); }
  }));
  plan.forEach((op, oi) => {
    if (op.machine !== 'lathe' || op.hold !== 'collet') return;
    const S0 = R.atOp[oi].S, g = gripOf(S0, op), where = `${name}, setup ${oi + 1}`;
    // enough of the part: a diameter of its length, or a third of it (a short ring sits against a stop in the
    // collet, and a facing cut presses it there)
    let len = 0; for (let i = 0; i < S0.n; i++) if (S0.ro[i] > S0.ri[i]) len += 0.01;
    const need = Math.min(2 * g.r, len / 3);
    if (!(g.len >= need - 1e-9)) fail(`${where}: the collet holds ${g.len.toFixed(2)} mm of the part, under ${need.toFixed(2)}`);
    // the collet as drawn: its face at the jaw line (x = 0), and an open bore of the size it grips
    const c = colletMesh(g.r); let face = -Infinity, rmin = Infinity;
    for (let i = 0; i < c.P.length; i += 3) { face = Math.max(face, c.P[i]); if (c.P[i] > -19) rmin = Math.min(rmin, Math.hypot(c.P[i + 1], c.P[i + 2])); }
    near(face, 0, 1e-6, `${where}: the drawn collet's face against the jaw line`); near(rmin, g.r, 1e-4, `${where}: the drawn collet's bore against the size gripped`);
  });

  // ---- every pass ----
  const spec = part === 'gear' ? gearSpec(sh) : null, RC = 20;
  tl.segs.forEach((g, gi) => {
    const p = g.p, op = plan[g.op], st = op.steps[g.step], what = `${name}: "${st.title}", pass ${g.pass + 1}`, a = R.at(g.t0 + 1e-7), b = R.at(g.t1 - 1e-7);
    // it takes metal off (a tap or a die coming back out does not)
    if (!p.out && !p.eng) fail(`${what}: no metal comes off`);
    if (op.machine === 'lathe' && !p.out && p.k !== 'thread') { const m = (S) => { let v = 0; for (let i = 0; i < S.n; i++) { if (S.ro[i] > S.ri[i]) v += S.ro[i] ** 2 - S.ri[i] ** 2; if (S.ring && S.ring[i]) v += S.ring[i][1] ** 2 - S.ring[i][0] ** 2; } return v; }; if (!(m(b.lathe) < m(a.lathe) - 1e-7)) fail(`${what}: the part is the same after it`); }
    // its time is its travel, as the replay moves the tool, at its feed
    let d = null;
    if (op.machine === 'lathe' && (p.k !== 'turn' && p.k !== 'bore' || p.pts.length === 2)) d = Math.hypot(b.tip[0] - a.tip[0], b.tip[1] - a.tip[1]);
    if (p.k === 'plane' || p.k === 'hole' || p.k === 'tap') d = Math.hypot(...b.tip.at.map((x, i) => x - a.tip.at[i]));
    if (p.k === 'gap') d = Math.abs(b.tip.x - a.tip.x);
    if (p.k === 'slot') d = Math.abs(b.tip.slot - a.tip.slot);
    if (d !== null && !(Math.abs(d - (g.t1 - g.t0) * p.feed) < 0.02 || (g.t1 - g.t0 <= 0.4 + 1e-9 && d <= 0.4 * p.feed + 0.02))) fail(`${what}: ${d.toFixed(2)} mm in ${(g.t1 - g.t0).toFixed(1)} s is not its feed, ${p.feed.toFixed(3)} mm/s`);
    // the tool that makes it suits the cut, and a hand tool has no spindle speed
    const tool = p.tool && typeof p.tool === 'object' ? p.tool : st.tool, rpm = p.rpm ?? st.rpm;
    const suits = { hole: p.spot ? ['spot'] : ['drill'], tap: ['tap'], thread: ['die'], gap: ['gearcutter'], slot: ['saw'], plane: [p.tool], drill: ['center', 'drill'], part: ['part'] }[p.k];
    if (suits && !suits.includes(tool.type)) fail(`${what}: a ${p.k} pass with a ${tool.type}`);
    if ((tool.type === 'tap' || tool.type === 'die') !== (rpm === 0)) fail(`${what}: ${tool.type} at ${rpm} rpm`);
    // a tap or a die: a turn for each pitch going in, and then the same way out
    if ((p.k === 'tap' || p.k === 'thread') && !p.out) {
      const nx = tl.segs[gi + 1];
      if (!(nx && nx.p.out && nx.p.k === p.k && nx.op === g.op && nx.t0 <= g.t1 + 1e-9)) fail(`${what}: nothing brings the ${tool.type} back out`);
      if (!(p.pitch > 0)) fail(`${what}: no pitch to turn by`);
      if (p.k === 'tap') near(b.tip.turns, p.depth / p.pitch, 1e-3, `${what}: turns of the tap at full depth`);
    }
    // a center drill is drawn to the shape of the hole it makes
    if (tool.type === 'center') {
      const m = rotaryTool(tool), S = b.lathe, depth = Math.abs(p.z1 - (st.passes[0].z0 - op.dir));
      for (let i = 0; i < m.P.length; i += 3) { const back = m.P[i + 2], r = Math.hypot(m.P[i], m.P[i + 1]); if (back > depth - 0.05) continue;
        const k = Math.round((p.z1 + back * op.dir - S.z0) / 0.01); if (!(Math.abs(S.ri[k] - r) < 0.03)) { fail(`${what}: ${back.toFixed(2)} from its point the drawn center drill is ${r.toFixed(2)} in radius, the hole ${(+S.ri[k]).toFixed(2)}`); break; } }
    }
    // the gear cutter: its lowest point starts beyond the outer end, its arc clear of the metal as it is; and ends past the small end
    if (p.k === 'gap') {
      const before = gapCut(a.mill.gaps[p.gap] && gi && tl.segs[gi - 1].p.gap === p.gap ? R.at(tl.segs[gi - 1].t1 + 1e-7).mill.gaps[p.gap] : null, RC);
      for (let k = 0; k <= 20; k++) {
        const s = spec.coneIn + (spec.coneOut - spec.coneIn) * k / 20, top = spec.depthOut * s / spec.coneOut, dx = p.x0 - s, arc = p.h + RC - Math.sqrt(RC * RC - dx * dx);
        const metal = p.side ? top : Math.min(top, before.lev(s));
        if (!(arc >= metal - 1e-6)) { fail(`${what}: at its start the cutter is ${(metal - arc).toFixed(2)} mm into the blank, ${(spec.coneOut - s).toFixed(1)} mm from the outer end`); break; }
      }
      if (!(p.x1 < spec.coneIn)) fail(`${what}: the cutter stops short of the small end`);
      if (!p.side && !(p.from - p.h > 0.05)) fail(`${what}: no deeper than the pass before`);
    }
    // the saw's rim is a circle: at its start it has not reached the head
    if (p.k === 'slot') { const s = screwSpec(sh); if (!(Math.abs(p.from) - s.flange / 2 >= p.r)) fail(`${what}: the saw starts in the screw's head`); }
  });
  if (part === 'gear') {
    // the form cutter: nowhere wider than the finished gap, so it never cuts a finished flank; drawn to its profile;
    // narrower than the gap at the large end, so the side passes have metal to take; and they leave little
    const pr = sh.profile, u = spec.u, prof = cutterProfile(sh), set = sideSetting(sh);
    const W = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][0]) return prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * (y - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]); return prof[prof.length - 1][1]; };
    let over = 0, pitchRow = 0;
    pr.th.forEach((th, r) => { if (Math.abs(th - pr.alpha) < Math.abs(pr.th[pitchRow] - pr.alpha)) pitchRow = r; });
    for (let k = 0; k <= 10; k++) pr.th.forEach((th, r) => { const s = R_IN + (R_OUT - R_IN) * k / 10, rho = s / Math.cos(th - pr.alpha); over = Math.max(over, W(rho * Math.sin(th - pr.root) * u) - (pr.half - pr.hw[r]) * rho * Math.sin(th) * u); });
    if (!(over < 0.005)) fail(`${name}: the cutter is ${over.toFixed(3)} mm wider than the finished gap somewhere`);
    const m = gearCutter({ type: 'gearcutter', d: 40, w: 4, profile: prof }); let off = 0;
    for (let i = 0; i < m.P.length; i += 3) { const y = RC - Math.hypot(m.P[i], m.P[i + 1]); if (y >= 0 && y <= prof[prof.length - 1][0] && Math.abs(m.P[i + 2]) < 1.99) off = Math.max(off, Math.abs(Math.abs(m.P[i + 2]) - W(y))); }
    if (!(off < 0.01)) fail(`${name}: the drawn cutter is ${off.toFixed(3)} mm off its profile`);
    { const th = pr.th[pitchRow], rho = R_OUT / Math.cos(th - pr.alpha), room = (pr.half - pr.hw[pitchRow]) * rho * Math.sin(th) * u - W(rho * Math.sin(th - pr.root) * u);
      if (!(room > 0.05)) fail(`${name}: the side passes have ${room.toFixed(3)} mm to take at the large end's pitch line`); }
    if (!(set.left < MAX_LEFT)) fail(`${name}: a side pass leaves ${set.left.toFixed(2)} mm on the flank, over ${MAX_LEFT}`);
    // each tooth's cutting face leads: it is the steeper one, and the cutter turns toward it
    { let f = Infinity, bk = -Infinity; for (let i = 0; i < m.P.length; i += 3) { const r = Math.hypot(m.P[i], m.P[i + 1]), ang = Math.atan2(m.P[i + 1], m.P[i]); if (Math.abs(r - RC) < 1e-6 && ang >= -1e-9 && ang < 2 * Math.PI / 14) { f = Math.min(f, ang); bk = Math.max(bk, ang); } }
      const s = 2 * Math.PI / 14; if (!((f < s - bk) === (TURN < 0))) fail(`${name}: the gear cutter turns back first`); }
    // the gear as drawn while its gaps are cut: milled faces in the gaps, turned ones elsewhere
    const G = gearMesh(pr, parts(sh), null, 0, 16); let milled = 0; for (let i = 0; i < G.T.length; i += 3) if (G.T[i] === 16) milled++;
    if (!milled) fail(`${name}: the tooth gaps are drawn as turned faces`);
    console.log(`  cutter: ${prof[prof.length - 1][1].toFixed(2)} mm half width at ${prof[prof.length - 1][0].toFixed(2)} mm; side pass: head turned ${(set.roll * 180 / Math.PI).toFixed(2)}°, cutter set over ${set.over.toFixed(2)} mm, leaves at most ${set.left.toFixed(2)} mm`);
  }
  // no cut leaves a wall too thin to stand: at the end of every lathe step, no stretch of metal over 0.3 mm long is
  // under 0.15 mm thick (a sharp edge, where two cones meet, is not a wall)
  if (S) plan.forEach((op, oi) => { if (op.machine === 'lathe') op.steps.forEach((s) => { const L = R.at(s.t1 - 1e-6).lathe; let run = 0, worst = 0; for (let i = 0; i < L.n; i++) { const w = L.ro[i] - L.ri[i]; run = w > 1e-6 && w < 0.15 ? run + 1 : 0; worst = Math.max(worst, run); } if (worst * 0.01 > 0.3) fail(`${name}, setup ${oi + 1}, ${s.title}: leaves a wall under 0.15 mm thick, ${(worst * 0.01).toFixed(2)} mm long`); }); });
  // milled faces are drawn milled: none of the finished core's faces is left as stock or drawn as a turned face
  if (part === 'core') { const m = milledMesh(M); for (let i = 0; i < m.T.length; i += 3) if (m.T[i] !== 15 && m.T[i] !== 16) { fail(`${name}: a finished face is drawn as kind ${m.T[i]}, not as a milled face`); break; } }
  // chips come only while an edge is in metal: every span of chips lies inside the part of a pass that cuts
  plan.forEach((op, oi) => { for (const [a, b, size] of cutting(plan, tl, oi)) { const g = tl.segs.find((q) => q.op === oi && a >= q.t0 - 1e-9 && b <= q.t1 + 1e-9); if (!g || !g.p.eng || !(size > 0)) fail(`${name}, setup ${oi + 1}: chips from ${a.toFixed(1)} to ${b.toFixed(1)} s with no cut`); } });
  console.log(`${name}: ${plan.length} setups, ${plan.reduce((a, op) => a + op.steps.length, 0)} steps, ${(tl.T / 60).toFixed(1)} min`);
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
