// Checks how the gas moves on the Engine page (js/engine/flow.js) without a browser: works out the dots' paths as
// the page does and fails if gas is made or lost, sits unevenly, is inside metal, or leaves any way but down the
// exhaust pipe.
//
//   node tests/engine/flow.mjs
import * as M from '../../js/engine/model.js';
import * as F from '../../js/engine/flow.js';

let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL ' + what); } };
const run = () => { const g = F.build(); let r; while (!(r = g.next()).done); return r.value; };
const t0 = Date.now(), P = run(), at = [0, 0, 0];
console.log(`${P.n} dots come in each cycle; their paths took ${((Date.now() - t0) / 1000).toFixed(1)} s to work out and hold ${P.time.length} points`);

// every dot comes in along the intake pipe and leaves along the exhaust pipe
let stay = 0;
for (let i = 0; i < P.n; i++) {
  const a = P.start[i], b = P.start[i + 1] - 1;
  ok(b > a, `dot ${i} has no path`); if (b <= a) continue;
  ok(P.pos[a * 3 + 2] * 1e-5 > F.Z_END, `dot ${i} does not start in the intake pipe`);
  if (P.pos[b * 3 + 2] * 1e-5 > -F.Z_END) stay++;
  for (let k = a; k < b; k++) if (!(P.time[k + 1] > P.time[k])) { ok(false, `dot ${i}'s path goes back in time`); break; }
}
ok(stay < P.n * 0.02, `${stay} of ${P.n} dots never leave by the exhaust pipe (a few may be let go after four cycles)`);

// through the cycle: as many dots in the cylinder as the model has gas there, evenly spread, none in metal
const charge = F.gasIn(M.IVC) / P.perDot;
let worst = 0, worstAt = 0, inMetal = 0, seen = 0, uneven = 0;
for (let phi = 0; phi < 720; phi += 5) {
  const top = M.pistonTop(phi), h = M.DECK - top, bins = [0, 0, 0, 0]; let n = 0;
  for (let i = 0; i < P.n; i++) for (let k = 0; k < P.cycles; k++) {
    if (!F.at(P, i, phi + 720 * k, at, k)) continue; seen++;
    if (Math.abs(at[2]) < F.Z_END && F.spaceDist(at[0], at[1], at[2], top) > 0.0008) inMetal++;      // past Z_END the pipes are not drawn, nor the dots
    if (!F.inChamber(at[0], at[1], at[2])) continue; n++;
    if (at[1] < M.DECK) bins[Math.min(3, Math.floor((at[1] - top) / h * 4))]++;
  }
  const want = F.gasIn(phi) / P.perDot, err = Math.abs(n - want) / charge;
  if (err > worst) { worst = err; worstAt = phi; }
  if (h > 0.03) { const each = h / 4 * M.AREA * F.density(phi) / P.perDot; for (const b of bins) uneven = Math.max(uneven, Math.abs(b - each) / each); }
}
ok(worst < 0.03, `the dots in the cylinder differ from the model's gas by ${(worst * 100).toFixed(1)}% of a full charge at ${worstAt}° (3% allowed)`);
ok(inMetal < seen * 0.002, `${inMetal} of ${seen} dot positions are more than 0.8 mm inside metal`);
ok(uneven < 0.25, `a quarter of the cylinder's height holds ${(uneven * 100).toFixed(0)}% more or less gas than its share (25% allowed)`);
console.log(`dots in the cylinder against the model: worst ${(worst * 100).toFixed(1)}% of a full charge, at ${worstAt}°; most uneven quarter ${(uneven * 100).toFixed(0)}%`);

// dots pass the valves only while they are open
for (const [phi, name] of [[300, 'compression'], [420, 'power']]) {
  let moved = 0;
  for (let i = 0; i < P.n; i++) for (let k = 0; k < P.cycles; k++) {
    if (!F.at(P, i, phi + 720 * k, at, k)) continue; const inA = F.inChamber(at[0], at[1], at[2]);
    if (F.at(P, i, phi + 40 + 720 * k, at, k) && inA !== F.inChamber(at[0], at[1], at[2])) moved++;
  }
  ok(moved === 0, `${moved} dots pass a shut valve during ${name}`);
}

// the same paths every time
{ const Q = run(); let same = Q.time.length === P.time.length; for (let i = 0; same && i < P.pos.length; i += 97) same = P.pos[i] === Q.pos[i]; ok(same, 'two runs give different paths'); }

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
