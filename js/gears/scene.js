// Gears on a cube and an octahedron: the 3D picture. The parts are the ones the brass toy is made of: a core block,
// and on each face a washer, a toothed gear with a ball bearing pressed into it, and a flanged screw. Sizes come
// from model.js; nothing here decides how the gears move.
import { program, meshBuffers } from './gl.js?v=c2329040';
import { R_IN, R_OUT, bodyPlanes, bodyFaces, parts } from './model.js?v=c2329040';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aT;
uniform mat4 uVP, uM; out vec3 vW, vN, vT, vL;
void main(){ vec4 w = uM * vec4(aPos, 1.); vW = w.xyz; vN = mat3(uM) * aNor; vT = aT; vL = aPos; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vT, vL; out vec4 o;
uniform vec3 uCam, uTint; uniform mat3 uV; uniform int uKind; uniform float uHi;
// a photographer's studio: a big soft box above and to the right, a dimmer one to the left, a dark floor.
// It is fixed to the camera, so the metal reads the same from every side.
vec3 env(vec3 r){
  vec3 c = mix(vec3(0.16, 0.14, 0.12), vec3(0.45, 0.45, 0.47), smoothstep(-0.4, 0.8, r.y));
  c += vec3(3.0) * smoothstep(0.7, 0.93, dot(r, normalize(vec3(0.55, 0.65, 0.5))));
  c += vec3(1.4) * smoothstep(0.6, 0.95, dot(r, normalize(vec3(-0.75, 0.3, 0.45))));
  c += vec3(1.3) * smoothstep(0.2, 1.0, dot(r, normalize(vec3(0.05, -0.1, 1.))));
  return c;
}
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  if (uKind == 7) {                         // the backdrop: a dark gradient
    float r = length(vT.xy * vec2(1.0, 0.8));
    o = vec4(mix(vec3(0.07, 0.072, 0.08), vec3(0.012, 0.013, 0.018), smoothstep(0.0, 1.3, r)), 1.); return;
  }
  int kind = int(vT.x + 0.5);
  vec3 n = normalize(vN), v = normalize(uCam - vW);
  if (dot(n, v) < 0.) n = -n;
  vec3 base; float rough = 0.;               // rough: how much the reflection is blurred toward the plain diffuse light
  if (kind == 0) { base = uTint; rough = 0.25; }                                  // a gear: turned brass
  else if (kind == 1) { base = vec3(0.96, 0.84, 0.6); rough = 0.12;              // the screw's flange, polished, with lathe rings
    base *= 0.93 + 0.07 * sin(vT.y * 900.); }
  else if (kind == 2) { base = vec3(0.86, 0.67, 0.39); rough = 0.5;              // the core: brushed brass
    base *= 0.92 + 0.08 * hash(floor(vL * vec3(400., 6., 400.))); }
  else if (kind == 3) { base = vec3(0.8, 0.82, 0.85); rough = 0.1; }            // the bearing: polished steel
  else if (kind == 4) { base = vec3(0.9, 0.72, 0.44); rough = 0.3; }            // a washer
  else { base = vec3(0.9, 0.74, 0.48) * (0.75 + 0.25 * sin(vT.y * 260.)); rough = 0.4; }   // the screw's thread
  vec3 nv = uV * n, vv = uV * v, r = normalize(mix(reflect(-vv, nv), nv, rough));
  float fr = 0.7 + 0.3 * pow(1. - max(dot(nv, vv), 0.), 5.);
  float dif = max(dot(nv, normalize(vec3(0.5, 0.7, 0.5))), 0.);
  vec3 c = base * (0.08 + 0.3 * dif) + base * env(r) * fr * mix(1., 0.8, rough);
  c += uHi * vec3(0.1, 0.08, 0.03);
  c = c / (1. + 0.22 * c);
  o = vec4(pow(c, vec3(0.92)), 1.);
}`;

// ---- building meshes ----
function grow() { const P = [], N = [], T = [], I = []; return { P, N, T, I, v(p, n, t) { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); T.push(t[0], t[1], t[2]); return P.length / 3 - 1; } }; }
function upload(gl, g) {
  const m = meshBuffers(gl, g.P.length / 3, new Uint32Array(g.I));
  m.setPos(new Float32Array(g.P)); m.setNor(new Float32Array(g.N)); m.setTT(new Float32Array(g.T));
  return m;
}
const dir = (th, ps) => [Math.sin(th) * Math.cos(ps), Math.sin(th) * Math.sin(ps), Math.cos(th)];
const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const SEG = 72;
// a solid of revolution about z from a list of [radius, height] points; each segment is its own band, so edges stay sharp
function lathe(g, pts, kind, seg = SEG) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [r0, z0] = pts[k], [r1, z1] = pts[k + 1], dr = r1 - r0, dz = z1 - z0, l = Math.hypot(dr, dz) || 1, nr = dz / l, nz = -dr / l;
    const a = [], b = [];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg * 2 * Math.PI, c = Math.cos(t), si = Math.sin(t), n = [nr * c, nr * si, nz];
      a.push(g.v([r0 * c, r0 * si, z0], n, [kind, r0, 0])); b.push(g.v([r1 * c, r1 * si, z1], n, [kind, r1, 0]));
    }
    for (let s = 0; s < seg; s++) g.I.push(a[s], b[s], b[s + 1], a[s], b[s + 1], a[s + 1]);
  }
  // the thread's rings go by height, not radius
  if (kind === 5) for (let i = 0; i < g.T.length; i += 3) if (g.T[i] === 5) g.T[i + 1] = g.P[i + 2];
}
function sphere(g, c, r, kind) {
  const st = 10, sl = 16, first = g.P.length / 3;
  for (let i = 0; i <= st; i++) for (let j = 0; j <= sl; j++) {
    const th = i / st * Math.PI, ph = j / sl * 2 * Math.PI, n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    g.v([c[0] + r * n[0], c[1] + r * n[1], c[2] + r * n[2]], n, [kind, 0, 0]);
  }
  for (let i = 0; i < st; i++) for (let j = 0; j < sl; j++) { const a = first + i * (sl + 1) + j, b = a + sl + 1; g.I.push(a, b, b + 1, a, b + 1, a + 1); }
}

// one gear in its own frame (axis along z), tooth 0 centered on the x axis: a disc with a bore for the bearing, and
// its teeth on a cone round the rim, every tooth surface aimed at the solid's center
function gearGeometry(pr, P) {
  const pts = [], half = pr.half, rows = pr.th.length;
  for (let k = 0; k < pr.N; k++) {
    const c = k * 2 * half, rootW = pr.hw[0];
    pts.push({ th: pr.root, ps: c - half, sharp: false });
    for (let s = 1; s <= 3; s++) pts.push({ th: pr.root, ps: c - half + (half - rootW) * s / 3 * 0.999, sharp: s === 3 });
    for (let r = 1; r < rows; r++) pts.push({ th: pr.th[r], ps: c - pr.hw[r], sharp: r === rows - 1 });
    for (let s = 1; s < 4; s++) pts.push({ th: pr.tip, ps: c - pr.hw[rows - 1] + 2 * pr.hw[rows - 1] * s / 4, sharp: false });
    for (let r = rows - 1; r >= 1; r--) pts.push({ th: pr.th[r], ps: c + pr.hw[r], sharp: r === rows - 1 });
    for (let s = 3; s >= 1; s--) pts.push({ th: pr.root, ps: c + half - (half - rootW) * s / 3 * 0.999, sharp: s === 3 });
  }
  const n = pts.length, g = grow(), K = [0, 0, 0];
  const segN = [];
  for (let j = 0; j < n; j++) {
    const a = dir(pts[j].th, pts[j].ps), b = dir(pts[(j + 1) % n].th, pts[(j + 1) % n].ps);
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const nn = [m[1] * e[2] - m[2] * e[1], m[2] * e[0] - m[0] * e[2], m[0] * e[1] - m[1] * e[0]], l = Math.hypot(...nn) || 1;
    segN.push(sc(nn, -1 / l));
  }
  const at = (j) => { if (pts[j].sharp) return null; const A = segN[(j - 1 + n) % n], B = segN[j], s = [A[0] + B[0], A[1] + B[1], A[2] + B[2]], l = Math.hypot(...s); return sc(s, 1 / l); };
  // the toothed rim
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n, a = dir(pts[j].th, pts[j].ps), b = dir(pts[j1].th, pts[j1].ps), na = at(j) || segN[j], nb = at(j1) || segN[j];
    const i0 = g.v(sc(a, R_IN), na, K), i1 = g.v(sc(a, R_OUT), na, K), i2 = g.v(sc(b, R_OUT), nb, K), i3 = g.v(sc(b, R_IN), nb, K);
    g.I.push(i0, i1, i2, i0, i2, i3);
  }
  // the two faces: the teeth's ends, then the flat disc in to the bore
  const bore = P.bearing.outer;
  for (const [R, z, s] of [[R_OUT, P.front, 1], [R_IN, P.back, -1]]) {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n, A = [j, j1].map((q) => sc(dir(pts[q].th, pts[q].ps), R)), B = [j, j1].map((q) => sc(dir(pr.root, pts[q].ps), R));
      const C = [j, j1].map((q) => [bore * Math.cos(pts[q].ps), bore * Math.sin(pts[q].ps), z]);
      const ids = (L) => L.map((p) => g.v(p, [0, 0, s], K));
      const [a0, a1] = ids(A), [b0, b1] = ids(B), [c0, c1] = ids(C);
      g.I.push(b0, a0, a1, b0, a1, b1, c0, b0, b1, c0, b1, c1);
    }
  }
  lathe(g, [[bore, P.back], [bore, P.front]], 0, 96);
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
// the small parts, in a gear's frame, at their assembled places
function smallParts(P) {
  const B = P.bearing, mid = (P.front + P.back) / 2, w = B.width / 2, ch = 0.008;
  const outer = grow(); lathe(outer, [[B.outer - 0.045, mid - w], [B.outer, mid - w], [B.outer, mid + w], [B.outer - 0.045, mid + w], [B.outer - 0.045, mid - w]], 3);
  const inner = grow(); lathe(inner, [[B.inner, mid - w], [B.inner + 0.045, mid - w], [B.inner + 0.045, mid + w], [B.inner, mid + w], [B.inner, mid - w]], 3);
  const ball = grow(); sphere(ball, [0, 0, 0], B.ball, 3);
  const washer = grow(); lathe(washer, [[P.washer.inner, P.core], [P.washer.inner, P.back], [P.washer.outer, P.back], [P.washer.outer, P.core]], 4);
  const S = P.screw, z0 = P.front + 0.012, z1 = z0 + S.thick;
  const screw = grow();
  lathe(screw, [[0, z1], [S.flange - 0.02, z1], [S.flange, z1 - 0.02], [S.flange, z0], [S.post, z0], [S.post, P.back - 0.02]], 1);
  lathe(screw, [[S.post, P.back - 0.02], [S.post, P.core - S.into], [0, P.core - S.into]], 5);
  return { outer, inner, ball, washer, screw, mid };
}
// how far out along its axis each part sits when the set is taken apart by e (0 to 1)
export const SPREAD = { washer: 0.3, gear: 0.7, bearing: 1.1, screw: 1.55 };

export function makeScene(gl, SHAPES) {
  const prog = program(gl, VS, FS), u = prog.u, kit = {};
  for (const sh of SHAPES) {
    const P = parts(sh), sp = smallParts(P);
    kit[sh.id] = { P, gear: upload(gl, gearGeometry(sh.profile, P)), body: upload(gl, bodyGeometry(sh)), mid: sp.mid,
      outer: upload(gl, sp.outer), inner: upload(gl, sp.inner), ball: upload(gl, sp.ball), washer: upload(gl, sp.washer), screw: upload(gl, sp.screw) };
  }
  const g = grow(); g.v([-1, -1, 0], [0, 0, 1], [-1, -1, 0]); g.v([3, -1, 0], [0, 0, 1], [3, -1, 0]); g.v([-1, 3, 0], [0, 0, 1], [-1, 3, 0]); g.I.push(0, 1, 2);
  const back = upload(gl, g);
  const I4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // a gear's frame turned by a about its axis and moved out along it by d; with c, also moved across it
  const place = (F, a, d, c = [0, 0]) => {
    const co = Math.cos(a), s = Math.sin(a), X = [0, 1, 2].map((k) => co * F.x[k] + s * F.y[k]), Y = [0, 1, 2].map((k) => -s * F.x[k] + co * F.y[k]);
    const o = [0, 1, 2].map((k) => F.z[k] * d + X[k] * c[0] + Y[k] * c[1]);
    return new Float32Array([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, F.z[0], F.z[1], F.z[2], 0, o[0], o[1], o[2], 1]);
  };
  return {
    // f: { sh, ang, tint[i], hi, e (how far apart), cage[i] (angle of each bearing's balls) }, cam: { vp, pos, rot }
    draw(f, cam, vpx) {
      gl.viewport(vpx.x, vpx.y, vpx.w, vpx.h);
      gl.clearColor(0.02, 0.025, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog.p);
      gl.disable(gl.DEPTH_TEST); gl.uniformMatrix4fv(u.uVP, false, I4); gl.uniformMatrix4fv(u.uM, false, I4); gl.uniform1i(u.uKind, 7); back.draw();
      gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uCam, cam.pos); gl.uniformMatrix3fv(u.uV, false, cam.rot); gl.uniform1i(u.uKind, 0);
      const sh = f.sh, K = kit[sh.id], e = f.e;
      gl.uniform1f(u.uHi, 0); gl.uniform3fv(u.uTint, [0.9, 0.7, 0.4]); gl.uniformMatrix4fv(u.uM, false, I4); K.body.draw();
      for (let i = 0; i < sh.normals.length; i++) {
        const F = sh.frames[i], a = f.ang[i];
        gl.uniform1f(u.uHi, 0);
        gl.uniformMatrix4fv(u.uM, false, place(F, 0, SPREAD.washer * e)); K.washer.draw();
        gl.uniformMatrix4fv(u.uM, false, place(F, 0, SPREAD.screw * e)); K.screw.draw();
        gl.uniformMatrix4fv(u.uM, false, place(F, 0, SPREAD.bearing * e)); K.inner.draw();
        gl.uniformMatrix4fv(u.uM, false, place(F, a, SPREAD.bearing * e)); K.outer.draw();
        const B = K.P.bearing;
        for (let b = 0; b < B.balls; b++) {
          const t = f.cage[i] + b / B.balls * 2 * Math.PI;
          gl.uniformMatrix4fv(u.uM, false, place(F, t, SPREAD.bearing * e + K.mid, [B.pitch, 0])); K.ball.draw();
        }
        gl.uniformMatrix4fv(u.uM, false, place(F, a, SPREAD.gear * e)); gl.uniform3fv(u.uTint, f.tint[i]); gl.uniform1f(u.uHi, f.hi === i ? 1 : 0);
        K.gear.draw();
      }
    },
  };
}
