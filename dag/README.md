# Graph layout: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

This page draws algorithms, not physics. Here realism means the picture shows what the algorithm did.

## Rules

- The page says which pictures come from its own step-by-step code and which from the real ELK and TALA. (2026-11-12)
- Nodes do not overlap. Every edge meets its nodes. No cycle is left. Two runs give the same picture.
- Meters (crossings, labels covered) are counted from the layout drawn.
- Check a project's current state before writing about it. TALA is open source. (2026-11-12)

## Checked and right

Do not report these again.

- None recorded. This page has not had a realism audit.

## Open

- None recorded.

## Taking frames

- Ready: `document.getElementById('graphFacts').textContent.includes('nodes')`.
- Speed: a 2D canvas. A screenshot is fast. Real TALA takes about 7 s a try.
- Tests: `tests/dag/run.mjs`, `page.mjs`.
