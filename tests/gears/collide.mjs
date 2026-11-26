// Plays every machining step of every part on the workshop page and checks that nothing runs into anything: the tool,
// tool post, slides, tailstock and drill chuck against the turning chuck, jaws, collet, mandrel and part on the lathe;
// the turning cutter, its holder and the spindle against the vise, parallels, indexer, dividing head, collet block,
// table and part on the mill. The cutting edge itself is let into the part. Each pass is checked at five points and
// every 2 s, and the moves between passes at the pull-back, across and the way in.
//
//   node tests/gears/collide.mjs              # needs Node 22 and Playwright, installed outside the repository
//   node tests/gears/collide.mjs octa screw   # only these shapes and parts (about a minute a part)
import { staleStamp } from '../stamp.mjs';
import { findChromium, serve, SOFT_GL } from '../lib/serve.mjs';

{ const e = staleStamp('gears'); if (e) { console.error(e); process.exit(1); } }

const { server, base } = await serve({ at: 'gears/' });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await findChromium().launch({ args: SOFT_GL });
const SHAPES = ['cube4', 'octa'], PARTS = ['gear', 'core', 'spacer', 'screw'], args = process.argv.slice(2);
const pick = (all) => (all.some((x) => args.includes(x)) ? all.filter((x) => args.includes(x)) : all);
// plain lighting, and paused: the lit look takes seconds a frame without a graphics card, and only the geometry is checked
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
page.on('pageerror', (e) => fail(e.message));
await page.goto(base + 'make.html?res=0.25&look=0#v=make');
await page.waitForFunction(() => window.__make?.cur && document.querySelector('#parts button'), null, { timeout: 120000 });
for (const shape of pick(SHAPES)) for (const part of pick(PARTS)) {
  await page.click(`#shapes button[data-id="${shape}"]`); await page.click(`#parts button[data-id="${part}"]`);
  const res = await page.evaluate(() => {
    const M = window.__make, c = M.cur, segs = c.tl.segs, ts = [];
    for (const g of segs) {
      for (const f of [0, 0.25, 0.5, 0.75, 1]) ts.push(g.t0 + (g.t1 - g.t0) * f);
      for (let t = g.t0 + 2; t < g.t1; t += 2) ts.push(t);
    }
    for (let i = 0; i + 1 < segs.length; i++) { const a = segs[i].t1, b = segs[i + 1].t0; if (b > a) for (const f of [0.15, 0.5, 0.85]) ts.push(a + (b - a) * f); }
    const out = new Map();
    for (const t of ts) {
      const r = c.replay.at(t), s = c.plan[r.op].steps[r.step], key = `${r.op + 1}/${s.title}`;
      for (const h of M.collide(t)) { const k = `${key}: ${h.a} into ${h.b}`; const o = out.get(k); if (!o || h.depth > o.depth) out.set(k, { ...h, t: +t.toFixed(1) }); }
    }
    return [...out.entries()];
  });
  for (const [k, h] of res) fail(`${shape} ${part}, step ${k}, ${h.depth} mm deep at [${h.at}] (t ${h.t} s)`);
  console.log(`${shape} ${part}: ${res.length ? res.length + ' collisions' : 'clear'}`);
}
await browser.close(); server.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
