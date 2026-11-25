// Gears on a cube and an octahedron: every part's real size in millimeters, for the workshop's drawings and for
// the machining plans. Everything here is worked out from model.js; nothing is typed in twice.
import { SHAPES, MM, MODULE, PRESSURE, R_IN, R_OUT, unitMM, blank, parts, bodyPlanes, bodyFaces } from './model.js?v=286eb78e';

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
    backlash: 0.05 * Math.PI * m,             // the model thins each tooth by 5% of the tooth spacing at the pitch circle
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
export const bearingSpec = () => ({ ...MM.bearing, name: '681X' });

// the stock each part starts from
export function stockOf(part, sh) {
  if (part === 'gear') return { kind: 'round', d: Math.ceil(gearSpec(sh).od + 0.4) };
  if (part === 'spacer') return { kind: 'round', d: 3 };
  if (part === 'screw') return { kind: 'round', d: 7 };
  if (part === 'core') return sh.solid === 'cube' ? { kind: 'square', a: 10, L: 11 } : { kind: 'square', a: 16, L: 16.5 };
  return null;
}
export const deg = (r, d = 2) => (r / D).toFixed(d);
