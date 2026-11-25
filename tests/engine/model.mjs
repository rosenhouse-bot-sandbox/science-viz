// Checks the Engine page's model without a browser: the four strokes and what each valve does in them, that no
// valve reaches the piston, the camshafts' half speed, the burning order, the pressure through the cycle, and
// the chemistry (every atom of the fuel and the oxygen is in a product). Also checks that the sizes written into
// the shaders are the model's. Fails if a number leaves its range or an event happens out of order.
//
//   node tests/engine/model.mjs
import * as M from '../../js/engine/model.js';
import { ATOM, SHAPES, count, makeGroup, place, MAX_ATOMS } from '../../js/engine/mol.js';
import { WORLD_FS } from '../../js/engine/shaders.js';
import { readFileSync } from 'node:fs';
const MAIN_JS = readFileSync(new URL('../../js/engine/main.js', import.meta.url), 'utf8');
import { staleStamp } from '../stamp.mjs';

let fails = 0;
{ const e = staleStamp('engine'); if (e) { fails++; console.log('FAIL ' + e); } }
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL ' + what); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- geometry
ok(near(M.BORE * 2, 0.084, 1e-9) && near(M.CRANK * 2, 0.090, 1e-9), 'bore 84 mm, stroke 90 mm');
ok(near(M.V_SWEPT * 4 * 1e3, 2.0, 0.01), `four cylinders sweep 2.0 liters (${(M.V_SWEPT * 4e3).toFixed(3)})`);
ok(M.RATIO > 10 && M.RATIO < 11, `compression ratio ${M.RATIO.toFixed(2)} is between 10 and 11`);
ok(near(M.pistonTop(0), M.pistonTop(360), 1e-12) && near(M.TOP_TDC - M.TOP_BDC, 2 * M.CRANK, 1e-12), 'the piston is at the top at 0° and 360°, and travels one stroke');
ok(M.TOP_TDC < M.DECK && M.DECK - M.TOP_TDC < 0.003, 'at the top the piston stops just below the top of the block');
for (let a = 0; a < 720; a += 1) {
  const up = M.pistonTop(a + 0.5) > M.pistonTop(a), s = M.strokeOf(a);
  ok(up === (s === 1 || s === 3), `the piston goes ${s === 1 || s === 3 ? 'up' : 'down'} at ${a}° (${M.STROKES[s]})`);
  ok(near(M.volume(a), M.V_CLEAR + M.AREA * (M.TOP_TDC - M.pistonTop(a)), 1e-12) && M.volume(a) >= M.V_CLEAR - 1e-12, `volume at ${a}°`);
}

// ---- valves: which is open in which stroke, and never the piston
for (let a = 0; a < 720; a += 0.5) {
  const li = M.liftIn(a), le = M.liftEx(a), s = M.strokeOf(a);
  ok(li >= 0 && li <= M.LIFT + 1e-12 && le >= 0 && le <= M.LIFT + 1e-12, `valve lift within 0 to ${M.LIFT * 1e3} mm at ${a}°`);
  if (a > 230 && a < 480) ok(li === 0 && le === 0, `both valves are shut at ${a}° (${M.STROKES[s]})`);
  if (a > 20 && a < 170) ok(li > 0.0002 && le === 0, `only the intake valve is open at ${a}°`);
  if (a > 550 && a < 700) ok(le > 0.0002 && li === 0, `only the exhaust valve is open at ${a}°`);
  ok(M.valveGap(a) > 0.002, `a valve comes within ${(M.valveGap(a) * 1e3).toFixed(1)} mm of the piston at ${a}°`);
}
ok(M.liftIn(M.IVO + 1) > 0 && M.liftIn(M.IVO - 1) === 0 && M.liftIn(M.IVC - 1) > 0 && M.liftIn(M.IVC + 1) === 0, 'the intake valve opens and shuts at its stated angles');
ok(M.liftEx(M.EVO + 1) > 0 && M.liftEx(M.EVO - 1) === 0 && M.liftEx(M.EVC - 1) > 0 && M.liftEx(M.EVC + 1) === 0, 'the exhaust valve opens and shuts at its stated angles');
ok(M.IVO < 0 && M.IVO > -30 && M.IVC > 180 && M.IVC < 250 && M.EVO > 470 && M.EVO < 540 && M.EVC > 720 && M.EVC < 750, 'valve timing is in the usual range');
// camshafts: half the crankshaft's speed, and each bump points at its valve when the valve is widest open
for (const ex of [false, true]) {
  ok(near(M.camAngle(100 + 720, ex) - M.camAngle(100, ex), 360, 1e-9), 'a camshaft turns once in two turns of the crankshaft');
  let best = 0, at = 0; for (let a = 0; a < 720; a += 0.5) { const l = ex ? M.liftEx(a) : M.liftIn(a); if (l > best) { best = l; at = a; } }
  ok(Math.abs(((M.camAngle(at, ex) % 360) + 540) % 360 - 180) < 0.6, `the ${ex ? 'exhaust' : 'intake'} bump points at its valve at full lift`);
}

