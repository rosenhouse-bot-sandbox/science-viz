# Developing this site

Guidance for anyone, human or agent, changing this repository. The README describes what each
experience is and where its code lives.

## Ground rules

- Static site, no build step, no dependencies. (One exception, which Gabe chose: Graph layout loads
  the real ELK and the real TALA from jsDelivr, pinned to a version, only when the visitor asks for
  them. Nothing else may load code from another host.) Plain HTML, CSS and ES modules, served as-is from
  GitHub Pages (`.github/workflows/pages.yml` publishes `main`). (`tests/` is not part of the site:
  it needs Node and a Playwright installed outside the repository.)
- Run it with `python3 -m http.server 8000` from the repository root. ES modules do not load from
  `file://`.
- Each experience is self-contained: `rainbows/` (Rainbows), `vesicle/`, `optics/` (Optics workshop),
  `dag/` (Graph layout), `maple/` (Japanese maple), `engine/` (Engine), `shoulder/` (Shoulder), `saccade/` (Overshoot saccades) and `gears/` (Gear fidget) have their own page, stylesheet (`css/`) and modules (`js/`). Do not change one while working on
  another.
  The one thing they share is controller support, `js/gamepad/gamepad.js` and `css/gamepad.css`: each
  page gives it a short mapping onto its own camera, zoom and scale functions.
  They also share their sliders: `css/slider.css` draws every `<input type="range">` (loaded before the page's
  own stylesheet, which only adds its colors) and `js/touch/slider.js` works them, so that a finger can take
  hold anywhere on a slider's row (iPad Safari's own slider grabs only on its small knob). Each page calls
  `touchSliders()` once; a page with a Zoom line passes `{ zoom: { glideTo: zoomTo } }` so that a press away
  from the knob flies there as a press on a scale's name does. Do not add slider styling or pointer handling
  for sliders to a page; change the shared files and run `node tests/touch/run.mjs`.
  They also share the Home Screen app: `manifest.webmanifest`, `sw.js` and `js/pwa.js`. A new page
  copies the block from `<link rel="manifest">` to `apple-mobile-web-app-status-bar-style` into its
  `<head>`, adds `manifest-src 'self'` to its Content-Security-Policy, and loads `js/pwa.js` last in
  `<body>`. The service worker keeps every file in a page's folder and under `js/`, `css/` and `img/`;
  a file anywhere else is not available offline. Do not commit a filled-in `sw.js`: the Pages
  workflow fills in its file list at deploy time (`.github/sw.mjs`).
  The 3D pages also share WebGL helpers and matrices, `js/gl/gl.js`. Put a helper there only when two
  pages use it as it is; anything one page needs for itself stays in its own folder.
- The browser tests share `tests/lib/serve.mjs` (the web server, Playwright and the software-WebGL flags) and
  `tests/lib/pages.mjs` (every page of the site by name). A new page goes in `PAGES` in `pages.mjs`; then the
  iPad, touch, gamepad and Home Screen tests stop and say so until each has an entry for it.
- Maple, Engine, Shoulder, Overshoot saccades and Gear fidget are version-stamped: every address that loads a
  file of one of these pages ends in `?v=...`, so that a browser never pairs a new file with an old cached copy
  of another. After changing a file one of these pages loads (the page's `js/` folder, stylesheet or `data/`, or a
  shared module the page imports, such as `js/gl/gl.js` or `js/touch/slider.js`), run `node tests/stamp.mjs`.
  The page's tests fail if the stamp is out of date.
- Physics claims must be true. Numbers shown on screen come from the model in code
  (`js/rainbows/optics.js` for Rainbows), not from text typed into a caption. Where a picture simplifies or
  exaggerates, say so on screen and in the README.
- Use wavelength and color correctly. Wavelength is a property of the light; color is what we
  perceive. White light is a mix of many wavelengths, not "every color at once". Write "short
  wavelengths, which we see as blue", and "drawn in gold" for a color that is only the picture's.

## Realism

- Each page's folder has a `REALISM.md`: the laws that page must obey and what each forces the picture to show
  (`gears/REALISM.md`: only a cutting edge touches the work, and only the work). Read it before changing the page.
