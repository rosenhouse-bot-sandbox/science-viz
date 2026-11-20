// Fills in each experience's "Started" and "Updated" lines from dates.json, which the Pages
// workflow writes from git history at deploy time (.github/dates.mjs). The relative time is worked
// out here, in the visitor's browser, so it stays right however long ago the site was deployed.
// Without the file (a local server that has not run the script) the lines stay hidden.
const started = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export function ago(then, now = Date.now()) {
  const h = Math.floor((now - then) / 3.6e6);
  if (h < 1) return 'under an hour ago';
  if (h < 49) return h === 1 ? '1 hour ago' : `${h} hours ago`;
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
