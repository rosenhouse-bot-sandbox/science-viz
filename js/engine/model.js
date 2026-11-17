// Engine: the model. A gasoline four-stroke with four cylinders in a row, cruising at 60 mph.
// Everything the page draws or prints comes from here: where the piston is at each crank angle,
// how far each valve is open, the pressure and temperature of the gas, and how crowded its molecules are.
// Angles are in degrees of crankshaft for one cylinder's cycle: 0 = piston at the top as intake begins,
// 0-180 intake, 180-360 compression, 360 = top again (the burn), 360-540 power, 540-720 exhaust.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const wrap = (phi) => ((phi % 720) + 720) % 720;
const RAD = Math.PI / 180;

// ---- sizes, in metres (the 3D model in shaders.js uses the same numbers)
export const BORE = 0.042;          // cylinder radius: 84 mm across
export const CRANK = 0.045;         // crank throw: the stroke is twice this, 90 mm
export const ROD = 0.145;           // connecting rod, between its two pins
export const PIN_TO_TOP = 0.030;    // from the piston's pin up to its top face
export const DECK = 0.2207;         // height of the top of the block above the crankshaft's axis
export const ROOF = 0.015;          // the chamber's roof rises this far above the deck along its ridge
export const ROOF_SLOPE = 0.35;
export const PITCH = 0.096;         // from one cylinder to the next
export const X4 = -0.144;           // cylinder 4, the one the page zooms into, along the crankshaft
export const XC = -0.1615;          // the cross cut: through the middle of cylinder 4's nearer pair of valves
export const VALVE_AXIS = [0, 0.9455, 0.3256], VALVE_SEAT = [0, DECK + 0.0083, 0.019], VALVE_R = [0.0135, 0.0122];
export const PLUG_GAP = [X4, DECK + 0.0092, 0];
export const FIRING = [1, 3, 4, 2];
export const OFFSET = [0, 540, 180, 360];      // how far each cylinder's cycle runs behind cylinder 1's
export const phiOf = (phi4, cyl) => wrap(phi4 + 360 - OFFSET[cyl - 1]);   // a cylinder's own angle, from cylinder 4's

export const pinY = (phi) => { const s = CRANK * Math.sin(phi * RAD); return CRANK * Math.cos(phi * RAD) + Math.sqrt(ROD * ROD - s * s); };
export const pistonTop = (phi) => pinY(phi) + PIN_TO_TOP;
export const TOP_TDC = pistonTop(0), TOP_BDC = pistonTop(180);
export const AREA = Math.PI * BORE * BORE;
export const V_CLEAR = AREA * (DECK - TOP_TDC) + AREA * ROOF - ROOF_SLOPE * 4 * BORE ** 3 / 3;   // gap above the piston at the top, plus the roof
export const V_SWEPT = AREA * 2 * CRANK;
export const RATIO = (V_CLEAR + V_SWEPT) / V_CLEAR;
export const volume = (phi) => V_CLEAR + AREA * (TOP_TDC - pistonTop(phi));

// ---- valves: opened by the camshafts, which turn once for every two turns of the crankshaft
export const IVO = -10, IVC = 220, EVO = 490, EVC = 730, LIFT = 0.009;
const bump = (u) => (u > 0 && u < 1 ? LIFT * Math.sin(Math.PI * u) ** 2 : 0);
export const liftIn = (phi) => bump(wrap(phi - IVO) / (IVC - IVO));
export const liftEx = (phi) => bump(wrap(phi - EVO) / (EVC - EVO));
export const camAngle = (phi, exhaust) => (phi - (exhaust ? (EVO + EVC) / 2 : (IVO + IVC) / 2)) / 2;   // degrees the bump is past pointing at its valve
// The least gap between a valve's lower edge and the piston, at one angle.
export function valveGap(phi) {
  let g = 1;
  for (const [lift, r] of [[liftIn(phi), VALVE_R[0]], [liftEx(phi), VALVE_R[1]]]) g = Math.min(g, VALVE_SEAT[1] - lift * VALVE_AXIS[1] - r * VALVE_AXIS[2] - pistonTop(phi));
  return g;
}

// ---- the burn: lit by the spark before the top, spreading from the plug as a front
export const SPARK = 335, INJECT = [70, 95];      // the spray lasts about 1.7 thousandths of a second
export const flameR = (phi) => (phi < SPARK ? 0 : 0.066 * Math.pow((phi - SPARK) / 55, 1.5));   // how far the front has got from the plug, m
export const flameAt = (dist) => SPARK + 55 * Math.pow(dist / 0.066, 2 / 3);                     // the angle at which the front reaches a point
export const FLAME_OUT = flameAt(0.047);          // the front has reached the farthest corner
export const GAS_CUT = X4 - 0.0015;     // at the Flame scale the gas is cut just in front of the spark plug, so the flame is seen from its start
export const SPOT = [X4 + 0.002, DECK + 0.0055, 0.0125];    // the spot in the gas that the Molecules scale looks at
export const SPOT_DIST = Math.hypot(SPOT[0] - PLUG_GAP[0], SPOT[1] - PLUG_GAP[1], SPOT[2] - PLUG_GAP[2]);
export const SPOT_BURNS = flameAt(SPOT_DIST);

// ---- the road
export const MPH = 60, SPEED = MPH * 0.44704, RPM = 2400, DEG_PER_S = RPM * 6;

