// Gears on a cube and an octahedron: the 3D picture. The parts are the ones the brass toy is made of: a core block,
// and on each face a washer, a toothed gear with a ball bearing pressed into it, and a flanged screw. Sizes come
// from model.js; nothing here decides how the gears move.
import { program, meshBuffers } from './gl.js?v=286eb78e';
import { bodyPlanes, bodyFaces, parts, MM } from './model.js?v=286eb78e';
import { grow, gearMesh, smallParts, faceWithHole, holeWalls } from './mesh.js?v=286eb78e';
import { GLSL, withLit } from './look.js?v=286eb78e';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aT;
uniform mat4 uVP, uM; out vec3 vW, vN, vT, vL;
void main(){ vec4 w = uM * vec4(aPos, 1.); vW = w.xyz; vN = mat3(uM) * aNor; vT = aT; vL = aPos; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vT, vL; out vec4 o;
uniform vec3 uCam, uTint; uniform mat3 uV; uniform int uKind; uniform float uHi;
${GLSL}
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
#ifdef LIT
  if (uDepthOnly == 1) { o = vec4(0.); return; }
  if (uKind == 7) { o = vec4(backdrop(vT.xy, uCam), 1.); return; }
#endif
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
  else if (kind == 6) { base = vec3(0.86, 0.67, 0.39) * (0.3 + 0.25 * smoothstep(-0.6, 0.6, sin(vT.y * 20.944))); rough = 0.5; }  // a tapped hole: 0.3 mm pitch
  else if (kind == 8) { base = vec3(0.86, 0.67, 0.39) * 0.3; rough = 0.6; }      // inside a drilled hole
  else { base = vec3(0.9, 0.74, 0.48) * (0.75 + 0.25 * sin(vT.y * 260.)); rough = 0.4; }   // the screw's thread
#ifdef LIT
  {
    if (kind == 9) {            // the desk: walnut, oiled; the light falls off away from the toy
      vec3 q = vW / uUnit; float g = vnoise(vec3(q.x * 0.08, q.z * 2.2, 0.)) * 0.6 + vnoise(vec3(q.x * 0.5, q.z * 9., 1.)) * 0.4;
      vec3 alb = mix(vec3(0.20, 0.12, 0.075), vec3(0.32, 0.20, 0.12), g) * (0.85 + 0.15 * vnoise(vec3(q.x * 3., q.z * 40., 2.)));
      alb *= mix(1., 0.4, smoothstep(10., 60., length(q.xz)));
      o = vec4(shade(alb, 0.45, false, 0, n, v, vW, vL), 1.); return;
    }
    // brass (as on screen; the tick box's colors tint the gears), with the finish each part is made with
    const vec3 BR = vec3(0.98, 0.80, 0.52);
    vec3 F0 = BR; float rr = 0.2; int fin = 1;
    if (kind == 0) { F0 = BR * uTint / vec3(0.9, 0.7, 0.4); rr = 0.16; }       // a gear: turned faces
    else if (kind == 1) { F0 = vec3(0.99, 0.84, 0.58); rr = 0.07; }           // the screw's flange, polished
    else if (kind == 2) { F0 = vec3(0.96, 0.78, 0.50); rr = 0.22; fin = 2; }  // the core: fly cut
    else if (kind == 3) { F0 = vec3(0.78); rr = 0.06; fin = 0; }              // the bearing: polished steel
    else if (kind == 6) { F0 = vec3(0.96, 0.78, 0.50) * (0.5 + 0.3 * smoothstep(-0.6, 0.6, sin(vT.y * 20.944))); rr = 0.3; fin = 0; }   // a tapped hole
    else if (kind == 8) { F0 = vec3(0.96, 0.78, 0.50) * 0.6; rr = 0.35; fin = 0; }   // inside a drilled hole
    else if (kind != 4) { F0 = BR * (0.8 + 0.2 * sin(vT.y * 260.)); rr = 0.25; fin = 0; }   // the screw's thread
    if (uHi > 0.5) F0 *= 1.1;
    o = vec4(shade(F0, rr, true, fin, n, v, vW, vL), 1.); return;
  }
#endif
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
// the core, with a tapped hole in the middle of every gear's face: spotted, drilled Ø1.1 with the drill's point at
// the bottom, tapped M1.4 (sizes from MM)
function bodyGeometry(sh) {
  const g = grow(), u = parts(sh).u, T = MM.tap, r = MM.screw.thread / 2, rd = T.drill / 2, spot = 0.75;
  const holed = (n) => sh.normals.some((m) => m[0] * n[0] + m[1] * n[1] + m[2] * n[2] > 0.999);
  for (const f of bodyFaces(bodyPlanes(sh))) {
    if (f.kind === 'face' && holed(f.n)) {
      const c = f.n.map((x) => x * MM.core[sh.solid] / u);
      faceWithHole(g, f.poly, f.n, c, spot / u, [2, 0, 0]);
      const pts = [[spot, 0], [r, spot - r], [r, T.depth], [rd, T.depth + (r - rd)], [rd, T.drillDepth], [0, T.drillDepth + rd / Math.tan(59 * Math.PI / 180)]];
      holeWalls(g, f.n, c, pts.map(([a, b]) => [a / u, b / u]), [8, 6, 8, 8, 8], u);
      continue;
    }
    const ids = f.poly.map((p) => g.v(p, f.n, [2, 0, 0]));
    for (let k = 1; k + 1 < ids.length; k++) g.I.push(ids[0], ids[k], ids[k + 1]);
  }
  return g;
}
// how far out along its axis each part sits when the set is taken apart by e (0 to 1)
export const SPREAD = { washer: 0.3, gear: 0.7, bearing: 1.1, screw: 1.55 };

export function makeScene(gl, SHAPES, lit) {
  const prog = program(gl, VS, lit ? withLit(FS) : FS), u = prog.u, kit = {};
  // each part's outline as (distance along its axis, largest radius there), to find how low the set reaches
  const outline = (g) => { const m = new Map(); for (let i = 0; i < g.P.length; i += 3) { const z = Math.round(g.P[i + 2] * 200) / 200, r = Math.hypot(g.P[i], g.P[i + 1]); if (!(m.get(z) >= r)) m.set(z, r); } return [...m]; };
  const reach = {};
  for (const sh of SHAPES) {
    const P = parts(sh), sp = smallParts(P), bodyG = bodyGeometry(sh), gearG = gearMesh(sh.profile, P);
    let y0 = Infinity; for (let i = 1; i < bodyG.P.length; i += 3) y0 = Math.min(y0, bodyG.P[i]);
    reach[sh.id] = { y0, parts: [[outline(gearG), SPREAD.gear], [outline(sp.washer), SPREAD.washer], [outline(sp.screw), SPREAD.screw], [outline(sp.outer), SPREAD.bearing]] };
    kit[sh.id] = { P, gear: upload(gl, gearG), body: upload(gl, bodyG), mid: sp.mid,
      outer: upload(gl, sp.outer), inner: upload(gl, sp.inner), ball: upload(gl, sp.ball), washer: upload(gl, sp.washer), screw: upload(gl, sp.screw) };
  }
  const g = grow(); g.v([-1, -1, 0], [0, 0, 1], [-1, -1, 0]); g.v([3, -1, 0], [0, 0, 1], [3, -1, 0]); g.v([-1, 3, 0], [0, 0, 1], [-1, 3, 0]); g.I.push(0, 1, 2);
  const back = upload(gl, g);
  const dk = grow(); [[-40, 0, -40], [40, 0, -40], [40, 0, 40], [-40, 0, 40]].forEach((p) => dk.v(p, [0, 1, 0], [9, 0, 0])); dk.I.push(0, 2, 1, 0, 3, 2);
  const desk = upload(gl, dk);
  const I4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // a gear's frame turned by a about its axis and moved out along it by d; with c, also moved across it
  const place = (F, a, d, c = [0, 0]) => {
    const co = Math.cos(a), s = Math.sin(a), X = [0, 1, 2].map((k) => co * F.x[k] + s * F.y[k]), Y = [0, 1, 2].map((k) => -s * F.x[k] + co * F.y[k]);
    const o = [0, 1, 2].map((k) => F.z[k] * d + X[k] * c[0] + Y[k] * c[1]);
    return new Float32Array([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, F.z[0], F.z[1], F.z[2], 0, o[0], o[1], o[2], 1]);
  };
  return {
    // the lowest point of the set when it is taken apart by e (the gears' turning does not change it)
    lowest(sh, e) {
      const R = reach[sh.id]; let y = R.y0;
      for (const F of sh.frames) { const a = F.z[1], b = Math.sqrt(Math.max(0, 1 - a * a));
        for (const [pts, s] of R.parts) for (const [z, r] of pts) y = Math.min(y, a * (z + s * e) - r * b); }
      return y;
    },
    // f: { sh, ang, tint[i], hi, e (how far apart), cage[i] (angle of each bearing's balls) }, cam: { vp, pos, rot }
    draw(f, cam, vpx, hook) {
      gl.viewport(vpx.x, vpx.y, vpx.w, vpx.h);
      gl.clearColor(0.02, 0.025, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog.p); hook?.(gl, prog.p);
      gl.disable(gl.DEPTH_TEST); gl.uniformMatrix4fv(u.uVP, false, I4); gl.uniformMatrix4fv(u.uM, false, I4); gl.uniform1i(u.uKind, 7); back.draw();
      gl.enable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uCam, cam.pos); gl.uniformMatrix3fv(u.uV, false, cam.rot); gl.uniform1i(u.uKind, 0);
      const sh = f.sh, K = kit[sh.id], e = f.e;
      // the desk, under the lowest part (seen only from above it)
      if (hook && f.desk !== undefined && cam.pos[1] > f.desk) { gl.uniform1i(u.uKind, 0); gl.uniformMatrix4fv(u.uM, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, f.desk, 0, 1])); desk.draw(); }
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
