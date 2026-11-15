// The page's shaders. Colours arrive already worked out by the model (model.js) as display values;
// the shaders only light them. Nothing here fades with the zoom: a thing is drawn at its true size
// and is seen or not according to how big that is on screen.

const HEAD = `#version 300 es
precision highp float; precision highp int;
`;
const LIGHT = `
uniform vec3 uSun;                 // direction to the Sun, in the camera's frame
`;

// ---- the sky ---------------------------------------------------------------------------------------
export const SKY_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat3 uRay;                 // turns a screen position into a direction in the world
out vec3 vDir;
void main() { vDir = uRay * vec3(aPos.xy, 1.0); gl_Position = vec4(aPos.xy, 0.9999, 1.0); }`;
export const SKY_FS = HEAD + `
in vec3 vDir; out vec4 o;
uniform vec3 uSunW; uniform float uDay;      // how far the Sun is up: 0 at the horizon, 1 well above it
vec3 day(float y) { return mix(vec3(0.5,0.69,0.9), vec3(0.075,0.25,0.6), smoothstep(0.0, 0.55, y)); }
vec3 sky(float y) {
  vec3 c = mix(vec3(0.886,0.635,0.455), vec3(0.655,0.412,0.478), smoothstep(0.0, 0.05, y));
  c = mix(c, vec3(0.353,0.29,0.463), smoothstep(0.03, 0.12, y));
  c = mix(c, vec3(0.141,0.188,0.38), smoothstep(0.08, 0.26, y));
  c = mix(c, vec3(0.055,0.094,0.22), smoothstep(0.2, 0.5, y));
  return mix(c, vec3(0.024,0.035,0.086), smoothstep(0.4, 0.95, y));
}
void main() {
  vec3 d = normalize(vDir);
  vec3 c = d.y >= 0.0 ? mix(sky(d.y), day(d.y), uDay) : mix(mix(vec3(0.886,0.635,0.455) * 0.5, vec3(0.5,0.69,0.9), uDay), mix(vec3(0.03,0.05,0.06), vec3(0.2,0.3,0.25), uDay), smoothstep(0.0, 0.12, -d.y));
  float s = max(dot(d, uSunW), 0.0);
  c += mix(vec3(1.0,0.72,0.45), vec3(1.0,0.95,0.86), uDay) * (0.5 * pow(s, 40.0) + 0.22 * pow(s, 6.0));
  o = vec4(c, 1.0);
}`;

// ---- the lawn and the far hills -------------------------------------------------------------------
export const LAND_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uMV, uP; uniform vec4 uShape;      // lawn: half-width; hills: radius, height
uniform int uKind;
out vec3 vW; out vec3 vV;
void main() {
  vec3 w = uKind == 0 ? vec3(aPos.x * uShape.x, 0.0, aPos.y * uShape.x) : vec3(aPos.x * uShape.x, (aPos.z * 0.5 + 0.5) * uShape.y, aPos.y * uShape.x);
  vW = w; vec4 v = uMV * vec4(w, 1.0); vV = v.xyz; gl_Position = uP * v;
}`;
export const LAND_FS = HEAD + `
in vec3 vW; in vec3 vV; out vec4 o;
uniform int uKind; uniform vec4 uShape; uniform vec3 uTint;
uniform float uLum; uniform vec3 uHaze;        // how bright the daylight is, and the colour of the far air
uniform vec4 uShade; uniform float uShadeL;    // the tree's shadow: the way to the Sun along the ground, how far off its middle lies, how dark it is; and its length
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
void main() {
  if (uKind == 0) {
    float r = length(vW.xz);
    vec3 c = mix(vec3(0.115,0.235,0.15), vec3(0.17,0.29,0.2), noise(vW.xz * 1.7)) * (0.9 + 0.2 * noise(vW.xz * 9.0));
    c *= 1.0 - 0.32 * exp(-dot(vW.xz, vW.xz) / 7.0);                                            // under the tree little of the sky is seen
    vec2 sd = vW.xz + uShade.xy * uShade.z; float al = dot(sd, uShade.xy), pe = sd.x * uShade.y - sd.y * uShade.x;
    c *= 1.0 - uShade.w * exp(-(al * al / (uShadeL * uShadeL) + pe * pe / 7.0));                  // the tree's shadow, longer the lower the Sun
    c = mix(c * uLum, uHaze, smoothstep(8.0, 60.0, r));                                         // haze with distance
    o = vec4(c, 1.0);
  } else {
    float a = atan(vW.z, vW.x), h = uShape.y * (0.42 + 0.2 * sin(a * 3.0 + uShape.z) + 0.13 * sin(a * 7.0 + uShape.z * 2.3) + 0.07 * abs(sin(a * 17.0 + uShape.z)) + 0.035 * abs(sin(a * 41.0)));
    if (vW.y > h) discard;
    o = vec4(mix(uTint * 1.5, uTint, smoothstep(0.0, h, vW.y)), 1.0);
  }
}`;

