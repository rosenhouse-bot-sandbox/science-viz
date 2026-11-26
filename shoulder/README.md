# Shoulder: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- "Incorrect information is way worse than missing info here." Cut a claim that has no source. (2026-11-20)
- Every sentence on screen is in `js/shoulder/facts.js` with its source. Numbers come from the model.
- Built muscles are compared with the scans of the same body. (2026-11-20, `tests/shoulder/review.mjs`)
- No bone enters another. No muscle enters a bone or folds.
- A muscle shortens when it pulls, in the direction the textbooks give.
- "Muscles must not over-contract." (2026-11-26, given as an example; no test checks how far a muscle shortens yet)
- One muscle pulling alone moves the arm as measured leverage says it should. (2026-11-26; Ackland 2008, Hik and Ackland 2019)
- The muscle that is pulling can be seen. The view turns to the front for the subscapularis and the front deltoid. (2026-11-26)
- The bursa stays on the outer side of the tendon, at every lift. (2026-11-23)

## Checked and right

Do not report these again.

- Each muscle's main action, the cuff's turning leverage and the supraspinatus match published measurements. (2026-11-26)

## Open

- With the arm lifted, the back deltoid, teres minor and infraspinatus pull the arm down more than measured. Being worked on, 2026-11-26.
- "Turn out, arm up" at a 90° turn: the deltoid shows one fold. (2026-11-23)

## Taking frames

- Ready: `window.__shoulder?.frame`.
- Settle: `__shoulder.settle(); __shoulder.redraw()`. Hash keys: `z`, `c`, `lift`, `turn`, `ex`, `p`, `m`, `k`.
- Speed: about half a second a frame in software. A screenshot is fine.
- Look from the front as well. The page opens from behind, and the subscapularis tendon was drawn in tatters where no one looked.
- Tests: `tests/shoulder/model.mjs`, `review.mjs` (about 2 minutes), `page.mjs` (about 40 minutes in software), `shots.mjs` (seeded random states).
