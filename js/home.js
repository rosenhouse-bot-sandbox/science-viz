// Fills in each experience's "Started" and "Updated" lines from dates.json, which the Pages
// workflow writes from git history at deploy time (.github/dates.mjs). The relative time is worked
// out here, in the visitor's browser, so it stays right however long ago the site was deployed.
// Without the file (a local server that has not run the script) the lines stay hidden.
const started = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export function ago(then, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - then) / 6e4)), h = Math.floor(m / 60);
  if (h < 2) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  if (h < 49) return `${h} hours ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function fill(dates) {
  for (const meta of document.querySelectorAll('.meta[data-page]')) {
    const d = dates[meta.dataset.page];
    if (!d) continue;
    const [s, u] = meta.querySelectorAll('time');
    s.dateTime = d.started; s.textContent = started(d.started);
    u.dateTime = d.updated; u.textContent = ago(Date.parse(d.updated));
    meta.hidden = false;
  }
}

fetch('dates.json').then((r) => (r.ok ? r.json() : null)).then((d) => d && fill(d)).catch(() => {});