// ---- pressure and temperature through the cycle, in steps of half a degree
const K_B = 1.380649e-23, R_GAS = 287;
export const P_IN = 0.50e5;        // in the intake pipe at this light load, with the throttle mostly shut
export const P_OUT = 1.05e5;       // in the exhaust pipe
export const T_IN = 335;           // the fresh charge once mixed with what was left from the last burn, K
export const AIR_FUEL = 15.0, LEFT_OVER = 0.10, HEAT = 43.4e6, KEPT = 0.72;   // share of the fuel's heat that stays in the gas
const N = 1440, STEP = 0.5;
const P = new Float64Array(N + 1), TU = new Float64Array(N + 1), TB = new Float64Array(N + 1), XB = new Float64Array(N + 1), TM = new Float64Array(N + 1);
export const burnedShare = (phi) => (phi < SPARK + 5 ? 0 : 1 - Math.exp(-5 * Math.pow((phi - SPARK - 5) / 55, 3)));
(function build() {
  const mass = P_IN * volume(IVC) / (R_GAS * T_IN), fuel = mass * (1 - LEFT_OVER) / (AIR_FUEL + 1), Q = fuel * HEAT * KEPT;
  let p = P_IN, pEvo = 0, tbEvo = 0;
  for (let i = 0; i <= N; i++) {
    const phi = i * STEP;
    if (phi <= IVC) p = mix(P_OUT, P_IN, smooth(0, 35, phi));
    else if (phi <= EVO) {
      const g = mix(1.33, 1.24, burnedShare(phi)), v0 = volume(phi - STEP), v1 = volume(phi);
      p += (g - 1) / v1 * Q * (burnedShare(phi) - burnedShare(phi - STEP)) - g * p / v1 * (v1 - v0);
    } else { if (!pEvo) { pEvo = P[i - 1]; tbEvo = TB[i - 1]; } p = P_OUT + (pEvo - P_OUT) * Math.exp(-(phi - EVO) / 16); }
    P[i] = p; XB[i] = phi > EVO ? 1 : burnedShare(phi);
    TU[i] = phi <= IVC ? T_IN : T_IN * Math.pow(p / P_IN, 0.33 / 1.33);
    TM[i] = phi <= IVC ? T_IN : phi <= EVO ? p * volume(phi) / (mass * R_GAS) : 0;
  }
  // burned gas: about 2,300 K where the front has just passed the spot, then following the pressure and losing heat to the walls
  const iRef = Math.round(SPOT_BURNS / STEP), pRef = P[iRef];
  for (let i = 0; i <= N; i++) { const phi = i * STEP; TB[i] = phi < SPARK ? 0 : 2300 * Math.pow(P[i] / pRef, 0.24 / 1.24) * (1 - 0.2 * smooth(380, 540, phi)); }
  // once the exhaust valve opens, all the gas is burned gas: its average follows the burned gas from the value it had
  { const iE = Math.round(EVO / STEP); for (let i = iE + 1; i <= N; i++) TM[i] = TM[iE] * TB[i] / TB[iE]; }
})();
const at = (A, phi) => { const x = wrap(phi) / STEP, i = Math.floor(x), f = x - i; return A[i] + (A[Math.min(N, i + 1)] - A[i]) * f; };
export const pressure = (phi) => at(P, phi);                 // Pa
export const tempUnburned = (phi) => at(TU, phi);            // K
export const tempBurned = (phi) => at(TB, phi);              // K
export const tempMean = (phi) => at(TM, phi);                // K, of all the gas in the cylinder
export const ATM = 101325;
export let PEAK = { p: 0, phi: 0 };
for (let i = 0; i <= N; i++) if (P[i] > PEAK.p) PEAK = { p: P[i], phi: i * STEP };

// ---- the gas at the spot the Molecules scale looks at
// how far the burn has got there: 0 before the front arrives, 1 once it has passed. The real front passes one
// molecule-sized spot in a few millionths of a second; it is stretched over 4 degrees here so it can be followed.
export const BURN_SPAN = [-1.2, 2.8];
export const burnAt = (phi) => (wrap(phi) < SPARK ? 0 : clamp((wrap(phi) - SPOT_BURNS - BURN_SPAN[0]) / (BURN_SPAN[1] - BURN_SPAN[0]), 0, 1));
export function gasAt(phi) {
  phi = wrap(phi);
  const x = burnAt(phi), p = pressure(phi);
  // at the very start of intake the spot still holds the last of the old burned gas, which the fresh air replaces
  const T = phi < 44 ? mix(tempBurned(719.5), T_IN, smooth(0, 44, phi)) : x <= 0 ? tempUnburned(phi) : mix(tempUnburned(phi), tempBurned(phi), smooth(0, 1, x));
  return { p, T, burn: x, perNm3: p / (K_B * T) * 1e-27, fuel: phi > INJECT[0] + 10 && x < 1 };
}
// One fuel molecule's worth of a mixture with exactly enough air: C8H18 + 12.5 O2 (+ 47 N2) -> 8 CO2 + 9 H2O (+ 47 N2)
export const MIX = { fuel: 2, o2: 25, n2: 94, co2: 16, h2o: 18 };
export const GROUP_BEFORE = MIX.fuel + MIX.o2 + MIX.n2, GROUP_AFTER = MIX.co2 + MIX.h2o + MIX.n2;
// the edge, in nm, of the cube that this group of molecules fills
export function groupEdge(phi) { const g = gasAt(phi), n = mix(GROUP_BEFORE, GROUP_AFTER, g.burn); return Math.cbrt(n / g.perNm3); }

export const STROKES = ['Intake', 'Compression', 'Power', 'Exhaust'];
export const strokeOf = (phi) => Math.floor(wrap(phi) / 180);
