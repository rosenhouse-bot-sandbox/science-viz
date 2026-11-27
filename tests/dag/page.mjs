// Opens the Graph layout page at a desktop and a phone size, chooses every graph with both
// methods, presses every step and every option, moves every slider to both ends, plays the steps,
// and steps through nodes with the keyboard. Fails on a console error, on a panel or page wider
// than the screen, or if the drawing is blank. At the desktop size it also loads the real ELK and
// the real TALA from their CDN and lays out one small graph with each.
// It also records every frame of a few glides (between steps, after a change of settings, and to an
// engine's result) and fails if a line is drawn off one of its two nodes, or if the words in the
// panel change while the nodes are still moving.
//
//   node tests/dag/page.mjs         # needs Node 22 and Playwright, installed outside the repository
import { findChromium, serve } from '../lib/serve.mjs';

const { server, base } = await serve({ at: 'dag/' });

let fails = 0;
const fail = (what) => { fails++; console.log('FAIL ' + what); };
const browser = await findChromium().launch();
for (const [name, width, height, motion] of [['desktop', 1280, 800, 'no-preference'], ['phone', 390, 844, 'no-preference'], ['phone, reduced motion', 390, 844, 'reduce']]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion, hasTouch: width < 600 });
  page.on('console', (m) => { if (m.type() === 'error') fail(`${name}: console: ${m.text()}`); });
  page.on('pageerror', (e) => fail(`${name}: ${e.message}`));
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById('graphFacts').textContent.includes('55 nodes'));
  const inked = () => page.evaluate(() => { const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 40) n++; return n; });
  const fits = async (when) => { const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('panel').scrollWidth, document.getElementById('panel').clientWidth]); if (w[0] > width || w[1] > w[2]) fail(`${name}: wider than the screen ${when}`); };
  const graphs = await page.$$eval('#graph option', (os) => os.map((o) => o.value));
  for (const g of graphs) for (const m of ['layered', 'search']) {
    await page.selectOption('#graph', g);
    await page.click(`#method [data-v=${m}]`);
    for (const b of await page.$$('#stages button')) { await b.click(); await page.waitForTimeout(30); }
    for (const b of await page.$$('#controls .ctl:not([hidden]) .seg button')) { await b.click(); await page.waitForTimeout(20); }
    for (const id of await page.$$eval('#controls .ctl:not([hidden]) input', (is) => is.map((i) => i.id))) for (const end of ['min', 'max']) {
      await page.$eval('#' + id, (i, e) => { i.value = i[e]; i.dispatchEvent(new Event('input', { bubbles: true })); }, end);
      await page.waitForTimeout(40);
    }
    await fits(`with ${g}, ${m}`);
    if (await inked() < 20) fail(`${name}: nothing drawn with ${g}, ${m}`);
  }
  // From here on the page hands over what it draws in every frame.
  await page.selectOption('#graph', 'services');
  await page.click('#method [data-v=layered]');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__graph = { frames: [], frame(f) { this.frames.push(f); } }; });
  await page.click('#stages button:nth-child(1)'); await page.waitForTimeout(1500);
  await page.click('#stages button:nth-child(3)'); await page.waitForTimeout(1500);   // a glide between steps
  await page.click('#ctl-dir button[aria-pressed=false]'); await page.waitForTimeout(1500);   // a glide after a change of settings
  await page.click('#method [data-v=search]'); await page.waitForTimeout(1500);
  const glides = async (when) => {
    const r = await page.evaluate(() => {
      const F = window.__graph.frames, out = { frames: F.length, moving: 0, off: 0, early: 0, example: '' };
      F.forEach((f, i) => {
        if (f.moving) out.moving++;
        const on = (x, y, c) => Math.abs(x - c[0]) <= f.w / 2 + 0.7 && Math.abs(y - c[1]) <= f.h / 2 + 0.7;
        for (const [s, t, x0, y0, x1, y1, alpha] of f.ends) if (alpha > 0.02 && !(on(x0, y0, f.pos[s]) && on(x1, y1, f.pos[t]))) { out.off++; out.example = out.example || `frame ${i}, edge ${s} to ${t}`; }
        const clock = /^Working/.test(f.title) && /^Working/.test(F[i - 1].title);   // the seconds an engine has been working are not about the picture
        if (i && f.moving && !clock && (f.title !== F[i - 1].title || f.text !== F[i - 1].text)) { out.early++; out.example = out.example || `frame ${i}: "${F[i - 1].title}" became "${f.title}"`; }
      });
      window.__graph.frames = [];
      return out;
    });
    if (!r.frames) fail(`${name}: the page handed over no frames ${when}`);
    if (motion !== 'reduce' && r.moving < 3) fail(`${name}: no glide was seen ${when} (${r.moving} moving frames of ${r.frames})`);
    if (r.off) fail(`${name}: ${r.off} lines were drawn off their nodes ${when} (${r.example})`);
    if (r.early) fail(`${name}: the words changed ${r.early} times while the nodes were moving ${when} (${r.example})`);
  };
  await glides('between steps and after a change of settings');
  await page.click('#play');
  await page.waitForFunction(() => document.getElementById('play').textContent !== 'Pause', null, { timeout: 30000 }).catch(() => fail(`${name}: the steps never finished playing`));
  await glides('while the steps play');
  await page.focus('#view');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  if (!(await page.textContent('#pick')).includes(' out ')) fail(`${name}: the arrow keys picked no node`);
  await page.keyboard.press('Escape');
  if ((await page.textContent('#pick')) !== '') fail(`${name}: Escape did not let go of the node`);
  if (name === 'desktop') {
    // The real engines, on a small graph. They come from a CDN, so this part needs the network.
    await page.selectOption('#graph', 'services');
    for (const m of ['layered', 'search']) {
      await page.evaluate(() => { document.getElementById('status').textContent = ''; });
      await page.click(`#method [data-v=${m}]`);
      await page.click('#ctl-eng [data-v=real]');
      // the words wait for the glide to the engine's picture to end, so wait for the engine and then for the words
      await page.waitForFunction(() => document.getElementById('status').textContent === 'The layout is ready.' && document.getElementById('capTitle').textContent === 'Result' && /^Seconds\s*[0-9]/.test(document.querySelector('#meters .meter:nth-child(3)').textContent) && document.querySelector('#ctl-eng [data-v=real]').getAttribute('aria-pressed') === 'true', null, { timeout: 120000 }).catch(() => fail(`${name}: the real engine for ${m} gave no layout`));
      await page.waitForTimeout(700);
      await glides(`on the way to the real engine's result for ${m}`);
      if (await inked() < 20) fail(`${name}: nothing drawn by the real engine for ${m}`);
      await fits(`with the real engine for ${m}`);
    }
  }
  await page.close();
}
await browser.close(); server.close();
console.log(fails ? `${fails} failures` : 'Graph layout page: all controls pressed, no failures');
process.exit(fails ? 1 : 0);