// ---- four cylinders: burning order 1, 3, 4, 2, half a turn apart
{
  const fires = [1, 2, 3, 4].map((c) => { for (let a = 0; a < 720; a += 0.5) if (near(M.phiOf(a, c), M.SPARK, 0.01)) return [a, c]; return [-1, c]; }).sort((p, q) => p[0] - q[0]);
  const order = fires.map((f) => f[1]), i1 = order.indexOf(1), turned = [...order.slice(i1), ...order.slice(0, i1)];
  ok(turned.join() === M.FIRING.join() && M.FIRING.join() === '1,3,4,2', `burning order is ${turned.join(', ')}`);
  for (let i = 1; i < 4; i++) ok(near(fires[i][0] - fires[i - 1][0], 180, 0.01), 'sparks are 180° apart');
  ok(M.phiOf(123, 4) === 123, 'the page follows cylinder 4');
  for (let a = 0; a < 720; a += 7) ok([1, 2, 3, 4].filter((c) => M.strokeOf(M.phiOf(a, c)) === 2).length === 1, `one cylinder is on its power stroke at ${a}°`);
  for (let a = 0; a < 720; a += 7) ok(near(M.pistonTop(M.phiOf(a, 1)), M.pistonTop(M.phiOf(a, 4)), 1e-9) && near(M.pistonTop(M.phiOf(a, 2)), M.pistonTop(M.phiOf(a, 3)), 1e-9), 'pistons 1 and 4 move together, and 2 and 3');
}

// ---- spark, burn, pressure
ok(M.SPARK > 320 && M.SPARK < 350, 'the spark comes 10 to 40° before the top');
ok(M.FLAME_OUT > 365 && M.FLAME_OUT < 395, `the front reaches the walls at ${M.FLAME_OUT.toFixed(0)}°`);
{ const ms = (M.FLAME_OUT - M.SPARK) / M.DEG_PER_S * 1e3, v = 0.047 / (ms / 1e3); ok(ms > 2 && ms < 4.5 && v > 8 && v < 25, `the burn takes ${ms.toFixed(1)} ms; the front moves ${v.toFixed(0)} m/s`); }
ok(M.SPOT_BURNS > M.SPARK && M.SPOT_BURNS < M.FLAME_OUT, 'the spot the Molecules scale looks at burns while the front is crossing');
ok(near(M.DEG_PER_S, M.RPM * 6, 1e-9) && near(1e6 / M.DEG_PER_S, 69.4, 0.1), '1° of crank takes 69 millionths of a second at 2,400 turns a minute');
ok(near(M.burnedShare(M.SPARK), 0, 1e-9) && M.burnedShare(400) > 0.97, 'the burn starts at the spark and is over by 40° after the top');
ok(M.PEAK.p / M.ATM > 18 && M.PEAK.p / M.ATM < 30 && M.PEAK.phi > 368 && M.PEAK.phi < 382, `peak pressure ${(M.PEAK.p / M.ATM).toFixed(1)} atm at ${M.PEAK.phi}°`);
{ const pc = M.pressure(M.SPARK) / M.ATM; ok(pc > 4 && pc < 9, `pressure at the spark is ${pc.toFixed(1)} atm`); }
for (let a = 0; a < 720; a += 0.5) {
  const p = M.pressure(a), g = M.gasAt(a);
  ok(p > 0.3e5 && p <= M.PEAK.p + 1, `pressure is in range at ${a}°`);
  ok(Math.abs(M.pressure(a + 0.5) - p) < 0.9e5, `pressure does not jump at ${a}°`);
  ok(g.T > 300 && g.T < 2700, `temperature at the spot is ${g.T.toFixed(0)} K at ${a}°`);
  ok(g.perNm3 > 0.0005 && g.perNm3 < 0.5, `molecules per cubic nanometre at ${a}°`);
  if (a > M.IVC && a < M.SPARK) ok(M.pressure(a + 0.5) > p && M.tempUnburned(a + 0.5) >= M.tempUnburned(a), `squeezing raises pressure and temperature at ${a}°`);
}
ok(M.tempUnburned(M.SPARK) > 550 && M.tempUnburned(M.SPARK) < 800, 'the mixture is 550 to 800 K at the spark');
ok(M.tempBurned(M.SPOT_BURNS) > 2200 && M.tempBurned(M.SPOT_BURNS) < 2600, 'freshly burned gas is 2,200 to 2,600 K');
ok(near(M.pressure(100) / M.ATM, M.P_IN / M.ATM, 0.01) && M.P_IN < M.ATM, 'during intake the cylinder is below outside pressure (the throttle is mostly shut)');
ok(M.burnAt(M.SPOT_BURNS + M.BURN_SPAN[0] - 1e-6) === 0 && M.burnAt(M.SPOT_BURNS + M.BURN_SPAN[1] + 1e-6) === 1 && near(M.burnAt(M.SPOT_BURNS + (M.BURN_SPAN[0] + M.BURN_SPAN[1]) / 2), 0.5, 1e-6), 'the burn at the spot runs over its stated span');

