// Engine: the shaders. The car, the engine and the gas are one model made of distance functions (how far a
// point is from the nearest surface), drawn by stepping each pixel's ray through it. Sizes are metres and match
// model.js. The cuts are part of the model. A cut piece does not move: it fades away where it is, by drawing the
// picture with it and without it and mixing the two.
export const WORLD_FS = `#version 300 es
precision highp float;
uniform vec2 uRes, uCenter; uniform vec3 uCam, uRt, uUp, uFw, uSun; uniform float uTan;
uniform float uPhi, uCutCar, uCutLift, uCutEnd, uGas, uGasStep, uRoad, uDots, uGasCut;
out vec4 o;
const vec3 EO = vec3(1.30, 0.36, 0.0);
const float DECK = 0.2207, CR = 0.045, ROD = 0.145, BORE = 0.042, XC = -0.1615, VX = 0.0175;
const float H0 = 0.0985;                                          // height of the gas at the bottom of the stroke
const float OFF[4] = float[4](0., 540., 180., 360.);          // firing order 1-3-4-2
const vec3 AX = vec3(0., 0.9455, 0.3256);                      // valve axis, 19 degrees from upright
const float X4 = -0.144;
const float IX = -0.012;      // the injector is drawn 12 mm to one side of the cylinder's middle, so that the cross cut bares it
const vec3 INJ0 = vec3(IX, DECK + 0.0015, 0.0375), INJ1 = vec3(IX, DECK + 0.031, 0.102), INJ2 = vec3(IX, DECK + 0.032, 0.126);   // tip, bend, end
const vec3 VS = vec3(0., DECK + 0.0083, 0.019);                // valve seat centre (folded: z is away from the middle)

bool gCar = false, gLift = false, gEnd = false;      // which cut pieces are left out of the picture being drawn

float hash(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float box(vec3 p, vec3 c, vec3 h, float r){ vec3 q = abs(p - c) - h + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float box2(vec2 p, vec2 h){ vec2 q = abs(p) - h; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }
float seg(vec3 p, vec3 a, vec3 b){ vec3 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
float seg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
float cylY(vec3 p, float r, float y0, float y1){ return max(length(p.xz) - r, max(y0 - p.y, p.y - y1)); }
float cylX(vec3 p, float r, float x0, float x1){ return max(length(p.yz) - r, max(x0 - p.x, p.x - x1)); }
void U(inout vec2 a, float d, float m){ if (d < a.x) a = vec2(d, m); }

float cylOf(float x, out float xl){ float j = clamp(floor((0.192 - x) / 0.096), 0., 3.); xl = x - (0.144 - 0.096 * j); return j; }
float phiOf(float j){ return mod(uPhi - OFF[int(j)], 720.); }
float pinY(float phi){ float t = radians(phi), s = CR * sin(t); return CR * cos(t) + sqrt(ROD * ROD - s * s); }
float liftIn(float phi){ float u = mod(phi + 10., 720.) / 230.; return u < 1. ? 0.009 * pow(sin(3.14159 * u), 2.) : 0.; }
float liftEx(float phi){ float u = mod(phi - 490., 720.) / 240.; return u < 1. ? 0.009 * pow(sin(3.14159 * u), 2.) : 0.; }
float portDist(vec3 f){ vec3 P1 = VS + AX * 0.022, P2 = vec3(0., DECK + 0.050, 0.060), P3 = vec3(0., DECK + 0.060, 0.20);
  return min(seg(f, VS + AX * 0.001, P1), min(seg(f, P1, P2), seg(f, P2, P3))); }

// ---- the engine's fixed parts
float blockD(vec3 p){
  float xl; cylOf(p.x, xl);
  float d = box(p, vec3(0., (DECK - 0.19) * .5, 0.), vec3(0.215, (DECK + 0.19) * .5, 0.08), 0.004);
  float bore = max(length(vec2(xl, p.z)) - BORE, 0.03 - p.y);
  float cc = max(abs(xl) - 0.036, min(length(p.yz) - 0.078, max(abs(p.z) - 0.068, max(p.y, -0.182 - p.y))));
  return max(d, -min(bore, cc));
}
float coverD(vec3 p){
  float d = box(p, vec3(0., 0.352, 0.), vec3(0.215, 0.026, 0.09), 0.008);
  return max(d, -box(p, vec3(0., 0.340, 0.), vec3(0.211, 0.034, 0.086), 0.006));
}
vec2 headD(vec3 p){
  float xl; cylOf(p.x, xl);
  float d = box(p, vec3(0., (DECK + 0.326) * .5, 0.), vec3(0.215, (0.326 - DECK) * .5, 0.09), 0.002);
  float ch = max(length(vec2(xl, p.z)) - BORE, max(p.y - (DECK + 0.015 - 0.35 * abs(p.z)), DECK - 0.02 - p.y)) * .94;
  vec3 f = vec3(abs(xl) - VX, p.y, abs(p.z));
  float pd = portDist(f);
  vec3 q = f - VS; float t = dot(q, AX), rad = length(q - AX * t);
  float rv = p.z > 0. ? 0.016 : 0.0138;
  float seat = max(rad - rv - 0.0007, max(-0.004 - t, t - 0.003));
  float pocket = max(rad - 0.013, 0.050 - t);
  float well = max(length(vec2(xl, p.z)) - 0.0105, DECK + 0.045 - p.y);
  d = max(d, -min(min(ch, pd - (rv - 0.003)), min(seat, min(pocket, well))));
  vec2 r = vec2(d, 7.);
  float po = portDist(vec3(max(f.x, 0.), f.yz));       // outside the head the two ports of a cylinder are one pipe
  float tube = max(max(po - 0.0145, -(po - 0.011)), max(0.088 - f.z, f.z - 0.19));
  U(r, tube, p.z > 0. ? 22. : 23.);
  return r;
}
float rearCut(vec3 p){   // negative inside what the cross cut takes away
  float notch = box(p, vec3(-0.150, DECK + 0.12, 0.), vec3(0.0165, 0.101, 0.009), 0.);
  float inj = max(min(seg2(p.yz, INJ0.yz, INJ1.yz) - 0.0075, seg2(p.yz, INJ1.yz, INJ2.yz) - 0.0095), p.x - (X4 + IX + 0.005));   // and a slot that bares the injector
  return min(min(p.x - XC, notch), inj);
}

// ---- the engine's moving parts (never cut)
vec2 moving(vec3 p){
  vec2 r = vec2(1e3, 0.);
  float xl; float j = cylOf(p.x, xl); float phi = phiOf(j), th = radians(phi);
  float py = pinY(phi), top = py + 0.030;
  vec2 pin = CR * vec2(cos(th), -sin(th));           // (y, z) of the crank pin: clockwise seen from the belt end
  // piston
  if (p.y > 0.02) {
    vec3 q = vec3(xl, p.y, p.z);
    float d = cylY(q, 0.0416, py - 0.024, top) - 0.0;
    d = max(d, -max(length(q.xz) - 0.035, q.y - (py + 0.016)));
    d = max(d, -max(abs(q.x) - 0.0135, q.y - (py + 0.014)));
    d = min(d, max(length(q.xy - vec2(0., py)) - 0.009, abs(q.z) - 0.036));   // wrist pin
    U(r, d, 10.);
  }
  // connecting rod
  { vec2 a = vec2(py, 0.), b = pin, s = p.yz;
    float d2 = min(seg2(s, a, b) - 0.0085, min(length(s - a) - 0.0155, length(s - b) - 0.0315));
    U(r, max(d2, abs(xl) - 0.0105), 11.); }
  // crankshaft: pins, webs with counterweights, main journals, flange and sprocket
  { float d = max(length(p.yz - pin) - 0.023, abs(xl) - 0.02);
    float xw = abs(abs(xl) - 0.024) - 0.006; vec2 pd = pin / CR;
    float web = min(seg2(p.yz, vec2(0.), pin) - 0.027, max(length(p.yz) - 0.068, dot(p.yz, pd) + 0.012));
    d = min(d, max(web, xw));
    d = min(d, max(length(p.yz) - 0.026, max(0.024 - abs(xl), max(p.x - 0.25, -0.262 - p.x))));
    d = min(d, cylX(p, 0.047, -0.262, -0.236));
    U(r, d, 12.);
    U(r, cylX(p, 0.026, 0.224, 0.246), 20.); }
  // camshafts, valves, springs, tappets
  if (p.y > 0.18) {
    float sgn = p.z > 0. ? 1. : -1.;
    vec3 f = vec3(abs(xl) - VX, p.y, abs(p.z));
    float lift = sgn > 0. ? liftIn(phi) : liftEx(phi);
    vec3 q = f - (VS - AX * lift); float t = dot(q, AX), rad = length(q - AX * t);
    float rv = sgn > 0. ? 0.016 : 0.0138;
    float hd = max(rad - mix(rv, 0.003, clamp(t / 0.011, 0., 1.)), max(-0.0012 - t, t - 0.098));
    U(r, hd, sgn > 0. ? 14. : 15.);
    U(r, min(max(rad - 0.0124, max(0.091 - t, t - 0.096)), max(rad - mix(0.005, 0.0008, clamp((t - 0.096) / 0.008, 0., 1.)), max(0.096 - t, t - 0.104))), 25.);    // the spring's cap, and the pointed follower the cam's bump rides on
    // spring: rings between the head and the tappet
    vec3 q0 = f - VS; float t0 = dot(q0, AX);
    float lo = 0.052, hi = 0.091 - lift, n = 6., pitch = (hi - lo) / n;
    float tt = clamp(t0, lo, hi), k = (floor((tt - lo) / pitch) + .5) * pitch + lo;
    U(r, length(vec2(length(q0 - AX * t0) - 0.0092, t0 - k)) - 0.0013, 16.);
    // cam: a shaft with one lobe over each valve, turning at half the crank's speed
    vec2 cc = (VS + AX * 0.119).yz; vec2 c2 = f.yz - cc;
    float ang = -sgn * radians((phi - (sgn > 0. ? 105. : 610.)) * .5);     // both shafts turn the way the crankshaft does; z is folded here
    vec2 nose = -AX.yz; nose = vec2(nose.x * cos(ang) - nose.y * sin(ang), nose.x * sin(ang) + nose.y * cos(ang));
    float lc = length(c2), al = 2. * degrees(acos(clamp(dot(c2 / max(lc, 1e-5), nose), -1., 1.))), hw = sgn > 0. ? 115. : 120.;
    float lobe = (lc - 0.015 - (al < hw ? 0.009 * pow(cos(1.5708 * al / hw), 2.) : 0.)) * .7;     // the bump's height is the valve's lift
    float cam = min(max(lobe, abs(f.x) - 0.007), max(lc - 0.0105, max(p.x - 0.246, -0.212 - p.x)));
    U(r, cam, 13.);
    U(r, max(length(c2) - 0.052, abs(p.x - 0.235) - 0.011), 20.);
    // spark plug and its coil
    vec3 s = vec3(xl, p.y - DECK, p.z);
    float pl = cylY(s, 0.006, 0.0145, 0.046);
    pl = min(pl, cylY(s, 0.0013, 0.0096, 0.015));
    pl = min(pl, min(seg(s, vec3(0., 0.0145, 0.0048), vec3(0., 0.0078, 0.0048)), seg(s, vec3(0., 0.0078, 0.0048), vec3(0., 0.0078, -0.0008))) - 0.0009);
    pl = min(pl, cylY(s, 0.0092, 0.046, 0.058));
    U(r, pl, 17.);
    U(r, cylY(s, 0.0052, 0.058, 0.112), 18.);
    U(r, cylY(s, 0.0085, 0.112, 0.176), 19.);
    // fuel injector: its tip is in the cylinder, under the intake port
    { vec3 c = vec3(xl, p.y, p.z); U(r, min(seg(c, INJ0, INJ1) - 0.0042, seg(c, INJ1, INJ2) - 0.0068), 21.); }
  }
  // timing belt
  if (p.x > 0.2) {
    vec2 s = vec2(p.y, abs(p.z));
    float d2 = min(seg2(s, vec2(-0.004, 0.0285), vec2(0.330, 0.1125)), seg2(vec2(p.y, p.z), vec2(0.3955, -0.0577), vec2(0.3955, 0.0577)));
    vec2 c = s - vec2(0.3415, 0.0577);
    d2 = min(d2, max(abs(length(c) - 0.054), -dot(c, normalize(vec2(0.11, 0.0577))) - 0.012));
    vec2 c0 = vec2(p.y, p.z); d2 = min(d2, max(abs(length(c0) - 0.028), c0.x - 0.004));
    U(r, max(d2 - 0.002, abs(p.x - 0.235) - 0.0095), 19.);
  }
  return r;
}

vec2 engine(vec3 p){
  float bb = box(p, vec3(0.02, 0.105, 0.), vec3(0.30, 0.31, 0.215), 0.);
  if (bb > 0.05) return vec2(bb, 0.);
  vec2 r = moving(p);
  float rc = gEnd ? -rearCut(p) : -1e3;
  float b = blockD(p), c = coverD(p);
  if (gLift) { b = max(b, -p.z); c = max(c, -p.z); }      // without the near half of the block and the cover
  U(r, max(b, rc), p.y < -0.075 ? 9. : 6.); U(r, max(c, rc), 8.);
  vec2 h = headD(p); U(r, max(h.x, rc), h.y);
  return r;
}

// ---- the car
float shellD(vec3 p){      // the body's outside, before the wheel wells and the engine bay are hollowed out of it
  float lo = box(p, vec3(0., 0.52, 0.), vec3(2.14, 0.30, 0.86), 0.16);
  float hx = 1.22 - 0.95 * clamp(p.y - 0.80, 0., 0.6);
  float cab = box(vec3((p.x + 0.30) / hx, p.y, p.z), vec3(0., 1.06, 0.), vec3(1., 0.33, 0.74 - 0.22 * clamp(p.y - 0.8, 0., .6)), 0.12) * .7;
  float d = min(lo, cab) - 0.0;
  float h = clamp(.5 + .5 * (cab - lo) / 0.1, 0., 1.); return mix(cab, lo, h) - 0.1 * h * (1. - h);
}
float bodyD(vec3 p){
  float d = shellD(p);
  float well = max(length(vec2(abs(p.x) - 1.30, p.y - 0.33)) - 0.40, 0.50 - abs(p.z));
  float bay = box(p, vec3(1.42, 0.455, 0.), vec3(0.60, 0.335, 0.46), 0.02);      // narrower than the wheel wells, so an inner fender is left
  return max(d, -min(well, bay));
}
float carCut(vec3 p){ return max(0.75 - p.x, min(0.32 - p.z, 0.70 - p.y)); }   // negative inside the piece that is taken away
float wheelD(vec3 p, vec3 c){ vec3 q = p - c; return max(length(q.xy) - 0.33, abs(q.z) - 0.105) - 0.012; }
vec2 car(vec3 p){
  vec2 r = vec2(1e3, 0.);
  float bb = box(p, vec3(0.3, 0.7, 0.), vec3(2.3, 0.75, 1.0), 0.);
  if (bb > 0.3) return vec2(bb, 0.);
  U(r, gCar ? max(bodyD(p), -carCut(p)) : bodyD(p), 1.);
  float w = min(wheelD(p, vec3(-1.3, 0.33, -0.76)), min(wheelD(p, vec3(-1.3, 0.33, 0.76)), wheelD(p, vec3(1.3, 0.33, -0.76))));
  if (!gCar) w = min(w, wheelD(p, vec3(1.3, 0.33, 0.76)));      // the near front wheel goes with the fender
  U(r, w, 3.);
  return r;
}
vec3 toE(vec3 p){ return vec3(EO.x - p.x, p.y - EO.y, -p.z); }     // the engine's own frame: it sits in the car with its belt end to the rear
vec2 map(vec3 p){
  vec2 r = engine(toE(p));
  vec2 c = car(p); if (c.x < r.x) r = c; U(r, p.y, 5.);
  return r;
}
vec3 normal(vec3 p, float e){ vec2 k = vec2(1., -1.);
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x); }
float shadow(vec3 p, vec3 d, float tmax, float k){ float s = 1., t = 0.002 * tmax + 0.0006;
  // Half steps, and none longer than a tenth of the way gone: whole steps passed an edge at a different point of their stride
  // from one pixel to the next, and that showed as bands in the soft part of a shadow.
  for (int i = 0; i < 110; i++) { float h = map(p + d * t).x; s = min(s, k * h / t); t += clamp(h * .5, 0.0008 * tmax, 0.1 * t + 0.002 * tmax); if (s < 0.02 || t > tmax) break; }
  return clamp(s, 0., 1.); }
float ao(vec3 p, vec3 n, float sc){ float a = 0., w = 1.; for (int i = 1; i <= 4; i++) { float h = sc * float(i); a += w * (h - map(p + n * h).x); w *= .6; } return clamp(1. - 1.6 * a / sc, 0., 1.); }

vec3 sky(vec3 d){
  vec3 c = mix(vec3(0.74, 0.84, 0.95), vec3(0.20, 0.45, 0.85), pow(clamp(d.y, 0., 1.), .55));
  float hills = 0.035 + 0.035 * noise(vec3(atan(d.x, d.z) * 9., 0., 3.)) + 0.02 * noise(vec3(atan(d.x, d.z) * 31., 2., 1.));
  if (d.y < hills) c = mix(vec3(0.33, 0.47, 0.36), vec3(0.50, 0.62, 0.62), smoothstep(0., 0.07, d.y));
  c += vec3(1., .9, .7) * pow(max(dot(d, uSun), 0.), 300.) * 2.;
  return c;
}

// ---- gas: glow and dots inside the cylinder and the ports (engine frame)
vec4 dots(vec3 u, float cell, float rad, float squash){
  vec3 c = floor(u / cell); vec4 best = vec4(0.);
  for (int k = -1; k <= 1; k++) { vec3 cc = c + vec3(0., float(k), 0.);
    vec3 ctr = (cc + .5 + .56 * (vec3(hash(cc), hash(cc + 7.3), hash(cc + 13.7)) - .5)) * cell;
    vec3 dv = u - ctr; dv.y *= squash; float I = smoothstep(rad, rad * .35, length(dv));
    if (I > best.x) best = vec4(I, hash(cc + 3.1), 0., 0.); }
  return best;
}
vec4 dotsP(vec3 u, float cell, float rad){      // the same, repeating every 14 cells along z, for gas flowing in a pipe
  vec3 c = floor(u / cell), cc = vec3(c.xy, mod(c.z, 14.));
  vec3 ctr = (c + .5 + .56 * (vec3(hash(cc), hash(cc + 7.3), hash(cc + 13.7)) - .5)) * cell;
  return vec4(smoothstep(rad, rad * .35, length(u - ctr)), hash(cc + 3.1), 0., 0.);
}
vec4 gasAt(vec3 p){
  if (gEnd && p.x < uGasCut) return vec4(0.);
  float xl; float j = cylOf(p.x, xl); float phi = phiOf(j);
  float top = pinY(phi) + 0.030, rad = length(vec2(xl, p.z));
  float roof = DECK + 0.015 - 0.35 * abs(p.z);
  vec3 AIR = vec3(0.36, 0.64, 1.0), FUEL = vec3(0.30, 0.95, 0.42), BURN = vec3(1.0, 0.42, 0.08), FRONT = vec3(0.86, 0.80, 1.0), EXH = vec3(0.56, 0.47, 0.40);
  float others = j == 3. || !gEnd ? 1. : 0.;     // once the end of the engine is off, only the cylinder looked into shows its gas
  if (rad < BORE - 0.0006 && p.y > top + 0.0006 && p.y < roof - 0.0004) {
    // where the near half of the block is gone, the gas is left out too; once the end is off, the cylinder looked into shows all of its gas
    if (gLift && p.y < DECK && p.z < 0. && !(j == 3. && gEnd)) return vec4(0.);
    float h = DECK + 0.008 - top;
    bool closed = phi >= 180. && phi < 540.;
    float sq = closed ? H0 / h : 1.;
    vec3 g = vec3(xl, p.y - (DECK + 0.0092), p.z); float rf = length(g) + 0.0035 * (noise(p * 260.) - .5) + 0.004 * (noise(p * 90.) - .5);
    float Rf = 0.066 * pow(max(phi - 335., 0.) / 55., 1.5);
    bool lit = phi > 335. && rf < Rf;
    vec3 cs = vec3(0.); float as = 0.;
    float hot = 1. - smoothstep(372., 640., phi); hot *= hot;
    if (lit) { float a = (30. * clamp(sq, 1., 10.) + 200. * step(XC + 0.001, uGasCut)) * others * hot * (0.55 + 0.9 * noise(p * 110.)); cs += mix(BURN, vec3(1.25, 0.5, 0.1), hot * .6) * (0.5 + 0.35 * hot) * a; as += a; }
    if (phi > 335. && phi < 392.) { float e = (rf - Rf) / 0.0007, f = exp(-e * e) * 2600. * others; cs += FRONT * 2.6 * f; as += f; }
    if (phi > 335. && phi < 339.) { float f = exp(-dot(g, g) / (0.0014 * 0.0014)) * 9000.; cs += vec3(2.4, 2.2, 3.0) * f; as += f; }     // the spark, across the plug's gap
    if (uGas > 1.5) {
      float lay = (p.y - top) * sq;                       // height above the piston, as a share of the gas
      float k3 = pow(sq, 1. / 3.);                         // squeezed gas: the same dots closer together in every direction
      vec3 u = vec3(xl, p.y - top, p.z) * k3;
      vec4 d = dots(u, 0.0056, 0.00085 * mix(1., k3, .35), 1.); d.x *= uDots * others;
      vec3 f = vec3(xl, p.y, p.z);
      bool fuelHere = phi > 70. && (phi > 150. || length(f - INJ0) < (phi - 70.) / 80. * 0.13);
      vec3 col = lit ? mix(EXH, BURN, sqrt(hot)) : lay < 0.0165 ? EXH : (fuelHere && d.y < 0.0667 ? FUEL : AIR);
      float a = (col == FUEL ? 5200. : col == AIR ? 1900. : 2200.) * d.x;
      if (phi > 70. && phi < 125. && p.z > -0.03) {   // the spray: a cone of fuel from the injector's tip, whose last drops take a moment to turn to vapor
        float left = 1. - smoothstep(95., 125., phi);
        vec3 v = f - INJ0, dirS = normalize(vec3(0., -0.62, -0.79));
        float tt = dot(v, dirS), rr = length(v - dirS * tt);
        if (tt > 0.0005 && tt < 0.062 && rr < 0.0012 + tt * 0.15) { vec4 d2 = dots(f * 1.9, 0.0056, 0.0012, 1.); d2.x *= uDots * left; if (d2.x * 1.2 > d.x) { col = FUEL; a = 6500. * d2.x; } }
      }
      cs += col * a; as += a;
    }
    return as > 0. ? vec4(cs / as, as) : vec4(0.);
  }
  if (uGas > 1.5 && p.y > DECK) {   // the ports: air waiting in the intake, old exhaust in the exhaust; each moves while its valve is open
    vec3 f = vec3(abs(xl) - VX, p.y, abs(p.z));
    if ((f.z > 0.09 ? portDist(vec3(max(f.x, 0.), f.yz)) : portDist(f)) < 0.0102 && f.z > 0.022) {
      float flow = p.z > 0. ? clamp(mod(phi + 10., 720.), 0., 230.) / 230. : -clamp(mod(phi - 490., 720.), 0., 240.) / 240.;
      vec4 d = dotsP(vec3(xl, f.yz) + vec3(0., 0., 0.0784 * flow), 0.0056, 0.00085);
      return p.z > 0. ? vec4(AIR, 1500. * d.x * uDots * others) : vec4(EXH, 1700. * d.x * uDots * others);
    }
  }
  return vec4(0.);
}

float gPx = 0.;      // the size of a pixel where the ray landed, m
vec3 hatch(vec3 base, vec3 p, float f){ float s = fract((p.y + p.z + p.x) * f); return base * (0.93 + 0.07 * step(.5, s) * clamp(1.5 - gPx * f * 3., 0., 1.)); }

void main(){
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2. - 1. - uCenter; ndc.x *= uRes.x / uRes.y;
  vec3 rd = normalize(uFw + ndc.x * uTan * uRt + ndc.y * uTan * uUp), ro = uCam;
  float px = 2. * uTan / uRes.y;
  // A piece that is being cut away fades: the picture is drawn with it, then without it, and the two are mixed.
  float fade = max(uCutCar * (1. - uCutCar), max(uCutLift * (1. - uCutLift), uCutEnd * (1. - uCutEnd))) > 1e-4
    ? (uCutCar < .999 ? uCutCar : uCutLift < .999 ? uCutLift : uCutEnd) : 0.;
  vec3 outc = vec3(0.);
  for (int pass = 0; pass < 2; pass++) {
  if (pass == 1 && fade <= 0.) break;
  float gone = pass == 0 ? .999 : .001;
  gCar = uCutCar > gone; gLift = uCutLift > gone; gEnd = uCutEnd > gone;
  float t = 0., m = 0.; bool hit = false; float tmax = 150.;
  for (int i = 0; i < 260; i++) { vec2 h = map(ro + rd * t); if (h.x < px * t * .5) { hit = true; m = h.y; break; } t += h.x * .82; if (t > tmax) break; }
  // Land on the surface itself. Stopping within half a pixel of it left each pixel a different small distance short,
  // and the light and the cut faces, which are worked out from where the ray stopped, showed that as contour lines.
  if (hit) for (int i = 0; i < 4; i++) t += map(ro + rd * t).x;
  vec3 col = sky(rd);
  if (hit) {
    vec3 p = ro + rd * t, n = normal(p, max(px * t, 0.00008)), e = toE(p), ne = vec3(-n.x, n.y, -n.z);
    gPx = px * t;
    vec3 base = vec3(.5); float metal = 0., rough = .5; bool cutFace = false;
    if (m == 1.) { base = vec3(0.62, 0.03, 0.03); rough = .22;
      vec3 q = p;
      bool glass = q.y > 0.90 && q.y < 1.30 && abs(q.x + 0.42) > 0.045 && (abs(q.z) > 0.5 || abs(q.x + 0.3) > 0.72) && q.x > -1.42 && q.x < 0.95;
      if (glass) { base = vec3(0.04, 0.06, 0.09); rough = .08; metal = .6; }
      if (q.x > 2.03 && q.y > 0.52 && q.y < 0.66 && abs(q.z) > 0.42) { base = vec3(1.5, 1.45, 1.2); }
      if (q.x < -2.03 && q.y > 0.56 && q.y < 0.70 && abs(q.z) > 0.45) { base = vec3(0.9, 0.05, 0.03); }
      if (gCar && abs(carCut(q)) < 0.004) { base = hatch(vec3(0.80, 0.77, 0.71), q, 31.); rough = .9; metal = 0.; }
      else if (shellD(q) < -0.006) { base = vec3(0.07, 0.075, 0.085); rough = .8; metal = 0.; }
    }
    else if (m == 3.) { float rr = length(vec2(abs(p.x) - 1.3, p.y - 0.33));
      base = rr < 0.215 ? vec3(0.62, 0.64, 0.68) : vec3(0.035); metal = rr < 0.215 ? .8 : 0.; rough = rr < 0.215 ? .35 : .9; }
    else if (m == 5.) { float z = p.z, x = p.x + uRoad; base = vec3(0.30, 0.42, 0.22) * (0.85 + 0.3 * noise(vec3(x, 0., z) * 1.7));
      if (z < 2.25 && z > -5.6) { base = vec3(0.115, 0.118, 0.125) * (0.85 + 0.3 * noise(vec3(x, 0., z) * 40.));
        if (abs(z - 2.0) < 0.06 || abs(z + 5.35) < 0.06) base = vec3(0.8);
        if (abs(z + 1.75) < 0.06 && fract(x / 9. + .2) < .34) base = vec3(0.8); }
      rough = .95; }
    else if (m == 6.) { base = vec3(0.60, 0.64, 0.70); metal = .7; rough = .55; }
    else if (m == 7.) { base = vec3(0.72, 0.75, 0.80); metal = .7; rough = .5; }
    else if (m == 8.) { base = vec3(0.20, 0.22, 0.27); metal = .3; rough = .4; }
    else if (m == 9.) { base = vec3(0.09, 0.095, 0.105); metal = .5; rough = .5; }
    else if (m == 10.) { base = vec3(0.98, 0.76, 0.18); metal = .85; rough = .35;
      float xl; float j = cylOf(e.x, xl); float top = pinY(phiOf(j)) + 0.030; float dy = top - e.y;
      if (length(vec2(xl, e.z)) > 0.041 && (abs(dy - 0.006) < 0.0011 || abs(dy - 0.011) < 0.0011 || abs(dy - 0.017) < 0.0014)) { base *= .22; rough = .3; } }
    else if (m == 11.) { base = vec3(0.16, 0.72, 0.66); metal = .85; rough = .45; }
    else if (m == 12.) { base = vec3(0.22, 0.48, 0.95); metal = .9; rough = .4; }
    else if (m == 13.) { base = vec3(0.66, 0.42, 0.95); metal = .9; rough = .3; }
    else if (m == 14.) { base = vec3(0.35, 0.75, 1.0); metal = .9; rough = .3; }
    else if (m == 15.) { base = vec3(1.0, 0.45, 0.25); metal = .9; rough = .35; }
    else if (m == 16.) { base = vec3(0.50, 0.52, 0.56); metal = .9; rough = .3; }
    else if (m == 17.) { base = vec3(0.70, 0.68, 0.62); metal = .9; rough = .35; }
    else if (m == 18.) { base = vec3(0.98, 0.93, 0.78); rough = .3; }
    else if (m == 19.) { base = vec3(0.16, 0.17, 0.20); rough = .7; }
    else if (m == 20.) { base = vec3(0.55, 0.56, 0.58); metal = .9; rough = .4; }
    else if (m == 21.) { base = vec3(0.12, 0.62, 0.30); rough = .4; }
    else if (m == 22.) { base = vec3(0.16, 0.17, 0.19); rough = .6; }
    else if (m == 23.) { base = vec3(0.36, 0.25, 0.19); metal = .6; rough = .7; }
    else if (m == 25.) { base = vec3(0.66, 0.67, 0.70); metal = .9; rough = .25; }
    // a cut face is drawn flat and pale, with fine hatching, so it reads as cut metal
    if ((m >= 6. && m <= 9.) || m == 22. || m == 23.) {
      bool onL = gLift && (m == 6. || m == 8. || m == 9.) && abs(e.z) < 0.0006 + gPx && abs(ne.z) > .9;
      bool onR = gEnd && abs(rearCut(e)) < 0.0005 + gPx && (abs(ne.x) > .9 || abs(e.x - XC) > 0.001 + gPx);
      cutFace = onL || onR;
    }
    if (cutFace) { base = hatch(m == 8. || m == 9. || m == 22. ? vec3(0.55, 0.56, 0.60) : m == 23. ? vec3(0.78, 0.66, 0.58) : vec3(0.80, 0.77, 0.71), e, 260.); metal = 0.; rough = .95; }
    float sc = clamp(t * 0.012, 0.004, 0.12);
    float sh = shadow(p + n * max(0.0005, px * t * 2.), uSun, clamp(t * 1.5, 0.5, 12.), 10.);
    if (m >= 6.) sh = 0.35 + 0.65 * sh;       // softer shadows among the engine's parts
    float occ = ao(p, n, sc);
    float dif = max(dot(n, uSun), 0.) * sh;
    vec3 sunC = vec3(1.0, 0.95, 0.86) * 2.6, skyC = vec3(0.45, 0.6, 0.9) * .5;
    vec3 amb = skyC * (0.55 + 0.45 * n.y) + vec3(0.25, 0.22, 0.2) * (0.5 - 0.5 * n.y) * .5;
    vec3 fill = vec3(0.5, 0.55, 0.7) * max(dot(n, normalize(vec3(-uSun.x, 0.25, -uSun.z))), 0.) * .35;
    vec3 rfl = reflect(rd, n);
    vec3 env = sky(rfl);
    float fr = pow(1. - max(dot(n, -rd), 0.), 5.);
    vec3 hv = normalize(uSun - rd); float spec = pow(max(dot(n, hv), 0.), mix(220., 14., rough)) * mix(2.2, .25, rough) * sh;
    float lit = m >= 6. ? 0.45 + 0.55 * occ : occ;        // inside the engine little sunlight arrives: more even light there, so that nothing is lost in black
    if (m >= 6.) amb = amb * 1.5 + vec3(0.16, 0.17, 0.2);
    vec3 d = base * (1. - metal) * (dif * sunC + (amb + fill) * lit);
    vec3 s = mix(vec3(0.04), base, metal) * (env * (1. - rough * .75) * occ * (metal > 0. ? 1. : .5) + spec * sunC) + fr * env * (1. - rough) * .4 * occ;
    if (metal > 0.) s += base * metal * (dif * sunC * .35 + amb * lit * .5);
    col = d + s;
    col = mix(col, vec3(0.70, 0.80, 0.92), 1. - exp(-t * 0.0025));
  }
  // gas, marched in the engine's frame up to the surface
  if (uGas > .5) {
    vec3 eo = toE(ro), ed = vec3(-rd.x, rd.y, -rd.z); vec3 bmin = vec3(gEnd ? uGasCut : -0.19, 0.03, -0.20), bmax = vec3(0.19, 0.31, 0.20);
    vec3 inv = 1. / ed, t0 = (bmin - eo) * inv, t1 = (bmax - eo) * inv, tn = min(t0, t1), tf = max(t0, t1);
    float a = max(max(tn.x, tn.y), max(tn.z, 0.)), b = min(min(tf.x, tf.y), min(tf.z, hit ? t : 1e3));
    if (b > a) {
      float st = uGasStep, A = 0.; vec3 acc = vec3(0.);
      float tt = a + st * hash(vec3(gl_FragCoord.xy, 1.));
      for (int i = 0; i < 360; i++) { if (tt > b || A > .985) break; vec4 g = gasAt(eo + ed * tt); float w = 1. - exp(-g.a * st); acc += (1. - A) * w * g.rgb; A += (1. - A) * w; tt += st; }
      col = col * (1. - A) + acc;
    }
  }
  col = col / (1. + col * .35); col = pow(col, vec3(1. / 2.2));
  outc = pass == 0 ? col : mix(outc, col, fade);
  }
  o = vec4(outc, 1.);
}`;

