// Shoulder: drawing. One WebGL2 program lights every surface; a cut plane can remove the near side of the
// model (it fades where it is), and the cut faces of each solid are filled in with the stencil buffer.
import { program, meshBuffers, normals, perspective, lookAt, mul4, rigid, project } from './gl.js?v=823d925a';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aTT;
uniform mat4 uVP, uM; out vec3 vPos, vNor, vTT;
void main(){ vec4 w = uM * vec4(aPos, 1.0); vPos = w.xyz; vNor = mat3(uM) * aNor; vTT = aTT; gl_Position = uVP * w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vPos, vNor, vTT; out vec4 o;
uniform vec3 uCol, uCol2, uEye; uniform vec2 uBlend;     // uCol2 from t = uBlend.x to uBlend.y (a muscle's tendon)
uniform vec4 uPlane; uniform int uSide; uniform float uAlpha, uGlow; uniform vec4 uHole; uniform vec3 uWarm; uniform float uWarmAmt;
void main(){
  float side = dot(vec4(vPos, 1.0), uPlane);
  if (uSide == 1 && side > 0.0) discard;                  // the far side only
  if (uSide == 2 && side <= 0.0) discard;                 // the near side only
  if (uHole.y > uHole.x && vTT.x > uHole.x && vTT.x < uHole.y && vTT.y > uHole.z && vTT.y < uHole.w) discard;   // a torn hole
  vec3 n = normalize(vNor); vec3 v = normalize(uEye - vPos);
  bool back = dot(n, v) < 0.0; if (back && uSide == 2) discard;   // the fading near side: its outer skin only, not the inside
  if (back) n = -n;
  vec3 col = mix(uCol, uCol2, smoothstep(uBlend.x, uBlend.y, vTT.x));
  col = mix(col, uWarm, uWarmAmt * vTT.z);                 // vTT.z: how near the acromion this corner is (impingement)
  vec3 L1 = normalize(vec3(-0.4, 0.8, 0.6)), L2 = normalize(vec3(0.7, 0.2, -0.5));
  float d = 0.62 * max(dot(n, L1), 0.0) + 0.22 * max(dot(n, L2), 0.0) + 0.24 + 0.1 * n.y;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.25;
  vec3 h = normalize(L1 + v); float sp = pow(max(dot(n, h), 0.0), 40.0) * 0.18;
  vec3 c = col * d + rim + sp + uGlow * vec3(1.0, 0.86, 0.45);
  if (back) c *= 0.45;                                    // the inside of a torn tendon is in shade
  o = vec4(c, uAlpha);
}`;
// which part is seen at each pixel, for the labels and for pointing at a part: the same cuts and holes, one flat id
const IFS = `#version 300 es
precision highp float;
in vec3 vPos, vNor, vTT; out vec4 o;
uniform vec4 uPlane; uniform int uSide; uniform vec4 uHole; uniform vec3 uId;
void main(){
  if (uSide == 1 && dot(vec4(vPos, 1.0), uPlane) > 0.0) discard;
  if (uHole.y > uHole.x && vTT.x > uHole.x && vTT.x < uHole.y && vTT.y > uHole.z && vTT.y < uHole.w) discard;
  o = vec4(uId, 1.0);
}`;
// the cut faces: flat color, slightly darker at the edge of the view
const CVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uVP; out vec3 vPos; void main(){ vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
const CFS = `#version 300 es
precision highp float; in vec3 vPos; out vec4 o; uniform vec3 uCol, uCol2, uWarm; uniform vec3 uW[48]; uniform int uWN;
uniform vec3 uC[17]; uniform int uCN; uniform vec4 uCT;  // a muscle's middle line at uCN points from t = uCT.x to uCT.y
void main(){                                              // its cut turns to tendon (uCol2) from t = uCT.z to uCT.w,
  float f = 0.0;                                          // going by the nearest point of the middle line
  if (uCN > 1) { float bd = 1e9, bt = 0.0; for (int i = 0; i < 16; i++) { if (i + 1 >= uCN) break;
      vec3 a = uC[i], g = uC[i + 1] - a; float u = clamp(dot(vPos - a, g) / max(dot(g, g), 1e-6), 0.0, 1.0), d = distance(vPos, a + g * u);
      if (d < bd) { bd = d; bt = (float(i) + u) / float(uCN - 1); } }
    f = smoothstep(uCT.z, uCT.w, mix(uCT.x, uCT.y, bt)); }
  vec3 c = mix(uCol, uCol2, f);
  float w = 0.0;                                          // near a corner of the surface lit for impingement
  for (int i = 0; i < 48; i++) { if (i >= uWN) break; w = max(w, 1.0 - smoothstep(0.8, 1.6, distance(vPos, uW[i]))); }
  o = vec4(mix(c, uWarm, w), 1.0);
}`;

export const COL = {
  bone: [0.89, 0.81, 0.65], boneCut: [0.8, 0.72, 0.56],
  // each cuff muscle in its own color, so that the four can be told apart; the colors are only the picture's
  supra: [0.94, 0.54, 0.24], infra: [0.18, 0.7, 0.64], tminor: [0.58, 0.79, 0.28], subscap: [0.6, 0.48, 0.94],
  deltoid: [0.76, 0.36, 0.33], tendon: [0.95, 0.96, 0.98], bursa: [0.37, 0.7, 1.0],
  tendonCut: [0.8, 0.84, 0.9], bursaCut: [0.3, 0.6, 0.95],
};

export function makeView(gl, model) {
  const P = program(gl, VS, FS), C = program(gl, CVS, CFS), Q = program(gl, VS, IFS);
  const ids = { fb: gl.createFramebuffer(), rb: gl.createRenderbuffer(), db: gl.createRenderbuffer(), W: 0, H: 0, k: 0, px: null, keys: [] };
  // bones: fixed buffers, moved by a matrix
  const bones = Object.keys(model.bones).map((name) => {
    const m = model.bones[name], n = m.pos.length / 3, b = meshBuffers(gl, n, m.idx);
    b.setPos(m.pos); b.setNor(normals(m.pos, m.idx)); b.setTT(new Float32Array(n * 3));
    return { name, body: model.bodyOf(name), b, solid: true };
  });
  // muscles and the bursa: new positions each time the pose changes
  const soft = new Map();
  function softBuf(key, b) {
    if (!soft.has(key)) {
      const n = b.rest.length, buf = meshBuffers(gl, n, new Uint16Array(b.mesh.idx), true);
      const tt = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { tt[3 * i] = b.t[i]; tt[3 * i + 1] = b.at[i].s ?? 0.5; }
      buf.setTT(tt);
      soft.set(key, { buf, tt, nor: new Float32Array(n * 3), idx: b.mesh.idx, warm: null });
    }
    return soft.get(key);
  }
  // a quad on the cut plane, big enough to cover the model
  const quad = gl.createBuffer(), qvao = gl.createVertexArray();
  gl.bindVertexArray(qvao); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, 4 * 3 * 4, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);

  let VP = null, eye = [0, 0, 0];
  // scene: { T (bone transforms), soft: [{ key, b, pos, col, col2, blend, glow, hole, warm }], cut: { plane [a,b,c,d], amount, at, u, v } }
  function draw(scene, cam) {
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.02, 0.027, 0.06, 1); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    const proj = perspective(cam.fov, cam.W / cam.H, cam.near, cam.far);
    // the picture's middle is moved to the middle of the free part of the screen
    proj[8] -= cam.ox; proj[9] -= cam.oy;
    const view = lookAt(cam.eye, cam.at, cam.up);
    VP = mul4(proj, view); eye = cam.eye;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    const cut = scene.cut && scene.cut.amount > 0.002 ? scene.cut : null;
    const items = [];
    for (const bo of bones) items.push({ buf: bo.b, M: rigid(scene.T[bo.body]), col: COL.bone, col2: COL.bone, blend: [2, 3], capCol: COL.boneCut, bone: true, key: bo.name });
    for (const s of scene.soft) {
      const sb = softBuf(s.key, s.b);
      if (s.pos !== sb.last) { sb.buf.setPos(s.pos); sb.buf.setNor(normals(s.pos, sb.idx, sb.nor)); sb.last = s.pos; }
      if ((s.warm || null) !== sb.warm && (s.warm || sb.warm)) { for (let i = 0; i < sb.tt.length / 3; i++) sb.tt[3 * i + 2] = s.warm ? s.warm[i] : 0; sb.buf.setTT(sb.tt); sb.warm = s.warm || null; }
      items.push({ key: s.key, buf: sb.buf, M: I4, col: s.col, col2: s.col2 || s.col, blend: s.blend || [2, 3], glow: s.glow || 0, hole: s.hole, warm: s.warm ? 1 : 0, capCol: s.capCol || s.col, capCol2: s.capCol2, capG: s.capG, capWarm: s.capWarm, alpha: s.alpha ?? 1 });
    }
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform3fv(P.u.uEye, eye); gl.uniform3fv(P.u.uWarm, WARM);
    gl.uniform4fv(P.u.uPlane, cut ? cut.plane : [0, 0, 0, -1]);
    const put = (it, side, alpha) => {
      gl.uniformMatrix4fv(P.u.uM, false, it.M); gl.uniform3fv(P.u.uCol, it.col); gl.uniform3fv(P.u.uCol2, it.col2); gl.uniform2fv(P.u.uBlend, it.blend);
      gl.uniform1i(P.u.uSide, side); gl.uniform1f(P.u.uAlpha, alpha); gl.uniform1f(P.u.uGlow, it.glow || 0); gl.uniform4fv(P.u.uHole, it.hole || [0, 0, 0, 0]); gl.uniform1f(P.u.uWarmAmt, it.warm || 0);
      it.buf.draw();
    };
    // 1. everything solid: all of it, or only the far side of the cut
    for (const it of items) if ((it.alpha ?? 1) >= 1) put(it, cut ? 1 : 0, 1);
    // 2. the cut faces: for each solid, count with the stencil where the eye looks into it through the plane
    if (cut) {
      const q = new Float32Array([...cut.c0, ...cut.c1, ...cut.c3, ...cut.c2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferSubData(gl.ARRAY_BUFFER, 0, q);
      gl.enable(gl.STENCIL_TEST);
      // soft parts first, bones last: where a scan's muscle overlaps a bone, the bone's cut face shows
      const order = [...items.filter((it) => !it.bone && (it.alpha ?? 1) >= 1), ...items.filter((it) => it.bone)];
      for (const it of order) {
        gl.useProgram(P.p); gl.colorMask(false, false, false, false); gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff); gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
        put(it, 1, 1);
        gl.colorMask(true, true, true, true); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
        gl.useProgram(C.p); gl.uniformMatrix4fv(C.u.uVP, false, VP); gl.uniform3fv(C.u.uCol, it.capCol); gl.uniform3fv(C.u.uCol2, it.capCol2 || it.capCol); gl.uniform1i(C.u.uCN, it.capG ? it.capG.pts.length / 3 : 0); if (it.capG) { gl.uniform3fv(C.u.uC, it.capG.pts); gl.uniform4fv(C.u.uCT, it.capG.t); }
        gl.uniform3fv(C.u.uWarm, WARM); gl.uniform1i(C.u.uWN, it.capWarm ? it.capWarm.length / 3 : 0); if (it.capWarm && it.capWarm.length) gl.uniform3fv(C.u.uW, it.capWarm);
        gl.stencilFunc(gl.NOTEQUAL, 0, 0xff); gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
        gl.bindVertexArray(qvao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.STENCIL_TEST); gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform3fv(P.u.uEye, eye); gl.uniform4fv(P.u.uPlane, cut.plane); gl.uniform3fv(P.u.uWarm, WARM);
    }
    // 3. what is see-through: the near side of the cut, fading, and any part drawn faint
    // Only the nearest see-through surface at each pixel is drawn: first their depths, then their colors where they
    // are nearest. Otherwise a part behind another (the subscapularis behind the shoulder blade, the deltoid's inner
    // faces) would be blended over it, in whatever order the parts happen to be drawn.
    const faint = [];
    if (cut && cut.amount < 0.998) for (const it of items) faint.push([it, 2, (1 - cut.amount) * (it.alpha ?? 1)]);
    for (const it of items) if ((it.alpha ?? 1) < 1) faint.push([it, cut ? 1 : 0, it.alpha]);
    if (faint.length) {
      gl.colorMask(false, false, false, false);
      for (const [it, side, a] of faint) put(it, side, a);
      gl.colorMask(true, true, true, true); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const [it, side, a] of faint) put(it, side, a);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
    idPass(items, cut, cam);
  }
  // the id picture, at a quarter of the CSS pixels, read back once per drawing
  function idPass(items, cut, cam) {
    const k = 0.25, W = Math.max(1, Math.round(cam.W * k)), H = Math.max(1, Math.round(cam.H * k));
    if (W !== ids.W || H !== ids.H) {
      ids.W = W; ids.H = H; ids.k = k; ids.px = new Uint8Array(W * H * 4);
      gl.bindRenderbuffer(gl.RENDERBUFFER, ids.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H);
      gl.bindRenderbuffer(gl.RENDERBUFFER, ids.db); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, ids.fb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, ids.rb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ids.db);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, ids.fb); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    gl.useProgram(Q.p); gl.uniformMatrix4fv(Q.u.uVP, false, VP); gl.uniform4fv(Q.u.uPlane, cut ? cut.plane : [0, 0, 0, -1]);
    const seen = cut && cut.amount > 0.25;                 // once fading, the near side no longer counts as seen
    ids.keys = [null];
    for (const it of items) {
      if ((it.alpha ?? 1) < 0.9) continue;                 // see-through parts are not what is seen there
      const n = ids.keys.push(it.key) - 1;
      gl.uniformMatrix4fv(Q.u.uM, false, it.M); gl.uniform1i(Q.u.uSide, seen ? 1 : 0); gl.uniform4fv(Q.u.uHole, it.hole || [0, 0, 0, 0]);
      gl.uniform3fv(Q.u.uId, [(n & 255) / 255, 0, 1]);
      it.buf.draw();
    }
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, ids.px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // the part seen at a point (CSS pixels), and the nearest point within r pixels where a part is seen
  const idAt = (x, y) => { const i = Math.round(x * ids.k), j = ids.H - 1 - Math.round(y * ids.k); if (i < 0 || j < 0 || i >= ids.W || j >= ids.H) return null; const o = 4 * (j * ids.W + i); return ids.px[o + 3] ? ids.keys[ids.px[o]] : null; };
  function nearest(key, x, y, r) {
    const n = ids.keys.indexOf(key); if (n < 1) return null;
    // a point well inside the part: its neighbours are the same part
    const same = (i, j) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= ids.W || jj >= ids.H) return false; const o = 4 * (jj * ids.W + ii); if (!ids.px[o + 3] || ids.px[o] !== n) return false; } return true; };
    const ci = x * ids.k, cj = ids.H - 1 - y * ids.k, R = Math.ceil(r * ids.k); let best = null, bd = Infinity;
    for (let j = Math.max(0, Math.floor(cj - R)); j <= Math.min(ids.H - 1, Math.ceil(cj + R)); j++) for (let i = Math.max(0, Math.floor(ci - R)); i <= Math.min(ids.W - 1, Math.ceil(ci + R)); i++) {
      if (!same(i, j)) continue;
      const d = (i - ci) ** 2 + (j - cj) ** 2; if (d < bd) { bd = d; best = [i / ids.k, (ids.H - 1 - j) / ids.k]; }
    }
    return best;
  }
  return { draw, idAt, nearest, project: (p, W, H) => (VP ? project(VP, p, W, H) : null) };
}
export const WARM = [1.0, 0.18, 0.32];                   // impingement: drawn in red
const I4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
