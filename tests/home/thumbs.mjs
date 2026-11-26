// Takes the landing page's thumbnails from the pages themselves: one picture per experience,
// cropped to the part of the screen beside the panel, saved as img/thumbs/<page>.webp at
// 336 × 210 (the tile's 168 × 105 at twice the sharpness). Rerun after a page changes how it looks.
//
//   python3 -m http.server 8000 &   (from the repository root)
//   node tests/home/thumbs.mjs [page ...]
//
// Pages draw WebGL in software here, so each one is given time to settle before the shot.
import { findChromium } from '../lib/serve.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const chromium = findChromium();

const BASE = process.env.BASE || 'http://localhost:8000/';
const OUT = fileURLToPath(new URL('../../img/thumbs/', import.meta.url));
// Address to open, and the part of a 1280 × 800 screen to keep (x, y, width; height is width × 10/16).
const SHOTS = {
  engine: { url: 'engine/', clip: [390, 110, 870], wait: 15000 },
  dag: { url: 'dag/', clip: [420, 140, 850], wait: 6000 },
  maple: { url: 'maple/#z=0.00&s=0.660', clip: [470, 100, 790], wait: 15000 },
  optics: { url: 'optics/', clip: [640, 235, 610], wait: 6000 },
  rainbows: { url: 'rainbows/', clip: [420, 130, 860], wait: 10000 },
  vesicle: { url: 'vesicle/#mode=vivo&p=0', clip: [400, 120, 880], wait: 30000 },
  shoulder: { url: 'shoulder/#z=1.00&c=healthy&lift=30&turn=0', clip: [440, 90, 840], wait: 15000 },
  saccade: { url: 'saccade/#z=0.00&c=poor', clip: [460, 250, 820], wait: 8000 },
  gears: { url: 'gears/#s=octa', clip: [420, 110, 860], wait: 6000 },
};

const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, s] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + s.url);
  await page.waitForTimeout(s.wait);
  const [x, y, width] = s.clip;
  const png = await page.screenshot({ clip: { x, y, width, height: Math.round(width * 10 / 16) }, timeout: 180000 });
  // Scale down and encode in a blank page (the pages' own policy refuses data: images), so the
  // script needs nothing beyond Playwright.
  const blank = await browser.newPage();
  const webp = await blank.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = 336; c.height = 210;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, 336, 210);
    return c.toDataURL('image/webp', 0.82);
  }, 'data:image/png;base64,' + png.toString('base64'));
  writeFileSync(OUT + name + '.webp', Buffer.from(webp.split(',')[1], 'base64'));
  console.log(name, 'done');
  await blank.close();
  await page.close();
}
await browser.close();