export const FULL_VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

// Copies the world picture, which may be drawn smaller than the screen, onto the screen. Past the nearest view it is
// magnified about the spot looked at, and darkened: between molecules there is nothing to see.
export const BLIT_FS = `#version 300 es
precision highp float; uniform sampler2D uT; uniform vec2 uRes; uniform vec4 uZoom; out vec4 o;
void main(){ vec2 uv = gl_FragCoord.xy / uRes; o = vec4(mix(texture(uT, uZoom.xy + (uv - uZoom.xy) * uZoom.z).rgb, vec3(0.035, 0.05, 0.09), uZoom.w), 1.); }`;

// Balls (atoms, and the dots that stand for gas between the Flame and Molecules scales): one flat square per ball,
// on which the ball is drawn exactly. Positions are in nanometres from the spot looked at.
export const BALL_VS = `#version 300 es
layout(location = 0) in vec4 aBall; layout(location = 1) in vec4 aCol;
uniform vec2 uRes, uCenter; uniform float uTan, uDist;
out vec2 vq; out vec4 vc; out vec3 vctr; out float vr;
void main(){
  vec2 q = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) - 1.; vq = q * 1.08; vc = aCol; vr = aBall.w;
  vec3 c = vec3(aBall.xy, aBall.z + uDist); vctr = c;
  vec3 p = c + vec3(vq * aBall.w, 0.);
  gl_Position = vec4(p.x / (uTan * uRes.x / uRes.y) + uCenter.x * p.z, p.y / uTan + uCenter.y * p.z, 0., p.z);
}`;
export const BALL_FS = `#version 300 es
precision highp float; in vec2 vq; in vec4 vc; in vec3 vctr; in float vr; uniform float uDist, uFog; out vec4 o;
void main(){
  float r2 = dot(vq, vq); if (r2 > 1.) discard;
  if (vc.a < .99) { o = vec4(vc.rgb, vc.a * smoothstep(1., .35, sqrt(r2))); gl_FragDepth = 1.; return; }   // a dot standing for gas: flat and soft, behind every atom, and never hiding another dot
  vec3 n = vec3(vq, -sqrt(1. - r2));
  float z = vctr.z + n.z * vr;
  vec3 L = normalize(vec3(-0.45, 0.65, -0.6));
  vec3 col = vc.rgb * (max(dot(n, L), 0.) * 1.35 + 0.42 * (0.6 + 0.4 * n.y)) + vec3(1.) * pow(max(dot(n, normalize(L + vec3(0., 0., -1.))), 0.), 60.) * .45;
  col += vc.rgb * pow(1. - max(-n.z, 0.), 3.) * .25;
  float f = clamp((z - uDist) / uFog, -1., 1.); col *= 1. - .55 * max(f, 0.);
  o = vec4(pow(col / (1. + col * .2), vec3(1. / 2.2)), vc.a - 1.);      // an atom: its alpha is 1 more than how fully it is drawn
  gl_FragDepth = clamp(.5 + .45 * (z - uDist) / (uFog * 2.), 0.01, 0.99);
}`;