- A rule there is derived from physics, anatomy or geometry. When someone says a picture looks wrong, find the law
  it breaks and add the law and what follows from it. Do not record the remark, who made it or when.
- A known defect goes in a GitHub issue, not in `REALISM.md`.
- To audit a page, use the `realism-audit` skill (`.claude/skills/realism-audit/SKILL.md`). A cheaper model takes
  frames with `node tests/audit/shots.mjs`, and the strongest model derives the rules and reads the frames.

## Writing the text

- Write on-screen text, captions, briefs, info cards and README prose with the `prose-lint` skill
  (`.claude/skills/prose-lint/SKILL.md`). It asks for short, complete sentences, plain words, no
  metaphor, constraints before objectives, and each fact said once, and it checks the text against what
  the code draws. Run `.claude/skills/prose-lint/check.sh <files>` on the files you change. Gabe built
  the rules by picking between rewrites, so add new examples to the skill when he corrects a sentence.

## Modern Web Guidance

Before writing or changing any HTML, CSS or client-side JavaScript, consult
[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance) and follow it where it
applies. It is a set of current web-platform best practices (accessibility, forms, CSS, motion,
performance, security, canvas and WebGL) maintained by the browser vendors and MDN.

Search for the capability you are about to build, then read the matching guide:

```sh
npx -y modern-web-guidance@latest search "range slider"
npx -y modern-web-guidance@latest retrieve "slider"
```

Without network access to npm, clone the repository and read the guides under
`skills/modern-web-guidance/guides/`. Start with the discipline guides: `accessibility`, `html`,
`css`, `forms`, `motion`, `performance`, `security`.

**Browser support:** features that are Baseline Widely available need no fallback. Newer features
are welcome only when they are feature-detected or degrade harmlessly, and only with fallbacks
that add no dependency. No polyfills.

What that guidance has meant here so far, and should keep meaning:

- Honour `prefers-reduced-motion`: no camera drift, no flying zoom between scales, and the
  animation starts paused. Anything that moves on its own needs a visible Pause control.
- Use native controls (`<button>`, `<input type="range">`, `<input type="checkbox">`) with real
  labels. Everything reachable by pointer must be reachable by keyboard.
- A canvas is opaque to assistive technology. Keep the story, the numbers and the controls in the
  DOM beside it, and announce changes through a live region.
- Drive all animation from `requestAnimationFrame` (it stops in hidden tabs), recover from a lost
  WebGL context, and keep start-up work in short tasks.
- Keep the page's `<meta>` Content-Security-Policy tight: no inline scripts or event handlers, and
  add a host to it only when a page really needs one.
- Never build HTML from text that came from the URL or the user. Readouts are built from numbers.

## Tablets

Every page must work on an iPad, held upright and sideways, in split view, and as a Home Screen app.
A new page is not done until it does.

- Lay out for three widths. Under 900px the panel is a sheet along the foot of the screen; from 900px it is a
  column on the left. An iPad held upright (744 to 834px wide) gets the sheet, and from 700px the sheet's
  contents keep to a 640px column in the middle. An iPad Pro held upright (1024px) and every iPad held
  sideways get the column. A split view can be as narrow as a phone (375px).
- A finger needs 44 × 44 px. Under `@media (pointer:coarse)` make every button, slider, tick box (through its
  label), stop on a slider and `<summary>` at least that big. Where a row of them cannot fit, let the row run
  into the panel's padding.
