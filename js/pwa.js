// Lets the site be added to a Home Screen and opened with no network: registers the service worker
// (sw.js at the site root), which keeps a copy of every file. Every page loads this module.
//
// A server on "localhost" runs without it, so that local work always shows the files on disk and
// the page tests see the network as before. tests/pwa/run.mjs serves on 127.0.0.1 to test it.
const go = () => navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' }).catch(() => {});
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
