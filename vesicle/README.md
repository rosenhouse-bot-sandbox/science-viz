# Vesicle fusion: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- No protein is on the wrong side of a membrane or pushed into one. (`tests/vesicle/placement.mjs`)
- A protein leaves through the pore only once it fits. The proton pump once went out through a narrow pore and ended upside down. (2026-11-12)
- Glutamate thins evenly as it leaves. It does not drain from one end. (2026-11-18)
- The arriving vesicle wanders sideways as well as up and down, and it tumbles. (2026-11-18)
- A dark spot in the reflection picture is a vesicle seen through a flat membrane, not a dent. (2026-11-12)
- Camera noise is a count of photons in each pixel.
- Protein counts come from a source (Takamori 2006).

## Checked and right

Do not report these again.

- Proteins leave through the neck (`gates` in `scene.js`).
- The microscope's formulas (`optics()`).
- Glutamate stays in the 40 nm gap.
- The bench is to scale.
- The reserve vesicles do not move: they are tethered.

## Open

- None recorded.

## Taking frames

- Ready: wait for the caption text. The page has no test hook.
- Step the hash on one page (`#mode=vitro&p=0.55`); do not reload.
- Speed: about a minute a frame as a screenshot in software, and twice the sharpness times out. Read the canvas.
- Tests: `tests/vesicle/placement.mjs`. It cannot judge what only looks wrong.
