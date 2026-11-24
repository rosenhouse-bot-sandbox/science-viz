// Gears on a cube and an octahedron: the 3D picture. The parts are the ones the brass toy is made of: a core block,
// and on each face a washer, a toothed gear with a ball bearing pressed into it, and a flanged screw. Sizes come
// from model.js; nothing here decides how the gears move.
import { program, meshBuffers } from './gl.js?v=04d3d5af';
import { bodyPlanes, bodyFaces, parts } from './model.js?v=04d3d5af';
import { grow, gearMesh, smallParts } from './mesh.js?v=04d3d5af';

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
function upload(gl, g) {
  const m = meshBuffers(gl, g.P.length / 3, new Uint32Array(g.I));
  m.setPos(new Float32Array(g.P)); m.setNor(new Float32Array(g.N)); m.setTT(new Float32Array(g.T));
  return m;
}
function bodyGeometry(sh) {
  const g = grow();
  for (const f of bodyFaces(bodyPlanes(sh))) {
    const ids = f.poly.map((p) => g.v(p, f.n, [2, 0, 0]));
    for (let k = 1; k + 1 < ids.length; k++) g.I.push(ids[0], ids[k], ids[k + 1]);
  }
  return g;
}
// how far out along its axis each part sits when the set is taken apart by e (0 to 1)
export const SPREAD = { washer: 0.3, gear: 0.7, bearing: 1.1, screw: 1.55 };

export function makeScene(gl, SHAPES) {
  const prog = program(gl, VS, FS), u = prog.u, kit = {};
  for (const sh of SHAPES) {
    const P = parts(sh), sp = smallParts(P);
    kit[sh.id] = { P, gear: upload(gl, gearMesh(sh.profile, P)), body: upload(gl, bodyGeometry(sh)), mid: sp.mid,
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
