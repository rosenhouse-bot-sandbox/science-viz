# Optics workshop: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- Every ray is traced exactly. Numbers in a challenge's text match what the trace gives.
- Every challenge can be won, and only by real design. A loose threshold made the doublet too easy. (2026-11-12)
- "Favor images and interaction over text. Show don't tell." (2026-11-12)
- An optics term is explained before it is used. A control says what it does to the light. (2026-11-12)
- What the optics does is shown as an everyday picture: an eye chart, a night scene, a match that flares. (2026-11-12)
- Wavelength belongs to the light. Color is what we see. (2026-11-12)
- Nothing in the panel or on the bench moves while a slider is dragged.

## Checked and right

Do not report these again.

- None recorded. This page has not had a realism audit.

## Open

- None recorded.

## Taking frames

- Ready: `window.__optics && window.__optics.S.out`. Hash: `l=<level id>`.
- Levels unlock in order. Solve the earlier ones first, as `tests/optics/run.mjs` does.
- Speed: a 2D canvas with no animation. A screenshot is fast.
- Tests: `tests/optics/run.mjs`, `layout.mjs`.