- A finger cannot hover. Anything shown on hover must also open with a tap (Vesicle's label cards do this),
  and nothing may need a right click, a double click or a key held down.
- Put every `:hover` look inside `@media (hover:hover)`, or it stays lit after a tap. Give `html,body`
  `touch-action:manipulation`, so that two quick taps do not zoom the page. A press must show at once:
  `css/slider.css` gives buttons a pressed look and grows a held slider's knob.
- Do not stop the visitor zooming: no `user-scalable=no` or `maximum-scale`. The picture's `touch-action`
  follows the pinch rules under Checking a change.
- Pad everything fixed to an edge by `env(safe-area-inset-*)`: a Home Screen app runs under the status bar.
- Turning the iPad must not need a reload: lay out from the current size, and redraw on `resize`.
- Run `node tests/ipad/run.mjs <page>`. A new page goes in `tests/lib/pages.mjs`.
- Sliders come from `css/slider.css` and `js/touch/slider.js` (see Ground rules). A press anywhere on a
  slider's row takes hold, a press on the knob never moves it, a press away glides there, and a drag never
  scrolls the panel. Run `node tests/touch/run.mjs <page>`, and give a new page an entry in `PAGES` there.

## Checking a change

Before pushing:

- `node --check` every changed module.
- For Rainbows, first run `node tests/rainbows/model.mjs` (no browser, a few seconds): it fails if a beam at
  Surface is drawn with more light than arrived or s and p differ at 0°, a ray to the eye comes or goes at full
  strength, the second bow's rays leave away from 51°, a caption share or slowdown is not the model's, a marked drop
  fades in mid-fall or is named a color it is not drawn in, Molecules loses the polarization, or the color drawn lags
  or jumps as the wavelength moves.
- For Rainbows, run the smooth-interaction tests: `node tests/smooth/run.mjs --quick` after any change,
  and the full `node tests/smooth/run.mjs` after changing a slider, a flight between scales, the
  particles or the panel's layout. They drag every slider and press every button one frame at a
  time on a stepped clock and report anything that jumps, flashes, shifts under the pointer or
  depends on the route taken. Read `tests/smooth/out/report.md` and look at `contact.png`. A new
  finding is yours to fix, or to record in `tests/smooth/accepted.json` with the reason it is
  meant. `tests/smooth/README.md` says what the tests can and cannot see.
- For the Optics workshop, first run `node tests/optics/model.mjs` (no browser, about 15 s): it fails if a ray
  breaks Snell's law or passes a solid, a blur or goal is under the wave width, a meter rises without more light, a
  typed number disagrees with the model, or a known solution stops winning. Then run `node tests/optics/run.mjs`. It plays every challenge with a mouse, a
  finger and the keyboard, and fails if one cannot be won. A new challenge needs a known solution
  added to `PLAYS` in `tests/optics/plays.mjs`. Numbers in a challenge's text must match what the trace gives.
  Also run `node tests/optics/layout.mjs`: it steps every slider through every value and fails if
  anything in the panel or the bench moves or changes size (a number that gains a digit and wraps).
- For Vesicle fusion, run `node tests/vesicle/placement.mjs` after changing the membrane shape or
  where a protein sits. It steps through the whole event without a GPU and fails if any protein is
  on the wrong side of a membrane or pushed into one. After changing the clock, the glutamate path, the tethers, the
  arrival, the lipids' placement, the camera or the sampler, run `node tests/vesicle/model.mjs` (no browser, about
  three minutes): it fails if glutamate, lipids and proteins are not on one clock, glutamate is made or lost or reaches
  a receptor it has not, anything moves before calcium has bound, a tether changes length, the two settings carry
  different proteins, the trace and the picture differ, a sheet has a hole, or a range is shown before the sampler has
  walked in. Neither test can judge what only looks wrong, so also step through the stages by eye.
- For Graph layout, run `node tests/dag/run.mjs` (no browser needed): it lays out every sample graph
  with both methods over a spread of settings and fails if nodes overlap, an edge misses or runs through a node, two unrelated
  edges share a line, a cycle is left, a crossing count, length, score or turn reason disagrees with a second count,
  or two runs differ (about a minute). Then `node tests/dag/page.mjs` presses every control at a desktop
  and a phone size and fails on a console error, a panel wider than the screen, or words that change while nodes glide. A new sample graph
  goes in `SAMPLES` in `js/dag/graphs.js` and is picked up by both. The page must keep saying which
  pictures come from its own step-by-step code and which from the real ELK and TALA.