// ---- chemistry: 2 C8H18 + 25 O2 -> 16 CO2 + 18 H2O, in air
{
  const C = { fuel: { C: 8, H: 18 }, o2: { O: 2 }, n2: { N: 2 }, co2: { C: 1, O: 2 }, h2o: { H: 2, O: 1 } }, mass = { C: 12.011, H: 1.008, O: 15.999, N: 14.007 };
  const tally = (kinds) => { const t = { C: 0, H: 0, O: 0, N: 0 }; for (const k of kinds) for (const [el, n] of Object.entries(C[k])) t[el] += n * M.MIX[k]; return t; };
  const before = tally(['fuel', 'o2', 'n2']), after = tally(['co2', 'h2o', 'n2']);
  ok(JSON.stringify(before) === JSON.stringify(after), `atoms balance: ${JSON.stringify(before)} against ${JSON.stringify(after)}`);
  for (const [shape, formula] of Object.entries({ fuel: C.fuel, o2: C.o2, n2: C.n2, co2: C.co2, h2o: C.h2o })) for (const el of 'CHON') ok(count(shape, el) === (formula[el] || 0), `the drawn ${shape} molecule has ${formula[el] || 0} ${el}`);
  ok(near(M.MIX.n2 / M.MIX.o2, 3.76, 0.02), 'air has 3.76 nitrogen molecules for each oxygen molecule');
  const w = (f) => Object.entries(f).reduce((s, [el, n]) => s + mass[el] * n, 0);
  const afr = (M.MIX.o2 * w(C.o2) + M.MIX.n2 * w(C.n2) * 1.0) / (M.MIX.fuel * w(C.fuel));
  ok(afr > 14.3 && afr < 15.3 && near(M.AIR_FUEL, afr, 0.5), `air to fuel by mass is ${afr.toFixed(1)} to 1 (argon left out)`);
  ok(M.GROUP_BEFORE === 121 && M.GROUP_AFTER === 128, 'the group is 121 molecules before the burn and 128 after');
  // the drawn group: each atom is tracked through the burn, so the count never changes
  const g = makeGroup(), out = new Float32Array(MAX_ATOMS * 8);
  const els = (n) => { const t = {}; for (let i = 0; i < n; i++) { const key = [out[i * 8 + 3].toFixed(4), out[i * 8 + 4].toFixed(3), out[i * 8 + 5].toFixed(3), out[i * 8 + 6].toFixed(3)].join(); t[key] = (t[key] || 0) + 1; } return t; };
  const total = before.C + before.H + before.O + before.N;
  let first = null;
  for (const a of [200, 330, M.SPOT_BURNS - 2, M.SPOT_BURNS, M.SPOT_BURNS + 1, M.SPOT_BURNS + 2, M.SPOT_BURNS + 4, 450]) {
    const n = place(g, a, 3.7, out, { x0: -1, x1: 1, y0: -1, y1: 1, dist: 1e6 }), t = els(n);
    ok(n === total * 27, `${n} atoms are drawn at ${a.toFixed(1)}° (expected ${total} in each of 27 copies of the group)`);
    if (!first) first = t; else ok(JSON.stringify(Object.values(t).sort()) === JSON.stringify(Object.values(first).sort()), `the same atoms of each element are drawn at ${a.toFixed(1)}°`);
    for (let i = 0; i < n * 8; i++) ok(Number.isFinite(out[i]), 'atom positions are numbers');
  }
  ok(Object.keys(ATOM).sort().join('') === 'CHNO' && Object.keys(SHAPES).length === 5, 'four elements, five kinds of molecule');
  // room: the cube the group fills follows pressure and temperature
  const e0 = M.groupEdge(M.SPARK), e1 = M.groupEdge(M.SPOT_BURNS + 3), e2 = M.groupEdge(100);
  ok(e0 > 7 && e0 < 14 && e1 > e0 && e2 > e0 * 1.6, `the group's cube: ${e2.toFixed(0)} nm at intake, ${e0.toFixed(0)} nm at the spark, ${e1.toFixed(0)} nm just burned`);
}

