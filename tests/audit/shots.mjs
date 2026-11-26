// Frames for a realism audit (.claude/skills/realism-audit). Runs a shot list against one page. Each set steps one
// thing through its values while everything else is held, so that motion can be read from the frames in order.
//
//   node tests/audit/shots.mjs <plan.json> [--out dir] [--only set,set] [--size desktop,phone] [--against dir]
//
// Writes <out>/<size>/<set>/NN.jpg, <out>/<size>/<set>/states.json (the value, the address and the words on screen
// for every frame) and <out>/<size>/<set>.jpg (every frame of the set on one sheet). A frame that is already there
// is not taken again, so a run that was cut off can be started again. With --against, each sheet shows the frames of
// that earlier run above the new ones (before above, after below).
//
// The plan (tests/audit/<page>.json is one to start from for each page):
//   page    a name from tests/lib/pages.mjs
//   about   notes for whoever writes the sets: how slow the page is and what to avoid
//   query   optional, added to the address ("?res=0.5")
//   ready   an expression that is true once the page can be driven ("window.__shoulder?.frame")
//   settle  optional script run after every change, to end flights and draw ("__shoulder.settle(); __shoulder.redraw()")
//   idle    optional expression waited for after every change, where a change starts a flight ("!__rainbows.busy")
//   wait    optional milliseconds to wait before every picture; a set's own wait is added
//   canvas  optional selector. The picture is read from this canvas, which is many times faster than a screenshot
//           where WebGL is drawn in software. It leaves out the panel and the labels. A WebGL canvas reads as black
//           unless it was drawn in the same frame, so give a settle that draws.
//   text    optional selector for the words to save with each frame (default "body")
//   sizes   optional, any of desktop, phone, ipad (default desktop and phone)
//   sets    [{ name, note, values, hash, js, before, wait }]
//           values  the steps; "{v}" in hash and js is replaced by each in turn
//           hash    the address hash for the frame
//           js      a script run for the frame, after the hash
//           before  a script run once, before the set's first frame
//           wait    milliseconds to wait before the picture is taken
//           note    what the set is for and what should be seen; it heads the sheet
import fs from 'node:fs';
import path from 'node:path';
import { findChromium, serve, SOFT_GL } from '../lib/serve.mjs';
import { PAGES } from '../lib/pages.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const outArg = opt('--out'), only = opt('--only')?.split(','), sizeArg = opt('--size')?.split(','), against = opt('--against');
if (!args[0]) { console.error('usage: node tests/audit/shots.mjs <plan.json> [--out dir] [--only set,set] [--size desktop,phone] [--against dir]'); process.exit(2); }
const plan = JSON.parse(fs.readFileSync(args[0], 'utf8'));
if (!(plan.page in PAGES)) { console.error(`No page called ${plan.page}. Pages: ${Object.keys(PAGES).join(', ')}`); process.exit(2); }
const SIZES = { desktop: [1280, 800, 1], phone: [390, 844, 2], ipad: [820, 1180, 1] };
const out = path.resolve(outArg || path.join(import.meta.dirname, 'out', plan.page));
const sets = plan.sets.filter((s) => !only || only.includes(s.name));
const fill = (s, v) => s.replaceAll('{v}', String(v));
const num = (i) => String(i + 1).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const { base, close } = await serve({ at: PAGES[plan.page] });
const browser = await findChromium().launch({ args: SOFT_GL });
let failed = 0;

