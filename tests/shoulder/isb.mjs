// The shoulder joint's angles as the measurements give them (ISB: Wu and others 2005, Journal of Biomechanics 38:981),
// worked out from the scan's own bones, for tests/shoulder/model.mjs.
import { model } from './load.mjs';
import { V } from '../../js/shoulder/geom.js';

const HC = model.marks.HC, EL = model.marks.EL, rad = (d) => d * Math.PI / 180;
const vs = (m) => { const p = m.pos, o = []; for (let i = 0; i < p.length; i += 3) o.push([p[i], p[i + 1], p[i + 2]]); return o; };
const sc = vs(model.bones.scapula), hu = vs(model.bones.humerus);
// Shoulder blade: AI its lowest point, TS the root of its spine on the inner border, AA the acromion's back corner.
// Zs runs from TS to AA; Xs is square to the plane of the three and points forward; Ys points up.
const AI = sc.reduce((a, p) => (p[1] < a[1] ? p : a)), TS = model.marks.ROOT;
const AA = sc.filter((p) => p[1] > HC[1] + 15).reduce((a, p) => (p[0] + p[2] < a[0] + a[2] ? p : a));
const Zs = V.norm(V.sub(AA, TS)); let Xs = V.norm(V.cross(V.sub(AA, AI), V.sub(TS, AI))); if (Xs[2] < 0) Xs = V.mul(Xs, -1);
const Ys = V.norm(V.cross(Zs, Xs)); Xs = V.cross(Ys, Zs);
// Arm bone: Yh from the elbow's middle up to the ball's middle; Zh along the bone's widest direction at the elbow
// (the line between the epicondyles), pointing away from the body.
const Yh = V.norm(V.sub(HC, EL));
const far = hu.filter((p) => Math.abs(V.dot(V.sub(p, EL), Yh)) < 12);
let wide = null; for (const p of far) for (const q of far) { const d = V.sub(p, q), l = V.len(V.sub(d, V.mul(Yh, V.dot(d, Yh)))); if (!wide || l > wide.l) wide = { l, p, q }; }
const lat = wide.p[0] < wide.q[0] ? wide.p : wide.q, med = lat === wide.p ? wide.q : wide.p;
let Zh = V.sub(lat, med); Zh = V.norm(V.sub(Zh, V.mul(Yh, V.dot(Zh, Yh)))); const Xh = V.cross(Yh, Zh);
const cols = (X, Y, Z) => [[X[0], Y[0], Z[0]], [X[1], Y[1], Z[1]], [X[2], Y[2], Z[2]]];
const Rs = cols(Xs, Ys, Zs), Rh = cols(Xh, Yh, Zh);
const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j])), tr = (R) => R[0].map((_, j) => R.map((r) => r[j]));
const mv = (R, p) => R.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]);
const rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]], ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
// the arm bone's turn from the scan's rest to elevation E in plane P (forward of the blade's own plane +) with turn R
// about its length (inward +), the shoulder blade staying at rest
const ghTurn = (E, P, R) => mm(mm(Rs, mm(mm(ry(rad(P)), rx(rad(-E))), ry(rad(R)))), tr(Rh));
// the pose with the arm bone at those angles, for model.lineMm
const T0 = model.pose({ elev: 0, plane: 30, rot: 0, quick: true });
export const poseAt = (E, P, R) => { const Q = ghTurn(E, P, R); return { ...T0, humerus: { R: Q, t: V.sub(HC, mv(Q, HC)) } }; };
// the three axes those angles turn about at (E, P), in the room
function axes(E, P) {
  return { elev: V.mul(mv(mm(Rs, ry(rad(P))), [1, 0, 0]), -1), plane: [Rs[0][1], Rs[1][1], Rs[2][1]], rot: mv(ghTurn(E, P, 0), [Rh[0][1], Rh[1][1], Rh[2][1]]) };
}
const inv3 = (m) => { const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2], D = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g); return [[(e * i - f * h) / D, (c * h - b * i) / D, (b * f - c * e) / D], [(f * g - d * i) / D, (a * i - c * g) / D, (c * d - a * f) / D], [(d * h - e * g) / D, (b * g - a * h) / D, (a * e - b * d) / D]]; };
// Leverage given as mm for each of the three angles is not a vector until the angles' axes are taken into account
// (they are not square to each other). This is the vector whose part along each axis is that axis's leverage.
export function asVector(lev, E, P) { const A = axes(E, P), M = inv3([A.elev, A.plane, A.rot]); return M.map((r) => r[0] * lev.elev + r[1] * lev.plane + r[2] * lev.rot); }
// the model's leverage at (E, P, R): how much a muscle's middle line shortens for each radian of each angle, mm
export function leverage(b, E, P, R, h = 0.5) {
  const L = (e, p, r) => model.lineMm(b, poseAt(e, p, r)), d = 2 * h * rad(1);
  return { elev: -(L(E + h, P, R) - L(E - h, P, R)) / d, plane: -(L(E, P + h, R) - L(E, P - h, R)) / d, rot: -(L(E, P, R + h) - L(E, P, R - h)) / d };
}
