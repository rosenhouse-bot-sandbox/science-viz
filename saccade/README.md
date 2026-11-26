# Overshoot saccades: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- How long and how fast a saccade is follows the measured main sequence.
- A measured gain equals the gain that was set. Each kind of saccade fits its definition.
- A muscle pulls and shortens the right way. No muscle enters the eye. The eyes do not twist.
- A muscle's thickness follows its length, not the nerve signal. (2026-11-23)
- Overshoot is its own setting. The literature does not tie it to poor pursuit. (2026-11-21)
- Numbers on screen come from `js/saccade/model.js`. Anything that is the page's choice and not a measured value says so in `js/saccade/facts.js`.
- Nothing covers the target. (2026-11-23)

## Checked and right

Do not report these again.

- Saccade size follows de Brouwer's measured rule, so accurate saccades land slightly short.

## Open

- None recorded.

## Taking frames

- Ready: `window.__saccade?.frame`.
- Settle: `__saccade.settle(); __saccade.redraw()`. Move time with `__saccade.sim.advance(seconds)`.
- Speed: about half a second a frame in software. A screenshot is fine.
- Tests: `tests/saccade/model.mjs`, `page.mjs`, `shots.mjs`.
