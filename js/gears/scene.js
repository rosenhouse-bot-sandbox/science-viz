// Gears on a cube and an octahedron: the 3D picture. Each gear is built once per solid from the tooth shape in
// model.js and drawn at its face, turned by the angle model.js gives it. Nothing here decides anything.
import { program, meshBuffers } from './gl.js?v=5a90a021';
import { R_IN, R_OUT, bodyPlanes, bodyFaces } from './model.js?v=5a90a021';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aT;
uniform mat4 uVP, uM; out vec3 vW, vN, vT;
void main(){ vec4 w = uM * vec4(aPos, 1.); vW = w.xyz; vN = mat3(uM) * aNor; vT = aT; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vT; out vec4 o;
uniform vec3 uCam, uTint; uniform mat3 uV; uniform int uKind; uniform float uHi;
// a studio of soft lights, fixed to the camera, so that the metal reads the same from every side
vec3 env(vec3 r){
  vec3 c = mix(vec3(0.05, 0.055, 0.07), vec3(0.5, 0.52, 0.58), smoothstep(-0.5, 0.9, r.y));
  c += vec3(1.8) * pow(max(dot(r, normalize(vec3(0.45, 0.75, 0.5))), 0.), 18.);
  c += vec3(0.7, 0.78, 1.0) * pow(max(dot(r, normalize(vec3(-0.8, 0.25, 0.35))), 0.), 5.) * 0.8;
  c += vec3(1.0, 0.92, 0.82) * pow(max(dot(r, normalize(vec3(0.1, -0.1, 1.))), 0.), 2.) * 0.45;
  return c;
}
void main(){
  if (uKind == 7) {                         // the backdrop: a dark gradient
    float r = length(vT.xy * vec2(1.0, 0.8));
    o = vec4(mix(vec3(0.05, 0.065, 0.11), vec3(0.012, 0.016, 0.035), smoothstep(0.1, 1.3, r)), 1.); return;
  }
  vec3 n = normalize(vN), v = normalize(uCam - vW);
  if (dot(n, v) < 0.) n = -n;
  vec3 nv = uV * n, vv = uV * v, r = reflect(-vv, nv);
  float fr = 0.65 + 0.35 * pow(1. - max(dot(nv, vv), 0.), 5.);
  vec3 base = uTint;
  int kind = uKind == 0 && vT.x > 0.5 ? 1 : uKind;
  if (kind == 1) {                         // the polished cap on each gear, with faint rings from the lathe
    base = vec3(0.8, 0.82, 0.85) * (0.96 + 0.04 * sin(vT.y * 420.));
  } else if (kind == 2) {                  // the body that holds the axles: darker, plain steel
    base = vec3(0.42, 0.44, 0.48);
  }
  float dif = max(dot(nv, normalize(vec3(0.45, 0.75, 0.5))), 0.);
  vec3 c = base * (0.08 + 0.3 * dif) + base * env(r) * fr * 1.1;
  c += uHi * vec3(0.12, 0.1, 0.05);
  o = vec4(c / (1. + 0.15 * c), 1.);
}`;

// ---- meshes ----
function grow() { const P = [], N = [], T = [], I = []; return { P, N, T, I, v(p, n, t) { P.push(...p); N.push(...n); T.push(...t); return P.length / 3 - 1; } }; }
function upload(gl, g) {
  const idx = new Uint32Array(g.I), m = meshBuffers(gl, g.P.length / 3, idx);
  m.setPos(new Float32Array(g.P)); m.setNor(new Float32Array(g.N)); m.setTT(new Float32Array(g.T));
  return m;
}
const dir = (th, ps) => [Math.sin(th) * Math.cos(ps), Math.sin(th) * Math.sin(ps), Math.cos(th)];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// one gear in its own frame (axis along z), tooth 0 centered on the x axis
export function gearGeometry(pr) {
  // the outline round the gear on the sphere: polar angle against azimuth, with the corners marked sharp
  const pts = [], half = pr.half, rows = pr.th.length;
  for (let k = 0; k < pr.N; k++) {
    const c = k * 2 * half;
    const rootW = pr.hw[0];
    pts.push({ th: pr.root, ps: c - half, sharp: false });
    for (let s = 1; s <= 3; s++) pts.push({ th: pr.root, ps: c - half + (half - rootW) * s / 3 * 0.999, sharp: s === 3 });
    for (let r = 1; r < rows; r++) pts.push({ th: pr.th[r], ps: c - pr.hw[r], sharp: r === rows - 1 });
    for (let s = 1; s < 4; s++) pts.push({ th: pr.tip, ps: c - pr.hw[rows - 1] + 2 * pr.hw[rows - 1] * s / 4, sharp: false });
    for (let r = rows - 1; r >= 1; r--) pts.push({ th: pr.th[r], ps: c + pr.hw[r], sharp: r === rows - 1 });
    for (let s = 3; s >= 1; s--) pts.push({ th: pr.root, ps: c + half - (half - rootW) * s / 3 * 0.999, sharp: s === 3 });
  }
  const n = pts.length, g = grow();
  // the toothed side: straight lines from the inner end to the outer end, all aimed at the center
  const segN = [];
  for (let j = 0; j < n; j++) {
    const a = dir(pts[j].th, pts[j].ps), b = dir(pts[(j + 1) % n].th, pts[(j + 1) % n].ps);
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const nn = [m[1] * e[2] - m[2] * e[1], m[2] * e[0] - m[0] * e[2], m[0] * e[1] - m[1] * e[0]], l = Math.hypot(...nn) || 1;
    segN.push(sc(nn, -1 / l));
  }
  const at = (j) => { const p = pts[j]; if (p.sharp) return null; const A = segN[(j - 1 + n) % n], B = segN[j], s = [A[0] + B[0], A[1] + B[1], A[2] + B[2]], l = Math.hypot(...s); return sc(s, 1 / l); };
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n, a = dir(pts[j].th, pts[j].ps), b = dir(pts[j1].th, pts[j1].ps);
    const na = at(j) || segN[j], nb = at(j1) || segN[j];
    const i0 = g.v(sc(a, R_IN), na, [0, 0, 0]), i1 = g.v(sc(a, R_OUT), na, [0, 0, 0]), i2 = g.v(sc(b, R_OUT), nb, [0, 0, 0]), i3 = g.v(sc(b, R_IN), nb, [0, 0, 0]);
    g.I.push(i0, i1, i2, i0, i2, i3);
  }
  // the two ends: parts of spheres about the center, filled from the axis
  for (const [R, s] of [[R_OUT, 1], [R_IN, -1]]) {
    const c = g.v([0, 0, R], [0, 0, s], [0, 0, 0]), first = g.P.length / 3;
    for (let j = 0; j < n; j++) { const d = dir(pts[j].th, pts[j].ps); g.v(sc(d, R), sc(d, s), [0, 0, 0]); }
    for (let j = 0; j < n; j++) { const a = first + j, b = first + (j + 1) % n; s > 0 ? g.I.push(c, a, b) : g.I.push(c, b, a); }
  }
  // the cap: a flat polished disc with a chamfered edge, inside the root cone so that it clears every other gear
  const rc = Math.sin(pr.root) * R_OUT * 0.62, z0 = R_OUT * 0.96, z1 = R_OUT + 0.045, ch = 0.025, seg = 96;
  const ring = (rad, z, nor, t) => { const out = []; for (let k = 0; k <= seg; k++) { const a = k / seg * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a); out.push(g.v([rad * c, rad * s, z], nor(c, s), [1, t, 0])); } return out; };
  const strip = (A, B) => { for (let k = 0; k < seg; k++) g.I.push(A[k], B[k], B[k + 1], A[k], B[k + 1], A[k + 1]); };
  const side = (c, s) => [c, s, 0], bevel = (c, s) => { const l = Math.SQRT1_2; return [c * l, s * l, l]; }, up = () => [0, 0, 1];
  strip(ring(rc, z0, side, rc), ring(rc, z1 - ch, side, rc));
  strip(ring(rc, z1 - ch, bevel, rc), ring(rc - ch, z1, bevel, rc - ch));
  const center = g.v([0, 0, z1], [0, 0, 1], [1, 0, 0]), top = ring(rc - ch, z1, up, rc - ch);
  for (let k = 0; k < seg; k++) g.I.push(center, top[k], top[k + 1]);
  // the cap's flat face carries its radius, for the lathe rings
  for (let k = 0; k <= seg; k++) g.T[3 * top[k] + 1] = rc - ch;
  return g;
}
function bodyGeometry(sh) {
  const g = grow();
  for (const f of bodyFaces(bodyPlanes(sh))) {
    const ids = f.poly.map((p) => g.v(p, f.n, [2, 0, 0]));
    for (let k = 1; k + 1 < ids.length; k++) g.I.push(ids[0], ids[k], ids[k + 1]);
  }
  return g;
}

export function makeScene(gl, SHAPES) {
  const prog = program(gl, VS, FS), u = prog.u;
  const gears = {}, bodies = {};
  for (const sh of SHAPES) { gears[sh.id] = upload(gl, gearGeometry(sh.profile)); bodies[sh.id] = upload(gl, bodyGeometry(sh)); }
  const g = grow(); g.v([-1, -1, 0], [0, 0, 1], [-1, -1, 0]); g.v([3, -1, 0], [0, 0, 1], [3, -1, 0]); g.v([-1, 3, 0], [0, 0, 1], [-1, 3, 0]); g.I.push(0, 1, 2);
  const back = upload(gl, g);
  const I4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return {
    // f: { sh, ang, tint[i], hi (gear index or -1) }, cam: { vp, pos, rot }
    draw(f, cam, vpx) {
      gl.viewport(vpx.x, vpx.y, vpx.w, vpx.h);
      gl.clearColor(0.02, 0.025, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog.p);
      gl.disable(gl.DEPTH_TEST); gl.uniformMatrix4fv(u.uVP, false, I4); gl.uniformMatrix4fv(u.uM, false, I4); gl.uniform1i(u.uKind, 7); back.draw();
      gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uCam, cam.pos); gl.uniformMatrix3fv(u.uV, false, cam.rot);
      const sh = f.sh, mesh = gears[sh.id];
      gl.uniform1f(u.uHi, 0); gl.uniform1i(u.uKind, 2); gl.uniform3fv(u.uTint, [0.5, 0.5, 0.5]); gl.uniformMatrix4fv(u.uM, false, I4); bodies[sh.id].draw();
      for (let i = 0; i < sh.normals.length; i++) {
        const F = sh.frames[i], a = f.ang[i], c = Math.cos(a), s = Math.sin(a);
        const X = [0, 1, 2].map((k) => c * F.x[k] + s * F.y[k]), Y = [0, 1, 2].map((k) => -s * F.x[k] + c * F.y[k]);
        const M = new Float32Array([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, F.z[0], F.z[1], F.z[2], 0, 0, 0, 0, 1]);
        gl.uniformMatrix4fv(u.uM, false, M); gl.uniform3fv(u.uTint, f.tint[i]); gl.uniform1f(u.uHi, f.hi === i ? 1 : 0);
        gl.uniform1i(u.uKind, 0); mesh.draw();
      }
    },
  };
}