- For Japanese maple, run `node tests/maple/model.mjs` (no browser needed) after changing the
  calendar, a pigment curve, an absorption band or the tree: it fails if an event happens out of
  order or a leaf's computed colour gets the wrong name. Then `node tests/maple/page.mjs` (about a
  quarter of an hour with a graphics card, about an hour without one): it presses every control at a desktop and a phone size, steps both sliders end
  to end comparing each picture with the one before, and fails on a jump, a control that moved, or a
  console error. Leaf colours must stay computed from the pigment amounts; do not type them in.
  The page is one 3D model: never fade one picture into another or swap one for another between
  scales; move the camera or the object. The test draws WebGL in software, so it is slow; on a
  machine with a graphics card look at the page itself as well.
  After changing any file under `js/maple/` or `css/maple.css`, run `node tests/stamp.mjs maple`.
- For Engine, run `node tests/engine/model.mjs` (no browser needed) after changing the engine's sizes, the
  valve timing, the burn, the pressure model or the molecules: it fails if a valve is open in the wrong
  stroke or reaches the piston, a camshaft is not at half speed, the burning order is wrong, the peak
  pressure leaves its range, an atom is lost in the reaction, or a size in the shaders is not the model's.
  After changing how the gas moves (`js/engine/flow.js`), the valve timing or the pressure model, run
  `node tests/engine/flow.mjs` (no browser needed): it works out the paths of the gas dots and fails if gas is
  made or lost against the model, sits unevenly in the cylinder, is inside metal, passes a shut valve, or leaves
  any way but down the exhaust pipe. A dot of gas is never faded in or out to hide a gap in the flow.
  Then `node tests/engine/page.mjs` (`--quick` for the desktop only): it presses every control at a
  desktop and a phone size, checks the labels, steps both sliders end to end comparing each picture with
  the one before, and fails on a jump, a control that moved, labels that overlap, or a console error.
  Numbers on screen must stay computed from `js/engine/model.js`. The page is one 3D model, as the maple
  is, and no picture is swapped for another. A cut piece fades away where it is and does not move (Gabe's
  rule for this page: motion is kept for what really moves). Moving parts are never cut. After changing any file under `js/engine/` or `css/engine.css`, run `node tests/stamp.mjs engine`.
  The picture is ray-marched in a fragment shader, which is slow in software; on a machine with a
  graphics card look at the page itself as well, and on a phone.
- For Shoulder, run `node tests/shoulder/model.mjs` (no browser needed) after changing the pose, the muscles
  or how they bend: it samples hundreds of arm positions and fails if a bone enters another, a muscle point is
  pushed into a bone, a muscle folds, the bursa leaves the tendon's outer side, a muscle lengthens or
  shortens against the textbook direction, or a muscle's leverage is far from the leverage measured in cadaver
  shoulders (`tests/shoulder/axford.mjs`, about a minute). After changing the muscle data, run `node tests/shoulder/review.mjs`
  (about 2 minutes): it compares every built muscle with its scan. Then `node tests/shoulder/page.mjs`
  (`--quick` for the desktop only). Gabe's rule for this page: wrong information is far worse than missing
  information. Every sentence on screen is in `js/shoulder/facts.js` with its source; numbers come from the
  model; anything drawn larger than life says so under the picture. After changing any file under
  `js/shoulder/`, `css/shoulder.css` or `shoulder/data/`, run `node tests/stamp.mjs shoulder`.
- For Overshoot saccades, run `node tests/saccade/model.mjs` (no browser needed) after changing the model: it fails if
  saccade timing leaves the measured main sequence, a measured gain is not the gain set, a saccade's kind does not fit
  its definition, a muscle pulls or shortens the wrong way, a muscle enters the eye or another muscle, the trace steps where there is no saccade, a caption is untrue at some target speed, or the eyes twist. Then
  `node tests/saccade/page.mjs` (`--quick` for the desktop only). Numbers on screen come from `js/saccade/model.js`;
  anything that is the page's own choice, not a measured value, says so in `js/saccade/facts.js`. After changing any
  file under `js/saccade/` or `css/saccade.css`, run `node tests/stamp.mjs saccade`.
