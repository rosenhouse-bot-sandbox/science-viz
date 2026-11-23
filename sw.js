// The service worker: keeps a copy of every file of the site so that it opens with no network,
// for example from an iPad's Home Screen. js/pwa.js registers it.
//
// Files come from the network whenever it answers, so a visitor online always gets what is
// deployed and a stale copy can never hold a page back. The kept copy is used only when the network
// fails, or gives nothing for WAIT ms. The file list and VERSION below are written at deploy time by
// .github/sw.mjs; every deploy that changes a file changes VERSION, which makes the browser install
// this worker again and fetch a fresh, complete copy before the old one is dropped.
const VERSION = 'dev';
const FILES = [];
const FONTS = [];

const CACHE = 'site-' + VERSION, OTHER = 'other-hosts';
const BASE = new URL('./', self.location).href;
const WAIT = 4000;

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await c.addAll(FILES.map((f) => new Request(BASE + f, { cache: 'reload' })));
  await keepFonts().catch(() => {});
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('site-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === self.location.origin) { if (u.href.startsWith(BASE)) e.respondWith(site(r, u)); }
  else if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(u.hostname)) e.respondWith(other(r));
});

// Network first; the kept copy if the network fails or is slow. An address that is not kept, asked
// for with no network, gets the landing page if it is a page, and the network's error otherwise.
async function site(r, u) {
  const net = fetch(r), got = await soon(net);
  if (got) return got;
  const key = BASE + u.pathname.slice(new URL(BASE).pathname.length).replace(/(^|\/)index\.html$/, '$1');
  return (await caches.match(key, { cacheName: CACHE })) || (r.mode === 'navigate' && await caches.match(BASE, { cacheName: CACHE })) || net;
}

// Web fonts, and the graph layout engines the Graph layout page loads when asked: kept the first
// time they arrive, and used from then on whenever the network fails.
async function other(r) {
  const net = fetch(new Request(r.url, { mode: 'cors', credentials: 'omit' })), got = await soon(net);
  if (got && got.ok) { const copy = got.clone(); caches.open(OTHER).then((c) => c.put(r.url, copy)); return got; }
  return (await caches.match(r.url, { cacheName: OTHER })) || got || net;
}

// The response if it arrives within WAIT ms, else null (the request carries on).
function soon(net) {
  return Promise.race([net.catch(() => null), new Promise((res) => setTimeout(res, WAIT, null))]);
}

// The pages' web fonts, kept at install so that the first offline visit has them: the stylesheet
// Google sends this browser, and each font file it names.
async function keepFonts() {
  const c = await caches.open(OTHER);
  for (const css of FONTS) {
    const res = await fetch(css, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) continue;
    const text = await res.clone().text();
    await c.put(css, res);
    for (const [, f] of text.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
      if (await c.match(f)) continue;
      const font = await fetch(f, { mode: 'cors', credentials: 'omit' });
      if (font.ok) await c.put(f, font);
    }
  }
}
