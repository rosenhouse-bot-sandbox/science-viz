// How the metal looks, for both gears pages: brass and steel lit by a room, with shadows. Both pages draw into a
// floating-point picture first; this module adds the shadow map before and the shading of the gaps after.
//
// - The room: pale walls with shelves, a concrete floor, a white ceiling with rows of tube lights, a window. Metal
//   is mostly what it reflects, so the room is what makes brass look like brass and steel look like steel. It is
//   fixed to the world, so reflections slide across the metal as the view turns.
// - Finishes: a turned part has fine grooves round its axis, which stretch its highlights across them; a milled face
//   has fly cutter arcs; ground steel has fine lines; cast iron under paint is lumpy.
// - Light: the tube lights straight overhead cast a soft shadow (a 2048 × 2048 shadow map, 8 samples); the depth
//   picture darkens corners and gaps that little light reaches.
// A browser without floating-point pictures (EXT_color_buffer_float) gets null from makeLook, and the pages draw the
// way they did before.
import { program } from './gl.js?v=286eb78e';

// GLSL pasted into both pages' fragment shaders. It and the pages' lit branches are compiled only with LIT
// defined (withLit), so that the plain lighting pays nothing for them.
export const withLit = (fs) => fs.replace('precision highp float;', 'precision highp float;\n#define LIT');
export const GLSL = `
#ifdef LIT
uniform int uDepthOnly; uniform mat4 uLVP, uM, uInvVP; uniform vec3 uLDir, uUp;
uniform highp sampler2DShadow uShadow; uniform float uUnit;
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
// a soft-edged rectangle seen along r: centered on direction d, half sizes w and h (as tangents), edge blur b
float box(vec3 r, vec3 d, vec3 a, float w, float h, float b){
  float z = dot(r, d); if (z <= 0.) return 0.;
  vec3 bb = cross(d, a); float x = dot(r, a) / z, y = dot(r, bb) / z;
  return (1. - smoothstep(w - b, w + b, abs(x))) * (1. - smoothstep(h - b, h + b, abs(y)));
}
// the room along r, split into the tube lights (key: they cast the shadow) and the rest
void room(vec3 r, float rough, out vec3 key, out vec3 rest){
  vec3 up = uUp; float y = dot(r, up), b = 0.02 + 0.5 * rough * rough;
  vec3 side = normalize(cross(up, abs(up.z) > 0.5 ? vec3(1,0,0) : vec3(0,0,1))), fwd = cross(side, up);
  float az = atan(dot(r, fwd), dot(r, side)) / 6.2832 + 0.5, el = y / (length(r - up * y) + 1e-4);
  // shelves of bins along the walls: soft-edged blocks, some empty, a few colored
  vec2 g = vec2(az * 28., el * 5. + 0.3), gi = floor(g), gf = fract(g);
  float occ = h13(vec3(gi, 3.)), soft = 0.12 + 0.4 * rough;
  float blk = smoothstep(0., soft, gf.x - 0.06) * smoothstep(0., soft, 0.94 - gf.x) * smoothstep(0., soft, gf.y - 0.1) * smoothstep(0., soft, 0.85 - gf.y);
  vec3 bin = mix(vec3(0.06, 0.10, 0.22), mix(vec3(0.25, 0.06, 0.05), vec3(0.32, 0.26, 0.08), step(0.5, h13(vec3(gi, 9.)))), step(0.45, h13(vec3(gi, 5.))));
  bin = mix(vec3(0.12, 0.11, 0.10), bin, step(0.55, occ));
  float shelves = smoothstep(-0.25, -0.1, el) * (1. - smoothstep(0.65, 0.8, el));
  vec3 wall = mix(vec3(0.30, 0.29, 0.26), bin, blk * shelves * step(0.3, occ) * (1. - rough * 0.6));
  vec3 flr = vec3(0.20, 0.19, 0.18) * (0.8 + 0.4 * vnoise(r * 9.));
  rest = mix(flr, wall, smoothstep(-0.32, -0.22, el));
  rest = mix(rest, vec3(0.42, 0.42, 0.41), smoothstep(0.85, 1.1, el));
  key = vec3(0.);
  for (int i = -2; i <= 2; i++) key += vec3(5.0, 5.2, 5.4) * box(r, normalize(up + fwd * (float(i) * 0.6)), side, 1.4, 0.03, b) * (i == 0 ? 1. : 0.7);
  rest += vec3(1.6, 1.8, 2.1) * box(r, normalize(-side + up * 0.15), up, 0.5, 0.3, b);
  rest += 0.25 * rough * smoothstep(0., 1., y);
}
float shadowAt(vec3 w, vec3 n){
  vec4 p = uLVP * vec4(w + n * 0.08 * uUnit, 1.); vec3 q = p.xyz / p.w * 0.5 + 0.5;
  if (any(lessThan(q, vec3(0.))) || any(greaterThan(q, vec3(1.)))) return 1.;
  float s = 0., k = 4. / float(textureSize(uShadow, 0).x), j = h13(w * 97.) * 6.28;
  for (int i = 0; i < 8; i++) { float a = float(i) * 2.39996 + j, rr = sqrt((float(i) + 0.5) / 8.);
    s += texture(uShadow, vec3(q.xy + vec2(cos(a), sin(a)) * rr * k, q.z - 0.0015)); }
  return s / 8.;
}
// base: the color as seen on screen (for metal, its reflectance); l: the point in the mesh's own frame
// finish: 0 plain, 1 turned (about the mesh's z), 2 fly cut, 3 painted cast iron, 4 ground (along the mesh's x)
vec3 shade(vec3 base, float rough, bool metal, int finish, vec3 n, vec3 v, vec3 w, vec3 l){
  float sh = shadowAt(w, n);
  base = pow(max(base, 0.), vec3(2.2));   // light adds up in linear terms
  vec3 tp = vec3(0.); float aniso = 0.;
  if (finish == 1) {
    vec3 ax = normalize(mat3(uM) * vec3(0., 0., 1.)), tang = normalize(cross(ax, mat3(uM) * vec3(l.xy, 0.)) + 1e-6);
    tp = normalize(cross(n, tang) + 1e-6); aniso = 0.22;
    float ph = (length(l.xy) + l.z) / (0.05 * uUnit), fw = fwidth(ph);   // 0.05 mm a turn
    base *= 1. - 0.08 * (0.5 + 0.5 * sin(ph * 6.283)) * (1. - smoothstep(0.3, 0.8, fw));
  } else if (finish == 2) {
    vec3 e = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0))), c = w - e * (6. * uUnit);
    tp = normalize(cross(n, normalize(cross(n, w - c - n * dot(w - c, n))))); aniso = 0.16;
  } else if (finish == 3) {
    vec3 q = w / uUnit;
    vec3 gN = vec3(vnoise(q * 0.9), vnoise(q * 0.9 + 3.1), vnoise(q * 0.9 + 7.7)) - 0.5;
    vec3 gF = vec3(vnoise(q * 4.), vnoise(q * 4. + 2.), vnoise(q * 4. + 5.)) - 0.5;
    n = normalize(n + (gN - n * dot(gN, n)) * 0.22 + (gF - n * dot(gF, n)) * 0.08);
    rough = clamp(rough + 0.2 * (vnoise(q * 0.2) - 0.5), 0.25, 0.9);
    base *= 0.9 + 0.2 * vnoise(q * 0.3);
  } else if (finish == 4) {
    vec3 gx = normalize(mat3(uM) * vec3(1., 0., 0.)), t0 = gx - n * dot(gx, n);
    tp = cross(n, normalize(t0 + 1e-6)); aniso = length(t0) > 0.3 ? 0.25 : 0.;
    float ph = dot(w / uUnit, tp) / 0.04, fw = fwidth(ph);
    base *= 1. - 0.06 * h13(vec3(floor(ph), 0., 1.)) * (1. - smoothstep(0.3, 0.8, fw));
  }
  vec3 F0 = metal ? base : vec3(0.04);
  float nv = max(dot(n, v), 1e-3);
  vec3 F = F0 + (1. - F0) * pow(1. - nv, 5.) * (1. - rough * 0.7);
  // the reflection, spread across the grooves by a few samples
  vec3 key = vec3(0.), rest = vec3(0.);
  int N = aniso > 0. ? 6 : 1;
  for (int i = 0; i < 6; i++) { if (i >= N) break;
    float s = N == 1 ? 0. : (float(i) / 5. - 0.5) * 2.;
    vec3 nn = normalize(n + tp * s * aniso), r = reflect(-v, nn), k, rs;
    room(normalize(mix(r, nn, rough * rough * 0.6)), rough, k, rs); key += k; rest += rs; }
  key /= float(N); rest /= float(N);
  vec3 col = F * (key * mix(1., sh, 0.85) + rest);
  if (!metal) {
    vec3 kd, rd; room(n, 1., kd, rd);
    col += base * (rd * 1.3 + vec3(2.2) * max(dot(n, uLDir), 0.) * sh) * (1. - F);
  }
  return col;
}
// what is behind everything: the room itself, a little soft
vec3 backdrop(vec2 ndc, vec3 cam){
  vec4 p = uInvVP * vec4(ndc, 1., 1.); vec3 k, rs; room(normalize(p.xyz / p.w - cam), 0.35, k, rs);
  return rs + k * 0.3;
}
#endif
`;