- For Gear fidget, run `node tests/gears/model.mjs` (no browser needed) after changing the solids, the tooth
  shape or how the gears are set: it turns every meshing pair and fails if a tooth enters another, if the teeth do
  not engage, if the cube with six gears can turn or another set cannot, or if the body touches a gear. Then
  `node tests/gears/page.mjs` (`--quick` for the desktop only). Numbers and sentences on screen come from
  `js/gears/model.js` and `js/gears/facts.js`. The workshop page (`gears/make.html`): after changing a size, a plan or
  how cuts are replayed, run `node tests/gears/make.mjs` (no browser; the finished part must match its drawing) and
  `node tests/gears/collide.mjs` (about 5 minutes; nothing in the shop may run into anything), then
  `node tests/gears/makepage.mjs` (`--quick` for the desktop only). After changing any file under `js/gears/` or
  `css/gears.css`, run `node tests/stamp.mjs gears`.
- After changing `js/gamepad/`, `css/gamepad.css`, a page's `gamepad({ ... })` mapping, or which
  controls a page has, run `node tests/gamepad/run.mjs` (or with page names: `home`, `rainbows`,
  `vesicle`, `optics`, `graph`, `maple`, `engine`, `shoulder`, `saccade`, `gears`, `gearsmake`, `deck`). It drives each page with a simulated Xbox
  controller at 1280 × 800 and fails if the ring cannot reach a control, a stick, trigger or bumper
  does nothing, or the picture of the pad does not list exactly what the page maps. A new page
  needs a mapping, and an entry in `PAGES` there.
- After changing how a page zooms, or what a finger on its picture does, run `node tests/pinch/run.mjs`
  (or with page names: `maple`, `engine`, `vesicle`, `rainbows`, `shoulder`, `saccade`). It puts two simulated fingers on the
  picture at a phone size and fails if spreading them does not zoom in, the slider does not move with
  them, the browser zooms the whole page, or the zoom and the time move in the same frame. A pinch
  must go through the same state as the page's Zoom slider. It cannot stand in for a real phone.
- After adding a page, a file a page loads from a new place, or a change to `sw.js`, `js/pwa.js` or
  the manifest, run `node tests/pwa/run.mjs` (about 3 minutes; `--quick` for two pages). It opens
  every page online and then with the server stopped, and fails if a page loads a file the service
  worker does not keep, loads anything from another host but the web fonts, or does not work
  offline. A new page needs an entry in `PAGES` there.
- After changing `css/slider.css`, `js/touch/slider.js`, or a page's sliders, run `node tests/touch/run.mjs` (or
  with page names: `home`, `rainbows`, `vesicle`, `optics`, `graph`, `maple`, `engine`, `shoulder`, `saccade`, `gears`, `gearsmake`;
  `--quick` for one slider a page). It works every slider with a finger at an iPad size, with and without reduced
  motion, and fails if a tap away from the knob does not take hold, jumps, turns back or ends away from the finger,
  a finger on the knob moves it, a drag does not follow or scrolls the panel, letting go does not send one `change`,
  or a mouse press on the line stops working. On every page it also fails if two quick taps can zoom the page, a
  long press can select text, or a `:hover` rule is outside `@media (hover:hover)`. Its touches are Chromium's, not iPad Safari's: look at a real iPad too.
- After changing a page's layout, its panel or its controls, run `node tests/ipad/run.mjs` (or with page
  names: `home`, `rainbows`, `vesicle`, `optics`, `graph`, `maple`, `engine`, `shoulder`, `saccade`, `gears`,
  `gearsmake`; `--quick` for the iPad Air only; `--shots` writes pictures to `tests/ipad/out/`). It opens the
  page with touch at eight iPad sizes, upright, sideways and in split view, and turns it without a reload. It
  fails if the page is wider than the screen, a control is off the screen or under something, a control is
  smaller than a finger, text is cut off, the page stops zooming, or the console shows an error. It cannot
  see Safari's toolbars or the status bar; look at a real iPad as well.
- A frozen screenshot does not show a jump. When a person reports one, first add the gesture to
  `tests/smooth/scenarios.mjs` and see the report show it, then fix it.
- Load each affected page in a browser with the console open, at a desktop width, at a phone
  width (390 × 844) and at an iPad width held upright (820 × 1180), and step through every scale and control.
- For Rainbows, also check with reduced motion switched on, and with only the keyboard.
