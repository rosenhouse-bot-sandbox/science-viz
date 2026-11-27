// Gears on a cube and an octahedron: every part's real size in millimeters, for the workshop's drawings and for
// the machining plans. Everything here is worked out from model.js; nothing is typed in twice.
import { SHAPES, MM, MODULE, PRESSURE, R_IN, R_OUT, unitMM, blank, parts, bodyPlanes, bodyFaces } from './model.js?v=42230d28';

const D = Math.PI / 180;
export const by = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
export const SHOWN = ['cube4', 'octa'];
export const MATERIAL = 'Free-cutting brass, CW614N (C360)';

// the gear: its outline in its own frame (r out from the axis, z along it from the solid's center), in mm
export function gearSpec(sh) {
  const u = unitMM(sh), b = blank(sh), P = parts(sh), pr = sh.profile, mm = (p) => ({ r: p.r * u, z: p.z * u });
  const k = { tipOut: mm(b.tipOut), rootOut: mm(b.rootOut), tipIn: mm(b.tipIn), rootIn: mm(b.rootIn), pitchOut: mm(b.pitchOut) };
  const m = MODULE[sh.solid], N = pr.N;
  return {
    ...k, u, N, m, zo: P.front * u, zi: P.back * u, bore: MM.bearing.D, alpha: pr.alpha, root: pr.root, tip: pr.tip,
    shaft: sh.shaft, coneOut: R_OUT * u, coneIn: R_IN * u, face: (R_OUT - R_IN) * u, pitchD: m * N,
    od: 2 * k.tipOut.r, addendum: m, dedendum: 1.25 * m, pressure: PRESSURE,
    formative: N / Math.cos(pr.alpha),        // the tooth count a spur gear would need to have teeth of this shape
    cutter: cutterNo(N / Math.cos(pr.alpha)),
    thinning: 0.05 * Math.PI * m,             // the model thins each tooth by 5% of the tooth spacing at the pitch circle
    backlash: 0.1 * Math.PI * m,              // so two gears in mesh have twice that between their teeth
    depthOut: R_OUT / Math.cos(pr.tip - pr.alpha) * Math.sin(pr.tip - pr.root) * u,   // a gap's depth at the outer end, square to its bottom
  };
}
// the involute gear cutter that suits a tooth count (the usual set of eight)
function cutterNo(n) { const lo = [135, 55, 35, 26, 21, 17, 14, 12]; for (let i = 0; i < 8; i++) if (n >= lo[i]) return i + 1; return 8; }

// the spacer, the shoulder screw, the core
export function spacerSpec(sh) {
  const P = parts(sh), u = P.u;
  return { od: MM.spacer.od, id: MM.spacer.id, L: (P.washer.top - P.core) * u };
}
export function screwSpec(sh) {
  const S = MM.screw, sp = spacerSpec(sh), shoulder = MM.bearing.B + sp.L - S.clamp;
  // from the thread's end up: thread, shoulder, boss, flange
  const z = { thread: S.threadL, shoulder: S.threadL + shoulder, boss: S.threadL + shoulder + S.bossH };
  z.top = z.boss + S.thick;
  return { ...S, shoulderL: shoulder, z, length: z.top, threadMinor: S.thread - 1.0825 * S.pitch, chamferEnd: 0.15, undercut: 0.25 };
}
export function coreSpec(sh) {
  const u = unitMM(sh), planes = bodyPlanes(sh).map((q) => ({ ...q, d: q.d * u }));
  const faces = bodyFaces(planes);
  const holes = sh.normals.map((n) => ({ n, c: n.map((x) => x * MM.core[sh.solid]) }));
  return { solid: sh.solid, u, planes, faces, holes, across: 2 * MM.core[sh.solid], chamfer: MM.chamfer[sh.solid], corner: MM.corner.octa,
    tap: MM.tap, edgeD: planes.find((q) => q.kind === 'edge').d };
}
// the bearing is bought. The maker's catalog has two with a 1.5 mm bore and 4 mm outside: the open 681X, 1.2 mm
// wide, and the shielded 681XZZ, 2 mm wide. The model's is 2 mm wide, so it is the shielded one.
export const bearingSpec = () => ({ ...MM.bearing, name: '681XZZ' });

// The form cutter for a gear's teeth: half its width at each height above its lowest point, in mm, as [height, half
// width] pairs. A bevel gear's gap narrows toward the small end and a cutter has one shape, so at every height the
// cutter is no wider than the gap is where it is narrowest along the tooth, and it never cuts into a finished
// flank. It is thinner than that by THIN of a module each side (the page's choice), which the two side passes take off.
export const THIN = 0.1;
export function cutterProfile(sh) {
  const pr = sh.profile, u = unitMM(sh), rows = pr.th.length;
  const gapAt = (s) => pr.th.map((th, r) => { const rho = s / Math.cos(th - pr.alpha); return [rho * Math.sin(th - pr.root) * u, (pr.half - pr.hw[r]) * rho * Math.sin(th) * u]; });
  const at = (g, y) => { for (let r = 1; r < rows; r++) if (y <= g[r][0]) return g[r - 1][1] + (g[r][1] - g[r - 1][1]) * (y - g[r - 1][0]) / (g[r][0] - g[r - 1][0]); return Infinity; };
  const gaps = Array.from({ length: 41 }, (_, k) => gapAt(R_IN + (R_OUT - R_IN) * k / 40)), top = gaps[40][rows - 1][0], out = [];
  for (let k = 0; k <= 60; k++) { const y = top * k / 60; out.push([y, Math.max(0, Math.min(...gaps.map((g) => at(g, y))) - THIN * MODULE[sh.solid])]); }
  return out;
}

// A side pass on a gap: the dividing head is turned by `roll` and the cutter set over by `over`, so that one side of
// the cutter runs along the finished flank. A cutter has one shape and the flank's changes along the tooth, so the
// two cannot agree everywhere: `over` (toward that flank) is the most that keeps the cutter out of the finished flank at every point,
// and `roll` is the turn for which that leaves the least. left: the most metal the cutter then leaves, in mm. The
// picture draws the flank finished.
export function sideSetting(sh) {
  const pr = sh.profile, u = unitMM(sh), prof = cutterProfile(sh), rows = pr.th.length;
  const W = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][0]) return prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * (y - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]); return prof[prof.length - 1][1]; };
  const pts = [];
  for (let k = 0; k <= 20; k++) for (let r = 1; r < rows; r++) { const s = R_IN + (R_OUT - R_IN) * k / 20, th = pr.th[r], rho = s / Math.cos(th - pr.alpha); pts.push([W(rho * Math.sin(th - pr.root) * u), rho * Math.sin(th) * u, pr.half - pr.hw[r]]); }
  let best = null;
  for (let i = 0; i <= 200; i++) {
    const roll = pr.half * i / 200, need = pts.map(([w, rad, ga]) => w - rad * Math.sin(ga - roll)), over = Math.max(...need), left = over - Math.min(...need);
    if (!best || left < best.left) best = { roll, over: -over, left };
  }
  return best;
}

// the stock each part starts from
export function stockOf(part, sh) {
  if (part === 'gear') return { kind: 'round', d: Math.ceil(gearSpec(sh).od + 0.4) };
  if (part === 'spacer') return { kind: 'round', d: 3 };
  if (part === 'screw') return { kind: 'round', d: 7 };
  if (part === 'core') return sh.solid === 'cube' ? { kind: 'square', a: 10, L: 11 } : { kind: 'square', a: 16, L: 16.5 };
  return null;
}
export const deg = (r, d = 2) => (r / D).toFixed(d);
