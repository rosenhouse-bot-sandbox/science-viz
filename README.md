# Science visualizations

Interactive explorations, served from the landing page `index.html`.

## Rainbows

A rebuild at `v2/`, in three dimensions at every scale, from the whole Earth down to single molecules.

| Scale | Size | What you see |
| --- | --- | --- |
| Orbit | 10 000 km | The Earth in parallel sunlight, where you stand, and the cone of your bow |
| Rain | 1 km to 1 m | A field with the Sun behind you: the bows on the far rain, and 30 000 near drops, each coloured by what it sends to your eye |
| Drop | 1 mm | One drop traced in 3D: every route the light takes, with its share of the energy |
| Surface | 1 µm | The exact field where light crosses the water's surface, on the drop's own curving skin |
| Molecules | 1 nm | One wave crossing into water at an angle you set, and the electrons its field moves: why each wavelength is slowed, and so bent, by a different amount |

- **Follow the light** picks out what comes from the Sun, or only what ends up in your eye.
- **Show light as** switches between particles (rays and photons) and waves (crests), where both make sense.
- The camera at each scale turns and zooms only within fixed limits, and "Reset view" (or a double click) returns it.
- The address bar tracks the scale and settings after `#`, so a view can be bookmarked or shared.
- The scales are one connected world. Each deeper scene sits inside the one above at its true place,
  size and orientation (the sky where you stand on the globe, the drop in the rain, a patch of surface
  tangent to the drop where the ray crosses it), and moving between scales is a single camera flight.
- The continents and clouds on the globe, and the cloud tops you pass on the way down to the field,
  are generated noise and not a map of the real Earth. The ring and dot at "You are here" are a marker
  and nothing more; they fade as the camera dives towards them. The cloud also parts around your spot
  as the camera comes down on it, which is staging and not weather. The cloud pattern does not
  move: weather crosses a few kilometres in the time the picture plays, too little to see from orbit.
- The Rain scale used to be two, Sky and Rain. It is now one scene with one camera, which starts
  behind your shoulder with the bow across the sky and moves in among the drops. How far in the
  camera is sets the dressing: the sky is turned down (to about a third of its brightness, close in)
  so that single drops show against it, and the far bow fades with it. Old links with `s=sky` open
  the Rain scale.
- Sunlight and rain are drawn so that they cannot be mistaken for each other. Sunlight is gold,
  slanted, and carries arrowheads that travel with the light. Rain is cool blue-white where it sends
  you nothing, falls straight down, and is drawn as a streak with its head down; a drop near enough
  to have a size on screen is drawn round, because drops are spheres. The streak is a drawing of
  motion, not the drop's shape. The panel carries a key.
- Time is slowed so the fall can be followed: the rain about 15 times, and the four marked drops
  about 116 times, so that one can be watched crossing the bow (a real drop would cross it in a few
  hundredths of a second). The readout gives both, computed from the speeds in `rain.js`.
- The near drops are coloured by what each sends to the standing figure, not to the camera, while
  the bow on the far rain is painted for the camera. From behind the figure the two nearly coincide;
  from the side they part, which is the point: a bow belongs to one pair of eyes.
- During a flight, both scenes are told how far it has gone (`R.zoom`), and nothing changes on a
  clock of its own. The Drop, Surface and Molecules scenes are light on a dark ground, so their light
  is added over the scene they sit in, and their own backdrop and framing (the block of water, the
  wire frame) arrive last. Those frames are drawing aids, not objects inside the drop.

The physics, all in `js/v2/optics.js`:

- Water is one Lorentz oscillator (bound electrons with a resonance near 101 nm), fitted to measured
  indices: `n² = 1 + Aλ²/(λ² − λ0²)`. It gives 1.3327 at 589 nm against a measured 1.3330. The same
  model sets the bending in the drop, the colours in the sky and the energy stored in the molecules.
- Rays through the drop carry Fresnel reflection and transmission for both polarisations. Of the
  sunlight on a typical rainbow ray, about 6% reflects off the front, 89% leaves through the back,
  4.6% makes the primary bow (96% polarised) and 0.5% the secondary.
- The sky's brightness against angle is computed, not painted: rays over the whole face of the drop,
  for the outside reflection and one and two internal reflections, summed over the spectrum with
  CIE colour matching and blurred by the Sun's half-degree disc. The dark band and the brighter sky
  inside the bow fall out of it. Interference (supernumerary bows) is not modelled.
- At the surface the field is the exact plane-wave solution at a flat boundary, in a beam of finite
  width. The surface around it is the drop's own, a sphere of 1 mm radius drawn to scale: it runs to
  a horizon about 90 µm away and curves out of sight. Across the beam it is flat to about 20 nm.
- The Surface scale's words go by the view. With Particles (the view it opens in) they describe the
  dots: photons that reflect or pass with the Fresnel odds and travel at c/n. That view shows where
  the light goes and is a simplification; the text says so, and that the wave is the better model
  of why light turns at a surface. With Waves they describe the crests.
- Changing which crossing the Surface scale shows flies the camera out until the drop is in view,
  round the drop to the new crossing and back in. The camera stays upright in the drop's frame
  throughout, so each crossing is seen tilted the way it lies on the drop: the back wall with water
  on the left and air on the right, the leaving point from inside with air below.
- The rainbow ray meets the back of the drop at 40°, below the 48.6° critical angle. A ray inside a
  sphere always meets the wall at the angle it was refracted to on entry, so sunlight in a drop is
  never totally reflected. The Surface scale says so, and its angle slider stops short of the
  critical angle for light inside the water.
- The last scale draws one thing: the light's electric field entering the water, with two rows of
  water molecules beside it, each drawn as a dot for its nuclei and a disc for its electrons, which the field moves the opposite way. The magnetic field is a
  toggle, the energy split is folded away under "Where the wave's energy is", and the few percent
  of light that reflects is left out, which the panel says. Each molecule drawn stands for over a
  hundred layers of real ones.
- The Surface scale draws the drop cut open along the plane of the ray (`dropSkin` in
  `js/v2/stages/surface.js`): the half nearer the camera is taken away, so the surface is seen
  edge-on as a bright line with the water's blue cut face on one side and air on the other, and the
  beams bend at that line. It is a drawing aid and the panel says so: the light is a round beam on
  both sides of the cut. With Waves the crests are drawn in a thin slice through the middle of the
  beam, lying in the cut face: seen through the whole round beam at a slant, the crests in the water
  averaged away. From far off the cutting plane is out beyond the drop and closes in as the
  camera does (`cutAt`), and the Drop scale's sphere is cut by the same plane on the flight in.
- The Molecules panel carries two moving pictures drawn from the model, on the scene's clock, so
  Pause stops them. One shows a molecule's electrons (a disc) moved by the field of 700 nm and of 400 nm light; how
  much further they move than in a steady field of the same strength (2.1% and 6.8%) is drawn ten
  times too big, which the caption says. The other shows the wave falling behind the wave there
  would be with no water as each layer of molecules adds its own small wave a quarter of a cycle
  behind. Each layer drawn stands for about 220 real ones and delays the wave by exactly 220 times
  what one real layer does; reflection is left out.
- The last scale is the Surface scale's own patch of the drop seen from the same camera, closer:
  the flight between the two never turns, the drop's skin and blue water are drawn by the same
  shader code in both, and the water stays on the side it was on. The light drawn is polarised with
  its electric field across the plane of the bend, so from that direction it swings mostly toward
  and away from you; drag to look along the surface and see it from the side. The last scale shows
  light going from air into water, which happens where the ray enters the drop: zooming in from the
  back wall or the way out flies round to the entering crossing first.
- Between the Drop and Surface scales the Drop scene draws the one ray the Surface scale follows,
  the rainbow ray of its colour, through the very spot the Surface scene sits on, and its other
  rays give way. Each colour's rainbow ray crosses the skin at its own place (red and violet are
  about 10 µm apart on a 1 mm drop), so the spot moves with the colour. Arriving from the Drop
  scale, the colour is the one that drop is sending to the eye where it sits in the bow.
- In the last scale the wave's energy is split into electric field, magnetic field, stretched
  molecules and moving electrons. Energy held in matter does not travel, which gives the energy
  velocity; nearer the ultraviolet resonance more is held, so violet is slower than red.

Simplifications: with Waves at Orbit, Rain and Drop, the crests are drawn far further apart than real
ones (6,690 km, 2.4 m and 0.4 mm against 550 nm), which the readout says; only the Surface and
Molecules scales draw them at their true spacing. Drops are spheres, air's index is taken as 1, and brightness is compressed so that
the 5% of light in the bow can be seen beside the 89% that escapes. A toggle spreads the colours 5×
for visibility; it is off by default.

Code: `js/v2/gl.js` is a small WebGL2 engine (HDR targets, bloom, glowing lines and points,
full-screen ray shaders), `js/v2/main.js` holds state, cameras and controls, and each scale is a
module in `js/v2/stages/`. It needs WebGL2 and has no dependencies. On slow machines it draws
fewer pixels to keep the frame rate.

## Vesicle fusion

A second experience, at `vesicle/`: a real-time 3D model of a synaptic vesicle fusing with the
presynaptic membrane, drawn lipid by lipid and to scale in nanometres.

- **Fusion progress** starts with the vesicle's arrival: it wanders the last 120 nm by Brownian
  motion until tethers on the active zone (Munc13 and RIM, drawn as rods) catch it about 42 nm up
  and reel it in, with synaptobrevin free until syntaxin and SNAP-25 can reach it. The wander is a
  fixed path, so the slider is repeatable. It goes as far sideways as up and down (up to 20 nm either
  way before the tethers catch it, 4 nm after), and it tumbles, with everything it carries: the same
  knocks turn a sphere this size about 40° for each 16 nm it wanders, so it turns through a few
  radians on the way. Once tethered it keeps one side down and only shivers, and it docks in the
  place and the turn the later stages start from. The reflection camera does not see the sideways
  part: it is a fifth of one of its pixels. Inside, the glutamate moves about the whole lumen, and which
  molecule leaves through the pore next is a matter of chance, so the vesicle empties evenly: a molecule
  crosses the lumen about a thousand times faster than it can leave. It then scrubs
  from a docked vesicle through SNARE zippering, the hemifusion stalk,
  the opening and widening of the fusion pore, to full collapse into the membrane.