// ---- leaves ---------------------------------------------------------------------------------------
// One leaf outline drawn for every leaf. The blade curves down away from its stalk.
export const LEAF_VS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aLobe;      // aLobe.x: which lobe the point belongs to
layout(location=2) in vec3 iPos; layout(location=3) in vec4 iQuat; layout(location=4) in vec4 iCol;
uniform mat4 uMV, uP; uniform float uDroop;
uniform float uLobeA[7]; uniform vec3 uFold;      // each lobe's angle; and how far the leaf is still folded as it was in the bud (0 to 1), how far each half lobe is turned down at most, how much more it hangs
uniform vec3 uSlide, uThick;      // a part of the cut leaf moved off; and the leaf's thickness, for the face of the cut
out vec2 vUV; out vec3 vN; out vec3 vV; out vec3 vCol; out float vH;
vec3 rot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
// A point of the blade, folded as bladeAt() in tree.js folds it: each lobe creased along its middle vein, the lobes drawn together like a fan.
vec3 blade(vec2 p, float A) {
  float ph = abs(A) < 1e-4 ? 0.0 : uFold.x * uFold.y, A2 = A * atan(0.36397 * cos(ph)) / 0.349066, t = p.x * cos(A) + p.y * sin(A), s = p.y * cos(A) - p.x * sin(A), w = s * cos(ph);
  return vec3(t * cos(A2) - w * sin(A2), t * sin(A2) + w * cos(A2), abs(s) * sin(ph) - uDroop * (1.0 + uFold.z * uFold.x) * dot(p, p));
}
void main() {
  float A = uLobeA[int(aLobe.x + 0.5)]; vec3 b0 = blade(aPos.xy, A);
  vec3 l = b0 - aPos.z * uThick + uSlide; vH = aPos.z;
  vec4 v = uMV * vec4(iPos + rot(iQuat, l * iCol.a), 1.0);
  vec3 nb = uFold.x > 0.0 ? cross(blade(aPos.xy + vec2(1e-3, 0.0), A) - b0, blade(aPos.xy + vec2(0.0, 1e-3), A) - b0) : vec3(2.0 * uDroop * aPos.xy, 1.0);
  vN = mat3(uMV) * rot(iQuat, nb);
  vUV = aPos.xy; vV = v.xyz; vCol = iCol.rgb; gl_Position = uP * v;
}`;
export const LEAF_FS = HEAD + LIGHT + `
in vec2 vUV; in vec3 vN; in vec3 vV; in vec3 vCol; in float vH; out vec4 o;
uniform int uDetail;                 // 1 for the leaf we follow, 2 for the face of the cut through it
uniform vec3 uEarly, uLate, uVein;   // that leaf's colour a few days earlier and later, and its veins' colour
uniform vec2 uCutO, uCutX; uniform int uKeep; uniform sampler2D uFace;   // the cut across it: a point on the cut line and the way the line runs; and which side of it is being drawn (0: the leaf is whole)
uniform float uMic, uCells, uFaceHalf;   // a micrometre in leaf lengths; how far along the cut the cells are built one by one; the colours of the tall and the loose cells
uniform vec2 uLobe[7];               // each lobe's direction and length
uniform float uVeinW, uSideW, uNetW, uNetCell;
uniform float uLum;                  // how bright the daylight is
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
// A net of fields, each "cell" across: how far this point is from the nearest line between two fields, and a number of the field's own
vec3 net(vec2 uv, float cell) {
  vec2 g = uv / cell; g += 0.22 * (vec2(noise(g * 1.9), noise(g * 1.9 + 31.7)) - 0.5);          // real veins wander: the lines between fields are not ruled straight
  vec2 id = floor(g), own = id; float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 k = id + vec2(i, j); float dd = length(k + vec2(hash(k), hash(k + 7.3)) - g); if (dd < d1) { d2 = d1; d1 = dd; own = k; } else if (dd < d2) d2 = dd; }
  return vec3((d2 - d1) * 0.5 * cell, hash(own + 3.7), 0.0);
}
// how much of a pixel a line of width w covers, at distance d from its middle
float cover(float d, float w) { float px = max(fwidth(d), 1e-9); return clamp((0.5 * w - d) / px + 0.5, 0.0, 1.0) * min(1.0, w / px); }
void main() {
  vec2 hd = vUV - uCutO; float hx = dot(hd, uCutX), hy = dot(hd, vec2(-uCutX.y, uCutX.x));
  if (uDetail == 1 && uKeep != 0 && hy * float(uKeep) < 0.0) discard;
  if (uDetail == 2) {                                // the face of the cut beyond the cells that are built: a picture of those same cells, taken square on and laid end to end
    float xs = hx / uMic; if (abs(xs) < uCells) discard;
    o = texture(uFace, vec2(xs / (2.0 * uFaceHalf) + 0.5, 1.0 - vH), -1.0); if (o.a < 0.02) discard; return;     // clear where the cells are clear: what is behind the leaf shows through its skin
  }
  vec3 v = normalize(-vV), n = normalize(vN); if (dot(n, v) < 0.0) n = -n;     // the side that faces the eye, whichever way round a triangle was drawn (at the teeth some fold back on themselves)
  float ndl = dot(n, uSun);
  vec3 base = vCol;
  if (uDetail == 1) { float t = clamp((length(vUV - vec2(0.1, 0.0)) - 0.05) / 0.8, 0.0, 1.0); base = t < 0.5 ? mix(uEarly, vCol, t * 2.0) : mix(vCol, uLate, t * 2.0 - 1.0); }
  // the veins, at their true width
  float main = 0.0, side = 0.0;
  for (int i = 0; i < 7; i++) {
    vec2 d = uLobe[i]; float L = length(d); d /= L;
    float t = dot(vUV, d), s = vUV.x * d.y - vUV.y * d.x;
    if (t > 0.0 && t < 0.97 * L) main = max(main, cover(abs(s), uVeinW * (1.0 - 0.6 * t / L)));
    if (uDetail == 1) {
      float n9 = floor(9.0 * L + 0.5), gap = 0.74 * L / (n9 + 1.0), q = (t - 0.12 * L) - abs(s) * 0.75, k = floor(q / gap + 0.5);
      if (k >= 1.0 && k <= n9 && abs(s) < 0.15 * L) side = max(side, cover(abs(q - k * gap) * 0.8, uSideW));
    }
  }
  vec3 c = base; float relief = 0.0;
  if (uDetail == 1) {
    // What a leaf's upper side shows from close by. Veins branch into finer and finer veins that close into a net of small fields;
    // the blade is puckered between them, and no two fields are quite the same shade. Finest of all, the skin's own cells.
    vec3 big = net(vUV, uNetCell * 4.0), small = net(vUV, uNetCell), skin = net(vUV, uNetCell / 22.0);
    float px = length(fwidth(vUV)), v3 = cover(big.x, uNetW * 3.2), v4 = cover(small.x, uNetW), v5 = cover(skin.x, uNetW * 0.12);
    float blotch = noise(vUV / (uNetCell * 9.0)) - 0.5, fine = noise(vUV / (uNetCell * 0.35)) - 0.5;
    c = blotch > 0.0 ? mix(c, uLate, min(1.0, blotch * 1.3)) : mix(c, uEarly, min(1.0, -blotch * 1.3));     // the pigments are not spread evenly: patches run a few days ahead or behind
    c *= 1.0 + 0.16 * (small.y - 0.5) + 0.1 * (big.y - 0.5) + 0.1 * fine + 0.07 * (skin.y - 0.5) * clamp(uNetCell / 22.0 / px - 0.5, 0.0, 1.0);
    c = mix(c, c * 0.8, 0.5 * v5);
    c = mix(c, uVein, 0.4 * v4);
    c = mix(c, uVein, 0.55 * v3);
    c = mix(c, uVein, 0.6 * side);
    // relief: the veins lie in grooves and the fields between them bulge, so each catches the light on one side
    float h = 0.8 * smoothstep(0.0, uNetCell * 0.42, small.x) + 0.5 * smoothstep(0.0, uNetCell * 1.1, big.x);
    vec2 lit = normalize(uSun.xy + vec2(1e-4, 0.0));
    relief = dot(vec2(dFdx(h), dFdy(h)), lit) / max(px, 1e-9) * uMic * 20.0 * clamp(uNetW * 2.0 / px, 0.0, 1.0);
  }
  c = mix(c, uDetail == 1 ? uVein : base * 1.22 + 0.02, 0.75 * main);
  // the sunlit side is matt and bright; seen from the other side, the light that comes through makes it glow
  vec3 col = c * (0.62 + 0.85 * max(ndl, 0.0) + 0.72 * smoothstep(0.0, 0.6, -ndl)) * (1.0 + clamp(relief, -0.4, 0.45));
  col += vec3(1.0, 0.9, 0.8) * 0.12 * pow(max(dot(n, normalize(uSun + v)), 0.0), 30.0);
  if (uDetail == 1) { float w = fwidth(hy); col = mix(col, vec3(1.0), 0.85 * (1.0 - smoothstep(1.0, 2.2, abs(hy) / max(w, 1e-9))) * (1.0 - smoothstep(0.004, 0.012, w))); }   // the line the leaf is cut along, marked in white from the Leaf scale on

  col *= uLum; { float m = max(col.r, max(col.g, col.b)); if (m > 0.6) col *= (0.6 + 0.4 * (1.0 - exp(-(m - 0.6) / 0.4))) / m; }     // nearly brighter than the screen can show: eased down as a whole, so that the colour the model gave is kept and the brightest leaf still shows its veins
  o = vec4(col, 1.0);
}`;

// ---- every solid thing: branches, cells, chloroplasts, atoms --------------------------------------
// Each copy carries a place, a rotation, a size, a colour and three numbers: its kind, a threshold
// and an index. Kinds:
//  0 matt solid            1 clear shell (a cell wall)      2 vacuole              3 glowing
//  4 chloroplast (far)     5 stack of membranes             6 chloroplast envelope   14 drop of fat in a chloroplast
//  7, 8, 9 part of a chlorophyll, carotenoid or anthocyanin molecule (gone when the pigment is below the threshold)
// 10, 11 a far-off chlorophyll or carotenoid, flat   12 a dot of light   13 a white ring marker
export const SOLID_VS = HEAD + `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
layout(location=2) in vec3 iPos; layout(location=3) in vec4 iQuat; layout(location=4) in vec3 iScale; layout(location=5) in vec4 iCol; layout(location=6) in vec3 iMat;
uniform mat4 uMV, uP; uniform int uShape;       // 0 scaled as it is, 1 capsule (round ends keep their shape), 2 always facing the camera
uniform vec4 uCamQ;
uniform vec3 uPig;                               // chlorophyll, carotenoids, anthocyanin in the followed cell
uniform float uSize[8];
uniform float uBend;                             // the leaf's surface curves down away from the middle of the window by this much per unit of distance squared, and the cells under it follow
out vec3 vN; out vec3 vV; out vec4 vCol; out vec3 vMat; out vec3 vL;
vec3 rot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
void main() {
  int kind = int(iMat.x + 0.5);
  vec3 sc = iScale; float grow = 1.0;
  if (kind == 4 || kind == 6) grow = uSize[int(iMat.z + 0.5)];
  if (kind == 5) grow = clamp((uPig.x - iMat.y) / 0.12, 0.0, 1.0);
  if (kind == 14) grow = 1.0 - clamp((uPig.x - iMat.y) / 0.12, 0.0, 1.0);
  if (kind == 7 || kind == 10) grow = clamp((uPig.x - iMat.y) / 0.06, 0.0, 1.0);
  if (kind == 8 || kind == 11) grow = clamp((uPig.y - iMat.y) / 0.06, 0.0, 1.0);
  if (kind == 9 || kind == 16) grow = clamp((uPig.z - iMat.y) / 0.06, 0.0, 1.0);
  vec3 l, n;
  if (uShape == 1) { float r = min(sc.x, sc.y), sg = aPos.z > 0.0 ? 1.0 : -1.0; l = vec3(aNor.xy * sc.xy, aNor.z * r + sg * max(sc.z - r, 0.0)); n = aNor; }
  else { l = aPos * sc; n = aNor / sc; }
  if (kind == 0 && iCol.a < 0.999 && uShape == 0) l.xy *= mix(1.0, iCol.a, aPos.z * 0.5 + 0.5);   // a branch narrows toward its end
  vec4 q = uShape == 2 ? uCamQ : iQuat;
  vec4 v = uMV * vec4(iPos - vec3(0.0, 0.0, uBend * dot(iPos.xy, iPos.xy)) + rot(q, l * grow), 1.0);
  vN = mat3(uMV) * rot(q, n); vV = v.xyz; vCol = iCol; vMat = iMat; vL = aPos;
  gl_Position = uP * v;
}`;
export const SOLID_FS = HEAD + LIGHT + `
in vec3 vN; in vec3 vV; in vec4 vCol; in vec3 vMat; in vec3 vL; out vec4 o;
uniform vec4 uBody[8], uDot[8], uVac[8];
uniform float uFlash[64];
uniform vec4 uFog;                  // colour and thickness of what the view is inside (the vacuole's water)
uniform float uFogMax;              // above 0: the view is inside coloured water this deep (in metres), which tints what is seen through it
uniform float uLum;                 // how bright the daylight is, for the tree's wood
uniform float uNear;                // above 0: nothing nearer than this (metres) is drawn, the water included: molecules beyond it come into sight gradually, and the water's colour hides them only from there on
uniform float uFade;                // how much of a molecule built atom by atom shows: they are smaller than a pixel from far off
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  int kind = int(vMat.x + 0.5), idx = int(vMat.z + 0.5);
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), v = normalize(-vV);
  float ndl = max(dot(n, uSun), 0.0), ndv = max(dot(n, v), 0.0), rim = pow(1.0 - ndv, 3.0);
  float spec = pow(max(dot(n, normalize(uSun + v)), 0.0), 40.0);
  vec3 c = vCol.rgb; float a = 1.0;
  if (kind == 0) c = (c * (0.32 + 0.68 * ndl) + vec3(0.9, 0.6, 0.45) * 0.12 * rim) * uLum;
  else if (kind == 1) { a = vCol.a + (1.0 - vCol.a) * 0.3 * rim * rim; c = c * (0.55 + 0.45 * ndl) + 0.3 * spec; }
  else if (kind == 2) { vec4 t = uVac[idx]; c = t.rgb * (0.55 + 0.45 * ndv + 0.25 * ndl); a = t.a; }
  else if (kind == 3 || kind == 7 || kind == 8 || kind == 9) {
    if (vCol.a > 0.5) { float f = uFlash[idx]; c = c * (0.85 + 0.35 * ndv) + c * 1.6 * f + vec3(1.0) * 0.9 * f * f; }      // the bonds whose electrons take in light
    else c = c * (0.35 + 0.65 * ndl) + 0.25 * spec;
  }
  else if (kind == 4) {
    vec3 p = vL * 3.2, id = floor(p); float d = 9.0;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 cell = id + vec3(i, j, k); d = min(d, length(cell + vec3(hash3(cell), hash3(cell + 3.1), hash3(cell + 5.7)) - p)); }
    c = mix(uDot[idx].rgb, uBody[idx].rgb, smoothstep(0.28, 0.42, d)) * (0.62 + 0.5 * ndl) + 0.3 * spec + uBody[idx].rgb * 0.35 * rim;
  }
  else if (kind == 5) { vec3 m = uDot[0].rgb * 1.2; c = m * (0.45 + 0.55 * ndl) + 0.3 * spec + m * 0.4 * rim; }
  else if (kind == 6) { c = uBody[idx].rgb * (0.7 + 0.3 * ndl) + 0.6 * spec; a = 0.3 + 0.6 * rim; }
  else if (kind == 14) c = uBody[idx].rgb * (0.75 + 0.5 * ndl) + 0.4 * spec;
  else if (kind == 15) c = uBody[idx].rgb * 0.3;                                  // the rest of the leaf behind the cells that are drawn, in shade
  else if (kind == 10) { float r = length(vL.xy); float w = fwidth(r); a = smoothstep(0.78 - w, 0.78, r) * (1.0 - smoothstep(0.92, 0.92 + w, r)); if (a < 0.01) discard; }
  else if (kind == 11) { float w = fwidth(vL.y); a = 1.0 - smoothstep(0.5, 0.5 + w, abs(vL.y)); if (a < 0.01) discard; }
  else if (kind == 12) { float r = length(vL.xy); a = exp(-r * r * 7.0); c = c * 1.3 + vec3(0.35) * exp(-r * r * 40.0); if (a < 0.01) discard; }
  else if (kind == 13) { float r = length(vL.xy), w = max(1.6 * vMat.y * vCol.a, fwidth(r) * 0.5); a = smoothstep(1.0 - 2.0 * w, 1.0 - w, r) * (1.0 - smoothstep(1.0 - w, 1.0, r)); c = vec3(1.0); if (a < 0.01) discard; }
  else if (kind == 16) {                                                          // an anthocyanin molecule too far off to build atom by atom: the outline of its three rings
    vec2 p = vL.xy * vec2(0.62, 0.24); float w = max(fwidth(p.x), fwidth(p.y)), lw = max(0.035, w * 0.55);
    float dd = min(abs(length(p - vec2(-0.42, 0.0)) - 0.16), min(abs(length(p - vec2(-0.14, 0.0)) - 0.16), abs(length(p - vec2(0.3, 0.0)) - 0.16)));
    if (p.x > 0.02 && p.x < 0.14) dd = min(dd, abs(p.y));
    a = 1.0 - smoothstep(lw, lw + w, dd); if (uNear > 0.0) a *= smoothstep(uNear, uNear * 1.3, -vV.z); if (a < 0.01) discard;
  }
  if (kind == 7 || kind == 8 || kind == 9) a *= uFade;
  if (kind == 10 || kind == 11 || kind == 12 || kind == 16) a *= clamp(2.0 / max(fwidth(vL.x), fwidth(vL.y)), 0.0, 1.0);   // smaller than a pixel: only its share of the pixel shows
  if (uFog.a > 0.0 && kind != 12 && kind != 13) {
    if (uFogMax > 0.0) { c = mix(uFog.rgb, c, exp(-uFog.a * min(length(vV), uFogMax))); if (a < 1.0) a = mix(1.0, a, exp(-uFog.a * min(length(vV), uFogMax))); }
    else a *= exp(-uFog.a * max(length(vV) - uNear, 0.0));                  // a molecule: hidden by the coloured water in front of it
  }
  o = vec4(c, a);
}`;

// ---- the face of a membrane: the heads of its fat molecules, packed side by side ------------------
export const MEMB_VS = HEAD + `
layout(location=0) in vec3 aPos;
uniform mat4 uMV, uP; uniform float uR;
out vec2 vXY; out vec3 vV;
void main() { vec3 w = vec3(aPos.xy * uR, 0.0); vXY = w.xy; vec4 v = uMV * vec4(w, 1.0); vV = v.xyz; gl_Position = uP * v; }`;
export const MEMB_FS = HEAD + LIGHT + `
in vec2 vXY; in vec3 vV; out vec4 o;
uniform float uR, uChl; uniform vec3 uTint; uniform mat3 uN;     // uN: the membrane's own axes in the camera's frame
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (length(vXY) > uR) discard;
  // heads 0.8 nm apart, in rows that interlock
  vec2 g = vec2(vXY.x / 0.8, vXY.y / 0.693); float row = floor(g.y + 0.5); g.x += 0.5 * mod(row, 2.0);
  vec2 d = vec2((fract(g.x + 0.5) - 0.5) * 0.8, (g.y - row) * 0.693); float r = length(d) / 0.42;
  float px = fwidth(vXY.x) / 0.8, flat_ = clamp(px * 5.0 - 0.6, 0.0, 1.0);                     // once a head is only a pixel or two across only the average is seen
  vec3 nl = r < 1.0 ? normalize(vec3(d / 0.42, sqrt(1.0 - r * r) * 1.3)) : vec3(0.0, 0.0, 1.0);
  nl = normalize(mix(nl, vec3(0.0, 0.0, 1.0), flat_));
  float shade = mix(r < 1.0 ? 1.0 : 0.6, 0.85, flat_);
  // the proteins that hold the pigments: mounds some 10 to 16 nm across standing out of the fat, fewer as the chlorophyll goes
  const float CELL = 17.0; vec2 q = vXY / CELL, qi = floor(q); float in_ = 0.0; vec3 np = vec3(0.0, 0.0, 1.0); float aa = fwidth(vXY.x) * 1.2;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = qi + vec2(float(i), float(j)); float h = h2(id);
    float here = clamp((uChl - (0.03 + 0.85 * h2(id + 7.3))) / 0.06, 0.0, 1.0); if (here <= 0.0) continue;
    vec2 c0 = (id + 0.5 + 0.5 * (vec2(h, h2(id + 3.1)) - 0.5)) * CELL, e = vXY - c0; float an = h2(id + 11.9) * 3.1416, cs = cos(an), sn = sin(an);
    e = vec2(cs * e.x + sn * e.y, cs * e.y - sn * e.x) / (vec2(7.6, 5.2) * mix(0.75, 1.0, h) * here);
    float rr = length(e), k = 1.0 - smoothstep(1.0 - aa / 5.0, 1.0 + aa / 5.0, rr);
    if (k > in_) { in_ = k; float zz = sqrt(max(1.0 - min(rr, 1.0) * min(rr, 1.0), 0.0)); vec2 t = vec2(cs * e.x - sn * e.y, sn * e.x + cs * e.y); np = normalize(vec3(t * 0.9, zz + 0.45)); }
  }
  float small = clamp(aa / 8.0 - 0.1, 0.0, 1.0);                                                       // a mound only a few pixels across: no shading of its own
  nl = normalize(mix(nl, mix(np, vec3(0.0, 0.0, 1.0), small), in_)); shade = mix(shade, 1.0, in_);
  vec3 tint = mix(mix(vec3(0.62, 0.64, 0.56), uTint, 0.35), uTint * 1.1 + 0.03, in_);
  vec3 n = normalize(uN * nl), v = normalize(-vV);
  vec3 c = tint * shade * (0.7 + 0.4 * max(dot(n, uSun), 0.0)) + 0.25 * pow(max(dot(n, normalize(uSun + v)), 0.0), 30.0) * (1.0 - max(flat_, in_ * 0.6));
  o = vec4(c, 1.0);
}`;