const QUAD_VS = `#version 300 es
const vec2 P[3] = vec2[](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
out vec2 vUV; void main(){ vec2 p = P[gl_VertexID]; vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }`;
// the finished picture: corners and gaps darkened from the depth picture, then a film-like tone curve
const COMP_FS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o;
uniform sampler2D uC, uZ; uniform vec2 uPx; uniform float uNear, uFar, uAoR, uExp;
float lin(float d){ float z = d * 2. - 1.; return 2. * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0., 1.); }
void main(){
  float z = lin(texture(uZ, vUV).r), occ = 0., R = uAoR / z, j = h(gl_FragCoord.xy) * 6.28;
  for (int i = 0; i < 12; i++) { float a = float(i) * 2.39996 + j, r = sqrt((float(i) + 0.5) / 12.) * R;
    float dz = z - lin(texture(uZ, vUV + vec2(cos(a), sin(a)) * r * uPx).r);
    occ += smoothstep(0.0, 0.02 * z, dz) * (1. - smoothstep(0.06 * z, 0.18 * z, dz)); }
  vec3 c = texture(uC, vUV).rgb * (1. - 0.75 * occ / 12.);
  o = vec4(pow(aces(c * uExp), vec3(1. / 2.2)), 1.);
}`;

const ortho = (s, n, f) => new Float32Array([1 / s, 0, 0, 0, 0, 1 / s, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
function lookAt(eye, at, up) {
  const sub = (a, b) => a.map((x, i) => x - b[i]), cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); }, dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = nm(sub(eye, at)), x = nm(cr(up, z)), y = cr(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dt(x, eye), -dt(y, eye), -dt(z, eye), 1]);
}
function mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function inverse(m) {
  const M = [0, 1, 2, 3].map((r) => [m[r], m[4 + r], m[8 + r], m[12 + r], +(r === 0), +(r === 1), +(r === 2), +(r === 3)]);
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let k = 0; k < 8; k++) M[c][k] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c]; for (let k = 0; k < 8; k++) M[r][k] -= f * M[c][k]; }
  }
  const o = new Float32Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = M[r][c + 4];
  return o;
}

// null when this browser cannot draw into a floating-point picture, or with ?look=0 in the address (the plain
// lighting, which the tests of the controls use because the shadows are slow to draw without a graphics card)
export function makeLook(gl) {
  if (new URLSearchParams(location.search).get('look') === '0' || !gl.getExtension('EXT_color_buffer_float')) return null;
  const comp = program(gl, QUAD_VS, COMP_FS), vao = gl.createVertexArray();
  const tex = (w, h, fmt, lin) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, lin ? gl.LINEAR : gl.NEAREST], [gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  const SM = 2048, smTex = tex(SM, SM, gl.DEPTH_COMPONENT24, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const smFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, smFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, smTex, 0); gl.drawBuffers([gl.NONE]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let T = null;
  // the picture at this size: drawn with 4 samples a pixel, then resolved into textures for the last pass
  const targets = (w, h) => {
    if (T && T.w === w && T.h === h) return T;
    if (T) { gl.deleteFramebuffer(T.msF); gl.deleteFramebuffer(T.rF); T.rbs.forEach((b) => gl.deleteRenderbuffer(b)); gl.deleteTexture(T.cT); gl.deleteTexture(T.zT); }
    const rb = (fmt) => { const b = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, Math.min(4, gl.getParameter(gl.MAX_SAMPLES)), fmt, w, h); return b; };
    const rbs = [rb(gl.RGBA16F), rb(gl.DEPTH_COMPONENT24)], msF = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, msF); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rbs[0]); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbs[1]);
    const cT = tex(w, h, gl.RGBA16F, false), zT = tex(w, h, gl.DEPTH_COMPONENT24, false), rF = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rF); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cT, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, zT, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (T = { w, h, msF, rF, rbs, cT, zT });
  };
  return {
    // drawScene(cam, viewport, hook): the page's own drawing; it calls hook(gl, program) after useProgram.
    // o: { up, lDir (toward the light), unit (world units in a millimeter), center and size (what the shadow covers),
    //      near, far (the camera's), exposure, aoR (how far the gaps' shading reaches: world units, times the picture's height over the distance) }
    frame(drawScene, cam, W, H, o) {
      const t = targets(W, H), l = o.lDir.map((x) => x / Math.hypot(...o.lDir));
      const eye = o.center.map((c, k) => c + l[k] * o.size * 2);
      const lvp = mul(ortho(o.size, 0.01, o.size * 4), lookAt(eye, o.center, Math.abs(l[1]) > 0.9 && o.up[1] ? [0, 0, 1] : o.up));
      const iv = inverse(cam.vp);
      const hook = (depthOnly) => (g, p) => {
        const U = (n) => g.getUniformLocation(p, n);
        g.uniform1i(U('uDepthOnly'), depthOnly ? 1 : 0);
        g.uniformMatrix4fv(U('uLVP'), false, lvp); g.uniformMatrix4fv(U('uInvVP'), false, iv); g.uniform3fv(U('uLDir'), l); g.uniform3fv(U('uUp'), o.up); g.uniform1f(U('uUnit'), o.unit);
        if (!depthOnly) g.uniform3fv(U('uCam'), cam.pos);
        g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, depthOnly ? null : smTex); g.uniform1i(U('uShadow'), 1); g.activeTexture(g.TEXTURE0);
      };
      gl.bindFramebuffer(gl.FRAMEBUFFER, smFbo);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
      drawScene({ vp: lvp, pos: eye, rot: cam.rot }, { x: 0, y: 0, w: SM, h: SM }, hook(true));
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.msF);
      drawScene(cam, { x: 0, y: 0, w: W, h: H }, hook(false));
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msF); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.rF);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.disable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.zT); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.cT);
      gl.useProgram(comp.p); const u = comp.u;
      gl.uniform1i(u.uC, 0); gl.uniform1i(u.uZ, 1); gl.uniform2f(u.uPx, 1 / W, 1 / H); gl.uniform1f(u.uNear, o.near); gl.uniform1f(u.uFar, o.far);
      gl.uniform1f(u.uAoR, o.aoR * H); gl.uniform1f(u.uExp, o.exposure ?? 0.85);
      gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);
    },
  };
}
