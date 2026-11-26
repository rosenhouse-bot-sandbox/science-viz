# Japanese maple: what must stay true

The `realism-audit` skill reads this before an audit and adds to it after. One line each, in Gabe's words where he gave them, with the date. What the page simplifies is said on screen and in the top `README.md`, not here.

## Rules

- One 3D model. Never fade one picture into another or swap one for another. Move the camera or the object. (2026-11-14)
- "Don't move time and zoom at the same time." (2026-11-14)
- "Continuity in space and time." A cutaway needs a visual cue. The leaf is cut along one marked line; a small window "looks like a rendering error". (2026-11-15)
- Leaf colors are computed from the pigment amounts. They are never typed in.
- Anything shown at two zooms is shown at every zoom between them. The sunlight dots were missing between Cells and Molecules. (2026-11-15)
- Summer looks brighter, at the zoomed-out scales too. The Sun stands where it is on that date. (2026-11-14)
- Light we see as green is drawn green. (2026-11-18)
- A bare tree casts a bare tree's shadow. (2026-11-18)
- Surfaces have structure at every scale. "Too flat: look at photos of real leaves." (2026-11-15)
- A camera move pulls back only as far as it needs. (2026-11-17)

## Checked and right

Do not report these again.

- The leaf's toothed edge, and the length of the tree's shadow.
- Tissue, Cells, Molecules and the leaf fall, as of 2026-11-18.

## Open

- The vacuole looks flat at zoom 3.6, and a faint join shows at zoom 1.6 in summer. (2026-11-15, not rechecked)

## Taking frames

- Ready: `window.__maple && document.getElementById('capTitle').textContent`.
- Settle: `__maple.settle(); __maple.redraw()`. Hash: `z=2&s=0.56&at=vacuole`.
- Speed: a screenshot takes 20 to 60 s in software. Read the canvas (5 to 10 s). Below Leaf it is 20 to 35 s a frame even at `__maple.res(0.5)`. Run one capture at a time.
- A reduced sheet hides breaks here. Look at phone size at twice the sharpness, the zoom in small steps, every season.
- Tests: `tests/maple/model.mjs`, `page.mjs` (about an hour in software; run it alone).