- The vesicle carries more than its fusion machinery: about 30 synaptophysins, 10 glutamate
  transporters, 10 Rab3 and a proton pump, in the numbers counted on an average vesicle (Takamori
  et al., 2006). They ride into the cell membrane with its lipids, but each only once it fits: around
  a narrow neck the cytoplasm is a wedge a few nanometres high, so the small proteins leave soon
  after the pore opens, Rab3 later, and the proton pump, whose head stands 13 nm tall, only when the
  neck has opened to the vesicle's full width. A tagged synaptobrevin waits until the pore's lumen
  is wide enough for its tag. The fit is tested against the membrane shape in code (`gates` in
  `scene.js`); that the pump stays whole is a simplification. Shapes are schematic, and they
  are not counted as scatterers by the reflection camera.
- **Vesicle diameter** resizes the vesicle (and its glutamate load, at 150 mM).
- **Cutaway, orbit, tilt, distance** fly the camera; drag, pinch and scroll work too.
- Lipids keep the colour of the membrane they started in, so you can watch the two mix: the
  facing leaflets from hemifusion onward, the far leaflets only once the pore is open.

An **In vivo / In vitro** switch changes the setting. In vitro, the cell sits on a glass-bottom
dish over a TIRF microscope, and synaptobrevin carries two fluorescent proteins in a row on its
lumenal end, superecliptic pHluorin and an orange protein:

- A 488 nm laser hits the glass at an adjustable angle. Past the critical angle it reflects
  totally and leaves an evanescent field that decays exponentially with height
  (`d = λ / 4π√(n₁² sin²θ − n₂²)`); below it, the beam refracts into the cell and lights all of it.
  The field is drawn as a glow, as light falling on the molecules, and in cross-section on the
  cutaway faces with a ruler line at each multiple of the penetration depth.
- pHluorin is quenched at the vesicle's pH 5.5 (to 4% of its brightness outside) and lights up
  when the pore opens. 510 nm emission leaves in all directions.
