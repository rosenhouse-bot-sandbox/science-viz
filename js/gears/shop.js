// Gears on a cube and an octahedron: the workshop's 3D picture. A small lathe (3-jaw chuck or collet chuck,
// carriage, cross slide, compound, tool post, tailstock) and a knee mill (table, vise, spin indexer, tilting dividing
// head, a head that tilts), drawn round the part being made. All sizes in millimeters; the machines are a typical
// bench lathe's and a small knee mill's. The part's shape comes from cut.js; nothing here decides it.
import { program } from '../gl/gl.js?v=cbfbfc46';
import { GLSL, withLit } from './look.js?v=cbfbfc46';
import { grow, lathe, box, poly, sphere, gearMesh } from './mesh.js?v=cbfbfc46';
import { bodyFaces, dot, cross, norm } from './model.js?v=cbfbfc46';
import { outline } from './cut.js?v=cbfbfc46';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aT;
uniform mat4 uVP, uM; out vec3 vW, vN, vT, vL;
void main(){ vec4 w = uM * vec4(aPos, 1.); vW = w.xyz; vN = mat3(uM) * aNor; vT = aT; vL = aPos; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vT, vL; out vec4 o;
uniform vec3 uCam, uTint, uPaint; uniform mat3 uV; uniform float uSpin, uHi;
uniform int uCut; uniform vec4 uHoleC[8], uHoleN[8]; uniform int uHoles; uniform vec4 uSlot;
${GLSL}
vec3 env(vec3 r){
  vec3 c = mix(vec3(0.2, 0.19, 0.18), vec3(0.5, 0.51, 0.53), smoothstep(-0.5, 0.9, r.y));
  c += vec3(2.6, 2.5, 2.3) * smoothstep(0.72, 0.95, dot(r, normalize(vec3(0.3, 0.9, 0.35))));
  c += vec3(1.2, 1.25, 1.35) * smoothstep(0.55, 0.95, dot(r, normalize(vec3(-0.8, 0.35, 0.4))));
  c += vec3(1.0) * smoothstep(0.3, 1.0, dot(r, normalize(vec3(0.1, -0.05, 1.))));
  return c;
}
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  int kind = int(vT.x + 0.5);
#ifdef LIT
  if (kind == 7) { o = vec4(backdrop(vT.yz, uCam), 1.); return; }
#endif
  if (kind == 7) { float r = length(vT.xy * vec2(1.0, 0.8) - vec2(0., 0.25));
    o = vec4(mix(vec3(0.085, 0.09, 0.1), vec3(0.018, 0.02, 0.026), smoothstep(0.0, 1.4, r)), 1.); return; }
  if (uCut == 1) {
    // holes and a slot, cut out of the part's surface (the hole's own wall is drawn as its own mesh)
    for (int i = 0; i < 8; i++) { if (i >= uHoles) break;
      vec3 d = vL - uHoleC[i].xyz; float a = -dot(d, uHoleN[i].xyz); vec3 q = d + a * uHoleN[i].xyz;
      if (a > -0.02 && a < uHoleN[i].w && dot(q, q) < uHoleC[i].w * uHoleC[i].w) discard; }
    if (uSlot.x > 0. && abs(vL.x) < uSlot.x && vL.z > uSlot.y - 0.001 && vL.y > min(uSlot.z, uSlot.w) && vL.y < max(uSlot.z, uSlot.w)) discard;
  }
#ifdef LIT
  if (uDepthOnly == 1) { o = vec4(0.); return; }
#endif
  vec3 n = normalize(vN), v = normalize(uCam - vW);
  if (dot(n, v) < 0.) n = -n;
  vec3 base; float rough = 0.3;
  if (kind == 0) { base = uTint * 1.08; rough = 0.3; base *= 0.96 + 0.04 * sin(vT.y * 140.); }                       // turned brass
  else if (kind == 15 || kind == 16) { base = uTint * 1.08; rough = 0.3; }                                     // milled brass: 15 by a fly cutter or an end mill's bottom, 16 by a cutter's side
  else if (kind == 1) { base = vec3(0.6, 0.62, 0.65); rough = 0.42; base *= 0.95 + 0.05 * sin(vT.y * 3.); }  // machined steel
  else if (kind == 2) { base = uPaint; rough = 0.75; base *= 0.94 + 0.06 * hash(floor(vL * 1.5)); }           // painted cast iron
  else if (kind == 3) { base = vec3(0.6, 0.62, 0.65); rough = 0.38; }                                        // ground tool steel
  else if (kind == 4) { base = vec3(0.12, 0.125, 0.135); rough = 0.35; }                                       // black oxide
  else if (kind == 5) { base = uTint * (0.62 + 0.38 * smoothstep(-0.6, 0.6, sin(vT.y * 20.944))); rough = 0.3; } // a thread, 0.3 mm pitch
  else if (kind == 6) { base = uTint * 1.05; rough = 0.15; }                                                   // chips
  else if (kind == 8) { base = uTint * 0.55; rough = 0.5; }                                                    // inside a hole
  else if (kind == 9) { base = uTint * (0.35 + 0.3 * smoothstep(-0.6, 0.6, sin(vT.y * 20.944))); rough = 0.5; }  // a tapped hole
  else if (kind == 10) { float a = atan(vL.y, vL.x); base = vec3(0.78, 0.8, 0.83) * (0.55 + 0.45 * smoothstep(-0.3, 0.3, sin(a * vT.y - vL.z * vT.z + uSpin))); rough = 0.15; } // fluted cutter: right-hand flutes, turning clockwise seen from the shank
  else if (kind == 11) { base = vec3(0.05, 0.05, 0.055); rough = 0.6; }                                         // black
  else if (kind == 12) { base = uPaint * 0.35; rough = 0.8; }                                                    // a T-slot's shadow
  else if (kind == 13) { base = vec3(0.42, 0.44, 0.47); rough = 0.45; }                                       // chuck jaws, hardened and ground
  else if (kind == 14) { base = uTint * vec3(0.7, 0.62, 0.52) * (0.94 + 0.06 * hash(floor(vL * 2.5))); rough = 0.75; }  // brass bar as it came: dull, sawn
  else { base = vec3(0.6, 0.62, 0.66); rough = 0.4; }                                                            // tool holders, plain steel
  if (kind == 1 || kind == 13) { base *= 0.75; rough = max(rough, 0.62); }                         // the machines' steel is used, not polished
  else if (kind == 3 || kind == 10) { base *= 0.85; rough = max(rough, 0.45); }
#ifdef LIT
  {
    // as in photos of real shops: brass bright, steel a satin mid gray, black oxide a dark gray, cast iron lumpy under its paint
    bool brass = kind == 0 || kind == 5 || kind == 6 || kind == 8 || kind == 9 || kind == 14 || kind == 15 || kind == 16, mtl = kind != 2 && kind != 11 && kind != 12;
    if (brass) base = clamp(base / uTint, 0., 1.2) * vec3(0.98, 0.80, 0.52);
    if (kind == 14) base = vec3(0.86, 0.76, 0.55) * (0.94 + 0.06 * hash(floor(vL * 2.5)));
    // the marks a cut leaves: rings from turning, arcs from a fly cutter or an end mill's bottom, none from a cutter's side
    int fin = (kind == 0 || kind == 5) ? 1 : (kind == 15 ? 2 : (kind == 1 ? 4 : (mtl ? 0 : 3)));
    float rr = mtl ? (brass && kind != 14 ? rough * 0.5 : max(rough, 0.42)) : 0.55;
    // the machines and tools are used, not polished: satin steel dulled by an oil film, wear and grime, which stay put
    // on each part (its own coordinates, in millimeters) as it moves
    if (!brass && mtl && kind != 4 && kind != 10) { base = vec3(0.62, 0.62, 0.61); rr = max(rough, 0.64); }
    if (kind == 3) { base = vec3(0.68, 0.68, 0.67); rr = 0.52; }    // ground tool steel keeps a finer finish
    if (kind == 4) { base = vec3(0.32, 0.32, 0.33); rr = 0.62; }
    if (kind == 13) { base = vec3(0.56, 0.56, 0.55); rr = 0.62; }
    if (kind == 10) rr = 0.48;
    if (!brass && mtl) {
      float grime = smoothstep(0.35, 0.85, vnoise(vL * 0.05)) * 0.6 + 0.25 * vnoise(vL * 0.6) + 0.15 * vnoise(vL * 3.);
      base *= 1. - 0.28 * grime; rr = min(rr + 0.18 * grime, 0.85);
    }
    if (kind == 2) { base = uPaint; rr = 0.85; }                   // (its texture comes from shade)
    o = vec4(shade(base, rr, mtl, fin, n, v, vW, vL), 1.); return;
  }
#endif
  vec3 nv = uV * n, vv = uV * v, r = normalize(mix(reflect(-vv, nv), nv, rough));
  float fr = 0.65 + 0.35 * pow(1. - max(dot(nv, vv), 0.), 5.);
  float dif = max(dot(n, normalize(vec3(0.25, 0.9, 0.35))), 0.);
  bool metal = kind != 2 && kind != 11 && kind != 12;
  vec3 c = metal ? base * (0.14 + 0.3 * dif) + base * env(r) * fr * mix(1., 0.75, rough)
                 : base * (0.18 + 0.75 * dif) + 0.05 * env(r) * fr;
  c += uHi * vec3(0.08, 0.06, 0.02);
  c = c / (1. + 0.22 * c);
  o = vec4(pow(c, vec3(0.92)), 1.);
}`;

// ---- matrices (column-major) ----
export const M4 = {
  id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  t: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
  s: (k) => new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]),
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  ry(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  rz(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  // from a row-major 3 × 3 rotation and an origin
  rows(R, o = [0, 0, 0]) { return new Float32Array([R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, o[0], o[1], o[2], 1]); },
  // the frame whose z axis is a (unit), placed at o
  axis(a, o = [0, 0, 0]) {
    const t = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(t, a)), y = cross(a, x);
    return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, a[0], a[1], a[2], 0, o[0], o[1], o[2], 1]);
  },
  apply(m, p) { return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]); },
  dir(m, p) { return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2]); },
};
const ALONG_X = new Float32Array([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]);   // local z to world x (local x to y, y to z)
const ALONG_Y = new Float32Array([0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);   // local z to world y
const K = (kind, a = 0, b = 0) => [kind, a, b];

// ---- meshes on the GPU ----
function mesh(gl, g, dynamic = false) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const bufs = [0, 1, 2].map((loc) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); return b; });
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bindVertexArray(null);
  const m = {
    count: 0,
    set(g) {
      gl.bindVertexArray(vao);
      [g.P, g.N, g.T].forEach((a, i) => { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(g.I), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.bindVertexArray(null); m.count = g.I.length; m.g = g;   // (the geometry is kept for the collision check)
    },
    draw() { if (!m.count) return; gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); },
  };
  if (g) m.set(g);
  return m;
}
// a cylinder about local z from z0 to z1, closed at both ends
function cyl(g, r, z0, z1, kind, seg = 48) { lathe(g, [[0, z0], [r, z0], [r, z1], [0, z1]], kind, seg); }
// a prism: a polygon in local xy (counterclockwise) extruded from z0 to z1
function prism(g, pts, z0, z1, kind) {
  poly(g, pts.map(([x, y]) => [x, y, z1]), [0, 0, 1], K(kind));
  poly(g, pts.slice().reverse().map(([x, y]) => [x, y, z0]), [0, 0, -1], K(kind));
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], n = norm([by - ay, -(bx - ax), 0]);
    poly(g, [[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]], n, K(kind));
  }
}
// move every point of g made since `from` by the matrix m
function place(g, from, m) {
  for (let i = from; i < g.P.length / 3; i++) {
    const p = M4.apply(m, [g.P[3 * i], g.P[3 * i + 1], g.P[3 * i + 2]]), n = M4.dir(m, [g.N[3 * i], g.N[3 * i + 1], g.N[3 * i + 2]]);
    g.P.splice(3 * i, 3, ...p); g.N.splice(3 * i, 3, ...n);
  }
}
const mark = (g) => g.P.length / 3;

// ---- the lathe ----
// x along the spindle (the chuck's jaws end at x = 0, the tailstock is toward +x), y up, z toward the operator.
const CENTER = 95;        // center height above the bed's ways
function latheParts() {
  const p = {};
  let g = grow();
  // headstock and bed (painted), ways (ground steel)
  box(g, [-260, -CENTER - 60, -95], [-75, 75, 80], K(2));
  box(g, [-260, -CENTER - 140, -90], [330, -CENTER - 18, 75], K(2));
  box(g, [-260, -CENTER - 18, -70], [330, -CENTER - 4, -45], K(1)); box(g, [-260, -CENTER - 18, 30], [330, -CENTER - 4, 55], K(1));
  box(g, [-262, -CENTER - 60, 60], [-240, -CENTER + 60, 82], K(11));     // a dark gearbox cover
  p.base = g;
  // the 3-jaw chuck (turns): back plate, body, and three key sockets
  g = grow();
  let m0 = mark(g); lathe(g, [[0, -75], [36, -75], [36, -66], [50, -66], [50, -58], [52, -56], [52, -20], [50, -18], [16, -18], [16, -18]], 1, 96); place(g, m0, ALONG_X);
  for (let k = 0; k < 3; k++) { m0 = mark(g); box(g, [-38, 49, -3], [-32, 52.3, 3], K(11)); place(g, m0, M4.rx(k * 2 * Math.PI / 3 + Math.PI / 3)); }
  p.chuck = g;
  // the carriage (moves along x with the tool), the cross slide (moves in z), the compound (turns to the taper's angle)
  g = grow(); box(g, [-32, -CENTER - 4, -60], [32, -CENTER + 14, 58], K(2)); box(g, [-44, -CENTER - 36, 52], [44, -CENTER + 8, 70], K(2)); p.carriage = g;
  g = grow(); box(g, [-26, -CENTER + 14, -40], [26, -CENTER + 30, 44], K(2)); let m1 = mark(g); cyl(g, 4, 0, 34, 1); place(g, m1, M4.t(0, -CENTER + 22, 44)); p.cross = g;
  // the compound: its base turns on the cross slide to the taper's angle, and its top slide carries the tool post along that angle
  g = grow(); box(g, [-18, -CENTER + 30, -22], [18, -CENTER + 36, 26], K(2)); p.compound = g;
  g = grow(); box(g, [-15, -CENTER + 36, -22], [15, -CENTER + 42, 26], K(2)); m1 = mark(g); cyl(g, 3, 0, 26, 1); place(g, m1, M4.t(0, -CENTER + 39, 26)); p.top = g;
  // the tool post: a block with a slot the 6 mm bit sits in, clamped by two screws from the top
  g = grow(); box(g, [-7, -CENTER + 42, 13], [15, -6.2, 37], K(4)); box(g, [-7, 0.2, 13], [15, 4, 37], K(4)); box(g, [13, -6.2, 13], [15, 0.2, 37], K(4));
  for (const z of [19, 30]) { m1 = mark(g); cyl(g, 2.5, 0, 4, 4, 20); place(g, m1, M4.mul(M4.t(4, 4, z), M4.rx(-Math.PI / 2))); }
  p.post = g;
  p.holder = grow();
  // tailstock: body and quill
  g = grow(); box(g, [0, -CENTER - 4, -60], [170, -20, 60], K(2)); box(g, [20, -22, -32], [150, 26, 32], K(2)); p.tail = g;
  g = grow(); m0 = mark(g); cyl(g, 16, 0, 120, 1); place(g, m0, ALONG_X); p.quill = g;
  // a drill chuck on the quill's nose (local: nose at x = 0, pointing -x)
  g = grow(); m0 = mark(g); lathe(g, [[0, 0], [5, 0], [7, 4], [13, 12], [14, 28], [12, 40], [8, 52], [0, 52]], 1, 64); place(g, m0, ALONG_X); p.jacobs = g;
  // a die holder (local: the die's front face at x = 0): a sleeve round a 16 mm round die
  g = grow(); m0 = mark(g); lathe(g, [[2.6, 0], [8, 0], [8, -0.01], [12, -0.01], [12, 0], [15, 0], [15, 30], [8, 30], [8, 45], [0, 45]], 1, 64); place(g, m0, ALONG_X);
  m0 = mark(g); lathe(g, [[0.7, 0], [8, 0], [8, 5], [0.7, 5], [0.7, 0]], 4, 64); place(g, m0, ALONG_X); p.die = g;
  return p;
}
// the collet chuck (turns): body, nut, and the collet, whose face is at x = 0 and whose bore is the size it grips (rg).
// stop (for a short part set in by its end): where the part's inner end is; a stop rod fills the bore from there back.
export function colletMesh(rg, stop = null) {
  const g = grow(); let m0 = mark(g);
  lathe(g, [[0, -75], [36, -75], [36, -66], [26, -64], [26, -24], [17, -16], [17, -4], [8, -4], [7, 0], [rg, 0], [rg, -20], [0, -20]], 1, 96); place(g, m0, ALONG_X);
  if (stop !== null && stop > -20 && stop < 0) { m0 = mark(g); lathe(g, [[0, -20], [rg - 0.05, -20], [rg - 0.05, stop], [0, stop]], 1, 48); place(g, m0, ALONG_X); }
  for (let k = 0; k < 6; k++) { m0 = mark(g); box(g, [-16, 15.6, -1.5], [-6, 17.6, 1.5], K(4)); place(g, m0, M4.rx(k * Math.PI / 3)); }
  return g;
}
// lathe tools, local frame: the cutting tip at the origin, shank toward +z (the operator), top face at y = 0
export function latheTool(t) {
  const g = grow(), m0 = mark(g);
  if (t.type === 'part') { box(g, [-t.w, -9, 0], [0, 0, 28], K(3)); return g; }
  if (t.type === 'boring') {
    // a small boring bar, Ø1.8 for its first 9 mm, along the spindle axis, for a recess too small for a square bit. Below the cutting
    // edges the head steps back toward the tailstock, the clearance that lets it face a small radius and follow a cone
    const head = [[0, 0], [2.4, 1.2], [2.4, -2.2], [0.9, -1.5]];
    for (const [y0, y1, back] of [[-0.3, 0, 0], [-1, -0.3, 0.6], [-2, -1, 1.1]]) {
      const m = mark(g); prism(g, head.map(([x, z]) => [x + back, z]), y0, y1, 3);
      place(g, m, new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]));
    }
    let m = mark(g); lathe(g, [[0, 2.4], [0.9, 2.4], [0.9, 9], [2.5, 10.6], [2.5, 44], [0, 44]], 3, 24); place(g, m, M4.mul(M4.t(0, -1.2, -0.9), ALONG_X));
    // its holder: a block round the bar, with a 6 mm shank that lies in the tool post's slot under the two screws
    box(g, [31, -7, -3.5], [45, 1.5, 12], K(1)); box(g, [31, -6, 12], [45, 0, 34], K(1));
    return g;
  }
  // a ground high-speed-steel bit, 6 mm square: nothing of it lies past the tip on the cutting side, so it can reach a shoulder
  const s = t.left ? -1 : 1, pts = [[0, 0], [5.6 * s, 1.4], [6 * s, 34], [0.4 * s, 34], [0.25 * s, 5]];
  const ordered = s > 0 ? pts.slice().reverse() : pts;
  const g2 = grow();
  prism(g2, ordered.map(([x, z]) => [x, z]), -6, 0, 3);
  // the prism was built in xy; turn it so that its "y" is z and its extrusion is y
  place(g2, 0, new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]));
  return g2;
}
// a drill, center drill or reamer, local: the tip at the origin, body along +z
export function rotaryTool(t) {
  const g = grow(), r = t.d / 2;
  // a center drill, to the sizes the pass cuts with (cut.js): a 118° point, a pilot 1.2 diameters long, a 60° cone, the body
  if (t.type === 'center') { const pr = t.pilot / 2, pl = t.pilot * 1.2;
    lathe(g, [[0, 0], [pr, pr / Math.tan(59 * Math.PI / 180)], [pr, pl], [r, pl + (r - pr) / Math.tan(30 * Math.PI / 180)], [r, 22], [0, 22]], 3, 32); return g; }
  if (t.type === 'reamer') { lathe(g, [[0, 0], [r * 0.9, 0], [r, 0.3], [r, 14], [r * 0.95, 16], [r * 0.95, 40], [0, 40]], 10, 48);
    for (let i = 0; i < g.T.length; i += 3) { g.T[i + 1] = 6; g.T[i + 2] = 0; } return g; }
  // a twist drill: 118° point, fluted body, plain shank
  const tip = r / Math.tan(59 * Math.PI / 180), L = Math.max(12, r * 14);
  lathe(g, [[0, 0], [r, tip], [r, L]], 10, 48);
  for (let i = 0; i < g.T.length; i += 3) { g.T[i + 1] = 2; g.T[i + 2] = 2 * Math.PI / (Math.PI * 2 * r * 1.6) * 2 * Math.PI / 2; }
  lathe(g, [[r, L], [r, L + 20], [0, L + 20]], 3, 48);
  return g;
}

// A cutter on the mill turns clockwise seen from its shank: about its own axis the angle goes down. The cutters'
// teeth are built to match (their cutting faces are on the side of the smaller angle), and so are a drill's flutes.
export const TURN = -1;
// ---- the mill ----
// x along the table, y toward the column, z up. The table's top is z = 0.
function millParts() {
  const p = {};
  let g = grow();
  box(g, [-260, -85, -60], [260, 85, 0], K(2));
  for (const y of [-50, 0, 50]) box(g, [-260, y - 7, -0.3], [260, y + 7, 0.05], K(12));
  box(g, [-150, -110, -400], [150, 120, -60], K(2));       // the saddle and knee below
  p.table = g;
  // the vise: body, fixed jaw (+y), moving jaw (-y), jaw plates, screw and handle. Jaws open to w; the floor at 30.
  p.vise = (w) => {
    const g = grow(), o = w / 2;
    box(g, [-52, -95, 0], [52, 75, 30], K(2));
    box(g, [-52, o + 4, 30], [52, o + 28, 56], K(2)); box(g, [-50, o, 31], [50, o + 4, 55], K(1));
    box(g, [-52, -o - 28, 30], [52, -o - 4, 56], K(2)); box(g, [-50, -o - 4, 31], [50, -o, 55], K(1));
    const m0 = mark(g); cyl(g, 7, 0, 60, 1); place(g, m0, M4.mul(M4.t(0, -o - 28, 40), M4.rx(Math.PI / 2)));
    const m1 = mark(g); cyl(g, 4, -70, 70, 1); place(g, m1, M4.mul(M4.t(0, -o - 88, 40), M4.ry(Math.PI / 2)));
    return g;
  };
  // a drill chuck and a collet nut, local: the nose at z = 0, body up +z
  g = grow(); lathe(g, [[0, 0], [5, 0], [7, 4], [13, 12], [14, 28], [12, 40], [8, 52], [0, 52]], 1, 64); p.jacobs = g;
  g = grow(); lathe(g, [[0, 0], [9, 0], [12, 3], [12, 15], [16, 15], [16, 24], [0, 24]], 1, 6); p.nut = g;
  return p;
}
// the spin indexer (5C): body, spindle nose, a collet nut, and a handwheel. Local: spindle axis +x at height 0, nose at x = 0.
function indexerParts() {
  const g = grow();
  box(g, [-120, -45, -75], [-20, 45, -55], K(2));
  box(g, [-95, -38, -55], [-35, 38, 30], K(2));
  let m0 = mark(g); lathe(g, [[0, -35], [32, -35], [32, -12], [26, -6], [17, -2], [17, 0], [15.2, 0], [15.2, -6], [0, -6]], 1, 72); place(g, m0, ALONG_X);
  m0 = mark(g); lathe(g, [[0, -160], [45, -160], [45, -150], [10, -150], [10, -95], [0, -95]], 1, 72); place(g, m0, ALONG_X);
  return g;
}
// the tilting dividing head: base fixed, the swivel block tilts by beta about y. Local: spindle along +x, nose at x = 0.
function dividingParts() {
  const base = grow(); box(base, [-140, -60, -95], [-10, 60, -75], K(2)); box(base, [-120, -55, -75], [-30, -38, 25], K(2)); box(base, [-120, 38, -75], [-30, 55, 25], K(2));
  const head = grow(); box(head, [-100, -38, -38], [-25, 38, 38], K(2));
  let m0 = mark(head); lathe(head, [[0, -25], [30, -25], [30, -10], [20, -4], [12, -1], [12, 0], [0, 0]], 1, 72); place(head, m0, ALONG_X);
  m0 = mark(head); lathe(head, [[0, -170], [42, -170], [42, -160], [8, -160], [8, -100], [0, -100]], 1, 72); place(head, m0, ALONG_X);
  return { base, head };
}
// mill tools, local: the tip (bottom) at the origin, axis +z up into the spindle
export function millTool(t) {
  const g = grow();
  if (t.type === 'fly') {
    cyl(g, 12, 6, 40, 4); box(g, [-15, -6, 6], [15, 6, 16], K(4));
    box(g, [t.d / 2 - 3.5, -2, 0], [t.d / 2, 2, 10], K(3));   // the bit: its outer corner cuts at radius d / 2
    return g;
  }
  if (t.type === 'end') { const r = t.d / 2; lathe(g, [[0, 0], [r, 0], [r, t.d * 2]], 10, 48); lathe(g, [[r, t.d * 2], [r, 60], [0, 60]], 3, 48);
    for (let i = 0; i < g.T.length; i += 3) if (g.T[i] === 10) { g.T[i + 1] = 4; g.T[i + 2] = 1.2 / r; } return g; }
  if (t.type === 'chamfer' || t.type === 'spot') { const r = t.d / 2; lathe(g, [[0, 0], [r, r], [r, r + t.d], [Math.min(r, 3), r + t.d + 1], [Math.min(r, 3), 50], [0, 50]], t.type === 'chamfer' ? 10 : 3, 48);
    for (let i = 0; i < g.T.length; i += 3) if (g.T[i] === 10) { g.T[i + 1] = 4; g.T[i + 2] = 0; } return g; }
  if (t.type === 'drill') return rotaryTool(t);
  if (t.type === 'tap') { const r = 0.7; lathe(g, [[0, 0], [0.45, 0], [r, 0.6], [r, 4], [0.6, 5], [0.6, 22], [0, 22]], 3, 24);
    for (let i = 0; i < g.T.length; i += 3) if (g.P[i + 2] < 4.01) g.T[i] = 9;
    box(g, [-0.5, -0.5, 22], [0.5, 0.5, 26], K(3)); return g; }
  return g;
}
// a form cutter for gear teeth (local: axis z, centered), with its arbor. t.profile: half the cutter's width at each
// height above its lowest point (spec.js). Each tooth's cutting face is the one at the smaller angle: the cutter
// turns clockwise seen from +z.
export function gearCutter(t) {
  const g = grow(), R = t.d / 2, w = t.w, Z = 14, H = 3.2;
  const prof = [...(t.profile || [[0, w * 0.2]]).filter((q) => q[0] < H - 0.05), [H, w / 2]];
  lathe(g, [[8, -w / 2], [R - H, -w / 2], [R - H, w / 2], [8, w / 2]], 3, 72);
  const quad = (a, b, c, d) => poly(g, [a, b, c, d], norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]])), K(3));
  for (let k = 0; k < Z; k++) {
    const a0 = k * 2 * Math.PI / Z, s = 2 * Math.PI / Z;
    // the tooth's four corners at height y below its top: front (the cutting face) and back, either side
    const at = ([y, hw]) => { const r = R - y, af = a0 + 0.08 * s * (1 - y / H), ab = a0 + 0.45 * s + 0.17 * s * y / H;
      return { f: [-1, 1].map((e) => [r * Math.cos(af), r * Math.sin(af), e * hw]), b: [-1, 1].map((e) => [r * Math.cos(ab), r * Math.sin(ab), e * hw]) }; };
    const L = prof.map(at);
    quad(L[0].f[0], L[0].f[1], L[0].b[1], L[0].b[0]);
    for (let i = 0; i + 1 < L.length; i++) {
      const A = L[i], B = L[i + 1];
      quad(A.f[0], A.f[1], B.f[1], B.f[0]); quad(A.b[0], A.b[1], B.b[1], B.b[0]);
      for (const e of [0, 1]) quad(A.f[e], A.b[e], B.b[e], B.f[e]);
    }
  }
  cyl(g, 8, -18, 18, 1);
  cyl(g, 4, -120, 120, 1);
  return g;
}
export function sawCutter(t) {
  const g = grow(), R = t.d / 2, Z = 48, w = t.w / 2;
  lathe(g, [[5, -w], [R - 0.8, -w], [R - 0.8, w], [5, w]], 3, 96);
  for (let k = 0; k < Z; k++) {
    const a = k * 2 * Math.PI / Z, s = 2 * Math.PI / Z, p0 = [(R - 0.8) * Math.cos(a), (R - 0.8) * Math.sin(a)], p1 = [R * Math.cos(a + s * 0.15), R * Math.sin(a + s * 0.15)], p2 = [(R - 0.8) * Math.cos(a + s), (R - 0.8) * Math.sin(a + s)];
    prism(g, [p0, p1, p2], -w, w, 3);
  }
  cyl(g, 5, w, 4, 1); cyl(g, 5, -4, -w, 1); cyl(g, 3, 4, 60, 3);
  return g;
}
// ---- the part's meshes ----
// a turned part from its two radii, in its own frame (axis z)
export function turnedMesh(S, kind = 0) {
  const g = grow();
  for (const L of outline(S)) {
    const outer = L.outer, inner = L.inner.slice().reverse();
    // the outside, band by band: the thread, the bar as it came (not yet cut), and turned metal
    const th = S.thread, raw = (r) => S.stockR && Math.abs(r - S.stockR) < 1e-4;
    for (let k = 0; k + 1 < outer.length; k++) {
      const a = outer[k], b = outer[k + 1], zm = (a[1] + b[1]) / 2;
      lathe(g, [a, b], th && zm >= th[0] && zm <= th[1] ? 5 : raw(a[0]) && raw(b[0]) ? 14 : kind, 72);
    }
    // the end faces and the inside
    // an end still as it was sawn off the bar is rough
    const sawn = (z) => S.sawn !== undefined && Math.abs(z - S.sawn) < 0.02 ? 14 : kind;
    lathe(g, [outer[outer.length - 1], [inner[0][0], outer[outer.length - 1][1]]], sawn(L.z1), 72);
    if (inner.some((p) => p[0] > 1e-4)) lathe(g, inner, kind, 72);
    lathe(g, [[inner[inner.length - 1][0], L.z0], outer[0]], sawn(L.z0), 72);
  }
  return g;
}
// a convex milled part from its planes. With a plane part-way cut: the part below the cut, whole, and on it the
// slab the cutter has not reached yet. A face looks as the cutter that made it left it.
const faceKind = (k) => (k === 'stock' ? 14 : k === 'fly' || k === 'end' ? 15 : k === 'chamfer' || k === 'split' ? 16 : 0);
export function milledMesh(M) {
  const g = grow(), add = (planes, ...skip) => { for (const f of bodyFaces(planes)) { if (skip.includes(f.kind)) continue; poly(g, f.poly, f.n, K(faceKind(f.kind), 0)); } };
  if (!M.cut) { add(M.planes); return g; }
  const c = M.cut, under = { n: c.n.map((x) => -x), d: -c.d, kind: 'under' };
  add([...M.planes, { n: c.n, d: c.d, kind: c.kind || 'cut' }]);
  if (c.R) {
    // a fly cutter or end mill: the edge of the cut is the front arc of its circle, taken as chords in bands across the feed
    const { R, v, vc } = c, a = c.s - R, vs = bodyFaces([...M.planes, under]).flatMap((f) => f.poly.map((q) => dot(q, v)));
    if (!vs.length) return g;
    const v0 = Math.min(...vs) - 0.01, v1 = Math.max(...vs) + 0.01, N = 12;
    const at = (y) => { const k = Math.min(Math.abs(y - vc), R); return a + Math.sqrt(R * R - k * k); };
    for (let i = 0; i < N; i++) {
      const y0 = v0 + (v1 - v0) * i / N, y1 = v0 + (v1 - v0) * (i + 1) / N, x0 = at(y0), x1 = at(y1);
      // the chord's normal, pointing ahead: m · p = m · A on the chord
      const m = norm([0, 1, 2].map((k) => c.u[k] * (y1 - y0) - v[k] * (x1 - x0))), A = [0, 1, 2].map((k) => c.u[k] * x0 + v[k] * y0);
      const md = dot(m, A), band = [{ n: v, d: y1, kind: 'band' }, { n: v.map((x) => -x), d: -y0, kind: 'band' }];
      add([...M.planes, under, ...band, { n: m.map((x) => -x), d: -md, kind: 'split' }], 'band', 'under');
    }
  } else add([...M.planes, under, { n: c.u.map((x) => -x), d: -c.s, kind: 'split' }], 'under');   // ahead of the tool: still whole
  return g;
}
// the walls of holes: drilled (with the drill's point), spotted (a 90° cone), tapped (with the thread drawn)
export function holeMesh(M) {
  const g = grow();
  for (const h of M.holes) {
    const m0 = mark(g), r = h.d / 2, spot = h.spot;
    const pts = [];
    if (spot > 0) pts.push([spot, 0]);                       // the spot's cone, from the surface in
    if (h.depth > 0) {
      const cone = Math.min(spot, r);
      pts.push([r, Math.max(cone, 0.0001)]);
      pts.push([r, h.depth]); pts.push([0, h.depth + r / Math.tan(59 * Math.PI / 180)]);
    } else if (spot > 0) pts.push([0, spot]);
    if (pts.length < 2) continue;
    lathe(g, pts.map(([rr, d]) => [rr, -d]), h.tap > 0 ? 8 : 8, 32);
    if (h.tap > 0) { const m1 = mark(g); lathe(g, [[r * 1.04, -Math.min(spot, r)], [r * 1.04, -h.tap]], 9, 32); for (let i = m1; i < mark(g); i++) g.T[3 * i + 1] = -g.P[3 * i + 2]; }
    place(g, m0, M4.axis(h.n, h.c));
  }
  return g;
}
// a screw's slot, as far as it has been sawn: the slot runs along y across the flange, x within ±w/2. The saw's rim
// is a circle, so ahead of its nearest point (at `to`) the floor rises along its arc (lead: how far ahead the arc
// leaves the head's top).
export function slotMesh(top, R, w, depth, from, to, lead = 0) {
  const g = grow(), sg = Math.sign(to - from) || 1, far = to + sg * lead, lo = Math.max(Math.min(from, far), -R), hi = Math.min(Math.max(from, far), R), z0 = top - depth;
  if (hi <= lo) return g;
  const Rs = lead ? (lead * lead + depth * depth) / (2 * depth) : 0;
  const floor = (y) => { const a = (y - to) * sg; return a <= 0 || !Rs ? z0 : Math.min(top, z0 + Rs - Math.sqrt(Math.max(0, Rs * Rs - a * a))); };
  const xw = w / 2, ext = (y) => Math.sqrt(Math.max(0, R * R - y * y)), n = 32;
  const ys = []; for (let k = 0; k <= n; k++) ys.push(lo + (hi - lo) * k / n);
  for (const s of [1, -1]) for (let k = 0; k < n; k++) { const a = ys[k], b = ys[k + 1]; if (ext(a) < xw && ext(b) < xw) continue; poly(g, [[s * xw, a, floor(a)], [s * xw, b, floor(b)], [s * xw, b, top], [s * xw, a, top]], [-s, 0, 0], K(16)); }
  for (let k = 0; k < n; k++) { const a = ys[k], b = ys[k + 1]; poly(g, [[-xw, a, floor(a)], [xw, a, floor(a)], [xw, b, floor(b)], [-xw, b, floor(b)]], [0, 0, 1], K(16)); }
  // where the arc runs out through the head's far side, the metal still under it
  for (const y of [lo, hi]) if (floor(y) > z0 + 1e-6) poly(g, [[-xw, y, z0], [xw, y, z0], [xw, y, floor(y)], [-xw, y, floor(y)]], [0, y > 0 ? 1 : -1, 0], K(16));
  return g;
}

export function makeShop(gl, lit) {
  const prog = program(gl, VS, lit ? withLit(FS) : FS), u = prog.u;
  const L = latheParts(), MP = millParts(), up = (g) => mesh(gl, g);
  const lathe3 = { base: up(L.base), chuck: up(L.chuck), carriage: up(L.carriage), cross: up(L.cross), compound: up(L.compound), top: up(L.top), post: up(L.post), holder: up(L.holder), tail: up(L.tail), quill: up(L.quill), jacobs: up(L.jacobs), die: up(L.die) };
  const mill = { table: up(MP.table), indexer: up(indexerParts()), jacobs: up(MP.jacobs), nut: up(MP.nut) }; const dv = dividingParts(); mill.dbase = up(dv.base); mill.dhead = up(dv.head);
  const quill = grow(); lathe(quill, [[0, 0], [17, 0], [17, 22], [22, 26], [34, 28], [34, 160], [0, 160]], 1, 72); mill.quill = up(quill);
  const cache = new Map(), memo = (key, make) => { if (!cache.has(key)) cache.set(key, up(make())); return cache.get(key); };
  const dyn = { part: mesh(gl, null, true), holes: mesh(gl, null, true), slot: mesh(gl, null, true), jaws: mesh(gl, null, true), extra: mesh(gl, null, true), chips: mesh(gl, null, true) };
  const tri = grow(); tri.v([-1, -1, 0], [0, 0, 1], [7, -1, -1]); tri.v([3, -1, 0], [0, 0, 1], [7, 3, -1]); tri.v([-1, 3, 0], [0, 0, 1], [7, -1, 3]); tri.I.push(0, 1, 2);
  const back = up(tri);
  const I = M4.id();
  let jawKey = '', extraKey = '';
  const BRASS = [0.93, 0.72, 0.4], PAINT = [0.27, 0.32, 0.36];

  return {
    gl, M4, memo, latheTool, rotaryTool, millTool, gearCutter, sawCutter, colletMesh, mesh: (g) => mesh(gl, g, true),
    // f: what to draw (see make.js), cam: { vp, pos, rot }
    draw(f, cam, vpx, hook) {
      gl.viewport(vpx.x, vpx.y, vpx.w, vpx.h);
      gl.clearColor(0.02, 0.025, 0.035, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog.p); hook?.(gl, prog.p);
      gl.disable(gl.DEPTH_TEST); gl.uniformMatrix4fv(u.uVP, false, I); gl.uniformMatrix4fv(u.uM, false, I); gl.uniform1i(u.uCut, 0); back.draw();
      gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uCam, cam.pos); gl.uniformMatrix3fv(u.uV, false, cam.rot);
      gl.uniform3fv(u.uTint, BRASS); gl.uniform3fv(u.uPaint, PAINT); gl.uniform1f(u.uHi, 0);
      const draw = (m, M) => { gl.uniformMatrix4fv(u.uM, false, M); m.draw(); };
      for (const it of f.items) {
        gl.uniform1f(u.uSpin, it.spin || 0);      // a cutter's flutes turn only if the cutter does
        if (it.part) {
          // the part, with its holes and slot cut out
          gl.uniform1i(u.uCut, 1);
          const hs = it.holes || [];
          gl.uniform1i(u.uHoles, hs.length);
          if (hs.length) {
            const C = new Float32Array(32), N = new Float32Array(32);
            hs.forEach((h, i) => { const r = Math.max(h.d / 2, h.spot); C.set([h.c[0], h.c[1], h.c[2], r], 4 * i); N.set([h.n[0], h.n[1], h.n[2], Math.max(h.depth, h.spot) + 1], 4 * i); });
            gl.uniform4fv(u.uHoleC, C); gl.uniform4fv(u.uHoleN, N);
          }
          gl.uniform4fv(u.uSlot, it.slot || [0, 0, 0, 0]);
          draw(it.mesh, it.M);
          gl.uniform1i(u.uCut, 0);
        } else draw(it.mesh, it.M);
      }
    },
    lathe3, mill, dyn, cache, BRASS, millVise: (w) => MP.vise(w),
  };
}