for (const size of sizeArg || plan.sizes || ['desktop', 'phone']) {
  const [width, height, deviceScaleFactor] = SIZES[size];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor, hasTouch: size !== 'desktop' });
  page.setDefaultTimeout(600000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + (plan.query || ''));
  // a script given as text is run by the browser's debugger, so the page's Content-Security-Policy does not stop it
  // (page.waitForFunction would run its text inside the page, which the policy forbids)
  const run = (script) => page.evaluate(`(() => { ${script} })()`);
  const until = async (expr) => { for (const t0 = Date.now(); !(await page.evaluate(`!!(${expr})`));) { if (Date.now() - t0 > 600000) throw new Error(`still waiting after 10 minutes for: ${expr}`); await page.waitForTimeout(100); } };
  if (plan.ready) await until(plan.ready);
  await page.waitForTimeout(600);                         // a page writes its own address a moment after it starts, which would undo a hash set too soon
  const frames = () => page.evaluate('new Promise((r) => setTimeout(() => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))');

  for (const set of sets) {
    const dir = path.join(out, size, set.name), statesFile = path.join(dir, 'states.json');
    fs.mkdirSync(dir, { recursive: true });
    const states = fs.existsSync(statesFile) ? JSON.parse(fs.readFileSync(statesFile, 'utf8')).states : [];
    const values = set.values || [''];
    let began = false;
    for (let i = 0; i < values.length; i++) {
      const v = values[i], file = path.join(dir, num(i) + '.jpg');
      if (fs.existsSync(file) && states[i]) continue;
      try {
        if (!began && set.before) await run(set.before);
        began = true;
        const hash = set.hash ? fill(set.hash, v) : null;
        if (hash !== null) { await page.evaluate((h) => { location.hash = h; }, hash); await frames(); }
        if (set.js) await run(fill(set.js, v));
        if (plan.settle) await run(plan.settle);
        if (plan.idle) { await frames(); await until(plan.idle); }
        if (plan.wait || set.wait) await page.waitForTimeout((plan.wait || 0) + (set.wait || 0));
        if (plan.canvas) {
          const url = await page.evaluate(`new Promise((r) => requestAnimationFrame(() => { ${plan.settle || ''}; r(document.querySelector(${JSON.stringify(plan.canvas)}).toDataURL('image/jpeg', 0.92)); }))`);
          fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        } else await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
        const text = await page.evaluate((sel) => (document.querySelector(sel)?.innerText || '').replace(/\n\s*\n+/g, '\n').trim(), plan.text || 'body');
        states[i] = { file: num(i) + '.jpg', value: v, hash: await page.evaluate(() => location.hash), text };
        fs.writeFileSync(statesFile, JSON.stringify({ page: plan.page, size, set: set.name, note: set.note || '', states }, null, 1));
        console.log(`${size} ${set.name} ${num(i)} ${v}`);
      } catch (e) { failed++; console.log(`${size} ${set.name} ${num(i)} ${v} FAILED: ${e.message.split('\n')[0]}`); }
    }
    await sheet(size, set, states.filter(Boolean));
  }
  if (errors.length) { failed++; console.log(`${size}: console errors\n  ` + [...new Set(errors)].join('\n  ')); }
  await page.close();
}
await browser.close(); close();
console.log(`frames and sheets are in ${out}`);
process.exit(failed ? 1 : 0);

// every frame of a set on one sheet, in order, each under its value
async function sheet(size, set, states) {
  if (!states.length) return;
  const data = (dir, f) => { const p = path.join(dir, size, set.name, f); return fs.existsSync(p) ? 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64') : null; };
  const wide = SIZES[size][0] > 600, cols = Math.min(states.length, wide ? 4 : 6), w = wide ? 480 : 260;
  const cell = (s) => {
    const was = against && data(against, s.file);
    return `<figure><figcaption>${esc(s.file.slice(0, 2))} · ${esc(s.value)}</figcaption>${against ? (was ? `<img src="${was}">` : '<p>no earlier frame</p>') : ''}<img src="${data(out, s.file)}"></figure>`;
  };
  const html = `<style>body{margin:12px;background:#111;color:#eee;font:13px system-ui,sans-serif}h1{font-size:15px;margin:0 0 4px}p{margin:0 0 10px;max-width:${cols * w}px}
    div{display:grid;grid-template-columns:repeat(${cols},${w}px);gap:8px}figure{margin:0}img{width:100%;display:block;margin-top:2px}figcaption{color:#fc6}</style>
    <h1>${esc(plan.page)} · ${esc(size)} · ${esc(set.name)}${against ? ' · before above, after below' : ''}</h1><p>${esc(set.note || '')}</p><div>${states.map(cell).join('')}</div>`;
  const p = await browser.newPage({ viewport: { width: cols * (w + 8) + 24, height: 600 } });
  await p.setContent(html); await p.waitForFunction(() => [...document.images].every((i) => i.complete));
  await p.screenshot({ path: path.join(out, size, set.name + '.jpg'), type: 'jpeg', quality: 88, fullPage: true });
  await p.close();
}