// ---- the shaders draw the same engine
{
  const num = (name) => { const m = WORLD_FS.match(new RegExp(`\\b${name} = (-?[0-9.]+)`)); return m ? +m[1] : NaN; };
  for (const [name, v] of [['DECK', M.DECK], ['CR', M.CRANK], ['ROD', M.ROD], ['BORE', M.BORE], ['XC', M.XC], ['X4', M.X4]]) ok(near(num(name), v, 1e-9), `the shader's ${name} (${num(name)}) is the model's (${v})`);
  ok(WORLD_FS.includes('float OFF[4] = float[4](0., 540., 180., 360.)') && M.OFFSET.join() === '0,540,180,360', 'the shader has the model\'s burning order');
  ok(WORLD_FS.includes(`mod(phi + ${-M.IVO}., 720.) / ${M.IVC - M.IVO}.`) && WORLD_FS.includes(`mod(phi - ${M.EVO}., 720.) / ${M.EVC - M.EVO}.`), 'the shader has the model\'s valve timing');
  ok(WORLD_FS.includes(`0.066 * pow(max(phi - ${M.SPARK}., 0.) / 55., 1.5)`), 'the shader has the model\'s flame front');
  ok(WORLD_FS.includes(`phi > ${M.SPARK}. && phi < ${M.SPARK_END}.`) && M.SPARK_END - M.SPARK >= 15, `the shader's spark lasts the model's ${M.SPARK_MS} ms (${M.SPARK_END - M.SPARK}° of crankshaft)`);
  ok(WORLD_FS.includes(`length(q.xy) - ${(M.TIRE_R - 0.012).toFixed(2)}`) && WORLD_FS.includes(`- 0.012; }`), 'the shader\'s tire is the model\'s size');
  ok(WORLD_FS.includes('vec3(0., 0.9455, 0.3256)') && M.VALVE_AXIS.join() === '0,0.9455,0.3256', 'the shader has the model\'s valve axis');
  ok(!WORLD_FS.includes('phi > 70. && phi < 125.'), 'the shader draws no spray of its own: the fuel is dots that leave the injector (flow.js)');
  ok(WORLD_FS.includes('(8. * clamp(sq, 1., 10.) + 30. * step(') && /\(8 \* squeeze \+ \(gasCut > M\.XC \+ 0\.001 \? 30 : 0\)\)/.test(MAIN_JS), 'the burned gas glows as thinly in the shader as main.js dims the dots behind it');
}

console.log(fails ? `${fails} failed` : 'engine model: all checks passed');
process.exit(fails ? 1 : 0);