- The orange protein is modelled on CyOFP1, whose Stokes shift is large enough for the same
  488 nm laser to excite it: emission peak 589 nm, pKa 5.5. It is treated as one acid group, lit
  fraction `1 / (1 + 10^(pKa − pH))`, which leaves it at 51% of its outside brightness in the
  vesicle. So it shows where a vesicle is before any pore opens (its light follows the
  evanescent field at the tags' height), and at the pore it only doubles while pHluorin rises
  25-fold. One of each per synaptobrevin, taken to be equally bright once both are lit.
- A dichroic mirror is assumed to send the two bands to separate halves of the sensor with no
  light from one protein landing in the other's half. The camera panel lays the two pictures
  back over each other, 510 nm drawn in green and 589 nm in orange (a spot lit in both comes out
  yellow), each with its own shot noise, and the trace has one line per band. The 589 nm blur
  is wider (202 nm against 175 nm), and wider again (237 nm) because the objective, focused for
  510 nm, is 162 nm out of focus at 589 nm in the page's model of its chromatic error.
- Not modelled: bleed between the bands, the two proteins' different bleaching and maturation,
  energy transfer between them (they sit a few nanometres apart, and pHluorin's emission overlaps
  the orange protein's absorption, so a real tandem tag would pass some of the green light's
  energy to the orange protein), and the time protons take to leave through a narrow pore.
- The distance slider runs from 40 nm out to 160 mm, so you can pull back through the cell, the
  0.17 mm coverslip and the immersion oil to the dish and the 100×, NA 1.49 objective, all to scale.
- A picture-in-picture camera view shows what the microscope records: each tag blurred to the
  diffraction limit, 65 nm pixels, shot noise, and a trace of brightness over the event.

- The laser footprint is tens of micrometres wide, so the whole underside of the cell is lit.
  A few hundred other vesicles sit near the glass; just under half fuse at their own moment
  before or after the one in focus, and all of them appear in the camera view.

Optics, bench geometry and the camera simulation are in `js/vesicle/vitro.js`.

An optional **Interference reflection camera** (a checkbox in vitro) adds a second, dye-free view
through the same objective:

- Light of one colour, 620 to 720 nm (630 nm by default), goes straight up through the objective.
  The 0.4% reflected where glass meets medium is the reference wave; membranes and the vesicle's
  watery interior scatter a far weaker wave back, with a phase of `4πnz/λ` set by their height.
  The camera records the two added together.
- The scattered wave is the first Born approximation integrated over the page's own membrane
  shape: lipid (index 1.48, 4 nm) and the vesicle interior (1.335, like the medium) against
  cytoplasm (1.36). For a flat film this is the Fresnel thin-film formula. The two terms have
  opposite signs, so contrast does not simply grow with vesicle size.
- A docked 42 nm vesicle comes out a little under 1% darker than the background at 630 nm, fading
  as it flattens; larger vesicles turn bright partway through the collapse. The camera panel shows
  a second column (field, magnified centre, contrast trace) in grey, ±3.5% of the background. Six other docked vesicles sit within 300 nm of ours and
  blur into one spot about 2% dark, which stays after ours has merged. **Subtract a frame from
  before the vesicle arrived** shows the change since that baseline instead (±1.5%, with the
  baseline's own shot noise carried along): vesicles already docked cancel, ours shows alone and
  fades to nothing as it merges. During the arrival the spot swings from bright to dark as the
  vesicle comes down through part of a fringe. The inference view still starts from a docked vesicle.
- The wavelength is longer than the laser's to stay clear of both emission bands (the slider
  starts at 620 nm, past the 589 nm band), not because long
  wavelengths resolve more: within the slider's range, shorter light gives a sharper, stronger spot.
- On the cutaway faces, beside the lines that mark each multiple of the evanescent depth, level
  lines in the reflection colour mark the heights where a small piece of membrane looks brightest
  (solid) and darkest (dotted) to the reflection camera, `λ/4n` apart.
- **One objective, two colours.** No lens focuses every colour at the same depth. The objective
  is modelled as an apochromat that is exact at 436, 546 and 656 nm and off by up to 100 nm in
  between (a cubic through the three lines; illustrative, not a maker's data), so at 630 nm it
  focuses 159 nm deeper than for the 510 nm fluorescence, the two agree near 670 nm, and by
  720 nm they are 541 nm apart. A **Focus on** control gives the focus to the fluorescence, the
  reflection, or halfway. The blur of each camera is then computed from the objective's pupil
  with the high-aperture defocus phase `k n Δz (√(1 − (ρ NA/n)²) − 1)`. For the reflection
  camera, which records amplitudes, defocus moves contrast from the centre of the spot into
  rings and can invert it; for the fluorescence camera it widens the blur by the fall in its
  peak (the Strehl ratio). The inference model uses the same blurs.
- Simplifications: each fusion site is a point for the reflection camera, the pupil is uniform
  and scalar (no polarisation), the reference light arrives at normal incidence, the fluorescence
  blur stays Gaussian, and lateral colour (a magnification difference of a few nanometres across
  this field) and wavelength-dependent spherical aberration are left out. The cell has no
  organelles or mottle of its own in the camera panel, which the panel says.

The model is in `js/vesicle/irm.js`.

A third setting, **Inference**, turns the problem around. It simulates a noisy 400 ms TIRF video
of one fusion event from hidden parameters, then infers them back with Bayes' rule, live:

- Six unknowns: the moment of arrival, the moment of fusion, vesicle diameter, number of tag
  copies, collapse time and the tags' diffusion coefficient, each with a prior (log-normal; flat
  for the fusion time; for the arrival, any time before the fusion).
- Until it arrives the vesicle hangs about 120 nm above its docked height, where the page's
  Arrival stage begins, and then it is docked: one step, not the wander and reeling-in of the
  3D view.
- The forward model gives the expected photons in every pixel of every frame of each band. The
  bands share every unknown and the evanescent field, and differ only in how much the acid dims
  them. Each band's likelihood is Poisson and the two add. A change of position moves both bands
  by the same factor; a pore moves the 510 nm band about 13 times more than the 589 nm band.
  An affine-invariant ensemble of 40 walkers samples the posterior in the browser.
- A second sampler is given the 510 nm band alone and drawn as green outlines. For the default
  event (42 nm, all frames seen, arrival truly at 40 ms) it puts the arrival between 10 and
  54 ms; with the 589 nm band the range is 36 to 43 ms. The second band also narrows collapse
  time (42–236 ms to 75–205 ms) and the pore width 40 ms after fusion (3–50 nm to 3–34 nm).
  It does little for vesicle diameter (32–63 nm to 40–68 nm): size shows only in how much dimmer
  the docked vesicle is than the flattened one, and a field 107 nm deep changes slowly over
  a vesicle's height.
- The video-time slider sets how many frames have been seen, so you can watch beliefs sharpen as
  evidence arrives: an orange step without a green one is the arrival, the green flash fixes
  the fusion time, the rise gives collapse time, the spreading gives diffusion. Vesicle size
  stays vague.
- Uncertainty is drawn three ways: density strips (prior in grey, posterior in gold, with a 90%
  range and the bits learned), a fan chart that turns into a forecast past the last frame seen,
  and in the 3D scene a gold band around the best-estimate vesicle that holds 90% of the plausible
  membrane shapes (brighter core: 50%). Everything shown is a running summary, eased over time,
  so it moves when the evidence changes and not with each step of the sampler.
- Laser power, frame time, laser angle and prior width are adjustable; "New event" draws a new
  hidden truth and "Show the true values" reveals it.

- A **pore width** chart shows the believed width of the fusion pore over the video, in
  nanometres. It is derived from each sample's fusion time, collapse time and vesicle size
  through the membrane shape; the model's pore opens at the moment of fusion and widens as the
  vesicle flattens, so there is no separate pore parameter.
- With the interference reflection camera on, its video is a further likelihood on the same six
  unknowns (Gaussian shot noise, 20,000 photoelectrons per pixel per millisecond). Every pixel
  has an unknown static brightness of its own, standing for the cell's fixed pattern, which is
  integrated out, so only changes over time count and a picture that stays the same tells
  nothing. The green outlines then show the two fluorescence bands without the reflection video,
  so the narrowing is visible. For the default event (42 nm, all frames seen) the 90% range for
  vesicle diameter goes from 40–68 nm to 41–43 nm, for collapse time from 75–205 ms to 79–92 ms,
  and for pore width 40 ms after fusion from 3–34 nm to 21–26 nm (630 nm, focus on the
  fluorescence). At 720 nm, where the reflection camera is 541 nm out of focus, the same three
  are 40–43 nm, 74–91 ms and 20–28 nm: the model knows its own blur, so defocus costs contrast,
  not truth.

A "How it works" button in that view opens a short summary of the mathematics (Bayes' rule, the
priors, the forward model, the Poisson likelihood, the sampler, and how to read the results).

The model and sampler are in `js/vesicle/infer.js`, the charts in `js/vesicle/inferui.js`.

Around the scene:

- The address bar tracks the view after `#` (`mode`, `p`, `size`, `angle`, `cut`, `orbit`, `tilt`,
  `dist`, `labels`, `irm`, `wl`, `focus`, `sub`, plus `t`, `power`, `frame`, `prior`, `seed`, `truth` in the inference view), so any state can be bookmarked or shared; there is also a copy-link button.
- On a desktop, hovering a label opens a short explanation with a Wikipedia link
  (text in `js/vesicle/info.js`).
- Hovering an entry in the colour key picks those molecules out and dims the rest; clicking holds it.

The membrane is a surface of revolution (sphere, toroidal neck, plane) whose two leaflets are
offset copies; clipping those offsets at the axis yields the stalk and the pore without special
cases. Lipids are placed by conserved area, so the vesicle's membrane flows out through the neck
as it flattens. See `js/vesicle/profile.js`. It needs WebGL2 and has no dependencies. If the frame
rate drops it draws fewer, larger lipids.

## Running it

It is a static site with no build step. Open `index.html` (the landing page) through any local
web server (ES modules will not load from `file://`), for example:

```
python3 -m http.server 8000
```

## Controller

Every page can be driven with an Xbox controller (so also with a Steam Deck, which shows up as one).
Nothing is added to a page until a controller connects.

| On the pad | What it does |
| --- | --- |
| Left stick, D-pad | Move a gold ring between the page's controls. On a slider, left and right change it: one notch, then faster the longer it is held. With nowhere to go, the panel scrolls. |
| A | Press the ringed control |
| B | Close what is open (the picture of the pad, a dialog, a picked node), else back to the landing page |
| Right stick | Rainbows, Vesicle fusion and Shoulder: turn the camera. Graph layout: pick out a node. |
| Triggers | Zoom, as hard as they are pressed (Rainbows, Vesicle fusion, Japanese maple, Engine, Shoulder) |
| Bumpers | The scale, stage, challenge or step before and after |
| View | Show or hide a picture of the pad that says what each part does on this page |
| Menu | Back to the Deck, on a visit that started there |

- A press of A or a bumper gives a short, light rumble where the pad and the browser can; not with
  reduced motion.
- A visit "started at the Deck" when the address it came in by ends `?from=deck`. The site then
  remembers the page the browser says it came from, for as long as the tab is open, and Menu goes
  back to it from any page. Otherwise Menu does nothing and the picture leaves it unlit.
- The Optics workshop and Graph layout have no camera, and Japanese maple's and Engine's are not turned by hand,
  so the right stick or the triggers do nothing there, and the picture says so by leaving them unlit.

`js/gamepad/gamepad.js` is the one module every page shares: it reads the pad each frame, moves the
ring by where the controls are on screen, and draws the picture. Each page hands it a short mapping
(look for `gamepad({` in its `main.js`) that calls the page's own camera, zoom and scale functions.
`css/gamepad.css` is loaded only once a pad connects. `node tests/gamepad/run.mjs` drives every page
with a simulated pad at 1280 × 800.

## Developing

`CLAUDE.md` holds the working rules for this repository. The main one: before changing any HTML,
CSS or client-side JavaScript, consult
[Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance) and follow it where it
applies.

Rainbows has a test for the things a screenshot cannot show: a jump part-way along a slider
drag, a flash on one frame of a flight, a control that moves as it is pressed, a view that depends
on the route taken to it. `node tests/smooth/run.mjs` drives the page in headless Chromium with a
real pointer on a stepped clock, samples every frame, and writes a report with strips of the worst
frames to `tests/smooth/out/`. `tests/smooth/README.md` explains how it works and what it cannot
judge (how it feels on a real GPU, above all).

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main`. In the repository settings, set Pages → Source to
"GitHub Actions" once.

## Layout

- `index.html`, `css/home.css`, `js/home.js`: the landing page, one tile per experience in
  alphabetical order, each with a thumbnail (`img/thumbs/`, taken from the pages by
  `node tests/home/thumbs.mjs` with a local server running) and when it was started and last
  updated. Those dates come from git history: the Pages workflow runs `.github/dates.mjs` just
  before it uploads the site, which writes `dates.json` (published, never committed), and the page
  works out "5 hours ago" in the browser. Run the script by hand to see the dates locally;
  without the file the date lines stay hidden.
- `v2/index.html`, `css/v2.css`, `js/v2/`: Rainbows v2 (`gl.js` engine, `optics.js` physics, `main.js` controls, `stages/*.js` one module per scale).
- `vesicle/index.html`, `css/vesicle.css`, `js/vesicle/*.js`: the vesicle fusion experience
  (`profile.js` geometry, `scene.js` molecules and drawing, `vitro.js` microscope, `shaders.js` GLSL,
  `main.js` controls).
- `maple/index.html`, `css/maple.css`, `js/maple/*.js`: Japanese maple (see its section below).
- `engine/index.html`, `css/engine.css`, `js/engine/*.js`: Engine (see its section below).
- `shoulder/index.html`, `css/shoulder.css`, `js/shoulder/*.js`, `shoulder/data/`: Shoulder (see its section below).
- `gears/index.html`, `css/gears.css`, `js/gears/*.js`: Gear fidget (see its section below).
- `js/gamepad/`, `css/gamepad.css`: controller support, shared by every page (see Controller above).
- `drafts/`: review boards from each design round.
- `tests/vesicle/placement.mjs`: steps Vesicle fusion through every frame without a GPU and fails if a
  protein is on the wrong side of a membrane or pushed into one.
- `tests/smooth/`: the smooth-interaction tests for Rainbows (`run.mjs` drives the page, `inject.js` is the
  stepped clock and the probes, `scenarios.mjs` the gestures, `analyze.mjs` the checks and the report).

## Optics workshop

A game at `optics/`: build things that bend light on a bench where every ray is really traced.
Each challenge has a one-line task, one to three things to change (sliders, and a row of buttons
where the choice is a glass), and a goal measured from the trace. The challenges are taken in order: each is
locked until the ones before it are solved. A bar at the foot of the panel holds Previous and one
button for going on: Next, which becomes Submit while the goal is met and the challenge is not yet solved. Pressing it wins the challenge: the button becomes Next, and the
text under the bar becomes a note about what you just built and why it works. Nothing opens over the page.

| Challenge | You change | It teaches |
| --- | --- | --- |
| Burning glass | Where the lens sits, how strongly its faces curve | Focus and focal length |
| Make a picture | A hole or a lens in a plate, the size of the hole, where the screen sits | What a picture is: each point of a candle lighting its own point of a screen; pinhole against lens |
| Step back | How far away the candle is, where the screen sits | Light from a far-off point arrives as parallel rays and makes a spot one focal length behind the lens |
| Eyeglasses | The power of a spectacle lens in front of a nearsighted eye | Spreading lenses, dioptres |
| Camera lens | The shape of a 50 mm lens and its iris | Spherical aberration, and sharpness against brightness |
| Colour | The glass of a 100 mm lens, and its curve | Dispersion (wavelengths focusing apart), the Abbe number, index against curvature |
| Doublet | The curve of a crown lens, and the glass and back face of a lens cemented behind it, for a 50 mm lens with a 6 µm spot | The achromatic doublet: why it takes two glasses, and why the pair matters |
| Wide view | The bending of a lens and where its stop sits | Coma and field curvature off the axis (Wollaston's landscape lens) |
| Solar tower | The tilt of three heliostat mirrors | The law of reflection |

- The white knobs in the picture can be dragged with a mouse or a finger. Every setting is also a
  slider in the panel, so the whole game can be played from the keyboard. The iris and the mirrors
  move by a fixed small amount for each pixel of drag, so a thumb can set them finely.
- A bar that fills is named for what the player gains: "Sharpness" fills as the blur (the number
  beside it) shrinks, "Brightness" as more light gets through. A value that has to land in a band,
  such as a focal length, is a marker on a scale with the band marked, not a bar. A slider moves the
  same way as the thing it moves in the picture.
- On a phone the bench is given only the height its shape needs and the panel takes the rest, so
  that every control is on screen when a challenge opens (the test checks this at 390 × 844 and at
  390 × 700). The magnified spot, or the eye chart, sits in a column beside the bench.
- Nothing moves unless you move it, with one exception: when the match lights it flares, with
  sparks, for four seconds and then the flame holds still. With reduced motion switched on it is
  simply alight. The flame is a drawing, not a model of combustion.
- The solar tower's boiler glows by the share of the mirrors' light that lands on it, from dull red
  to white-hot, so each mirror that finds it makes it visibly brighter. The colours are a drawing,
  not a temperature.
- Beside the eye is an eye chart as that eye sees it. The chart is laid out at its true size on the
  retina (a 20/20 letter is five minutes of arc, 26 µm, tall; the eye turns angles into distances
  about the centre of the cornea's curve) and every point of it is spread into the spot the traced
  rays make there. The small change in image size that a spectacle lens causes is left out.
- Solved challenges are remembered in the browser (`localStorage`); the address bar tracks the
  challenge after `#`.

Code: `js/optics/trace.js` is the ray tracer, `glass.js` the refractive indices, `levels.js` the
challenges (their text, their scenes and their scoring), `chart.js` the eye chart, `main.js` the page. `css/optics.css` is the
stylesheet. `node tests/optics/run.mjs` plays every challenge in a real browser with a mouse, a
finger and the keyboard. `node tests/optics/layout.mjs` moves every slider through every value, on a
desktop and two phone sizes, and fails if anything in the panel or the bench changes place or size.

The physics:

- The tracer is exact in the plane: each ray meets each spherical face where it really is and bends
  by Snell's law. No thin-lens or small-angle approximation is made, so spherical aberration appears
  because it is in the geometry. Focal lengths shown are the thick-lens (lensmaker's) values.
- Glass indices come from the makers' Sellmeier fits, and Malitson's for fluorite. They give the
  catalogue values at 587.6 nm and the catalogue Abbe numbers: N-BK7 1.5168 and 64.2, F2 1.6200 and
  36.4, SF10 1.7283 and 28.5, CaF2 1.4338 and 95.0.
- The text keeps wavelength and colour apart: wavelength is a property of the light, colour is what
  we see. White light is a mix of many wavelengths; it is traced as three of them, 486 nm, 546 nm
  and 656 nm, each drawn in the colour we see it as (blue, green, red). In the two chromatic challenges the blur behind "Sharpness" is
  over the three together, equally weighted. The inset adds the three drawings up; it is not a
  rendering of what an eye would see of a full spectrum.
- The insets show a small night scene (white stars, a close pair, a lit window) as the sensor records
  it: each point is spread into the traced spot, per wavelength in white light. Brightness is compressed.
- In the Wide view challenge the second bundle arrives 20° off the axis, so its spot is not round.
  Only the slice of that bundle in the plane of the picture is traced, each ray weighted equally,
  and its blur is measured about its own middle. That catches coma and field curvature; the error
  of the slice at right angles (astigmatism) and distortion are not counted. Its inset
  therefore smears the stars at the edge of the picture up and down only. The stop is f/11. The spectacle
  plastic is a two-term fit through CR-39's index and Abbe number. Air is taken as 1.
- For the lens challenges the light comes from a point on the axis, so the spot on the target is
  round. Each traced ray stands for a ring of light, and is weighted by its height in the beam.
  "Blur" is twice the root-mean-square radius of the spot. The camera's sensor is placed where that
  is smallest.
- The eye is the textbook "reduced eye": one spherical surface of radius 5.55 mm into a fluid of
  index 4/3, with a 3 mm pupil, made 23.45 mm long so that it is nearsighted.

Simplifications, which the panel also states where they matter: one wavelength (550 nm) outside the
two chromatic challenges; light on the axis only outside Wide view; no reflection losses at the
glass; the Sun is a point, not a half-degree disc; the spectacle lens (40 mm across, 1.5 mm at its thinnest) is equally curved on both
faces, where a real one is a meniscus; the solar field is a flat slice with three mirrors. The
inset that magnifies the spot compresses brightness (a square root) so that a wide blur can still be
seen.

## Graph layout

A page at `dag/` that draws a directed graph two ways, one step at a time. A directed graph is a
set of nodes joined by arrows (edges).

Each method has an **Engine** switch. "Step by step" is code written for this page, so that every
step can be shown; it is not the real library, and the page says so. "Real ELK" and "Real TALA"
load the real engines and show what they give for the same graph:

- ELK is [elkjs](https://github.com/kieler/elkjs) 0.12.1 (ELK compiled to JavaScript, 1.6 MB).
  Groups become nested nodes with `hierarchyHandling: INCLUDE_CHILDREN`. The settings map onto
  ELK's own options (`js/dag/real.js`); "Sorting passes" sets `elk.layered.thoroughness`, which is
  related but not the same thing.
- TALA is inside D2's WebAssembly build, [@d2lang/d2](https://www.npmjs.com/package/@d2lang/d2)
  0.1.34 (11 MB). The graph is written out as D2 text with each group as a container. Seed and
  Tries become `tala-seeds`. It runs in a worker; on the 55-node file it takes about 7 s for each
  seed.

Both come from jsDelivr, pinned to those versions, and only when the switch is pressed. This is the
site's one outside dependency, and the page's Content-Security-Policy allows that host, WebAssembly
and a blob worker for it. The engines give only a finished layout, so in that mode there are two
steps, the input and the result. The nodes and edges are still drawn by this page.

**Layered** follows the five phases of ELK Layered (the Sugiyama method), written again here in
`js/dag/layered.js`. It is not ELK's code, and where a phase is simpler than ELK's it is listed below.

| Step | What happens | Settings |
| --- | --- | --- |
| Turn | Edges are turned round until no cycle is left | Greedy (Eades, Lin and Smyth), depth first, or every edge that points to an earlier node in the file |
| Layers | Each node gets a layer after every node that points to it | Longest path; short edges; at most a set number of nodes in a layer |
| Sort | Each layer is sorted by the average place of its neighbours, back and forth | Number of passes, 0 to 10 |
| Align | Nodes slide along their layer until joined nodes line up | Space between nodes and between layers |
| Route | Edges are drawn through the points that hold their place in each layer | Right angles, straight, or curved |

- "Short edges" is a local search that moves a node towards the side where it has more edges. ELK
  finds the true shortest total with the network simplex method; this can stop short of it.
- "Width limit" fills layers in file order and sends a node one layer further when a layer is full.
  ELK's bounded-width layering is Coffman and Graham's.
- Sorting uses the barycentre rule only and keeps the best ordering seen. ELK adds a greedy switch
  and random restarts.
- Align is an isotonic regression per layer towards the average of the neighbours. ELK's default is
  Brandes and Köpf.
- Groups: with "Boxes", each group is laid out by itself and becomes a box, the boxes are laid out
  as if each were one large node, and edges between boxes are routed last around the nodes with
  the same A* router the search uses (always at right angles). ELK does this in one pass
  (`hierarchyHandling: INCLUDE_CHILDREN`), where edges between boxes also shape the layers inside
  them; this two-level version cannot, so it crosses more edges than ELK would. "Colour only"
  ignores the groups when placing nodes.
- Connected pieces are laid out one at a time and packed in rows; nodes with no edge go in one block.

**Search** stands in for TALA, D2's layout engine, in `js/dag/search.js`. It is not TALA's code
and not its algorithm. TALA was closed source until September 2026 and is now open source
(MPL-2.0, shipped inside D2 from v0.9.0); this page was written from its makers' description, not
from that source. It shares the outline: TALA is not tied to layers, treats containers as
first-class, draws edges at right angles, and runs several seeds (3 by default) and keeps the
layout that scores best. Here
each group is a box, nodes sit on a grid inside their box and boxes on a grid of their own. A try
starts from a random arrangement and swaps two nodes or two boxes, keeping the swap when the
score drops (simulated annealing: early on, some swaps that raise it are kept too). The score adds
edge length, bends, crossings and edges that point against the chosen direction. Several seeds are
tried, each shown as a small picture with its score, and the lowest is kept. Edges are then routed
with an A* search over lines laid through and beside the nodes. 
What the real TALA does that this does not, from its source (`d2layouts/d2talalayout` in D2, about
64 000 lines of Go): each seed first discovers structure in the graph (sequences, hubs, clusters,
trees, and layered parts ranked by network simplex), then places nodes and refines the placement
(swaps, transposes, gap normalisation, cluster optimisation, symmetry balancing, equal spacing),
packs disconnected parts, routes edges over an orthogonal visibility graph with channel nudging,
places labels, and scores the finished layout; the lowest penalty wins, then the smallest area.
None of the structure discovery, symmetry, label placement or per-container direction is here.

The numbers in the panel are measured from the lines as drawn (`measure` in `js/dag/common.js`):
crossings are counted where two drawn edges cross, and edge length is in node widths.

The first sample is `dag/graphs/anonymous-topology.yaml`, copied from the `lg` repository: 55 nodes
in 9 groups. Of its 65 edges, 2 repeat an earlier one and 1 joins a node to itself; those are left
out of the layout, and the self edge is drawn as a small loop on its node. `parseTopology` in
`js/dag/graphs.js` reads only that file's shape, not YAML in general. The other samples are small
graphs that each show one thing: a shortcut edge, a fan, cycles, a tangle, a tree, three groups.

**Edge labels.** The "Edge labels" switch gives every edge the label "source to target". The real
engines place labels as part of the layout: ELK is told each label's size and makes room for it
beside its edge; TALA (through D2, at font size 10) picks a position along each route, and the page
turns that position into coordinates the way D2's `lib/label` does. The page's own step-by-step
layouts do not place labels: each is put at the middle of its finished edge and left there. The
panel counts "Labels covered", the labels that lie over a node or over another label
(`labelsCovered` in `js/dag/common.js`). On the 55-node file that is 0 for both real engines and
24 and 38 for the page's own two layouts. A label's text is drawn only when it is large enough on
screen to read; its plate is always drawn.

Under each method the panel links to its background and source:
[layered graph drawing](https://en.wikipedia.org/wiki/Layered_graph_drawing),
the [ELK Layered reference](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html),
[ELK](https://github.com/eclipse-elk/elk) and [elkjs](https://github.com/kieler/elkjs);
[TALA in the D2 docs](https://d2lang.com/tour/tala), the
[announcement that it is open source](https://d2lang.com/blog/tala-is-open-source/) and
[its source](https://github.com/d2lang/d2/tree/master/d2layouts/d2talalayout).

Hovering or tapping a node, or the arrow keys with the drawing focused, picks out the node and its
edges. The address after `#` holds the graph, the method, the step and every setting.

Code: `layered.js` and `search.js` are the two layouts, `route.js` the right-angle router, `common.js` the shared measurements and
seeded random number, `graphs.js` the samples, `main.js` the page. `css/dag.css` is the stylesheet.
`node tests/dag/run.mjs` checks the layouts' rules without a browser; `node tests/dag/page.mjs`
presses every control in a real one.

## Japanese maple

A page at `maple/`: one leaf of a Japanese maple (*Acer palmatum*) from the day its bud opens to the
day it falls, at every scale from the whole tree down to its pigment molecules. Two sliders drive it.

- **Zoom** is continuous, with five named stops: Tree (the view is about 5.5 m tall),
  Leaf (16 cm), Tissue (0.16 mm), Cells (56 µm) and Molecules (4 nm). The whole page is one 3D
  model, drawn with WebGL, and the zoom is one camera closing on one point of it. Nothing is ever
  faded in or swapped for another picture: the tree, the leaf, its cells and their molecules are all
  there at once, each at its true size, and come into view only by getting bigger. The followed leaf
  hangs at the end of a low twig. It is cut straight across, through the middle lobe and the two beside it: as the zoom goes in from
  Leaf, the piece beyond the cut slides aside (the cut is shown being made, and the line it is made along is marked in white from the Leaf scale on), and the camera goes
  into the gap and looks at the cut face, facing out from the tree so that only lawn is behind it: the leaf's layers of cells, then one
  tall cell, then the face of one stack of membrane inside one of its chloroplasts (or the water
  of its vacuole). A white ring marks the point each scale zooms into (the leaf on the tree, the
  cut on the leaf, the cell in the wall, the spot in the cell), and the Zoom slider has a tick
  and a name at each stop. The scale bar at the top right is measured at the point looked at. The
  size of the view is one smooth curve along the slider (no change of pace at a stop), a flight to
  a stop eases in and out and keeps its speed if another stop is pressed on the way, and things
  smaller than a pixel show only as their share of it, so nothing is switched on at a zoom level.
  The mouse wheel zooms too (one notch is the same change of scale everywhere), and so do two fingers
  on the picture: spreading them zooms in, about one scale for a full spread, and the Zoom slider
  moves with them. An arrow key moves
  the Zoom slider a twentieth of a scale and the Season slider five thousandths of the year.
- **Season** runs from 25 March to 20 December, with a Play button. The date and the zoom never
  move together: while the zoom is moving the year waits, then goes on. Summer, when little changes,
  takes less of the slider than autumn. The date is shown, and the day length for it at 35° N
  (sunrise to sunset by geometry, without the bending of light by the air).
- At Cells and Molecules, **Zoom into** chooses between a chloroplast and the vacuole of the same
  cell, because the pigments live in different places: chlorophyll and carotenoids in the
  chloroplast's membranes, anthocyanin dissolved in the vacuole's water.

What the page shows, and where each part comes from (`js/maple/model.js` unless noted):

- **Each leaf has its own timetable.** It stops renewing chlorophyll on a day between late October
  and mid November, earlier the more sun it gets; it makes anthocyanin in proportion to the sun it
  gets (a leaf needs light and sugar to make it); it falls 22 to 38 days later. So the crown turns
  from the outside in, red outside and yellow or orange within. The followed leaf is in full sun and
  is the last to fall.
- **Four curves per leaf**: chlorophyll (built up over about six weeks in spring, gone within 23
  days in autumn), carotenoids (55% remain at leaf fall), anthocyanin, and how far the separation
  layer has cut through the foot of the stalk. The panel's bars show them for the followed leaf.
- **Colour is computed, not painted.** Each pigment has an absorption band (a few Gaussians placed
  on the bands measured in leaves: chlorophyll near 440 and 675 nm, carotenoids 425 to 480 nm,
  cyanidin 3-glucoside near 530 nm). The light that comes back from a leaf is `exp(−absorbance)`
  at each wavelength, and its colour on screen is that spectrum weighted by the CIE 1931 colour
  matching functions (the fit of Wyman, Sloan and Shirley, 2013), under light equal at every
  wavelength. The panel's small chart shows the same numbers: the share of each wavelength that
  comes back, over what each pigment absorbs. The colour's name in its caption is taken from the
  computed hue.
- **Tissue** is the leaf's thickness (0.14 mm here): an upper skin of clear cells, a row of tall
  cells packed with chloroplasts (the palisade layer), loose cells with air between (the spongy
  layer), a lower skin with pores (stomata), and a small vein cut across with its water-carrying
  cells above and sugar-carrying cells below. The tall cells make all of the anthocyanin share
  shown in the panel and the loose cells a fifth of it, so the leaf reddens from its upper side;
  cells within 75 µm of the vein run up to 7.5 days behind the rest, so green lasts longest there.
  Both numbers are illustrative.
- **Sunlight in the leaf** (Tissue and Cells, with **Light arriving** switched on): dots of light
  of single wavelengths fall down through the cut leaf. Whether a dot is taken in, how deep, and
  by which pigment is drawn by lot when it sets out, with the chances the model gives that
  wavelength in a leaf holding the day's pigments (`thickness` in `model.js`, the same numbers
  the leaf's colour is computed from): chlorophyll and carotenoids take it at a chloroplast,
  anthocyanin in a vacuole, each with a flash. So in summer the dots we see as blue and red stop
  in the tall cells and many of those we see as green go on and out underneath; in a red leaf the
  dots we see as green stop in the vacuoles and those we see as red pass. The panel prints the model's shares at 450, 550 and 675 nm.
- **The Sun** stands where it does at five in the afternoon, solar time, at 35° N on each date
  (`sunAt` in `model.js`): 25° up at midsummer, within a degree of the horizon in mid November, just set by
  late December. The sky, the brightness of the lawn, hills and leaves, and the tree's shadow
  follow its height, so summer is the bright part of the year. The panel prints its height. The sky
  stays day-blue until the Sun is near the horizon (yellowed near a low Sun) and darkens through twilight, which
  ends 8° below it; the Sun on this page never gets lower than about 2° below, so the sky is never night-dark.
  The sunlight on the tree weakens much sooner, as its path through the air lengthens: with the Sun 4°
  up the tree is lit about half as brightly as in summer. Low sunlight is also yellower; that is not
  drawn on the tree, so that each leaf's color stays the one its pigments give. The shadow is as dark
  as the crown is full of leaf (bare twigs stop about an eighth as much light), and the trunk casts a line.
- **Cells**: tall cells seen from the side, chloroplasts along their walls and the vacuole down
  the middle of each. In autumn the stacks of membrane inside each chloroplast go and drops of fat
  take their place (in the followed cell they are drawn one by one), the chloroplasts shrink and
  turn yellow, and the vacuole turns crimson.
- **Molecules** are built atom by atom to scale (a carbon to carbon bond is 0.14 nm): chlorophyll
  *a* (the ring, its magnesium atom, the 20-carbon tail) and β-carotene lifted onto the face of the membrane,
  whose bumps are the heads of its fat molecules; cyanidin 3-glucoside in the vacuole. The bonds
  that glow are the row or ring of alternating double and single bonds whose shared electrons
  take in visible light. With **Light arriving** switched on, dots of light of single wavelengths
  (each drawn in the colour we see that wavelength as) fall on the molecules; whether a molecule
  takes one in is decided by its pigment's absorption band at that wavelength, the same band the
  leaf colour is computed from, and a molecule that takes one in flashes. So chlorophyll takes in
  most of the dots at the wavelengths we see as blue and red and fewest near 550 nm, which is why
  a leaf full of it looks green. As a pigment's
  share falls, its molecules go one at a time.
- **Try it: double bonds in a row** (panel, at Molecules) shows why. It steps through five real
  carotenoids that the plant makes one from the next: phytoene (3 double bonds in a row, absorbs
  most strongly near 286 nm), phytofluene (5, 348 nm), ζ-carotene (7, 400 nm), neurosporene (9,
  440 nm) and lycopene (11, 472 nm). The longer the row, the longer the wavelength taken in; the
  first two absorb only ultraviolet and have no colour. The swatch is computed with the same
  colour code as the leaves, from white light passed through the pigment. The peak wavelengths
  are measured values (in solution, to a few nanometres); the three-peaked shape of each band is
  the leaf's carotenoid band moved to that peak.
- **The foot of the stalk**, a diagram in the panel at the Leaf scale once the cut has begun: cork
  forms on the twig side, the separation layer comes apart from the outside in, the vein breaks last.

Simplified or exaggerated, and said so on the page:

- Dates are typical for Kyoto; pigment amounts are smooth curves with the right order and rough
  durations, shown as shares of the leaf's own summer amount (anthocyanin: of its peak), not
  measurements. Absorption bands are illustrative fits.
- The tree has about 7,600 leaves; a real one this size carries several times more. Leaves near
  the followed leaf's face and behind it are left out so that it can be seen and seen through.
- From Cells to Molecules the falling light is drawn at three more sizes of dot, each a tenth of the
  one before, so that some are in view at every zoom; these fall straight through without being
  taken in.
- The dots of sunlight in the leaf fall straight down, far slower than light, and as many are
  drawn on every date and at every wavelength from 400 to 700 nm (not the mix in real sunlight). A real leaf also scatters light about inside itself, which lets it take in
  more of the light we see as green than is drawn (about three quarters of it in summer) and sends some back out
  of its upper side; neither is drawn. The split of each pigment between the tall and the loose
  cells (70% of the chloroplast pigments and 83% of the anthocyanin in the tall cells) is illustrative.
- The sky is always clear, and the brightness that goes with the Sun's height is the picture's
  own: a leaf's colour is still computed from its pigments and only dimmed or brightened as a whole.
- A fall takes seconds; it is spread over two and a half days of the slider so that it can be seen.
  Fallen leaves keep their colour (real ones brown within days).
- A young leaf's cells are drawn smaller: the cut face and its cells are sized by the square root of
  the leaf's size, and the Tissue and Cells views close in by as much (the scale bar stays true).
  Chloroplasts and molecules inside are not resized.
- Inside the vacuole the water's colour hides the cell round it within a few micrometres, and
  molecules beyond a hundred or so nanometres. Real cell sap is far clearer; without this the view
  would not change as the zoom goes from micrometres to nanometres.
- Fallen leaves rest on the tips of their lobes, level; real ones lie anyhow.
- A leaf comes out of its bud folded like a fan (the middle lobe flat, every other lobe creased along its middle vein with its
  upper side inward, the lobes close together, the blade hanging) and opens flat as it grows. The fold is a simple one: the
  same angle on every lobe but the middle one, and every leaf of the tree as far open as the followed one. A real
  leaf's cells are still dividing and have few air spaces then; here they are the grown leaf's
  cells, smaller.
- The followed leaf is turned toward the afternoon Sun so that it is lit as the outside of the
  crown is, and the close-ups look down the slope of its blade, away from the tree. The brightest
  leaves are eased down rather than cut off at the screen's brightest, so a sunlit leaf is drawn
  less bright against a shaded one than it is.
- The cut across the leaf is the picture's own device; no real leaf is cut. Cells are built for
  0.9 mm of the cut face round the marked spot. The rest of the face shows a picture of those same
  cells, taken square on and repeated every 0.9 mm along the cut, so a vein comes round more often
  there than veins are really spaced. The leaf's surface (veins down to the finest net, the fields between them, their relief)
  is a drawn pattern, not a measured one. The cells are a model: regular shapes,
  whole at the cut where real ones would be sliced open, and only their walls, chloroplasts and
  vacuoles are drawn. Only the followed cell's chloroplasts have their membrane stacks drawn; the
  rest carry dark dots in their place. In the followed chloroplast a few single sheets of membrane
  run from the followed stack toward its neighbours; a real one has many more, winding round
  every stack.
- Molecules are flat, without hydrogen atoms, and chlorophyll's side groups are stubs (one of its
  five oxygen atoms is drawn). Real pigments sit inside the membrane, held by proteins; here the
  proteins are plain mounds 10 to 15 nm across (real ones are of several kinds and far more
  crowded), and the pigments are lifted onto the membrane's face and spread evenly over it so that
  they can be seen. The mounds go as the chlorophyll goes. The membrane's fat molecules have no colour of their own;
  they are tinted with a little of the colour the pigments give the whole membrane. Water is left out. The membrane stays to the end of the year at this scale, though in a
  real cell it is taken apart and the remaining carotenoids end up in drops of fat. In the chain
  slider's drawing, double bonds outside the row are not drawn. Only the 63 molecules nearest the middle are built
  atom by atom; those further off are flat outlines. One molecule has no colour: each is drawn in
  the colour its pigment has in bulk, and in the vacuole the atoms are drawn pale and dark red so
  that they show against the red water. Anthocyanin is drawn a few times more crowded than it is
  in a deep red cell (about 18 mM here; a red leaf's vacuoles hold several mM) at the middle of the view, and thinner
  further out; beyond 15 nm the molecules are outlines of their three rings, out to a quarter of a
  micrometre and no further. The water's colour is drawn hiding them only from the nearest thing
  drawn onward, not from the eye. The dots of light move far slower than
  light, and one dot stands for a little light of one wavelength. When chlorophyll is broken down
  the caption gives the enzymes' order (magnesium out, tail off, ring opened); the picture only
  takes each molecule away in its turn.

It is WebGL2 written by hand, with no dependencies. Places are worked out in 64-bit numbers and
each group of things (tree, leaf, cells, molecules) is handed to the graphics card relative to the
camera, which is what lets one model span from metres to a tenth of a nanometre. Nothing moves
unless the year is playing, a zoom is in flight or light is arriving; with reduced motion the year
does not start by itself, zooms are immediate and the light is off until switched on. If the
graphics context is lost the page loads itself again at the same zoom and date.

Code: `model.js` the calendar, pigments and colour; `tree.js` the tree in 3D, each leaf's timetable
and the leaf outline; `world.js` everything that is drawn, from the hills to the atoms; `shaders.js`
the shaders; `molecules.js` the three pigments' skeletons; `gl.js` small WebGL helpers, vectors and
rotations; `figs.js` the panel pictures; `main.js` the camera and controls. `css/maple.css` is the
stylesheet.
`node tests/maple/model.mjs` checks the model without a browser; `node tests/maple/page.mjs` presses
every control in a real one and steps both sliders end to end looking for jumps.

## Engine

A page at `engine/`: a gasoline car engine, from the car on the road down to the molecules in the
flame. Two controls drive it, as on the maple page.

- **Zoom** is continuous, with five named stops: Car (the view is about 5 m wide), Engine (0.7 m),
  Cylinder (0.3 m), Flame (0.13 m) and Molecules (8 nm). The page is one 3D model. Between stops the
  camera moves, and no picture is swapped for another. Three cuts open the model as the zoom goes in,
  each a straight plane whose face is drawn pale and hatched. A cut piece does not move: it fades away
  where it is, so that the only things that move on the page are the things that move in an engine. The
  pieces are the hood and near fender (with the near front wheel); the near half of the engine block
  and its cover; and the end slice of the engine at cylinder 4, cut through the middle of its nearer
  pair of valves. Moving parts (pistons, rods, crankshaft, camshafts, valves, spark plug, injector) are
  never cut.
- **One cycle** is the crank angle of cylinder 4, from 0° to 720° (two turns of the crankshaft, four
  strokes), with a Play button. Time is slower the further in the zoom is: slowed 60, 60, 600,
  6,000 and 60,000 times at the five stops. At the Car a **Real speed** button runs the engine as it is,
  20 cycles a second; the page does not open that way, because at that speed the dial, the stroke names
  and the pressure marker only flicker. At Flame, Play loops over the burn (325° to 402°); at
  Molecules, over the few degrees in which the flame front passes the spot looked at. The zoom and the
  crank angle never move together: while the zoom moves, the engine waits.
- **Labels** with leader lines are on the picture at the Engine, Cylinder, Flame and Molecules stops
  (none at Car). They are DOM elements placed from 3D points of the model, each shown only near its
  stop, and each term has a line of explanation under it the first time it appears.
- The panel gives the stroke in words, three numbers, and a chart of the pressure in cylinder 4
  through the cycle with the present moment marked. At Molecules it also gives the reaction,
  2 C₈H₁₈ + 25 O₂ → 16 CO₂ + 18 H₂O.

The engine (`js/engine/model.js`): four cylinders in a row, 2.0 liters (bore 84 mm, stroke 90 mm,
connecting rod 145 mm), compression ratio 10.5 to 1 from the drawn geometry, two camshafts above four
valves per cylinder, fuel sprayed straight into the cylinder. Burning order 1, 3, 4, 2. The intake
valve opens 10° before the top and closes 40° after the bottom; the exhaust valve opens 50° before
the bottom and closes 10° after the top; both lift 9 mm. The spark is 25° before the top and lasts 1.5 thousandths of a second (22° of
crank): a breakdown, then a dimmer glow while the coil empties. The car
cruises at 60 mph with the crankshaft at 2,400 turns a minute, so 1° of crank takes 69 millionths of
a second. The tires (0.68 m across) roll, so their five spokes turn 12.5 times a second; where they
turn too far in one frame to follow, they are drawn blurred.

What is computed, not typed:

- Piston height from the crank angle, crank throw and rod length. Valve lift from the timing above;
  the camshafts' bumps are drawn from the same lift curve, at half the crankshaft's speed.
- Pressure and temperature, in half-degree steps: intake at half an atmosphere (a light load, with the
  throttle mostly shut), compression of the trapped gas without heat exchange, a burn that releases the
  fuel's heat along an S-shaped curve from the spark over about 60°, expansion, and the fall to exhaust
  pressure once the exhaust valve opens. The peak is about 21 atmospheres, 14° after the top. The air comes in at 385 K, warmed by the hot
  port and valve.
  Seventy-two percent of the fuel's heat is kept in the gas; the rest is taken as lost to the walls.
- How the gas moves (`js/engine/flow.js`). Each dot of gas is followed the whole way: in along the
  intake pipe (air) or out of the injector's tip (fuel), past the intake valves, through compression and the burn, out past the exhaust valves
  and down the exhaust pipe. No dot is made or lost on the way, so the number of dots in the cylinder
  at each crank angle is the mass of gas the model has there, to within a few percent: about a third
  of the burned gas rushes out by its own pressure when the exhaust valve opens, before the piston
  starts back up, and the rising piston pushes out most of the rest. While a valve is open the gas under
  the cylinder head moves as a flow without swirl (a potential flow), worked out on a grid of
  1.75 mm cells when the page loads; below the head it moves with the piston; with both valves shut it
  is squeezed evenly. A dot of fuel leaves the injector's tip at its moment in the spray (70° to 95°) and flies out
  along the cone, slowing as it drags air along (from about 100 m/s, 62 mm at most); 30° later it goes where the gas
  goes, and drifts to its own place in the evenly spread gas by the time the intake valve shuts, which stands for
  the turbulent mixing that is not modeled. While the flame spreads, the burned gas is as many times thinner than
  the gas ahead of it as it is hotter (about 2.7 times, from the model's two temperatures, at the same pressure).
  The dots are moved sideways out from the cylinder's axis, where the plug is: along each line out from the axis
  at one height, the burned gas fills the stretch inside the flame's sphere and the unburned gas is squeezed into
  the rest. The burned gas glows faintly, so the dots in it can be seen. The dots' paths are worked out once, in a few seconds after the page opens,
  and the picture at any angle is read from them, so it is the same however that angle was reached.
- The flame front's distance from the plug, which sets where the glow is drawn and when the spot the
  Molecules stop looks at burns. That spot is 13 mm from the plug, so it burns about 6° before the
  piston reaches the top, while the cycle dial is still in Compression. The captions and the line
  above them say so, and a pale arc on the cycle dial marks the burn, from the spark (25° before
  the top) until the front has crossed the cylinder (19° after it).
- The cycle is a dial, because it repeats. Its hand goes around once for the four strokes: two turns
  of the crankshaft, one of a camshaft. Intake starts at 12 o'clock, so the piston is at the top of its
  travel at 12 and at 6. A real range input lies in the dial, unseen, for
  the keyboard, a screen reader and a controller; a mouse or a finger turns the hand.
- At Molecules, a group of 121 molecules (2 fuel, 25 oxygen, 94 nitrogen) in a cube whose edge
  follows the pressure and temperature at that spot (about 23 nm during intake, 13 nm at the spark).
  Every atom is followed through the reaction into 16 carbon dioxide and 18 water molecules; the
  nitrogen is unchanged. As the exhaust stroke ends the burned molecules leave the view one after
  another and fresh air arrives the same way, so the count goes from 128 back to 121 without a jump.

Where the picture simplifies, which the page also says:

- Dots stand for gas. They are far fewer and far larger than molecules, and colored (air blue,
  fuel green, burned gas orange, cooled burned gas tan), though air and gasoline vapor are colorless.
  The dots move as a smooth flow. The gas in a real cylinder is turbulent, and the air comes in as a
  tumbling jet; pressure waves in the pipes are not modeled either. Where a dot passes behind a
  valve's taper it is hidden by the valve.
  Between the Flame and Molecules stops the dots are drawn at six smaller sizes in turn, each a tenth of the last, so that
  something is in view at every zoom; past them, the space between molecules is drawn dark. These dots are scattered
  at random (each cell of a lattice holds none to three, one on average), wander on the molecules' clock while the
  page plays, and are squeezed together with the gas: their spacing goes with the cube root of its density, so a
  view holds about six times as many at the top of compression as during intake, as it holds molecules.
- Burned gas is drawn glowing orange. A real gasoline flame gives off only faint light, at short
  visible wavelengths, which we see as blue.
- Iso-octane stands for the hundreds of hydrocarbons in gasoline. The burn is drawn as one step; the
  real one goes through many short-lived fragments. About 1 molecule in 100 of real burned gas is
  carbon monoxide or nitric oxide, and air is about 1% argon; none of these are drawn.
- At Molecules the burn of the group is stretched over 4° of crank so that it can be followed, and the
  molecules' own motion is slowed far more than the engine's.
- The injector is drawn 12 mm to one side of the middle of the cylinder so that the cut shows it.
  The engine is drawn set lengthwise with its belt end toward the driver; in a car that end faces the
  front, or the side when the engine is set crosswise, as in most cars. Burned gas left from the last
  cycle is drawn as a tan layer on the piston; really it mixes through the fresh air, and at
  Molecules it is not drawn. Real molecules fly straight between collisions; here each drifts about
  one place so that it stays in view. Atoms are drawn a little smaller than their real size so that
  each molecule's shape can be seen. The group of molecules is repeated side by side, each copy
  turned a different way, to fill the view.
- The valves are 32 mm (intake) and 28 mm (exhaust) across and the spark plug's gap is 0.9 mm, as
  in a real engine of this size. The fuel spray is one narrow cone of dots; a real injector makes
  several, of droplets far smaller than a dot.
- Not drawn: oil, coolant, the throttle, the flywheel, the gearbox, the exhaust system, the alternator and its belt.
  Knock is left out: it does not happen at this light load.

The picture is drawn by stepping each pixel's ray through distance functions in a fragment shader
(`js/engine/shaders.js`). While something moves it is drawn at a lower resolution, which the page
adjusts to keep the frame rate, and once at full resolution when it comes to rest. With reduced
motion the engine does not start by itself and zooms are immediate. If the graphics context is lost
the page loads itself again at the same zoom and angle.

Code: `model.js` the engine's geometry, timing, pressure and gas; `flow.js` how the gas moves: the path of
each dot; `mol.js` the molecules and where each atom goes; `shaders.js` the car, engine and the flame's glow; `main.js` the camera, cuts, labels, panel and
controls. `css/engine.css` is the stylesheet. `node tests/engine/model.mjs` checks the model without a
browser, and `node tests/engine/flow.mjs` the gas dots' paths; `node tests/engine/page.mjs` presses every control in a real one and steps both sliders end
to end looking for jumps.

## Shoulder

A page at `shoulder/`: the right shoulder's rotator cuff, in 3D, to learn what the cuff is, what goes
wrong with it, and what the common physical therapy exercises do to it.

- **Bones are scans** (BodyParts3D, CC BY 4.0, credited on the page and in `shoulder/data/README.md`):
  shoulder blade, collarbone, arm bone, forearm, ribs 1 to 7, breastbone. **Muscles are built** as stacks
  of slices fitted to the scans of the same body's supraspinatus, infraspinatus, teres minor,
  subscapularis and three parts of the deltoid, so that the page can bend, thicken and tear them.
  `node tests/shoulder/review.mjs` compares every built muscle with its scan, both ways over the whole
  surface, and fails if 5% of either lies more than 3 mm from the other, any point more than 6 mm, or the
  volume is off by more than 10% (all seven pass with 95% within 0.7 mm). The scans themselves overlap
  the bones a good deal; that is left as it is.
- **Zoom** is continuous with three stops: Shoulder (30 cm across, deltoid on), Joint (17 cm, seen from
  behind and above, the deltoid faded away where it is) and Tendon (5 cm, a cut front to back through the
  supraspinatus tendon where it passes under the acromion; the half nearer the eye fades). Each cuff
  muscle has its own color, which is only the picture's; tendon is drawn white.
- **Conditions**: healthy, tendinopathy (the tendon drawn half as thick again near its end), partial tear
  (half the thickness gone from the underside), full tear (a hole through, and the ball up to 3 mm higher, never nearer the acromion than 2 mm),
  bursitis (the bursa 3 mm thick instead of 0.8 mm) and impingement (the tendon is lit in red where the
  acromion presses on it: where the model has to push it out of the bone's way). The sizes are drawn,
  not measured, and the page says so under each.
- **Lift the arm** (0 to 150°, in the plane of the shoulder blade) and **Turn the arm** (60° in or out).
  The shoulder blade turns a third of the lift (Inman's 2 to 1 rhythm), and a little about the vertical
  where that is needed to keep it off the ribs (worked out ahead, `shoulder/data/pose.json`). In this
  scan the acromion sits low, so the ball slides down in its socket just enough to keep 2 mm between the
  bones (up to about 5 mm); real shoulders slide less, and the page says so.
- **Exercises**: five from the AAOS conditioning program (pendulum, sleeper stretch, turning out and in with
  a band, and turning out with the arm up), and nine more from a physical therapy program (windshield wiper,
  the PNF D2 diagonal lift, bent-over raise, arm back with a band, high row, arms out on a ball, foam roll
  for the upper back, plank and side plank). Each moving one plays once round, with Play and a slider; the
  three held poses have neither. The muscles of this model that each one works are lit: for the AAOS ones
  those the program lists, for the rest those a source says make one of its movements. Where the main
  muscles are not in the model (the trunk in a plank, the latissimus dorsi in pulling the arm back), the
  page says so. The poses are in `js/shoulder/exercises.js`. The body is not drawn leaning or lying down:
  the arm is posed as it is relative to the body, and the page says so.
- **Each muscle** (in the panel) gives each muscle's length against its length at rest, from the model.
  The numbers under the picture (the narrowest gap between arm bone and acromion, and the ball's slide)
  are from the model too. Every sentence on the page has a source, listed under it (`js/shoulder/facts.js`).
- How a muscle bends is a rule, not a simulation: each slice keeps its shape and takes a share of the arm
  bone's turn about the ball's middle (from none at the origin to all of it at the insertion), then is
  pushed out of any bone it was not already in at rest. At the far ends of the turns (90° out with the
  arm up) the deltoid bunches more untidily than a real one.
- Labels are DOM elements. Each is shown only where its part is really seen: the page draws a small
  picture of which part is at each pixel, and the label's dot goes to the nearest place its part shows.

Code: `model.js` the bones, pose, gap and muscles; `view.js` the WebGL2 drawing (a cut plane with its faces
filled in using the stencil buffer); `facts.js` every statement and its source; `main.js` the camera,
labels, panel and controls; `geom.js`, `solid.js`, `gl.js` helpers. `css/shoulder.css` is the stylesheet.
`tests/shoulder/`: `build-data.mjs` and `build-pose.mjs` make the data; `review.mjs` checks the muscles
against the scans; `model.mjs` checks the model at hundreds of random arm positions (bones apart, no new
points inside bone, no folds, and which muscles lengthen and shorten as the textbooks say); `page.mjs`
presses every control and sweeps every slider looking for jumps. After changing any file under
`js/shoulder/`, `css/shoulder.css` or `shoulder/data/`, run `node tests/shoulder/stamp.mjs`.

## Overshoot saccades

A page at `saccade/`: two eyes in 3D follow a target on a screen, to show what a clinic note of
"overshoot saccade due to poor pursuits" means. Pursuit is the smooth movement that follows a moving
object. A saccade is a quick jump. An overshoot saccade starts behind a moving target and lands ahead of
it (the definition used in Sanz, Aivar and Tejedor, IOVS 2026). Overshoot can also mean hypermetria:
jumps to a still target that go too far. A tap on the screen makes the target jump, to show that.

Studies have not shown that poor pursuit by itself makes saccades go too far. With saccades sized as
measured, the model's saccades land on the target or a little short of it, even with poor pursuit. So the
page has two separate settings: healthy or poor pursuit, and accurate or overshoot saccades. Poor pursuit
needs many more saccades, so when saccades go too far, many more land ahead of the target. The page says
this in "What the clinic's note may mean". It opens on poor pursuit with overshoot saccades.

- **One world, three stops**: Screen (the eyes and the screen 60 cm away, with a line of sight from each
  eye), Eyes (seen from in front) and Muscles (the right eye's six muscles from above). The eyes,
  muscles and screen are to scale; muscle widths and thicknesses are the page's estimates. The skull,
  eyelids and fat are left out. Between Screen and Eyes the camera swings around the side and stands
  back, so that both stay in view. Time stands still while the view zooms.
- **The screen** shows a grid (1° and 5°), the target in gold, orange ticks where overshoot saccades
  landed in the last second, and in light blue a ring and a 0.4 s trail where the eyes look, as an eye
  tracker would. A box in the corner shows what the right eye sees, 5° across, with a ring for the central
  2°. The page says that during a saccade the brain turns vision down.
- **Controls**: healthy or poor pursuit, accurate or overshoot saccades, Play, the speed of time (1/100 of
  real speed to real speed), "Stop at the next saccade", the target's top speed (5 to 40°/s), whether the
  target swings by itself, and a tap or drag on the screen in the picture to move the target there.
- **The model** (`js/saccade/model.js`, stepped 1 ms at a time, the same every run):
  - Pursuit: eye speed moves toward gain × target speed, with the gain 0.95 (healthy) or 0.5 (poor, an
    example value) at every speed, and a 100 ms latency. A target that swings regularly is predictable
    (Barnes 2008), so after one full swing (the page's choice) the latency is no longer applied.
  - A saccade starts when the eyes, at present speeds, would reach the target in under 40 ms, over
    180 ms, or never (de Brouwer et al. 2002), and not within 0.5° of it (the page's choice). It begins
    125 ms later (200 ms for a still target).
  - Size, as measured by de Brouwer et al. (2002): 0.9 × the position error plus 0.109 s × the retinal
    slip, with slip above 15°/s counting at 0.09 s, both as seen 90 ms before the saccade. The
    "overshoot" setting makes each saccade 4/3 of that size. The 4/3 is the page's example, and the page
    says so. The page counts every saccade; studies count only those of 1° or more, and the page says so.
  - Duration 23 ms + 2.7 ms per degree (Collewijn et al. 1988), with a smooth minimum-jerk speed
    profile, so a 10° saccade takes 50 ms and peaks at 375°/s.
  - Each saccade is sorted as catch-up, overshoot, anticipatory or back-up (Sanz et al.), with "on the
    target" meaning within the drawn target's radius, 0.4°. A saccade to a still target is past, short
    or on it.
  - The eyes obey Listing's law and both aim at the same point on the screen. Muscle paths run straight
    from their origins to the eye and around it (no pulleys; the page says so). Rectus insertions follow
    Apt and Call (1982). Nerve signals are 100 + 4 × position + 0.95 × speed spikes/s along each
    muscle's pull (Robinson 1970, monkeys), never below zero, so the opposing muscle falls silent
    during a saccade. Muscles are drawn brighter red with a higher signal.
- **Panel**: a trace of how far the eyes are ahead of the target or behind it over the last 2 s (orange
  dots where overshoot saccades landed), where the last saccade landed, the measured gain, how many of the
  last 5 s's saccades overshot, and the last saccade's size, duration and top speed. "Each muscle" lists
  all six with their nerve signals; pointing at one lights it in gold.
- **Tests**: `node tests/saccade/model.mjs` (no browser) checks the main sequence, gains, how often each
  kind of saccade happens with each setting, the definitions, a jump to a still target, each muscle's pull and length
  change, Listing's law, Hering's law and the nerve burst and pause. `node tests/saccade/page.mjs`
  (`--quick` for the desktop only) presses every control at a desktop and a phone size. After changing
  any file under `js/saccade/` or `css/saccade.css`, run `node tests/saccade/stamp.mjs`.
  `node tests/saccade/shots.mjs <dir>` writes screenshots for a reviewer.

## Gear fidget

A page at `gears/` that answers one question: can gears cover the faces of a regular octahedron, meshing and
turning together like the brass fidget cube with gears on four of its six faces? Yes. The page shows the cube with
four gears and the octahedron with eight, in 3D, built from the same kinds of parts as the toy. Drag a gear and
the rest turn with it. A Take apart slider spreads the parts out along each gear's axis.

- **The answer** (in this README only; the page shows just the picture and its controls, at Gabe's asking): gears that touch spin opposite ways, so a loop of meshing gears turns only if its
  count is even. Four faces meet at each corner of an octahedron, three at each corner of a cube. So an
  octahedron carries eight gears, and a cube only a ring of four. The page no longer shows the cube with six
  gears (Gabe's choice); `tests/gears/model.mjs` still checks that it jams.
- **The gears** (`js/gears/model.js`): bevel gears with their axes from the solid's center through the middle of
  each face. Neighbors' axes meet at 90° on the cube and 70.53° on the octahedron (180° less the 109.47° angle
  between two faces). Their pitch cones touch along the line through the middle of the shared edge, so each cone's
  half-angle is half that: 45° and 35.26°. All gears are the same size, so all turn at the same speed.
- **The teeth** are cut as bevel-gear machines cut them: the blank is rolled against a flat crown gear with straight
  20° tooth sides, computed when the page loads. Two gears cut by the same crown gear mesh at any angle between
  their axes. Each tooth is thinned by 5% of the tooth spacing. The cube's gears have 14 teeth and the
  octahedron's 13. Each gear is turned so that a tooth faces a gap at each of its contacts. Around every corner
  these turns agree for any tooth count; the test tries counts from 9 to 23. With 14 teeth (any count of 2 more
  than a multiple of 4, with the ring set as here) all six gears on a cube would also sit together at rest.
- **The parts** (`parts()` in model.js, drawn by `js/gears/scene.js`), as in the toy: a brass core, and on each face
  a washer, a gear with a ball bearing pressed into it, and a flanged screw through the bearing into the core. The
  teeth's inner ends reach below the gear's flat back, so the core's faces sit lower and the washer is thick; the
  core's edges are cut back. The test checks that the core touches no gear. The toy's own gears are flat; these are
  bevel gears so that they also mesh at 70.5°. The bearings' balls go round at 0.62 of the gear's speed, as balls
  do with the outer ring turning and the inner ring held. Taking the parts apart is a slider the visitor moves; it
  never plays by itself, and the gears cannot be turned while the parts are apart.
- **Controls**: the shape, Play (off with reduced motion), a Spin slider, Take apart, and a tick box that colors
  the gears by the way they spin (gold and blue). Dragging off the gears, or the arrow keys on the picture, turns
  the view; a double click puts it back. A controller's right stick turns the view, the triggers turn the gears,
  and the bumpers change the shape.
- **Tests**: `node tests/gears/model.mjs` (no browser) checks which sets can turn against an independent search for
  a loop with an odd count, turns every meshing pair through two tooth spacings and fails if a tooth enters
  another, checks that a gear held still lets its neighbor turn no more than the backlash, and checks the core and
  the gears that do not mesh. `node tests/gears/page.mjs` (`--quick` for the desktop only) presses every control at
  a desktop and a phone size, drags a gear, and sweeps Spin and Take apart. After changing any file under
  `js/gears/` or `css/gears.css`, run `node tests/gears/stamp.mjs`.
- **Making it** (`gears/make.html`, linked from the gears page as "How to make the parts"): for each toy and each
  part, a dimensioned drawing and the part being machined from brass, step by step.
  - Sizes (`js/gears/spec.js`, from `MM` and `blank()` in model.js): the gears are module 1 (cube, 14 teeth, Ø15.42
    over the teeth) and module 0.9 (octahedron, 13 teeth, Ø13.17), so both toys come out about 2 cm across. A 681X
    ball bearing (1.5 × 4 × 2 mm, bought) is pressed into each gear, flush with its outer face. A shoulder screw
    (M1.4 × 0.3) clamps a spacer (the washer, Ø2.2 × Ø1.6) to the core; the bearing turns on the screw's Ø1.5
    shoulder. The cube's core is 9.00 mm across; the octahedron's is 11.00 across faces, with 1.20 mm flats on its
    edges and corner flats 14.00 apart.
  - Drawings (`js/gears/drawing.js`, SVG built from numbers): third-angle views, hatched sections, a gear data
    table and a title block. Pinch, scroll or use + and − to zoom. These are the page's own engineering choices,
    not the real toy's drawings.
  - Machining (`js/gears/plan.js` for the steps, `js/gears/cut.js` to replay them, `js/gears/shop.js` and
    `js/gears/make.js` to draw them): gears are turned in a 3-jaw chuck, finished on an expanding mandrel, then
    their teeth are cut one gap at a time with an involute form cutter, the blank on a dividing head tilted to the
    root angle. The cube's core is milled in a vise; the octahedron's is squared in the vise, then held in a 5C
    square collet in an indexer tilted 35.26° for its eight faces. Spacers and screws are turned from rod in
    collets; the screw's thread is cut with a die and its slot with a slitting saw. Times are real machine
    times; the animation plays them faster (the page says the total). Spindle speeds suit HSS tools in
    free-cutting brass. A single-point form cutter on a tilted head is how a home shop makes a bevel gear; the
    tooth is then an approximation, which is why the drawing says to check the mesh in pairs.
  - Tests: `node tests/gears/make.mjs` (no browser) plays every plan and fails if the finished part differs from
    its drawing (diameters, lengths, faces, holes, every gap, the slot), a tool comes within 0.4 mm of the jaws,
    or a speed is out of range. `node tests/gears/makepage.mjs` (`--quick` for the desktop only) checks that no
    text on a drawing overlaps other text or leaves the frame, steps through every machining step, and fails on a
    control that moved or a blank picture.
